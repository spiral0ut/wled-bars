// WLED Bars frontend: the sidebar editor panel and the dashboard card.
// Plain web components, no build step. The preview uses the same render
// engine as the backend (engine.js mirrors engine.py).
import * as E from "./engine.js";

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
const fmt = (v) => (Math.round(v * 100) / 100).toString();
const hexToPixels = (hex) => {
  const out = [];
  for (let i = 0; i + 5 < hex.length; i += 6) {
    out.push([parseInt(hex.substr(i, 2), 16), parseInt(hex.substr(i + 2, 2), 16), parseInt(hex.substr(i + 4, 2), 16)]);
  }
  return out;
};

// ---------- options ----------

const EFFECTS = [["solid", "Steady"], ["blink", "Blink"], ["pulse", "Pulse (smooth)"], ["strobe", "Strobe (short flash)"]];
const OPS = [[">=", "≥"], [">", ">"], ["<=", "≤"], ["<", "<"], ["==", "is"], ["!=", "is not"]];
const SOURCE_TYPES = [
  ["entity", "Number from an entity (sensor, battery, temperature…)"],
  ["timer", "Timer helper (timer.*)"],
  ["timestamp", "Until a finish time (timestamp sensor)"],
  ["window", "Time of day (daily window)"],
  ["manual", "Manual / automation (services)"],
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
    icon: "🖨️", name: "Print / job progress",
    desc: "0–100 % sensor, glowing tip, rainbow when done.",
    bar: {
      name: "Print progress",
      color: { mode: "gradient", stops: evenStops(["#00c8ff", "#7a5cff"]) },
      tip: { enabled: true, count: 1, effect: "pulse", period: 1.2, color: "#ffffff" },
      caps: { start: { count: 1, color: "#00c8ff", level: 30 }, end: { count: 1, color: "#7a5cff", level: 30 } },
      animation: { type: "flow", period: 2.5, depth: 35, size: 8 },
      on_complete: { effect: "rainbow", duration: 8, then: "hide" },
      visibility: { hide_at_zero: true },
    },
  },
  {
    icon: "🌡️", name: "Temperature gauge",
    desc: "Whole bar changes colour with the value; marker for a setpoint.",
    bar: {
      name: "Temperature",
      source: { type: "entity", min: 15, max: 30 },
      color: { mode: "value", blend: true, stops: evenStops(["#2a6bff", "#18e0c0", "#ffd000", "#ff2a2a"]) },
      tip: { enabled: false },
      track: { mode: "color", color: "#ffffff", level: 3 },
      ticks: { every: 25, color: "#303030" },
      markers: [{ type: "value", value: 21, color: "#ffffff" }],
      smoothing: 2,
      unavailable: { mode: "show", color: "#ff3030" },
    },
  },
  {
    icon: "🔋", name: "Battery level",
    desc: "Red → green zones, blinks red when low.",
    bar: {
      name: "Battery",
      color: { mode: "steps", stops: [{ pos: 0, color: "#ff2a2a" }, { pos: 20, color: "#ff9a00" }, { pos: 50, color: "#18e060" }] },
      tip: { enabled: false },
      rules: [{ source: "percent", op: "<", value: "15", color: "#ff0000", use_color: true, effect: "blink", period: 1, scope: "fill" }],
    },
  },
  {
    icon: "⏲️", name: "Countdown timer",
    desc: "Drains as a timer helper runs down; flashes when finished.",
    bar: {
      name: "Timer",
      source: { type: "timer", invert: true },
      color: { mode: "value", blend: true, stops: evenStops(["#ff2a2a", "#ffd000", "#18e060"]) },
      tip: { enabled: true, count: 1, effect: "blink", period: 1, color: "#ffffff", off: "under" },
      on_complete: { effect: "flash", color: "#ff2a2a", duration: 6, then: "hide" },
      smoothing: 0.3,
    },
  },
  {
    icon: "🧺", name: "Finishes at… (washer, dryer, oven)",
    desc: "Fills until a timestamp sensor's finish time.",
    bar: {
      name: "Laundry",
      source: { type: "timestamp", duration: 0 },
      color: { mode: "gradient", stops: evenStops(["#18e0a0", "#b8ff5a"]) },
      tip: { enabled: true, count: 2, effect: "pulse", period: 1.5, taper: true },
      on_complete: { effect: "sparkle", color: "#18e060", duration: 10, then: "hide" },
    },
  },
  {
    icon: "☀️", name: "Day progress",
    desc: "Fills through a daily time window, with hour ticks.",
    bar: {
      name: "Day",
      source: { type: "window", window_start: "07:00", window_end: "23:00" },
      color: { mode: "gradient", span: "bar", stops: evenStops(["#ffc93a", "#ff5e3a", "#7a5cff"]) },
      tip: { enabled: true, count: 1, effect: "pulse", period: 3 },
      ticks: { every: 25, color: "#303030" },
      brightness: 60,
    },
  },
  {
    icon: "📶", name: "Level meter (from centre)",
    desc: "Grows outward from the middle, with peak hold.",
    bar: {
      name: "Level",
      fill_from: "center",
      color: { mode: "steps", stops: [{ pos: 0, color: "#18e060" }, { pos: 60, color: "#ffd000" }, { pos: 85, color: "#ff2a2a" }] },
      tip: { enabled: false },
      peak: { enabled: true, color: "#ffffff", hold: 3 },
      smoothing: 0.2,
    },
  },
  { icon: "✨", name: "Blank bar", desc: "Start from the defaults.", bar: { name: "New bar" } },
];

