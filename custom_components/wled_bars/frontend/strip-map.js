// Physical map coordinates are in LED spacings. A flip changes which endpoint is drawn first.
export const runColor = i => ["#5b8cff", "#e89040", "#46b986", "#c477da", "#bdad42", "#42adbe"][i % 6];
export function physicalCount(dev) {
  return dev.strip_count ?? Math.max(dev.led_count || 0, ...(dev.segments || []).map(s => s.stop));
}

export function controllerRuns(dev) {
  const count = physicalCount(dev), runs = [];
  const add = (id, name, first, last) => runs.push({ id, name, first, last, x: 0, y: runs.length * 3, axis: "x", flip: false });
  let next = 0;
  for (const seg of [...(dev.segments || [])].sort((a, b) => a.start - b.start || a.id - b.id)) {
    const first = Math.max(next, seg.start, 0), last = Math.min(count, seg.stop) - 1;
    if (first > last) continue;
    if (first > next) add("gap-" + next, next + 1 === first ? `LED ${next}` : `LEDs ${next}–${first - 1}`, next, first - 1);
    add("segment-" + seg.id, seg.name || `Segment ${seg.id}`, first, last);
    next = last + 1;
  }
  if (next < count) add("gap-" + next, next ? `LEDs ${next}–${count - 1}` : "Whole strip", next, count - 1);
  return runs;
}

export function outputSpan(dev, settings) {
  if (settings.transport !== "json") return [0, dev.led_count - 1];
  const seg = dev.segments?.find(s => s.id === Number(settings.segment));
  return dev.segments_known && seg && seg.linear !== false ? [seg.start, seg.stop - 1] : null;
}

export function runPoint(run, led) {
  const offset = run.flip ? run.last - led : led - run.first;
  return { x: run.x + (run.axis === "x" ? offset : 0), y: run.y + (run.axis === "y" ? offset : 0) };
}

export function hitRun(runs, x, y) {
  let best = null, distance = 0.76 ** 2;
  for (const run of runs) {
    const offset = Math.max(0, Math.min(run.last - run.first, Math.round(run.axis === "x" ? x - run.x : y - run.y)));
    const led = run.flip ? run.last - offset : run.first + offset;
    const p = runPoint(run, led);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= distance) { best = { run, led }; distance = d; }
  }
  return best;
}

export function mapView(runs, width, editing) {
  let left = 0, right = 0, top = 0, bottom = 0;
  for (const run of runs) {
    left = Math.min(left, run.x); top = Math.min(top, run.y);
    right = Math.max(right, run.x + (run.axis === "x" ? run.last - run.first : 0));
    bottom = Math.max(bottom, run.y + (run.axis === "y" ? run.last - run.first : 0));
  }
  const pad = editing ? 3 : 1;
  const cols = right - left + 1 + pad * 2, rows = bottom - top + 1 + pad * 2;
  const step = Math.min(22, width / cols, (editing ? 300 : 420) / rows);
  const height = Math.max(editing ? 150 : 68, Math.ceil(rows * step));
  return { width, height, step, x: (width - (left + right) * step) / 2, y: (height - (top + bottom) * step) / 2 };
}

export class StripMap {
  constructor(canvas, runs, { pick, move } = {}) {
    this.canvas = canvas;
    this.runs = runs;
    this.editing = !!move;
    this.pixels = [];
    this.span = null;
    const cell = e => {
      const box = canvas.getBoundingClientRect(), v = this.view;
      return { x: (e.clientX - box.left - v.x) / v.step, y: (e.clientY - box.top - v.y) / v.step };
    };
    canvas.addEventListener("pointerdown", e => {
      if (!this.view || e.button !== 0) return;
      const p = cell(e), hit = hitRun(this.runs, p.x, p.y);
      if (!hit) return;
      if (!move) { pick(hit.run, hit.led); return; }
      this.drag = { run: hit.run, px: p.x, py: p.y, x: hit.run.x, y: hit.run.y, pointer: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      pick(hit.run, hit.led);
    });
    canvas.addEventListener("pointermove", e => {
      const d = this.drag;
      if (!move && this.view) {
        const p = cell(e), hit = hitRun(this.runs, p.x, p.y);
        canvas.title = hit ? `${hit.run.name} · physical LED ${hit.led}` : "";
      }
      if (!d || d.pointer !== e.pointerId) return;
      const p = cell(e);
      move(d.run, d.x + Math.round(p.x - d.px), d.y + Math.round(p.y - d.py));
    });
    const end = e => { if (this.drag?.pointer === e.pointerId) { this.drag = null; this.draw(); } };
    canvas.addEventListener("lostpointercapture", end);
    canvas.addEventListener("pointercancel", end);
  }

  draw() {
    const c = this.canvas;
    if (!c.clientWidth) return;
    const v = this.view = this.drag ? this.view : mapView(this.runs, c.clientWidth, this.editing);
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(v.width * ratio), h = Math.round(v.height * ratio);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c.style.height = v.height + "px"; }
    const g = c.getContext("2d");
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, v.width, v.height);
    const light = c.getRootNode().host?.hasAttribute("light");
    const pos = (run, led) => {
      const p = runPoint(run, led);
      return [v.x + p.x * v.step, v.y + p.y * v.step];
    };
    for (const [index, run] of this.runs.entries()) {
      const a = pos(run, run.first), b = pos(run, run.last);
      const selected = this.editing && this.selectedId === run.id;
      g.beginPath(); g.moveTo(...a); g.lineTo(...b);
      g.strokeStyle = runColor(index);
      g.lineWidth = Math.max(1, v.step * (selected ? 0.94 : 0.64)); g.lineCap = "round"; g.stroke();
      const stride = Math.max(1, Math.ceil(1 / v.step));
      for (let led = run.first; led <= run.last; led += stride) {
        const [x, y] = pos(run, led);
        const addressable = this.span && led >= this.span[0] && led <= this.span[1];
        const px = addressable && this.pixels[led - this.span[0]];
        const lit = px && px.some(Boolean);
        g.fillStyle = lit ? `rgb(${px.map(n => Math.round(Math.sqrt(n / 255) * 255)).join(",")})`
          : addressable ? (light ? "#687687" : "#8292a5") : (light ? "#bdc4ce" : "#384353");
        g.beginPath(); g.arc(x, y, Math.max(0.55, v.step * 0.34), 0, Math.PI * 2); g.fill();
      }
      if (this.selectedLed >= run.first && this.selectedLed <= run.last && this.selectedLed != null) {
        g.beginPath(); g.arc(...pos(run, this.selectedLed), Math.max(3, v.step * 0.47), 0, Math.PI * 2);
        g.strokeStyle = light ? "#182230" : "#fff"; g.lineWidth = 2; g.stroke();
      }
    }
  }
}
