const revision = new URL(import.meta.url).search;
const [{ h }, { newId }, { StripMap, controllerRuns, outputSpan, physicalCount }] = await Promise.all([
  import("./elements.js" + revision), import("./config-edits.js" + revision), import("./strip-map.js" + revision),
]);

const button = (text, action, attrs = {}) => h("button", { type: "button", class: "btn", onclick: action, ...attrs }, text);
const field = (name, input) => h("label", { class: "arr-field" }, h("span", {}, name), input);
const footer = (...kids) => h("div", { class: "rowx arr-footer" }, ...kids);

function editor(panel, title) {
  const base = panel._config;
  const dlg = h("dialog", { class: "arr-dialog", "aria-label": title });
  const body = h("div", {}), error = h("div", { class: "arr-error", role: "alert" });
  dlg.append(h("h2", {}, title), body, error);
  dlg.addEventListener("close", () => dlg.remove());
  panel.shadowRoot.append(dlg);
  dlg.showModal();
  let busy = false;
  const close = () => dlg.close();
  const save = async settings => {
    if (busy) return;
    busy = true;
    try {
      const ok = await panel._saveEdit({ settings: { ...base.settings, ...settings } }, base, null,
        message => { error.textContent = message; });
      if (ok) { close(); panel._render(); }
    } finally { busy = false; }
  };
  return { base, body, error, close, save };
}

export function layoutBars(bars, layout) {
  if (!layout) return bars.map(({ id, enabled }) => ({ id, enabled }));
  const remaining = new Map(bars.map(b => [b.id, b]));
  const rows = layout.bars.filter(b => remaining.delete(b.id)).map(b => ({ ...b }));
  return rows.concat([...remaining.keys()].map(id => ({ id, enabled: false })));
}

export function editLayouts(panel) {
  const { base, body, error, close, save } = editor(panel, "Named layouts");
  const layouts = base.settings.layouts || [];
  const names = new Map(base.bars.map(b => [b.id, b.name]));
  const edit = original => {
    const id = original?.id || newId(), rows = layoutBars(base.bars, original);
    const input = h("input", { type: "text", value: original?.name || "", placeholder: "Workbench", required: true });
    const list = h("div", {});
    const drawRows = () => list.replaceChildren(...rows.map((row, i) => {
      const name = names.get(row.id);
      const shift = delta => {
        rows.splice(i + delta, 0, rows.splice(i, 1)[0]);
        drawRows();
        list.children[i + delta]?.querySelector("input")?.focus();
      };
      return h("div", { class: "arr-row" },
        h("label", { class: "rowx grow" }, h("input", { type: "checkbox", checked: row.enabled,
          onchange: e => { row.enabled = e.target.checked; } }), name),
        button("↑", () => shift(-1), { disabled: i === 0, "aria-label": `Move ${name} up` }),
        button("↓", () => shift(1), { disabled: i === rows.length - 1, "aria-label": `Move ${name} down` }));
    }));
    const scene = Object.values(panel._hass?.states || {}).find(s =>
      s.attributes?.wled_bars_entry === base.device.entry_id && s.attributes.layout_id === id);
    const remove = original && button("Delete layout", () => {
      body.replaceChildren(h("p", {}, `Delete “${original.name}” and its Home Assistant scene?`),
        footer(button("Back", () => edit(original)), button("Delete layout", () => save({ layouts: layouts.filter(l => l.id !== id) }),
          { class: "btn danger" })));
    }, { class: "btn danger" });
    const submit = async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); error.textContent = "Give the layout a name."; return; }
      const layout = { id, name, bars: rows };
      await save({ layouts: original ? layouts.map(l => l.id === id ? layout : l) : [...layouts, layout] });
    };
    body.replaceChildren(field("Layout name", input), h("p", { class: "dim sm" },
      "Choose which bars are on. Bars lower in this list draw on top."),
      list, scene && h("p", { class: "dim sm" }, "Home Assistant scene ", h("code", {}, scene.entity_id)),
      footer(remove, h("span", { class: "grow" }), button("Cancel", close), button("Save layout", submit, { class: "btn pri" })));
    error.textContent = ""; drawRows(); input.focus();
  };
  if (!layouts.length) { edit(null); return; }
  body.append(h("p", { class: "dim sm" }, "Each saved layout is available as a Home Assistant scene."),
    ...layouts.map(layout => h("div", { class: "arr-row" }, h("strong", { class: "grow" }, layout.name),
      button("Edit", () => edit(layout), { "aria-label": `Edit layout ${layout.name}` }))),
    footer(button("Close", close), button("Create layout", () => edit(null), { class: "btn pri" })));
}

