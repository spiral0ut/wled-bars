"""Per-device manager: turns Home Assistant state into LED frames."""
from __future__ import annotations

import asyncio
import copy
import logging
import math
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import engine
from .const import DEFAULT_SETTINGS, DOMAIN, SIGNAL_SETTINGS, SIGNAL_STATUS
from .wled import WledClient, WledError

_LOGGER = logging.getLogger(__name__)

BLACK = (0, 0, 0)
UNAVAILABLE = ("unavailable", "unknown", "none", "")
HEALTH_INTERVAL = 30.0
PREVIEW_TTL = 20.0


def parse_duration(text: Any) -> float | None:
    """'H:MM:SS' (timer attributes) or plain seconds -> seconds."""
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    parts = str(text).split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        return float(parts[0])
    except ValueError:
        return None


def parse_hhmm(text: Any) -> int | None:
    """'HH:MM' -> minutes since midnight."""
    try:
        hours, minutes = str(text).split(":")[:2]
        return (int(hours) % 24) * 60 + int(minutes) % 60
    except (ValueError, TypeError):
        return None


def in_window(now_min: float, start: int, end: int) -> float | None:
    """Progress 0..1 through a daily window (may cross midnight), else None."""
    if start == end:
        return None
    length = (end - start) % 1440
    elapsed = (now_min - start) % 1440
    if elapsed > length:
        return None
    return elapsed / length


EARTH_RADIUS_M = 6371008.8
UNIT_METRES = {"m": 1.0, "km": 1000.0, "mi": 1609.344, "ft": 0.3048, "yd": 0.9144}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points, in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def distance_fraction(remaining: float, total: float) -> float:
    """How far along a trip: 0 at `total` away, 1 on arrival."""
    if total <= 0:
        return 1.0 if remaining <= 0 else 0.0
    return engine.clamp(1.0 - remaining / total)


class BarRuntime:
    """Live state of one bar that is not part of its saved configuration."""

    def __init__(self, bar: dict) -> None:
        self.bar = bar
        self.shown: float | None = None
        self.last_t: float | None = None
        self.peak: float | None = None
        self.peak_at = 0.0
        self.was_full: bool | None = None
        self.complete_since: float | None = None
        self.timer: tuple[datetime, float] | None = None  # (started, seconds)
        self.manual_value: float | None = None
        self.auto_start: tuple[str, datetime] | None = None  # (end state, first seen)
        self.dist_start: float | None = None  # farthest distance seen on this trip (auto scale)
        self.dist_arrived = False
        self.easing = False
        self.total: float | None = None  # length in seconds of a running time-based source
        self.status: dict = {}


