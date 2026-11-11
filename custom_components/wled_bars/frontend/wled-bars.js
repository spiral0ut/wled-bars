// WLED Bars frontend: the sidebar editor panel and the dashboard card.
// Plain web components, no build step. The preview uses the same render
// engine as the backend (engine.js mirrors engine.py).
// Loaded with the same ?v= as this file so a new release never pairs with a
// cached copy of the old engine.
const E = await import("./engine.js" + new URL(import.meta.url).search);

const DOMAIN = "wled_bars";

// ---------- tiny DOM helpers ----------

const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k !== "list" && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(3)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- icons: one-colour line drawings that take the text colour ----------

const ICONS = {
  print: "M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v6H7z",
  temperature: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 10v7",
  battery: "M4 8h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM22 11v2M6 11v2M9.5 11v2",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M9.5 2h5",
  washer: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM7.5 6.5h.01M10.5 6.5h.01",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  level: "M5 20v-4M10 20v-8M15 20V8M20 20V4",
  blank: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 8v8M8 12h8",
  tip: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  caps: "M5 21V4M5 4h12l-2.5 4L17 12H5",
  track: "M3 12h7M13.5 12h.01M17 12h.01M20.5 12h.01",
  ticks: "M3 8h18v8H3zM7 8v3M11 8v4M15 8v3",
  markers: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  peak: "M5 4h14M12 20V9M7 13l5-5 5 5",
  anim: "M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1",
  rules: "M12 3L2 20h20L12 3zM12 10v4M12 17h.01",
  done: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6",
  unavail: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
  vis: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  fill: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
  settings: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  presets: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  toggle: "M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zM16 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  number: "M5 9h14M5 15h14M10 4L8 20M16 4l-2 16",
  play: "M7 4l13 8-13 8V4z",
  pause: "M8 4v16M16 4v16",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  find: "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 2v4M12 18v4M2 12h4M18 12h4",
  flip: "M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4",
  undo: "M4 9h10a6 6 0 0 1 0 12H9M8 5L4 9l4 4",
  x: "M6 6l12 12M18 6L6 18",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
};
const ic = (name, size = 16) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("class", "i" + (name === "grip" ? " dots" : ""));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name] || ICONS.blank);
  svg.append(path);
  return svg;
};
const fmt = (v) => (Math.round(v * 100) / 100).toString();
const hexToPixels = (hex) => {
  const out = [];
  for (let i = 0; i + 5 < hex.length; i += 6) {
    out.push([parseInt(hex.substr(i, 2), 16), parseInt(hex.substr(i + 2, 2), 16), parseInt(hex.substr(i + 4, 2), 16)]);
  }
  return out;
};

const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const parseHM = (text) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(text || ""));
  return m ? (Number(m[1]) % 24) * 60 + (Number(m[2]) % 60) : null;
};
// Pointer drag that works with mouse and touch. onMove(event), onEnd().
const dragHandle = (el, onStart, onMove, onEnd) => {
  el.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    el.setPointerCapture(down.pointerId);
    const ctx = onStart ? onStart(down) : null;
    const move = (e) => onMove(e, ctx, down);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (onEnd) onEnd();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
};

// ---------- "show only when" conditions (mirrors manager.py) ----------

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NEW_CONDITION = {
  time: () => ({ type: "time", start: "07:00", end: "09:00", days: [] }),
  state: () => ({ type: "state", entity: "", states: "on", negate: false }),
  numeric: () => ({ type: "numeric", entity: "", op: ">=", value: "0" }),
};

export function condOk(c, getState, date = new Date()) {
  if (c.type === "time") {
    const st = parseHM(c.start), en = parseHM(c.end);
    const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    let weekday = (date.getDay() + 6) % 7; // Monday = 0
    let inside = true;
    if (st !== null && en !== null && st !== en) {
      const length = (((en - st) % 1440) + 1440) % 1440;
      const elapsed = (((now - st) % 1440) + 1440) % 1440;
      inside = elapsed <= length;
      if (st > en && now < en) weekday = (weekday + 6) % 7;
    }
    if (Array.isArray(c.days) && c.days.length && !c.days.includes(weekday)) return false;
    return inside;
  }
  if (!c.entity) return true;
  const cur = getState(c.entity);
  if (c.type === "state") {
    const allowed = String(c.states || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) allowed.push("on");
    const hit = cur !== null && cur !== undefined && allowed.includes(String(cur).toLowerCase());
    return c.negate ? !hit : hit;
  }
  if (c.type === "numeric") return E.num(cur, null) !== null && E.compare(cur, c.op || ">=", c.value);
  return true;
}

export function conditionsOk(vis, getState, date = new Date()) {
  const list = (vis.conditions || []).filter((c) => c && typeof c === "object");
  if (!list.length) return true;
  return vis.match === "any" ? list.some((c) => condOk(c, getState, date)) : list.every((c) => condOk(c, getState, date));
}

const daysText = (days) => {
  if (!Array.isArray(days) || !days.length || days.length === 7) return "";
  const key = [...days].sort().join("");
  if (key === "01234") return " weekdays";
  if (key === "56") return " weekends";
  return " " + [...days].sort().map((i) => DAY_NAMES[i]).join(" ");
};
const condText = (c) => {
  if (c.type === "time") {
    const all = parseHM(c.start) === parseHM(c.end);
    return (all ? "all day" : `${c.start}–${c.end}`) + daysText(c.days);
  }
  if (!c.entity) return "";
  if (c.type === "state") return `${c.entity} ${c.negate ? "is not" : "is"} ${c.states || "on"}`;
  return `${c.entity} ${(OPS.find((o) => o[0] === c.op) || [0, c.op])[1]} ${c.value}`;
};

// ---------- bar kinds: what each preset needs ----------
// sources: which "follows" choices make sense; hide: add-ons that don't apply;
// range: how the empty/full mapping is presented.
const KINDS = {
  "": { sources: null, hide: [] },
  progress: { sources: ["entity", "manual"], hide: ["peak"], range: "percent" },
  temperature: { sources: ["entity"], hide: ["done", "peak"], range: "temp", noDrain: true },
  battery: { sources: ["entity"], hide: ["done", "peak"], range: "percent", noDrain: true },
  countdown: { sources: ["timer", "manual"], hide: ["peak", "markers"] },
  finish: { sources: ["timestamp"], hide: ["peak", "markers"] },
  day: { sources: ["window"], hide: ["done", "unavail", "peak", "markers"], noDrain: true },
  level: { sources: ["entity", "manual"], hide: ["done"], range: "percent", noDrain: true },
};
const TEMP_PRESETS = {
  F: [["Room", 60, 85], ["Outdoor", 0, 100], ["Fridge", 33, 45], ["Freezer", -10, 20]],
  C: [["Room", 15, 30], ["Outdoor", -20, 40], ["Fridge", 0, 8], ["Freezer", -25, -5]],
};

// ---------- options ----------

const EFFECTS = [["solid", "Steady"], ["blink", "Blink"], ["pulse", "Pulse (smooth)"], ["strobe", "Strobe (short flash)"]];
const OPS = [[">=", "≥"], [">", ">"], ["<=", "≤"], ["<", "<"], ["==", "is"], ["!=", "is not"]];
const SOURCE_TYPES = [
  ["entity", "A sensor or other entity's value"],
  ["timer", "A timer helper"],
  ["timestamp", "A finish time (washer, dryer, printer…)"],
  ["window", "The time of day"],
  ["manual", "An automation (set by a service call)"],
];
const PALETTES = [
  ["Ocean", ["#00c8ff", "#7a5cff"]],
  ["Sunrise", ["#ff5e3a", "#ffc93a"]],
  ["Traffic", ["#ff2a2a", "#ffd000", "#18e060"]],
  ["Thermal", ["#2a6bff", "#18e0c0", "#ffd000", "#ff2a2a"]],
  ["Battery", ["#ff2a2a", "#ff9a00", "#18e060"]],
  ["Ember", ["#ff9a00", "#ff2a2a"]],
  ["Mint", ["#18e0a0", "#b8ff5a"]],
  ["Mono", ["#ffffff"]],
];
const evenStops = (colors) =>
  colors.map((color, i) => ({ pos: colors.length > 1 ? Math.round((i * 100) / (colors.length - 1)) : 0, color }));

const TEMPLATES = [
  {
    icon: "print", name: "Print / job progress",
    desc: "0–100 % sensor, glowing tip, rainbow when done.",
    bar: {
      name: "Print progress", kind: "progress",
      color: { mode: "gradient", stops: evenStops(["#00c8ff", "#7a5cff"]) },
      tip: { enabled: true, count: 1, effect: "pulse", period: 1.2, color: "#ffffff" },
      caps: { start: { count: 1, color: "#00c8ff", level: 30 }, end: { count: 1, color: "#7a5cff", level: 30 } },
      animation: { type: "flow", period: 2.5, depth: 35, size: 8 },
      on_complete: { effect: "rainbow", duration: 8, then: "hide" },
      visibility: { hide_at_zero: true },
    },
  },
  {
    icon: "temperature", name: "Temperature gauge",
    desc: "Whole bar changes colour from cold to hot.",
    bar: {
      name: "Temperature", kind: "temperature",
      source: { type: "entity", min: 15, max: 30 },
      color: { mode: "value", blend: true, stops: evenStops(["#2a6bff", "#18e0c0", "#ffd000", "#ff2a2a"]) },
      tip: { enabled: false },
      track: { mode: "color", color: "#ffffff", level: 3 },
      ticks: { every: 25, color: "#303030" },
      smoothing: 2,
    },
  },
  {
    icon: "battery", name: "Battery level",
    desc: "Red → green zones, blinks red when low.",
    bar: {
      name: "Battery", kind: "battery",
      color: { mode: "steps", stops: [{ pos: 0, color: "#ff2a2a" }, { pos: 20, color: "#ff9a00" }, { pos: 50, color: "#18e060" }] },
      tip: { enabled: false },
      rules: [{ source: "percent", op: "<", value: "15", color: "#ff0000", use_color: true, effect: "blink", period: 1, scope: "fill" }],
    },
  },
  {
    icon: "timer", name: "Countdown timer",
    desc: "Drains as a timer helper runs down; flashes when finished.",
    bar: {
      name: "Timer", kind: "countdown",
      source: { type: "timer", invert: true },
      color: { mode: "value", blend: true, stops: evenStops(["#ff2a2a", "#ffd000", "#18e060"]) },
      tip: { enabled: true, count: 1, effect: "blink", period: 1, color: "#ffffff", off: "under" },
      on_complete: { effect: "flash", color: "#ff2a2a", duration: 6, then: "hide" },
      smoothing: 0.3,
    },
  },
  {
    icon: "washer", name: "Finishes at… (washer, dryer, oven)",
    desc: "Fills until a timestamp sensor's finish time.",
    bar: {
      name: "Laundry", kind: "finish",
      source: { type: "timestamp", duration: 0 },
      color: { mode: "gradient", stops: evenStops(["#18e0a0", "#b8ff5a"]) },
      tip: { enabled: true, count: 2, effect: "pulse", period: 1.5, taper: true },
      on_complete: { effect: "sparkle", color: "#18e060", duration: 10, then: "hide" },
    },
  },
  {
    icon: "sun", name: "Day progress",
    desc: "Fills through a daily time window, with hour ticks.",
    bar: {
      name: "Day", kind: "day",
      source: { type: "window", window_start: "07:00", window_end: "23:00" },
      color: { mode: "gradient", span: "bar", stops: evenStops(["#ffc93a", "#ff5e3a", "#7a5cff"]) },
      tip: { enabled: true, count: 1, effect: "pulse", period: 3 },
      ticks: { every: 25, color: "#303030" },
      brightness: 60,
    },
  },
  {
    icon: "level", name: "Level meter (from centre)",
    desc: "Grows outward from the middle, with peak hold.",
    bar: {
      name: "Level", kind: "level",
      fill_from: "center",
      color: { mode: "steps", stops: [{ pos: 0, color: "#18e060" }, { pos: 60, color: "#ffd000" }, { pos: 85, color: "#ff2a2a" }] },
      tip: { enabled: false },
      peak: { enabled: true, color: "#ffffff", hold: 3 },
      smoothing: 0.2,
    },
  },
  { icon: "blank", name: "Blank bar", desc: "Start from the defaults.", bar: { name: "New bar" } },
];
const presetKey = (tpl) => tpl.bar.kind || "blank";

const newMarker = (d) => ({ ...clone(E.DEFAULT_MARKER), type: "value", color: "#ffffff",
  value: Math.round(((E.num(d.source.min, 0) + E.num(d.source.max, 100)) / 2) * 10) / 10 });