export function editPhysicalMap(panel) {
  const { base, body, error, close, save } = editor(panel, "Arrange physical runs");
  const dev = base.device, count = physicalCount(dev);
  let automatic = base.settings.map_runs == null;
  let runs = automatic ? controllerRuns(dev) : structuredClone(base.settings.map_runs);
  let selected = runs[0];
  const canvas = h("canvas", { class: "map-canvas movable", "aria-label": "Drag a run to move it on the physical map" });
  const select = h("select", { "aria-label": "Selected run", onchange: e => choose(runs.find(r => r.id === e.target.value)) });
  const inputs = {}, controls = h("div", { class: "arr-fields" });
  const choose = r => {
    selected = r;
    map.selectedId = r?.id;
    select.value = r?.id || "";
    for (const [key, input] of Object.entries(inputs)) input.value = r?.[key] ?? "";
    direction.value = r?.axis || "x"; flip.checked = !!r?.flip;
    controls.hidden = !r;
    split.disabled = !r || r.last <= r.first;
    remove.disabled = !r;
    map.draw();
  };
  const map = new StripMap(canvas, runs, { pick: choose, move: (run, x, y) => {
    if (x === run.x && y === run.y) return;
    automatic = false; run.x = x; run.y = y;
    inputs.x.value = x; inputs.y.value = y; map.draw();
  } });
  map.span = outputSpan(dev, base.settings); map.pixels = panel._live.pixels;
  const refresh = () => {
    select.replaceChildren(...runs.map(r => h("option", { value: r.id }, r.name || "Unnamed run")));
    map.runs = runs;
    choose(selected);
  };
  const update = (key, value) => {
    if (!selected) return;
    automatic = false; selected[key] = value;
    if (key === "name") select.selectedOptions[0].textContent = value || "Unnamed run";
    split.disabled = selected.last <= selected.first;
    map.draw();
  };
  for (const [key, label] of [["name", "Run name"], ["first", "First physical LED"], ["last", "Last physical LED"],
    ["x", "Horizontal position"], ["y", "Vertical position"]]) {
    const isName = key === "name", bound = key === "first" || key === "last";
    inputs[key] = h("input", { type: isName ? "text" : "number", required: true, min: bound ? 0 : undefined,
      max: bound ? count - 1 : undefined, step: isName ? undefined : 1,
      oninput: e => {
        const input = e.target;
        if (isName || (input.value !== "" && input.validity.valid && Number.isSafeInteger(input.valueAsNumber)))
          update(key, isName ? input.value : input.valueAsNumber);
      }, onchange: e => {
        if (!isName && (!e.target.validity.valid || e.target.value === "")) e.target.value = selected[key];
      } });
    controls.append(field(label, inputs[key]));
  }
  const direction = h("select", { onchange: e => update("axis", e.target.value) },
    h("option", { value: "x" }, "Horizontal"), h("option", { value: "y" }, "Vertical"));
  const flip = h("input", { type: "checkbox", onchange: e => update("flip", e.target.checked) });
  controls.append(field("Direction", direction), h("label", { class: "rowx" }, flip, "Flip numbering"));
  const newRow = (first, last) => {
    const y = runs.reduce((max, r) => Math.max(max, r.y + (r.axis === "y" ? r.last - r.first : 0) + 3), 0);
    selected = { id: newId(), name: `Run ${runs.length + 1}`, first, last, x: 0, y, axis: "x", flip: false };
    runs.push(selected); automatic = false; error.textContent = ""; refresh();
  };
  const add = button("Add run", () => {
    let first = 0;
    for (const r of [...runs].sort((a, b) => a.first - b.first)) {
      if (r.first > first) { newRow(first, r.first - 1); return; }
      first = Math.max(first, r.last + 1);
    }
    if (first < count) newRow(first, count - 1);
    else error.textContent = "Every LED already has a run. Select an existing run and choose Split run.";
  });
  const split = button("Split run", () => {
    const last = selected.last, middle = Math.floor((selected.first + last) / 2);
    selected.last = middle; newRow(middle + 1, last);
  });
  const remove = button("Remove run", () => {
    runs = runs.filter(r => r !== selected); selected = runs[0]; automatic = false; refresh();
  });
  body.append(h("p", { class: "dim sm" }, "Drag a run or set its position in LED spacings."),
    canvas, field("Selected run", select), h("div", { class: "rowx" }, add, split, remove),
    controls, footer(button("Use WLED segments", () => {
      automatic = true; runs = controllerRuns(dev); selected = runs[0]; error.textContent = ""; refresh();
    }), h("span", { class: "grow" }), button("Cancel", close), button("Save map", () => {
      if (selected && !Object.values(inputs).every(input => input.reportValidity())) return;
      return save({ map_runs: automatic ? null : runs });
    }, { class: "btn pri" })));
  refresh();
}
