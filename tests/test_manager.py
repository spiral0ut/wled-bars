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
_mod("homeassistant.helpers.dispatcher", async_dispatcher_send=lambda *a: None)
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

    await mgr.async_stop()
    await SESSION["s"].close()
    await runner.cleanup()
    assert wled.compress_changes({i: (1, 2, 3) for i in range(200)}) == [[0, 200, "010203"]]
    big = wled.compress_changes({i: (i % 256, 0, 0) for i in range(300)})
    assert all(len(c) <= wled.JSON_MAX_ITEMS for c in big) and sum(len(c) for c in big) == 600
    print("all manager tests passed")


if __name__ == "__main__":
    asyncio.run(main())