// Optional extras. Everything outside the three basic cards is an add-on that
// can be attached to a bar and removed again. `active` reads the bar itself,
// so saved bars and templates show the add-ons they already use.
const ADDONS = [
  { id: "tip", icon: "tip", title: "Flashing tip", hint: "Bright or blinking LEDs at the leading edge",
    active: (d) => !!d.tip.enabled, add: (d) => { d.tip.enabled = true; }, remove: (d) => { d.tip.enabled = false; } },
  { id: "caps", icon: "caps", title: "Begin & end markers", hint: "Always-on LEDs showing where the bar starts and stops",
    active: (d) => d.caps.start.count > 0 || d.caps.end.count > 0,
    add: (d) => { d.caps.start.count = 1; d.caps.end.count = 1; }, remove: (d) => { d.caps.start.count = 0; d.caps.end.count = 0; } },
  { id: "track", icon: "track", title: "Ghost of the unlit part", hint: "Faintly light the empty part of the bar",
    active: (d) => d.track.mode !== "off", add: (d) => { d.track.mode = "dim"; }, remove: (d) => { d.track.mode = "off"; } },
  { id: "ticks", icon: "ticks", title: "Scale marks", hint: "Small marks every 10–50 % along the bar",
    active: (d) => Number(d.ticks.every) > 0, add: (d) => { d.ticks.every = 25; }, remove: (d) => { d.ticks.every = 0; } },
  { id: "markers", icon: "markers", title: "Target marker", hint: "Pin a setpoint, limit or another entity onto the bar",
    active: (d) => d.markers.length > 0, add: (d) => { if (!d.markers.length) d.markers.push(newMarker(d)); }, remove: (d) => { d.markers = []; } },
  { id: "peak", icon: "peak", title: "Peak hold", hint: "A dot that remembers the highest value",
    active: (d) => !!d.peak.enabled, add: (d) => { d.peak.enabled = true; }, remove: (d) => { d.peak.enabled = false; } },
  { id: "anim", icon: "anim", title: "Motion", hint: "Breathe, flow, scanner or shimmer on the lit part",
    active: (d) => d.animation.type !== "none", add: (d) => { d.animation.type = "flow"; }, remove: (d) => { d.animation.type = "none"; } },
  { id: "rules", icon: "rules", title: "Alerts", hint: "Change colour or flash when a condition is met",
    active: (d) => d.rules.length > 0, add: (d) => { if (!d.rules.length) d.rules.push(clone(E.DEFAULT_RULE)); }, remove: (d) => { d.rules = []; } },
  { id: "done", icon: "done", title: "Finish celebration", hint: "Flash, sparkle or hide when it reaches 100 %",
    active: (d) => d.on_complete.effect !== "none" || d.on_complete.then === "hide",
    add: (d) => { d.on_complete.effect = "flash"; }, remove: (d) => { d.on_complete.effect = "none"; d.on_complete.then = "hold"; } },
  { id: "unavail", icon: "unavail", title: "Offline warning", hint: "Pulse a warning colour when the source is unavailable",
    active: (d) => d.unavailable.mode === "show", add: (d) => { d.unavailable.mode = "show"; }, remove: (d) => { d.unavailable.mode = "hide"; } },
  { id: "vis", icon: "vis", title: "Show only when…", hint: "Times of day, days of the week, or what another entity is doing",
    active: (d) => d.visibility.conditions.length > 0 || !!d.visibility.hide_at_zero || !d.visibility.hide_when_idle,
    add: (d) => { if (!d.visibility.conditions.length) d.visibility.conditions.push(NEW_CONDITION.time()); },
    remove: (d) => { Object.assign(d.visibility, { entity: "", states: "", hide_at_zero: false, hide_when_idle: true, match: "all", conditions: [] }); } },
  { id: "fill", icon: "fill", title: "Fill direction & smoothing", hint: "Grow from the centre or both ends; glide speed",
    active: (d) => d.fill_from !== "start" || !d.subpixel,
    add: () => {}, remove: (d) => { d.fill_from = "start"; d.subpixel = true; d.smoothing = E.DEFAULT_BAR.smoothing; } },
];

// Which add-ons a preset starts with: the user's choice if they made one
// (Preset defaults menu), otherwise whatever the built-in template uses.
const builtinAddons = (tpl) => {
  const bar = E.normalizeBar(clone(tpl.bar));
  const hide = (KINDS[bar.kind] || KINDS[""]).hide;
  return ADDONS.filter((a) => a.active(bar) && !hide.includes(a.id)).map((a) => a.id);
};
const presetAddons = (tpl, saved) => {
  const mine = saved && saved[presetKey(tpl)];
  return Array.isArray(mine) ? mine : builtinAddons(tpl);
};

// ---------- LED strip canvas ----------

class StripView {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.o = Object.assign({ max: 26, min: 9, labels: false }, opts);
    this.pixels = [];
    this.ranges = []; // {start, end, color, label}
    this.sel = null; // {start, end}
    this._drag = null; // {mode: "move"|"size", ...} while dragging
    if (this.o.onClick) {
      canvas.style.cursor = "pointer";
      canvas.addEventListener("click", (e) => { const i = this.ledAt(e); if (i !== null) this.o.onClick(i); });
    }
    if (this.o.onSelect) {
      // onSelect(lo, hi, done) always reports lo <= hi; direction is the caller's business.
      canvas.style.cursor = "crosshair";
      canvas.style.touchAction = "none";
      const zone = (i) => {
        if (!this.sel || i === null) return "new";
        const lo = Math.min(this.sel.start, this.sel.end), hi = Math.max(this.sel.start, this.sel.end);
        if (i === lo && i === hi) return "hi";
        if (i === lo) return "lo";
        if (i === hi) return "hi";
        return i > lo && i < hi ? "move" : "new";
      };
      const apply = (i, done) => {
        const g = this._drag;
        const n = Math.max(1, this.pixels.length);
        let lo, hi;
        if (g.mode === "move") {
          const len = g.hi - g.lo;
          lo = Math.max(0, Math.min(n - 1 - len, i - g.offset));
          hi = lo + len;
        } else {
          lo = Math.min(g.anchor, i);
          hi = Math.max(g.anchor, i);
        }
        this.o.onSelect(lo, hi, done);
      };
      canvas.addEventListener("pointerdown", (e) => {
        const i = this.ledAt(e);
        if (i === null) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const z = zone(i);
        const lo = this.sel ? Math.min(this.sel.start, this.sel.end) : i, hi = this.sel ? Math.max(this.sel.start, this.sel.end) : i;
        if (z === "move") this._drag = { mode: "move", lo, hi, offset: i - lo };
        else if (z === "lo") this._drag = { mode: "size", anchor: hi };
        else if (z === "hi") this._drag = { mode: "size", anchor: lo };
        else this._drag = { mode: "size", anchor: i };
        canvas.style.cursor = z === "move" ? "grabbing" : "ew-resize";
        if (z === "new") apply(i, false);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!this._drag) {
          const z = zone(this.ledAt(e));
          canvas.style.cursor = z === "move" ? "grab" : z === "new" ? "crosshair" : "ew-resize";
          return;
        }
        const i = this.ledAt(e, true);
        if (i !== null) apply(i, false);
      });
      const up = (e) => {
        if (!this._drag) return;
        const i = this.ledAt(e, true);
        if (i !== null) apply(i, true);
        else this.o.onSelect(Math.min(this.sel.start, this.sel.end), Math.max(this.sel.start, this.sel.end), true);
        this._drag = null;
        canvas.style.cursor = "crosshair";
      };
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
    }
  }

  layout() {
    const w = Math.max(120, this.c.clientWidth || this.c.parentElement?.clientWidth || 600);
    const n = Math.max(1, this.pixels.length);
    let size = Math.min(this.o.max, w / n);
    let perRow = n;
    if (size < this.o.min) {
      perRow = Math.max(1, Math.floor(w / this.o.min));
      size = w / perRow;
    }
    const rows = Math.ceil(n / perRow);
    const extra = this.o.labels ? 16 : 6;
    return { w, n, size, perRow, rows, rowH: size + extra, x0: (w - size * Math.min(n, perRow)) / 2 };
  }

  ledAt(e, clampToStrip = false) {
    const L = this.layout();
    const r = this.c.getBoundingClientRect();
    let col = Math.floor((e.clientX - r.left - L.x0) / L.size);
    let row = Math.floor((e.clientY - r.top) / L.rowH);
    if (clampToStrip) {
      col = Math.max(0, Math.min(L.perRow - 1, col));
      row = Math.max(0, Math.min(L.rows - 1, row));
    } else if (col < 0 || col >= L.perRow || row < 0 || row >= L.rows) return null;
    return Math.min(L.n - 1, row * L.perRow + col);
  }

  draw() {
    const L = this.layout();
    const dpr = window.devicePixelRatio || 1;
    const hCss = L.rows * L.rowH;
    if (this.c.width !== Math.round(L.w * dpr) || this.c.height !== Math.round(hCss * dpr)) {
      this.c.width = Math.round(L.w * dpr);
      this.c.height = Math.round(hCss * dpr);
      this.c.style.height = hCss + "px";
    }
    const g = this.c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.w, hCss);
    const pos = (i) => [L.x0 + (i % L.perRow) * L.size + L.size / 2, Math.floor(i / L.perRow) * L.rowH + L.size / 2];
    const rad = L.size * 0.34;
    const disp = (v) => Math.round(255 * Math.pow(v / 255, 0.5));

    for (let i = 0; i < L.n; i++) {
      const [x, y] = pos(i);
      const p = this.pixels[i] || [0, 0, 0];
      const level = Math.max(p[0], p[1], p[2]);
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      if (level <= 0) {
        g.shadowBlur = 0;
        g.fillStyle = "#1d212b";
      } else {
        const col = `rgb(${disp(p[0])},${disp(p[1])},${disp(p[2])})`;
        g.shadowColor = col;
        g.shadowBlur = L.size * (0.25 + 0.9 * (level / 255));
        g.fillStyle = col;
      }
      g.fill();
    }
    g.shadowBlur = 0;

    for (const rg of this.ranges) {
      const lo = Math.min(rg.start, rg.end), hi = Math.max(rg.start, rg.end);
      g.fillStyle = rg.color || "#5b8cff";
      for (let i = lo; i <= hi && i < L.n; i++) {
        const [x, y] = pos(i);
        g.fillRect(x - L.size / 2 + (i === lo ? 2 : 0), y + L.size / 2 + 1, L.size - (i === lo ? 2 : 0) - (i === hi ? 2 : 0), 3);
      }
      if (rg.label && this.o.labels && lo < L.n) {
        const [x, y] = pos(lo);
        g.font = "10px system-ui, sans-serif";
        g.textBaseline = "top";
        g.fillStyle = "#aab3c5";
        g.fillText(rg.label, x - L.size / 2 + 2, y + L.size / 2 + 5);
      }
    }

    if (this.sel) {
      const lo = Math.min(this.sel.start, this.sel.end), hi = Math.max(this.sel.start, this.sel.end);
      g.lineWidth = 1.5;
      for (let i = lo; i <= hi && i < L.n; i++) {
        const [x, y] = pos(i);
        g.strokeStyle = i === this.sel.start ? "#3dff8b" : i === this.sel.end ? "#ff5d5d" : "rgba(255,255,255,.35)";
        g.beginPath();
        g.arc(x, y, rad + 2.5, 0, Math.PI * 2);
        g.stroke();
      }
      if (this.o.onSelect) {
        // grab handles on the two outer edges
        g.fillStyle = "#ffffff";
        for (const [i, side] of [[lo, -1], [hi, 1]]) {
          if (i >= L.n) continue;
          const [x, y] = pos(i);
          const hx = x + side * (L.size / 2 - 1.5) - 2;
          g.beginPath();
          if (g.roundRect) g.roundRect(hx, y - L.size / 2 + 1, 4, L.size - 2, 2);
          else g.rect(hx, y - L.size / 2 + 1, 4, L.size - 2);
          g.fill();
        }
      }
    }
  }
}

// ---------- styles ----------

