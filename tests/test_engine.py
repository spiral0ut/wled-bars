"""Engine tests: behaviour checks + Python/JS parity. Run: python3 tests/test_engine.py"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "engine", ROOT / "custom_components" / "wled_bars" / "engine.py"
)
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)


def bar(**kw):
    base = {
        "start": 0,
        "end": 9,
        "color": {"mode": "solid", "stops": [{"pos": 0, "color": "#ff0000"}]},
        "track": {"mode": "off"},
        "tip": {"enabled": False},
    }
    base.update(kw)
    return E.normalize_bar(base)


def test_fill():
    f = E.render_bar(bar(), {"frac": 0.5})
    assert f[:5] == [(255, 0, 0)] * 5 and f[5:] == [(0, 0, 0)] * 5, f
    # subpixel: 55% of 10 LEDs = 5.5 -> 6th LED at half brightness
    f = E.render_bar(bar(), {"frac": 0.55})
    assert f[5] == (128, 0, 0), f[5]
    f = E.render_bar(bar(subpixel=False), {"frac": 0.52})
    assert f[5] == (0, 0, 0)


def test_reverse_and_modes():
    b = bar(start=9, end=0)
    assert E.bar_leds(b) == list(range(9, -1, -1))
    f = E.render_bar(bar(fill_from="end"), {"frac": 0.3})
    assert f[7:] == [(255, 0, 0)] * 3 and f[6] == (0, 0, 0)
    f = E.render_bar(bar(fill_from="center"), {"frac": 0.4})
    assert f[3:7] == [(255, 0, 0)] * 4 and f[2] == (0, 0, 0) and f[7] == (0, 0, 0), f
    f = E.render_bar(bar(fill_from="edges"), {"frac": 0.4})
    assert f[:2] == [(255, 0, 0)] * 2 and f[8:] == [(255, 0, 0)] * 2 and f[4] == (0, 0, 0)


def test_caps_and_tip():
    b = bar(
        caps={"start": {"count": 1, "color": "#00ff00", "level": 100}, "end": {"count": 2, "color": "#0000ff", "level": 100}},
        tip={"enabled": True, "count": 2, "color": "#ffffff", "effect": "blink", "period": 1.0, "off": "dark"},
    )
    on = E.render_bar(b, {"frac": 4 / 7, "t": 0.1})
    off = E.render_bar(b, {"frac": 4 / 7, "t": 0.6})
    assert on[0] == (0, 255, 0) and on[8:] == [(0, 0, 255)] * 2
    # fill region is LEDs 1..7; 4 lit -> LEDs 1-4; tip = last two lit (3, 4)
    assert on[1:3] == [(255, 0, 0)] * 2 and on[3:5] == [(255, 255, 255)] * 2 and on[5] == (0, 0, 0), on
    assert off[3:5] == [(0, 0, 0)] * 2
    # tip hidden at 0 and at 100% by default
    assert all(c == (0, 0, 0) for c in E.render_bar(b, {"frac": 0, "t": 0.1})[1:8])
    assert E.render_bar(b, {"frac": 1, "t": 0.1})[7] == (255, 0, 0)
    ahead = bar(tip={"enabled": True, "count": 1, "color": "#ffffff", "effect": "solid", "position": "ahead"})
    f = E.render_bar(ahead, {"frac": 0.3})
    assert f[2] == (255, 0, 0) and f[3] == (255, 255, 255)


def test_colors_rules_markers():
    stops = [{"pos": 0, "color": "#0000ff"}, {"pos": 50, "color": "#00ff00"}, {"pos": 80, "color": "#ff0000"}]
    f = E.render_bar(bar(color={"mode": "value", "blend": False, "stops": stops}), {"frac": 0.6})
    assert f[0] == (0, 255, 0)
    f = E.render_bar(bar(color={"mode": "steps", "stops": stops}), {"frac": 1})
    assert f[0] == (0, 0, 255) and f[5] == (0, 255, 0) and f[9] == (255, 0, 0), f
    b = bar(rules=[{"source": "percent", "op": ">=", "value": "90", "color": "#ff00ff", "effect": "blink", "scope": "all"}])
    assert E.pick_rule(b, None, 50, lambda e: None) is None
    rule = E.pick_rule(b, None, 95, lambda e: None)
    assert rule is not None
    assert E.render_bar(b, {"frac": 0.95, "rule": rule, "t": 0.1}) == [(255, 0, 255)] * 10
    assert E.render_bar(b, {"frac": 0.95, "rule": rule, "t": 0.6}) == [(0, 0, 0)] * 10
    b = bar(markers=[{"color": "#ffffff"}])
    assert E.render_bar(b, {"frac": 0.2, "markers": [0.75]})[7] == (255, 255, 255)
    b = bar(source={"min": 10, "max": 30})
    assert E.value_to_frac(b, 20) == 0.5 and E.frac_to_value(b, 0.25) == 15
    assert E.compare("on", "==", "ON") and E.compare("21.5", ">", 21) and not E.compare("x", ">", 1)


def test_parity():
    out = subprocess.run(
        ["node", str(ROOT / "tests" / "parity.mjs")], capture_output=True, text=True, check=True
    ).stdout
    data = json.loads(out)
    assert data["defaults"] == E.DEFAULT_BAR, "DEFAULT_BAR differs between engine.py and engine.js"
    worst = 0
    for i, case in enumerate(data["cases"]):
        nb = E.normalize_bar(case["bar"])
        assert nb == case["normalized"], f"case {i}: normalize differs"
        assert E.bar_leds(nb) == case["leds"], f"case {i}: leds differ"
        frame = E.render_bar(nb, case["ctx"])
        assert len(frame) == len(case["frame"]), f"case {i}: length"
        for a, b in zip(frame, case["frame"]):
            diff = max(abs(a[k] - b[k]) for k in range(3))
            worst = max(worst, diff)
            assert diff <= 1, f"case {i}: {a} vs {b}\n{json.dumps(case['bar'])}\n{case['ctx']}"
    print(f"parity: {len(data['cases'])} cases, worst channel diff {worst}")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("ok", name)
    sys.exit(0)