class BarsManager:
    def __init__(self, hass: HomeAssistant, entry) -> None:
        self.hass = hass
        self.entry = entry
        self.host: str = entry.data["host"]
        self.client = WledClient(async_get_clientsession(hass), self.host)
        self._store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.bars: list[dict] = []
        self.settings: dict = copy.deepcopy(DEFAULT_SETTINGS)
        self.runtimes: list[BarRuntime] = []
        self.led_count = 30
        self.segments: list[dict] = []
        self.name = entry.title
        self.online = False
        self._last_uptime: int | None = None
        self._last_health = 0.0
        self._sent: dict[int, tuple[int, int, int]] = {}
        self._active = False
        self._wake = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._stopping = False
        self._unsub_states: Callable | None = None
        self._listeners: set[Callable[[dict], None]] = set()
        self._preview: tuple[dict, float, float] | None = None  # (bar, frac, expires)
        self._identify: tuple[list[int], float] | None = None  # (leds, until)
        self._last_frame: dict[int, tuple[int, int, int]] = {}
        self._status_sig: tuple = ()

    # ---------- lifecycle ----------

    async def async_start(self) -> None:
        data = await self._store.async_load() or {}
        self._apply(data.get("bars", []), data.get("settings", {}))
        await self._health(force=True)
        self._task = self.entry.async_create_background_task(
            self.hass, self._run(), f"{DOMAIN}_{self.entry.entry_id}"
        )

    async def async_stop(self) -> None:
        self._stopping = True
        self._wake.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        await self._give_back()
        self.client.close()

    async def _give_back(self) -> None:
        """Hand any LEDs we painted back to WLED (best effort)."""
        if self._sent:
            try:
                await self.client.release(int(self.settings["segment"]))
            except WledError:
                pass
        self._sent = {}
        self._active = False

    # ---------- configuration ----------

    def _apply(self, bars: list, settings: dict) -> None:
        old = {rt.bar["id"]: rt for rt in self.runtimes}
        self.settings = engine._merge(DEFAULT_SETTINGS, settings)
        self.bars = []
        self.runtimes = []
        for raw in bars:
            if not isinstance(raw, dict):
                continue
            bar = engine.normalize_bar(raw)
            if not bar["id"]:
                bar["id"] = uuid.uuid4().hex[:8]
            self.bars.append(bar)
            rt = old.get(bar["id"]) or BarRuntime(bar)
            rt.bar = bar
            self.runtimes.append(rt)
        self._track_entities()
        self._wake.set()

    async def async_save(self, bars: list | None, settings: dict | None) -> None:
        old_transport = (self.settings["transport"], self.settings["segment"])
        self._apply(
            self.bars if bars is None else bars,
            self.settings if settings is None else settings,
        )
        if old_transport != (self.settings["transport"], self.settings["segment"]):
            seg = self.settings["segment"]
            self.settings["segment"] = old_transport[1]
            await self._give_back()
            self.settings["segment"] = seg
        await self._store.async_save({"bars": self.bars, "settings": self.settings})
        async_dispatcher_send(self.hass, f"{SIGNAL_SETTINGS}_{self.entry.entry_id}")

    async def async_remove_store(self) -> None:
        await self._store.async_remove()

    def _track_entities(self) -> None:
        if self._unsub_states:
            self._unsub_states()
            self._unsub_states = None
        ids: set[str] = set()
        for bar in self.bars:
            src = bar["source"]
            ids.update((src["entity"], src["end_entity"], src["start_entity"]))
            if src["type"] == "distance":
                ids.update((src["to_zone"], src["from_zone"]))
            ids.add(bar["visibility"]["entity"])
            ids.update(
                str(c.get("entity") or "")
                for c in bar["visibility"]["conditions"]
                if isinstance(c, dict)
            )
            ids.update(m["entity"] for m in bar["markers"])
            ids.update(r["entity"] for r in bar["rules"])
        ids.add(self.settings["night"]["entity"])
        ids.discard("")
        if ids:
            self._unsub_states = async_track_state_change_event(
                self.hass, list(ids), self._on_state
            )

    @callback
    def _on_state(self, _event) -> None:
        self._wake.set()

    def find_bar(self, key: str) -> BarRuntime | None:
        wanted = str(key).strip().lower()
        for rt in self.runtimes:
            if rt.bar["id"].lower() == wanted or rt.bar["name"].strip().lower() == wanted:
                return rt
        return None

    # ---------- things the UI and services can do ----------

    def start_timer(self, rt: BarRuntime, seconds: float) -> None:
        rt.timer = (dt_util.utcnow(), max(1.0, seconds))
        rt.manual_value = None
        rt.was_full = False
        self._wake.set()

    def stop_timer(self, rt: BarRuntime) -> None:
        rt.timer = None
        rt.manual_value = None
        self._wake.set()

    def set_value(self, rt: BarRuntime, value: float) -> None:
        rt.timer = None
        rt.manual_value = value
        self._wake.set()

    def set_preview(self, bar: dict | None, frac: float) -> None:
        if bar is None:
            self._preview = None
        else:
            self._preview = (engine.normalize_bar(bar), frac, time.monotonic() + PREVIEW_TTL)
        self._wake.set()

    def identify(self, leds: list[int]) -> None:
        self._identify = (leds, time.monotonic() + 3.0)
        self._wake.set()

    @callback
    def add_listener(self, listener: Callable[[dict], None]) -> Callable[[], None]:
        self._listeners.add(listener)
        listener(self._snapshot())

        @callback
        def remove() -> None:
            self._listeners.discard(listener)

        return remove

    def describe(self) -> dict:
        return {
            "entry_id": self.entry.entry_id,
            "name": self.name,
            "host": self.host,
            "led_count": self.led_count,
            "segments": self.segments,
            "online": self.online,
        }

    def _snapshot(self) -> dict:
        frame = self._last_frame
        leds = "".join(
            "%02x%02x%02x" % frame[i] if i in frame else "000000"
            for i in range(self.led_count)
        )
        return {
            "leds": leds,
            "online": self.online,
            "bars": [rt.status for rt in self.runtimes],
        }

    # ---------- device health ----------

    async def _health(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last_health < HEALTH_INTERVAL:
            return
        self._last_health = now
        try:
            info = await self.client.info()
        except WledError as err:
            if self.online:
                _LOGGER.warning("WLED at %s is unreachable: %s", self.host, err)
            self.online = False
            return
        uptime = int(info.get("uptime", 0) or 0)
        rebooted = self._last_uptime is not None and uptime < self._last_uptime
        self._last_uptime = uptime
        self.led_count = int((info.get("leds") or {}).get("count", self.led_count) or self.led_count)
        self.name = info.get("name") or self.name
        if not self.online or rebooted or not self.segments:
            try:
                state = await self.client.state()
                self.segments = [
                    {
                        "id": seg.get("id", n),
                        "start": seg.get("start", 0),
                        "stop": seg.get("stop", 0),
                        "name": seg.get("n", ""),
                    }
                    for n, seg in enumerate(state.get("seg", []))
                    if isinstance(seg, dict) and seg.get("stop", 0)
                ]
            except WledError:
                pass
        if not self.online:
            _LOGGER.info("WLED at %s is reachable", self.host)
        self.online = True
        # Someone may have changed preset/effect (which unfreezes the segment),
        # or the device rebooted: repaint everything on the next frame.
        self._sent = {k: (-1, -1, -1) for k in self._sent}

    # ---------- evaluation ----------

    def _state(self, entity_id: str) -> str | None:
        st = self.hass.states.get(entity_id) if entity_id else None
        return st.state if st else None

    def _number(self, entity_id: str, attribute: str = "") -> float | None:
        st = self.hass.states.get(entity_id) if entity_id else None
        if st is None:
            return None
        raw = st.attributes.get(attribute) if attribute else st.state
        return engine.num(raw, None)

    def _time(self, entity_id: str) -> datetime | None:
        st = self.hass.states.get(entity_id) if entity_id else None
        if st is None or st.state.lower() in UNAVAILABLE:
            return None
        parsed = dt_util.parse_datetime(st.state)
        if parsed is None:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt_util.DEFAULT_TIME_ZONE)
        return dt_util.as_utc(parsed)

    def _place(self, entity_id: str) -> tuple[float, float, float] | None:
        """(latitude, longitude, radius in metres) of a zone, person or tracker."""
        st = self.hass.states.get(entity_id) if entity_id else None
        if st is None:
            return None
        lat = engine.num(st.attributes.get("latitude"), None)
        lon = engine.num(st.attributes.get("longitude"), None)
        if lat is None or lon is None:
            return None
        return (lat, lon, max(0.0, engine.num(st.attributes.get("radius"), 0.0)))

    def _distance(self, rt: BarRuntime) -> tuple[str, float, float | None]:
        """Progress towards a place. Fills as the tracked thing gets closer.

        The tracked entity is either something with a position (person,
        device tracker) or a sensor that already reports a distance. The full
        length of the trip is the distance between two zones, a set distance,
        or the farthest point seen since the bar appeared ("auto").
        """
        src = rt.bar["source"]
        if not src["entity"]:
            return ("idle", 0.0, None)
        st = self.hass.states.get(src["entity"])
        if st is None or st.state.lower() in UNAVAILABLE:
            return ("unavailable", 0.0, None)
        dest = self._place(src["to_zone"] or "zone.home")

        reading = engine.num(st.state, None)
        if reading is not None:
            # a distance sensor: metres if its unit is known, otherwise its own units
            scale = UNIT_METRES.get(str(st.attributes.get("unit_of_measurement") or "").strip().lower())
            remaining = max(0.0, reading) * (scale or 1.0)
        else:
            here = self._place(src["entity"])
            if here is None or dest is None:
                return ("unavailable", 0.0, None)
            scale = 1.0
            remaining = max(0.0, haversine_m(here[0], here[1], dest[0], dest[1]) - dest[2])

        # the unit the set distance is typed in, and the remaining distance is reported in
        unit = UNIT_METRES.get(str(src["dist_unit"]).strip().lower())
        if reading is None:
            factor = unit or UNIT_METRES["km"]
        else:
            factor = (unit if scale is not None else None) or scale or 1.0  # default: the sensor's own unit

        mode = src["dist_mode"]
        total = None
        if mode == "zones" and scale is not None:
            origin = self._place(src["from_zone"])
            if origin is not None and dest is not None:
                total = max(0.0, haversine_m(origin[0], origin[1], dest[0], dest[1]) - dest[2])
        elif mode == "fixed":
            total = max(0.0, engine.num(src["dist_total"], 0.0)) * factor
        if total is None:
            # auto: the trip is as long as the farthest point seen since the bar appeared
            if remaining <= 0:
                rt.dist_arrived = True
            elif rt.dist_arrived:
                rt.dist_arrived = False
                rt.dist_start = None  # a new trip after arriving
            rt.dist_start = max(rt.dist_start or 0.0, remaining)
            total = rt.dist_start

        return ("active", distance_fraction(remaining, total), round(remaining / factor, 2))

    def _source(self, rt: BarRuntime, utc: datetime) -> tuple[str, float, float | None]:
        """Return (state, raw fraction, raw value); state is active|idle|unavailable."""
        bar = rt.bar
        src = bar["source"]
        kind = src["type"]
        rt.total = None

        if kind == "entity":
            if not src["entity"]:
                return ("idle", 0.0, None)
            value = self._number(src["entity"], src["attribute"])
            if value is None:
                return ("unavailable", 0.0, None)
            return ("active", engine.value_to_frac(bar, value), value)

        if kind == "timer":
            st = self.hass.states.get(src["entity"]) if src["entity"] else None
            if st is None or st.state.lower() in UNAVAILABLE:
                return ("unavailable" if src["entity"] else "idle", 0.0, None)
            duration = parse_duration(st.attributes.get("duration"))
            if st.state == "active" and duration:
                finishes = dt_util.parse_datetime(str(st.attributes.get("finishes_at", "")))
                if finishes is None:
                    return ("idle", 0.0, None)
                remaining = (dt_util.as_utc(finishes) - utc).total_seconds()
            elif st.state == "paused" and duration:
                remaining = parse_duration(st.attributes.get("remaining")) or 0.0
            else:
                return ("idle", 0.0, None)
            remaining = max(0.0, min(duration, remaining))
            if st.state == "active":
                rt.total = duration
            return ("active", 1.0 - remaining / duration, remaining)

        if kind == "timestamp":
            end = self._time(src["end_entity"])
            if end is None:
                return ("idle", 0.0, None)
            start = self._time(src["start_entity"])
            if start is None:
                duration = engine.num(src["duration"], 0.0)
                if duration > 0:
                    start = end - timedelta(seconds=duration)
                else:
                    # No start known: count from the moment this end time appeared.
                    key = end.isoformat()
                    if rt.auto_start is None or rt.auto_start[0] != key:
                        rt.auto_start = (key, utc)
                    start = rt.auto_start[1]
            total = (end - start).total_seconds()
            if total <= 0:
                return ("idle", 0.0, None)
            elapsed = (utc - start).total_seconds()
            if elapsed < 0:
                return ("idle", 0.0, None)
            hold = self._celebration_seconds(bar)
            if elapsed > total + hold:
                return ("idle", 0.0, None)
            remaining = max(0.0, total - elapsed)
            rt.total = total
            return ("active", min(1.0, elapsed / total), remaining)

        if kind == "distance":
            return self._distance(rt)

        if kind == "window":
            start_m = parse_hhmm(src["window_start"])
            end_m = parse_hhmm(src["window_end"])
            if start_m is None or end_m is None:
                return ("idle", 0.0, None)
            local = dt_util.as_local(utc)
            now_min = local.hour * 60 + local.minute + local.second / 60.0
            frac = in_window(now_min, start_m, end_m)
            if frac is None:
                return ("idle", 0.0, None)
            rt.total = ((end_m - start_m) % 1440) * 60.0
            return ("active", frac, None)

        # manual: driven by services
        if rt.timer is not None:
            started, seconds = rt.timer
            elapsed = (utc - started).total_seconds()
            if elapsed > seconds + self._celebration_seconds(bar):
                rt.timer = None
                return ("idle", 0.0, None)
            rt.total = seconds
            return ("active", min(1.0, elapsed / seconds), max(0.0, seconds - elapsed))
        if rt.manual_value is not None:
            return ("active", engine.value_to_frac(bar, rt.manual_value), rt.manual_value)
        return ("idle", 0.0, None)

    @staticmethod
    def _celebration_seconds(bar: dict) -> float:
        oc = bar["on_complete"]
        return engine.num(oc["duration"], 0.0) if oc["effect"] != "none" else 0.0

    def _evaluate(self, rt: BarRuntime, now: float, utc: datetime, bright: float) -> dict | None:
        """Work out what this bar should show. Returns a render ctx, or None if hidden."""
        bar = rt.bar
        state, raw, value = self._source(rt, utc)
        frac = 1.0 - raw if (state == "active" and bar["source"]["invert"]) else raw
        rt.status = {
            "id": bar["id"],
            "state": state,
            "percent": round(frac * 100.0, 1),
            "value": value,
            "visible": False,
        }

        def hidden(why: str) -> None:
            # "why" lets the editor explain a hidden bar in plain words
            rt.status["why"] = why
            rt.shown = None
            rt.easing = False
            return None

        if not self.settings["enabled"] or not bar["enabled"]:
            rt.dist_start = None  # an "auto" trip starts over when the bar next appears
            return hidden("disabled")

        vis = bar["visibility"]
        if vis["entity"]:
            current = self._state(vis["entity"])
            allowed = [s.strip().lower() for s in str(vis["states"]).split(",") if s.strip()] or ["on"]
            if current is None or current.lower() not in allowed:
                return hidden("conditions")
        if not self._conditions_ok(vis, utc):
            rt.dist_start = None
            return hidden("conditions")

        if state == "unavailable":
            rt.was_full = None
            if bar["unavailable"]["mode"] == "hide":
                return hidden("unavailable")
            rt.status["visible"] = True
            rt.shown = None
            rt.easing = True
            return {"t": now, "unavailable": True, "brightness": bright}

        if state == "idle" and vis["hide_when_idle"]:
            rt.was_full = None
            return hidden("idle")
        if vis["hide_at_zero"] and frac <= 0.0:
            rt.was_full = False
            return hidden("zero")

        # completion: only celebrate when we actually watched it reach 100 %
        full = state == "active" and raw >= 1.0 - 1e-6
        if full and rt.was_full is False:
            rt.complete_since = now
        if not full:
            rt.complete_since = None
        rt.was_full = full
        age = now - rt.complete_since if rt.complete_since is not None else None
        celebrating = age is not None and age < self._celebration_seconds(bar)
        if full and bar["on_complete"]["then"] == "hide" and not celebrating:
            return hidden("finished")

        # smoothing
        dt = 0.0 if rt.last_t is None else min(1.0, max(0.0, now - rt.last_t))
        rt.last_t = now
        tau = engine.num(bar["smoothing"], 0.0) / 3.0
        if rt.shown is None or tau <= 0:
            rt.shown = frac
        else:
            rt.shown += (frac - rt.shown) * (1.0 - math.exp(-dt / tau))
            if abs(frac - rt.shown) < 0.0005:
                rt.shown = frac
        rt.easing = rt.shown != frac or celebrating

        # peak hold
        peak = None
        if bar["peak"]["enabled"]:
            if rt.peak is None or rt.shown >= rt.peak:
                rt.peak = rt.shown
                rt.peak_at = now
            elif now - rt.peak_at > engine.num(bar["peak"]["hold"], 5.0):
                rt.peak = max(rt.shown, rt.peak - dt * 0.4)
                rt.easing = rt.easing or rt.peak > rt.shown
            peak = rt.peak

        markers = []
        for marker in bar["markers"]:
            if marker["type"] == "entity":
                mv = self._number(marker["entity"])
            else:
                mv = engine.num(marker["value"], None)
            if mv is None:
                markers.append(None)
                continue
            mf = engine.value_to_frac(bar, mv)
            markers.append(1.0 - mf if bar["source"]["invert"] else mf)

        rt.status["visible"] = True
        return {
            "t": now,
            "frac": rt.shown,
            "brightness": bright,
            "rule": engine.pick_rule(bar, value, frac * 100.0, self._state),
            "markers": markers,
            "peak": peak,
            "complete_age": age,
        }

    def _conditions_ok(self, vis: dict, utc: datetime) -> bool:
        """Evaluate the bar's "show only when" conditions (all or any of them)."""
        conds = [c for c in (vis.get("conditions") or []) if isinstance(c, dict)]
        if not conds:
            return True
        local = dt_util.as_local(utc)
        results = (self._condition(c, local) for c in conds)
        return any(results) if vis.get("match") == "any" else all(results)

    def _condition(self, cond: dict, local: datetime) -> bool:
        kind = cond.get("type")
        if kind == "time":
            start = parse_hhmm(cond.get("start"))
            end = parse_hhmm(cond.get("end"))
            now_min = local.hour * 60 + local.minute + local.second / 60.0
            weekday = local.weekday()  # Monday = 0
            inside = True
            if start is not None and end is not None and start != end:
                inside = in_window(now_min, start, end) is not None
                if start > end and now_min < end:
                    weekday = (weekday - 1) % 7  # after midnight: belongs to yesterday's window
            days = cond.get("days")
            if isinstance(days, list) and days and weekday not in days:
                return False
            return inside
        entity = str(cond.get("entity") or "")
        if not entity:
            return True  # half-filled condition: don't hide the bar because of it
        if kind == "state":
            current = self._state(entity)
            allowed = [s.strip().lower() for s in str(cond.get("states") or "").split(",") if s.strip()] or ["on"]
            result = current is not None and current.lower() in allowed
            return not result if cond.get("negate") else result
        if kind == "numeric":
            current = self._number(entity)
            if current is None:
                return False
            return engine.compare(current, str(cond.get("op") or ">="), cond.get("value"))
        return True

    def _brightness(self, utc: datetime) -> float:
        level = engine.clamp(engine.num(self.settings["brightness"], 100.0) / 100.0)
        night = self.settings["night"]
        dim = False
        if night["mode"] == "schedule":
            start_m = parse_hhmm(night["start"])
            end_m = parse_hhmm(night["end"])
            if start_m is not None and end_m is not None:
                local = dt_util.as_local(utc)
                dim = in_window(local.hour * 60 + local.minute, start_m, end_m) is not None
        elif night["mode"] == "entity" and night["entity"]:
            current = self._state(night["entity"])
            dim = current is not None and current.lower() in ("on", "home", "below_horizon", "true")
        if dim:
            level *= engine.clamp(engine.num(night["level"], 20.0) / 100.0)
        return level

    # ---------- frame loop ----------

    async def _run(self) -> None:
        # The flag (not just cancellation) ends the loop: a cancel that races
        # with the wake event can be swallowed by wait_for on older Pythons.
        while not self._stopping:
            try:
                interval = await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - never let the loop die
                _LOGGER.exception("WLED Bars frame loop error")
                interval = 5.0
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass

    def _fps(self) -> float:
        fps = engine.num(self.settings["fps"], 0.0)
        if fps <= 0:
            fps = 25.0 if self.settings["transport"] == "ddp" else 5.0
        return engine.clamp(fps, 1.0, 60.0)

    async def _tick(self) -> float:
        """Render and push one frame; return seconds until the next one."""
        self._wake.clear()
        await self._health()
        now = time.monotonic()
        utc = dt_util.utcnow()
        bright = self._brightness(utc)

        frame: dict[int, tuple[int, int, int]] = {}
        animated = False
        step = 1.0  # seconds between frames for bars that only creep with time

        preview = self._preview
        if preview and now > preview[2]:
            preview = self._preview = None

        def paint(bar: dict, ctx: dict) -> None:
            pixels = engine.render_bar(bar, ctx)
            for idx, px in zip(engine.bar_leds(bar), pixels):
                if 0 <= idx < self.led_count:
                    frame[idx] = px

        for rt in self.runtimes:
            ctx = self._evaluate(rt, now, utc, bright)
            if preview and preview[0]["id"] == rt.bar["id"]:
                continue  # the draft being edited replaces the saved bar
            if ctx is None:
                continue
            paint(rt.bar, ctx)
            if rt.easing or engine.is_animated(rt.bar):
                animated = True
            if rt.total:
                # a short timer on a long bar needs more than one frame a second
                step = min(step, rt.total / (engine.bar_length(rt.bar) * 4.0))

        if preview:
            pbar, pfrac, _ = preview
            value = engine.frac_to_value(pbar, 1.0 - pfrac if pbar["source"]["invert"] else pfrac)
            markers = []
            for marker in pbar["markers"]:
                mv = self._number(marker["entity"]) if marker["type"] == "entity" else engine.num(marker["value"], None)
                mf = None if mv is None else engine.value_to_frac(pbar, mv)
                markers.append(1.0 - mf if mf is not None and pbar["source"]["invert"] else mf)
            paint(
                pbar,
                {
                    "t": now,
                    "frac": pfrac,
                    "brightness": bright,
                    "rule": engine.pick_rule(pbar, value, pfrac * 100.0, self._state),
                    "markers": markers,
                },
            )
            animated = True

        if self._identify:
            leds, until = self._identify
            if now > until:
                self._identify = None
            else:
                on = int(now * 4) % 2 == 0
                for idx in leds:
                    if 0 <= idx < self.led_count:
                        frame[idx] = (255, 255, 255) if on else BLACK
                animated = True

        self._last_frame = frame
        # tell the per-bar entities when something they show has changed
        signature = tuple(
            (rt.bar["id"], rt.status.get("state"), round(rt.status.get("percent") or 0.0), rt.status.get("visible"))
            for rt in self.runtimes
        )
        if signature != self._status_sig:
            self._status_sig = signature
            async_dispatcher_send(self.hass, f"{SIGNAL_STATUS}_{self.entry.entry_id}")
        try:
            await self._push(frame)
            if not self.online:
                self._last_health = 0.0  # refresh info soon
        except WledError as err:
            if self.online:
                _LOGGER.warning("Could not update WLED at %s: %s", self.host, err)
            self.online = False
            self._sent = {k: (-1, -1, -1) for k in self._sent}
            self._notify()
            return 10.0

        self._notify()
        if animated:
            return 1.0 / self._fps()
        if frame:
            # time-based bars creep forward; DDP also needs a keep-alive
            return max(step, 1.0 / self._fps())
        return HEALTH_INTERVAL

    def _notify(self) -> None:
        if not self._listeners:
            return
        snapshot = self._snapshot()
        for listener in list(self._listeners):
            listener(snapshot)

    async def _push(self, frame: dict[int, tuple[int, int, int]]) -> None:
        power_on = bool(frame) and not self._active and bool(self.settings["auto_power"])

        if self.settings["transport"] == "ddp":
            if frame:
                if power_on:
                    await self.client.post_state({"on": True})
                buf = bytearray(self.led_count * 3)
                for idx, (r, g, b) in frame.items():
                    buf[idx * 3 : idx * 3 + 3] = bytes((r, g, b))
                self.client.send_ddp(bytes(buf))
            # When nothing is shown we simply stop sending: WLED leaves realtime
            # mode by itself after ~2.5 s and resumes its own effect.
            self._active = bool(frame)
            return

        segment = int(self.settings["segment"])
        if not frame:
            if self._sent:
                if self.settings["idle"] == "release":
                    await self.client.release(segment)
                else:
                    await self.client.set_pixels(segment, {i: BLACK for i in self._sent}, False)
                self._sent = {}
            self._active = False
            return

        target = dict(frame)
        for idx in self._sent:
            target.setdefault(idx, BLACK)  # LEDs of a bar that just hid
        changes = {i: c for i, c in target.items() if self._sent.get(i) != c}
        if changes or power_on:
            await self.client.set_pixels(segment, changes, power_on)
            self._sent = target
        self._active = True
