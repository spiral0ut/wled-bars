"""Per-device arrangements. LED numbers on the physical map are always absolute."""
from __future__ import annotations


def apply_layout(bars: list[dict], layout: dict) -> list[dict]:
    remaining = {bar["id"]: bar for bar in bars}
    ordered = []
    for item in layout["bars"]:
        bar = remaining.pop(item["id"], None)
        if bar is not None:
            ordered.append(dict(bar, enabled=item["enabled"]))
    # Bars added since the snapshot are available for editing in every layout.
    ordered.extend(dict(bar, enabled=False) for bar in remaining.values())
    return ordered


def _records(items, label, named=True):
    if not isinstance(items, list):
        raise ValueError(f"{label} must be a list.")
    ids = set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"].strip():
            raise ValueError(f"Each entry in {label} needs an ID.")
        if item["id"] in ids:
            raise ValueError(f"Repeated ID in {label}.")
        ids.add(item["id"])
        if named and (not isinstance(item.get("name"), str) or not item["name"].strip()):
            raise ValueError(f"Each entry in {label} needs a name.")
    return items


def validate_layouts(layouts):
    names = set()
    for layout in _records(layouts, "layouts"):
        name = layout["name"].strip().casefold()
        if name in names:
            raise ValueError("Choose a different name for each layout.")
        names.add(name)
        for bar in _records(layout.get("bars"), "layout bars", named=False):
            if not isinstance(bar.get("enabled"), bool):
                raise ValueError("Each layout bar needs an on or off setting.")


def validate_map(runs, count):
    boxes = []
    for run in _records(runs, "map runs"):
        if any(type(run.get(k)) is not int for k in ("first", "last", "x", "y")):
            raise ValueError("Use whole numbers for run endpoints and positions.")
        first, last, x, y = (run[k] for k in ("first", "last", "x", "y"))
        if first < 0 or last < first or (count is not None and last >= count):
            raise ValueError(f"Choose valid physical LED endpoints for {run['name']}.")
        if run.get("axis") not in ("x", "y") or not isinstance(run.get("flip"), bool):
            raise ValueError("Choose a direction for each map run.")
        right = x + (last - first if run["axis"] == "x" else 0)
        bottom = y + (last - first if run["axis"] == "y" else 0)
        for other, x2, y2 in boxes:
            if first <= other["last"] and other["first"] <= last:
                raise ValueError(f"{run['name']} and {other['name']} include the same physical LED.")
            if x <= x2 and other["x"] <= right and y <= y2 and other["y"] <= bottom:
                raise ValueError(f"Move {run['name']} and {other['name']} into separate map positions.")
        boxes.append((run, right, bottom))
