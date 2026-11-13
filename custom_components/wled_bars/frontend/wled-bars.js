// WLED Bars frontend: the sidebar editor panel and the dashboard card.
// Plain web components, no build step. The preview uses the same render
// engine as the backend (engine.js mirrors engine.py).
// Loaded with the same ?v= as this file so a new release never pairs with a
// cached copy of the old engine.
const E = await import("./engine.js" + new URL(import.meta.url).search);

const DOMAIN = "wled_bars";

// ---------- is this page running the installed version? ----------
// After an update a browser can keep an old copy of this file, and the files
// can be newer than a Home Assistant that has not restarted yet. Either way
// the card and editor would quietly be the wrong ones, so they say so instead.

const VERSION = new URL(import.meta.url).searchParams.get("v");
let versionCheck = null;

export function staleCheck(hass) {
  versionCheck = versionCheck || hass.callWS({ type: `${DOMAIN}/version` }).then(
    (res) => (VERSION && res?.version && res.version !== VERSION ? { kind: "reload", version: res.version } : null),
    // a backend without this command is older than this file: it has not restarted since the update
    (err) => (err?.code === "unknown_command" ? { kind: "restart" } : null));
  return versionCheck;
}

function staleNotice(stale) {
  if (!stale) return null;
  if (stale.kind === "restart") {
    return h("div", { class: "stale" }, h("span", {}, "WLED Bars was updated. Restart Home Assistant to finish; until then some things here may not work."));
  }
  const key = `wled_bars_reloaded_${stale.version}`;
  let tried = false;
  try { tried = sessionStorage.getItem(key) === "1"; } catch (_e) { /* private mode */ }
  const text = tried
    ? `This browser is holding on to WLED Bars ${VERSION}; ${stale.version} is installed. Clear the cached files for this site, or hard-refresh (Ctrl/Cmd + Shift + R).`
    : `WLED Bars ${stale.version} is installed, but this page is still running ${VERSION}.`;
  return h("div", { class: "stale" }, h("span", {}, text),
    h("button", { onclick: async () => {
      try { sessionStorage.setItem(key, "1"); } catch (_e) { /* ignore */ }
      // drop what the browser and Home Assistant's own offline cache kept, then load afresh
      try { for (const name of await caches.keys()) await caches.delete(name); } catch (_e) { /* not available */ }
      location.reload();
    } }, tried ? "Try again" : "Reload"));
}
const STALE_CSS = `.stale{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;line-height:1.35;padding:9px 12px;border-radius:10px;
  background:color-mix(in srgb,var(--wb-warn) 14%,transparent);border:1px solid color-mix(in srgb,var(--wb-warn) 45%,transparent)}
.stale span{flex:1;min-width:180px}
.stale button{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 40%,transparent);border-radius:8px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.stale button:hover{border-color:var(--wb-accent)}
`;

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
  redo: "M20 9H10a6 6 0 0 0 0 12h5M16 5l4 4-4 4",
  media: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5l5.5 3.5-5.5 3.5z",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4",
  zoomin: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6",
  zoomout: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6",
  distance: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  x: "M6 6l12 12M18 6L6 18",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 15V4M7 9l5-5 5 5M5 20h14",
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

// ---------- taking bars from one strip to another ----------

// A name nothing in `taken` uses yet: "Timer", then "Timer 2", "Timer 3"…
export function freeName(name, taken) {
  const used = new Set(taken.map((n) => String(n).trim().toLowerCase()));
  const base = String(name || "").trim() || "Bar";
  if (!used.has(base.toLowerCase())) return base;
  const stem = base.replace(/ \d+$/, "");
  for (let n = 2; ; n++) if (!used.has(`${stem} ${n}`.toLowerCase())) return `${stem} ${n}`;
}

// Where LEDs start → end of a strip `from` long go on a strip `to` long.
// They stay put when they fit; otherwise (or when `scale` says so) they keep their share of the strip.
export function fitRange(start, end, from, to, scale) {
  const lo = Math.min(start, end), hi = Math.max(start, end);
  if (!(to > 0) || (!scale && hi < to)) return [start, end];
  const k = to / Math.max(from || 0, hi + 1);
  const a = Math.min(to - 1, Math.floor(lo * k));
  const b = Math.min(to - 1, Math.max(a, Math.ceil((hi + 1) * k) - 1));
  return start <= end ? [a, b] : [b, a];
}

// Bars from another strip (or a file), made ready to join `existing` on a strip `to` LEDs long:
// placed so they fit, with names and ids that don't clash.
export function adoptBars(incoming, existing, from, to) {
  const scale = to > 0 && incoming.some((b) => Math.max(b.start, b.end) >= to);
  const names = existing.map((b) => b.name);
  const ids = new Set(existing.map((b) => b.id));
  return incoming.map((raw) => {
    const bar = E.normalizeBar(clone(raw));
    [bar.start, bar.end] = fitRange(bar.start, bar.end, from, to, scale);
    bar.name = freeName(bar.name, names);
    names.push(bar.name);
    if (!bar.id || ids.has(bar.id)) bar.id = "";
    else ids.add(bar.id);
    return bar;
  });
}

// What a chosen file holds, or null when it isn't a WLED Bars export.
export function readExport(text) {
  let data;
  try { data = JSON.parse(text); } catch (_e) { return null; }
  if (Array.isArray(data)) data = { bars: data };
  if (!data || typeof data !== "object" || !Array.isArray(data.bars)) return null;
  const bars = data.bars.filter((b) => b && typeof b === "object" && !Array.isArray(b) && b.source !== null);
  if (!bars.length || bars.length !== data.bars.length) return null;
  const dev = data.device && typeof data.device === "object" ? data.device : {};
  return {
    bars: bars.map((b) => E.normalizeBar(b)),
    settings: data.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings : null,
    name: typeof dev.name === "string" ? dev.name : "",
    led_count: Number(dev.led_count) || 0,
    exported: typeof data.exported === "string" && !Number.isNaN(Date.parse(data.exported)) ? new Date(data.exported) : null,
  };
}
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
      if (onEnd) onEnd(ctx);
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
const condText = (c, nm = (id) => id) => {
  if (c.type === "time") {
    const all = parseHM(c.start) === parseHM(c.end);
    return (all ? "all day" : `${c.start}–${c.end}`) + daysText(c.days);
  }
  if (!c.entity) return "";
  if (c.type === "state") return `${nm(c.entity)} ${c.negate ? "is not" : "is"} ${c.states || "on"}`;
  return `${nm(c.entity)} ${(OPS.find((o) => o[0] === c.op) || [0, c.op])[1]} ${c.value}`;
};

// When a time condition next becomes true, and how to say it ("18:00", "tomorrow 07:00", "Mon 07:00").
const nextStart = (c, from = new Date()) => {
  const st = parseHM(c.start), en = parseHM(c.end);
  const at = st !== null && en !== null && st !== en ? st : 0;
  for (let k = 0; k <= 7; k++) {
    const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + k, 0, at, 30);
    if (t > from && condOk(c, () => null, t)) return t;
  }
  return null;
};
const whenText = (t, from = new Date()) => {
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((midnight(t) - midnight(from)) / 864e5);
  const hm = hhmm(t.getHours() * 60 + t.getMinutes());
  return days === 0 ? hm : days === 1 ? `tomorrow ${hm}` : `${DAY_NAMES[(t.getDay() + 6) % 7]} ${hm}`;
};
// Colour part-way between the neighbouring stops, for a stop added by clicking the gradient.
const mixAt = (stops, pos) => {
  const st = [...stops].sort((a, b) => a.pos - b.pos);
  if (pos <= st[0].pos) return st[0].color;
  if (pos >= st[st.length - 1].pos) return st[st.length - 1].color;
  const i = st.findIndex((x, k) => k + 1 < st.length && pos <= st[k + 1].pos);
  const a = hexToPixels(st[i].color.slice(1))[0], b = hexToPixels(st[i + 1].color.slice(1))[0];
  if (!a || !b) return "#ffffff";
  const t = (pos - st[i].pos) / Math.max(1e-6, st[i + 1].pos - st[i].pos);
  return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, "0")).join("");
};

// ---------- distance source (mirrors manager.py) ----------

const UNIT_METRES = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };
const haversineM = (lat1, lon1, lat2, lon2) => {
  const rad = Math.PI / 180;
  const dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
};
const placeOf = (states, id) => {
  const st = id && states[id];
  if (!st) return null;
  const lat = E.num(st.attributes?.latitude, null), lon = E.num(st.attributes?.longitude, null);
  return lat === null || lon === null ? null : { lat, lon, radius: Math.max(0, E.num(st.attributes?.radius, 0)) };
};
// -> {remaining, total, frac, unit, sensor} with distances in the display unit; total/frac are null when unknown
export function distanceInfo(source, states) {
  const st = source.entity && states[source.entity];
  if (!st || ["unavailable", "unknown", ""].includes(String(st.state).toLowerCase())) return null;
  const dest = placeOf(states, source.to_zone || "zone.home");
  const reading = E.num(st.state, null);
  const sensorUnit = String(st.attributes?.unit_of_measurement || "").trim().toLowerCase();
  let remaining, scale = 1;
  if (reading !== null) {
    scale = UNIT_METRES[sensorUnit] || null;
    remaining = Math.max(0, reading) * (scale || 1);
  } else {
    const here = placeOf(states, source.entity);
    if (!here || !dest) return null;
    remaining = Math.max(0, haversineM(here.lat, here.lon, dest.lat, dest.lon) - dest.radius);
  }
  const unitKey = String(source.dist_unit || "").toLowerCase();
  const unit = UNIT_METRES[unitKey];
  const factor = reading === null ? unit || 1000 : (scale !== null ? unit : null) || scale || 1;
  let total = null;
  if (source.dist_mode === "zones" && scale !== null) {
    const origin = placeOf(states, source.from_zone);
    if (origin && dest) total = Math.max(0, haversineM(origin.lat, origin.lon, dest.lat, dest.lon) - dest.radius);
  } else if (source.dist_mode === "fixed") total = Math.max(0, E.num(source.dist_total, 0)) * factor;
  const frac = total === null ? null : total <= 0 ? (remaining <= 0 ? 1 : 0) : E.clamp(1 - remaining / total);
  return {
    remaining: remaining / factor, total: total === null ? null : total / factor, frac,
    unit: reading === null ? (unit ? unitKey : "km") : (scale !== null && unit ? unitKey : sensorUnit),
    sensor: reading !== null,
  };
}

// ---------- media, share-of and event sources (mirror manager.py) ----------

const UNIT_SCALE = { w: 1, kw: 1000, mw: 1e6, wh: 1, kwh: 1000, mwh: 1e6 };
const gone = (st) => !st || ["unavailable", "unknown", ""].includes(String(st.state).toLowerCase());
const clockText = (sec) => {
  const t = Math.max(0, Math.round(sec)), hrs = Math.floor(t / 3600), min = Math.floor((t % 3600) / 60);
  return (hrs ? `${hrs}:${String(min).padStart(2, "0")}` : String(min)) + ":" + String(t % 60).padStart(2, "0");
};
const spanText = (sec) => {
  const t = Math.max(0, sec), d = Math.floor(t / 86400), hrs = Math.floor((t % 86400) / 3600), min = Math.floor((t % 3600) / 60);
  return d ? `${d} d ${hrs} h` : hrs ? `${hrs} h ${min} min` : `${min} min`;
};
// -> {frac, position, duration, playing} or null when nothing with a length is playing
export function mediaInfo(source, states, now = Date.now()) {
  const st = states[source.entity];
  if (gone(st) || !["playing", "paused"].includes(st.state)) return null;
  const duration = E.num(st.attributes?.media_duration, 0);
  let position = E.num(st.attributes?.media_position, null);
  if (duration <= 0 || position === null) return null;
  if (st.state === "playing") {
    const at = Date.parse(st.attributes?.media_position_updated_at || "");
    if (!Number.isNaN(at)) position += (now - at) / 1000;
  }
  position = Math.max(0, Math.min(duration, position));
  return { frac: position / duration, position, duration, playing: st.state === "playing" };
}
// -> {frac, part, whole, unit}: how much of the second entity the first one covers
export function ratioInfo(source, states) {
  const a = states[source.entity], b = states[source.entity2];
  const part = a ? E.num(a.state, null) : null, whole = b ? E.num(b.state, null) : null;
  if (part === null || whole === null) return null;
  const unitA = String(a.attributes?.unit_of_measurement || ""), unitB = String(b.attributes?.unit_of_measurement || "");
  const ka = UNIT_SCALE[unitA.trim().toLowerCase()] || 1, kb = UNIT_SCALE[unitB.trim().toLowerCase()] || 1;
  const frac = whole * kb <= 0 ? (part > 0 ? 1 : 0) : E.clamp((part * ka) / (whole * kb));
  return { frac, part: (part * ka) / kb, whole, unit: unitB };
}
const timeOf = (states, id) => {
  const st = states[id];
  if (gone(st)) return null;
  const raw = String(id.startsWith("calendar.") ? st.attributes?.start_time || "" : st.state).trim();
  // "2026-11-14 07:00:00" and plain dates are local time, like the backend reads them
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + "T00:00" : raw.replace(" ", "T"));
  return Number.isNaN(ms) ? null : ms;
};
// -> {end (ms), left (s), frac}: frac is null until the bar starts filling, or when the length isn't known here
export function eventInfo(source, states, now = Date.now()) {
  const end = timeOf(states, source.end_entity);
  if (end === null) return null;
  const startAt = timeOf(states, source.start_entity || "");
  const total = startAt !== null ? (end - startAt) / 1000 : E.num(source.duration, 0);
  const left = (end - now) / 1000;
  const frac = total > 0 && left <= total && left >= 0 ? E.clamp(1 - left / total) : null;
  return { end, left, total, frac };
}

