// Ranges in a live frame use the same address space as the strip ruler.
const inRange = (led, a, b) => led >= Math.min(a, b) && led <= Math.max(a, b);

export function paintsLed(layer, led) {
  return layer.painted
    ? layer.painted.some(([lo, hi]) => led >= lo && led <= hi)
    : inRange(led, layer.start, layer.end);
}

export function ledAddress(led, device, settings) {
  if (settings.transport !== "json") return `Physical LED ${led}`;
  const id = Number(settings.segment);
  const label = `Segment ${id} LED ${led}`;
  const segment = device.segments?.find(s => s.id === id);
  if (!device.segments_known || !segment || led >= segment.stop - segment.start) return label;
  return segment.linear === false
    ? `${label} · mapped segment, physical range ${segment.start}–${segment.stop - 1}`
    : `${label} · physical LED ${segment.start + led}`;
}

export function inspectLed(led, bars, live, hiddenReason) {
  const layers = [];
  let owner = null;
  function add(name, paints, why) {
    const reason = paints ? (owner === null ? "Supplies this LED" : `Covered by ${owner}`) : why;
    layers.push({ name, reason });
    if (paints && owner === null) owner = name;
  }
  for (const layer of [...(live.overlays || [])].reverse()) {
    const paints = paintsLed(layer, led);
    if (paints || inRange(led, layer.start, layer.end)) add(layer.name, paints, "Unfilled · shows bars underneath");
  }
  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i];
    if (!inRange(led, bar.start, bar.end)) continue;
    const st = live.bars[bar.id];
    if (!st?.visible) add(bar.name, false, hiddenReason(bar, i));
    else add(bar.name, !st.painted || paintsLed(st, led), "Unfilled · shows bars underneath");
  }
  return { owner, layers };
}
