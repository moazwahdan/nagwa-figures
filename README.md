# Figure Studio

Figure Studio is a drawing app for exam and slide figures. You compose a picture once and get matching **English** and **Arabic** versions of the same figure — labels, digits, and force names flip with the language, while the geometry stays shared.

Work in the browser. Add triangles, polygons, circles, 3D solids, axes, and mechanics bodies (particles, blocks, rods, pulleys, grounds, inclined planes) on the same canvas. Drop constructions on top: points, segments, arcs, force arrows, hinges, walls, and sitting masses. Type figure captions with QMS math. Export PNG or SVG when the figure is ready.

The printable user guide (`docs/Nagwa-Figure-Studio-User-Guide.pdf`) is kept on the drawing machine only — it is not in this GitHub repository.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/`).

```bash
npm run build
npm run preview
```

`npm run build` writes a static `dist/` folder for the company server.

## Drawing

Use **Shapes** to place bodies, **Constructions** to mark and measure them, and the right-hand inspector to edit sizes, labels, and angles.

- Draw a **Line** or **Force** by clicking two points — you do not need a shape selected first.
- **Free poly line** (straight or curved): each click adds a vertex and draws the next side live. Click near the first point to close a polygon. Press **Enter** or **Finish line** to finish (not double-click). A free polyline is one shape: move, rotate, and scale it; the inspector edits vertices, closed/open, dashed, and smooth curve.
- A **segment** drawn on empty canvas is also a free shape. A segment snapped onto another body stays a construction.
- Hold **Shift** while placing a force, a line, a polyline side, or a point-from-a-point to snap to 0°, 45°, 90°, and, on a body sitting on an incline, a guide parallel to the slope.
- Scale without Shift stretches width and height separately; hold Shift for uniform scaling (5% steps).
- Double-click a label to put it back on its default spot.

On axes, **Spacing** is the gap between ticks and **Steps** is the number on each tick (apply to X, Y, Z, or all). The square grid follows those ticks. **Tick labels as** (π, θ, …) can target one axis. 2D curves use the tick values: with π on X and ticks ½, 1, 1½, `sin(x)` peaks at ½π. Arabic curve names are د(س), م(س), ق(س).

## Texts and math

**Texts** on the figure use the same math as Nagwa QMS: wrap TeX in single backticks, for example `` `x^2` ``. Connected words go in `\text{...}`. Arabic alef in math is `\alef` (looped KaTeX_Main form). Write each language by hand; the app does not auto-translate captions.

## Export and open

Export writes PNG, SVG, PDF and JSON for each language. Each image is cropped to its own ink. The SVG carries the project inside it, so **Load** reopens a `.json` or an `.svg` made by this site. Any other file is rejected.

## Shift shortcuts

| Action | Shift |
| --- | --- |
| Place force / line / polyline / point-from-point | Snap 0° / 45° / 90° (and slope-parallel on an incline) |
| Drag a shape | Constrain to one axis |
| Scale from a handle | Uniform scale, 5% steps |
| Rotate | Snap 15° |
| Midpoint mark | Mark only the clicked piece of a split side |

## Export

The top bar **File name** becomes `name_ar.png` / `name_en.png` (or SVG). English and Arabic canvases share geometry.

## License

Private. ISC in `package.json`.