const CSS = `
:host{display:block;min-height:100%;background:var(--primary-background-color,#111318);color:var(--primary-text-color,#e6e9ef);
  font-family:var(--paper-font-body1_-_font-family,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);font-size:14px;
  --wb-card:var(--card-background-color,#1b1e26);--wb-line:var(--divider-color,rgba(128,128,128,.25));
  --wb-dim:var(--secondary-text-color,#9aa3b5);--wb-accent:var(--primary-color,#4f8cff);--wb-stage:#0a0c11}
*{box-sizing:border-box}
.top{display:flex;align-items:center;gap:12px;padding:6px 16px;height:52px;background:var(--app-header-background-color,var(--wb-card));
  color:var(--app-header-text-color,inherit);position:sticky;top:0;z-index:5;border-bottom:1px solid var(--wb-line)}
.top h1{font-size:18px;font-weight:500;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrap{max-width:1100px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}
.card{background:var(--wb-card);border:1px solid var(--wb-line);border-radius:14px;padding:16px}
.card h2{margin:0 0 4px;font-size:15px;font-weight:600}
.dim{color:var(--wb-dim)} .sm{font-size:12px}
.stage{background:var(--wb-stage);border-radius:12px;padding:14px 12px 8px;position:relative}
.stage canvas{display:block;width:100%}
button,select,input{font:inherit;color:inherit}
svg.i{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:-2px}
svg.i.dots{stroke-width:2.8}
.btn{border:1px solid var(--wb-line);background:transparent;border-radius:9px;padding:7px 12px;cursor:pointer;white-space:nowrap;
  display:inline-flex;align-items:center;justify-content:center;gap:6px}
.sic{display:inline-flex;color:var(--wb-accent)}
.btn:hover{border-color:var(--wb-accent)}
.btn.pri{background:var(--wb-accent);border-color:var(--wb-accent);color:#fff;font-weight:600}
.btn.danger:hover{border-color:#ff5d5d;color:#ff5d5d}
.btn.on{background:color-mix(in srgb,var(--wb-accent) 22%,transparent);border-color:var(--wb-accent)}
.btn.xs{padding:3px 8px;font-size:12px;border-radius:7px}
.rowx{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.grow{flex:1;min-width:0}
select,input[type=text],input[type=number],input[type=time]{background:var(--wb-stage);border:1px solid var(--wb-line);border-radius:8px;
  padding:6px 8px;min-width:0;color:#e6e9ef}
select{max-width:100%}
input[type=number]{width:84px}
input[type=color]{width:38px;height:30px;padding:0;border:1px solid var(--wb-line);border-radius:8px;background:none;cursor:pointer}
input[type=range]{accent-color:var(--wb-accent);flex:1;min-width:90px}
input.sw{appearance:none;width:36px;height:20px;border-radius:20px;background:rgba(128,128,128,.4);position:relative;cursor:pointer;
  transition:background .15s;flex:none;margin:0}
input.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
input.sw:checked{background:var(--wb-accent)} input.sw:checked::after{left:18px}
.bars{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.bar{background:var(--wb-card);border:1px solid var(--wb-line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px}
.bar.off{opacity:.55}
.bar .name{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pct{font-variant-numeric:tabular-nums;font-weight:600}
.pill{font-size:11px;padding:2px 7px;border-radius:20px;border:1px solid var(--wb-line);color:var(--wb-dim)}
.pill.live{color:#3dff8b;border-color:rgba(61,255,139,.4)} .pill.bad{color:#ff8080;border-color:rgba(255,128,128,.4)}
.tpl{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-top:10px}
.tpl button{text-align:left;border:1px solid var(--wb-line);background:transparent;border-radius:12px;padding:12px;cursor:pointer;
  display:flex;flex-direction:column;gap:4px}
.tpl button:hover{border-color:var(--wb-accent)} .tpl .ic{display:flex;color:var(--wb-accent);margin-bottom:4px}
.editor{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.sticky{position:sticky;top:52px;z-index:4;background:var(--wb-card);border:1px solid var(--wb-line);border-radius:14px;padding:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.25)}
.sim{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
details{background:var(--wb-card);border:1px solid var(--wb-line);border-radius:14px;overflow:hidden}
summary{cursor:pointer;padding:12px 16px;font-weight:600;display:flex;align-items:center;gap:10px;list-style:none}
summary::-webkit-details-marker{display:none}
summary::after{content:"▾";margin-left:auto;color:var(--wb-dim);transition:transform .15s}
details:not([open]) summary::after{transform:rotate(-90deg)}
summary small{font-weight:400;color:var(--wb-dim)}
.sec{padding:4px 16px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px 24px}
.f{display:flex;align-items:center;gap:10px;min-height:34px}
.f>.fl{flex:0 0 42%;display:flex;flex-direction:column;line-height:1.25}
.f>.fl small{color:var(--wb-dim);font-size:11px}
.f>:last-child{flex:1;min-width:0}
.f>input.sw,.f>input[type=color]{flex:none}
.rg{display:flex;align-items:center;gap:8px} .rg output{width:44px;text-align:right;font-variant-numeric:tabular-nums;color:var(--wb-dim)}
.full{grid-column:1/-1}
.sub{grid-column:1/-1;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--wb-dim);margin-top:6px}
.grad{height:18px;border-radius:9px;border:1px solid var(--wb-line)}
.item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border:1px solid var(--wb-line);border-radius:10px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid var(--wb-line);border-radius:20px;padding:3px 10px 3px 4px;display:flex;align-items:center;gap:6px;cursor:pointer;background:none;font-size:12px}
.chip:hover{border-color:var(--wb-accent)} .chip i{width:34px;height:14px;border-radius:8px;display:block}
.bc{padding:0}
.bh{display:flex;align-items:center;gap:10px;padding:14px 16px 8px;font-weight:600;font-size:15px;flex-wrap:wrap}
.bh small{font-weight:400;font-size:13px;color:var(--wb-dim)}
.step{width:24px;height:24px;border-radius:50%;background:var(--wb-accent);color:#fff;font-size:13px;display:grid;place-items:center;flex:none}
.step.plus{background:transparent;border:1px dashed var(--wb-dim);color:var(--wb-dim)}
.info{grid-column:1/-1;background:var(--wb-stage);border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.45}
.divider{display:flex;align-items:center;gap:12px;color:var(--wb-dim);font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--wb-line)}
.addon{border-left:3px solid var(--wb-accent);scroll-margin:250px 0 24px}
.addon summary{flex-wrap:wrap}
.addon summary .rm{margin-left:auto;opacity:.75} .addon summary .rm:hover{opacity:1}
.addon summary::after{margin-left:4px}
.addon.flash{animation:wbflash 1.4s ease-out}
@keyframes wbflash{0%{box-shadow:0 0 0 3px var(--wb-accent);transform:scale(.985)}30%{transform:none}100%{box-shadow:0 0 0 3px transparent}}
.tray{border-style:dashed}
.addgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;padding:4px 16px 16px}
.add{text-align:left;border:1px solid var(--wb-line);background:transparent;border-radius:12px;padding:10px 12px;cursor:pointer;display:flex;gap:12px;align-items:center;
  transition:border-color .12s,background .12s,transform .12s}
.add:hover{border-color:var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 10%,transparent);transform:translateY(-1px)}
.add .ic{display:flex;flex:none;width:26px;justify-content:center;color:var(--wb-accent)}
.add b{display:block;font-weight:600}
.add.sel{border-color:var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 16%,transparent)}
.add .tick{margin-left:auto;color:var(--wb-accent);font-weight:700;width:14px}
.chip.sel{border-color:var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 22%,transparent)}
.add small{display:block;color:var(--wb-dim);font-size:11.5px;line-height:1.3;margin-top:2px}
.map{grid-column:1/-1;position:relative;height:76px;touch-action:none;user-select:none;margin:0 14px}
.map .tr{position:absolute;left:-14px;right:-14px;top:32px;height:10px;border-radius:6px;background:var(--wb-stage);border:1px solid var(--wb-line)}
.map .fl{position:absolute;top:32px;height:10px;border-radius:6px}
.map .hd{position:absolute;top:22px;width:28px;height:30px;margin-left:-14px;cursor:grab;display:grid;place-items:center;z-index:2}
.map .hd::after{content:"";width:16px;height:26px;border-radius:8px;background:#fff;border:2px solid var(--wb-accent);box-shadow:0 2px 6px rgba(0,0,0,.4)}
.map .hd:active{cursor:grabbing}
.map .lb{position:absolute;top:0;transform:translateX(-50%);font-size:11.5px;white-space:nowrap;color:var(--wb-dim)}
.map .lb b{color:var(--primary-text-color,#e6e9ef)}
.map .now{position:absolute;top:26px;width:2px;height:30px;margin-left:-1px;background:#fff;opacity:.9;z-index:1}
.map .ends{position:absolute;left:-14px;right:-14px;top:58px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--wb-dim);opacity:.7;pointer-events:none}
.map .nl{position:absolute;top:58px;transform:translateX(-50%);font-size:11.5px;white-space:nowrap;color:var(--wb-dim)}
.tb{position:relative;height:54px;touch-action:none;user-select:none;margin:0 14px;flex:1 1 100%}
.tb .tr{position:absolute;left:0;right:0;top:22px;height:22px;border-radius:7px;background:var(--wb-stage);border:1px solid var(--wb-line);
  background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc(25% - 1px),var(--wb-line) calc(25% - 1px),var(--wb-line) 25%)}
.tb .fl{position:absolute;top:22px;height:22px;background:color-mix(in srgb,var(--wb-accent) 55%,transparent);cursor:grab}
.tb .hd{position:absolute;top:16px;width:28px;height:34px;margin-left:-14px;cursor:ew-resize;display:grid;place-items:center;z-index:2}
.tb .hd::after{content:"";width:8px;height:30px;border-radius:5px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.tb .tl{position:absolute;top:0;transform:translateX(-50%);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 3px}
.tb .now{position:absolute;top:18px;width:2px;height:30px;margin-left:-1px;background:#ffd24d;z-index:1;pointer-events:none}
.tbx{display:flex;justify-content:space-between;font-size:10.5px;color:var(--wb-dim);margin:0 6px;flex:1 1 100%}
.cond{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px;border:1px solid var(--wb-line);border-radius:12px}
.cond .ttl{font-weight:600;display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.dot{width:9px;height:9px;border-radius:50%;background:rgba(128,128,128,.5);flex:none}
.dot.yes{background:#3dff8b;box-shadow:0 0 6px rgba(61,255,139,.6)}
.days{display:flex;gap:4px}
.day{width:28px;height:28px;border-radius:50%;border:1px solid var(--wb-line);background:transparent;cursor:pointer;font-size:12px;padding:0}
.day.on{background:var(--wb-accent);border-color:var(--wb-accent);color:#fff;font-weight:600}
.seg{display:inline-flex;border:1px solid var(--wb-line);border-radius:9px;overflow:hidden}
.seg button{border:0;background:transparent;padding:5px 10px;cursor:pointer;font-size:12.5px}
.seg button.on{background:var(--wb-accent);color:#fff}
.link{border:0;background:none;color:var(--wb-accent);cursor:pointer;padding:0;font-size:12.5px;text-decoration:underline}
.bar[draggable=true]{cursor:default}
.bar.dragging{opacity:.4}
.bar.over{outline:2px dashed var(--wb-accent);outline-offset:2px}
.grip{cursor:grab;color:var(--wb-dim);display:inline-flex;padding:0 2px;user-select:none}
input.bad{border-color:#ff8a5d}
.epop{position:fixed;z-index:50;background:var(--wb-card);border:1px solid var(--wb-accent);border-radius:10px;overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.5)}
.er{padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--wb-line)}
.er:last-child{border-bottom:0}
.er:hover,.er.cur{background:color-mix(in srgb,var(--wb-accent) 18%,transparent)}
.en{display:flex;justify-content:space-between;gap:10px} .en b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.en span{color:var(--wb-dim);white-space:nowrap;font-variant-numeric:tabular-nums}
.ei{font-size:11px;color:var(--wb-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{text-align:center;padding:28px 12px}
.banner{background:rgba(255,160,0,.12);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:8px 12px}
dialog{background:var(--wb-card);color:inherit;border:1px solid var(--wb-line);border-radius:16px;padding:0;max-width:min(620px,94vw);width:100%}
dialog::backdrop{background:rgba(0,0,0,.55)}
dialog .sec{grid-template-columns:1fr}
@media(max-width:600px){.f{flex-wrap:wrap}.f>.fl{flex:1 0 100%}.wrap{padding:10px}.sticky .nm{flex-basis:100% !important}.sticky .rowx{justify-content:flex-end}}
`;

// ---------- panel ----------

class WledBarsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._devices = [];
    this._entry = null;
    this._device = null;
    this._bars = [];
    this._settings = null;
    this._live = { pixels: [], bars: {}, online: true };
    this._view = "list";
    this._draft = null;
    this._draftIndex = -1;
    this._sim = { frac: 0.62, play: false, t0: 0, completeAt: null, unavailable: false };
    this._closed = new Set();
    this._added = new Set();
    this._onStrip = false;
    this._strips = [];
    this._raf = 0;
    this._loaded = false;
  }

  set hass(hass) {
    this._hass = hass;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu) menu.hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._load();
    }
  }
  set narrow(v) {
    this._narrow = v;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu) menu.narrow = v;
  }
  set panel(_v) {}

  connectedCallback() {
    const loop = (ts) => {
      this._raf = requestAnimationFrame(loop);
      this._frame(ts / 1000);
    };
    this._raf = requestAnimationFrame(loop);
    if (this._loaded && this._entry && !this._unsub) this._subscribe();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    this._unsubscribe();
    this._stripPreview(false);
  }

  ws(type, data = {}) {
    return this._hass.callWS({ type: `${DOMAIN}/${type}`, ...data });
  }

  async _load() {
    try { this._presets = (await this.ws("presets_get")) || {}; } catch (_e) { this._presets = {}; }
    try {
      this._devices = await this.ws("devices");
    } catch (err) {
      this._error = String(err?.message || err);
      this._devices = [];
    }
    let saved = null;
    try { saved = localStorage.getItem("wled_bars_entry"); } catch (_e) { /* private mode */ }
    const dev = this._devices.find((d) => d.entry_id === saved) || this._devices[0];
    if (dev) await this._selectDevice(dev.entry_id);
    else this._render();
  }

  async _selectDevice(entryId) {
    this._unsubscribe();
    this._entry = entryId;
    try { localStorage.setItem("wled_bars_entry", entryId); } catch (_e) { /* ignore */ }
    const data = await this.ws("get", { entry_id: entryId });
    this._device = data.device;
    this._bars = data.bars;
    this._settings = data.settings;
    this._view = "list";
    this._render();
    this._subscribe();
  }

  async _subscribe() {
    const entry = this._entry;
    const unsub = await this._hass.connection.subscribeMessage(
      (msg) => {
        if (entry !== this._entry) return;
        this._live.pixels = hexToPixels(msg.leds);
        this._live.online = msg.online;
        this._live.bars = Object.fromEntries((msg.bars || []).filter((b) => b && b.id).map((b) => [b.id, b]));
        this._liveDirty = true;
      },
      { type: `${DOMAIN}/subscribe`, entry_id: entry }
    );
    if (entry !== this._entry || !this.isConnected) unsub();
    else this._unsub = unsub;
  }

  _unsubscribe() {
    if (this._unsub) this._unsub();
    this._unsub = null;
  }

  async _saveBars(bars) {
    const res = await this.ws("save", { entry_id: this._entry, bars });
    this._bars = res.bars;
    this._settings = res.settings;
  }

  // ----- render: shell -----

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = "";
    this._strips = [];
    root.append(h("style", {}, CSS));
    const top = h("div", { class: "top" });
    if (customElements.get("ha-menu-button")) {
      const menu = document.createElement("ha-menu-button");
      menu.hass = this._hass;
      menu.narrow = this._narrow;
      top.append(menu);
    }
    top.append(h("h1", {}, this._view === "edit" ? (this._draftIndex < 0 ? "New bar" : "Edit bar") : "WLED Bars"));
    if (this._view === "list" && this._devices.length > 1) {
      top.append(
        h("select", { onchange: (e) => this._selectDevice(e.target.value) },
          this._devices.map((d) => h("option", { value: d.entry_id, selected: d.entry_id === this._entry }, d.name)))
      );
    }
    if (this._view === "list" && this._device) {
      top.append(h("button", { class: "btn", onclick: () => this._settingsDialog() }, ic("settings"), "Device settings"));
    }
    if (this._view === "list") {
      top.append(h("button", { class: "btn", title: "Choose which extras each preset starts with", onclick: () => this._presetsDialog() }, ic("presets"), "Preset defaults"));
    }
    root.append(top);
    const wrap = h("div", { class: "wrap" });
    root.append(wrap);
    if (!this._device) {
      wrap.append(
        h("div", { class: "card empty" },
          h("h2", {}, "No WLED device yet"),
          h("p", { class: "dim" }, this._error || "Add one under Settings → Devices & services → Add integration → WLED Bars."))
      );
      return;
    }
    if (this._view === "edit") this._renderEditor(wrap);
    else this._renderList(wrap);
  }

  // ----- render: list -----

  _renderList(wrap) {
    const dev = this._device;
    const canvas = h("canvas");
    this._liveStrip = new StripView(canvas, { labels: true, max: 22, onClick: (led) => {
      for (let k = this._bars.length - 1; k >= 0; k--) if (E.barLeds(this._bars[k]).includes(led)) return this._edit(k);
      return null;
    } });
    this._liveStrip.pixels = new Array(dev.led_count).fill([0, 0, 0]);
    this._liveStrip.ranges = this._bars.map((b, i) => ({ start: b.start, end: b.end, label: b.name, color: this._barColor(i) }));
    this._strips.push(this._liveStrip);
    this._offlineEl = h("div", { class: "banner sm", style: "display:none;margin-top:10px" },
      `Can't reach WLED at ${dev.host}. Bars will resume automatically when it is back.`);
    wrap.append(
      h("div", { class: "card" },
        h("div", { class: "rowx", style: "margin-bottom:10px" },
          h("div", { class: "grow" }, h("h2", {}, dev.name), h("div", { class: "dim sm" }, `${dev.led_count} LEDs · ${dev.host} · live view · click a bar to edit it`)),
          h("label", { class: "rowx sm" }, "All bars",
            h("input", { type: "checkbox", class: "sw", checked: !!this._settings.enabled,
              onchange: (e) => this._saveSettings({ ...this._settings, enabled: e.target.checked }) }))),
        h("div", { class: "stage" }, canvas),
        this._offlineEl)
    );

    if (this._bars.length) {
      const grid = h("div", { class: "bars" });
      this._bars.forEach((bar, i) => grid.append(this._barCard(bar, i)));
      wrap.append(grid);
    }

    wrap.append(
      h("div", { class: "card" },
        h("h2", {}, this._bars.length ? "Add another bar" : "Create your first bar"),
        h("div", { class: "dim sm" }, "Pick a starting point – everything can be changed afterwards."),
        h("div", { class: "tpl" },
          TEMPLATES.map((t) =>
            h("button", { onclick: () => this._newBar(t) },
              h("span", { class: "ic" }, ic(t.icon, 24)), h("b", {}, t.name), h("span", { class: "dim sm" }, t.desc)))))
    );
    this._liveDirty = true;
  }

  _barColor(i) {
    return ["#5b8cff", "#ff9a3d", "#3dff8b", "#ff5dc8", "#ffe14d", "#4de1ff"][i % 6];
  }

  _sourceText(bar) {
    const s = bar.source;
    if (s.type === "entity") return s.entity ? `${s.entity} · ${s.min}–${s.max}` : "No entity chosen yet";
    if (s.type === "timer") return s.entity || "No timer chosen yet";
    if (s.type === "timestamp") return s.end_entity ? `until ${s.end_entity}` : "No finish-time entity yet";
    if (s.type === "window") return `daily ${s.window_start}–${s.window_end}`;
    return "manual / automation";
  }

  _barCard(bar, i) {
    const canvas = h("canvas");
    const strip = new StripView(canvas, { max: 16, min: 5 });
    strip.barRef = bar;
    this._strips.push(strip);
    const pct = h("span", { class: "pct" }, "–");
    const pill = h("span", { class: "pill" }, "…");
    strip.pctEl = pct;
    strip.pillEl = pill;
    const when = bar.visibility.conditions.map(condText).filter(Boolean).join(bar.visibility.match === "any" ? "  or  " : "  and  ");
    const card = h("div", { class: "bar" + (bar.enabled ? "" : " off"), draggable: true,
      ondragstart: (e) => { this._dragFrom = i; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); },
      ondragend: () => { card.classList.remove("dragging"); this._dragFrom = -1; },
      ondragover: (e) => { if (this._dragFrom >= 0 && this._dragFrom !== i) { e.preventDefault(); card.classList.add("over"); } },
      ondragleave: () => card.classList.remove("over"),
      ondrop: (e) => { e.preventDefault(); card.classList.remove("over"); this._move(this._dragFrom, i); } },
      h("div", { class: "rowx" },
        h("span", { class: "grip", title: "Drag to reorder. Where bars share LEDs, the one further down the list is drawn on top." }, ic("grip", 16)),
        h("span", { style: `width:10px;height:10px;border-radius:50%;background:${this._barColor(i)}` }),
        h("div", { class: "grow name" }, bar.name), pill, pct),
      h("div", { class: "stage", style: "padding:8px 8px 2px" }, canvas),
      h("div", { class: "dim sm", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" },
        `LED ${bar.start} → ${bar.end} · ${this._sourceText(bar)}`),
      when && h("div", { class: "dim sm", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, ic("clock", 13), ` Only ${when}`),
      h("div", { class: "rowx" },
        h("button", { class: "btn pri", onclick: () => this._edit(i) }, "Edit"),
        h("button", { class: "btn xs", onclick: () => this._duplicate(i) }, "Duplicate"),
        this._confirmBtn("Delete", "Tap again to delete", "btn xs danger", () => this._delete(i)),
        h("span", { class: "grow" }),
        h("input", { type: "checkbox", class: "sw", title: "Enabled", checked: !!bar.enabled,
          onchange: async (e) => {
            const bars = clone(this._bars);
            bars[i].enabled = e.target.checked;
            await this._saveBars(bars);
            this._render();
          } }))
    );
    return card;
  }

  _newBar(tpl) {
    const count = this._device.led_count;
    const taken = new Array(count).fill(false);
    for (const b of this._bars) for (const i of E.barLeds(b)) if (i < count) taken[i] = true;
    let best = [0, 0];
    for (let i = 0, run = 0; i <= count; i++) {
      if (i < count && !taken[i]) run++;
      else { if (run > best[1]) best = [i - run, run]; run = 0; }
    }
    // use the gap when it is big enough to be a bar; otherwise start at LED 0 and let the user place it
    const start = best[1] >= 6 ? best[0] : 0;
    const end = Math.min(count - 1, start + Math.min(30, best[1] >= 6 ? best[1] : 30) - 1);
    this._draft = E.normalizeBar({ ...clone(tpl.bar), start, end, id: "" });
    const wanted = presetAddons(tpl, this._presets);
    for (const def of ADDONS) {
      const has = def.active(this._draft);
      if (wanted.includes(def.id) && !has) def.add(this._draft);
      else if (!wanted.includes(def.id) && has) def.remove(this._draft);
    }
    this._startAdded = wanted; // so add-ons with nothing switched on yet still show
    if (this._draft.kind === "temperature" && this._tempUnit(this._draft) === "F") Object.assign(this._draft.source, { min: 60, max: 85 });
    this._draftIndex = -1;
    this._openEditor();
  }

  _edit(i) {
    this._draft = E.normalizeBar(clone(this._bars[i]));
    const vis = this._draft.visibility;
    if (vis.entity) {
      vis.conditions.unshift({ type: "state", entity: vis.entity, states: vis.states || "on", negate: false });
      vis.entity = "";
      vis.states = "";
    }
    this._draftIndex = i;
    this._openEditor();
  }

  _openEditor() {
    this._view = "edit";
    this._sim = { frac: 0.62, play: false, live: true, t0: 0, completeAt: null, unavailable: false };
    this._closed = new Set();
    this._added = new Set(this._startAdded || []);
    this._startAdded = null;
    this._showRange = false;
    this._moreOpen = new Set();
    this._scale = null;
    this._render();
    window.scrollTo?.(0, 0);
  }

  async _duplicate(i) {
    const bars = clone(this._bars);
    const copy = clone(bars[i]);
    copy.id = "";
    copy.name += " copy";
    bars.splice(i + 1, 0, copy);
    await this._saveBars(bars);
    this._render();
  }

  // Two-step button: the first click arms it, the second confirms. Avoids
  // window.confirm(), which some app webviews silently block.
  _confirmBtn(label, armedLabel, cls, action) {
    let timer = 0;
    const btn = h("button", { class: cls, onclick: (e) => {
      e.preventDefault();
      if (btn.dataset.armed) { clearTimeout(timer); action(); return; }
      btn.dataset.armed = "1";
      btn.textContent = armedLabel;
      btn.style.borderColor = "#ff5d5d";
      btn.style.color = "#ff5d5d";
      timer = setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; btn.style.borderColor = ""; btn.style.color = ""; }, 4000);
    } }, label);
    return btn;
  }

  async _move(from, to) {
    if (from === to || from < 0 || to < 0) return;
    const bars = clone(this._bars);
    const [item] = bars.splice(from, 1);
    bars.splice(to, 0, item);
    await this._saveBars(bars);
    this._render();
  }

  _kind(d) {
    if (d.kind && KINDS[d.kind]) return d.kind;
    // bars made before kinds existed: recognise the obvious ones from the entity
    const st = d.source.type === "entity" && this._hass?.states?.[d.source.entity];
    const dc = st && !d.source.attribute ? st.attributes?.device_class : "";
    return dc === "temperature" || dc === "battery" ? dc : "";
  }

  _tempUnit(d) {
    const st = this._hass?.states?.[d.source.entity];
    const unit = (!d.source.attribute && st?.attributes?.unit_of_measurement) || this._hass?.config?.unit_system?.temperature || "°C";
    return /F/i.test(unit) ? "F" : "C";
  }

  async _delete(i) {
    const bars = clone(this._bars);
    bars.splice(i, 1);
    await this._saveBars(bars);
    this._render();
  }

  async _saveSettings(settings) {
    const res = await this.ws("save", { entry_id: this._entry, settings });
    this._settings = res.settings;
  }

  // ----- render: editor -----

  _renderEditor(wrap) {
    const d = this._draft;
    const pv = h("canvas");
    this._preview = new StripView(pv, { max: 30, min: 8 });
    this._simOut = h("output", { class: "pct", style: "min-width:96px;text-align:right;white-space:nowrap" });
    this._simRange = h("input", { type: "range", min: 0, max: 1000, step: 1, value: Math.round(this._sim.frac * 1000),
      oninput: (e) => { this._sim.frac = e.target.value / 1000; this._sim.play = false; this._sim.live = false; this._sim.completeAt = null; this._syncSimButtons(); this._pushStrip(); } });
    this._playBtn = h("button", { class: "btn", onclick: () => {
      this._sim.play = !this._sim.play; this._sim.live = false; this._sim.t0 = 0; this._sim.completeAt = null; this._sim.unavailable = false; this._syncSimButtons();
    } }, ic("play", 14), "Play");
    this._liveBtn = h("button", { class: "btn xs", title: "Make the preview follow the entity's real value again",
      onclick: () => { this._sim.live = true; this._sim.play = false; this._sim.unavailable = false; this._sim.completeAt = null; this._syncSimButtons(); } }, ic("undo", 13), "Back to live value");
    this._doneBtn = h("button", { class: "btn xs", title: "Preview the finish celebration",
      onclick: () => { this._sim.play = false; this._sim.live = false; this._sim.unavailable = false; this._sim.frac = 1; this._simRange.value = 1000; this._sim.completeAt = performance.now() / 1000; this._syncSimButtons(); } }, ic("done", 13), "Test finish");
    this._stripBtn = h("button", { class: "btn", title: "Show this draft on the real LEDs while you edit",
      onclick: () => this._stripPreview(!this._onStrip) }, ic("bulb", 15), "Show on strip");
    this._unavBtn = h("button", { class: "btn xs", onclick: () => { this._sim.unavailable = !this._sim.unavailable; this._sim.play = false; this._sim.live = false; this._syncSimButtons(); } }, ic("unavail", 13), "Test offline");

    this._simExtra = h("div", { class: "sim", style: "margin-top:6px" }, this._liveBtn, this._doneBtn, this._unavBtn);
    this._simRange.title = "Drag to simulate a value";
    this._draftOrig = JSON.stringify(E.normalizeBar(d));
    let armed = 0;
    const cancel = h("button", { class: "btn", onclick: () => {
      const dirty = JSON.stringify(E.normalizeBar(this._draft)) !== this._draftOrig;
      if (!dirty || armed) { clearTimeout(armed); this._closeEditor(); return; }
      cancel.textContent = "Discard changes?";
      cancel.style.borderColor = cancel.style.color = "#ff5d5d";
      armed = setTimeout(() => { armed = 0; cancel.textContent = "Cancel"; cancel.style.borderColor = cancel.style.color = ""; }, 4000);
    } }, "Cancel");
    const head = h("div", { class: "sticky" },
      h("div", { class: "rowx", style: "margin-bottom:10px" },
        h("input", { type: "text", class: "grow nm", style: "font-size:16px;font-weight:600;min-width:150px;flex-basis:150px", value: d.name, placeholder: "Bar name",
          oninput: (e) => { d.name = e.target.value; } }),
        h("label", { class: "rowx sm dim", title: "Turn this bar on or off" }, "Enabled",
          h("input", { type: "checkbox", class: "sw", checked: !!d.enabled, onchange: (e) => { d.enabled = e.target.checked; this._pushStrip(); } })),
        cancel,
        h("button", { class: "btn pri", onclick: () => this._saveDraft() }, "Save")),
      h("div", { class: "stage" }, pv),
      h("div", { class: "sim" },
        this._playBtn, this._simRange, this._simOut, this._stripBtn),
      this._simExtra
    );
    this._form = h("div", { class: "editor" });
    this._lists = h("div", { style: "display:none" });
    wrap.append(head, this._form, this._lists);
    this._renderForm();
    this._syncSimButtons();
  }

  _syncSimButtons() {
    if (!this._playBtn) return;
    this._playBtn.replaceChildren(ic(this._sim.play ? "pause" : "play", 14), this._sim.play ? "Pause" : "Play");
    this._playBtn.classList.toggle("on", this._sim.play);
    this._unavBtn.classList.toggle("on", this._sim.unavailable);
    this._stripBtn.classList.toggle("on", this._onStrip);
    const d = this._draft;
    if (!d) return;
    const on = (id) => ADDONS.find((a) => a.id === id).active(d) || this._added.has(id);
    this._liveBtn.style.display = !this._sim.live && this._liveValue(E.normalizeBar(d)) !== null ? "" : "none";
    this._doneBtn.style.display = on("done") ? "" : "none";
    this._unavBtn.style.display = on("unavail") ? "" : "none";
    if (!on("unavail") && this._sim.unavailable) this._sim.unavailable = false;
    this._simExtra.style.display = [this._liveBtn, this._doneBtn, this._unavBtn].some((b) => b.style.display !== "none") ? "" : "none";
  }

  _closeEditor() {
    this._stripPreview(false);
    this._view = "list";
    this._draft = null;
    this._render();
  }

  async _saveDraft() {
    const bars = clone(this._bars);
    const bar = E.normalizeBar(this._draft);
    if (!bar.name.trim()) bar.name = "Bar";
    if (this._draftIndex >= 0) bars[this._draftIndex] = bar;
    else bars.push(bar);
    this._stripPreview(false);
    await this._saveBars(bars);
    this._view = "list";
    this._draft = null;
    this._render();
  }

  _touch(structural) {
    if (structural) { this._renderForm(); this._syncSimButtons(); }
    else for (const fn of this._hooks) fn();
    this._pushStrip();
  }

  _stripPreview(on) {
    this._onStrip = on;
    clearInterval(this._stripTimer);
    if (on) {
      this._pushStrip(true);
      this._stripTimer = setInterval(() => this._pushStrip(true), 8000);
    } else if (this._hass && this._entry) {
      this.ws("preview", { entry_id: this._entry, bar: null }).catch(() => {});
    }
    this._syncSimButtons();
  }

  _pushStrip(now) {
    if (!this._onStrip || !this._draft) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      if (!this._onStrip || !this._draft) return;
      const bar = E.normalizeBar(this._draft);
      if (this._draftIndex < 0) bar.id = "__draft__";
      this.ws("preview", { entry_id: this._entry, bar, frac: this._sim.frac }).catch(() => {});
    }, now ? 0 : 150);
  }

  _datalist(domains) {
    const key = "dl-" + (domains && domains.length ? domains.join("-") : "all");
    if (!this._lists.querySelector("#" + key)) {
      const states = this._hass?.states || {};
      const dl = h("datalist", { id: key });
      for (const id of Object.keys(states).sort()) {
        if (domains && domains.length && !domains.includes(id.split(".")[0])) continue;
        dl.append(h("option", { value: id }, states[id].attributes?.friendly_name || ""));
      }
      this._lists.append(dl);
    }
    return key;
  }

  _in(obj, key, type, o = {}) {
    const upd = (v, structural) => { obj[key] = v; this._touch(structural || o.structural); };
    if (type === "num")
      return h("input", { type: "number", min: o.min, max: o.max, step: o.step ?? 1, value: obj[key],
        oninput: (e) => { if (e.target.value !== "" && !Number.isNaN(Number(e.target.value))) upd(Number(e.target.value)); } });
    if (type === "range") {
      const out = h("output", {}, fmt(obj[key]) + (o.unit || ""));
      return h("span", { class: "rg" },
        h("input", { type: "range", min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1, value: obj[key],
          oninput: (e) => { upd(Number(e.target.value)); out.textContent = fmt(Number(e.target.value)) + (o.unit || ""); } }), out);
    }
    if (type === "sel")
      return h("select", { onchange: (e) => upd(e.target.value, true) },
        o.options.map(([v, l]) => h("option", { value: v, selected: String(obj[key]) === v }, l)));
    if (type === "tog") return h("input", { type: "checkbox", class: "sw", checked: !!obj[key], onchange: (e) => upd(e.target.checked, true) });
    if (type === "color") return h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(obj[key]) ? obj[key] : "#ffffff", oninput: (e) => upd(e.target.value) });
    if (type === "time") return h("input", { type: "time", value: obj[key], oninput: (e) => upd(e.target.value) });
    if (type === "entity") return this._entityInput(obj, key, o);
    return h("input", { type: "text", value: obj[key] ?? "", placeholder: o.placeholder, oninput: (e) => upd(e.target.value) });
  }

  // Search box for entities: matches names or ids, shows the current value.
  _entityInput(obj, key, o) {
    const states = this._hass?.states || {};
    const before = obj[key] ?? "";
    const input = h("input", { type: "text", value: before, placeholder: o.placeholder || "Search by name…", autocomplete: "off", spellcheck: false });
    let pop = null, items = [], idx = -1;
    const check = () => input.classList.toggle("bad", !!input.value.trim() && !states[input.value.trim()]);
    const onScroll = (e) => { if (pop && e.target !== pop && !pop.contains(e.target)) close(); };
    const close = () => { if (pop) { pop.remove(); pop = null; window.removeEventListener("scroll", onScroll, true); } };
    const commit = () => {
      close();
      check();
      if ((obj[key] ?? "") !== before && o.rerender) { this._scale = null; this._touch(true); }
    };
    const choose = (id) => { input.value = id; obj[key] = id; this._touch(false); commit(); if (!o.rerender) input.blur(); };
    const mark = () => { if (pop) [...pop.children].forEach((row, i) => row.classList.toggle("cur", i === idx)); };
    const open = () => {
      close();
      const typed = input.value.trim();
      const words = states[typed] ? [] : typed.toLowerCase().split(/\s+/).filter(Boolean);
      const text = (id) => `${id} ${states[id].attributes?.friendly_name || ""}`.toLowerCase();
      let ids = Object.keys(states).filter((id) => !o.domains || !o.domains.length || o.domains.includes(id.split(".")[0]));
      ids = ids.filter((id) => words.every((w) => text(id).includes(w)));
      const rank = (id) => (o.prefer && o.prefer(states[id]) ? 0 : 1);
      ids.sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
      items = ids.slice(0, 60);
      idx = items.indexOf(typed);
      const r = input.getBoundingClientRect();
      const width = Math.max(r.width, 300);
      pop = h("div", { class: "epop", style: `left:${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px;top:${r.bottom + 4}px;width:${width}px;max-height:${Math.max(120, Math.min(280, window.innerHeight - r.bottom - 12))}px` },
        items.length ? items.map((id) => {
          const st = states[id];
          return h("div", { class: "er", onmousedown: (e) => { e.preventDefault(); choose(id); } },
            h("div", { class: "en" }, h("b", {}, st.attributes?.friendly_name || id), h("span", {}, `${st.state}${st.attributes?.unit_of_measurement || ""}`)),
            h("div", { class: "ei" }, id));
        }) : h("div", { class: "er dim" }, "Nothing matches"));
      (input.closest("dialog") || this.shadowRoot).append(pop);
      window.addEventListener("scroll", onScroll, true);
      mark();
    };
    input.addEventListener("focus", open);
    input.addEventListener("input", () => { obj[key] = input.value.trim(); this._touch(false); open(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!pop) open();
        e.preventDefault();
        idx = Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
        mark();
        pop?.children[idx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && pop && items.length) { e.preventDefault(); choose(items[Math.max(0, idx)]); }
      else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(commit, 100));
    check();
    return input;
  }

  _f(label, control, hint, cls) {
    return h("label", { class: "f" + (cls ? " " + cls : "") }, h("span", { class: "fl" }, label, hint && h("small", {}, hint)), control);
  }

  _card(step, title, hint, kids) {
    return h("div", { class: "card bc" },
      h("div", { class: "bh" }, h("span", { class: "step" }, step), h("span", {}, title), hint && h("small", {}, hint)),
      h("div", { class: "sec" }, kids));
  }

  _addonCard(def, kids) {
    const id = def.id;
    const el = h("details", { class: "addon", open: !this._closed.has(id),
      ontoggle: (e) => { if (e.target.open) this._closed.delete(id); else this._closed.add(id); } },
      h("summary", {}, h("span", { class: "sic" }, ic(def.icon, 18)), h("span", {}, def.title), h("small", {}, def.hint),
        h("button", { class: "btn xs danger rm", title: "Remove this from the bar",
          onclick: (e) => { e.preventDefault(); e.stopPropagation(); def.remove(this._draft); this._added.delete(id); this._touch(true); } }, ic("x", 12), "Remove")),
      h("div", { class: "sec" }, kids));
    if (this._flash === id) {
      el.classList.add("flash");
      this._flashEl = el;
    }
    return el;
  }

  // Draggable scale: two handles (empty / full) and a line for the current reading.
  // The scale itself stays put for the whole editing session so nothing jumps
  // under the pointer; it is only rebuilt when a value lands outside it.
  _rangeMap(d, deg, temp) {
    const s = d.source;
    const lo0 = E.num(s.min, 0), hi0 = E.num(s.max, 100);
    const a = Math.min(lo0, hi0), b = Math.max(lo0, hi0);
    let sc = this._scale;
    if (!sc || a < sc.lo || b > sc.hi) {
      const live = this._liveValue(E.normalizeBar(d));
      const need = [a, b].concat(live === null ? [] : [live]);
      let lo, hi, step;
      if (temp) {
        const pad = temp === "F" ? 30 : 15;
        step = temp === "F" ? 1 : 0.5;
        lo = Math.floor((Math.min(...need) - pad) / 10) * 10;
        hi = Math.ceil((Math.max(...need) + pad) / 10) * 10;
      } else {
        const span = b - a || 10;
        const pow = Math.pow(10, Math.floor(Math.log10(span)));
        const grid = pow * (span / pow >= 5 ? 5 : span / pow >= 2 ? 2 : 1) / 2;
        lo = Math.floor((Math.min(...need) - span * 0.5) / grid) * grid;
        hi = Math.ceil((Math.max(...need) + span * 0.5) / grid) * grid;
        if (a >= 0 && lo < 0) lo = 0; // don't offer negatives for things that are never negative
        const raw = (hi - lo) / 200;
        const sp = Math.pow(10, Math.floor(Math.log10(raw)));
        step = Math.max(0.1, sp * (raw / sp >= 5 ? 5 : raw / sp >= 2 ? 2 : 1));
      }
      sc = this._scale = { lo, hi, step };
    }
    const snap = (x) => Math.round(Math.round(x / sc.step) * sc.step * 100) / 100;
    const at = (x) => E.clamp((x - sc.lo) / (sc.hi - sc.lo));
    const pos = (x) => `${at(x) * 100}%`;
    const order = lo0 <= hi0 ? 1 : -1; // handles keep their order; they can't cross
    const fill = h("div", { class: "fl" });
    const hLo = h("div", { class: "hd", title: "Empty" }), hHi = h("div", { class: "hd", title: "Full" });
    const lLo = h("div", { class: "lb" }), lHi = h("div", { class: "lb" });
    const now = h("div", { class: "now" }), nowL = h("div", { class: "nl" });
    const endL = h("div", { class: "ends" }, h("span", {}, `${fmt(sc.lo)}${deg}`), h("span", {}, `${fmt(sc.hi)}${deg}`));
    const el = h("div", { class: "map" }, h("div", { class: "tr" }), fill, now, nowL, lLo, lHi, hLo, hHi, endL);
    const inputs = {};
    const paint = () => {
      const lo = E.num(s.min, 0), hi = E.num(s.max, 100);
      const st = E.normalizeBar(d).color.stops;
      const cols = d.color.mode === "rainbow" ? ["red", "yellow", "lime", "cyan", "blue", "magenta"] : d.color.mode === "solid" ? [st[0].color, st[0].color] : st.map((x) => x.color);
      if (cols.length === 1) cols.push(cols[0]);
      const left = Math.min(lo, hi), right = Math.max(lo, hi);
      fill.style.left = pos(left);
      fill.style.width = `${(at(right) - at(left)) * 100}%`;
      fill.style.background = `linear-gradient(${lo <= hi ? 90 : 270}deg,${cols.join(",")})`;
      hLo.style.left = lLo.style.left = pos(lo);
      hHi.style.left = lHi.style.left = pos(hi);
      // keep the two value labels from sitting on top of each other
      const close = Math.abs(at(hi) - at(lo)) < 0.2;
      const loLeft = at(lo) <= at(hi);
      lLo.style.transform = close ? `translateX(${loLeft ? "-100%" : "0"})` : "";
      lHi.style.transform = close ? `translateX(${loLeft ? "0" : "-100%"})` : "";
      lLo.textContent = ""; lLo.append("Empty ", h("b", {}, `${fmt(lo)}${deg}`));
      lHi.textContent = ""; lHi.append("Full ", h("b", {}, `${fmt(hi)}${deg}`));
      const v = this._liveValue(E.normalizeBar(d));
      now.style.display = nowL.style.display = v === null ? "none" : "";
      if (v !== null) { now.style.left = nowL.style.left = pos(v); nowL.textContent = `now ${fmt(v)}${deg}`; }
      // the scale's end labels step aside when "now" is on top of them
      endL.firstChild.style.visibility = v !== null && at(v) < 0.14 ? "hidden" : "";
      endL.lastChild.style.visibility = v !== null && at(v) > 0.86 ? "hidden" : "";
    };
    const wire = (handle, key, other) => dragHandle(handle,
      (e) => {
        // remember where inside the handle it was grabbed, so it doesn't jump to the pointer
        const r = el.getBoundingClientRect();
        return { grab: (e.clientX - r.left) / r.width - at(E.num(s[key], 0)) };
      },
      (e, ctx) => {
        const r = el.getBoundingClientRect();
        let val = snap(sc.lo + E.clamp((e.clientX - r.left) / r.width - ctx.grab) * (sc.hi - sc.lo));
        const limit = E.num(s[other], 0);
        const sign = key === "min" ? order : -order; // min stays below max (or above, on a reversed scale)
        if (sign > 0) val = Math.min(val, snap(limit - sc.step)); else val = Math.max(val, snap(limit + sc.step));
        if (val === s[key]) return;
        s[key] = val;
        if (inputs[key]) inputs[key].value = val;
        paint();
        for (const fn of this._hooks) fn();
      },
      () => this._pushStrip());
    wire(hLo, "min", "max");
    wire(hHi, "max", "min");
    paint();
    return { el, paint, inputs };
  }

  // 24-hour bar with draggable start/end; the block itself can be dragged too.
  _timeBar(c) {
    const fillA = h("div", { class: "fl" }), fillB = h("div", { class: "fl" });
    const hS = h("div", { class: "hd", title: "Start" }), hE = h("div", { class: "hd", title: "End" });
    const now = h("div", { class: "now", title: "Now" });
    const tS = h("span", { class: "tl" }), tE = h("span", { class: "tl" });
    const el = h("div", { class: "tb" }, h("div", { class: "tr" }), fillA, fillB, now, tS, tE, hS, hE);
    const label = h("b", {});
    const pct = (m) => `${(m / 1440) * 100}%`;
    const paint = () => {
      const st = parseHM(c.start) ?? 0;
      let en = parseHM(c.end) ?? 0;
      if (en === 0) en = 1440;
      const allDay = st === en % 1440;
      const wrap = !allDay && st > en;
      fillA.style.left = allDay ? "0" : pct(st);
      fillA.style.width = allDay ? "100%" : pct((wrap ? 1440 : en) - st);
      fillA.style.borderRadius = wrap ? "7px 0 0 7px" : "7px";
      fillB.style.display = wrap ? "" : "none";
      fillB.style.left = "0";
      fillB.style.width = pct(en);
      fillB.style.borderRadius = "0 7px 7px 0";
      hS.style.left = pct(st);
      hE.style.left = pct(en);
      const d = new Date();
      now.style.left = pct(d.getHours() * 60 + d.getMinutes());
      label.textContent = allDay ? "All day" : `${c.start} – ${c.end}${wrap ? " (overnight)" : ""}`;
      tS.textContent = c.start; tE.textContent = c.end;
      tS.style.left = pct(st); tE.style.left = pct(en);
      const close = Math.abs(en - st) < 200;
      tS.style.transform = close ? `translateX(${st <= en ? "-100%" : "0"})` : "";
      tE.style.transform = close ? `translateX(${st <= en ? "0" : "-100%"})` : "";
    };
    const toMin = (e) => {
      const r = el.getBoundingClientRect();
      return Math.round((E.clamp((e.clientX - r.left) / r.width) * 1440) / 15) * 15;
    };
    dragHandle(hS, null, (e) => { c.start = hhmm(Math.min(toMin(e), 1425)); paint(); });
    dragHandle(hE, null, (e) => { c.end = hhmm(toMin(e)); paint(); });
    for (const f of [fillA, fillB]) {
      dragHandle(f, (e) => ({ at: toMin(e), st: parseHM(c.start) ?? 0, en: parseHM(c.end) ?? 0 }),
        (e, ctx) => { const delta = toMin(e) - ctx.at; c.start = hhmm(ctx.st + delta); c.end = hhmm(ctx.en + delta); paint(); });
    }
    paint();
    return { el, label, paint };
  }

  _conditionBuilder(v) {
    const I = (obj, key, type, o) => this._in(obj, key, type, o);
    const getState = (id) => this._hass?.states?.[id]?.state ?? null;
    const list = h("div", { class: "full", style: "display:flex;flex-direction:column;gap:8px" });
    v.conditions.forEach((c, i) => {
      const dot = h("span", { class: "dot" });
      this._condDots.push(() => {
        const incomplete = c.type !== "time" && !c.entity;
        const ok = !incomplete && condOk(c, getState);
        dot.classList.toggle("yes", ok);
        dot.title = incomplete ? "Choose an entity" : ok ? "True right now" : "Not true right now";
      });
      const remove = h("button", { class: "btn xs danger", title: "Remove this condition",
        onclick: (e) => { e.preventDefault(); v.conditions.splice(i, 1); this._touch(true); } }, ic("x", 12));
      if (c.type === "time") {
        if (!Array.isArray(c.days)) c.days = [];
        const tb = this._timeBar(c);
        const days = h("div", { class: "days" }, DAY_LETTERS.map((letter, day) => {
          const on = () => !c.days.length || c.days.includes(day);
          const btn = h("button", { class: "day" + (on() ? " on" : ""), title: DAY_NAMES[day], onclick: (e) => {
            e.preventDefault();
            const set = new Set(c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6]);
            if (set.has(day)) set.delete(day); else set.add(day);
            c.days = set.size === 7 || set.size === 0 ? [] : [...set].sort();
            this._touch(true);
          } }, letter);
          return btn;
        }));
        list.append(h("div", { class: "cond" },
          h("span", { class: "ttl" }, dot, ic("clock", 16), tb.label), days, remove,
          tb.el, h("div", { class: "tbx" }, ["00", "06", "12", "18", "24"].map((x) => h("span", {}, x)))));
      } else if (c.type === "state") {
        list.append(h("div", { class: "cond" },
          h("span", { class: "ttl", style: "flex:0 0 auto" }, dot, ic("toggle", 16)),
          h("span", { class: "grow", style: "display:flex;min-width:160px" }, I(c, "entity", "entity", {})),
          h("select", { onchange: (e) => { c.negate = e.target.value === "1"; this._touch(false); } },
            h("option", { value: "0", selected: !c.negate }, "is"), h("option", { value: "1", selected: !!c.negate }, "is not")),
          h("span", { style: "width:120px;display:flex" }, I(c, "states", "text", { placeholder: "on, home" })),
          remove));
      } else {
        list.append(h("div", { class: "cond" },
          h("span", { class: "ttl", style: "flex:0 0 auto" }, dot, ic("number", 16)),
          h("span", { class: "grow", style: "display:flex;min-width:160px" }, I(c, "entity", "entity", { domains: ["sensor", "number", "input_number", "counter"] })),
          I(c, "op", "sel", { options: OPS.slice(0, 4) }),
          h("span", { style: "width:90px;display:flex" }, I(c, "value", "text", { placeholder: "value" })),
          remove));
      }
    });
    const add = (type, icon, label) => h("button", { class: "btn xs", onclick: (e) => { e.preventDefault(); v.conditions.push(NEW_CONDITION[type]()); this._touch(true); } }, ic(icon, 13), label);
    return [
      h("div", { class: "rowx full" }, h("span", { class: "dim sm" }, "Add a condition:"), add("time", "clock", "Time of day"), add("state", "toggle", "Entity state"), add("numeric", "number", "Number")),
      v.conditions.length > 1 && h("div", { class: "rowx full" }, h("span", { class: "dim sm" }, "Show when"),
        h("span", { class: "seg" },
          h("button", { class: v.match !== "any" ? "on" : "", onclick: (e) => { e.preventDefault(); v.match = "all"; this._touch(true); } }, "all of these are true"),
          h("button", { class: v.match === "any" ? "on" : "", onclick: (e) => { e.preventDefault(); v.match = "any"; this._touch(true); } }, "any of these is true"))),
      list,
      v.conditions.length > 0 && h("div", { class: "dim sm full" }, "Green dot = true right now. Yellow line = the current time."),
    ];
  }

  // "More options" disclosure for the rarely-needed controls of a section.
  _more(id, kids) {
    const open = this._moreOpen.has(id);
    return [
      h("div", { class: "full" }, h("button", { class: "link", onclick: (e) => {
        e.preventDefault();
        if (open) this._moreOpen.delete(id); else this._moreOpen.add(id);
        this._touch(true);
      } }, open ? "Fewer options ▴" : "More options ▾")),
      ...(open ? kids : []),
    ];
  }

  _liveValue(bar) {
    const s = bar.source;
    if (s.type !== "entity" || !s.entity) return null;
    const st = this._hass?.states?.[s.entity];
    if (!st) return null;
    return E.num(s.attribute ? st.attributes?.[s.attribute] : st.state, null);
  }

  _liveUnit(bar) {
    const st = this._hass?.states?.[bar.source.entity];
    return (!bar.source.attribute && st?.attributes?.unit_of_measurement) || "";
  }

  _renderForm() {
    const d = this._draft;
    const form = this._form;
    const count = this._device.led_count;
    form.innerHTML = "";
    this._lists.innerHTML = "";
    this._hooks = [];
    this._rangeInfo = null;
    this._condDots = [];
    const I = (obj, key, type, o) => this._in(obj, key, type, o);
    const F = (...a) => this._f(...a);
    const effect = (obj) => [
      F("Effect", I(obj, "effect", "sel", { options: EFFECTS })),
      obj.effect !== "solid" && F("Cycle time", I(obj, "period", "range", { min: 0.2, max: 5, step: 0.1, unit: " s" }), "Lower = faster"),
    ];

    // ================= basics =================

    // --- 1. where ---
    const pick = h("canvas");
    this._picker = new StripView(pick, {
      labels: true, max: 22,
      // dragging never changes which way the bar runs; only "Flip direction" does
      onSelect: (lo, hi, done) => {
        const reversed = d.start > d.end;
        d.start = reversed ? hi : lo;
        d.end = reversed ? lo : hi;
        if (done) this._touch(true); else for (const fn of this._hooks) fn();
      },
    });
    const posInfo = h("div", { class: "dim sm full" });
    this._hooks.push(() => { 
      const lo = Math.min(d.start, d.end), hi = Math.max(d.start, d.end);
      const over = this._bars.filter((b, i) => i !== this._draftIndex && Math.min(b.start, b.end) <= hi && Math.max(b.start, b.end) >= lo).map((b) => b.name);
      posInfo.textContent = `LED ${d.start} → ${d.end} · ${hi - lo + 1} LEDs · fills from the green end towards the red end`
        + (over.length ? ` · shares LEDs with ${over.join(", ")}` : "");
    });
    form.append(this._card("1", "Where on the strip", "Drag the middle to move it, or either white end to resize", [
      h("div", { class: "stage full" }, pick), posInfo,
      F("Begins at LED", I(d, "start", "num", { min: 0, max: count - 1 })),
      F("Ends at LED", I(d, "end", "num", { min: 0, max: count - 1 })),
      h("div", { class: "rowx full" },
        h("button", { class: "btn", onclick: (e) => { e.preventDefault(); [d.start, d.end] = [d.end, d.start]; this._touch(true); } }, ic("flip", 15), "Flip direction"),
        h("button", { class: "btn", title: "Blink this range on the real strip so you can find it",
          onclick: (e) => { e.preventDefault(); this.ws("identify", { entry_id: this._entry, leds: E.barLeds(E.normalizeBar(d)) }); } }, ic("find", 15), "Find on strip")),
    ]));

    // --- 2. what it shows ---
    const s = d.source;
    const kindId = this._kind(d);
    const kind = KINDS[kindId];
    const numeric = s.type === "entity" || s.type === "manual";
    const sourceTypes = kind.sources ? SOURCE_TYPES.filter((x) => kind.sources.includes(x[0]) || x[0] === s.type) : SOURCE_TYPES;
    const isTemp = kind.range === "temp";
    const deg = isTemp ? "°" : "";
    const needsAttr = s.type === "entity" && (!!s.attribute || (!!s.entity && !/^(sensor|number|input_number|counter)\./.test(s.entity)));
    // 0–100 sources don't need a range unless the user asks for one
    const plainPercent = kind.range === "percent" && Number(s.min) === 0 && Number(s.max) === 100 && !this._showRange;
    const rangeNow = h("div", { class: "dim sm full" });
    let rangeMap = null;
    if (numeric && !plainPercent) {
      rangeMap = this._rangeMap(d, deg, isTemp ? this._tempUnit(d) : "");
      let last = "";
      this._rangeInfo = () => {
        const bar = E.normalizeBar(d);
        const v = this._liveValue(bar);
        const unit = deg || this._liveUnit(bar);
        const lo = E.num(s.min, 0), hi = E.num(s.max, 100);
        let text = "";
        if (lo === hi) text = "Empty and full are the same number, so the bar can't fill. Drag one of the handles.";
        else if (v !== null) text = `${fmt(v)}${unit} right now lights ${fmt(E.valueToFrac(bar, v) * 100)} % of the bar.`;
        if (lo > hi) text += " Empty is the higher number, so the bar grows as the reading falls.";
        if (text !== last) { last = text; rangeNow.textContent = text; }
        rangeMap.paint();
      };
    }
    const setRange = (lo, hi) => { s.min = lo; s.max = hi; this._touch(true); };
    // typed values update the scale live; leaving the box re-fits the scale if needed
    const rangeBox = (key) => {
      const box = h("input", { type: "number", step: "any", value: s[key],
        oninput: (e) => { if (e.target.value !== "" && !Number.isNaN(Number(e.target.value))) { s[key] = Number(e.target.value); this._touch(false); } },
        onchange: () => this._touch(true) });
      if (rangeMap) rangeMap.inputs[key] = box;
      return box;
    };
    const live = this._liveValue(E.normalizeBar(d));
    const presets = [];
    if (numeric && !plainPercent) {
      if (isTemp) {
        const unit = this._tempUnit(d);
        for (const [name, lo, hi] of TEMP_PRESETS[unit]) presets.push([`${name} ${lo}–${hi}°`, lo, hi]);
        if (live !== null) {
          const half = unit === "F" ? 10 : 5;
          presets.push([`Around now ±${half}°`, Math.round(live) - half, Math.round(live) + half]);
        }
      } else if (!(Number(s.min) === 0 && Number(s.max) === 100)) presets.push(["0–100", 0, 100]);
    }
    form.append(this._card("2", isTemp ? "Which temperature" : "What it shows", null, [
      sourceTypes.length > 1 && F("Follows", I(s, "type", "sel", { options: sourceTypes }), null, "full"),
      s.type === "entity" && F(isTemp ? "Temperature sensor" : "Entity", I(s, "entity", "entity", { rerender: true,
          prefer: kindId === "temperature" || kindId === "battery" ? (st) => st.attributes?.device_class === kindId : null,
          domains: ["sensor", "number", "input_number", "counter", "climate", "light", "fan", "media_player", "cover", "weather", "humidifier", "water_heater", "vacuum"] }),
        s.entity ? (this._hass?.states?.[s.entity]?.attributes?.friendly_name || (this._hass?.states?.[s.entity] ? null : "No entity with this id")) : "Type part of its name", "full"),
      needsAttr && F("Attribute", I(s, "attribute", "text", { placeholder: "(state)" }), "e.g. current_temperature", "full"),
      s.type === "timer" && F("Timer", I(s, "entity", "entity", { domains: ["timer"], rerender: true }), null, "full"),
      s.type === "timestamp" && F("Finish time", I(s, "end_entity", "entity", { domains: ["sensor", "input_datetime"], prefer: (st) => st.attributes?.device_class === "timestamp" }), "A sensor that says when it will be done", "full"),
      s.type === "timestamp" && this._more("finish", [
        F("Start time", I(s, "start_entity", "entity", { domains: ["sensor", "input_datetime"], prefer: (st) => st.attributes?.device_class === "timestamp" }), "Optional sensor for when it began", "full"),
        F("Usual run time (minutes)", h("input", { type: "number", min: 0, step: 5, value: Math.round(E.num(s.duration, 0) / 60),
          oninput: (e) => { if (e.target.value !== "") { s.duration = Math.max(0, Number(e.target.value)) * 60; this._touch(false); } } }),
          "Used when there is no start time. 0 = measure from when the finish time first appears"),
      ]),
      s.type === "window" && F("Starts at", I(s, "window_start", "time")),
      s.type === "window" && F("Ends at", I(s, "window_end", "time")),
      s.type === "manual" && h("div", { class: "dim sm full" },
        kindId === "countdown"
          ? "Start it from an automation with wled_bars.start_timer (bar, duration)."
          : "Drive this bar from automations: wled_bars.set_value (bar, value) or wled_bars.start_timer (bar, duration)."),
      numeric && !plainPercent && [
        h("div", { class: "sub" }, isTemp ? "Scale – drag the two handles to the coldest and hottest you want to show" : "Scale – drag the handles to the readings that mean empty and full"),
        rangeMap.el,
        rangeNow,
        presets.length > 0 && h("div", { class: "chips full" }, presets.map(([label, lo, hi]) =>
          h("button", { class: "chip", style: "padding:4px 10px", onclick: (e) => { e.preventDefault(); setRange(lo, hi); } }, label))),
        F(isTemp ? "Coldest (empty bar)" : "Empty at", rangeBox("min")),
        F(isTemp ? "Hottest (full bar)" : "Full at", rangeBox("max")),
      ],
      numeric && plainPercent && h("div", { class: "dim sm full" }, "Uses 0–100 as empty to full. ",
        h("button", { class: "link", onclick: (e) => { e.preventDefault(); this._showRange = true; this._touch(true); } }, "Use a different scale")),
      !kind.noDrain && F("Drain instead of fill", I(s, "invert", "tog"), "Starts full and empties (countdown style)"),
    ]));

    // --- 3. colour ---
    const c = d.color;
    const grad = h("div", { class: "grad full" });
    const stopsBox = h("div", { class: "full", style: "display:flex;flex-direction:column;gap:6px" });
    const multi = c.mode !== "solid" && c.mode !== "rainbow";
    const paintGrad = () => {
      const st = E.normalizeBar(d).color.stops;
      if (c.mode === "rainbow") grad.style.background = "linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)";
      else if (c.mode === "solid" || st.length === 1) grad.style.background = st[0].color;
      else if (c.mode === "steps" || (c.mode === "value" && !c.blend))
        grad.style.background = `linear-gradient(90deg,${st.map((x, i) => `${x.color} ${x.pos}%,${x.color} ${i + 1 < st.length ? st[i + 1].pos : 100}%`).join(",")})`;
      else grad.style.background = `linear-gradient(90deg,${st.map((x) => `${x.color} ${x.pos}%`).join(",")})`;
    };
    this._hooks.push(paintGrad);
    if (c.mode !== "rainbow") {
      (multi ? c.stops : c.stops.slice(0, 1)).forEach((stop, i) => {
        const val = h("span", { class: "dim sm", style: "width:70px;text-align:right" });
        const setVal = () => { val.textContent = numeric ? `${Math.round(E.fracToValue(E.normalizeBar(d), stop.pos / 100) * 10) / 10}${deg}` : ""; };
        this._hooks.push(setVal);
        stopsBox.append(h("div", { class: "rowx" },
          I(stop, "color", "color"),
          multi && h("span", { class: "grow" }, I(stop, "pos", "range", { min: 0, max: 100, unit: " %" })),
          multi && val,
          multi && c.stops.length > 1 && h("button", { class: "btn xs danger", onclick: (e) => { e.preventDefault(); c.stops.splice(i, 1); this._touch(true); } }, ic("x", 12))));
      });
    }
    form.append(this._card("3", "Colour", null, [
      F("Colour style", I(c, "mode", "sel", { options: [
        ["solid", "One colour"], ["gradient", "Gradient along the bar"], ["steps", "Colour zones along the bar"],
        ["value", "Whole bar changes colour with the value"], ["rainbow", "Rainbow"]] }), null, "full"),
      grad,
      c.mode !== "rainbow" && stopsBox,
      multi && h("div", { class: "rowx full" },
        h("button", { class: "btn xs", onclick: (e) => { e.preventDefault(); c.stops.push({ pos: 50, color: "#ffffff" }); this._touch(true); } }, "+ Add colour stop"),
        h("span", { class: "dim sm" }, "Presets:"),
        h("div", { class: "chips" }, PALETTES.map(([name, cols]) =>
          h("button", { class: "chip", onclick: (e) => { e.preventDefault(); c.stops = evenStops(cols); this._touch(true); } },
            h("i", { style: `background:linear-gradient(90deg,${cols.concat(cols.length === 1 ? cols : []).join(",")})` }), name)))),
      c.mode === "gradient" && F("Gradient spans", I(c, "span", "sel", { options: [["bar", "The whole bar"], ["fill", "The lit part only"]] })),
      c.mode === "value" && F("Blend between colours", I(c, "blend", "tog"), "Off = hard switch at each stop"),
      c.mode === "rainbow" && F("Rainbow length", I(c, "rainbow_span", "range", { min: 30, max: 720, step: 10, unit: "°" })),
      c.mode === "rainbow" && F("Rainbow scroll speed", I(c, "rainbow_speed", "range", { min: -180, max: 180, step: 5 })),
      F("Bar brightness", I(d, "brightness", "range", { min: 1, max: 100, unit: " %" })),
    ]));

    // ================= add-ons =================

    const t = d.tip, tr = d.track, tk = d.ticks, a = d.animation, oc = d.on_complete, ua = d.unavailable, v = d.visibility;
    const cap = (side, label) => {
      const cp = d.caps[side];
      return [
        h("div", { class: "sub" }, label),
        F("LEDs", I(cp, "count", "num", { min: 0, max: 10, structural: true }), "0 = none"),
        cp.count > 0 && [F("Colour", I(cp, "color", "color")), F("Brightness", I(cp, "level", "range", { min: 1, max: 100, unit: " %" })), ...effect(cp)],
      ];
    };
    const bodies = {
      tip: () => [
        F("Tip size (LEDs)", I(t, "count", "num", { min: 1, max: 20 })),
        ...effect(t),
        F("Match the bar colour", I(t, "auto", "tog"), "A brighter tint of the bar"),
        !t.auto && F("Tip colour", I(t, "color", "color")),
        ...this._more("tip", [
          F("Position", I(t, "position", "sel", { options: [["inside", "On the last lit LEDs"], ["ahead", "Just ahead of the bar"]] })),
          t.effect !== "solid" && F("Between flashes", I(t, "off", "sel", { options: [["under", "Bar colour"], ["dark", "Dark"]] })),
          F("Fade out along the tip", I(t, "taper", "tog"), "Comet-style tail"),
          F("Show at 0 %", I(t, "show_at_zero", "tog")),
          F("Hide at 100 %", I(t, "hide_when_full", "tog")),
        ]),
      ],
      caps: () => [...cap("start", "Beginning"), ...cap("end", "End")],
      track: () => [
        F("Unlit LEDs show", I(tr, "mode", "sel", { options: [["dim", "A dim version of the bar colour"], ["color", "A fixed colour"]] })),
        tr.mode === "color" && F("Colour", I(tr, "color", "color")),
        F("Brightness", I(tr, "level", "range", { min: 1, max: 50, unit: " %" })),
      ],
      ticks: () => [
        F("A mark every", I(tk, "every", "sel", { options: [["50", "50 %"], ["25", "25 %"], ["20", "20 %"], ["10", "10 %"]] })),
        F("Mark colour", I(tk, "color", "color")),
        F("Keep marks visible when lit", I(tk, "over", "tog")),
      ],
      markers: () => {
        const mk = h("div", { class: "full", style: "display:flex;flex-direction:column;gap:8px" });
        d.markers.forEach((m, i) => {
          const where = h("span", { class: "dim sm" });
          this._hooks.push(() => {
            const bar = E.normalizeBar(d);
            const mv = m.type === "entity" ? E.num(this._hass?.states?.[m.entity]?.state, null) : E.num(m.value, null);
            where.textContent = mv === null ? "" : `= ${fmt(E.valueToFrac(bar, mv) * 100)} % along`;
          });
          mk.append(h("div", { class: "item" },
            I(m, "type", "sel", { options: [["value", "At reading"], ["entity", "Follows entity"]] }),
            m.type === "value" ? I(m, "value", "num", { step: "any" }) : h("span", { class: "grow" }, I(m, "entity", "entity", { domains: ["sensor", "number", "input_number", "climate"] })),
            where,
            I(m, "color", "color"), I(m, "effect", "sel", { options: EFFECTS }),
            h("button", { class: "btn xs danger", onclick: (e) => { e.preventDefault(); d.markers.splice(i, 1); this._touch(true); } }, ic("x", 12))));
        });
        return [
          mk,
          h("div", { class: "full" }, h("button", { class: "btn xs", onclick: (e) => { e.preventDefault(); d.markers.push(newMarker(d)); this._touch(true); } }, "+ Add another marker"),
            h("span", { class: "dim sm", style: "margin-left:8px" }, "One LED pinned at a reading, in the same units as the scale above.")),
        ];
      },
      peak: () => [
        F("Peak colour", I(d.peak, "color", "color")),
        F("Hold for", I(d.peak, "hold", "range", { min: 0, max: 60, unit: " s" })),
      ],
      anim: () => [
        F("Animation", I(a, "type", "sel", { options: [["breathe", "Breathe"], ["flow", "Flow towards the tip"], ["scan", "Scanner sweep (charging)"], ["shimmer", "Shimmer"]] })),
        F("Cycle time", I(a, "period", "range", { min: 0.3, max: 10, step: 0.1, unit: " s" })),
        F("Strength", I(a, "depth", "range", { min: 0, max: 100, unit: " %" })),
        (a.type === "flow" || a.type === "scan") && F("Wave size (LEDs)", I(a, "size", "range", { min: 1, max: 30 })),
      ],
      rules: () => {
        const rl = h("div", { class: "full", style: "display:flex;flex-direction:column;gap:8px" });
        d.rules.forEach((r, i) => rl.append(h("div", { class: "item", style: "flex-direction:column;align-items:stretch" },
          h("div", { class: "rowx" },
            h("span", { class: "dim", style: "width:38px" }, "When"),
            I(r, "source", "sel", { options: [["percent", "the fill %"], ["value", isTemp ? "the temperature" : "the reading"], ["entity", "another entity"]] }),
            r.source === "entity" && h("span", { class: "grow", style: "display:flex;min-width:160px" }, I(r, "entity", "entity", {})),
            I(r, "op", "sel", { options: OPS }),
            h("span", { style: "width:80px;display:flex" }, I(r, "value", "text", { placeholder: "value" })),
            h("span", { class: "grow" }),
            h("button", { class: "btn xs danger", title: "Remove this alert", onclick: (e) => { e.preventDefault(); d.rules.splice(i, 1); this._touch(true); } }, ic("x", 12))),
          h("div", { class: "rowx" },
            h("span", { class: "dim", style: "width:38px" }, "then"),
            I(r, "effect", "sel", { options: EFFECTS }),
            r.effect !== "solid" && h("span", { class: "rowx dim sm", style: "flex-wrap:nowrap" }, "every", h("span", { style: "width:58px;display:flex" }, I(r, "period", "num", { min: 0.2, max: 10, step: 0.1 })), "s"),
            h("label", { class: "rowx sm" }, I(r, "use_color", "tog"), "in colour"),
            r.use_color && I(r, "color", "color"),
            h("span", { class: "dim sm" }, "on"),
            I(r, "scope", "sel", { options: [["fill", "the lit part"], ["all", "the whole bar"]] })))));
        return [
          rl,
          h("div", { class: "full" }, h("button", { class: "btn xs", onclick: (e) => { e.preventDefault(); d.rules.push(clone(E.DEFAULT_RULE)); this._touch(true); } }, "+ Add another alert"),
            h("span", { class: "dim sm", style: "margin-left:8px" }, "When several alerts are true, the last one in the list wins.")),
        ];
      },
      done: () => [
        F("When it reaches 100 %", I(oc, "effect", "sel", { options: [["none", "Nothing special"], ["flash", "Flash"], ["pulse", "Pulse"], ["rainbow", "Rainbow"], ["sparkle", "Sparkle"]] })),
        oc.effect !== "none" && oc.effect !== "rainbow" && F("Colour", I(oc, "color", "color")),
        oc.effect !== "none" && F("For", I(oc, "duration", "range", { min: 1, max: 60, unit: " s" })),
        F("Afterwards", I(oc, "then", "sel", { options: [["hold", "Stay full"], ["hide", "Hide the bar"]] })),
      ],
      unavail: () => [
        h("div", { class: "dim sm full" }, "Without this, the bar simply hides while its source is unavailable."),
        F("Warning colour", I(ua, "color", "color"), "Slow pulse across the bar"),
      ],
      vis: () => [
        ...this._conditionBuilder(v),
        F("Hide at 0 %", I(v, "hide_at_zero", "tog")),
        s.type !== "entity" && F("Hide when idle", I(v, "hide_when_idle", "tog"), "Timer not running, outside the time window…"),
      ],
      fill: () => [
        F("Fill grows from", I(d, "fill_from", "sel", { options: [["start", "The beginning"], ["end", "The end"], ["center", "The centre outwards"], ["edges", "Both ends inwards"]] })),
        F("Glide to new values", I(d, "smoothing", "range", { min: 0, max: 5, step: 0.1, unit: " s" }), "0 = jump straight there"),
        F("Smooth leading edge", I(d, "subpixel", "tog"), "Dims the last LED for in-between values"),
      ],
    };

    const isOn = (def) => def.active(d) || this._added.has(def.id);
    const on = ADDONS.filter(isOn);
    const off = ADDONS.filter((def) => !isOn(def) && !kind.hide.includes(def.id));
    this._flashEl = null;
    if (on.length) form.append(h("div", { class: "divider" }, h("span", {}, `Added to this bar · ${on.length}`)));
    for (const def of on) form.append(this._addonCard(def, bodies[def.id]()));
    form.append(h("div", { class: "card bc tray" },
      h("div", { class: "bh" }, h("span", { class: "step plus" }, "+"), h("span", {}, on.length ? "Add more" : "Add extras"),
        h("small", {}, "Optional. Each one can be removed again.")),
      off.length
        ? h("div", { class: "addgrid" }, off.map((def) =>
            h("button", { class: "add", onclick: (e) => {
              e.preventDefault();
              def.add(d);
              this._added.add(def.id);
              this._closed.delete(def.id);
              this._flash = def.id;
              this._touch(true);
            } }, h("span", { class: "ic" }, ic(def.icon, 22)), h("span", {}, h("b", {}, def.title), h("small", {}, def.hint)))))
        : h("div", { class: "dim sm", style: "padding:0 16px 16px" }, "Everything is already on this bar.")));

    for (const fn of this._hooks) fn();
    if (this._rangeInfo) this._rangeInfo();
    if (this._flashEl) {
      const el = this._flashEl;
      requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
    this._flash = null;
  }

  // ----- preset defaults (shared by every strip) -----

  _presetsDialog() {
    const draft = clone(this._presets || {});
    let current = TEMPLATES[0];
    const dlg = h("dialog");
    const draw = () => {
      dlg.innerHTML = "";
      const key = presetKey(current);
      const chosen = presetAddons(current, draft);
      const hide = (KINDS[current.bar.kind || ""] || KINDS[""]).hide;
      const custom = Array.isArray(draft[key]);
      dlg.append(
        h("div", { style: "padding:16px 16px 4px" },
          h("h2", { style: "margin:0 0 4px" }, "Preset defaults"),
          h("div", { class: "dim sm" }, "Choose which extras a new bar starts with under “Added to this bar”. Applies to every strip; bars you already made are not changed.")),
        h("div", { class: "chips", style: "padding:10px 16px 4px" }, TEMPLATES.map((t) =>
          h("button", { class: "chip" + (t === current ? " sel" : ""), style: "padding:5px 12px", onclick: () => { current = t; draw(); } },
            ic(t.icon, 14), t.name.replace(/ \(.*\)| \/ job|….*/g, "")))),
        h("div", { class: "addgrid", style: "grid-template-columns:repeat(auto-fill,minmax(180px,1fr));padding-top:10px" },
          ADDONS.filter((a) => !hide.includes(a.id)).map((a) => {
            const on = chosen.includes(a.id);
            return h("button", { class: "add" + (on ? " sel" : ""), onclick: () => {
              draft[key] = on ? chosen.filter((x) => x !== a.id) : chosen.concat(a.id);
              draw();
            } }, h("span", { class: "ic" }, ic(a.icon, 20)), h("span", {}, h("b", {}, a.title)), h("span", { class: "tick" }, on ? "✓" : ""));
          })),
        h("div", { class: "rowx", style: "padding:0 16px 16px" },
          custom ? h("button", { class: "link", onclick: () => { delete draft[key]; draw(); } }, "Reset this preset to built-in")
            : h("span", { class: "dim sm" }, "Built-in selection"),
          h("span", { class: "grow" }),
          h("button", { class: "btn", onclick: () => dlg.close() }, "Cancel"),
          h("button", { class: "btn pri", onclick: async () => {
            try { this._presets = (await this.ws("presets_save", { presets: draft })) || draft; } catch (_e) { this._presets = draft; }
            dlg.close();
          } }, "Save")));
    };
    dlg.addEventListener("close", () => dlg.remove());
    this.shadowRoot.append(dlg);
    draw();
    dlg.showModal();
  }

  // ----- device settings -----

  _settingsDialog() {
    const st = clone(this._settings);
    const dlg = h("dialog");
    const draw = () => {
      dlg.innerHTML = "";
      this._lists.innerHTML = "";
      const upd = (obj, key, type, o) => {
        const el = this._in(obj, key, type, o);
        return el;
      };
      const F = (...a) => this._f(...a);
      const segs = (this._device.segments || []).map((sg) => [String(sg.id), `Segment ${sg.id}${sg.name ? " – " + sg.name : ""} (LED ${sg.start}–${sg.stop - 1})`]);
      if (!segs.some((x) => x[0] === String(st.segment))) segs.unshift([String(st.segment), `Segment ${st.segment}`]);
      dlg.append(
        h("div", { style: "padding:16px 16px 4px" }, h("h2", { style: "margin:0" }, `${this._device.name} – device settings`)),
        h("div", { class: "sec" },
          F("Overall brightness", upd(st, "brightness", "range", { min: 1, max: 100, unit: " %" })),
          F("How frames are sent", upd(st, "transport", "sel", { options: [["json", "Shared with WLED effects (≈5 fps)"], ["ddp", "Smooth realtime (takes over the strip)"]] })),
          st.transport === "json" && F("WLED segment", upd(st, "segment", "sel", { options: segs }), "LED numbers count from this segment's start"),
          st.transport === "json" && F("When no bar is showing", upd(st, "idle", "sel", { options: [["release", "Give the LEDs back to WLED's effect"], ["black", "Leave bar LEDs off"]] })),
          F("Frames per second", upd(st, "fps", "num", { min: 0, max: 60 }), "0 = automatic"),
          F("Turn the strip on when a bar appears", upd(st, "auto_power", "tog")),
          h("div", { class: "sub" }, "Night dimming"),
          F("Dim at night", upd(st.night, "mode", "sel", { options: [["off", "Never"], ["schedule", "On a schedule"], ["entity", "While an entity is on"]] })),
          st.night.mode === "schedule" && F("From", upd(st.night, "start", "time")),
          st.night.mode === "schedule" && F("Until", upd(st.night, "end", "time")),
          st.night.mode === "entity" && F("Entity", upd(st.night, "entity", "entity", { domains: ["binary_sensor", "input_boolean", "switch", "sun", "schedule"] })),
          st.night.mode !== "off" && F("Dim to", upd(st.night, "level", "range", { min: 1, max: 100, unit: " %" }))),
        h("div", { class: "rowx", style: "padding:0 16px 16px;justify-content:flex-end" },
          h("button", { class: "btn", onclick: () => dlg.close() }, "Cancel"),
          h("button", { class: "btn pri", onclick: async () => {
            st.segment = Number(st.segment);
            await this._saveSettings(st);
            dlg.close();
            this._render();
          } }, "Save")),
        this._lists
      );
    };
    // Reuse the form helpers: structural changes redraw the dialog instead of the bar form.
    const realTouch = this._touch;
    const realLists = this._lists;
    this._lists = h("div", { style: "display:none" });
    this._touch = (structural) => { if (structural) draw(); };
    dlg.addEventListener("close", () => { this._touch = realTouch; this._lists = realLists; dlg.remove(); });
    this.shadowRoot.append(dlg);
    draw();
    dlg.showModal();
  }

  // ----- animation frame -----

  _simCtx(bar, now) {
    const sim = this._sim;
    if (sim.play) {
      if (!sim.t0) sim.t0 = now;
      const cycle = 9;
      const tt = (now - sim.t0) % cycle;
      const prev = sim.frac;
      sim.frac = Math.min(1, tt / 6.5);
      if (sim.frac >= 1 && prev < 1) sim.completeAt = now;
      if (sim.frac < 1) sim.completeAt = null;
      this._simRange.value = Math.round(sim.frac * 1000);
    }
    const inv = bar.source.invert;
    const liveValue = sim.live && !sim.play && !sim.unavailable ? this._liveValue(bar) : null;
    if (liveValue !== null) {
      const lf = E.valueToFrac(bar, liveValue);
      const next = inv ? 1 - lf : lf;
      if (next !== sim.frac) {
        sim.frac = next;
        this._simRange.value = Math.round(next * 1000);
        this._pushStrip();
      }
    }
    const frac = sim.frac;
    const value = liveValue !== null ? liveValue : E.fracToValue(bar, inv ? 1 - frac : frac);
    const states = this._hass?.states || {};
    const getState = (id) => (states[id] ? states[id].state : null);
    const markers = bar.markers.map((m) => {
      const mv = m.type === "entity" ? E.num(getState(m.entity), null) : E.num(m.value, null);
      if (mv === null) return null;
      const mf = E.valueToFrac(bar, mv);
      return inv ? 1 - mf : mf;
    });
    if (bar.peak.enabled) {
      if (this._simPeak === undefined || frac >= this._simPeak) { this._simPeak = frac; this._simPeakAt = now; }
      else if (now - this._simPeakAt > E.num(bar.peak.hold, 5)) this._simPeak = Math.max(frac, this._simPeak - 0.007);
    }
    const numeric = bar.source.type === "entity" || bar.source.type === "manual";
    const unit = numeric ? this._liveUnit(bar) : "";
    this._simOut.textContent = sim.unavailable ? "unavailable"
      : (liveValue !== null ? "live · " : "") + `${fmt(frac * 100)} %` + (numeric ? `  ·  ${fmt(value)}${unit}` : "");
    return {
      t: now, frac, brightness: 1,
      rule: E.pickRule(bar, value, frac * 100, getState),
      markers,
      peak: bar.peak.enabled ? this._simPeak : null,
      complete_age: sim.completeAt !== null ? now - sim.completeAt : null,
      unavailable: sim.unavailable,
    };
  }

  _frame(now) {
    if (!this._device) return;
    if (this._view === "edit" && this._draft && this._preview) {
      const bar = E.normalizeBar(this._draft);
      const px = E.renderBar(bar, this._simCtx(bar, now));
      this._preview.pixels = px;
      this._preview.draw();
      if (this._rangeInfo) this._rangeInfo();
      if (this._condDots && this._condDots.length && now - (this._condAt || 0) > 1) {
        this._condAt = now;
        for (const fn of this._condDots) fn();
      }
      if (this._picker) {
        const n = this._device.led_count;
        const all = new Array(n).fill([0, 0, 0]);
        E.barLeds(bar).forEach((idx, i) => { if (idx < n) all[idx] = px[i]; });
        this._picker.pixels = all;
        this._picker.sel = { start: bar.start, end: bar.end };
        this._picker.ranges = this._bars
          .filter((_b, i) => i !== this._draftIndex)
          .map((b) => ({ start: b.start, end: b.end, label: b.name, color: "#566079" }));
        this._picker.draw();
      }
      return;
    }
    if (this._view === "list" && this._liveStrip && (this._liveDirty || this._lastW !== this.clientWidth)) {
      this._liveDirty = false;
      this._lastW = this.clientWidth;
      const n = this._device.led_count;
      const live = this._live.pixels;
      this._liveStrip.pixels = Array.from({ length: n }, (_x, i) => live[i] || [0, 0, 0]);
      this._liveStrip.draw();
      if (this._offlineEl) this._offlineEl.style.display = this._live.online ? "none" : "";
      for (const strip of this._strips) {
        if (!strip.barRef) continue;
        const bar = strip.barRef;
        strip.pixels = E.barLeds(bar).map((idx) => live[idx] || [0, 0, 0]);
        strip.draw();
        const st = this._live.bars[bar.id];
        if (st) {
          strip.pctEl.textContent = st.state === "active" ? `${fmt(st.percent)} %` : "–";
          strip.pillEl.textContent = !bar.enabled ? "disabled" : st.state === "unavailable" ? "unavailable" : st.visible ? "showing" : "hidden";
          strip.pillEl.className = "pill" + (st.visible ? " live" : st.state === "unavailable" ? " bad" : "");
        }
      }
    }
  }
}

