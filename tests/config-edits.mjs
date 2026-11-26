import assert from "node:assert/strict";
import test from "node:test";
import { saveConfigEdit } from "../custom_components/wled_bars/frontend/config-edits.js";

globalThis.HTMLElement = class {};
globalThis.window = {};
globalThis.customElements = new Map();
customElements.define = customElements.set;
const { readExport } = await import("../custom_components/wled_bars/frontend/wled-bars.js");
const Panel = customElements.get("wled-bars-panel");

function fixture() {
  function strip(entry_id, names, brightness) {
    return { device: { entry_id, led_count: 90 }, rev: 1, settings: { brightness },
      bars: names.map(name => ({ id: name, name, start: 1, end: 10, enabled: true })) };
  }
  const strips = { a: strip("a", ["Alpha", "Beta"], 71), b: strip("b", ["Gamma"], 19) };
  const ws = async (type, { entry_id, expected_rev, ...changes }) => {
    const strip = strips[entry_id];
    if (type === "save") {
      if (expected_rev !== strip.rev) throw Object.assign(new Error("stale"), { code: "config_conflict" });
      Object.assign(strip, structuredClone(changes));
      strip.rev++;
    } else assert.equal(type, "get");
    return structuredClone(strip);
  };
  const panel = Object.create(Panel.prototype);
  const views = [];
  Object.assign(panel, {
    ws, _devices: Object.values(strips).map(s => s.device), _view: "list", _entry: "a",
    _render() { views.push([this._entry, this._bars.map(b => b.name)]); },
    _subscribe() {}, _loadOthers() {}, _refreshConfig() {},
    _toast(message, undo) { this.message = message; this.undo = undo; },
  });
  panel._acceptConfig(structuredClone(strips.a));
  return { strips, panel, ws, views };
}

test("delete Undo after changing strips restores only the deleted bar on its original strip", async () => {
  const { strips, panel } = fixture();
  await panel._delete(1);
  assert.deepEqual(strips.a.bars.map(b => b.id), ["Alpha"]);
  await panel._selectDevice("b");
  strips.a.bars[0].enabled = false;
  strips.a.bars.push({ id: "delta", name: "Delta" });
  strips.a.rev++;
  const other = structuredClone(strips.b);
  await panel.undo();
  assert.deepEqual(strips.b, other);
  assert.deepEqual(strips.a.bars.map(b => b.id), ["Alpha", "Beta", "delta"]);
  assert.equal(strips.a.bars[0].enabled, false);
  assert.equal(panel._device.entry_id, "b");
});

test("Undo of a bars-only import preserves newer settings and edits on both strips", async () => {
  const { strips, panel } = fixture();
  await panel._saveEdit({ bars: [...panel._bars, { id: "", name: "Imported" }] }, panel._config, "Loaded");
  assert.ok(strips.a.bars[2].id);
  const undo = panel.undo;
  strips.a.settings.brightness = 63;
  strips.a.bars[1].name = "Edited elsewhere";
  strips.a.rev++;
  await panel._selectDevice("b");
  await undo();
  assert.equal(strips.a.bars.length, 2);
  assert.equal(strips.a.bars[1].name, "Edited elsewhere");
  assert.deepEqual([strips.a.settings.brightness, strips.b.settings.brightness], [63, 19]);
});

test("switching clears the previous controls and ignores a late device response", async () => {
  const { strips, panel, ws, views } = fixture();
  let release;
  panel.ws = (type, data) => data.entry_id === "b" ? new Promise(resolve => { release = resolve; }) : ws(type, data);
  const pending = panel._selectDevice("b");
  assert.deepEqual(views.at(-1), ["b", []]);
  assert.equal(panel._config, null);
  await panel._duplicate(0);
  await panel._selectDevice("a");
  release(structuredClone(strips.b));
  await pending;
  assert.equal(panel._device.entry_id, "a");
  assert.deepEqual(strips.b.bars.map(b => b.id), ["Gamma"]);
});

test("saving an open editor preserves another client's addition, toggle and independent field edit", async () => {
  const { strips, panel } = fixture();
  panel._draftBase = panel._config;
  panel._draft = { ...panel._bars[1], name: "Renamed" };
  panel._closeEditor = () => {};
  strips.a.bars[0].enabled = false;
  strips.a.bars[1].end = 25;
  strips.a.bars.push({ id: "d", name: "Delta" });
  strips.a.rev++;
  await panel._saveDraft();
  assert.equal(strips.a.bars[0].enabled, false);
  assert.equal(strips.a.bars[1].name, "Renamed");
  assert.equal(strips.a.bars[1].end, 25);
  assert.equal(strips.a.bars[2].name, "Delta");
});

test("same-field changes and delete-versus-edit conflicts leave the latest version intact", async () => {
  const { strips, ws } = fixture();
  const base = structuredClone(strips.a);
  strips.a.bars[1].name = "Other name";
  strips.a.rev++;
  const save = bars => saveConfigEdit(ws, base, { bars });
  await assert.rejects(save([base.bars[0]]), /changed elsewhere/);
  await assert.rejects(save([base.bars[0], { ...base.bars[1], name: "My name" }]), /changed elsewhere/);
  assert.equal(strips.a.bars[1].name, "Other name");
  strips.a.bars.pop();
  strips.a.rev++;
  await assert.rejects(save([base.bars[0], { ...base.bars[1], end: 20 }]), /changed elsewhere/);
  assert.equal(strips.a.bars.length, 1);
});

test("a write between read and save is retried on the latest revision without duplicating insertions", async () => {
  const { strips, ws } = fixture();
  const base = structuredClone(strips.a);
  const ids = [];
  const racing = async (type, msg) => {
    if (type === "save") {
      ids.push(msg.bars.at(-1).id);
      if (ids.length === 1) { strips.a.bars[0].enabled = false; strips.a.rev++; }
    }
    return ws(type, msg);
  };
  await saveConfigEdit(racing, base, { bars: [...base.bars, { id: "", name: "New" }] });
  assert.equal(ids.length, 2);
  assert.ok(ids[0] && ids[0] === ids[1]);
  assert.equal(strips.a.bars[0].enabled, false);
  assert.equal(strips.a.bars.length, 3);
});

test("conflicting reorders fail and compatible reorders retain another client's new bar", async () => {
  const { strips, ws } = fixture();
  strips.a.bars.push({ id: "c", name: "C" });
  const base = structuredClone(strips.a);
  const [a, b, c] = base.bars;
  strips.a.bars = [c, a, b];
  await assert.rejects(saveConfigEdit(ws, base, { bars: [b, a, c] }), /Bar order/);
  strips.a.bars = [a, { id: "x" }, b, c];
  await saveConfigEdit(ws, base, { bars: [b, a, c] });
  assert.deepEqual(strips.a.bars.map(bar => bar.id), ["Beta", "x", "Alpha", "c"]);
});

test("empty branded settings backups load and malformed files are rejected", () => {
  const settings = { brightness: 47 };
  assert.deepEqual(readExport(JSON.stringify({ wled_bars: 1, bars: [], settings })).settings, settings);
  for (const data of [[], { bars: [] }, { wled_bars: 1, bars: [], settings: [] }, { bars: [null] }])
    assert.equal(readExport(JSON.stringify(data)), null);
});
