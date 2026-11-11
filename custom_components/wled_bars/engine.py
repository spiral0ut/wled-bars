"""Pure render engine for WLED Bars.

No Home Assistant imports. This file is mirrored line-for-line by
frontend/engine.js (used for the editor preview); tests/parity.mjs checks that
both produce identical frames. Change one, change the other.
"""
from __future__ import annotations

import copy
import math

WHITE = (255.0, 255.0, 255.0)
BLACK = (0.0, 0.0, 0.0)

DEFAULT_CAP = {"count": 0, "color": "#ffffff", "level": 40, "effect": "solid", "period": 1.0}

DEFAULT_MARKER = {
    "type": "value",
    "value": 50,
    "entity": "",
    "color": "#ff2a2a",
    "effect": "solid",
    "period": 1.0,
}

DEFAULT_RULE = {
    "source": "percent",
    "entity": "",
    "op": ">=",
    "value": "90",
    "color": "#ff0000",
    "use_color": True,
    "effect": "blink",
    "period": 1.0,
    "scope": "fill",
}

DEFAULT_BAR = {
    "id": "",
    "name": "New bar",
    "kind": "",
    "enabled": True,
    "start": 0,
    "end": 29,
    "fill_from": "start",
    "subpixel": True,
    "smoothing": 0.8,
    "brightness": 100,
    "source": {
        "type": "entity",
        "entity": "",
        "attribute": "",
        "min": 0,
        "max": 100,
        "invert": False,
        "end_entity": "",
        "start_entity": "",
        "duration": 3600,
        "window_start": "07:00",
        "window_end": "23:00",
        "to_zone": "zone.home",
        "from_zone": "",
        "dist_mode": "fixed",
        "dist_total": 10,
        "dist_unit": "",
    },
    "color": {
        "mode": "gradient",
        "span": "bar",
        "blend": True,
        "stops": [
            {"pos": 0, "color": "#00c8ff"},
            {"pos": 100, "color": "#7a5cff"},
        ],
        "rainbow_span": 360,
        "rainbow_speed": 0,
    },
    "track": {"mode": "dim", "color": "#202020", "level": 6},
    "caps": {"start": dict(DEFAULT_CAP), "end": dict(DEFAULT_CAP)},
    "tip": {
        "enabled": True,
        "count": 1,
        "color": "#ffffff",
        "auto": False,
        "effect": "pulse",
        "period": 1.0,
        "position": "inside",
        "off": "under",
        "taper": False,
        "show_at_zero": False,
        "hide_when_full": True,
    },
    "ticks": {"every": 0, "color": "#404040", "over": False},
    "markers": [],
    "peak": {"enabled": False, "color": "#ffffff", "hold": 5},
    "animation": {"type": "none", "period": 2.0, "depth": 50, "size": 6},
    "rules": [],
    "on_complete": {"effect": "none", "color": "#00ff60", "duration": 5, "then": "hold"},
    "unavailable": {"mode": "hide", "color": "#ff3030"},
    "visibility": {
        "entity": "",
        "states": "",
        "hide_at_zero": False,
        "hide_when_idle": True,
        "match": "all",
        "conditions": [],
    },
}


# ---------- helpers ----------


def _merge(defaults, value):
    """Deep-merge value over defaults (dicts only; lists replaced)."""
    if not isinstance(value, dict):
        return copy.deepcopy(defaults)
    out = {}
    for key, dval in defaults.items():
        if key in value and value[key] is not None:
            if isinstance(dval, dict):
                out[key] = _merge(dval, value[key])
            else:
                out[key] = copy.deepcopy(value[key])
        else:
            out[key] = copy.deepcopy(dval)
    return out


def normalize_bar(bar):
    """Fill in every missing key so the renderer never has to guess."""
    out = _merge(DEFAULT_BAR, bar)
    out["markers"] = [_merge(DEFAULT_MARKER, m) for m in out["markers"] if isinstance(m, dict)]
    out["rules"] = [_merge(DEFAULT_RULE, r) for r in out["rules"] if isinstance(r, dict)]
    stops = [
        {"pos": num(s.get("pos"), 0.0), "color": str(s.get("color", "#ffffff"))}
        for s in out["color"]["stops"]
        if isinstance(s, dict)
    ]
    if not stops:
        stops = [{"pos": 0.0, "color": "#ffffff"}]
    stops.sort(key=lambda s: s["pos"])
    out["color"]["stops"] = stops
    out["start"] = max(0, int(num(out["start"], 0)))
    out["end"] = max(0, int(num(out["end"], 0)))
    return out


def num(value, default=0.0):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if result != result or result in (float("inf"), float("-inf")):
        return default
    return result


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else (hi if x > hi else x)


def fmod_pos(x, m):
    return x - m * math.floor(x / m)


