// Pure render engine for WLED Bars (browser side, used for the editor preview).
// Mirrors ../engine.py line-for-line; tests/parity.mjs checks both produce
// identical frames. Change one, change the other.

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

export const DEFAULT_CAP = { count: 0, color: "#ffffff", level: 40, effect: "solid", period: 1.0 };

export const DEFAULT_MARKER = {
  type: "value",
  value: 50,
  entity: "",
  color: "#ff2a2a",
  effect: "solid",
  period: 1.0,
};

export const DEFAULT_RULE = {
  source: "percent",
  entity: "",
  op: ">=",
  value: "90",
  color: "#ff0000",
  use_color: true,
  effect: "blink",
  period: 1.0,
  scope: "fill",
};

export const DEFAULT_BAR = {
  id: "",
  name: "New bar",
  kind: "",
  enabled: true,
  start: 0,
  end: 29,
  fill_from: "start",
  subpixel: true,
  smoothing: 0.8,
  brightness: 100,
  source: {
    type: "entity",
    entity: "",
    attribute: "",
    min: 0,
    max: 100,
    invert: false,
    end_entity: "",
    start_entity: "",
    duration: 3600,
    window_start: "07:00",
    window_end: "23:00",
  },
  color: {
    mode: "gradient",
    span: "bar",
    blend: true,
    stops: [
      { pos: 0, color: "#00c8ff" },
      { pos: 100, color: "#7a5cff" },
    ],
    rainbow_span: 360,
    rainbow_speed: 0,
  },
  track: { mode: "dim", color: "#202020", level: 6 },
  caps: { start: { ...DEFAULT_CAP }, end: { ...DEFAULT_CAP } },
  tip: {
    enabled: true,
    count: 1,
    color: "#ffffff",
    auto: false,
    effect: "pulse",
    period: 1.0,
    position: "inside",
    off: "under",
    taper: false,
    show_at_zero: false,
    hide_when_full: true,
  },
  ticks: { every: 0, color: "#404040", over: false },
  markers: [],
  peak: { enabled: false, color: "#ffffff", hold: 5 },
  animation: { type: "none", period: 2.0, depth: 50, size: 6 },
  rules: [],
  on_complete: { effect: "none", color: "#00ff60", duration: 5, then: "hold" },
  unavailable: { mode: "hide", color: "#ff3030" },
  visibility: {
    entity: "",
    states: "",
    hide_at_zero: false,
    hide_when_idle: true,
    match: "all",
    conditions: [],
  },
};

// ---------- helpers ----------

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function merge(defaults, value) {
  if (!isObj(value)) return clone(defaults);
  const out = {};
  for (const key of Object.keys(defaults)) {
    const dval = defaults[key];
    if (key in value && value[key] !== null && value[key] !== undefined) {
      out[key] = isObj(dval) ? merge(dval, value[key]) : clone(value[key]);
    } else {
      out[key] = clone(dval);
    }
  }
  return out;
}

export function normalizeBar(bar) {
  const out = merge(DEFAULT_BAR, bar);
  out.markers = (Array.isArray(out.markers) ? out.markers : []).filter(isObj).map((m) => merge(DEFAULT_MARKER, m));
  out.rules = (Array.isArray(out.rules) ? out.rules : []).filter(isObj).map((r) => merge(DEFAULT_RULE, r));
  let stops = (Array.isArray(out.color.stops) ? out.color.stops : [])
    .filter(isObj)
    .map((s) => ({ pos: num(s.pos, 0), color: String(s.color === undefined ? "#ffffff" : s.color) }));
  if (!stops.length) stops = [{ pos: 0, color: "#ffffff" }];
  stops = stops
    .map((s, i) => [s, i])
    .sort((a, b) => a[0].pos - b[0].pos || a[1] - b[1])
    .map((x) => x[0]);
  out.color.stops = stops;
  out.start = Math.max(0, Math.trunc(num(out.start, 0)));
  out.end = Math.max(0, Math.trunc(num(out.end, 0)));
  return out;
}

export function num(value, dflt = 0) {
  if (value === null || value === undefined) return dflt;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() === "") return dflt;
  if (typeof value !== "number" && typeof value !== "string") return dflt;
  const result = Number(value);
  if (!Number.isFinite(result)) return dflt;
  return result;
}

