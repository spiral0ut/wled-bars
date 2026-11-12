"""End-to-end test of the manager against a fake WLED device.

Home Assistant itself is stubbed (only the handful of helpers the manager
uses), so this checks the frame loop, JSON diffing, release and DDP output,
not the HA wiring. Needs aiohttp:  python tests/test_manager.py
"""
from __future__ import annotations

import asyncio
import importlib
import pathlib
import socket
import sys
import types
from datetime import datetime, timedelta, timezone

from aiohttp import ClientSession, web

ROOT = pathlib.Path(__file__).resolve().parent.parent
PKG = ROOT / "custom_components" / "wled_bars"

# ---- stub the bits of Home Assistant the manager imports ----
SESSION = {}


def _mod(name, **attrs):
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod
    return mod


class Store:
    data = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return Store.data.get(self.key)

    async def async_save(self, data):
        Store.data[self.key] = data

    def async_delay_save(self, data_func, delay=0):
        Store.data[self.key] = data_func()

    async def async_remove(self):
        Store.data.pop(self.key, None)


def _parse(text):
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


_mod("homeassistant")
_mod("homeassistant.core", HomeAssistant=object, callback=lambda f: f)
_mod("homeassistant.helpers")
_mod("homeassistant.helpers.aiohttp_client", async_get_clientsession=lambda hass: SESSION["s"])
SIGNALS = {}  # signal -> [callbacks]
SENT = []


def _send(hass, signal, *args):
    SENT.append(signal)
    for cb in list(SIGNALS.get(signal, [])):
        cb(*args)


def _connect(hass, signal, cb):
    SIGNALS.setdefault(signal, []).append(cb)
    return lambda: SIGNALS[signal].remove(cb)


class _Entity:
    hass = None
    entity_id = None

    def async_write_ha_state(self):
        self.written = getattr(self, "written", 0) + 1

    def async_on_remove(self, _cb):
        pass


class _Registry:
    def async_get(self, _entity_id):
        return None


_mod("homeassistant.helpers.dispatcher", async_dispatcher_send=_send, async_dispatcher_connect=_connect)
_mod("homeassistant.helpers.entity", Entity=_Entity)
_mod("homeassistant.helpers.entity_registry", async_get=lambda hass: _Registry())
_mod("homeassistant.helpers.device_registry", DeviceInfo=dict)
_mod("homeassistant.const", PERCENTAGE="%")
_mod("homeassistant.components")
_mod("homeassistant.components.switch", SwitchEntity=type("SwitchEntity", (), {}))
_mod("homeassistant.components.number", NumberEntity=type("NumberEntity", (), {}), NumberMode=types.SimpleNamespace(SLIDER="slider"))
_mod("homeassistant.components.sensor", SensorEntity=type("SensorEntity", (), {}), SensorStateClass=types.SimpleNamespace(MEASUREMENT="measurement"))
_mod("homeassistant.helpers.event", async_track_state_change_event=lambda hass, ids, cb: hass.track(ids, cb))
_mod("homeassistant.helpers.storage", Store=Store)
_mod("homeassistant.util")
_mod(
    "homeassistant.util.dt",
    utcnow=lambda: datetime.now(timezone.utc),
    parse_datetime=_parse,
    as_utc=lambda d: d.astimezone(timezone.utc),
    as_local=lambda d: d.astimezone(),
    DEFAULT_TIME_ZONE=timezone.utc,
)
pkg = types.ModuleType("wb")
pkg.__path__ = [str(PKG)]
sys.modules["wb"] = pkg
manager_mod = importlib.import_module("wb.manager")
engine = importlib.import_module("wb.engine")
wled = importlib.import_module("wb.wled")
manager_mod.REPAINT_INTERVAL = 999.0  # switched on only for its own test


class State:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class Hass:
    def __init__(self):
        self._states = {}
        self._cbs = []
        self.states = self

    def get(self, entity_id):
        return self._states.get(entity_id)

    def set(self, entity_id, state, attributes=None):
        self._states[entity_id] = State(str(state), attributes)
        for ids, cb in self._cbs:
            if entity_id in ids:
                cb(None)

    def track(self, ids, cb):
        item = (ids, cb)
        self._cbs.append(item)
        return lambda: self._cbs.remove(item)