if (!customElements.get("wled-bars-panel")) customElements.define("wled-bars-panel", WledBarsPanel);

// ---------- dashboard card ----------

class WledBarsCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
  }
  static getStubConfig() {
    return {};
  }
  getCardSize() {
    return 2;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._started && this.isConnected) this._start();
  }

  connectedCallback() {
    if (this._hass && !this._started) this._start();
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub();
    this._unsub = null;
    this._started = false;
    if (this._ro) this._ro.disconnect();
  }

  async _start() {
    this._started = true;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = "";
    const body = h("div", { style: "padding:12px 16px 16px" });
    root.append(
      h("style", {}, `.stage{background:#0a0c11;border-radius:12px;padding:12px 10px 6px}canvas{display:block;width:100%}
        .r{display:flex;justify-content:space-between;gap:8px;padding:4px 2px;font-size:13px}.d{color:var(--secondary-text-color)}
        a{color:var(--primary-color);text-decoration:none;font-size:12px}`),
      h("ha-card", { header: this._config.title }, body)
    );
    try {
      const devices = await this._hass.callWS({ type: `${DOMAIN}/devices` });
      const dev = devices.find((d) => d.entry_id === this._config.entry_id || d.name === this._config.device) || devices[0];
      if (!dev) {
        body.append(h("div", { class: "d" }, "No WLED Bars device configured."));
        return;
      }
      const data = await this._hass.callWS({ type: `${DOMAIN}/get`, entry_id: dev.entry_id });
      const canvas = h("canvas");
      const strip = new StripView(canvas, { max: 20 });
      strip.pixels = new Array(dev.led_count).fill([0, 0, 0]);
      const rows = {};
      body.append(h("div", { class: "stage" }, canvas));
      if (this._config.show_bars !== false) {
        for (const bar of data.bars) {
          rows[bar.id] = h("span", {}, "–");
          body.append(h("div", { class: "r" }, h("span", {}, bar.name), rows[bar.id]));
        }
      }
      body.append(h("div", { style: "text-align:right;margin-top:6px" }, h("a", { href: "/wled-bars" }, "Edit bars")));
      this._ro = new ResizeObserver(() => strip.draw());
      this._ro.observe(canvas);
      const unsub = await this._hass.connection.subscribeMessage(
        (msg) => {
          const px = hexToPixels(msg.leds);
          strip.pixels = Array.from({ length: dev.led_count }, (_x, i) => px[i] || [0, 0, 0]);
          strip.draw();
          for (const st of msg.bars || []) {
            if (st && rows[st.id]) rows[st.id].textContent = st.state === "active" ? `${fmt(st.percent)} %` : st.state === "unavailable" ? "unavailable" : "idle";
          }
        },
        { type: `${DOMAIN}/subscribe`, entry_id: dev.entry_id }
      );
      if (this.isConnected) this._unsub = unsub;
      else unsub();
    } catch (err) {
      body.append(h("div", { class: "d" }, `WLED Bars: ${err?.message || err}`));
    }
  }
}

if (!customElements.get("wled-bars-card")) customElements.define("wled-bars-card", WledBarsCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "wled-bars-card")) {
  window.customCards.push({
    type: "wled-bars-card",
    name: "WLED Bars",
    description: "Live view of the progress and status bars on a WLED strip.",
  });
}