// ---------- bar kinds: what each preset needs ----------
// sources: which "follows" choices make sense; hide: add-ons that don't apply;
// range: how the empty/full mapping is presented.
// What a bar is doing right now, in plain words: {tone, text}.
function barStatus(bar, i, o) {
  const st = o.live[bar.id];
  const states = o.states || {};
  const nm = (id) => states[id]?.attributes?.friendly_name || id;
  const getState = (id) => (states[id] ? states[id].state : null);
  if (!o.enabled && !o.standby) return { tone: "", text: "Off · all bars are switched off" };
  if (!bar.enabled) return { tone: "", text: "Switched off" };
  if (!st) return { tone: "", text: "Waiting for the strip…" };
  // standby: all bars are off, and the card says what each one would do if they were on
  if (!o.enabled && st.would) return { tone: "would", text: st.state === "unavailable" ? "Would show the offline warning" : "Would show" };
  if (st.visible) {
    if (st.state === "unavailable") return { tone: "warn", text: "Showing the offline warning" };
    const mine = E.barLeds(bar);
    const cover = new Map();
    o.bars.forEach((b, k) => {
      if (k > i && o.live[b.id]?.visible) for (const led of E.barLeds(b)) cover.set(led, b.name);
    });
    const hit = mine.filter((led) => cover.has(led));
    if (!hit.length) return { tone: "yes", text: "Showing" };
    const by = [...new Set(hit.map((led) => cover.get(led)))].join(", ");
    return hit.length === mine.length ? { tone: "warn", text: `Covered by ${by}` } : { tone: "yes", text: `Showing · partly covered by ${by}` };
  }
  const vis = bar.visibility;
  const conds = (vis.entity ? [{ type: "state", entity: vis.entity, states: vis.states || "on" }] : []).concat(vis.conditions);
  const failing = conds.filter((c) => !condOk(c, getState));
  if (st.why === "conditions" || (!st.why && failing.length)) {
    const times = failing.filter((c) => c.type === "time").map((c) => nextStart(c)).filter(Boolean).sort((a, b) => a - b);
    const other = failing.find((c) => c.type !== "time" && c.entity);
    if (other && !(vis.match === "any" && times.length)) {
      const cur = getState(other.entity);
      const unit = other.type === "numeric" ? states[other.entity]?.attributes?.unit_of_measurement || "" : "";
      return { tone: "", text: cur === null ? `Hidden: ${nm(other.entity)} is missing` : `Hidden: ${nm(other.entity)} is ${cur}${unit}` };
    }
    if (times.length) return { tone: "", text: `Hidden until ${whenText(times[0])}` };
    return { tone: "", text: "Hidden by its conditions" };
  }
  if (st.why === "unavailable" || st.state === "unavailable") return { tone: "bad", text: "Hidden: source unavailable" };
  if (st.why === "zero") return { tone: "", text: "Hidden while at 0 %" };
  if (st.why === "finished") return { tone: "", text: "Hidden: finished" };
  const src = bar.source.type;
  if (src === "timer") return { tone: "", text: "Hidden: timer isn’t running" };
  if (src === "media") return { tone: "", text: "Hidden: nothing is playing" };
  if (src === "ratio") return { tone: "", text: "Hidden: choose both sensors" };
  if (src === "timestamp") {
    const ev = eventInfo(bar.source, states);
    if (ev && ev.left > 0 && ev.total > 0) return { tone: "", text: `Hidden until ${whenText(new Date(ev.end - ev.total * 1000))}` };
    return { tone: "", text: bar.kind === "event" ? "Hidden: no upcoming event" : "Hidden: no finish time yet" };
  }
  if (src === "window") return { tone: "", text: `Hidden until ${bar.source.window_start}` };
  if (src === "manual") return { tone: "", text: "Hidden: waiting for an automation" };
  return { tone: "", text: "Hidden: nothing to show" };
}


const KINDS = {
  "": { sources: null, hide: [] },
  progress: { sources: ["entity", "manual"], hide: ["peak"], range: "percent" },
  temperature: { sources: ["entity"], hide: ["done", "peak"], range: "temp", noDrain: true },
  battery: { sources: ["entity"], hide: ["done", "peak"], range: "percent", noDrain: true },
  countdown: { sources: ["timer", "manual"], hide: ["peak", "markers"] },
  finish: { sources: ["timestamp"], hide: ["peak", "markers"] },
  day: { sources: ["window"], hide: ["done", "unavail", "peak", "markers"], noDrain: true },
  level: { sources: ["entity", "manual"], hide: ["done"], range: "percent", noDrain: true },
  distance: { sources: ["distance"], hide: ["peak", "markers"] },
  media: { sources: ["media"], hide: ["done", "peak", "markers"] },
  energy: { sources: ["ratio"], hide: ["done", "peak", "markers"], noDrain: true },
  event: { sources: ["timestamp"], hide: ["peak", "markers"], noDrain: true },
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
  ["distance", "Distance to a place"],
  ["media", "A media player's playback position"],
  ["ratio", "One value as a share of another"],
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
  {
    icon: "distance", name: "Distance to a place",
    desc: "Fills as someone gets closer: to home, or between two zones.",
    bar: {
      name: "Distance", kind: "distance",
      source: { type: "distance", to_zone: "zone.home", dist_mode: "fixed", dist_total: 10 },
      color: { mode: "gradient", span: "bar", stops: evenStops(["#7a5cff", "#00c8ff", "#18e060"]) },
      tip: { enabled: true, count: 1, effect: "pulse", period: 1.5, color: "#ffffff" },
      on_complete: { effect: "pulse", color: "#18e060", duration: 8, then: "hold" },
      smoothing: 1.5,
    },
  },
  {
    icon: "media", name: "Media playback",
    desc: "Fills as a song, show or film plays; hides when nothing is playing.",
    bar: {
      name: "Now playing", kind: "media",
      source: { type: "media" },
      color: { mode: "gradient", span: "bar", stops: evenStops(["#ff5dc8", "#7a5cff"]) },
      tip: { enabled: true, count: 1, effect: "solid", color: "#ffffff" },
      smoothing: 0.5,
    },
  },
  {
    icon: "tip", name: "Solar vs. house use",
    desc: "How much of what the house is using right now is covered by solar.",
    bar: {
      name: "Solar", kind: "energy",
      source: { type: "ratio" },
      color: { mode: "value", blend: true, stops: evenStops(["#ff2a2a", "#ffd000", "#18e060"]) },
      tip: { enabled: false },
      ticks: { every: 25, color: "#303030" },
      smoothing: 2,
    },
  },
  {
    icon: "calendar", name: "Countdown to an event",
    desc: "Bin day, a calendar event or a date: fills as it gets closer.",
    bar: {
      name: "Bin day", kind: "event",
      source: { type: "timestamp", duration: 86400 },
      color: { mode: "value", blend: true, stops: evenStops(["#18e060", "#ffd000", "#ff2a2a"]) },
      tip: { enabled: true, count: 1, effect: "pulse", period: 2 },
      on_complete: { effect: "flash", color: "#ff2a2a", duration: 10, then: "hide" },
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

// Light or dark? Home Assistant says so; failing that, judge by the card background.
// The host gets a "light" attribute, which the styles and the strip drawings follow.
function applyTone(host, hass) {
  let dark = hass?.themes?.darkMode;
  if (dark === undefined) {
    const bg = getComputedStyle(host).getPropertyValue("--card-background-color").trim();
    const m = /^#([0-9a-f]{6})/i.exec(bg) || null;
    const rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)) : (/rgba?\(([^)]+)\)/.exec(bg)?.[1].split(",").map(Number) || null);
    dark = !rgb || 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 140;
  }
  if (host.hasAttribute("light") === dark) {
    host.toggleAttribute("light", !dark);
    return true;
  }
  return false;
}
const STRIP_DARK = { off: "#1d212b", num: "#7c869d", tick: "#3a4152", label: "#aab3c5", mid: "rgba(255,255,255,.4)", band: "rgba(255,255,255,.07)", gap: "rgba(0,0,0,.55)", first: "#3dff8b", last: "#ff5d5d", handle: "#ffffff", mark: "#c9d1e3" };
const STRIP_LIGHT = { off: "rgba(0,0,0,.09)", num: "#6b7486", tick: "rgba(0,0,0,.25)", label: "#566079", mid: "rgba(0,0,0,.35)", band: "rgba(0,0,0,.05)", gap: "rgba(255,255,255,.8)", first: "#12a150", last: "#e5484d", handle: "#30384a", mark: "#566079" };