class Entry:
    entry_id = "e1"
    title = "Fake"

    def __init__(self, host):
        self.data = {"host": host}

    def async_create_background_task(self, hass, coro, name):
        return asyncio.ensure_future(coro)


class FakeWled:
    """Applies /json/state posts the way WLED's deserializeSegment does."""

    def __init__(self, count=40):
        self.leds = [None] * count  # None = untouched (WLED's own effect)
        self.posts = []
        self.on = False
        self.frozen = False

    async def info(self, request):
        return web.json_response({"name": "Fake", "mac": "aabb", "uptime": 100, "leds": {"count": len(self.leds)}})

    async def state(self, request):
        return web.json_response({"on": self.on, "seg": [{"id": 0, "start": 0, "stop": len(self.leds)}]})

    async def post(self, request):
        body = await request.json()
        self.posts.append(body)
        if "on" in body:
            self.on = body["on"]
        for seg in body.get("seg", []):
            if seg.get("frz") is False:
                self.frozen = False
                self.leds = [None] * len(self.leds)
            arr = seg.get("i")
            if not arr:
                continue
            self.frozen = True
            start, stop, seen = 0, 0, 0
            for item in arr:
                if isinstance(item, int):
                    if seen == 0:
                        start, seen = item, 1
                    else:
                        stop, seen = item, 2
                else:
                    if seen < 2 or stop <= start:
                        stop = start + 1
                    rgb = tuple(int(item[k : k + 2], 16) for k in (0, 2, 4))
                    for idx in range(start, stop):
                        self.leds[idx] = rgb
                    if seen == 0:
                        start += 1
                    seen = 0
        return web.json_response({"success": True})


async def settle(mgr, fake, seconds=0.5):
    await asyncio.sleep(seconds)