def hex_to_rgb(text):
    s = str(text or "").strip().lstrip("#")
    if len(s) == 3:
        s = s[0] * 2 + s[1] * 2 + s[2] * 2
    if len(s) != 6:
        return WHITE
    try:
        v = int(s, 16)
    except ValueError:
        return WHITE
    return (float((v >> 16) & 255), float((v >> 8) & 255), float(v & 255))


def mix(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def scale(c, k):
    return (c[0] * k, c[1] * k, c[2] * k)


def hsv(h, s, v):
    h = fmod_pos(h, 360.0) / 60.0
    i = int(math.floor(h))
    f = h - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    u = v * (1.0 - s * (1.0 - f))
    if i == 0:
        r, g, b = v, u, p
    elif i == 1:
        r, g, b = q, v, p
    elif i == 2:
        r, g, b = p, v, u
    elif i == 3:
        r, g, b = p, q, v
    elif i == 4:
        r, g, b = u, p, v
    else:
        r, g, b = v, p, q
    return (r * 255.0, g * 255.0, b * 255.0)


def hash01(a, b):
    h = (a * 374761393 + b * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return h / 4294967296.0


def wave(t, period):
    """Smooth 0..1..0 oscillation."""
    if period <= 0:
        return 1.0
    return 0.5 - 0.5 * math.cos(2.0 * math.pi * t / period)


def effect_level(effect, t, period):
    """Brightness multiplier 0..1 for a blink-style effect at time t."""
    if period <= 0:
        return 1.0
    if effect == "blink":
        return 1.0 if fmod_pos(t, period) < period * 0.5 else 0.0
    if effect == "pulse":
        return wave(t, period)
    if effect == "strobe":
        return 1.0 if fmod_pos(t, period) < min(0.12, period * 0.25) else 0.0
    return 1.0


def sample_stops(stops, x, stepped):
    """stops: list of (pos, rgb) sorted by pos. x in the same units as pos."""
    if x <= stops[0][0]:
        return stops[0][1]
    for i in range(1, len(stops)):
        if x < stops[i][0]:
            if stepped:
                return stops[i - 1][1]
            p0 = stops[i - 1][0]
            p1 = stops[i][0]
            if p1 <= p0:
                return stops[i][1]
            return mix(stops[i - 1][1], stops[i][1], (x - p0) / (p1 - p0))
    return stops[-1][1]


def bar_length(bar):
    return abs(int(bar["end"]) - int(bar["start"])) + 1


def bar_leds(bar):
    """Physical LED indices in logical order (first = where the bar begins)."""
    start = int(bar["start"])
    end = int(bar["end"])
    step = 1 if end >= start else -1
    return list(range(start, end + step, step))


def value_to_frac(bar, value):
    """Map a raw source value to 0..1 using the bar's min/max."""
    src = bar["source"]
    lo = num(src["min"], 0.0)
    hi = num(src["max"], 100.0)
    if hi == lo:
        return 0.0
    return clamp((value - lo) / (hi - lo))


def frac_to_value(bar, frac):
    src = bar["source"]
    lo = num(src["min"], 0.0)
    hi = num(src["max"], 100.0)
    return lo + (hi - lo) * frac


def compare(lhs, op, rhs):
    """Compare numerically when both sides are numbers, else as text."""
    a = num(lhs, None)
    b = num(rhs, None)
    if a is not None and b is not None:
        if op == ">":
            return a > b
        if op == ">=":
            return a >= b
        if op == "<":
            return a < b
        if op == "<=":
            return a <= b
        if op == "==":
            return a == b
        if op == "!=":
            return a != b
        return False
    sa = str(lhs).strip().lower()
    sb = str(rhs).strip().lower()
    if op == "==":
        return sa == sb
    if op == "!=":
        return sa != sb
    return False


def pick_rule(bar, value, percent, get_state):
    """Return the last matching rule (later rules win) or None.

    value: raw source value (or None), percent: 0..100,
    get_state: callable(entity_id) -> state string or None.
    """
    found = None
    for rule in bar["rules"]:
        src = rule["source"]
        if src == "percent":
            lhs = percent
        elif src == "value":
            lhs = value
        else:
            lhs = get_state(rule["entity"]) if rule["entity"] else None
        if lhs is None:
            continue
        if compare(lhs, rule["op"], rule["value"]):
            found = rule
    return found


def is_animated(bar):
    """True when the bar needs continuous frames even with a steady value."""
    if bar["tip"]["enabled"] and bar["tip"]["effect"] != "solid":
        return True
    if bar["animation"]["type"] != "none":
        return True
    if bar["color"]["mode"] == "rainbow" and num(bar["color"]["rainbow_speed"], 0.0) != 0:
        return True
    for side in ("start", "end"):
        cap = bar["caps"][side]
        if cap["count"] > 0 and cap["effect"] != "solid":
            return True
    for marker in bar["markers"]:
        if marker["effect"] != "solid":
            return True
    for rule in bar["rules"]:
        if rule["effect"] != "solid":
            return True
    return False


# ---------- rendering ----------


def _finish(pixels, bright):
    out = []
    for c in pixels:
        out.append(
            (
                int(clamp(c[0] * bright, 0.0, 255.0) + 0.5),
                int(clamp(c[1] * bright, 0.0, 255.0) + 0.5),
                int(clamp(c[2] * bright, 0.0, 255.0) + 0.5),
            )
        )
    return out


def _celebrate(oc, n, age):
    color = hex_to_rgb(oc["color"])
    effect = oc["effect"]
    out = []
    for i in range(n):
        if effect == "flash":
            c = scale(color, effect_level("blink", age, 0.5))
        elif effect == "pulse":
            c = scale(color, 0.1 + 0.9 * wave(age, 1.2))
        elif effect == "rainbow":
            c = hsv(i * 360.0 / n - age * 180.0, 1.0, 1.0)
        elif effect == "sparkle":
            k = int(math.floor(age * 10.0))
            c = WHITE if hash01(i, k) < 0.25 else scale(color, 0.6)
        else:
            c = color
        out.append(c)
    return out


def render_bar(bar, ctx):
    """Render one bar. bar must be normalized.

    ctx keys: t (seconds), frac (0..1), brightness (0..1 global multiplier),
    rule (dict|None), markers (list of frac|None aligned with bar.markers),
    peak (frac|None), complete_age (seconds|None), unavailable (bool).
    Returns a list of (r, g, b) ints in logical order (index 0 = bar start).
    """
    n = bar_length(bar)
    t = num(ctx.get("t"), 0.0)
    f = clamp(num(ctx.get("frac"), 0.0))
    bright = clamp(num(bar["brightness"], 100.0) / 100.0) * clamp(num(ctx.get("brightness"), 1.0))

    if ctx.get("unavailable"):
        c = scale(hex_to_rgb(bar["unavailable"]["color"]), 0.15 + 0.35 * wave(t, 3.0))
        return _finish([c] * n, bright)

    oc = bar["on_complete"]
    age = ctx.get("complete_age")
    if age is not None and oc["effect"] != "none" and age < num(oc["duration"], 0.0):
        return _finish(_celebrate(oc, n, age), bright)

    caps = bar["caps"]
    cs = int(clamp(num(caps["start"]["count"], 0), 0, n - 1))
    ce = int(clamp(num(caps["end"]["count"], 0), 0, n - 1 - cs))
    m = n - cs - ce
    mode = bar["fill_from"]
    mirrored = mode == "center" or mode == "edges"
    mh = (m + 1) // 2 if mirrored else m

    lit = f * mh
    if not bar["subpixel"]:
        lit = math.floor(lit + 0.5)
    lead = int(math.ceil(lit - 1e-9))

    color = bar["color"]
    cmode = color["mode"]
    stops = [(s["pos"], hex_to_rgb(s["color"])) for s in color["stops"]]
    rule = ctx.get("rule")
    rule_color = hex_to_rgb(rule["color"]) if rule and rule["use_color"] else None
    rule_level = effect_level(rule["effect"], t, num(rule["period"], 1.0)) if rule else 1.0
    rule_all = bool(rule) and rule["scope"] == "all"

    track = bar["track"]
    track_level = clamp(num(track["level"], 0.0) / 100.0)
    track_color = hex_to_rgb(track["color"])

    ticks = bar["ticks"]
    tick_set = set()
    every = num(ticks["every"], 0.0)
    if every > 0 and mh > 1:
        k = 1
        while k * every < 100.0 - 1e-9 and k < 1000:
            tick_set.add(int(math.floor(k * every / 100.0 * (mh - 1) + 0.5)))
            k += 1
    tick_color = hex_to_rgb(ticks["color"])

    anim = bar["animation"]
    atype = anim["type"]
    aperiod = max(0.05, num(anim["period"], 2.0))
    adepth = clamp(num(anim["depth"], 50.0) / 100.0)
    asize = max(1.0, num(anim["size"], 6.0))

    tip = bar["tip"]
    tip_k = int(max(0, num(tip["count"], 0)))
    tip_on = bool(tip["enabled"]) and tip_k > 0 and not rule_all
    if tip_on and f <= 0.0 and not tip["show_at_zero"]:
        tip_on = False
    if tip_on and f >= 1.0 - 1e-9 and tip["hide_when_full"]:
        tip_on = False
    if tip["position"] == "ahead":
        tip_lo = lead
        tip_hi = lead + tip_k
    else:
        tip_hi = max(lead, 1)
        tip_lo = max(tip_hi - tip_k, 0)
    tip_level = effect_level(tip["effect"], t, num(tip["period"], 1.0))
    tip_color = hex_to_rgb(tip["color"])

    marker_list = []
    mfracs = ctx.get("markers") or []
    for idx, marker in enumerate(bar["markers"]):
        mf = mfracs[idx] if idx < len(mfracs) else None
        if mf is None:
            continue
        md = min(mh - 1, int(math.floor(clamp(mf) * mh)))
        marker_list.append(
            (md, hex_to_rgb(marker["color"]), effect_level(marker["effect"], t, num(marker["period"], 1.0)))
        )

    peak = ctx.get("peak")
    peak_d = -1
    if bar["peak"]["enabled"] and peak is not None:
        peak_d = min(mh - 1, int(math.floor(clamp(peak) * mh)))
    peak_color = hex_to_rgb(bar["peak"]["color"])

    scan_center = fmod_pos(t / aperiod, 1.0) * (lit + asize) - asize * 0.5
    shimmer_step = t * 8.0 / aperiod
    shimmer_k = int(math.floor(shimmer_step))
    shimmer_f = shimmer_step - shimmer_k

    pixels = []

    cap = caps["start"]
    cap_c = scale(
        hex_to_rgb(cap["color"]),
        clamp(num(cap["level"], 100.0) / 100.0) * effect_level(cap["effect"], t, num(cap["period"], 1.0)),
    )
    for _ in range(cs):
        pixels.append(scale(rule_color, rule_level) if rule_all and rule_color else cap_c)

    for j in range(m):
        if mode == "start":
            d = j
        elif mode == "end":
            d = m - 1 - j
        elif mode == "center":
            d = int(math.floor(abs(j + 0.5 - m / 2.0)))
        else:
            d = min(j, m - 1 - j)
        p = d / (mh - 1.0) if mh > 1 else 0.0
        cov = clamp(lit - d)

        if cmode == "solid":
            base = stops[0][1]
        elif cmode == "gradient":
            if color["span"] == "fill":
                x = clamp(p / f) * 100.0 if f > 0 else 0.0
            else:
                x = p * 100.0
            base = sample_stops(stops, x, False)
        elif cmode == "steps":
            base = sample_stops(stops, p * 100.0, True)
        elif cmode == "value":
            base = sample_stops(stops, f * 100.0, not color["blend"])
        else:
            base = hsv(
                p * num(color["rainbow_span"], 360.0) - t * num(color["rainbow_speed"], 0.0),
                1.0,
                1.0,
            )
        if rule_color:
            base = rule_color

        am = 1.0
        wm = 0.0
        if atype == "breathe":
            am = 1.0 - adepth * (1.0 - wave(t, aperiod))
        elif atype == "flow":
            am = 1.0 - adepth * (0.5 + 0.5 * math.sin(2.0 * math.pi * (d / asize - t / aperiod)))
        elif atype == "shimmer":
            s0 = 1.0 if hash01(j, shimmer_k) < 0.15 else 0.0
            s1 = 1.0 if hash01(j, shimmer_k + 1) < 0.15 else 0.0
            wm = adepth * (s0 + (s1 - s0) * shimmer_f)
        elif atype == "scan":
            wm = adepth * max(0.0, 1.0 - abs(d - scan_center) / (asize * 0.5))
        lit_c = mix(scale(base, am), WHITE, wm)

        if track["mode"] == "color":
            tr = scale(track_color, track_level)
        elif track["mode"] == "dim":
            tr = scale(base, track_level)
        else:
            tr = BLACK
        if d in tick_set:
            tr = tick_color
            if ticks["over"]:
                lit_c = tick_color

        if rule_all:
            c = scale(base, rule_level)
        else:
            c = mix(tr, scale(lit_c, rule_level), cov)
            if d == peak_d and cov < 1.0:
                c = peak_color
            for md, mc, ml in marker_list:
                if d == md:
                    c = mix(c, mc, ml)
            if tip_on and tip_lo <= d < tip_hi and d < mh:
                tl = (d - tip_lo + 1.0) / tip_k if tip["taper"] else 1.0
                tc = mix(base, WHITE, 0.6) if tip["auto"] else tip_color
                off = c if tip["off"] == "under" else BLACK
                c = mix(off, scale(tc, tl), tip_level)
        pixels.append(c)

    cap = caps["end"]
    cap_c = scale(
        hex_to_rgb(cap["color"]),
        clamp(num(cap["level"], 100.0) / 100.0) * effect_level(cap["effect"], t, num(cap["period"], 1.0)),
    )
    for _ in range(ce):
        pixels.append(scale(rule_color, rule_level) if rule_all and rule_color else cap_c)

    return _finish(pixels, bright)
