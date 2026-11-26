import assert from "node:assert/strict";
import test from "node:test";
import { layoutStripLabels } from "../custom_components/wled_bars/frontend/strip-labels.js";

const pegboard = [
  { id: "battery", start: 34, end: 5, labelWidth: 82 },
  { id: "temperature", start: 0, end: 29, labelWidth: 118 },
  { id: "day", start: 41, end: 0, labelWidth: 64 },
];
const desktop = { w: 900, n: 90, perRow: 90, rows: 1, size: 10, x0: 0 };
const phone = { ...desktop, w: 300, perRow: 30, rows: 3 };

test("Pegboard bars keep card order and cover their configured LEDs", () => {
  const [lanes] = layoutStripLabels(desktop, pegboard, 24);
  assert.deepEqual(lanes.map(lane => lane.map(p => [p.range.id, p.first, p.last, p.named])), [
    [["battery", 5, 34, true]], [["temperature", 0, 29, true]], [["day", 0, 41, true]],
  ]);
  assert.equal(lanes[0][0].range.start, 34);
});

test("separate LED ranges share a lane only when their full labels and targets fit", () => {
  const ranges = [
    { start: 0, end: 0, labelWidth: 120 },
    { start: 2, end: 2, labelWidth: 20 },
    { start: 35, end: 37, labelWidth: 40 },
  ];
  const [lanes] = layoutStripLabels(desktop, ranges, 44);
  assert.deepEqual(lanes.map(lane => lane.map(p => p.first)), [[0, 35], [2]]);
  for (const part of lanes.flat()) assert.ok(part.right - part.left >= 44);
});

test("wrapped reversed ranges continue on the next LED row and have one name", () => {
  const rows = layoutStripLabels(phone, pegboard, 44);
  assert.deepEqual(rows.map(lanes => lanes.flat().map(p => [p.range.id, p.first, p.last, p.named])), [
    [["battery", 5, 29, true], ["temperature", 0, 29, true], ["day", 0, 29, true]],
    [["battery", 30, 34, false], ["day", 30, 41, false]],
    [],
  ]);
  assert.equal(rows[1][0][0].lineLeft, 1);
  assert.equal(rows[1][0][0].lineRight, 49);
});

test("long edge labels wrap inside the view and partial rows stop at the last LED", () => {
  const layout = { ...phone, n: 83 };
  const range = { start: 100, end: 82, labelWidth: 700 };
  const rows = layoutStripLabels(layout, [range, { start: 99, end: 99, labelWidth: 20 }], 44);
  const [part] = rows.flat(2);
  assert.equal(rows.flat(2).length, 1);
  assert.deepEqual([part.first, part.last, part.lineLeft, part.lineRight], [82, 82, 221, 229]);
  assert.deepEqual([part.left, part.right, part.labelLeft, part.labelWidth], [0, 300, 0, 300]);
  assert.deepEqual(layoutStripLabels(layout, [], 44), [[], [], []]);
});

test("a chain of overlaps follows card order in the editor and the overview", () => {
  const ranges = [[0, 5], [4, 15], [13, 25], [60, 70]].map(([start, end]) => ({ start, end, labelWidth: 30 }));
  for (const target of [0, 24, 44]) {
    const [lanes] = layoutStripLabels(desktop, ranges, target);
    assert.deepEqual(lanes.map(lane => lane.map(p => p.range.start)), [[0, 60], [4], [13]]);
  }
});
