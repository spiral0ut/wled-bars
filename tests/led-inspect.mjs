import assert from "node:assert/strict";
import test from "node:test";
import { inspectLed, ledAddress } from "../custom_components/wled_bars/frontend/led-inspect.js";

const bars = [
  { id: "base", name: "Blue", start: 0, end: 19 },
  { id: "top", name: "Red", start: 19, end: 0 },
  { id: "hidden", name: "Night", start: 14, end: 19 },
];
const live = { bars: { base: { visible: true }, top: { visible: true, painted: [[0, 4], [13, 13]] },
  hidden: { visible: false } } };
const reason = () => "Hidden by its schedule";
test("independent ownership for filled, skipped, marker and hidden LEDs", () => {
  assert.equal(inspectLed(2, bars, live, reason).owner, "Red");
  assert.equal(inspectLed(13, bars, live, reason).owner, "Red");
  assert.deepEqual(inspectLed(19, bars, live, reason), { owner: "Blue", layers: [
    { name: "Night", reason: "Hidden by its schedule" },
    { name: "Red", reason: "Unfilled · shows bars underneath" },
    { name: "Blue", reason: "Supplies this LED" },
  ] });
  assert.equal(inspectLed(19, bars.slice(1), live, reason).owner, null);
  assert.deepEqual(inspectLed(20, bars, live, reason), { owner: null, layers: [] });
});
test("flash, identify and draft take priority only on their own pixels", () => {
  const state = { ...live, overlays: [
    { name: "Draft", start: 12, end: 0, painted: [[2, 3]] },
    { name: "Identify", painted: [[2, 2]] }, { name: "Flash", painted: [[2, 2]] },
  ] };
  assert.deepEqual(inspectLed(2, bars, state, reason).layers.map(l => l.reason),
    ["Supplies this LED", "Covered by Flash", "Covered by Flash", "Covered by Flash", "Covered by Flash"]);
  assert.equal(inspectLed(3, bars, state, reason).owner, "Draft");
  assert.equal(inspectLed(5, bars, state, reason).owner, "Blue");
});
test("physical and segment-relative addresses, mapped and missing segments", () => {
  const device = { segments_known: true, segments: [{ id: 1, start: 70, stop: 90, linear: true }] };
  const json = { transport: "json", segment: 1 };
  assert.equal(ledAddress(19, device, json), "Segment 1 LED 19 · physical LED 89");
  assert.equal(ledAddress(89, device, { transport: "ddp" }), "Physical LED 89");
  assert.equal(ledAddress(19, device, { ...json, segment: 2 }), "Segment 2 LED 19");
  assert.equal(ledAddress(19, { ...device, segments_known: false }, json), "Segment 1 LED 19");
  device.segments[0].linear = false;
  assert.match(ledAddress(19, device, json), /mapped segment, physical range 70–89/);
});