export function clamp(x, lo = 0, hi = 1) {
  return x < lo ? lo : x > hi ? hi : x;
}

function fmodPos(x, m) {
  return x - m * Math.floor(x / m);
}

export function hexToRgb(text) {
  let s = String(text || "").trim().replace(/^#+/, "");
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return WHITE;
  const v = parseInt(s, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function hsv(h, s, v) {
  h = fmodPos(h, 360) / 60;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const u = v * (1 - s * (1 - f));
  let r, g, b;
  if (i === 0) [r, g, b] = [v, u, p];
  else if (i === 1) [r, g, b] = [q, v, p];
  else if (i === 2) [r, g, b] = [p, v, u];
  else if (i === 3) [r, g, b] = [p, q, v];
  else if (i === 4) [r, g, b] = [u, p, v];
  else [r, g, b] = [v, p, q];
  return [r * 255, g * 255, b * 255];
}

function hash01(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function wave(t, period) {
  if (period <= 0) return 1;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
}

function effectLevel(effect, t, period) {
  if (period <= 0) return 1;
  if (effect === "blink") return fmodPos(t, period) < period * 0.5 ? 1 : 0;
  if (effect === "pulse") return wave(t, period);
  if (effect === "strobe") return fmodPos(t, period) < Math.min(0.12, period * 0.25) ? 1 : 0;
  return 1;
}

function sampleStops(stops, x, stepped) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x < stops[i][0]) {
      if (stepped) return stops[i - 1][1];
      const p0 = stops[i - 1][0];
      const p1 = stops[i][0];
      if (p1 <= p0) return stops[i][1];
      return mix(stops[i - 1][1], stops[i][1], (x - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
}

export function barLength(bar) {
  return Math.abs(Math.trunc(bar.end) - Math.trunc(bar.start)) + 1;
}

export function barLeds(bar) {
  const start = Math.trunc(bar.start);
  const end = Math.trunc(bar.end);
  const step = end >= start ? 1 : -1;
  const out = [];
  for (let i = start; i !== end + step; i += step) out.push(i);
  return out;
}

export function valueToFrac(bar, value) {
  const lo = num(bar.source.min, 0);
  const hi = num(bar.source.max, 100);
  if (hi === lo) return 0;
  return clamp((value - lo) / (hi - lo));
}

export function fracToValue(bar, frac) {
  const lo = num(bar.source.min, 0);
  const hi = num(bar.source.max, 100);
  return lo + (hi - lo) * frac;
}

export function compare(lhs, op, rhs) {
  const a = num(lhs, null);
  const b = num(rhs, null);
  if (a !== null && b !== null) {
    if (op === ">") return a > b;
    if (op === ">=") return a >= b;
    if (op === "<") return a < b;
    if (op === "<=") return a <= b;
    if (op === "==") return a === b;
    if (op === "!=") return a !== b;
    return false;
  }
  const sa = String(lhs).trim().toLowerCase();
  const sb = String(rhs).trim().toLowerCase();
  if (op === "==") return sa === sb;
  if (op === "!=") return sa !== sb;
  return false;
}

export function pickRule(bar, value, percent, getState) {
  let found = null;
  for (const rule of bar.rules) {
    let lhs;
    if (rule.source === "percent") lhs = percent;
    else if (rule.source === "value") lhs = value;
    else lhs = rule.entity ? getState(rule.entity) : null;
    if (lhs === null || lhs === undefined) continue;
    if (compare(lhs, rule.op, rule.value)) found = rule;
  }
  return found;
}

export function isAnimated(bar) {
  if (bar.tip.enabled && bar.tip.effect !== "solid") return true;
  if (bar.animation.type !== "none") return true;
  if (bar.color.mode === "rainbow" && num(bar.color.rainbow_speed, 0) !== 0) return true;
  for (const side of ["start", "end"]) {
    const cap = bar.caps[side];
    if (cap.count > 0 && cap.effect !== "solid") return true;
  }
  for (const marker of bar.markers) if (marker.effect !== "solid") return true;
  for (const rule of bar.rules) if (rule.effect !== "solid") return true;
  return false;
}

// ---------- rendering ----------

function finish(pixels, bright) {
  return pixels.map((c) => [
    Math.floor(clamp(c[0] * bright, 0, 255) + 0.5),
    Math.floor(clamp(c[1] * bright, 0, 255) + 0.5),
    Math.floor(clamp(c[2] * bright, 0, 255) + 0.5),
  ]);
}

function celebrate(oc, n, age) {
  const color = hexToRgb(oc.color);
  const effect = oc.effect;
  const out = [];
  for (let i = 0; i < n; i++) {
    let c;
    if (effect === "flash") c = scale(color, effectLevel("blink", age, 0.5));
    else if (effect === "pulse") c = scale(color, 0.1 + 0.9 * wave(age, 1.2));
    else if (effect === "rainbow") c = hsv((i * 360) / n - age * 180, 1, 1);
    else if (effect === "sparkle") {
      const k = Math.floor(age * 10);
      c = hash01(i, k) < 0.25 ? WHITE : scale(color, 0.6);
    } else c = color;
    out.push(c);
  }
  return out;
}

export function renderBar(bar, ctx) {
  const n = barLength(bar);
  const t = num(ctx.t, 0);
  const f = clamp(num(ctx.frac, 0));
  const bright = clamp(num(bar.brightness, 100) / 100) * clamp(num(ctx.brightness, 1));

  if (ctx.unavailable) {
    const c = scale(hexToRgb(bar.unavailable.color), 0.15 + 0.35 * wave(t, 3));
    return finish(new Array(n).fill(c), bright);
  }

  const oc = bar.on_complete;
  const age = ctx.complete_age;
  if (age !== null && age !== undefined && oc.effect !== "none" && age < num(oc.duration, 0)) {
    return finish(celebrate(oc, n, age), bright);
  }

  const caps = bar.caps;
  const cs = Math.trunc(clamp(num(caps.start.count, 0), 0, n - 1));
  const ce = Math.trunc(clamp(num(caps.end.count, 0), 0, n - 1 - cs));
  const m = n - cs - ce;
  const mode = bar.fill_from;
  const mirrored = mode === "center" || mode === "edges";
  const mh = mirrored ? Math.floor((m + 1) / 2) : m;

  let lit = f * mh;
  if (!bar.subpixel) lit = Math.floor(lit + 0.5);
  const lead = Math.ceil(lit - 1e-9);

  const color = bar.color;
  const cmode = color.mode;
  const stops = color.stops.map((s) => [s.pos, hexToRgb(s.color)]);
  const rule = ctx.rule || null;
  const ruleColor = rule && rule.use_color ? hexToRgb(rule.color) : null;
  const ruleLevel = rule ? effectLevel(rule.effect, t, num(rule.period, 1)) : 1;
  const ruleAll = !!rule && rule.scope === "all";

  const track = bar.track;
  const trackLevel = clamp(num(track.level, 0) / 100);
  const trackColor = hexToRgb(track.color);

  const ticks = bar.ticks;
  const tickSet = new Set();
  const every = num(ticks.every, 0);
  if (every > 0 && mh > 1) {
    let k = 1;
    while (k * every < 100 - 1e-9 && k < 1000) {
      tickSet.add(Math.floor(((k * every) / 100) * (mh - 1) + 0.5));
      k += 1;
    }
  }
  const tickColor = hexToRgb(ticks.color);

  const anim = bar.animation;
  const atype = anim.type;
  const aperiod = Math.max(0.05, num(anim.period, 2));
  const adepth = clamp(num(anim.depth, 50) / 100);
  const asize = Math.max(1, num(anim.size, 6));

  const tip = bar.tip;
  const tipK = Math.trunc(Math.max(0, num(tip.count, 0)));
  let tipOn = !!tip.enabled && tipK > 0 && !ruleAll;
  if (tipOn && f <= 0 && !tip.show_at_zero) tipOn = false;
  if (tipOn && f >= 1 - 1e-9 && tip.hide_when_full) tipOn = false;
  let tipLo, tipHi;
  if (tip.position === "ahead") {
    tipLo = lead;
    tipHi = lead + tipK;
  } else {
    tipHi = Math.max(lead, 1);
    tipLo = Math.max(tipHi - tipK, 0);
  }
  const tipLevel = effectLevel(tip.effect, t, num(tip.period, 1));
  const tipColor = hexToRgb(tip.color);

  const markerList = [];
  const mfracs = ctx.markers || [];
  bar.markers.forEach((marker, idx) => {
    const mf = idx < mfracs.length ? mfracs[idx] : null;
    if (mf === null || mf === undefined) return;
    const md = Math.min(mh - 1, Math.floor(clamp(mf) * mh));
    markerList.push([md, hexToRgb(marker.color), effectLevel(marker.effect, t, num(marker.period, 1))]);
  });

  const peak = ctx.peak;
  let peakD = -1;
  if (bar.peak.enabled && peak !== null && peak !== undefined) {
    peakD = Math.min(mh - 1, Math.floor(clamp(peak) * mh));
  }
  const peakColor = hexToRgb(bar.peak.color);

  const scanCenter = fmodPos(t / aperiod, 1) * (lit + asize) - asize * 0.5;
  const shimmerStep = (t * 8) / aperiod;
  const shimmerK = Math.floor(shimmerStep);
  const shimmerF = shimmerStep - shimmerK;

  const pixels = [];

  let cap = caps.start;
  let capC = scale(
    hexToRgb(cap.color),
    clamp(num(cap.level, 100) / 100) * effectLevel(cap.effect, t, num(cap.period, 1))
  );
  for (let i = 0; i < cs; i++) pixels.push(ruleAll && ruleColor ? scale(ruleColor, ruleLevel) : capC);

  for (let j = 0; j < m; j++) {
    let d;
    if (mode === "start") d = j;
    else if (mode === "end") d = m - 1 - j;
    else if (mode === "center") d = Math.floor(Math.abs(j + 0.5 - m / 2));
    else d = Math.min(j, m - 1 - j);
    const p = mh > 1 ? d / (mh - 1) : 0;
    const cov = clamp(lit - d);

    let base;
    if (cmode === "solid") base = stops[0][1];
    else if (cmode === "gradient") {
      let x;
      if (color.span === "fill") x = f > 0 ? clamp(p / f) * 100 : 0;
      else x = p * 100;
      base = sampleStops(stops, x, false);
    } else if (cmode === "steps") base = sampleStops(stops, p * 100, true);
    else if (cmode === "value") base = sampleStops(stops, f * 100, !color.blend);
    else base = hsv(p * num(color.rainbow_span, 360) - t * num(color.rainbow_speed, 0), 1, 1);
    if (ruleColor) base = ruleColor;

    let am = 1;
    let wm = 0;
    if (atype === "breathe") am = 1 - adepth * (1 - wave(t, aperiod));
    else if (atype === "flow") am = 1 - adepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * (d / asize - t / aperiod)));
    else if (atype === "shimmer") {
      const s0 = hash01(j, shimmerK) < 0.15 ? 1 : 0;
      const s1 = hash01(j, shimmerK + 1) < 0.15 ? 1 : 0;
      wm = adepth * (s0 + (s1 - s0) * shimmerF);
    } else if (atype === "scan") wm = adepth * Math.max(0, 1 - Math.abs(d - scanCenter) / (asize * 0.5));
    let litC = mix(scale(base, am), WHITE, wm);

    let tr;
    if (track.mode === "color") tr = scale(trackColor, trackLevel);
    else if (track.mode === "dim") tr = scale(base, trackLevel);
    else tr = BLACK;
    if (tickSet.has(d)) {
      tr = tickColor;
      if (ticks.over) litC = tickColor;
    }

    let c;
    if (ruleAll) c = scale(base, ruleLevel);
    else {
      c = mix(tr, scale(litC, ruleLevel), cov);
      if (d === peakD && cov < 1) c = peakColor;
      for (const [md, mc, ml] of markerList) if (d === md) c = mix(c, mc, ml);
      if (tipOn && tipLo <= d && d < tipHi && d < mh) {
        const tl = tip.taper ? (d - tipLo + 1) / tipK : 1;
        const tc = tip.auto ? mix(base, WHITE, 0.6) : tipColor;
        const off = tip.off === "under" ? c : BLACK;
        c = mix(off, scale(tc, tl), tipLevel);
      }
    }
    pixels.push(c);
  }

  cap = caps.end;
  capC = scale(
    hexToRgb(cap.color),
    clamp(num(cap.level, 100) / 100) * effectLevel(cap.effect, t, num(cap.period, 1))
  );
  for (let i = 0; i < ce; i++) pixels.push(ruleAll && ruleColor ? scale(ruleColor, ruleLevel) : capC);

  return finish(pixels, bright);
}
