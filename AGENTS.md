# Figure Studio — notes for AI agents

A static web app that builds Arabic/English math figures (geometry, axes, mechanics, free drawing) and exports PNG/SVG/PDF.
Everything runs in the page; there is no backend. **Do not click through the UI when you can call `window.nagwa`.**

## Quick start (in the page's JS console / a JS tool)

```js
nagwa.help()        // one-screen guide
nagwa.describe()    // every shape (with param ranges), every tool (with steps), tool options, rules
await nagwa.build({ shapes: [{ def: 'tri-right' }] })   // build a whole figure in one call, then fit
(await nagwa.check())                                   // { ok, issues } — nothing clipped or invalid?
await nagwa.export({ lang: 'both', formats: ['png', 'svg'] })  // files as data, no download dialog
```

The page's CSP blocks `eval`/`new Function`; call `window.nagwa` functions directly instead.

## API

| Call | What it does |
|---|---|
| `describe()` | Catalogue of shapes/tools with ranges, steps, options. Read this first. |
| `state()` | What is on the canvas: shape ids, vertex names, points, lines, marks. |
| `build(spec)` | Clears, builds shapes/points/lines/angles/right-angles from JSON, fits. |
| `addShape(def, params?)` / `setParams(id, params)` | Add or edit one shape; params are validated against their ranges. |
| `runTool(toolId, picks, opts?)` | Runs a construction tool like the buttons do. Picks: `{shape, vertex}`, `{shape, side, k?}`, `{point}`, `{x, y}`. |
| `check()` | Lists clipped or invalid items. Repeat until `ok`. |
| `export({lang?, formats?, ratio?, name?})` | `png`/`pdf` as base64, `svg` as text. |
| `projectText()` / `loadProject(text)` | Save/load the project JSON. |
| `clear() undo() redo() fit() select(id)` | Housekeeping. |

Errors are thrown as `Error("nagwa: …")` and say what to change.

## Rules of this project (keep them)

- Line weight is fixed at **0.797 pt** (1.0627 px), independent of zoom/scale. Never change it.
- Everything drawn must be inside the image ("farthest ink point"): Fit includes every label, mark and arrow. `check()` verifies this.
- Each figure exists in Arabic and English; vertex names/letters localise automatically.
- Before changing app code, think about what existing behaviour the change could break (saved projects, other tools, exports).
- Dev server: `npm run dev` (http://localhost:5173). Build: `npm run build`. The dev-only hook `window.__nagwaVerify` also exists.

## Handy ids

Shapes: `tri-right`, `tri-isosceles`, `quad-square`, `quad-rectangle`, `poly-n`, `circle`, `solid-*`, `axes-2d`, `mech-wedge`, `mech-ground`, `mech-wall`, `mech-block`, `mech-particle`, `mech-planes` (2–3 connected planes). Tools: `segment`, `force-line`, `draw-force`, `angle-mark`, `attach-block`, `attach-particle`, `perp`, `extend`. Use `describe()` for the full list.
