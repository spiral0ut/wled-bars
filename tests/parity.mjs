// Generates random bars + contexts, renders them with the JS engine and prints
// JSON for tests/test_engine.py to compare against the Python engine.
import * as E from "../custom_components/wled_bars/frontend/engine.js";

let seed = 12345;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const col = () => "#" + int(0, 0xffffff).toString(16).padStart(6, "0");
const eff = () => pick(["solid", "blink", "pulse", "strobe"]);
const r3 = (x) => Math.round(x * 1000) / 1000;

const cases = [];
for (let i = 0; i < 600; i++) {
  const start = int(0, 60);
  const end = int(0, 60);
  const bar = {
    start,
    end,
    fill_from: pick(["start", "end", "center", "edges"]),
    subpixel: rnd() < 0.7,
    brightness: int(10, 100),
    source: { min: int(-20, 10), max: int(20, 120) },
    color: {
      mode: pick(["solid", "gradient", "steps", "value", "rainbow"]),
      span: pick(["bar", "fill"]),
      blend: rnd() < 0.5,
      stops: Array.from({ length: int(1, 4) }, () => ({ pos: int(0, 100), color: col() })),
      rainbow_span: int(60, 720),
      rainbow_speed: int(0, 90),
    },
    track: { mode: pick(["off", "color", "dim"]), color: col(), level: int(0, 40) },
    caps: {
      start: { count: int(0, 3), color: col(), level: int(10, 100), effect: eff(), period: r3(0.3 + rnd() * 2) },
      end: { count: int(0, 3), color: col(), level: int(10, 100), effect: eff(), period: r3(0.3 + rnd() * 2) },
    },
    tip: {
      enabled: rnd() < 0.8,
      count: int(0, 4),
      color: col(),
      auto: rnd() < 0.3,
      effect: eff(),
      period: r3(0.2 + rnd() * 2),
      position: pick(["inside", "ahead"]),
      off: pick(["under", "dark"]),
      taper: rnd() < 0.4,
      show_at_zero: rnd() < 0.5,
      hide_when_full: rnd() < 0.5,
    },
    ticks: { every: pick([0, 0, 10, 25, 50]), color: col(), over: rnd() < 0.5 },
    markers: Array.from({ length: int(0, 2) }, () => ({ color: col(), effect: eff(), period: r3(0.3 + rnd()) })),
    peak: { enabled: rnd() < 0.4, color: col() },
    animation: {
      type: pick(["none", "breathe", "flow", "shimmer", "scan"]),
      period: r3(0.3 + rnd() * 3),
      depth: int(0, 100),
      size: int(1, 10),
    },
    on_complete: { effect: pick(["none", "flash", "pulse", "rainbow", "sparkle"]), color: col(), duration: 5 },
    unavailable: { color: col() },
  };
  const nb = E.normalizeBar(bar);
  const frac = pick([0, 1, r3(rnd()), r3(rnd()), r3(rnd())]);
  const rule =
    rnd() < 0.3
      ? { color: col(), use_color: rnd() < 0.7, effect: eff(), period: r3(0.3 + rnd()), scope: pick(["fill", "all"]) }
      : null;
  const ctx = {
    t: r3(rnd() * 100),
    frac,
    brightness: r3(0.2 + rnd() * 0.8),
    rule,
    markers: nb.markers.map(() => (rnd() < 0.8 ? r3(rnd()) : null)),
    peak: rnd() < 0.5 ? r3(rnd()) : null,
    complete_age: rnd() < 0.15 ? r3(rnd() * 6) : null,
    unavailable: rnd() < 0.05,
  };
  cases.push({ bar, ctx, normalized: nb, leds: E.barLeds(nb), frame: E.renderBar(nb, ctx) });
}
console.log(JSON.stringify({ defaults: E.DEFAULT_BAR, cases }));