async def main():
    fake = FakeWled()
    app = web.Application()
    app.add_routes([web.get("/json/info", fake.info), web.get("/json/state", fake.state), web.post("/json/state", fake.post)])
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    SESSION["s"] = ClientSession()

    hass = Hass()
    hass.set("sensor.progress", 50)
    bar = {
        "id": "p", "name": "Progress", "start": 10, "end": 19, "smoothing": 0,
        "source": {"type": "entity", "entity": "sensor.progress"},
        "color": {"mode": "solid", "stops": [{"pos": 0, "color": "#ff0000"}]},
        "track": {"mode": "off"}, "tip": {"enabled": False},
    }
    Store.data["wled_bars.e1"] = {"bars": [bar], "settings": {}}
    mgr = manager_mod.BarsManager(hass, Entry(f"127.0.0.1:{port}"))
    await mgr.async_start()
    await settle(mgr, fake)

    assert mgr.online and mgr.led_count == 40, (mgr.online, mgr.led_count)
    assert fake.on is True, "strip should be switched on when a bar appears"
    assert fake.leds[10:15] == [(255, 0, 0)] * 5 and fake.leds[15:20] == [(0, 0, 0)] * 5, fake.leds[8:22]
    assert fake.leds[9] is None and fake.leds[20] is None, "LEDs outside the bar must be untouched"
    first = fake.posts[0]["seg"][0]["i"]
    assert first == [10, 15, "FF0000", 15, 20, "000000"], first
    print("ok json paint + range compression:", first)

    # steady value -> nothing more is sent
    n = len(fake.posts)
    await settle(mgr, fake, 1.3)
    assert len(fake.posts) == n, "no posts expected while nothing changes"
    print("ok no traffic when idle")

    # value change -> only the changed LEDs are sent
    hass.set("sensor.progress", 70)
    await settle(mgr, fake)
    assert fake.posts[-1]["seg"][0]["i"] == [15, 17, "FF0000"], fake.posts[-1]
    print("ok diff only:", fake.posts[-1]["seg"][0]["i"])

    # live listener gets frames + status
    got = []
    remove = mgr.add_listener(got.append)
    assert got and len(got[0]["leds"]) == 40 * 6 and got[0]["leds"][60:66] == "ff0000"
    assert got[0]["bars"][0]["percent"] == 70.0 and got[0]["bars"][0]["visible"]
    remove()
    print("ok listener snapshot")

    # unavailable source hides the bar -> LEDs handed back to WLED
    hass.set("sensor.progress", "unavailable")
    await settle(mgr, fake)
    assert fake.posts[-1] == {"seg": [{"id": 0, "frz": False}]}, fake.posts[-1]
    assert fake.frozen is False
    print("ok release when hidden")

    # blinking tip -> animated frames at ~5 fps, tip toggles
    hass.set("sensor.progress", 50)
    tipbar = dict(bar, tip={"enabled": True, "count": 1, "color": "#ffffff", "effect": "blink", "period": 0.6, "off": "dark"})
    await mgr.async_save([tipbar], None)
    seen = set()
    for _ in range(12):
        await asyncio.sleep(0.1)
        seen.add(fake.leds[14])
    assert seen == {(255, 255, 255), (0, 0, 0)}, seen
    print("ok blinking tip on device:", seen)

    # manual timer via the service path + completion celebration then hide
    timed = dict(bar, id="t", name="Timer", source={"type": "manual"}, on_complete={"effect": "flash", "color": "#00ff00", "duration": 1, "then": "hide"})
    await mgr.async_save([timed], None)
    await settle(mgr, fake)
    assert fake.frozen is False, "manual bar is idle (hidden) until started"
    assert mgr.runtimes[0].status.get("why") == "idle", mgr.runtimes[0].status
    mgr.start_timer(mgr.find_bar("timer"), 1.0)
    await asyncio.sleep(0.6)
    lit = sum(1 for c in fake.leds[10:20] if c and c[0] > 0)
    assert 3 <= lit <= 8, (lit, fake.leds[10:20])
    colours = set()
    for _ in range(9):
        await asyncio.sleep(0.1)
        colours.update(c for c in fake.leds[10:20] if c)
    assert (0, 255, 0) in colours, colours
    await asyncio.sleep(1.5)
    assert fake.frozen is False, "bar should hide after the celebration"
    print("ok manual timer -> fill -> celebration -> hide")

    # timer entity + draining
    now = datetime.now(timezone.utc)
    hass.set("timer.t", "active", {"duration": "0:01:40", "finishes_at": (now + timedelta(seconds=75)).isoformat()})
    drain = dict(bar, id="d", name="Drain", source={"type": "timer", "entity": "timer.t", "invert": True})
    await mgr.async_save([drain], None)
    await settle(mgr, fake)
    status = mgr.runtimes[0].status
    assert 73 <= status["percent"] <= 76, status
    assert status["visible"] and "why" not in status, status
    # the status says why a bar is hidden, for the editor's status line
    await mgr.async_save([dict(drain, enabled=False)], None)
    await settle(mgr, fake)
    assert mgr.runtimes[0].status.get("why") == "disabled", mgr.runtimes[0].status
    await mgr.async_save([dict(drain, visibility={"conditions": [{"type": "state", "entity": "input_boolean.nope", "states": "on"}]})], None)
    await settle(mgr, fake)
    assert mgr.runtimes[0].status.get("why") == "conditions", mgr.runtimes[0].status
    print("ok hidden bars report why")

    # with the Bars switch off, the status says what each bar would do if it were on
    seen = []
    stop_listening = mgr.add_listener(seen.append)
    await mgr.async_save(None, dict(mgr.settings, enabled=False))
    await settle(mgr, fake)
    st = mgr.runtimes[0].status
    assert not st["visible"] and st.get("why") == "conditions" and "would" not in st, st
    await mgr.async_save([dict(drain, visibility={})], None)
    await settle(mgr, fake)
    st = mgr.runtimes[0].status
    assert not st["visible"] and st.get("would") is True and st.get("why") == "disabled", st
    assert seen[-1]["enabled"] is False and seen[-1]["rev"] > seen[0]["rev"] and seen[-1]["brightness"] == mgr.settings["brightness"], seen[-1]
    stop_listening()
    await mgr.async_save(None, dict(mgr.settings, enabled=True))
    await settle(mgr, fake)
    assert mgr.runtimes[0].status["visible"] and "would" not in mgr.runtimes[0].status
    print("ok switched-off strip reports what would show")
    print("ok timer entity countdown:", status["percent"], "% left")

    # DDP transport
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind(("127.0.0.1", wled.DDP_PORT))
    udp.settimeout(2)
    hass.set("sensor.progress", 50)
    await mgr.async_save([bar], dict(mgr.settings, transport="ddp"))
    await settle(mgr, fake, 0.3)
    packet = await asyncio.get_event_loop().run_in_executor(None, udp.recv, 4096)
    assert packet[0] == 0x41 and packet[2] == 0x0B and int.from_bytes(packet[8:10], "big") == 120, packet[:10]
    data = packet[10:]
    assert data[30:33] == b"\xff\x00\x00" and data[27:30] == b"\x00\x00\x00" and data[45:48] == b"\x00\x00\x00"
    udp.close()
    print("ok ddp packet:", packet[:10].hex())

    # preview override
    mgr.set_preview(dict(bar, start=0, end=4, id="__draft__"), 1.0)
    await settle(mgr, fake, 0.3)
    assert mgr._last_frame.get(0) == (255, 0, 0) and mgr._last_frame.get(4) == (255, 0, 0)
    mgr.set_preview(None, 0)
    print("ok preview on strip")

    # "show only when" conditions
    from datetime import datetime as _dt

    mon_0830 = _dt(2026, 11, 9, 8, 30)  # a Monday
    sun_0030 = _dt(2026, 11, 15, 0, 30)  # a Sunday, just after midnight
    cond = mgr._condition
    assert cond({"type": "time", "start": "07:00", "end": "09:00"}, mon_0830)
    assert not cond({"type": "time", "start": "09:00", "end": "17:00"}, mon_0830)
    assert cond({"type": "time", "start": "22:00", "end": "07:00"}, sun_0030), "overnight window"
    assert cond({"type": "time", "start": "07:00", "end": "09:00", "days": [0, 1, 2, 3, 4]}, mon_0830)
    assert not cond({"type": "time", "start": "07:00", "end": "09:00", "days": [5, 6]}, mon_0830)
    # 00:30 on Sunday belongs to Saturday night's window
    assert cond({"type": "time", "start": "22:00", "end": "07:00", "days": [5]}, sun_0030)
    assert not cond({"type": "time", "start": "22:00", "end": "07:00", "days": [6]}, sun_0030)
    assert cond({"type": "time", "start": "00:00", "end": "00:00", "days": [0]}, mon_0830), "all day"
    hass.set("input_boolean.guests", "on")
    hass.set("sensor.outdoor", 41)
    assert cond({"type": "state", "entity": "input_boolean.guests", "states": ""}, mon_0830)
    assert not cond({"type": "state", "entity": "input_boolean.guests", "states": "on", "negate": True}, mon_0830)
    assert cond({"type": "numeric", "entity": "sensor.outdoor", "op": "<", "value": "50"}, mon_0830)
    assert not cond({"type": "numeric", "entity": "sensor.missing", "op": "<", "value": "50"}, mon_0830)
    never = {"type": "time", "start": "09:00", "end": "09:01", "days": []}
    always = {"type": "state", "entity": "input_boolean.guests", "states": "on"}
    utc_now = manager_mod.dt_util.utcnow()
    in_window_now = mgr._condition(never, manager_mod.dt_util.as_local(utc_now))
    assert mgr._conditions_ok({"match": "any", "conditions": [never, always]}, utc_now)
    assert mgr._conditions_ok({"match": "all", "conditions": [never, always]}, utc_now) == in_window_now
    assert mgr._conditions_ok({"match": "all", "conditions": []}, utc_now)
    print("ok show-only-when conditions")

    # ---- distance source ----
    assert abs(manager_mod.haversine_m(0, 0, 0, 1) - 111195) < 50
    home = {"latitude": 38.9000, "longitude": -77.0000, "radius": 100}
    work = {"latitude": 38.9000, "longitude": -77.2000, "radius": 100}
    hass.set("zone.home", "0", home)
    hass.set("zone.work", "0", work)
    full = manager_mod.haversine_m(38.9, -77.2, 38.9, -77.0) - 100  # centre of work to the edge of home

    def dist_bar(**src):
        return manager_mod.BarRuntime(engine.normalize_bar({"source": {"type": "distance", "entity": "person.matt", **src}}))

    # between two zones: at work = 0 %, halfway = ~50 %, inside home = 100 %
    rt = dist_bar(dist_mode="zones", from_zone="zone.work", to_zone="zone.home", dist_unit="mi")
    hass.set("person.matt", "work", {"latitude": 38.9, "longitude": -77.2})
    state, frac, value = mgr._distance(rt)
    assert state == "active" and frac == 0.0, (state, frac)
    assert abs(value - full / 1609.344) < 0.02, value
    hass.set("person.matt", "not_home", {"latitude": 38.9, "longitude": -77.1})
    assert abs(mgr._distance(rt)[1] - 0.5) < 0.01
    hass.set("person.matt", "home", {"latitude": 38.9, "longitude": -77.0005})
    assert mgr._distance(rt) == ("active", 1.0, 0.0)
    # a set distance, in km
    rt = dist_bar(dist_mode="fixed", dist_total=10, dist_unit="km")
    hass.set("person.matt", "not_home", {"latitude": 38.9, "longitude": -77.0583})  # ~5.05 km from the centre
    state, frac, value = mgr._distance(rt)
    assert 0.48 < frac < 0.53 and 4.7 < value < 5.2, (frac, value)
    # auto: the trip is as long as the farthest point seen; arriving starts a new trip
    rt = dist_bar(dist_mode="auto", dist_unit="km")
    hass.set("person.matt", "not_home", {"latitude": 38.9, "longitude": -77.2})
    assert mgr._distance(rt)[1] == 0.0
    hass.set("person.matt", "not_home", {"latitude": 38.9, "longitude": -77.1})
    assert abs(mgr._distance(rt)[1] - 0.5) < 0.01
    hass.set("person.matt", "home", {"latitude": 38.9, "longitude": -77.0})
    assert mgr._distance(rt)[1] == 1.0
    hass.set("person.matt", "not_home", {"latitude": 38.9, "longitude": -77.05})
    assert mgr._distance(rt)[1] == 0.0, "a new trip after arriving starts empty"
    # a distance sensor in feet with a set distance in miles
    rt = manager_mod.BarRuntime(engine.normalize_bar({"source": {"type": "distance", "entity": "sensor.dist", "dist_mode": "fixed", "dist_total": 2, "dist_unit": "mi"}}))
    hass.set("sensor.dist", 5280, {"unit_of_measurement": "ft"})
    assert mgr._distance(rt) == ("active", 0.5, 1.0), mgr._distance(rt)
    # no position -> unavailable
    hass.set("person.matt", "unknown")
    assert mgr._distance(dist_bar())[0] == "unavailable"
    print("ok distance source")

    # ---- media playback position ----
    def src_bar(**src):
        return manager_mod.BarRuntime(engine.normalize_bar({"source": src}))

    utc = manager_mod.dt_util.utcnow()
    rt = src_bar(type="media", entity="media_player.tv")
    assert mgr._source(rt, utc)[0] == "unavailable"
    hass.set("media_player.tv", "idle", {})
    assert mgr._source(rt, utc)[0] == "idle"
    hass.set("media_player.tv", "paused", {"media_duration": 200, "media_position": 50})
    assert mgr._source(rt, utc) == ("active", 0.25, 150.0)
    hass.set("media_player.tv", "playing", {"media_duration": 200, "media_position": 50,
                                            "media_position_updated_at": (utc - timedelta(seconds=30)).isoformat()})
    state, frac, left = mgr._source(rt, utc)
    assert state == "active" and abs(frac - 0.4) < 0.001 and abs(left - 120) < 0.2, (state, frac, left)
    assert rt.total == 200
    hass.set("media_player.tv", "playing", {"media_position": 5})  # live stream: no length
    assert mgr._source(rt, utc)[0] == "idle"
    print("ok media playback source")

    # ---- one value as a share of another (solar against house use) ----
    rt = src_bar(type="ratio", entity="sensor.solar", entity2="sensor.house")
    assert mgr._source(rt, utc)[0] == "unavailable"
    hass.set("sensor.solar", 1200, {"unit_of_measurement": "W"})
    hass.set("sensor.house", 2.0, {"unit_of_measurement": "kW"})
    assert mgr._source(rt, utc) == ("active", 0.6, 60.0)
    hass.set("sensor.solar", 5000, {"unit_of_measurement": "W"})
    assert mgr._source(rt, utc)[1] == 1.0, "more solar than use is a full bar"
    hass.set("sensor.house", 0, {"unit_of_measurement": "kW"})
    assert mgr._source(rt, utc)[1] == 1.0
    hass.set("sensor.solar", 0, {"unit_of_measurement": "W"})
    assert mgr._source(rt, utc)[1] == 0.0
    print("ok ratio source")

    # ---- countdown to a calendar event or a date ----
    soon = utc + timedelta(hours=6)
    hass.set("calendar.bins", "off", {"start_time": soon.strftime("%Y-%m-%d %H:%M:%S")})
    assert abs((mgr._time("calendar.bins") - soon).total_seconds()) < 1.5
    rt = src_bar(type="timestamp", end_entity="calendar.bins", duration=24 * 3600)
    state, frac, left = mgr._source(rt, utc)
    assert state == "active" and abs(frac - 0.75) < 0.001, (state, frac)
    hass.set("calendar.bins", "off", {"start_time": (utc + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")})
    assert mgr._source(rt, utc)[0] == "idle", "more than the lead time away: nothing to show yet"
    hass.set("calendar.bins", "off", {})
    assert mgr._source(rt, utc)[0] == "idle"
    hass.set("sensor.bin_day", "2031-03-04")
    assert mgr._time("sensor.bin_day").strftime("%Y-%m-%d %H:%M") == "2031-03-04 00:00"
    print("ok calendar and date countdown")

    # ---- notification flash ----
    hass.set("sensor.progress", 50)
    await mgr.async_save([bar], dict(mgr.settings, transport="json"))
    await settle(mgr, fake, 0.3)
    mgr.flash(None, "#0000ff", "solid", 0.8)
    await asyncio.sleep(0.4)
    assert mgr._last_frame.get(0) == (0, 0, 255) and mgr._last_frame.get(39) == (0, 0, 255), mgr._last_frame.get(0)
    await asyncio.sleep(1.0)
    assert mgr._flash is None and mgr._last_frame.get(0) is None and mgr._last_frame.get(10) == (255, 0, 0), "the bar comes back"
    mgr.flash([3, 4], "#00ff00", "strobe", 0.6)
    seen = set()
    for _ in range(20):
        await asyncio.sleep(0.02)
        seen.add(mgr._last_frame.get(3))
    assert (0, 255, 0) in seen and (0, 0, 0) in seen and mgr._last_frame.get(5) is None, seen
    await asyncio.sleep(0.5)
    print("ok notification flash")

    # ---- the periodic repaint brings bars back after WLED wiped them ----
    manager_mod.REPAINT_INTERVAL = 0.4
    await asyncio.sleep(0.6)
    fake.leds = [None] * len(fake.leds)  # someone loaded a preset in WLED
    await asyncio.sleep(1.6)
    assert fake.leds[10:15] == [(255, 0, 0)] * 5, fake.leds[8:16]
    manager_mod.REPAINT_INTERVAL = 999.0
    print("ok repaint after WLED wiped the LEDs")

    # ---- "find on strip" works while nothing is showing (the loop is asleep) ----
    hass.set("sensor.progress", "unavailable")
    await settle(mgr, fake)
    assert not mgr._last_frame, mgr._last_frame
    mgr.identify([2, 3])
    await asyncio.sleep(0.3)
    assert mgr._last_frame.get(2) in ((255, 255, 255), (0, 0, 0)) and 4 not in mgr._last_frame, mgr._last_frame
    await asyncio.sleep(3.3)
    assert not mgr._last_frame and fake.frozen is False, "LEDs are handed back after the blink"
    hass.set("sensor.progress", 50)
    print("ok find on strip while idle")

    # ---- manual timers and values survive a restart ----
    class Entry2(Entry):
        entry_id = "e2"
        title = "Other"

    manual = dict(bar, id="t", name="Timer", source={"type": "manual", "min": 0, "max": 10})
    await mgr.async_save([bar, manual], None)
    mgr.start_timer(mgr.find_bar("timer"), 600)
    saved = Store.data["wled_bars.e1"]
    assert list(saved["manual"]) == ["t"] and saved["manual"]["t"]["timer"][1] == 600, saved["manual"]
    again = manager_mod.BarsManager(hass, Entry2(f"127.0.0.1:{port}"))
    again.name = "Other"
    again._apply(saved["bars"], saved["settings"])
    again._restore_manual(saved["manual"])
    started, seconds = again.find_bar("timer").timer
    assert seconds == 600 and abs((manager_mod.dt_util.utcnow() - started).total_seconds()) < 5
    state, frac, _left = again._source(again.find_bar("timer"), manager_mod.dt_util.utcnow())
    assert state == "active" and frac < 0.02, (state, frac)
    mgr.set_value(mgr.find_bar("timer"), 7.5)
    assert Store.data["wled_bars.e1"]["manual"] == {"t": {"value": 7.5}}
    again._restore_manual({"t": {"value": 7.5}, "gone": {"value": 1}, "p": "junk"})
    assert again.find_bar("timer").manual_value == 7.5
    mgr.stop_timer(mgr.find_bar("timer"))
    assert Store.data["wled_bars.e1"]["manual"] == {}
    await mgr.async_save(None, None)
    assert Store.data["wled_bars.e1"]["manual"] == {}, "an ordinary save keeps the manual section"
    print("ok manual timer and value survive a restart")

    # ---- a name shared by bars is refused instead of guessed ----
    both = [mgr, again]
    assert manager_mod.resolve_bar(both, "Progress", "Other") == (again, again.find_bar("progress"))
    assert manager_mod.resolve_bar(both, "progress", "e1")[0] is mgr
    assert manager_mod.resolve_bar([mgr], "p")[1].bar["name"] == "Progress", "an id still works"
    for args, text in (
        ((both, "Progress"), "add 'device'"),
        ((both, "Nope"), "No WLED bar"),
        ((both, "Progress", "Attic"), "No WLED Bars device"),
        ((both, "Nope", "Other"), "on 'Other'"),
    ):
        try:
            manager_mod.resolve_bar(*args)
        except manager_mod.BarLookupError as err:
            assert text in str(err), err
        else:
            raise AssertionError(f"{args[1:]} should be refused")
    again._apply([bar, dict(bar, id="q")], {})
    try:
        manager_mod.resolve_bar([again], "Progress")
    except manager_mod.BarLookupError as err:
        assert "rename one" in str(err), err
    else:
        raise AssertionError("two bars with one name on one strip should be refused")
    print("ok bar lookup for services")

    # ---- the clock: wake exactly when hours, windows or night dimming change ----
    def local(h, m, sec=0):
        return _dt(2026, 11, 9, h, m, sec).astimezone()

    timed_bar = dict(bar, id="c", visibility={"conditions": [{"type": "time", "start": "09:00", "end": "17:00"}]})
    again._apply([timed_bar], {})
    assert abs(again._next_change(local(8, 59, 30)) - 30.05) < 0.01, again._next_change(local(8, 59, 30))
    assert abs(again._next_change(local(9, 0)) - (8 * 3600 + 0.05)) < 0.01, "at a boundary, the next one"
    assert abs(again._next_change(local(23, 0)) - (10 * 3600 + 0.05)) < 0.01, "across midnight"
    again._apply([dict(timed_bar, enabled=False)], {})
    assert again._next_change(local(8, 59, 30)) is None, "a switched-off bar needs no wake-up"
    again._apply([dict(bar, id="c", visibility={"conditions": [{"type": "time", "start": "00:00", "end": "00:00", "days": [0]}]})], {})
    assert abs(again._next_change(local(23, 59)) - 60.05) < 0.01, "days of the week change at midnight"
    again._apply([dict(bar, id="w", source={"type": "window", "window_start": "07:00", "window_end": "23:00"})], {})
    assert abs(again._next_change(local(6, 58)) - 120.05) < 0.01
    again._apply([bar], {"night": {"mode": "schedule", "start": "22:00", "end": "07:00"}})
    assert abs(again._next_change(local(21, 59, 50)) - 10.05) < 0.01
    assert again._brightness(local(21, 59, 50)) == 1.0 and again._brightness(local(22, 0, 1)) == 0.2
    assert again._brightness(local(7, 0, 30)) == 1.0, "night dimming ends on the minute, not a minute late"
    again._apply([bar], {})
    assert again._next_change(local(12, 0)) is None
    # a countdown that has not started yet wakes the loop when it does
    hass.set("sensor.done_at", (utc_now + timedelta(hours=3)).isoformat())
    again._apply([dict(bar, id="f", source={"type": "timestamp", "end_entity": "sensor.done_at", "duration": 3600})], {})
    assert again._source(again.runtimes[0], utc_now)[0] == "idle"
    assert abs(again._next_change(utc_now) - 7200.05) < 0.01, again._next_change(utc_now)
    if again._unsub_states:
        again._unsub_states()
    await mgr.async_save([bar], None)
    await settle(mgr, fake, 0.3)
    print("ok clock boundaries")

    # ---- per-bar entities ----
    eb = importlib.import_module("wb.entity_base")
    switch_mod = importlib.import_module("wb.switch")
    number_mod = importlib.import_module("wb.number")
    sensor_mod = importlib.import_module("wb.sensor")
    hass.data = {"wled_bars": {mgr.entry.entry_id: mgr}}
    hass.async_create_task = lambda coro: coro.close()
    mgr.entry.async_on_unload = lambda cb: None
    added = {"switch": [], "sensor": [], "number": []}
    await mgr.async_save([
        {"id": "a", "name": "Alpha", "start": 0, "end": 9, "source": {"type": "entity", "entity": "sensor.outdoor", "min": 0, "max": 82}},
        {"id": "m", "name": "Manual", "start": 10, "end": 19, "source": {"type": "manual", "min": 0, "max": 10}},
    ], None)
    eb.sync_bar_entities(hass, mgr.entry, added["switch"].extend, switch_mod.BarSwitch)
    eb.sync_bar_entities(hass, mgr.entry, added["sensor"].extend, sensor_mod.BarFill)
    eb.sync_bar_entities(hass, mgr.entry, added["number"].extend, number_mod.BarValue, lambda bar: bar["source"]["type"] == "manual")
    assert [e.name for e in added["switch"]] == ["Alpha", "Manual"]
    assert [e.name for e in added["sensor"]] == ["Alpha fill", "Manual fill"]
    assert [e.name for e in added["number"]] == ["Manual value"]
    await settle(mgr, fake)
    fill = added["sensor"][0]
    assert fill.native_value == 50 and fill.extra_state_attributes["showing"] is True, (fill.native_value, fill.extra_state_attributes)
    assert any(sig.startswith("wled_bars_status") for sig in SENT), "status changes must be signalled"
    # the switch turns its bar off, and the bar stops showing
    await added["switch"][0].async_turn_off()
    assert added["switch"][0].is_on is False and mgr.bars[0]["enabled"] is False
    # the number drives a manual bar
    num = added["number"][0]
    assert (num.native_min_value, num.native_max_value) == (0.0, 10.0)
    await num.async_set_native_value(7.5)
    await settle(mgr, fake)
    assert num.native_value == 7.5 and added["sensor"][1].native_value == 75
    # a new bar gets entities, a deleted bar loses them, a rename is followed
    await mgr.async_save(
        [{**mgr.bars[1], "name": "Renamed"}, {"id": "z", "name": "Zeta", "start": 20, "end": 29}], None
    )
    assert [e.name for e in added["switch"]] == ["Bar", "Renamed", "Zeta"], [e.name for e in added["switch"]]
    assert added["switch"][0].available is False and added["switch"][1].available is True
    print("ok per-bar entities")

    await mgr.async_stop()
    await SESSION["s"].close()
    await runner.cleanup()
    assert wled.compress_changes({i: (1, 2, 3) for i in range(200)}) == [[0, 200, "010203"]]
    big = wled.compress_changes({i: (i % 256, 0, 0) for i in range(300)})
    assert all(len(c) <= wled.JSON_MAX_ITEMS for c in big) and sum(len(c) for c in big) == 600
    print("all manager tests passed")


if __name__ == "__main__":
    async def _guarded():
        # a failed assertion must end the run at once rather than hang in shutdown
        try:
            await main()
        except BaseException:  # noqa: BLE001
            import os
            import traceback

            traceback.print_exc()
            sys.stdout.flush()
            os._exit(1)

    asyncio.run(_guarded())