class StripView {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    // zoom: px per LED on one scrolling row (0 = fit the width, wrapping if needed); ruler: LED numbers above
    this.o = Object.assign({ max: 26, min: 9, labels: false, zoom: 0, ruler: false }, opts);
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
      canvas.style.touchAction = "pan-y";
      // The ends are easier to grab than one LED: a few pixels either side count too (more for fingers).
      const zone = (i, e) => {
        if (!this.sel || i === null) return "new";
        const lo = Math.min(this.sel.start, this.sel.end), hi = Math.max(this.sel.start, this.sel.end);
        if (i === lo && i === hi) return "hi";
        const reach = Math.round((e && e.pointerType === "touch" ? 20 : 7) / this.layout().size);
        const tol = Math.max(0, Math.min(reach, Math.floor((hi - lo - 1) / 2)));
        const dLo = i - lo, dHi = hi - i; // both positive inside the bar
        if (dLo >= 0 && dLo <= tol) return "lo";
        if (dHi >= 0 && dHi <= tol) return "hi";
        if (dLo < 0 && -dLo <= reach) return "lo";
        if (dHi < 0 && -dHi <= reach) return "hi";
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
        const z = zone(i, e);
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
          const z = zone(this.ledAt(e), e);
          canvas.style.cursor = z === "move" ? "grab" : z === "new" ? "crosshair" : "ew-resize";
          return;
        }
        const box = this.o.zoom && canvas.parentElement;
        if (box) {
          // dragging near the edge of a zoomed strip scrolls it along
          const r = box.getBoundingClientRect();
          if (e.clientX > r.right - 28) box.scrollLeft += 14;
          else if (e.clientX < r.left + 28) box.scrollLeft -= 14;
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
    const n = Math.max(1, this.pixels.length);
    const top = this.o.ruler ? 14 : 0;
    const extra = this.o.labels ? 16 : 6;
    if (this.o.zoom) {
      const size = this.o.zoom;
      return { w: n * size, n, size, perRow: n, rows: 1, top, rowH: top + size + extra, x0: 0 };
    }
    const w = Math.max(120, this.c.clientWidth || this.c.parentElement?.clientWidth || 600);
    let size = Math.min(this.o.max, w / n);
    let perRow = n;
    if (size < this.o.min) {
      perRow = Math.max(1, Math.floor(w / this.o.min));
      size = w / perRow;
    }
    const rows = Math.ceil(n / perRow);
    return { w, n, size, perRow, rows, top, rowH: top + size + extra, x0: (w - size * Math.min(n, perRow)) / 2 };
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

  get light() {
    const root = this.c.getRootNode();
    return !!(root && root.host && root.host.hasAttribute("light"));
  }

  draw() {
    const light = this.light;
    const P = light ? STRIP_LIGHT : STRIP_DARK;
    const wide = this.o.zoom ? Math.max(1, this.pixels.length) * this.o.zoom + "px" : "";
    if (this.c.style.width !== wide) this.c.style.width = wide;
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
    const pos = (i) => [L.x0 + (i % L.perRow) * L.size + L.size / 2, Math.floor(i / L.perRow) * L.rowH + L.top + L.size / 2];
    const rad = L.size * 0.34;
    if (this.o.ruler) {
      // LED numbers, as often as they fit
      const step = [1, 2, 5, 10, 20, 25, 50, 100].find((k) => k * L.size >= 30) || 100;
      g.font = "9.5px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "top";
      for (let i = 0; i < L.n; i += step) {
        const [x, y] = pos(i);
        g.fillStyle = P.num;
        g.fillText(String(i), Math.max(x, 7), y - L.size / 2 - L.top + 1);
        g.fillStyle = P.tick;
        g.fillRect(x - 0.5, y - L.size / 2 - 3, 1, 3);
      }
      g.textAlign = "left";
    }
    const disp = (v) => Math.round(255 * Math.pow(v / 255, 0.5));

    // the selection as a band behind its LEDs: [x, y, width, height] for each row it is on
    const band = [];
    if (this.sel) {
      const lo = Math.min(this.sel.start, this.sel.end), hi = Math.min(L.n - 1, Math.max(this.sel.start, this.sel.end));
      const half = Math.min(L.size / 2, rad + 3.5);
      for (let a = lo; a <= hi; a = (Math.floor(a / L.perRow) + 1) * L.perRow) {
        const b = Math.min(hi, (Math.floor(a / L.perRow) + 1) * L.perRow - 1);
        const [x0, y] = pos(a), [x1] = pos(b);
        band.push([x0 - L.size / 2 + 1, y - half, x1 - x0 + L.size - 2, half * 2]);
      }
      g.fillStyle = P.band;
      for (const [x, y, w, hh] of band) {
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, hh, hh / 2);
        else g.rect(x, y, w, hh);
        g.fill();
      }
    }

    for (let i = 0; i < L.n; i++) {
      const [x, y] = pos(i);
      const p = this.pixels[i] || [0, 0, 0];
      const level = Math.max(p[0], p[1], p[2]);
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      if (level <= 0) {
        g.shadowBlur = 0;
        g.fillStyle = P.off;
      } else if (light) {
        // on a light surface an LED can't glow: show its full colour, fading towards the surface as it dims
        const a = Math.max(0.22, Math.pow(level / 255, 0.5));
        const col = p.map((v) => Math.round(((v / level) * 235 * a) + 238 * (1 - a)));
        g.shadowColor = `rgba(${p.map((v) => Math.round((v / level) * 200)).join(",")},${0.55 * a})`;
        g.shadowBlur = L.size * 0.3;
        g.fillStyle = `rgb(${col.join(",")})`;
        g.fill();
        // a hairline keeps white and yellow LEDs visible
        g.shadowBlur = 0;
        g.lineWidth = 1;
        g.strokeStyle = `rgba(0,0,0,${0.1 + 0.12 * a})`;
        g.stroke();
        continue;
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
        g.fillStyle = P.label;
        // keep the name inside the canvas when its bar starts near the right edge
        g.fillText(rg.label, Math.max(2, Math.min(x - L.size / 2 + 2, L.w - g.measureText(rg.label).width - 2)), y + L.size / 2 + 5);
      }
    }

    if (this.sel) {
      // one outline around the whole selection (one piece per row), so nothing overlaps however small the LEDs are
      g.lineWidth = 1.5;
      g.strokeStyle = P.mid;
      for (const [x, y, w, hh] of band) {
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, hh, hh / 2);
        else g.rect(x, y, w, hh);
        g.stroke();
      }
      // the two ends: green where the bar begins, red where it is full; in the picker they are the grab handles
      const lo = Math.min(this.sel.start, this.sel.end), hi = Math.max(this.sel.start, this.sel.end);
      for (const [i, side] of [[lo, -1], [hi, 1]]) {
        if (i >= L.n) continue;
        const [x, y] = pos(i);
        const first = lo === hi ? side === -1 : i === this.sel.start;
        const hx = x + side * (L.size / 2 - 1.5) - 2.5;
        g.fillStyle = first ? P.first : P.last;
        g.strokeStyle = P.gap;
        g.lineWidth = 1;
        g.beginPath();
        if (g.roundRect) g.roundRect(hx, y - L.size / 2 - 1, 5, L.size + 2, 2.5);
        else g.rect(hx, y - L.size / 2 - 1, 5, L.size + 2);
        g.fill();
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
  --wb-text:var(--primary-text-color,#e6e9ef);--wb-dim:var(--secondary-text-color,#9aa3b5);
  --wb-accent:var(--primary-color,#4f8cff);--wb-on-accent:var(--text-primary-color,#fff);
  --wb-ok:var(--success-color,#3fbf6f);--wb-warn:var(--warning-color,#ffa600);--wb-err:var(--error-color,#e5484d);
  --wb-field:color-mix(in srgb,var(--wb-text) 7%,transparent);
  --wb-tint:color-mix(in srgb,var(--wb-accent) 14%,transparent);
  --wb-r:var(--ha-card-border-radius,12px);--wb-r-sm:8px;--wb-shadow:var(--ha-card-box-shadow,none);
  --wb-stage:#0a0c11;--wb-t:.16s ease}
*{box-sizing:border-box}
.top{display:flex;align-items:center;gap:8px;padding:6px 16px;height:52px;background:var(--app-header-background-color,var(--wb-card));
  color:var(--app-header-text-color,inherit);position:sticky;top:0;z-index:5;border-bottom:1px solid var(--wb-line)}
.top h1{font-size:18px;font-weight:500;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .btn{border-color:color-mix(in srgb,currentColor 30%,transparent)}
.top .btn.pri{background:var(--app-header-text-color,var(--wb-accent));color:var(--app-header-background-color,var(--wb-on-accent));border-color:transparent}
.top select{color:inherit;border-color:color-mix(in srgb,currentColor 30%,transparent)}
.wrap{max-width:1100px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}
.wrap.enter{animation:wbfade .2s ease}
.card{background:var(--wb-card);border:1px solid var(--wb-line);border-radius:var(--wb-r);padding:16px;box-shadow:var(--wb-shadow)}
.card h2{margin:0 0 4px;font-size:15px;font-weight:600}
.dim{color:var(--wb-dim)} .sm{font-size:12px}
.stage{background:var(--wb-stage);border-radius:var(--wb-r-sm);padding:14px 12px 8px;position:relative}
:host([light]){--wb-stage:color-mix(in srgb,var(--wb-text) 5%,var(--wb-card))}
:host([light]) .stage{box-shadow:inset 0 0 0 1px var(--wb-line)}
:host([light]) .scroller{scrollbar-color:rgba(0,0,0,.25) transparent}
.stage canvas{display:block;width:100%}
.scroller{overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;scrollbar-color:#3a4152 transparent;padding-bottom:4px}
button,select,input{font:inherit;color:inherit}
button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--wb-accent);outline-offset:2px}
svg.i{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:-2px}
svg.i.dots{stroke-width:2.8}
.btn{border:1px solid var(--wb-line);background:transparent;border-radius:var(--wb-r-sm);padding:7px 12px;cursor:pointer;white-space:nowrap;
  display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:border-color var(--wb-t),background var(--wb-t),color var(--wb-t),opacity var(--wb-t)}
.sic{display:inline-flex;color:var(--wb-accent)}
.btn:hover{border-color:var(--wb-accent)}
.btn:disabled{opacity:.35;cursor:default;border-color:var(--wb-line)}
.btn.pri{background:var(--wb-accent);border-color:var(--wb-accent);color:var(--wb-on-accent);font-weight:600}
.btn.pri:hover{filter:brightness(1.08)}
.btn.danger:hover{border-color:var(--wb-err);color:var(--wb-err)}
.btn.on{background:var(--wb-tint);border-color:var(--wb-accent)}
.btn.xs{padding:3px 8px;font-size:12px;border-radius:7px}
.btn.icon{padding:7px 9px}
.rowx{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.grow{flex:1;min-width:0}
select,input[type=text],input[type=number],input[type=time]{background:var(--wb-field);border:1px solid var(--wb-line);border-radius:var(--wb-r-sm);
  padding:6px 8px;min-width:0;color:var(--wb-text);transition:border-color var(--wb-t)}
select:hover,input[type=text]:hover,input[type=number]:hover,input[type=time]:hover{border-color:color-mix(in srgb,var(--wb-accent) 60%,var(--wb-line))}
select{max-width:100%}
select option{background:var(--wb-card);color:var(--wb-text)}
input[type=number]{width:84px}
input[type=color]{width:38px;height:30px;padding:0;border:1px solid var(--wb-line);border-radius:var(--wb-r-sm);background:none;cursor:pointer}
input[type=range]{accent-color:var(--wb-accent);flex:1;min-width:90px}
input.sw{appearance:none;width:36px;height:20px;border-radius:20px;background:color-mix(in srgb,var(--wb-text) 28%,transparent);position:relative;cursor:pointer;
  transition:background var(--wb-t);flex:none;margin:0}
input.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left var(--wb-t);box-shadow:0 1px 3px rgba(0,0,0,.35)}
input.sw:checked{background:var(--wb-accent)} input.sw:checked::after{left:18px}
.bars{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.bar{background:var(--wb-card);border:1px solid var(--wb-line);border-radius:var(--wb-r);padding:12px;display:flex;flex-direction:column;gap:8px;
  box-shadow:var(--wb-shadow);transition:opacity var(--wb-t),outline-color var(--wb-t),transform var(--wb-t)}
.bar.off .stage,.bar.off .name{opacity:.55}
.bar .name{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar .stage canvas{transition:opacity .3s ease}
.pct{font-variant-numeric:tabular-nums;font-weight:600}
.st{display:flex;align-items:center;gap:7px;font-size:12.5px;min-height:18px}
.st span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpl{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-top:10px}
.tpl button{text-align:left;border:1px solid var(--wb-line);background:transparent;border-radius:var(--wb-r);padding:12px;cursor:pointer;
  display:flex;flex-direction:column;gap:4px;transition:border-color var(--wb-t),background var(--wb-t),transform var(--wb-t)}
.tpl button:hover{border-color:var(--wb-accent);background:var(--wb-tint);transform:translateY(-1px)} .tpl .ic{display:flex;color:var(--wb-accent);margin-bottom:4px}
.editor{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.namerow{gap:12px}
.namenote{display:flex;align-items:flex-start;gap:6px;margin-top:-6px} .namenote.warn{color:var(--wb-warn)} .namenote .i{flex:none;margin-top:2px}
.namerow input[type=text]{font-size:16px;font-weight:600;min-width:150px;flex:1 1 150px;padding:8px 10px}
.sticky{position:sticky;top:60px;z-index:4;background:var(--wb-card);border:1px solid var(--wb-line);border-radius:var(--wb-r);padding:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.25);transition:padding var(--wb-t)}
.sim{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
details{background:var(--wb-card);border:1px solid var(--wb-line);border-radius:var(--wb-r);overflow:hidden;box-shadow:var(--wb-shadow)}
summary{cursor:pointer;padding:12px 16px;font-weight:600;display:flex;align-items:center;gap:10px;list-style:none}
summary::-webkit-details-marker{display:none}
summary::after{content:"▾";margin-left:auto;color:var(--wb-dim);transition:transform var(--wb-t)}
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
.item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border:1px solid var(--wb-line);border-radius:var(--wb-r-sm)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid var(--wb-line);border-radius:20px;padding:3px 10px 3px 4px;display:flex;align-items:center;gap:6px;cursor:pointer;background:none;font-size:12px;
  transition:border-color var(--wb-t),background var(--wb-t)}
.chip:hover{border-color:var(--wb-accent)} .chip i{width:34px;height:14px;border-radius:8px;display:block}
.bc{padding:0}
.bh{display:flex;align-items:center;gap:10px;padding:14px 16px 8px;font-weight:600;font-size:15px;flex-wrap:wrap}
.bh small{font-weight:400;font-size:13px;color:var(--wb-dim)}
.step{width:24px;height:24px;border-radius:50%;background:var(--wb-accent);color:var(--wb-on-accent);font-size:13px;display:grid;place-items:center;flex:none}
.step.plus{background:transparent;border:1px dashed var(--wb-dim);color:var(--wb-dim)}
.info{grid-column:1/-1;background:var(--wb-field);border-radius:var(--wb-r-sm);padding:9px 12px;font-size:12.5px;line-height:1.45}
.divider{display:flex;align-items:center;gap:12px;color:var(--wb-dim);font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--wb-line)}
.addon{border-left:3px solid var(--wb-accent);scroll-margin:250px 0 24px}
.addon summary{flex-wrap:wrap}
.addon summary .rm{margin-left:auto;opacity:.75} .addon summary .rm:hover{opacity:1}
.addon summary::after{margin-left:4px}
.addon.flash{animation:wbflash 1.2s ease-out}
.addon.leave{animation:wbout .18s ease forwards;pointer-events:none}
@keyframes wbflash{0%{box-shadow:0 0 0 3px var(--wb-accent);transform:translateY(8px);opacity:.4}25%{transform:none;opacity:1}100%{box-shadow:0 0 0 3px transparent}}
@keyframes wbout{to{opacity:0;transform:scale(.98) translateY(-6px)}}
@keyframes wbfade{from{opacity:.4;transform:translateY(4px)}}
@keyframes wbup{from{opacity:0;transform:translate(-50%,12px)}}
.tray{border-style:dashed;box-shadow:none}
.addgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;padding:4px 16px 16px}
.add{text-align:left;border:1px solid var(--wb-line);background:transparent;border-radius:var(--wb-r-sm);padding:10px 12px;cursor:pointer;display:flex;gap:12px;align-items:center;
  transition:border-color var(--wb-t),background var(--wb-t),transform var(--wb-t)}
.add:hover{border-color:var(--wb-accent);background:var(--wb-tint);transform:translateY(-1px)}
.add .ic{display:flex;flex:none;width:26px;justify-content:center;color:var(--wb-accent)}
.add b{display:block;font-weight:600}
.add.sel{border-color:var(--wb-accent);background:var(--wb-tint)}
.add .tick{margin-left:auto;color:var(--wb-accent);font-weight:700;width:14px}
.chip.sel{border-color:var(--wb-accent);background:var(--wb-tint)}
.add small{display:block;color:var(--wb-dim);font-size:11.5px;line-height:1.3;margin-top:2px}
.map{grid-column:1/-1;position:relative;height:76px;touch-action:pan-y;user-select:none;margin:0 14px}
.map .tr{position:absolute;left:-14px;right:-14px;top:32px;height:10px;border-radius:6px;background:var(--wb-field);border:1px solid var(--wb-line)}
.map .fl{position:absolute;top:32px;height:10px;border-radius:6px}
.map .hd{position:absolute;top:22px;width:28px;height:30px;margin-left:-14px;cursor:grab;display:grid;place-items:center;z-index:2}
.map .hd::after{content:"";width:16px;height:26px;border-radius:8px;background:#fff;border:2px solid var(--wb-accent);box-shadow:0 2px 6px rgba(0,0,0,.4)}
.map .hd:active{cursor:grabbing}
.map .lb{position:absolute;top:0;transform:translateX(-50%);font-size:11.5px;white-space:nowrap;color:var(--wb-dim)}
.map .lb b{color:var(--wb-text)}
.map .now{position:absolute;top:26px;width:2px;height:30px;margin-left:-1px;background:var(--wb-text);opacity:.9;z-index:1}
.map .ends{position:absolute;left:-14px;right:-14px;top:58px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--wb-dim);opacity:.7;pointer-events:none}
.map .nl{position:absolute;top:58px;transform:translateX(-50%);font-size:11.5px;white-space:nowrap;color:var(--wb-dim)}
.tb{position:relative;height:54px;touch-action:pan-y;user-select:none;margin:0 14px;flex:1 1 100%}
.tb .tr{position:absolute;left:0;right:0;top:22px;height:22px;border-radius:7px;background:var(--wb-field);border:1px solid var(--wb-line);
  background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc(25% - 1px),var(--wb-line) calc(25% - 1px),var(--wb-line) 25%)}
.tb .fl{position:absolute;top:22px;height:22px;background:color-mix(in srgb,var(--wb-accent) 55%,transparent);cursor:grab}
.tb .hd{position:absolute;top:16px;width:28px;height:34px;margin-left:-14px;cursor:ew-resize;display:grid;place-items:center;z-index:2}
.tb .hd::after{content:"";width:8px;height:30px;border-radius:5px;background:#fff;border:1px solid var(--wb-accent);box-shadow:0 2px 6px rgba(0,0,0,.4)}
.tb .tl{position:absolute;top:0;transform:translateX(-50%);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 3px}
.tb .now{position:absolute;top:18px;width:2px;height:30px;margin-left:-1px;background:var(--wb-warn);z-index:1;pointer-events:none}
.tbx{display:flex;justify-content:space-between;font-size:10.5px;color:var(--wb-dim);margin:0 6px;flex:1 1 100%}
.cond{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px;border:1px solid var(--wb-line);border-radius:var(--wb-r-sm)}
.cond .ttl{font-weight:600;display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.dot{width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--wb-text) 35%,transparent);flex:none}
.dot.yes{background:var(--wb-ok);box-shadow:0 0 6px color-mix(in srgb,var(--wb-ok) 60%,transparent)}
.dot.warn{background:var(--wb-warn)} .dot.bad{background:var(--wb-err)}
.days{display:flex;gap:4px}
.day{width:28px;height:28px;border-radius:50%;border:1px solid var(--wb-line);background:transparent;cursor:pointer;font-size:12px;padding:0;
  transition:background var(--wb-t),border-color var(--wb-t)}
.day.on{background:var(--wb-accent);border-color:var(--wb-accent);color:var(--wb-on-accent);font-weight:600}
.day.today:not(.on){border-color:var(--wb-accent)}
.seg{display:inline-flex;border:1px solid var(--wb-line);border-radius:var(--wb-r-sm);overflow:hidden}
.seg button{border:0;background:transparent;padding:5px 10px;cursor:pointer;font-size:12.5px;transition:background var(--wb-t)}
.seg button+button{border-left:1px solid var(--wb-line)}
.seg button.on{background:var(--wb-accent);color:var(--wb-on-accent)}
.link{border:0;background:none;color:var(--wb-accent);cursor:pointer;padding:0;font-size:12.5px;text-decoration:underline}
.bar.dragging{opacity:.45;transform:scale(.98)}
.bar.over{outline:2px dashed var(--wb-accent);outline-offset:2px}
.grip{cursor:grab;color:var(--wb-dim);display:inline-grid;place-items:center;width:28px;height:28px;margin:-4px -4px -4px -8px;user-select:none;touch-action:none;border-radius:6px}
.grip:hover{background:var(--wb-field)} .grip:active{cursor:grabbing}
input.bad{border-color:var(--wb-warn)}
.epop{position:fixed;z-index:50;background:var(--wb-card);border:1px solid var(--wb-accent);border-radius:var(--wb-r-sm);overflow:auto;box-shadow:0 12px 32px rgba(0,0,0,.5)}
.er{padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--wb-line)}
.er:last-child{border-bottom:0}
.er:hover,.er.cur{background:var(--wb-tint)}
.en{display:flex;justify-content:space-between;gap:10px} .en b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.en span{color:var(--wb-dim);white-space:nowrap;font-variant-numeric:tabular-nums}
.ei{font-size:11px;color:var(--wb-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{text-align:center;padding:28px 12px}
.banner{background:color-mix(in srgb,var(--wb-warn) 14%,transparent);border:1px solid color-mix(in srgb,var(--wb-warn) 45%,transparent);border-radius:var(--wb-r-sm);padding:8px 12px}
dialog{background:var(--wb-card);color:inherit;border:1px solid var(--wb-line);border-radius:var(--wb-r);padding:0;max-width:min(620px,94vw);width:100%}
dialog::backdrop{background:rgba(0,0,0,.55)}
dialog .sec{grid-template-columns:1fr}
.toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;background:var(--wb-card);color:var(--wb-text);border:1px solid var(--wb-line);
  border-radius:999px;padding:7px 8px 7px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);max-width:92vw;animation:wbup .2s ease}
.toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tlg{display:grid;grid-template-columns:minmax(80px,150px) minmax(0,1fr);gap:6px 10px;align-items:center;margin-top:12px}
.tln{display:flex;align-items:center;gap:7px;min-width:0;border:0;background:none;padding:0;cursor:pointer;text-align:left}
.tln b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .tln:hover b{color:var(--wb-accent)}
.tln.off{opacity:.5}
.tlt{position:relative;height:24px;border-radius:6px;background:var(--wb-field);touch-action:pan-y;user-select:none;
  background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc(12.5% - 1px),var(--wb-line) calc(12.5% - 1px),var(--wb-line) 12.5%)}
.tlb{position:absolute;top:0;bottom:0;cursor:grab;overflow:hidden;font-size:11px;line-height:24px;padding:0 7px;white-space:nowrap;color:#fff;
  text-shadow:0 1px 2px rgba(0,0,0,.7);font-variant-numeric:tabular-nums}
.tlb:active{cursor:grabbing}
.tlb.na{opacity:.3;background-image:repeating-linear-gradient(135deg,rgba(0,0,0,.35) 0 3px,transparent 3px 7px)}
.tlany{position:absolute;inset:0;border-radius:6px;font-size:11px;line-height:24px;padding:0 8px;color:var(--wb-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:crosshair}
.tlany i{position:absolute;inset:0;border-radius:6px;opacity:.22}
.tlany span{position:relative}
.tlh{position:absolute;top:-2px;bottom:-2px;width:16px;margin-left:-8px;cursor:ew-resize;z-index:2;display:grid;place-items:center}
.tlh::after{content:"";width:4px;height:16px;border-radius:3px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.tlo{position:absolute;bottom:0;height:7px;pointer-events:none;z-index:1;border-radius:0 0 6px 6px;
  background:repeating-linear-gradient(135deg,var(--wb-text) 0 3px,transparent 3px 7px);opacity:.75}
.tlnew{position:absolute;top:0;bottom:0;border-radius:6px;background:var(--wb-tint);border:1px dashed var(--wb-accent);pointer-events:none}
.tlnow{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--wb-warn);z-index:3;pointer-events:none}
.tlx{display:flex;justify-content:space-between;font-size:10.5px;color:var(--wb-dim);font-variant-numeric:tabular-nums}
.ge{grid-column:1/-1;position:relative;height:60px;margin:0 14px;touch-action:pan-y;user-select:none}
.ge .gb{position:absolute;left:-14px;right:-14px;top:0;height:28px;border-radius:var(--wb-r-sm);border:1px solid var(--wb-line);cursor:copy}
.ge .gs{position:absolute;top:16px;width:36px;height:42px;margin-left:-18px;display:grid;place-items:center;cursor:grab;z-index:2;transition:opacity var(--wb-t)}
.ge .gs i{display:block;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.4);transition:transform var(--wb-t),box-shadow var(--wb-t)}
.ge .gs.sel i{transform:scale(1.18);box-shadow:0 0 0 3px var(--wb-accent),0 2px 6px rgba(0,0,0,.4)}
.ge .gs.out{opacity:.25}
.ge .gs:active{cursor:grabbing}
@media(max-width:600px){.f{flex-wrap:wrap}.f>.fl{flex:1 0 100%}.wrap{padding:10px;gap:12px}.top{padding:6px 8px}.top .lbl{display:none}.top .opt{display:none}
  .sticky{top:56px;padding:8px}.sticky .stage{padding:10px 8px 4px}.card{padding:12px}.sec{padding:4px 12px 12px}.bh{padding:12px 12px 6px}}
@media(max-width:700px),(max-height:640px){.sticky.compact .simx,.sticky.compact .wide{display:none !important}.sticky.compact .sim{margin-top:6px}
  .sticky.compact{padding:6px 8px}.sticky.compact .stage{padding:8px 8px 2px}}
@media(pointer:coarse){.btn{min-height:40px}.btn.xs{min-height:34px;padding:5px 10px}.day{width:36px;height:36px}.seg button{padding:9px 12px}
  .grip{width:40px;height:40px}.chip{min-height:32px}input[type=range]{min-height:32px}.tlt{height:32px}.tlb,.tlany{line-height:32px}}
@media(prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important}}
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
    this._zoomIdx = 0;
    this._hist = [];
    this._redo = [];
    // a drag counts as one undo step, so remember whether a pointer is down
    this.shadowRoot.addEventListener("pointerdown", () => { this._pointerDown = true; }, true);
    for (const ev of ["pointerup", "pointercancel"]) this.shadowRoot.addEventListener(ev, () => { this._pointerDown = false; }, true);
    this._onKey = (e) => {
      if (this._view !== "edit" || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = e.composedPath()[0];
      // text boxes keep their own undo
      if (el && el.tagName === "INPUT" && ["text", "number", "time"].includes(el.type)) return;
      e.preventDefault();
      if (e.shiftKey) this._redoStep(); else this._undo();
    };
  }

  set hass(hass) {
    this._hass = hass;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu) menu.hass = hass;
    if (hass.themes !== this._themes || !this._toned) {
      this._themes = hass.themes;
      this._toned = true;
      if (applyTone(this, hass)) this._liveDirty = true;
    }
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
    window.addEventListener("keydown", this._onKey);
    if (this._loaded && this._entry && !this._unsub) this._subscribe();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("keydown", this._onKey);
    this._io?.disconnect();
    this._unsubscribe();
    this._stripPreview(false);
  }

