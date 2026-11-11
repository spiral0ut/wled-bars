# WLED Bars

Progress bars and status gauges on a WLED strip, set up visually inside Home Assistant.

Drag across a picture of your strip to place a bar, point it at a sensor, timer or finish time, and style it with a live animated preview. No YAML, and no WLED segments to prepare.

> **Status: early build (0.3.0).** In use on real hardware, but young: the render engine, frame logic and editor are covered by tests (see [Testing](#testing)), while the Home Assistant entity wiring is only tested against stubs. Expect rough edges.

## What a bar can do

| Area | Options |
|---|---|
| **Position** | Any LED range, either direction (drag backwards for a reversed bar). Fill from the beginning, the end, the centre outwards, or both ends inwards. |
| **Source** | A numeric entity or attribute with min/max · a `timer.*` helper · "finishes at" timestamp sensors (washer, dryer, oven, printer ETA) · a daily time window (day progress) · manual, driven by services. Any source can be reversed to drain instead of fill. |
| **Colours** | One colour · gradient along the bar (fixed, or stretched over the lit part) · hard colour zones · whole bar recolours with the value (great for temperature) · rainbow. Unlimited colour stops, presets. |
| **Tip** | 1–20 LEDs at the leading edge: steady, blink, smooth pulse or strobe, adjustable speed, own colour or a tint of the bar, on the last lit LEDs or just ahead, optional comet fade. |
| **Begin / end markers** | Always-on LEDs at each end showing where the bar starts and stops, with their own colour, brightness and effect. |
| **Unlit part & scale** | Off, a dim ghost of the bar, or a fixed colour; scale marks every 10/20/25/50 %. |
| **Markers & peak** | Pin fixed values or other entities onto the bar (thermostat setpoint on a temperature bar). Peak-hold dot. |
| **Motion** | Breathe, flow towards the tip, scanner sweep ("charging"), shimmer. Smooth sub-LED leading edge and glide between values. |
| **Alerts** | Rules such as "fill ≥ 90 % → red, blink, whole bar" or "entity is `error` → strobe". Later rules win. |
| **Finished / offline** | Flash, pulse, rainbow or sparkle at 100 %, then stay or hide. Hide or warn when the source is unavailable. |
| **Visibility** | Only while another entity is in given states; hide at 0 %; hide when idle. |
| **Device** | Master switch and brightness entities, night dimming (schedule or entity), several bars per strip (later bars win where they overlap), several WLED devices. |

## Install

1. Copy `custom_components/wled_bars` into your Home Assistant `config/custom_components/` folder or, with HACS: **HACS → ⋮ → Custom repositories**, add `https://github.com/spiral0ut/wled-bars` with type *Integration*, then download **WLED Bars**.
2. Restart Home Assistant.
3. **Settings → Devices & services → Add integration → WLED Bars**, enter the WLED IP address. WLED devices on the network are also discovered automatically.
4. Open **WLED Bars** in the sidebar.

Requires Home Assistant 2024.8 or newer and WLED 0.13 or newer.

## Using it

- **Three basics, then add-ons:** every bar starts with just *Where on the strip*, *What it shows* and *Colour*. Everything else (flashing tip, begin & end markers, scale marks, target markers, motion, alerts, finish celebration, show-only-when…) is an add-on you attach from the *Add extras* tray and can remove again. Templates come with the add-ons that suit them already attached.
- **Range:** for a sensor, set the reading that means an empty bar and the reading that means a full bar; the editor tells you what the current reading lights up, and the preview follows the live value until you drag *Simulate*.
- **Tailored to the preset:** each template only shows what applies to it. A temperature gauge gets a draggable cold-to-hot scale with Room / Outdoor / Fridge / Freezer presets and no "finished" options; a countdown only offers timers.
- **Show only when…:** build conditions visually: drag a block on a 24-hour bar, pick days of the week, or tie the bar to an entity's state or a number. Combine with *all* or *any*. Duplicate a bar and give each copy its own times to show different bars on the same LEDs through the day.
- **Order:** drag bar cards to reorder them. Where bars share LEDs, the one further down the list is drawn on top.
- **Preset defaults:** the *Preset defaults* button (top of the bar list) chooses which add-ons each preset starts with. It applies to every strip and only affects new bars.
- **Distance to a place:** fills as a person, a device tracker or a distance sensor gets closer to a zone (home by default). The length of the bar is a set distance, the distance between two zones you pick (for example work to home), or wherever the trip starts.
- **Create a bar:** pick a template (print progress, temperature gauge, battery, countdown, finishes-at, day progress, level meter, blank), then drag across the strip to place it. Afterwards drag the middle to move it or either white end to resize; only *Flip direction* changes which way it fills.
- **Preview:** the bar at the top of the editor is drawn by the same engine that drives the LEDs. Drag *Simulate*, press *Play*, or use *Test completion* / *Unavailable*.
- **Show on strip:** mirrors the draft onto the real LEDs while you edit. *Flash these LEDs* blinks the chosen range so you can find it on the wall.
- **Dashboard card:** add the *WLED Bars* card for a live view (`type: custom:wled-bars-card`, optional `title`, `entry_id` or `device`, `show_bars: false`).

### Two ways of sending frames (Device settings)

| | Per-LED JSON (default) | Realtime DDP |
|---|---|---|
| Frame rate | about 5 fps | 25 fps and up |
| Rest of the strip | keeps WLED's own effect on LEDs no bar uses | goes dark while any bar is showing |
| When no bar shows | LEDs are handed back to WLED | WLED resumes by itself after ~2.5 s |
| Best for | status bars sharing an ambient strip | a strip dedicated to bars, smooth pulses |

With JSON, LED numbers count from the start of the chosen WLED segment; use a segment without grouping or spacing. DDP needs "Receive UDP realtime" enabled in WLED (the default).

### Entities

Each WLED device gets a **Bars** switch and a **Bars brightness** number. Each bar also gets:

| Entity | What it is |
|---|---|
| `switch.<device>_bars_<bar>` | Turns that bar on or off |
| `sensor.<device>_bars_<bar>_fill` | How full the bar is, in whole percent (unknown while it has nothing to show); attributes `showing`, `status`, `value` |
| `number.<device>_bars_<bar>_value` | For bars driven by an automation: sets the bar's value |

Entities follow the bar: they are created when a bar is added, renamed with it (the entity id stays the same) and removed when it is deleted.

### Services

| Service | Data | Use |
|---|---|---|
| `wled_bars.start_timer` | `bar`, `duration` | Run a countdown on a *manual* bar |
| `wled_bars.stop_timer` | `bar` | Stop it |
| `wled_bars.set_value` | `bar`, `value` | Set a *manual* bar's value (in its min/max units) |
| `wled_bars.set_enabled` | `bar`, `enabled` | Turn one bar on or off |

`bar` is the bar's name (or id).

## How it compares

Built after reading three existing projects:

- **WLED Task Map** – visual editor and a basic fill effect, but blink runs on a fixed 1 Hz timer and a bar is one colour blend with no tip, caps, markers or time sources.
- **WLED Context Effects** – more effect types, but each is configured through config-flow forms and YAML, with no visual preview.
- **WLED Live View Proxy** – a WebSocket bridge and live-view card; the bar logic is left to your own automations.

WLED Bars borrows Task Map's per-LED JSON approach (so it coexists with normal WLED use), adds a realtime transport for smooth animation, and puts one render engine behind both the LEDs and the editor preview so what you design is what you get.

## Project layout

```
custom_components/wled_bars/
  engine.py            pure render engine (no Home Assistant imports)
  manager.py           sources, visibility, smoothing, frame loop, transports
  wled.py              WLED JSON API + DDP client
  websocket.py         API used by the panel and card
  frontend/engine.js   line-for-line mirror of engine.py for the preview
  frontend/wled-bars.js  sidebar editor panel + dashboard card
demo/index.html        the editor running against a fake Home Assistant
tests/                 engine tests, Python/JS parity, manager vs. fake WLED
```

## Testing

```bash
python3 tests/test_engine.py
```

Checks fill, direction, caps, tip, colours, rules and markers, then renders 600 random bars in both the Python and JavaScript engines and requires identical frames (needs `node`).

```bash
python3 tests/test_manager.py
```

Runs the manager against a fake WLED device: range-compressed JSON output, sending only changed LEDs, releasing the segment, a blinking tip, a manual timer through completion, a timer entity, DDP packets and strip preview. Needs `aiohttp`; Home Assistant itself is stubbed.

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/demo/` to try the editor without Home Assistant.

## Not done yet

- 2D matrix layouts, import/export, translations other than English.
