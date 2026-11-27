// Reapply only the user's edit to the latest configuration of its original device.
function same(a, b) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(16).padStart(8, "0")).join("");

function conflict(field) {
  throw new Error(`${field} changed elsewhere. Reopen it to review the latest version.`);
}

function mergeValue(before, wanted, latest, field) {
  if (same(before, wanted)) return latest;
  if (same(before, latest) || same(wanted, latest)) return wanted;
  if (record(before) && record(wanted) && record(latest)) {
    const merged = { ...latest };
    for (const key of new Set([...Object.keys(before), ...Object.keys(wanted)])) {
      const collections = (key === "layouts" || key === "map_runs") &&
        [before[key], wanted[key], latest[key]].every(Array.isArray);
      const value = collections ? mergeBars(before[key], wanted[key], latest[key])
        : mergeValue(before[key], wanted[key], latest[key], field);
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    return merged;
  }
  conflict(field);
}

function mergeBars(before, wanted, latest) {
  const old = new Map(before.map(b => [b.id, b]));
  const next = new Map(wanted.map(b => [b.id, b]));
  const merged = latest.map(bar => old.has(bar.id)
    ? mergeValue(old.get(bar.id), next.get(bar.id), bar, bar.name) : bar).filter(Boolean);
  const currentIds = new Set(latest.map(b => b.id));
  for (const bar of wanted) {
    if (old.has(bar.id) && !currentIds.has(bar.id) && !same(old.get(bar.id), bar)) conflict(bar.name);
  }
  // Reorder only existing bars the user reordered. Keep other clients' additions in place.
  const shared = bar => currentIds.has(bar.id) && old.has(bar.id) && next.has(bar.id);
  const ids = bars => bars.filter(shared).map(b => b.id);
  const order = ids(wanted);
  if (!same(ids(before), order)) {
    if (!same(ids(latest), ids(before)) && !same(ids(latest), order)) conflict("Bar order");
    const byId = new Map(merged.map(b => [b.id, b]));
    let pos = 0;
    merged.forEach((bar, i) => { if (shared(bar)) merged[i] = byId.get(order[pos++]); });
  }
  // Place insertions beside the same neighbours, including a bar restored by Undo.
  for (let i = wanted.length - 1; i >= 0; i--) {
    const bar = wanted[i];
    if (old.has(bar.id)) continue;
    if (currentIds.has(bar.id)) {
      if (!same(latest.find(b => b.id === bar.id), bar)) conflict(bar.name);
      continue;
    }
    let at = merged.findIndex(b => b.id === wanted[i + 1]?.id);
    if (at < 0) {
      const previous = wanted.slice(0, i).findLast(b => merged.some(item => item.id === b.id));
      at = previous ? merged.findIndex(b => b.id === previous.id) + 1 : merged.length;
    }
    merged.splice(at, 0, bar);
  }
  return merged;
}

export async function saveConfigEdit(ws, base, changes) {
  const entry = base.device.entry_id;
  const wanted = { ...changes };
  if (wanted.bars) wanted.bars = wanted.bars.map(bar => {
    if (bar.id) return bar;
    return { ...bar, id: newId() };
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await ws("get", { entry_id: entry });
    const update = {};
    const previous = {};
    if (wanted.bars) {
      update.bars = mergeBars(base.bars, wanted.bars, current.bars);
      previous.bars = current.bars;
    }
    if (wanted.settings) {
      update.settings = mergeValue(base.settings, wanted.settings, current.settings, "Device settings");
      previous.settings = current.settings;
    }
    try {
      const saved = await ws("save", { entry_id: entry, expected_rev: current.rev, ...update });
      return { saved, previous };
    } catch (err) {
      if (err?.code !== "config_conflict" || attempt === 2) throw err;
    }
  }
}