  ws(type, data = {}) {
    return this._hass.callWS({ type: `${DOMAIN}/${type}`, ...data });
  }

  async _load() {
    this._stale = await staleCheck(this._hass);
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
    if (this._devices.length > 1) this._loadOthers();
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
    root.append(h("style", {}, CSS + STALE_CSS));
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
      top.append(h("button", { class: "btn", title: "Device settings", onclick: () => this._settingsDialog() }, ic("settings"), h("span", { class: "lbl" }, "Device settings")));
    }
    if (this._view === "list") {
      top.append(h("button", { class: "btn", title: "Choose which extras each preset starts with", onclick: () => this._presetsDialog() }, ic("presets"), h("span", { class: "lbl" }, "Preset defaults")));
    }
    this._undoBtn = this._redoBtn = null;
    if (this._view === "edit") top.append(...this._editorButtons());
    root.append(top);
    const wrap = h("div", { class: "wrap" + (this._view !== this._shownView ? " enter" : "") });
    this._shownView = this._view;
    root.append(wrap);
    if (this._toastEl) root.append(this._toastEl);
    this._tlNow = [];
    const stale = staleNotice(this._stale);
    if (stale) wrap.append(stale);
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
    this._liveStrip = new StripView(canvas, { labels: true, ruler: true, max: 22, onClick: (led) => {
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
      wrap.append(this._timelineCard());
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
    if (s.type === "timestamp") return s.end_entity ? `until ${s.end_entity}` : bar.kind === "event" ? "No event chosen yet" : "No finish-time entity yet";
    if (s.type === "window") return `daily ${s.window_start}–${s.window_end}`;
    if (s.type === "distance") return s.entity ? `${s.entity} → ${(s.to_zone || "zone.home").replace(/^zone\./, "")}` : "Nobody chosen yet";
    if (s.type === "media") return s.entity ? `${s.entity} · playback` : "No media player chosen yet";
    if (s.type === "ratio") return s.entity && s.entity2 ? `${s.entity} ÷ ${s.entity2}` : "Sensors not chosen yet";
    return "manual / automation";
  }

  _barCard(bar, i) {
    const canvas = h("canvas");
    const strip = new StripView(canvas, { max: 16, min: 5 });
    strip.barRef = bar;
    strip.index = i;
    this._strips.push(strip);
    strip.pctEl = h("span", { class: "pct" }, "–");
    strip.dotEl = h("span", { class: "dot" });
    strip.stEl = h("span", {}, "…");
    const when = bar.visibility.conditions.map((c) => condText(c, (id) => this._name(id))).filter(Boolean).join(bar.visibility.match === "any" ? "  or  " : "  and  ");
    const grip = h("span", { class: "grip", title: "Drag to reorder. Where bars share LEDs, the one further down the list is drawn on top." }, ic("grip", 16));
    const card = h("div", { class: "bar" + (bar.enabled ? "" : " off") },
      h("div", { class: "rowx" },
        grip,
        h("span", { style: `width:10px;height:10px;border-radius:50%;background:${this._barColor(i)}` }),
        h("div", { class: "grow name" }, bar.name), strip.pctEl),
      h("div", { class: "stage", style: "padding:8px 8px 2px" }, canvas),
      h("div", { class: "st" }, strip.dotEl, strip.stEl),
      h("div", { class: "dim sm", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" },
        `LED ${bar.start} → ${bar.end} · ${this._sourceText(bar)}`),
      when && h("div", { class: "dim sm", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, ic("clock", 13), ` Only ${when}`),
      h("div", { class: "rowx" },
        h("button", { class: "btn pri", onclick: () => this._edit(i) }, "Edit"),
        h("button", { class: "btn xs", onclick: () => this._duplicate(i) }, "Duplicate"),
        this._devices.length > 1 && h("button", { class: "btn xs", title: "Put a copy of this bar on another strip", onclick: () => this._copyDialog(i) }, "Copy to…"),
        h("button", { class: "btn xs danger", onclick: () => this._delete(i) }, "Delete"),
        h("span", { class: "grow" }),
        h("input", { type: "checkbox", class: "sw", title: "Enabled", checked: !!bar.enabled,
          onchange: async (e) => {
            const bars = clone(this._bars);
            bars[i].enabled = e.target.checked;
            await this._saveBars(bars);
            this._render();
          } }))
    );
    card.dataset.index = i;
    // reorder by dragging the grip: works with a mouse and with a finger
    const clear = () => { for (const el of this.shadowRoot.querySelectorAll(".bar.over")) el.classList.remove("over"); };
    dragHandle(grip, () => { card.classList.add("dragging"); return { to: i }; },
      (e, ctx) => {
        const over = this.shadowRoot.elementFromPoint(e.clientX, e.clientY)?.closest?.(".bar");
        clear();
        ctx.to = over ? Number(over.dataset.index) : i;
        if (over && ctx.to !== i) over.classList.add("over");
      },
      (ctx) => { card.classList.remove("dragging"); clear(); this._move(i, ctx.to); });
    return card;
  }

  _name(id) {
    return this._hass?.states?.[id]?.attributes?.friendly_name || id;
  }

  // One line saying what a bar is doing right now, and why if it is hidden.
  _statusOf(bar, i) {
    return barStatus(bar, i, { bars: this._bars, live: this._live.bars, enabled: this._settings.enabled, states: this._hass?.states });
  }

  // Small message at the bottom of the screen, with an Undo button when there is something to undo.
  _toast(text, undo) {
    clearTimeout(this._toastTimer);
    this._toastEl?.remove();
    const el = h("div", { class: "toast", role: "status" }, h("span", {}, text),
      undo ? h("button", { class: "btn xs pri", onclick: async () => { this._toastEl = null; el.remove(); await undo(); } }, ic("undo", 13), "Undo") : h("span", { style: "width:8px" }));
    this._toastEl = el;
    this.shadowRoot.append(el);
    this._toastTimer = setTimeout(() => { if (this._toastEl === el) this._toastEl = null; el.remove(); }, 8000);
  }

  // Save the bar list as it is now and offer to put `before` back.
  async _commit(before, text) {
    await this._saveBars(this._bars);
    this._render();
    this._toast(text, async () => { await this._saveBars(before); this._render(); });
  }

  // 24 hours, one row per bar: when each bar may show, and where bars on the same LEDs collide.
  _timelineCard() {
    const bars = this._bars;
    const now = new Date();
    const today = (now.getDay() + 6) % 7;
    const day = this._tlDay ?? today;
    const dateAt = (m) => new Date(2024, 0, 1 + day, 0, m, 30); // 1 Jan 2024 was a Monday
    const timeConds = (b) => b.visibility.conditions.filter((c) => c && c.type === "time");
    const timeOn = (b, m) => {
      const tc = timeConds(b);
      if (!tc.length) return true;
      const hits = tc.map((c) => condOk(c, () => null, dateAt(m)));
      if (b.visibility.match === "any") return b.visibility.conditions.length > tc.length || hits.some(Boolean);
      return hits.every(Boolean);
    };
    const pct = (m) => `${(m / 1440) * 100}%`;
    const grid = h("div", { class: "tlg" });
    const paints = [];
    let striped = false;
    const repaint = () => { striped = false; for (const fn of paints) fn(); legend.style.display = striped ? "" : "none"; };
    const legend = h("div", { class: "dim sm", style: "margin-top:8px" }, "Striped: a bar further down the list shares these LEDs and is drawn on top then.");
    bars.forEach((bar, i) => {
      const color = this._barColor(i);
      const track = h("div", { class: "tlt" });
      const toMin = (e) => {
        const r = track.getBoundingClientRect();
        return Math.round((E.clamp((e.clientX - r.left) / r.width) * 1440) / 15) * 15;
      };
      const finish = (ctx) => {
        if (JSON.stringify(ctx.before) !== JSON.stringify(this._bars)) this._commit(ctx.before, `Changed when “${bar.name}” shows`);
      };
      const tc = timeConds(bar);
      if (!tc.length) {
        const others = bar.visibility.conditions.map((c) => condText(c, (id) => this._name(id))).filter(Boolean);
        const any = h("div", { class: "tlany", title: "Drag across to limit this bar to certain hours" },
          h("i", { style: `background:${color}` }),
          h("span", {}, others.length ? `Whenever ${others.join(bar.visibility.match === "any" ? " or " : " and ")}` : "Any time"));
        const ghost = h("div", { class: "tlnew", style: "display:none" });
        const span = (ctx) => [Math.min(ctx.at, ctx.to ?? ctx.at), Math.max(ctx.at, ctx.to ?? ctx.at)];
        dragHandle(any, (e) => ({ at: toMin(e) }),
          (e, ctx) => {
            ctx.to = toMin(e);
            const [a, b] = span(ctx);
            ghost.style.display = b - a >= 30 ? "" : "none";
            ghost.style.left = pct(a);
            ghost.style.width = pct(b - a);
          },
          (ctx) => {
            ghost.style.display = "none";
            const [a, b] = span(ctx);
            if (b - a < 30) return;
            const before = clone(this._bars);
            bar.visibility.conditions.push({ type: "time", start: hhmm(a), end: hhmm(b), days: [] });
            this._commit(before, `“${bar.name}” now shows ${hhmm(a)}–${hhmm(b)}`);
          });
        track.append(any, ghost);
      }
      for (const c of tc) {
        const pA = h("div", { class: "tlb", style: `background:${color}` }), pB = h("div", { class: "tlb", style: `background:${color}` });
        const hS = h("div", { class: "tlh", title: "Drag to change the start" }), hE = h("div", { class: "tlh", title: "Drag to change the end" });
        paints.push(() => {
          const st = parseHM(c.start) ?? 0;
          let en = parseHM(c.end) ?? 0;
          const allDay = st === en;
          if (en === 0 && !allDay) en = 1440;
          const wrap = !allDay && st > en;
          const dayOk = (x) => !Array.isArray(c.days) || !c.days.length || c.days.includes(x);
          pA.style.left = allDay ? "0" : pct(st);
          pA.style.width = allDay ? "100%" : pct((wrap ? 1440 : en) - st);
          pA.style.borderRadius = wrap ? "6px 0 0 6px" : "6px";
          pA.classList.toggle("na", !dayOk(day));
          pA.textContent = allDay ? "All day" : `${c.start}–${c.end}`;
          pA.title = (allDay ? "All day" : `${c.start}–${c.end}`) + daysText(c.days) + (dayOk(day) ? "" : ` · not on ${DAY_NAMES[day]}`);
          pB.style.display = wrap ? "" : "none";
          pB.style.left = "0";
          pB.style.width = pct(en);
          pB.style.borderRadius = "0 6px 6px 0";
          pB.classList.toggle("na", !dayOk((day + 6) % 7));
          hS.style.display = hE.style.display = allDay ? "none" : "";
          hS.style.left = pct(st);
          hE.style.left = pct(en);
        });
        const begin = () => ({ before: clone(this._bars) });
        dragHandle(hS, begin, (e) => { const m = Math.min(toMin(e), 1425); if (m !== (parseHM(c.end) ?? 0)) { c.start = hhmm(m); repaint(); } }, finish);
        dragHandle(hE, begin, (e) => { const m = toMin(e) % 1440; if (m !== (parseHM(c.start) ?? 0)) { c.end = hhmm(m); repaint(); } }, finish);
        for (const piece of [pA, pB]) {
          dragHandle(piece, (e) => ({ before: clone(this._bars), at: toMin(e), st: parseHM(c.start) ?? 0, en: parseHM(c.end) ?? 0 }),
            (e, ctx) => {
              if (ctx.st === ctx.en) return; // all day: nothing to slide
              const delta = toMin(e) - ctx.at;
              c.start = hhmm(ctx.st + delta);
              c.end = hhmm(ctx.en + delta);
              repaint();
            }, finish);
        }
        track.append(pA, pB, hS, hE);
      }
      const stripes = h("div");
      track.append(stripes);
      paints.push(() => {
        stripes.replaceChildren();
        if (!bar.enabled) return;
        const lo = Math.min(bar.start, bar.end), hi = Math.max(bar.start, bar.end);
        bars.forEach((other, k) => {
          if (k <= i || !other.enabled || Math.min(other.start, other.end) > hi || Math.max(other.start, other.end) < lo) return;
          let from = null;
          for (let m = 0; m <= 1440; m += 15) {
            const both = m < 1440 && timeOn(bar, m) && timeOn(other, m);
            if (both && from === null) from = m;
            if (!both && from !== null) {
              stripes.append(h("div", { class: "tlo", style: `left:${pct(from)};width:${pct(m - from)}` }));
              striped = true;
              from = null;
            }
          }
        });
      });
      if (day === today) {
        const line = h("div", { class: "tlnow", title: "Now" });
        this._tlNow.push(line);
        track.append(line);
      }
      grid.append(
        h("button", { class: "tln" + (bar.enabled ? "" : " off"), title: `Edit ${bar.name}`, onclick: () => this._edit(i) },
          h("span", { style: `width:10px;height:10px;border-radius:50%;flex:none;background:${color}` }), h("b", {}, bar.name)),
        track);
    });
    grid.append(h("span"), h("div", { class: "tlx" }, ["00", "03", "06", "09", "12", "15", "18", "21", "24"].map((x) => h("span", {}, x))));
    // days only matter when some bar is limited to certain days
    const usesDays = bars.some((b) => timeConds(b).some((c) => Array.isArray(c.days) && c.days.length));
    if (!usesDays) this._tlDay = undefined;
    const card = h("div", { class: "card" },
      h("div", { class: "rowx" },
        h("div", { class: "grow" }, h("h2", {}, "Through the day"),
          h("div", { class: "dim sm" }, "Drag a block to change when a bar shows, or drag across an empty row to give it hours.")),
        usesDays && h("div", { class: "days" }, DAY_LETTERS.map((letter, x) =>
          h("button", { class: "day" + (x === day ? " on" : "") + (x === today ? " today" : ""), title: DAY_NAMES[x] + (x === today ? " (today)" : ""),
            onclick: () => { this._tlDay = x; this._render(); } }, letter)))),
      grid, legend);
    repaint();
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
    if (this._draft.source.type === "distance") this._draft.source.dist_unit = this._lengthUnit();
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
    this._srcEntity = undefined;
    this._scale = null;
    this._stopSel = 0;
    this._pickScroll = 0;
    this._zoomCenter = true;
    this._render();
    window.scrollTo?.(0, 0);
  }

  async _duplicate(i) {
    const bars = clone(this._bars);
    const copy = clone(bars[i]);
    copy.id = "";
    copy.name = freeName(copy.name, bars.map((b) => b.name));
    bars.splice(i + 1, 0, copy);
    await this._saveBars(bars);
    this._render();
  }

  // ----- copy to another strip, save to a file, load from a file -----

  _copyDialog(i) {
    const bar = this._bars[i];
    const others = this._devices.filter((d) => d.entry_id !== this._entry);
    let target = others[0];
    let busy = false;
    const dlg = h("dialog");
    const draw = () => {
      dlg.innerHTML = "";
      const [a, b] = fitRange(bar.start, bar.end, this._device.led_count, target.led_count);
      const moved = a !== bar.start || b !== bar.end;
      dlg.append(
        h("div", { style: "padding:16px 16px 4px" },
          h("h2", { style: "margin:0 0 4px" }, `Copy “${bar.name}” to another strip`),
          h("div", { class: "dim sm" }, "The copy starts out the same and is then its own bar. The one here stays as it is.")),
        h("div", { class: "chips", style: "padding:10px 16px 4px" }, others.map((d) =>
          h("button", { class: "chip" + (d === target ? " sel" : ""), style: "padding:5px 12px", onclick: () => { target = d; draw(); } },
            d.name, h("span", { class: "dim" }, `${d.led_count} LEDs`)))),
        h("div", { class: "sm", style: "padding:8px 16px 14px" },
          moved ? `${target.name} is ${target.led_count} LEDs long, so the copy is fitted to LED ${a} → ${b}. You can move it afterwards.`
            : `It keeps its place: LED ${a} → ${b}.`),
        h("div", { class: "rowx", style: "padding:0 16px 16px;justify-content:flex-end" },
          h("button", { class: "btn", onclick: () => dlg.close() }, "Cancel"),
          h("button", { class: "btn pri", onclick: async () => {
            if (busy) return;
            busy = true;
            try {
              const there = await this.ws("get", { entry_id: target.entry_id });
              const [copy] = adoptBars([{ ...bar, id: "" }], there.bars, this._device.led_count, there.device.led_count);
              await this.ws("save", { entry_id: target.entry_id, bars: there.bars.concat(copy) });
              dlg.close();
              this._loadOthers();
              this._toast(`Copied “${bar.name}” to ${target.name}` + (copy.name !== bar.name ? ` as “${copy.name}”` : ""),
                async () => { await this.ws("save", { entry_id: target.entry_id, bars: there.bars }); this._loadOthers(); });
            } catch (err) {
              dlg.close();
              this._toast(`Couldn’t copy to ${target.name}: ${err?.message || err}`);
            }
          } }, "Copy")));
    };
    dlg.addEventListener("close", () => dlg.remove());
    this.shadowRoot.append(dlg);
    draw();
    dlg.showModal();
  }

  _export() {
    const dev = this._device;
    const data = { wled_bars: 1, version: VERSION, exported: new Date().toISOString(),
      device: { name: dev.name, led_count: dev.led_count }, settings: this._settings, bars: this._bars };
    const slug = dev.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "strip";
    const day = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = h("a", { href: url, download: `wled-bars-${slug}-${day}.json`, style: "display:none" });
    this.shadowRoot.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // Ask for a file, then show what is in it before anything changes.
  _import() {
    const input = h("input", { type: "file", accept: ".json,application/json", style: "display:none", onchange: async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      let found = null;
      try { found = readExport(await file.text()); } catch (_e) { /* unreadable */ }
      if (found) this._importDialog(found, file.name);
      else this._toast(`“${file.name}” isn’t a file saved from WLED Bars`);
    } });
    this.shadowRoot.append(input);
    input.click();
  }

  _importDialog(file, filename) {
    const here = this._device;
    let mode = this._bars.length ? "add" : "replace";
    let withSettings = false;
    let busy = false;
    const refit = here.led_count > 0 && file.bars.some((b) => Math.max(b.start, b.end) >= here.led_count);
    const n = file.bars.length;
    const from = [file.name && `“${file.name}”`, file.led_count && `${file.led_count} LEDs`, file.exported && `saved ${file.exported.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`]
      .filter(Boolean).join(" · ");
    const dlg = h("dialog");
    const draw = () => {
      dlg.innerHTML = "";
      const seg = (val, label) => h("button", { class: mode === val ? "on" : "", onclick: () => { mode = val; draw(); } }, label);
      dlg.append(
        h("div", { style: "padding:16px 16px 4px" },
          h("h2", { style: "margin:0 0 4px" }, "Load bars from a file"),
          h("div", { class: "dim sm" }, from || filename)),
        h("div", { class: "sm", style: "padding:10px 16px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" },
          h("b", {}, `${n} bar${n === 1 ? "" : "s"}: `), file.bars.map((b) => b.name).join(", ")),
        this._bars.length > 0 && h("div", { style: "padding:12px 16px 0" }, h("span", { class: "seg" }, seg("add", "Add to the bars here"), seg("replace", "Replace the bars here"))),
        h("div", { class: "dim sm", style: "padding:8px 16px 0" },
          [mode === "replace" && this._bars.length ? `The ${this._bars.length === 1 ? "bar" : `${this._bars.length} bars`} on ${here.name} will be removed.` : "",
            refit ? `${here.name} is ${here.led_count} LEDs long, so the bars are fitted to its length.` : ""].filter(Boolean).join(" ")),
        file.settings && h("label", { class: "rowx sm", style: "padding:10px 16px 0;flex-wrap:nowrap;align-items:flex-start" },
          h("input", { type: "checkbox", checked: withSettings, onchange: (e) => { withSettings = e.target.checked; } }),
          h("span", {}, "Also load the device settings", h("div", { class: "dim" }, "Brightness, night dimming and how frames are sent. The WLED segment stays as it is."))),
        h("div", { class: "rowx", style: "padding:14px 16px 16px;justify-content:flex-end" },
          h("button", { class: "btn", onclick: () => dlg.close() }, "Cancel"),
          h("button", { class: "btn pri", onclick: async () => {
            if (busy) return;
            busy = true;
            const before = { bars: clone(this._bars), settings: clone(this._settings) };
            const keep = mode === "add" ? this._bars : [];
            const bars = keep.concat(adoptBars(file.bars, keep, file.led_count, here.led_count));
            const msg = { entry_id: this._entry, bars };
            if (withSettings) msg.settings = { ...file.settings, segment: this._settings.segment };
            const apply = async (m) => {
              const res = await this.ws("save", m);
              this._bars = res.bars;
              this._settings = res.settings;
              this._render();
            };
            try {
              await apply(msg);
              dlg.close();
              this._toast(`Loaded ${n} bar${n === 1 ? "" : "s"} from the file`, () => apply({ entry_id: this._entry, ...before }));
            } catch (err) {
              dlg.close();
              this._toast(`Couldn’t load the file: ${err?.message || err}`);
            }
          } }, mode === "replace" && this._bars.length ? "Replace" : "Load")));
    };
    dlg.addEventListener("close", () => dlg.remove());
    this.shadowRoot.append(dlg);
    draw();
    dlg.showModal();
  }

  // Bar names on the other strips, to warn about names an automation could not tell apart.
  async _loadOthers() {
    const others = {};
    for (const d of this._devices) {
      if (d.entry_id === this._entry) continue;
      try { others[d.name] = (await this.ws("get", { entry_id: d.entry_id })).bars.map((b) => b.name); } catch (_e) { /* skip */ }
    }
    this._others = others;
    this._syncNameNote();
  }

  _syncNameNote() {
    const el = this._nameNote;
    const d = this._draft;
    if (!el || !d || this._view !== "edit") return;
    const same = (n) => String(n).trim().toLowerCase() === d.name.trim().toLowerCase();
    let text = "", warn = false;
    if (d.name.trim()) {
      if (this._bars.some((b, k) => k !== this._draftIndex && same(b.name))) {
        warn = true;
        text = `Another bar on this strip is already called “${d.name.trim()}”. Automations that use the name can’t tell them apart.`;
      } else if (d.source.type === "manual") {
        // only bars that automations drive by name need to hear about other strips
        const where = Object.entries(this._others || {}).filter(([, names]) => names.some(same)).map(([strip]) => strip);
        if (where.length) text = `${where.join(" and ")} also ${where.length > 1 ? "have" : "has"} a bar with this name. Automations then need “device” to say which strip.`;
      }
    }
    el.style.display = text ? "" : "none";
    el.className = "namenote sm" + (warn ? " warn" : " dim");
    el.replaceChildren(...(text ? [warn ? ic("rules", 14) : "", text] : []));
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
    const before = clone(this._bars);
    this._bars = before.filter((_b, k) => k !== i);
    await this._commit(before, `Deleted “${before[i].name}”`);
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

    this._stripBtn.classList.add("wide");
    this._simExtra = h("div", { class: "sim simx", style: "margin-top:6px" }, this._liveBtn, this._doneBtn, this._unavBtn);
    this._simRange.title = "Drag to simulate a value";
    this._draftOrig = JSON.stringify(E.normalizeBar(d));
    this._nameInput = h("input", { type: "text", value: d.name, placeholder: "Bar name", oninput: (e) => { this._draft.name = e.target.value; this._syncNameNote(); } });
    this._nameNote = h("div", { style: "display:none" });
    this._enabledInput = h("input", { type: "checkbox", class: "sw", checked: !!d.enabled,
      onchange: (e) => { this._draft.enabled = e.target.checked; this._pushStrip(); } });
    const nameRow = h("div", { class: "rowx namerow" }, this._nameInput,
      h("label", { class: "rowx sm dim", title: "Turn this bar on or off" }, "Enabled", this._enabledInput));
    const head = h("div", { class: "sticky" },
      h("div", { class: "stage" }, pv),
      h("div", { class: "sim" }, this._playBtn, this._simRange, this._simOut, this._stripBtn),
      this._simExtra
    );
    // On small screens the preview shrinks to the essentials once you scroll past the name.
    const sentinel = h("div", { style: "height:1px;margin-bottom:-17px" });
    this._io?.disconnect();
    this._io = new IntersectionObserver(([en]) => head.classList.toggle("compact", !en.isIntersecting && en.boundingClientRect.top < 120), { rootMargin: "-56px 0px 0px 0px" });
    this._io.observe(sentinel);
    this._form = h("div", { class: "editor" });
    this._lists = h("div", { style: "display:none" });
    wrap.append(nameRow, this._nameNote, sentinel, head, this._form, this._lists);
    this._renderForm();
    this._syncNameNote();
    this._syncSimButtons();
    // undo history starts after the first draw, which may fill in defaults
    this._hist = [this._snap()];
    this._redo = [];
    this._histSeen = this._hist[0];
    this._syncHist();
  }

  // Undo, Redo, Cancel and Save live in the top bar so they are always in reach.
  _editorButtons() {
    this._undoBtn = h("button", { class: "btn icon", title: "Undo the last change", disabled: true, onclick: () => this._undo() }, ic("undo", 16));
    this._redoBtn = h("button", { class: "btn icon opt", title: "Redo", disabled: true, onclick: () => this._redoStep() }, ic("redo", 16));
    let armed = 0;
    const cancel = h("button", { class: "btn", onclick: () => {
      const dirty = JSON.stringify(E.normalizeBar(this._draft)) !== this._draftOrig;
      if (!dirty || armed) { clearTimeout(armed); this._closeEditor(); return; }
      cancel.textContent = "Discard?";
      cancel.style.borderColor = cancel.style.color = "var(--wb-err)";
      armed = setTimeout(() => { armed = 0; cancel.textContent = "Cancel"; cancel.style.borderColor = cancel.style.color = ""; }, 4000);
    } }, "Cancel");
    return [this._undoBtn, this._redoBtn, cancel, h("button", { class: "btn pri", onclick: () => this._saveDraft() }, "Save")];
  }

  // ----- undo history for the bar being edited -----

  _snap() {
    return JSON.stringify({ d: this._draft, a: [...this._added] });
  }

  _restore(snap) {
    const v = JSON.parse(snap);
    this._draft = v.d;
    this._added = new Set(v.a);
    this._histSeen = snap;
    this._scale = null;
    if (this._nameInput) this._nameInput.value = v.d.name;
    this._syncNameNote();
    if (this._enabledInput) this._enabledInput.checked = !!v.d.enabled;
    this._renderForm();
    this._syncSimButtons();
    this._pushStrip();
    this._syncHist();
  }

  // Called a few times a second: a change becomes one undo step once it has settled
  // (so a whole drag, or a burst of typing, is undone in one go).
  _histTick(now) {
    if (now - (this._histChk || 0) < 0.25) return;
    this._histChk = now;
    if (this._pointerDown || !this._hist.length) return;
    const cur = this._snap();
    if (cur !== this._histSeen) {
      this._histSeen = cur;
      this._histAt = now;
      this._syncHist(cur);
    } else if (cur !== this._hist[this._hist.length - 1] && now - (this._histAt || 0) > 0.45) {
      this._hist.push(cur);
      if (this._hist.length > 80) this._hist.shift();
      this._redo = [];
      this._syncHist(cur);
    }
  }

  _syncHist(cur = this._snap()) {
    if (!this._undoBtn) return;
    this._undoBtn.disabled = !(this._hist.length > 1 || cur !== this._hist[this._hist.length - 1]);
    this._redoBtn.disabled = !this._redo.length;
  }

  _undo() {
    if (!this._hist.length) return;
    const cur = this._snap(), top = this._hist[this._hist.length - 1];
    if (cur !== top) { this._redo.push(cur); this._restore(top); }
    else if (this._hist.length > 1) { this._redo.push(this._hist.pop()); this._restore(this._hist[this._hist.length - 1]); }
  }

  _redoStep() {
    if (!this._redo.length) return;
    const snap = this._redo.pop();
    this._hist.push(snap);
    this._restore(snap);
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
    this._liveBtn.style.display = !this._sim.live && this._liveNow(E.normalizeBar(d)) !== null ? "" : "none";
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
    if (structural) { this._renderForm(); this._syncSimButtons(); this._syncNameNote(); }
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
      const rank = (id) => (o.prefer && o.prefer(states[id], id) ? 0 : 1);
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
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.add("leave");
            setTimeout(() => { def.remove(this._draft); this._added.delete(id); this._touch(true); }, 170);
          } }, ic("x", 12), "Remove")),
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

  _distanceFields(d) {
    const s = d.source;
    const states = this._hass?.states || {};
    const I = (obj, key, type, o) => this._in(obj, key, type, o);
    const F = (...a) => this._f(...a);
    const nameOf = (id) => states[id]?.attributes?.friendly_name || (id || "").replace(/^[a-z_]+\./, "");
    const tracked = states[s.entity];
    const isSensor = !!tracked && E.num(tracked.state, null) !== null;
    if (!s.dist_unit && !isSensor) s.dist_unit = this._lengthUnit();
    if (isSensor && s.dist_mode === "zones" && !UNIT_METRES[String(tracked.attributes?.unit_of_measurement || "").toLowerCase()]) s.dist_mode = "fixed";
    const modes = [["fixed", "A set distance"], ["zones", "Between two places"], ["auto", "Wherever the trip starts"]];
    const info = h("div", { class: "info" });
    let last = "";
    this._rangeInfo = () => {
      const now = distanceInfo(s, this._hass?.states || {});
      let text;
      if (!s.entity) text = "Choose a person, a device tracker or a distance sensor.";
      else if (!now) text = `${nameOf(s.entity)} has no position right now, so the bar would hide.`;
      else {
        const dest = now.sensor ? "" : ` from ${nameOf(s.to_zone || "zone.home")}`;
        text = `${nameOf(s.entity)} is ${fmt(now.remaining)} ${now.unit}${dest}`;
        if (now.total !== null) text += `, which lights ${Math.round(now.frac * 100)} % of the bar. The whole bar is ${fmt(now.total)} ${now.unit}.`;
        else if (s.dist_mode === "zones") text += ". Choose where the trip starts to set the bar's length.";
        else text += ". The bar starts empty there each time it appears and fills as they get closer.";
      }
      if (text !== last) { last = text; info.textContent = text; }
    };
    const unitSel = h("select", { style: "width:96px;flex:none", onchange: (e) => { s.dist_unit = e.target.value; this._touch(true); } },
      [["mi", "miles"], ["km", "km"]].map(([val, label]) => h("option", { value: val, selected: (s.dist_unit || this._lengthUnit()) === val }, label)));
    return [
      F("Who or what", I(s, "entity", "entity", { rerender: true, domains: ["person", "device_tracker", "sensor"], prefer: (_st, id) => id.startsWith("person.") }),
        s.entity ? (tracked ? nameOf(s.entity) + (isSensor ? " (a distance sensor)" : "") : "No entity with this id") : "A person, a tracker, or a sensor that reports a distance", "full"),
      !isSensor && F("Heading to", I(s, "to_zone", "entity", { rerender: true, domains: ["zone"], placeholder: "zone.home" }), nameOf(s.to_zone || "zone.home"), "full"),
      h("div", { class: "sub" }, "How far away is an empty bar?"),
      h("div", { class: "full" }, h("span", { class: "seg" }, modes.filter(([val]) => val !== "zones" || !isSensor || s.dist_mode === "zones").map(([val, label]) =>
        h("button", { class: s.dist_mode === val ? "on" : "", onclick: (e) => { e.preventDefault(); s.dist_mode = val; this._touch(true); } }, label)))),
      s.dist_mode === "fixed" && F("Empty at", h("span", { class: "rowx", style: "flex-wrap:nowrap" },
        I(s, "dist_total", "num", { min: 0, step: "any" }), isSensor && !UNIT_METRES[String(tracked.attributes?.unit_of_measurement || "").toLowerCase()]
          ? h("span", { class: "dim sm" }, tracked.attributes?.unit_of_measurement || "in the sensor's units") : unitSel), "This far away or more, nothing is lit"),
      s.dist_mode === "zones" && F("Starting from", I(s, "from_zone", "entity", { rerender: true, domains: ["zone"], placeholder: "Search zones…" }),
        s.from_zone ? nameOf(s.from_zone) : "For example, work", "full"),
      s.dist_mode === "zones" && F("Show distances in", unitSel),
      s.dist_mode === "auto" && F("Show distances in", unitSel),
      info,
    ];
  }

  // An info line under the fields that keeps itself up to date.
  _liveInfo(text) {
    const info = h("div", { class: "info" });
    let last = null;
    this._rangeInfo = () => { const now = text(); if (now !== last) { last = now; info.textContent = now; } };
    return info;
  }

  _mediaFields(d) {
    const s = d.source;
    return [
      this._f("Media player", this._in(s, "entity", "entity", { rerender: true, domains: ["media_player"] }), s.entity ? this._name(s.entity) : "A TV, speaker or streaming box", "full"),
      this._liveInfo(() => {
        if (!s.entity) return "Choose a media player. The bar fills as each song, show or film plays.";
        const info = mediaInfo(s, this._hass?.states || {});
        if (!info) return `${this._name(s.entity)} isn’t playing anything with a known length, so the bar hides.`;
        return `${this._name(s.entity)} is ${info.playing ? "playing" : "paused"} at ${clockText(info.position)} of ${clockText(info.duration)}.`;
      }),
    ];
  }

  _ratioFields(d, energy) {
    const s = d.source;
    const power = (st) => ["power", "energy"].includes(st.attributes?.device_class);
    const domains = ["sensor", "number", "input_number", "counter"];
    return [
      this._f(energy ? "Solar production" : "This value", this._in(s, "entity", "entity", { rerender: true, domains, prefer: energy ? power : null }),
        s.entity ? this._name(s.entity) : energy ? "What the panels are making right now" : "The part", "full"),
      this._f(energy ? "House use" : "As a share of", this._in(s, "entity2", "entity", { rerender: true, domains, prefer: energy ? power : null }),
        s.entity2 ? this._name(s.entity2) : energy ? "What the house is using right now" : "The whole: a full bar", "full"),
      this._liveInfo(() => {
        if (!s.entity || !s.entity2) return energy ? "Choose both sensors. A full bar means solar covers everything the house is using."
          : "Choose both sensors. The bar is full when the first value reaches the second.";
        const info = ratioInfo(s, this._hass?.states || {});
        if (!info) return "One of the sensors has no number right now, so the bar would hide.";
        return `${fmt(info.part)} of ${fmt(info.whole)} ${info.unit} right now lights ${Math.round(info.frac * 100)} % of the bar.`;
      }),
    ];
  }

  _eventFields(d) {
    const s = d.source;
    const days = E.num(s.duration, 0) >= 172800 && E.num(s.duration, 0) % 86400 === 0;
    const per = days ? 86400 : 3600;
    const lead = h("span", { class: "rowx", style: "flex-wrap:nowrap" },
      h("input", { type: "number", min: 1, step: 1, value: Math.max(1, Math.round(E.num(s.duration, 86400) / per)),
        oninput: (e) => { if (e.target.value !== "") { s.duration = Math.max(1, Number(e.target.value)) * per; this._touch(false); } } }),
      h("select", { style: "flex:none", onchange: (e) => {
        const n = Math.max(1, Math.round(E.num(s.duration, 86400) / per));
        s.duration = n * (e.target.value === "d" ? 86400 : 3600);
        this._touch(true);
      } }, h("option", { value: "h", selected: !days }, "hours before"), h("option", { value: "d", selected: days }, "days before")));
    return [
      this._f("Event", this._in(s, "end_entity", "entity", { rerender: true, domains: ["calendar", "sensor", "input_datetime"],
        prefer: (st, id) => id.startsWith("calendar.") || ["timestamp", "date"].includes(st.attributes?.device_class) }),
        s.end_entity ? this._name(s.end_entity) : "A calendar, or a sensor holding a date or time", "full"),
      this._f("Starts filling", lead, "Hidden until then"),
      this._liveInfo(() => {
        if (!s.end_entity) return "Choose a calendar (its next event is used) or a date sensor, such as a bin collection day.";
        const info = eventInfo(s, this._hass?.states || {});
        if (!info) return `${this._name(s.end_entity)} has no upcoming event or date right now, so the bar hides.`;
        const when = new Date(info.end).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        if (info.left <= 0) return `The event started ${when}. The bar waits for the next one.`;
        return `Next: ${when}, in ${spanText(info.left)}. ` + (info.frac === null ? "The bar is hidden until it starts filling." : `The bar is ${Math.round(info.frac * 100)} % full.`);
      }),
    ];
  }

  _lengthUnit() {
    return /mi/i.test(this._hass?.config?.unit_system?.length || "") ? "mi" : "km";
  }

  // What the preview should follow right now: {frac, value, unit} or null.
  _liveNow(bar) {
    if (bar.source.type === "distance") {
      const info = distanceInfo(bar.source, this._hass?.states || {});
      return info && info.frac !== null ? { frac: info.frac, value: info.remaining, unit: ` ${info.unit}` } : null;
    }
    const states = this._hass?.states || {};
    if (bar.source.type === "media") {
      const info = mediaInfo(bar.source, states);
      return info ? { frac: info.frac, value: Math.round(((info.duration - info.position) / 60) * 10) / 10, unit: " min left" } : null;
    }
    if (bar.source.type === "ratio") {
      const info = ratioInfo(bar.source, states);
      return info ? { frac: info.frac, value: info.part, unit: ` of ${fmt(info.whole)} ${info.unit}`.trimEnd() } : null;
    }
    if (bar.source.type === "timestamp") {
      const info = eventInfo(bar.source, states);
      return info && info.frac !== null ? { frac: info.frac, value: Math.round((info.left / 3600) * 10) / 10, unit: " h left" } : null;
    }
    const value = this._liveValue(bar);
    return value === null ? null : { frac: E.valueToFrac(bar, value), value, unit: this._liveUnit(bar) };
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

  // The gradient itself is the control: click it to add a colour, drag a dot to move it,
  // drag a dot off the bar to remove it. The row underneath edits the selected dot exactly.
  _gradEditor(d, numeric, deg) {
    const c = d.color;
    if (!(this._stopSel >= 0 && this._stopSel < c.stops.length)) this._stopSel = 0;
    const el = h("div", { class: "ge" });
    const bar = h("div", { class: "gb", title: "Click to add a colour" });
    const detail = h("div", { class: "rowx full" });
    const handles = [];
    let syncDetail = () => {};
    let colourBox = null;
    const paint = () => {
      const st = E.normalizeBar(d).color.stops;
      if (st.length === 1) bar.style.background = st[0].color;
      else if (c.mode === "steps" || (c.mode === "value" && !c.blend))
        bar.style.background = `linear-gradient(90deg,${st.map((x, i) => `${x.color} ${x.pos}%,${x.color} ${i + 1 < st.length ? st[i + 1].pos : 100}%`).join(",")})`;
      else bar.style.background = `linear-gradient(90deg,${st.map((x) => `${x.color} ${x.pos}%`).join(",")})`;
      c.stops.forEach((stop, i) => {
        if (!handles[i]) return;
        handles[i].style.left = `${E.clamp(E.num(stop.pos, 0) / 100) * 100}%`;
        handles[i].firstChild.style.background = stop.color;
        handles[i].classList.toggle("sel", i === this._stopSel);
      });
      syncDetail();
    };
    this._hooks.push(paint);
    const showDetail = () => {
      const stop = c.stops[this._stopSel];
      const val = h("span", { class: "dim sm" });
      const posBox = h("input", { type: "number", min: 0, max: 100, step: 1, value: Math.round(stop.pos), style: "width:64px", title: "Position along the bar",
        oninput: (e) => { if (e.target.value !== "") { stop.pos = E.clamp(Number(e.target.value) / 100) * 100; this._touch(false); } } });
      colourBox = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : "#ffffff", title: "Colour of the selected dot",
        oninput: (e) => { stop.color = e.target.value; this._touch(false); } });
      syncDetail = () => {
        if (this.shadowRoot.activeElement !== posBox) posBox.value = Math.round(stop.pos);
        val.textContent = numeric ? `= ${Math.round(E.fracToValue(E.normalizeBar(d), stop.pos / 100) * 10) / 10}${deg}` : "";
      };
      detail.replaceChildren(...[
        colourBox, h("span", { class: "dim sm" }, "at"), posBox, h("span", { class: "dim sm" }, "%"), val, h("span", { class: "grow" }),
        c.stops.length > 1 && h("button", { class: "btn xs danger", title: "Remove this colour",
          onclick: (e) => { e.preventDefault(); c.stops.splice(this._stopSel, 1); this._stopSel = 0; this._touch(true); } }, ic("x", 12), "Remove"),
      ].filter(Boolean));
      syncDetail();
    };
    c.stops.forEach((stop, i) => {
      const hd = h("div", { class: "gs", style: "touch-action:none", title: "Drag to move · click to change the colour · drag off the bar to remove" }, h("i"));
      handles[i] = hd;
      dragHandle(hd, (e) => ({ x: e.clientX, y: e.clientY, moved: false, out: false }),
        (e, ctx) => {
          if (!ctx.moved && Math.hypot(e.clientX - ctx.x, e.clientY - ctx.y) < 4) return;
          if (!ctx.moved) { ctx.moved = true; this._stopSel = i; showDetail(); }
          const r = el.getBoundingClientRect();
          stop.pos = Math.round(E.clamp((e.clientX - r.left) / r.width) * 100);
          ctx.out = c.stops.length > 1 && Math.abs(e.clientY - (r.top + 14)) > 56;
          hd.classList.toggle("out", ctx.out);
          for (const fn of this._hooks) fn();
        },
        (ctx) => {
          if (ctx.out) { c.stops.splice(c.stops.indexOf(stop), 1); this._stopSel = 0; this._touch(true); return; }
          if (!ctx.moved) {
            // a plain click selects the dot and opens its colour
            this._stopSel = i;
            showDetail();
            paint();
            try { if (colourBox.showPicker) colourBox.showPicker(); else colourBox.click(); } catch (_e) { /* the swatch below is still there to click */ }
          }
          this._pushStrip();
        });
      el.append(hd);
    });
    bar.addEventListener("click", (e) => {
      const r = el.getBoundingClientRect();
      const pos = Math.round(E.clamp((e.clientX - r.left) / r.width) * 100);
      c.stops.push({ pos, color: mixAt(E.normalizeBar(d).color.stops, pos) });
      this._stopSel = c.stops.length - 1;
      this._touch(true);
    });
    el.prepend(bar);
    showDetail();
    return [el, detail, h("div", { class: "dim sm full" }, "Click the bar to add a colour. Drag a dot to move it, or drag it off the bar to remove it.")];
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
    const ZOOMS = [0, 13, 20, 28]; // px per LED; 0 = fit the whole strip in view
    const zoom = ZOOMS[this._zoomIdx] || 0;
    if (zoom) pick.style.width = count * zoom + "px";
    const scroller = h("div", { class: "scroller", onscroll: (e) => { this._pickScroll = e.target.scrollLeft; } }, pick);
    const setZoom = (idx) => (e) => {
      e.preventDefault();
      this._zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, idx));
      this._zoomCenter = true;
      this._touch(true);
    };
    const zoomCtl = count > 30 && h("span", { class: "seg", title: "Zoom in to place a bar precisely on a long strip" },
      h("button", { class: zoom ? "" : "on", onclick: setZoom(0) }, "Whole strip"),
      h("button", { title: "Zoom out", disabled: !zoom, onclick: setZoom(this._zoomIdx - 1) }, ic("zoomout", 15)),
      h("button", { title: "Zoom in", disabled: this._zoomIdx >= ZOOMS.length - 1, onclick: setZoom(this._zoomIdx + 1) }, ic("zoomin", 15)));
    this._picker = new StripView(pick, {
      labels: true, ruler: true, max: 22, zoom,
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
    form.append(this._card("1", "Where on the strip", "Drag the middle to move it, or either end to resize", [
      h("div", { class: "stage full" }, scroller), posInfo,
      F("Begins at LED", I(d, "start", "num", { min: 0, max: count - 1 })),
      F("Ends at LED", I(d, "end", "num", { min: 0, max: count - 1 })),
      h("div", { class: "rowx full" },
        h("button", { class: "btn", onclick: (e) => { e.preventDefault(); [d.start, d.end] = [d.end, d.start]; this._touch(true); } }, ic("flip", 15), "Flip direction"),
        h("button", { class: "btn", title: "Blink this range on the real strip so you can find it",
          onclick: (e) => { e.preventDefault(); this.ws("identify", { entry_id: this._entry, leds: E.barLeds(E.normalizeBar(d)) }); } }, ic("find", 15), "Find on strip"),
        h("span", { class: "grow" }), zoomCtl),
    ]));
    if (zoom) {
      // keep the place when the form is redrawn; after a zoom change, bring the bar into view
      const lo = Math.min(d.start, d.end), hi = Math.max(d.start, d.end);
      scroller.scrollLeft = this._zoomCenter ? ((lo + hi + 1) / 2) * zoom - scroller.clientWidth / 2 : this._pickScroll || 0;
    }
    this._zoomCenter = false;

    // --- 2. what it shows ---
    const s = d.source;
    const kindId = this._kind(d);
    const kind = KINDS[kindId];
    const numeric = s.type === "entity" || s.type === "manual";
    const sourceTypes = kind.sources ? SOURCE_TYPES.filter((x) => kind.sources.includes(x[0]) || x[0] === s.type) : SOURCE_TYPES;
    const isTemp = kind.range === "temp";
    const deg = isTemp ? "°" : "";
    // attributes of the chosen entity that hold a number, for the attribute dropdown
    const srcState = s.type === "entity" ? this._hass?.states?.[s.entity] : null;
    const numAttrs = srcState
      ? Object.entries(srcState.attributes || {}).filter(([k, val]) => typeof val !== "boolean" && E.num(val, null) !== null && !/^supported_/.test(k))
      : [];
    // switching to an entity that lacks the chosen attribute falls back to its state
    if (this._srcEntity !== undefined && this._srcEntity !== s.entity && srcState && s.attribute && !(s.attribute in (srcState.attributes || {}))) s.attribute = "";
    this._srcEntity = s.entity;
    if (srcState && !s.attribute && E.num(srcState.state, null) === null && numAttrs.length) {
      // the state itself isn't a number (e.g. a thermostat's "heat"): start on the most likely attribute
      const likely = ["current_temperature", "temperature", "battery_level", "current_position", "percentage", "brightness", "volume_level", "current_humidity", "humidity"];
      s.attribute = (likely.find((k) => numAttrs.some(([name]) => name === k)) || numAttrs[0][0]);
    }
    const needsAttr = s.type === "entity" && (!!s.attribute || numAttrs.length > 0);
    let attrControl = null;
    if (needsAttr) {
      if (srcState) {
        const stateIsNumber = E.num(srcState.state, null) !== null;
        const opts = [["", `Its state (${srcState.state}${srcState.attributes?.unit_of_measurement || ""})${stateIsNumber ? "" : " – not a number"}`]]
          .concat(numAttrs.map(([k, val]) => [k, `${k.replace(/_/g, " ")} (${val})`]));
        if (s.attribute && !numAttrs.some(([k]) => k === s.attribute)) opts.push([s.attribute, `${s.attribute} – not available on this entity`]);
        attrControl = h("select", { onchange: (e) => { s.attribute = e.target.value; this._scale = null; this._touch(true); } },
          opts.map(([val, label]) => h("option", { value: val, selected: (s.attribute || "") === val }, label)));
      } else attrControl = I(s, "attribute", "text", { placeholder: "(state)" });
    }
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
        else if (v !== null) text = `${fmt(v)}${unit} right now lights ${Math.round(E.valueToFrac(bar, v) * 100)} % of the bar.`;
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
    form.append(this._card("2", isTemp ? "Which temperature" : s.type === "distance" ? "Whose distance" : "What it shows", null, [
      sourceTypes.length > 1 && F("Follows", I(s, "type", "sel", { options: sourceTypes }), null, "full"),
      s.type === "entity" && F(isTemp ? "Temperature sensor" : "Entity", I(s, "entity", "entity", { rerender: true,
          prefer: kindId === "temperature" || kindId === "battery" ? (st) => st.attributes?.device_class === kindId : null,
          domains: ["sensor", "number", "input_number", "counter", "climate", "light", "fan", "media_player", "cover", "weather", "humidifier", "water_heater", "vacuum"] }),
        s.entity ? (this._hass?.states?.[s.entity]?.attributes?.friendly_name || (this._hass?.states?.[s.entity] ? null : "No entity with this id")) : "Type part of its name", "full"),
      needsAttr && F("Use", attrControl, "Which of this entity's numbers to show", "full"),
      s.type === "timer" && F("Timer", I(s, "entity", "entity", { domains: ["timer"], rerender: true }), null, "full"),
      s.type === "media" && this._mediaFields(d),
      s.type === "ratio" && this._ratioFields(d, kindId === "energy"),
      s.type === "timestamp" && kindId === "event" && this._eventFields(d),
      s.type === "timestamp" && kindId !== "event" && F("Finish time", I(s, "end_entity", "entity", { domains: ["sensor", "input_datetime"], prefer: (st) => st.attributes?.device_class === "timestamp" }), "A sensor that says when it will be done", "full"),
      s.type === "timestamp" && kindId !== "event" && this._more("finish", [
        F("Start time", I(s, "start_entity", "entity", { domains: ["sensor", "input_datetime"], prefer: (st) => st.attributes?.device_class === "timestamp" }), "Optional sensor for when it began", "full"),
        F("Usual run time (minutes)", h("input", { type: "number", min: 0, step: 5, value: Math.round(E.num(s.duration, 0) / 60),
          oninput: (e) => { if (e.target.value !== "") { s.duration = Math.max(0, Number(e.target.value)) * 60; this._touch(false); } } }),
          "Used when there is no start time. 0 = measure from when the finish time first appears"),
      ]),
      s.type === "distance" && this._distanceFields(d),
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
    if (!c.stops.length) c.stops.push({ pos: 0, color: "#ffffff" });
    const multi = c.mode !== "solid" && c.mode !== "rainbow";
    form.append(this._card("3", "Colour", null, [
      F("Colour style", I(c, "mode", "sel", { options: [
        ["solid", "One colour"], ["gradient", "Gradient along the bar"], ["steps", "Colour zones along the bar"],
        ["value", "Whole bar changes colour with the value"], ["rainbow", "Rainbow"]] }), null, "full"),
      c.mode === "solid" && F("Colour", I(c.stops[0], "color", "color")),
      c.mode === "rainbow" && h("div", { class: "full", style: "height:28px;border-radius:8px;border:1px solid var(--wb-line);background:linear-gradient(90deg,red,yellow,lime,cyan,blue,magenta,red)" }),
      multi && this._gradEditor(d, numeric, deg),
      multi && h("div", { class: "rowx full" },
        h("span", { class: "dim sm" }, "Presets:"),
        h("div", { class: "chips" }, PALETTES.map(([name, cols]) =>
          h("button", { class: "chip", onclick: (e) => { e.preventDefault(); c.stops = evenStops(cols); this._stopSel = 0; this._touch(true); } },
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
            where.textContent = mv === null ? "" : `= ${Math.round(E.valueToFrac(bar, mv) * 100)} % along`;
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
        s.type !== "entity" && s.type !== "distance" && F("Hide when idle", I(v, "hide_when_idle", "tog"), "Timer not running, outside the time window…"),
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
          st.night.mode !== "off" && F("Dim to", upd(st.night, "level", "range", { min: 1, max: 100, unit: " %" })),
          h("div", { class: "sub" }, "Notification flash"),
          F("Try it on this strip", h("button", { class: "btn", style: "flex:none",
            onclick: (e) => { e.preventDefault(); this.ws("flash", { entry_id: this._entry, color: "#ff3b30", effect: "pulse", duration: 3 }).catch(() => {}); } }, ic("bell", 15), "Flash for 3 s"),
            "Automations use the wled_bars.flash action: a colour, an effect and a few seconds, on a bar, part of a strip or every strip"),
          h("div", { class: "sub" }, "Backup"),
          F("This strip’s bars and settings", h("span", { class: "rowx", style: "flex:none" },
            h("button", { class: "btn", onclick: (e) => { e.preventDefault(); this._export(); } }, ic("download", 15), "Save to a file"),
            h("button", { class: "btn", onclick: (e) => { e.preventDefault(); dlg.close(); this._import(); } }, ic("upload", 15), "Load a file…")),
            "A file can be loaded again here, or on another strip")),
        h("div", { class: "rowx", style: "padding:0 16px 16px;justify-content:flex-end" },
          h("button", { class: "btn", onclick: () => dlg.close() }, "Cancel"),
          h("button", { class: "btn pri", onclick: async () => {
            st.segment = Number(st.segment);
            await this._saveSettings(st);
            dlg.close();
            this._render();
          } }, "Save")),
        VERSION && h("div", { class: "dim sm", style: "padding:0 16px 12px;text-align:right" }, `WLED Bars ${VERSION}`),
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
    const live = sim.live && !sim.play && !sim.unavailable ? this._liveNow(bar) : null;
    const liveValue = live ? live.value : null;
    if (live) {
      const next = inv ? 1 - live.frac : live.frac;
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
    const unit = live ? live.unit : numeric ? this._liveUnit(bar) : "";
    this._simOut.textContent = sim.unavailable ? "unavailable"
      : (live ? "live · " : "") + `${Math.round(frac * 100)} %` + (numeric || live ? `  ·  ${fmt(value)}${unit}` : "");
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
      this._histTick(now);
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
          .map((b) => ({ start: b.start, end: b.end, label: b.name, color: this._picker.light ? "#9aa3b5" : "#566079" }));
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
        const st = this._live.bars[bar.id];
        const visible = !!st?.visible;
        // a hidden bar is drawn faintly, as it would look, so the card is never just black
        strip.pixels = visible ? E.barLeds(bar).map((idx) => live[idx] || [0, 0, 0])
          : E.renderBar(bar, { t: now, frac: st && st.state === "active" ? st.percent / 100 : 0.6, brightness: 1 });
        strip.c.style.opacity = visible ? "" : ".3";
        strip.draw();
        strip.pctEl.textContent = st && st.state === "active" ? `${fmt(st.percent)} %` : "–";
        const info = this._statusOf(bar, strip.index);
        if (strip.stEl.textContent !== info.text) strip.stEl.textContent = info.text;
        strip.dotEl.className = "dot " + info.tone;
      }
      const d = new Date();
      for (const line of this._tlNow || []) line.style.left = `${((d.getHours() * 60 + d.getMinutes()) / 1440) * 100}%`;
    }
  }
}

if (!customElements.get("wled-bars-panel")) customElements.define("wled-bars-panel", WledBarsPanel);

// ---------- dashboard card ----------

const CARD_CSS = `
:host{--wb-text:var(--primary-text-color,#e6e9ef);--wb-dim:var(--secondary-text-color,#9aa3b5);--wb-accent:var(--primary-color,#4f8cff);
  --wb-line:var(--divider-color,rgba(128,128,128,.25));--wb-ok:var(--success-color,#3fbf6f);--wb-warn:var(--warning-color,#ffa600);
  --wb-err:var(--error-color,#e5484d);display:block;color:var(--wb-text);font-size:14px}
*{box-sizing:border-box}
.body{padding:14px 16px 14px;display:flex;flex-direction:column;gap:10px}
.hd{display:flex;align-items:center;gap:10px;min-height:24px}
.hd .t{font-size:16px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sum{font-size:12px;color:var(--wb-dim);white-space:nowrap;display:flex;align-items:center;gap:6px}
.sum.off{color:var(--wb-dim)} .sum.bad{color:var(--wb-err)}
.grow{flex:1}
.stage{background:#0a0c11;border-radius:10px;padding:12px 10px 6px;position:relative}
:host([light]) .stage{background:color-mix(in srgb,var(--wb-text) 5%,transparent);box-shadow:inset 0 0 0 1px var(--wb-line)}
:host([light]) .cap{color:var(--wb-dim)}
:host([light]) .stage.standby canvas{opacity:.75}
.stage canvas{display:block;width:100%;transition:opacity .2s ease}
.stage.standby canvas{opacity:.5}
.cap{font-size:11px;color:#8c95a8;text-align:center;padding:2px 0 4px;letter-spacing:.02em}
.rows{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;column-gap:10px;padding:7px 4px 6px;border-radius:8px;cursor:default;
  transition:background .16s ease}
.row:hover,.row.sel{background:color-mix(in srgb,var(--wb-text) 6%,transparent)}
.row+.row{margin-top:1px}
.swatch{width:10px;height:10px;border-radius:50%;border:2px solid var(--c,#667);background:var(--c,#667);transition:background .2s ease,opacity .2s ease}
.row.hid .swatch{background:transparent;opacity:.75}
.nm{min-width:0}
.nm b{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm span{display:block;font-size:12px;color:var(--wb-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm span.would{color:var(--wb-accent)} .nm span.warn{color:var(--wb-warn)} .nm span.bad{color:var(--wb-err)}
.val{font-variant-numeric:tabular-nums;font-size:13px;color:var(--wb-dim)}
.row.on .val{color:var(--wb-text)}
.meter{grid-column:2 / -1;height:3px;border-radius:3px;background:color-mix(in srgb,var(--wb-text) 10%,transparent);margin-top:5px;overflow:hidden}
.meter i{display:block;height:100%;width:0;background:var(--c,#667);border-radius:3px;transition:width .4s ease,opacity .2s ease}
.row.hid .meter i{opacity:.35}
input.sw{appearance:none;-webkit-appearance:none;margin:0;width:36px;height:20px;border-radius:20px;background:color-mix(in srgb,var(--wb-text) 28%,transparent);
  position:relative;cursor:pointer;transition:background .16s ease;flex:none}
input.sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .16s ease;box-shadow:0 1px 3px rgba(0,0,0,.35)}
input.sw:checked{background:var(--wb-accent)} input.sw:checked::after{left:18px}
input.sw:focus-visible,a:focus-visible,input[type=range]:focus-visible{outline:2px solid var(--wb-accent);outline-offset:2px}
.ft{display:flex;align-items:center;gap:10px;color:var(--wb-dim);font-size:12px}
.ft input[type=range]{flex:1;accent-color:var(--wb-accent);min-width:0}
a.ed{color:var(--wb-dim);display:flex;padding:2px;border-radius:6px} a.ed:hover{color:var(--wb-accent)}
svg.i{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.msg{color:var(--wb-dim);font-size:13px}
@media (pointer:coarse){.row{padding-top:10px;padding-bottom:9px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

class WledBarsCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (this._started) this._restart();
  }
  static getStubConfig() {
    return { controls: true };
  }
  // The visual editor in the dashboard's "Edit card" dialog.
  static getConfigForm() {
    const labels = {
      entry_id: "Strip", title: "Title (blank = the strip's name)", controls: "Switches to turn bars on and off",
      brightness: "Brightness slider", strip: "Picture of the strip", bars: "List of bars",
      preview: "While bars are off, show what would be displayed", hide_inactive: "Only list bars that are showing",
    };
    return {
      schema: [
        { name: "entry_id", selector: { config_entry: { integration: DOMAIN } } },
        { name: "title", selector: { text: {} } },
        { name: "controls", selector: { boolean: {} } },
        { name: "brightness", selector: { boolean: {} } },
        { name: "strip", selector: { boolean: {} } },
        { name: "bars", selector: { boolean: {} } },
        { name: "preview", selector: { boolean: {} } },
        { name: "hide_inactive", selector: { boolean: {} } },
      ],
      computeLabel: (field) => labels[field.name] || field.name,
    };
  }
  getCardSize() {
    return 2 + Math.ceil(((this._bars || []).length || 2) * 0.8);
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  // An option is on unless the configuration says otherwise (given defaults aside).
  _opt(key, fallback = true) {
    const c = this._config || {};
    if (key === "bars" && c.bars === undefined && c.show_bars !== undefined) return c.show_bars !== false; // pre-0.6 name
    return c[key] === undefined ? fallback : c[key] !== false;
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected && (hass.themes !== this._themes || !this._toned)) {
      this._themes = hass.themes;
      this._toned = true;
      if (applyTone(this, hass) && this._started) this._render(true);
    }
    if (!this._started && this.isConnected) this._start();
  }

  connectedCallback() {
    if (this._hass) {
      this._toned = true;
      applyTone(this, this._hass);
    }
    if (this._hass && !this._started) this._start();
  }

  disconnectedCallback() {
    this._stop();
  }

  _stop() {
    if (this._unsub) this._unsub();
    this._unsub = null;
    this._started = false;
    this._run = (this._run || 0) + 1; // anything still loading belongs to an old run
    clearInterval(this._timer);
    if (this._ro) this._ro.disconnect();
  }

  _restart() {
    this._stop();
    if (this._hass && this.isConnected) this._start();
  }

  async _start() {
    this._started = true;
    const run = (this._run = (this._run || 0) + 1);
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = "";
    const body = (this._body = h("div", { class: "body" }));
    root.append(h("style", {}, CARD_CSS + STALE_CSS), h("ha-card", {}, body));
    try {
      this._stale = await staleCheck(this._hass);
      if (run !== this._run) return;
      if (this._stale) body.append(staleNotice(this._stale));
      const devices = await this._hass.callWS({ type: `${DOMAIN}/devices` });
      if (run !== this._run) return;
      const c = this._config;
      const dev = devices.find((d) => d.entry_id === c.entry_id || (c.device && d.name === c.device)) || (!c.entry_id && !c.device ? devices[0] : null);
      if (!dev) {
        body.append(h("div", { class: "msg" }, devices.length ? "This strip is no longer set up in WLED Bars. Choose another in the card's settings." : "No WLED Bars strip is set up yet."));
        return;
      }
      this._dev = dev;
      this._live = { pixels: [], bars: {}, online: dev.online, enabled: true, brightness: 100, rev: null };
      await this._load(run);
      if (run !== this._run) return;
      const unsub = await this._hass.connection.subscribeMessage((msg) => this._onFrame(msg), { type: `${DOMAIN}/subscribe`, entry_id: dev.entry_id });
      if (run !== this._run || !this.isConnected) return unsub();
      this._unsub = unsub;
      this._timer = setInterval(() => this._tick(), 150);
    } catch (err) {
      if (run === this._run) body.append(h("div", { class: "msg" }, `WLED Bars: ${err?.message || err}`));
    }
  }

  // Fetch the bars and (re)build the card. Runs again whenever bars or settings are saved anywhere.
  async _load(run = this._run) {
    const data = await this._hass.callWS({ type: `${DOMAIN}/get`, entry_id: this._dev.entry_id });
    if (run !== this._run) return;
    this._dev = data.device || this._dev;
    this._bars = data.bars;
    this._live.enabled = !!data.settings.enabled;
    this._live.brightness = data.settings.brightness;
    this._build();
    this._render(true);
  }

  _build() {
    const body = this._body;
    const controls = this._opt("controls");
    const call = (msg) => this._hass.callWS({ type: `${DOMAIN}/control`, entry_id: this._dev.entry_id, ...msg }).catch((err) => {
      this._sumEl.textContent = err?.message || "That didn’t work";
      this._load();
    });
    body.innerHTML = "";
    if (this._ro) this._ro.disconnect();
    if (this._stale) body.append(staleNotice(this._stale));

    // header: name, one-line summary, master switch
    this._sumEl = h("span", { class: "sum" });
    this._master = controls && h("input", { type: "checkbox", class: "sw", title: "All bars on this strip", "aria-label": "All bars on this strip",
      onchange: (e) => { this._live.enabled = e.target.checked; this._render(true); call({ enabled: e.target.checked }); } });
    body.append(h("div", { class: "hd" },
      h("span", { class: "t" }, this._config.title || this._dev.name), this._sumEl, h("span", { class: "grow" }),
      controls && this._hass.user?.is_admin && h("a", { class: "ed", href: "/wled-bars", title: "Edit bars", "aria-label": "Edit bars" }, ic("settings", 17)),
      this._master));

    // the strip itself
    this._strip = null;
    if (this._opt("strip")) {
      const canvas = h("canvas");
      this._strip = new StripView(canvas, { max: 20 });
      this._capEl = h("div", { class: "cap", style: "display:none" });
      this._stageEl = h("div", { class: "stage" }, canvas, this._capEl);
      body.append(this._stageEl);
      this._ro = new ResizeObserver(() => this._strip.draw());
      this._ro.observe(canvas);
    }

    // one row per bar
    this._rows = [];
    if (this._opt("bars")) {
      const list = h("div", { class: "rows" });
      this._bars.forEach((bar, index) => {
        const row = { bar, index };
        row.st = h("span", {});
        row.val = h("span", { class: "val" });
        row.fill = h("i");
        row.sw = controls && h("input", { type: "checkbox", class: "sw", checked: bar.enabled, "aria-label": `Show ${bar.name}`,
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => { bar.enabled = e.target.checked; this._render(true); call({ bar: bar.id, bar_enabled: e.target.checked }); } });
        // pointing at a row marks its LEDs on the strip (and sketches the bar there if it is hidden)
        const pick = (on) => { this._sel = on ? bar.id : this._sel === bar.id ? null : this._sel; this._render(true); };
        row.el = h("div", { class: "row", onmouseenter: () => pick(true), onmouseleave: () => pick(false),
          onclick: () => { if (matchMedia("(hover:none)").matches) pick(this._sel !== bar.id); } },
          h("span", { class: "swatch" }), h("div", { class: "nm" }, h("b", {}, bar.name), row.st), row.val, row.sw || h("span"),
          h("div", { class: "meter" }, row.fill));
        this._rows.push(row);
        list.append(row.el);
      });
      if (!this._bars.length) list.append(h("div", { class: "msg" }, "No bars yet."));
      body.append(list);
    }

    this._bright = null;
    if (controls && this._opt("brightness", false)) {
      this._bright = h("input", { type: "range", min: 1, max: 100, step: 1, "aria-label": "Brightness",
        oninput: (e) => { this._brightVal.textContent = `${e.target.value} %`; },
        onchange: (e) => { this._live.brightness = Number(e.target.value); call({ brightness: Number(e.target.value) }); } });
      this._brightVal = h("span", { style: "min-width:38px;text-align:right" });
      body.append(h("div", { class: "ft" }, ic("sun", 16), this._bright, this._brightVal));
    }
  }

  _onFrame(msg) {
    const L = this._live;
    L.pixels = hexToPixels(msg.leds || "");
    L.online = msg.online !== false;
    L.bars = {};
    for (const st of msg.bars || []) if (st) L.bars[st.id] = st;
    if (msg.enabled !== undefined) L.enabled = !!msg.enabled;
    if (msg.brightness !== undefined) L.brightness = msg.brightness;
    if (msg.rev !== undefined && msg.rev !== L.rev) {
      const first = L.rev === null;
      L.rev = msg.rev;
      if (!first) return void this._load().catch(() => {});
    }
    this._render(true);
  }

  // The strip animates by itself while it shows a sketch; status wording follows Home Assistant about once a second.
  _tick() {
    this._n = (this._n || 0) + 1;
    this._render(this._n % 7 === 0);
  }

  // What a bar would look like right now.
  _sketch(bar, st, t) {
    const states = this._hass.states;
    const getState = (id) => (states[id] ? states[id].state : null);
    const frac = st && st.state === "active" ? st.percent / 100 : 0.6;
    return E.renderBar(bar, { t, frac, brightness: 1, unavailable: !!st && st.state === "unavailable",
      rule: E.pickRule(bar, st ? st.value : null, frac * 100, getState) });
  }

  _render(texts) {
    if (!this._bars || !this._live) return;
    const L = this._live;
    const n = this._dev.led_count;
    const t = performance.now() / 1000;
    const standby = !L.enabled;
    const preview = standby && this._opt("preview");
    const selBar = this._sel && this._bars.find((b) => b.id === this._sel);
    const selHidden = selBar && !L.bars[selBar.id]?.visible && !(preview && L.bars[selBar.id]?.would);
    if (!texts && !preview && !selHidden) return; // nothing moves by itself

    if (this._strip) {
      const px = Array.from({ length: n }, (_x, i) => (standby ? [0, 0, 0] : L.pixels[i] || [0, 0, 0]));
      if (preview) {
        for (const bar of this._bars) {
          const st = L.bars[bar.id];
          if (!st?.would) continue;
          const sk = this._sketch(bar, st, t);
          E.barLeds(bar).forEach((idx, i) => { if (idx < n) px[idx] = sk[i]; });
        }
      }
      if (selHidden) {
        // a faint sketch of the hidden bar, only where the strip is dark
        const sk = this._sketch(selBar, L.bars[selBar.id], t);
        E.barLeds(selBar).forEach((idx, i) => {
          if (idx < n && !Math.max(...px[idx])) px[idx] = sk[i].map((v) => Math.round(v * (preview ? 0.5 : 0.22)));
        });
      }
      this._strip.pixels = px;
      this._strip.ranges = selBar ? [{ start: selBar.start, end: selBar.end, color: this._strip.light ? STRIP_LIGHT.mark : STRIP_DARK.mark }] : [];
      this._strip.draw();
    }
    if (!texts) return;

    const shown = this._bars.filter((b) => L.bars[b.id]?.visible).length;
    const would = this._bars.filter((b) => L.bars[b.id]?.would).length;
    this._sumEl.className = "sum" + (!L.online ? " bad" : standby ? " off" : "");
    this._sumEl.textContent = !L.online ? "Strip offline" : standby ? "Bars off" : shown ? `${shown} showing` : "Nothing showing";
    if (this._master) this._master.checked = L.enabled;
    if (this._strip) {
      this._stageEl.classList.toggle("standby", preview);
      const cap = preview ? (would ? "Preview · this is what would show" : "Nothing would show right now") : "";
      this._capEl.textContent = cap;
      this._capEl.style.display = cap ? "" : "none";
    }
    const hideInactive = this._opt("hide_inactive", false);
    for (const row of this._rows) {
      const { bar } = row;
      const st = L.bars[bar.id];
      const info = barStatus(bar, row.index, { bars: this._bars, live: L.bars, enabled: L.enabled, states: this._hass.states, standby: true });
      const on = !!st?.visible;
      const pct = st && st.state === "active" ? st.percent : null;
      // colour: what is on the strip now, else what the bar would use
      let best = null, level = 0;
      const pxs = on ? E.barLeds(bar).map((idx) => L.pixels[idx] || [0, 0, 0]) : this._sketch(bar, st && st.state === "active" && st.percent < 15 ? { ...st, percent: 15 } : st, 0);
      for (const p of pxs) { const lv = Math.max(p[0], p[1], p[2]); if (lv > level) { level = lv; best = p; } }
      const k = best ? 255 / Math.max(120, level) : 1; // a swatch should be readable even when the strip is dim
      row.el.style.setProperty("--c", best ? `rgb(${best.map((v) => Math.min(255, Math.round(v * k))).join(",")})` : "#667");
      row.el.className = "row" + (on ? " on" : " hid") + (this._sel === bar.id ? " sel" : "");
      row.el.style.display = hideInactive && !on && !(standby && st?.would) ? "none" : "";
      if (row.st.textContent !== info.text) row.st.textContent = info.text;
      row.st.className = info.tone === "would" || info.tone === "warn" || info.tone === "bad" ? info.tone : "";
      row.val.textContent = pct === null ? "–" : `${Math.round(pct)} %`;
      row.fill.style.width = `${pct === null ? 0 : pct}%`;
      if (row.sw && row.sw.checked !== !!bar.enabled) row.sw.checked = !!bar.enabled;
    }
    if (this._bright && this.shadowRoot.activeElement !== this._bright) {
      this._bright.value = L.brightness;
      this._brightVal.textContent = `${L.brightness} %`;
    }
  }
}

if (!customElements.get("wled-bars-card")) customElements.define("wled-bars-card", WledBarsCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "wled-bars-card")) {
  window.customCards.push({
    type: "wled-bars-card",
    name: "WLED Bars",
    description: "What a WLED strip is showing right now, bar by bar, with optional switches.",
    preview: true,
    documentationURL: "https://github.com/spiral0ut/wled-bars#dashboard-card",
  });
}
