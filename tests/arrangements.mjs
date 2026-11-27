import assert from "node:assert/strict";
import test from "node:test";
import { controllerRuns, hitRun, mapView, outputSpan, runPoint } from "../custom_components/wled_bars/frontend/strip-map.js";
import { layoutBars } from "../custom_components/wled_bars/frontend/arrangement-dialogs.js";
import { saveConfigEdit } from "../custom_components/wled_bars/frontend/config-edits.js";

const dev = { entry_id: "peg", led_count: 90, strip_count: 90, segments_known: true,
  segments: [{ id: 0, start: 1, stop: 70, name: "Desk" }, { id: 1, start: 70, stop: 90, name: "Wall" }] };
const bars = [{ id: "a", enabled: false }, { id: "b", enabled: true }, { id: "new", enabled: true }];
const layout = { id: "work", name: "Workbench", bars: [{ id: "b", enabled: false }, { id: "gone", enabled: true }, { id: "a", enabled: true }] };

test("layouts reference shared bars, skip deleted members and park new bars switched off", () => {
  assert.deepEqual(layoutBars(bars, layout), [{ id: "b", enabled: false }, { id: "a", enabled: true }, { id: "new", enabled: false }]);
  assert.deepEqual(layoutBars(bars, null), bars);
});
test("Pegboard segments and gaps cover every physical LED exactly once", () => {
  const runs = controllerRuns(dev);
  assert.deepEqual(runs.map(r => [r.name, r.first, r.last]), [["LED 0", 0, 0], ["Desk", 1, 69], ["Wall", 70, 89]]);
  const overlapping = controllerRuns({ ...dev, segments: [...dev.segments, { id: 2, start: 5, stop: 75 }] });
  const leds = overlapping.flatMap(r => Array.from({ length: r.last - r.first + 1 }, (_, i) => r.first + i));
  assert.deepEqual(leds, [...Array(90).keys()]);
  assert.deepEqual(controllerRuns({ led_count: 0 }), []);
});
test("moved, flipped, vertical runs preserve physical addresses and hit testing", () => {
  const run = { ...controllerRuns(dev)[2], x: -4, y: 3, flip: true, axis: "y" };
  assert.deepEqual(runPoint(run, 89), { x: -4, y: 3 });
  assert.deepEqual(runPoint(run, 70), { x: -4, y: 22 });
  for (let led = 70; led <= 89; led++) {
    const p = runPoint(run, led);
    assert.equal(hitRun([run], p.x + 0.2, p.y - 0.1).led, led);
  }
  assert.equal(hitRun([run], 0, 0), null);
  const v = mapView([run], 290, false);
  assert.ok(v.x - 4 * v.step > 0 && v.y + 22 * v.step < v.height);
});
test("mapping uses physical LEDs in DDP and only the selected linear segment in JSON", () => {
  assert.deepEqual(outputSpan(dev, { transport: "ddp" }), [0, 89]);
  assert.deepEqual(outputSpan({ ...dev, led_count: 20 }, { transport: "json", segment: 1 }), [70, 89]);
  assert.equal(outputSpan(dev, { transport: "json", segment: 4 }), null);
  assert.equal(outputSpan({ ...dev, segments_known: false }, { transport: "json", segment: 1 }), null);
  assert.equal(outputSpan({ ...dev, segments: [{ ...dev.segments[1], linear: false }] }, { transport: "json", segment: 1 }), null);
});
test("independent map and scene edits survive a save from another panel", async () => {
  const base = { device: dev, rev: 1, bars, settings: { layouts: [layout], map_runs: controllerRuns(dev) } };
  const current = structuredClone(base);
  current.settings.layouts[0].name = "Focus";
  current.settings.map_runs[0].x = -4;
  const wanted = structuredClone(base.settings);
  wanted.map_runs[2].flip = true;
  const ws = async (type, data) => type === "get" ? current : { ...current, ...data };
  const { saved } = await saveConfigEdit(ws, base, { settings: wanted });
  assert.equal(saved.settings.layouts[0].name, "Focus");
  assert.equal(saved.settings.map_runs[0].x, -4);
  assert.equal(saved.settings.map_runs[2].flip, true);
});
test("adding backup layouts keeps the original and points each copy at its imported bars", async () => {
  globalThis.HTMLElement = class {};
  globalThis.window = {};
  globalThis.customElements = new Map();
  customElements.define = customElements.set;
  const { importedSettings, adoptBars } = await import("../custom_components/wled_bars/frontend/wled-bars.js");
  const base = { device: dev, bars, settings: { layouts: [layout], active_layout: "work", map_runs: [], segment: 1 } };
  const file = { bars: [bars[0]], settings: { layouts: [layout], map_runs: controllerRuns(dev), active_layout: "work", segment: 0 } };
  const adopted = adoptBars(file.bars, bars, 90, 90);
  const settings = importedSettings(file, base, adopted, true);
  assert.notEqual(adopted[0].id, bars[0].id);
  assert.equal(settings.layouts.length, 2);
  assert.notEqual(settings.layouts[0].id, settings.layouts[1].id);
  assert.equal(settings.layouts[1].bars.at(-1).id, adopted[0].id);
  assert.equal(settings.active_layout, "work");
  assert.equal(settings.segment, 1);
  assert.deepEqual(settings.map_runs, file.settings.map_runs);
});