// Optional extras. Everything outside the three basic cards is an add-on that
// can be attached to a bar and removed again. `active` reads the bar itself,
// so saved bars and templates show the add-ons they already use.
const ADDONS = [
  { id: "tip", icon: "✨", title: "Flashing tip", hint: "Bright or blinking LEDs at the leading edge",
    active: (d) => !!d.tip.enabled, add: (d) => { d.tip.enabled = true; }, remove: (d) => { d.tip.enabled = false; } },
  { id: "caps", icon: "🚩", title: "Begin & end markers", hint: "Always-on LEDs showing where the bar starts and stops",
    active: (d) => d.caps.start.count > 0 || d.caps.end.count > 0,
    add: (d) => { d.caps.start.count = 1; d.caps.end.count = 1; }, remove: (d) => { d.caps.start.count = 0; d.caps.end.count = 0; } },
  { id: "track", icon: "〰️", title: "Ghost of the unlit part", hint: "Faintly light the empty part of the bar",
    active: (d) => d.track.mode !== "off", add: (d) => { d.track.mode = "dim"; }, remove: (d) => { d.track.mode = "off"; } },
  { id: "ticks", icon: "📏", title: "Scale marks", hint: "Small marks every 10–50 % along the bar",
    active: (d) => Number(d.ticks.every) > 0, add: (d) => { d.ticks.every = 25; }, remove: (d) => { d.ticks.every = 0; } },
  { id: "markers", icon: "🎯", title: "Target marker", hint: "Pin a setpoint, limit or another entity onto the bar",
    active: (d) => d.markers.length > 0, add: (d) => { if (!d.markers.length) d.markers.push(clone(E.DEFAULT_MARKER)); }, remove: (d) => { d.markers = []; } },
  { id: "peak", icon: "📌", title: "Peak hold", hint: "A dot that remembers the highest value",
    active: (d) => !!d.peak.enabled, add: (d) => { d.peak.enabled = true; }, remove: (d) => { d.peak.enabled = false; } },
  { id: "anim", icon: "🌊", title: "Motion", hint: "Breathe, flow, scanner or shimmer on the lit part",
    active: (d) => d.animation.type !== "none", add: (d) => { d.animation.type = "flow"; }, remove: (d) => { d.animation.type = "none"; } },
  { id: "rules", icon: "⚠️", title: "Alerts", hint: "Change colour or flash when a condition is met",
    active: (d) => d.rules.length > 0, add: (d) => { if (!d.rules.length) d.rules.push(clone(E.DEFAULT_RULE)); }, remove: (d) => { d.rules = []; } },
  { id: "done", icon: "🎉", title: "Finish celebration", hint: "Flash, sparkle or hide when it reaches 100 %",
    active: (d) => d.on_complete.effect !== "none" || d.on_complete.then === "hide",
    add: (d) => { d.on_complete.effect = "flash"; }, remove: (d) => { d.on_complete.effect = "none"; d.on_complete.then = "hold"; } },
  { id: "unavail", icon: "🚫", title: "Offline warning", hint: "Pulse a warning colour when the source is unavailable",
    active: (d) => d.unavailable.mode === "show", add: (d) => { d.unavailable.mode = "show"; }, remove: (d) => { d.unavailable.mode = "hide"; } },
  { id: "vis", icon: "👁️", title: "Show only when…", hint: "Tie the bar to a schedule, a status or another entity",
    active: (d) => !!d.visibility.entity || !!d.visibility.hide_at_zero || !d.visibility.hide_when_idle,
    add: () => {}, remove: (d) => { Object.assign(d.visibility, { entity: "", states: "", hide_at_zero: false, hide_when_idle: true }); } },
  { id: "fill", icon: "↔️", title: "Fill direction & smoothing", hint: "Grow from the centre or both ends; glide speed",
    active: (d) => d.fill_from !== "start" || !d.subpixel || Number(d.smoothing) !== E.DEFAULT_BAR.smoothing,
    add: () => {}, remove: (d) => { d.fill_from = "start"; d.subpixel = true; d.smoothing = E.DEFAULT_BAR.smoothing; } },
];

