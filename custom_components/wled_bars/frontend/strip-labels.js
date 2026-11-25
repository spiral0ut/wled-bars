// Each LED row has its own stack of label lanes. All coordinates are CSS pixels.
export function layoutStripLabels({ w, n, perRow, rows, size, x0 }, ranges, minTarget) {
  const result = Array.from({ length: rows }, () => []);
  const gap = 6;
  for (const range of ranges) {
    const low = Math.max(0, Math.min(range.start, range.end));
    const high = Math.min(n - 1, Math.max(range.start, range.end));
    for (let first = low; first <= high;) {
      const row = Math.floor(first / perRow);
      const rowStart = row * perRow;
      const last = Math.min(high, rowStart + perRow - 1);
      const lineLeft = x0 + (first - rowStart) * size + 1;
      const lineRight = x0 + (last - rowStart + 1) * size - 1;
      const named = first === low;
      const labelWidth = named ? Math.min(range.labelWidth, w) : 0;
      const labelLeft = Math.min(lineLeft, w - labelWidth);
      // Reserve the union of the line, the printed label and its minimum tap target.
      const start = Math.min(lineLeft, labelLeft);
      const right = Math.min(w, Math.max(lineRight, labelLeft + labelWidth, start + minTarget));
      const left = Math.max(0, Math.min(start, right - minTarget));
      const part = { range, first, last, left, right, lineLeft, lineRight, named, labelLeft, labelWidth };
      const lanes = result[row];
      let lane = lanes.find(items => items.every(item => item.right + gap <= left || right + gap <= item.left));
      if (!lane) {
        lane = [];
        lanes.push(lane);
      }
      lane.push(part);
      first = last + 1;
    }
  }
  return result;
}