// ---------- LED strip canvas ----------

class StripView {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.o = Object.assign({ max: 26, min: 9, labels: false }, opts);
    this.pixels = [];
    this.ranges = []; // {start, end, color, label}
    this.sel = null; // {start, end}
    this._drag = null;
    if (this.o.onSelect) {
      canvas.style.cursor = "crosshair";
      canvas.style.touchAction = "none";
      canvas.addEventListener("pointerdown", (e) => {
        const i = this.ledAt(e);
        if (i === null) return;
        canvas.setPointerCapture(e.pointerId);
        this._drag = i;
        this.o.onSelect(i, i, false);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (this._drag === null) return;
        const i = this.ledAt(e, true);
        if (i !== null) this.o.onSelect(this._drag, i, false);
      });
      const up = (e) => {
        if (this._drag === null) return;
        const i = this.ledAt(e, true);
        const start = this._drag;
        this._drag = null;
        this.o.onSelect(start, i === null ? start : i, true);
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
.btn{border:1px solid var(--wb-line);background:transparent;border-radius:9px;padding:7px 12px;cursor:pointer;white-space:nowrap}
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
.tpl button:hover{border-color:var(--wb-accent)} .tpl .ic{font-size:22px}
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
.addon{border-left:3px solid var(--wb-accent);scroll-margin:290px 0 24px}
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
.add .ic{font-size:20px;flex:none;width:26px;text-align:center}
.add b{display:block;font-weight:600}
.add small{display:block;color:var(--wb-dim);font-size:11.5px;line-height:1.3;margin-top:2px}
.empty{text-align:center;padding:28px 12px}
.banner{background:rgba(255,160,0,.12);border:1px solid rgba(255,160,0,.4);border-radius:10px;padding:8px 12px}
dialog{background:var(--wb-card);color:inherit;border:1px solid var(--wb-line);border-radius:16px;padding:0;max-width:min(620px,94vw);width:100%}
dialog::backdrop{background:rgba(0,0,0,.55)}
dialog .sec{grid-template-columns:1fr}
@media(max-width:600px){.f{flex-wrap:wrap}.f>.fl{flex:1 0 100%}.wrap{padding:10px}}
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
    top.append(h("h1", {}, this._view === "edit" ? `Edit bar – ${this._draft.name || ""}` : "WLED Bars"));
    if (this._view === "list" && this._devices.length > 1) {
      top.append(
        h("select", { onchange: (e) => this._selectDevice(e.target.value) },
          this._devices.map((d) => h("option", { value: d.entry_id, selected: d.entry_id === this._entry }, d.name)))
      );
    }
    if (this._view === "list" && this._device) {
      top.append(h("button", { class: "btn", onclick: () => this._settingsDialog() }, "⚙ Device settings"));
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
    this._liveStrip = new StripView(canvas, { labels: true, max: 22 });
    this._liveStrip.pixels = new Array(dev.led_count).fill([0, 0, 0]);
    this._liveStrip.ranges = this._bars.map((b, i) => ({ start: b.start, end: b.end, label: b.name, color: this._barColor(i) }));
    this._strips.push(this._liveStrip);
    this._offlineEl = h("div", { class: "banner sm", style: "display:none;margin-top:10px" },
      `Can't reach WLED at ${dev.host}. Bars will resume automatically when it is back.`);
    wrap.append(
      h("div", { class: "card" },
        h("div", { class: "rowx", style: "margin-bottom:10px" },
          h("div", { class: "grow" }, h("h2", {}, dev.name), h("div", { class: "dim sm" }, `${dev.led_count} LEDs · ${dev.host} · live view`)),
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
              h("span", { class: "ic" }, t.icon), h("b", {}, t.name), h("span", { class: "dim sm" }, t.desc)))))
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
    return h("div", { class: "bar" + (bar.enabled ? "" : " off") },
      h("div", { class: "rowx" },
        h("span", { style: `width:10px;height:10px;border-radius:50%;background:${this._barColor(i)}` }),
        h("div", { class: "grow name" }, bar.name), pill, pct),
      h("div", { class: "stage", style: "padding:8px 8px 2px" }, canvas),
      h("div", { class: "dim sm", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" },
        `LED ${bar.start} → ${bar.end} · ${this._sourceText(bar)}`),
      h("div", { class: "rowx" },
        h("button", { class: "btn pri", onclick: () => this._edit(i) }, "Edit"),
        h("button", { class: "btn", onclick: () => this._duplicate(i) }, "Duplicate"),
        h("button", { class: "btn danger", onclick: () => this._delete(i) }, "Delete"),
        h("span", { class: "grow" }),
        h("input", { type: "checkbox", class: "sw", title: "Enabled", checked: !!bar.enabled,
          onchange: async (e) => {
            const bars = clone(this._bars);
            bars[i].enabled = e.target.checked;
            await this._saveBars(bars);
            this._render();
          } }))
    );
  }

  _newBar(tpl) {
    const used = this._bars.reduce((m, b) => Math.max(m, b.start, b.end), -1);
    const count = this._device.led_count;
    let start = used + 2 < count - 4 ? used + 2 : 0;
    if (used < 0) start = 0;
    const end = Math.min(count - 1, start + 29);
    this._draft = E.normalizeBar({ ...clone(tpl.bar), start, end, id: "" });
    this._draftIndex = -1;
    this._openEditor();
  }

  _edit(i) {
    this._draft = E.normalizeBar(clone(this._bars[i]));
    this._draftIndex = i;
    this._openEditor();
  }

  _openEditor() {
    this._view = "edit";
    this._sim = { frac: 0.62, play: false, live: true, t0: 0, completeAt: null, unavailable: false };
    this._closed = new Set();
    this._added = new Set();
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

  async _delete(i) {
    if (!confirm(`Delete the bar "${this._bars[i].name}"?`)) return;
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
    this._simOut = h("output", { class: "pct", style: "min-width:120px;text-align:right" });
    this._simRange = h("input", { type: "range", min: 0, max: 1000, step: 1, value: Math.round(this._sim.frac * 1000),
      oninput: (e) => { this._sim.frac = e.target.value / 1000; this._sim.play = false; this._sim.live = false; this._sim.completeAt = null; this._syncSimButtons(); this._pushStrip(); } });
    this._playBtn = h("button", { class: "btn", onclick: () => {
      this._sim.play = !this._sim.play; this._sim.live = false; this._sim.t0 = 0; this._sim.completeAt = null; this._sim.unavailable = false; this._syncSimButtons();
    } }, "▶ Play");
    this._liveBtn = h("button", { class: "btn xs", title: "Make the preview follow the entity's real value",
      onclick: () => { this._sim.live = !this._sim.live; this._sim.play = false; this._sim.unavailable = false; this._sim.completeAt = null; this._syncSimButtons(); } }, "● Live value");
    this._stripBtn = h("button", { class: "btn", title: "Show this draft on the real LEDs while you edit",
      onclick: () => this._stripPreview(!this._onStrip) }, "💡 Show on strip");
    this._unavBtn = h("button", { class: "btn xs", onclick: () => { this._sim.unavailable = !this._sim.unavailable; this._sim.play = false; this._sim.live = false; this._syncSimButtons(); } }, "Unavailable");

    const head = h("div", { class: "sticky" },
      h("div", { class: "rowx", style: "margin-bottom:10px" },
        h("input", { type: "text", class: "grow", style: "font-size:16px;font-weight:600", value: d.name, placeholder: "Bar name",
          oninput: (e) => { d.name = e.target.value; } }),
        h("label", { class: "rowx sm dim", title: "Turn this bar on or off" }, "Enabled",
          h("input", { type: "checkbox", class: "sw", checked: !!d.enabled, onchange: (e) => { d.enabled = e.target.checked; this._pushStrip(); } })),
        h("button", { class: "btn", onclick: () => this._closeEditor() }, "Cancel"),
        h("button", { class: "btn pri", onclick: () => this._saveDraft() }, "Save")),
      h("div", { class: "stage" }, pv),
      h("div", { class: "sim" },
        this._playBtn, h("span", { class: "dim sm" }, "Simulate"), this._simRange, this._simOut),
      h("div", { class: "sim", style: "margin-top:6px" },
        this._stripBtn, this._liveBtn,
        h("button", { class: "btn xs", onclick: () => { this._sim.play = false; this._sim.live = false; this._sim.unavailable = false; this._sim.frac = 1; this._simRange.value = 1000; this._sim.completeAt = performance.now() / 1000; this._syncSimButtons(); } }, "🎉 Test completion"),
        this._unavBtn,
        h("button", { class: "btn xs", onclick: () => this.ws("identify", { entry_id: this._entry, leds: E.barLeds(E.normalizeBar(d)) }) }, "🔦 Flash these LEDs"))
    );
    this._form = h("div", { class: "editor" });
    this._lists = h("div", { style: "display:none" });
    wrap.append(head, this._form, this._lists);
    this._renderForm();
    this._syncSimButtons();
  }

  _syncSimButtons() {
    if (!this._playBtn) return;
    this._playBtn.textContent = this._sim.play ? "⏸ Pause" : "▶ Play";
    this._playBtn.classList.toggle("on", this._sim.play);
    this._unavBtn.classList.toggle("on", this._sim.unavailable);
    this._stripBtn.classList.toggle("on", this._onStrip);
    this._liveBtn.classList.toggle("on", this._sim.live);
    this._liveBtn.style.display = this._draft && this._draft.source.type === "entity" ? "" : "none";
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
    if (type === "entity")
      return h("input", { type: "text", list: this._datalist(o.domains), value: obj[key] ?? "", placeholder: o.placeholder || "Start typing an entity…",
        oninput: (e) => upd(e.target.value.trim()) });
    return h("input", { type: "text", value: obj[key] ?? "", placeholder: o.placeholder, oninput: (e) => upd(e.target.value) });
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
      h("summary", {}, h("span", {}, def.icon), h("span", {}, def.title), h("small", {}, def.hint),
        h("button", { class: "btn xs danger rm", title: "Remove this from the bar",
          onclick: (e) => { e.preventDefault(); e.stopPropagation(); def.remove(this._draft); this._added.delete(id); this._touch(true); } }, "✕ Remove")),
      h("div", { class: "sec" }, kids));
    if (this._flash === id) {
      el.classList.add("flash");
      this._flashEl = el;
    }
    return el;
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
      onSelect: (a, b, done) => { d.start = a; d.end = b; if (done) this._touch(true); },
    });
    const posInfo = h("div", { class: "dim sm full" });
    this._hooks.push(() => { posInfo.textContent = `LED ${d.start} → ${d.end} · ${Math.abs(d.end - d.start) + 1} LEDs · green ring = where the bar begins, red ring = where it ends`; });
    form.append(this._card("1", "Where on the strip", "Drag from where the bar begins to where it ends", [
      h("div", { class: "stage full" }, pick), posInfo,
      F("Begins at LED", I(d, "start", "num", { min: 0, max: count - 1 })),
      F("Ends at LED", I(d, "end", "num", { min: 0, max: count - 1 }), "Lower than the start = runs backwards"),
      h("div", { class: "full" }, h("button", { class: "btn", onclick: (e) => { e.preventDefault(); [d.start, d.end] = [d.end, d.start]; this._touch(true); } }, "⇄ Flip direction")),
    ]));

    // --- 2. what it shows ---
    const s = d.source;
    const numeric = s.type === "entity" || s.type === "manual";
    const rangeInfo = h("div", { class: "info" });
    if (numeric) {
      let last = "";
      this._rangeInfo = () => {
        const bar = E.normalizeBar(d);
        const lo = E.num(s.min, 0), hi = E.num(s.max, 100);
        const unit = this._liveUnit(bar);
        const v = this._liveValue(bar);
        const len = Math.abs(d.end - d.start) + 1;
        let text;
        if (lo === hi) text = "Empty and full are the same number, so the bar can't fill. Make them different.";
        else {
          text = v !== null
            ? `Right now ${s.entity} reads ${fmt(v)}${unit}, which lights ${fmt(E.valueToFrac(bar, v) * 100)} % of the bar (about ${Math.round(E.valueToFrac(bar, v) * len)} of ${len} LEDs). `
            : "";
          text += `The bar is empty at ${fmt(lo)}${unit} and completely lit at ${fmt(hi)}${unit}; halfway is ${fmt((lo + hi) / 2)}${unit}.`;
          if (lo > hi) text += " Empty is the higher number, so the bar grows as the reading falls.";
        }
        if (text !== last) { last = text; rangeInfo.textContent = text; }
      };
    }
    form.append(this._card("2", "What it shows", null, [
      F("Follows", I(s, "type", "sel", { options: SOURCE_TYPES }), null, "full"),
      s.type === "entity" && F("Entity", I(s, "entity", "entity", { domains: ["sensor", "number", "input_number", "counter", "climate", "light", "fan", "media_player", "cover", "weather", "humidifier", "water_heater", "vacuum"] })),
      s.type === "entity" && F("Attribute", I(s, "attribute", "text", { placeholder: "(state)" }), "Optional, e.g. current_temperature"),
      s.type === "timer" && F("Timer", I(s, "entity", "entity", { domains: ["timer"] })),
      s.type === "timestamp" && F("Finish time entity", I(s, "end_entity", "entity", { domains: ["sensor", "input_datetime"] }), "A timestamp, e.g. washer end time"),
      s.type === "timestamp" && F("Start time entity", I(s, "start_entity", "entity", { domains: ["sensor", "input_datetime"] }), "Optional"),
      s.type === "timestamp" && F("Typical length (s)", I(s, "duration", "num", { min: 0, step: 60 }), "Used without a start entity. 0 = count from when the finish time appeared"),
      s.type === "window" && F("Starts at", I(s, "window_start", "time")),
      s.type === "window" && F("Ends at", I(s, "window_end", "time")),
      s.type === "manual" && h("div", { class: "dim sm full" },
        "Drive this bar from automations: wled_bars.start_timer (bar, duration), wled_bars.set_value (bar, value), wled_bars.stop_timer."),
      numeric && h("div", { class: "sub" }, "Range – which readings mean empty and full"),
      numeric && F("Reading for an empty bar", I(s, "min", "num", { step: "any" }), "At or below this, nothing is lit"),
      numeric && F("Reading for a full bar", I(s, "max", "num", { step: "any" }), "At or above this, the whole bar is lit"),
      numeric && rangeInfo,
      F("Drain instead of fill", I(s, "invert", "tog"), "Starts full and empties (countdown style)"),
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
        const setVal = () => { val.textContent = numeric ? `≈ ${fmt(E.fracToValue(E.normalizeBar(d), stop.pos / 100))}` : ""; };
        this._hooks.push(setVal);
        stopsBox.append(h("div", { class: "rowx" },
          I(stop, "color", "color"),
          multi && h("span", { class: "grow" }, I(stop, "pos", "range", { min: 0, max: 100, unit: " %" })),
          multi && val,
          multi && c.stops.length > 1 && h("button", { class: "btn xs danger", onclick: (e) => { e.preventDefault(); c.stops.splice(i, 1); this._touch(true); } }, "✕")));
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
      c.mode === "gradient" && F("Gradient spans", I(c, "span", "sel", { options: [["bar", "The whole bar (revealed as it fills)"], ["fill", "Only the lit part (stretches)"]] })),
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
        F("Position", I(t, "position", "sel", { options: [["inside", "On the last lit LEDs"], ["ahead", "Just ahead of the bar"]] })),
        t.effect !== "solid" && F("When “off”", I(t, "off", "sel", { options: [["under", "Show the bar underneath"], ["dark", "Go dark"]] })),
        F("Fade out along the tip", I(t, "taper", "tog"), "Comet-style tail"),
        F("Show at 0 %", I(t, "show_at_zero", "tog")),
        F("Hide at 100 %", I(t, "hide_when_full", "tog")),
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
            h("button", { class: "btn xs danger", onclick: (e) => { e.preventDefault(); d.markers.splice(i, 1); this._touch(true); } }, "✕")));
        });
        return [
          mk,
          h("div", { class: "full" }, h("button", { class: "btn xs", onclick: (e) => { e.preventDefault(); d.markers.push(clone(E.DEFAULT_MARKER)); this._touch(true); } }, "+ Add another marker"),
            h("span", { class: "dim sm", style: "margin-left:8px" }, "A marker is one LED pinned at a reading, in the same units as the range above (e.g. a 21° setpoint on a 15–30° bar).")),
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
        d.rules.forEach((r, i) => rl.append(h("div", { class: "item" },
          h("span", { class: "dim" }, "When"),
          I(r, "source", "sel", { options: [["percent", "fill %"], ["value", "reading"], ["entity", "entity"]] }),
          r.source === "entity" && I(r, "entity", "entity", {}),
          I(r, "op", "sel", { options: OPS }),
          h("span", { style: "width:90px;display:flex" }, I(r, "value", "text", { placeholder: "value" })),
          h("span", { class: "dim" }, "→"),
          I(r, "use_color", "tog"), r.use_color && I(r, "color", "color"),
          I(r, "effect", "sel", { options: EFFECTS }),
          r.effect !== "solid" && I(r, "period", "num", { min: 0.2, max: 10, step: 0.1 }),
          I(r, "scope", "sel", { options: [["fill", "lit part"], ["all", "whole bar"]] }),
          h("button", { class: "btn xs danger", onclick: (e) => { e.preventDefault(); d.rules.splice(i, 1); this._touch(true); } }, "✕"))));
        return [
          rl,
          h("div", { class: "full" }, h("button", { class: "btn xs", onclick: (e) => { e.preventDefault(); d.rules.push(clone(E.DEFAULT_RULE)); this._touch(true); } }, "+ Add another alert"),
            h("span", { class: "dim sm", style: "margin-left:8px" }, "e.g. fill % ≥ 90 → red, blink, whole bar. The switch turns the colour change on or off. Later alerts win.")),
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
        F("Only while this entity…", I(v, "entity", "entity", {}), "e.g. a schedule helper or a status sensor"),
        F("…is one of", I(v, "states", "text", { placeholder: "on, printing" }), "Comma separated (default: on)"),
        F("Hide at 0 %", I(v, "hide_at_zero", "tog")),
        F("Hide when idle", I(v, "hide_when_idle", "tog"), "Timer not running, outside the time window…"),
      ],
      fill: () => [
        F("Fill grows from", I(d, "fill_from", "sel", { options: [["start", "The beginning"], ["end", "The end"], ["center", "The centre outwards"], ["edges", "Both ends inwards"]] })),
        F("Glide to new values", I(d, "smoothing", "range", { min: 0, max: 5, step: 0.1, unit: " s" }), "0 = jump straight there"),
        F("Smooth leading edge", I(d, "subpixel", "tog"), "Dims the last LED for in-between values"),
      ],
    };

    const isOn = (def) => def.active(d) || this._added.has(def.id);
    const on = ADDONS.filter(isOn);
    const off = ADDONS.filter((def) => !isOn(def));
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
            } }, h("span", { class: "ic" }, def.icon), h("span", {}, h("b", {}, def.title), h("small", {}, def.hint)))))
        : h("div", { class: "dim sm", style: "padding:0 16px 16px" }, "Everything is already on this bar.")));

    for (const fn of this._hooks) fn();
    if (this._rangeInfo) this._rangeInfo();
    if (this._flashEl) {
      const el = this._flashEl;
      requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
    this._flash = null;
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
          F("How frames are sent", upd(st, "transport", "sel", { options: [["json", "Per-LED JSON – shares the strip with WLED (≈5 fps)"], ["ddp", "Realtime DDP – silky smooth, takes over the strip while a bar shows"]] })),
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
