import { useStore } from './store';
import { DEF_BY_ID, SHAPE_DEFS, defaultParams, type ShapeDef } from './shapes2d';
import { TOOLS, TOOL_BY_ID, DEFAULT_OPTS, type ToolOpts } from './tools';
import { geometryOf } from './scene';
import { fitScene } from './world';
import { buildSvg, figureFiles, svgToPng } from './exportImage';
import { cropScene } from './crop';
import { loadProjectText, projectText } from './project';
import type { ConLine, ConMark, ConPoint, Lang, Ref, SceneData } from './types';
import type { Target } from './tools';

/**
 * `window.nagwa` — a small, documented control surface for AI agents and scripts.
 * Everything here goes through the same store and tools as the buttons, so behaviour is identical;
 * nothing is sent anywhere. Errors are thrown as `Error("nagwa: ...")` with a hint on how to fix the call.
 * Start with `nagwa.help()` then `nagwa.describe()`.
 */

const fail = (msg: string): never => { throw new Error(`nagwa: ${msg}`); };
const g = () => useStore.getState();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const scene = (): SceneData => { const s = g(); return { canvas: s.canvas, shapes: s.shapes, points: s.points, lines: s.lines, marks: s.marks, style: s.style, viewScale: s.viewScale }; };

function defOf(id: string): ShapeDef {
  return DEF_BY_ID[id] ?? fail(`unknown shape "${id}". Valid ids: ${SHAPE_DEFS.filter((d) => !d.hidden).map((d) => d.id).join(', ')}.`);
}

/** Merge and validate numeric params against the shape's declared ranges and options. */
function checkParams(def: ShapeDef, given: Record<string, number> = {}, base?: Record<string, number>): Record<string, number> {
  const out = { ...(base ?? defaultParams(def)) };
  for (const [k, v] of Object.entries(given)) {
    const p = def.params.find((x) => x.key === k) ?? fail(`"${def.id}" has no param "${k}". Params: ${def.params.map((x) => x.key).join(', ')}.`);
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`param "${k}" must be a finite number.`);
    if (p.options) { if (!p.options.some((o) => o.value === v)) fail(`param "${k}" must be one of ${p.options.map((o) => `${o.value} (${o.label})`).join(', ')}.`); }
    else if (v < p.min || v > p.max) fail(`param "${k}" must be between ${p.min} and ${p.max}.`);
    out[k] = v;
  }
  return out;
}

const brief = (s: SceneData['shapes'][number]) => {
  const geo = geometryOf(s);
  return { id: s.id, def: s.defId, params: s.params, vertices: geo.points.map((_, i) => ({ i, name: s.names[i] })), open: !!geo.open, rotation: s.rotation, offset: s.offset, scale: s.scale, ...(geo.error ? { error: geo.error } : {}) };
};

/** Friendly target -> internal target. Accepts `{shape, vertex}`, `{shape, side, k?}`, `{point}`, `{x, y}` or an internal target. */
type PickSpec = { shape?: string; vertex?: number; side?: number; k?: number; point?: string; x?: number; y?: number; kind?: string };
function toTarget(p: PickSpec): Target {
  if (p.kind) return p as unknown as Target;
  if (p.point !== undefined) {
    if (!g().points.some((q) => q.id === p.point)) fail(`no point with id "${p.point}". Existing: ${g().points.map((q) => q.id).join(', ') || '(none)'}.`);
    return { kind: 'point', ref: { p: p.point } } as Target;
  }
  if (p.shape !== undefined) {
    const s = g().shapes.find((x) => x.id === p.shape) ?? fail(`no shape with id "${p.shape}". Existing: ${g().shapes.map((x) => x.id).join(', ') || '(none)'}.`);
    const geo = geometryOf(s), n = geo.points.length;
    if (p.vertex !== undefined) {
      if (!Number.isInteger(p.vertex) || p.vertex < 0 || p.vertex >= n) fail(`vertex must be an integer 0..${n - 1} for ${s.defId}.`);
      return { kind: 'point', ref: { s: s.id, i: p.vertex } } as Target;
    }
    if (p.side !== undefined) {
      const sides = geo.open ? n - 1 : n;
      if (!Number.isInteger(p.side) || p.side < 0 || p.side >= sides) fail(`side must be an integer 0..${sides - 1} for ${s.defId} (side i joins vertex i and i+1).`);
      return { kind: 'line', a: { s: s.id, i: p.side }, b: { s: s.id, i: (p.side + 1) % n }, k: p.k ?? 0.5 } as Target;
    }
  }
  if (typeof p.x === 'number' && typeof p.y === 'number') return { kind: 'world', x: p.x, y: p.y } as Target;
  return fail('a pick must be {shape, vertex}, {shape, side, k?}, {point}, or {x, y}.');
}

const ids = (a: { id: string }[]) => new Set(a.map((x) => x.id));
const added = <T extends { id: string }>(before: Set<string>, now: T[]) => now.filter((x) => !before.has(x.id)).map((x) => x.id);

export interface BuildSpec {
  canvas?: { w: number; h: number };
  /** Shapes from the catalogue (see describe()). Referenced by index in `lines`/`angles`/`rights`. */
  shapes?: { def: string; params?: Record<string, number>; rotation?: number; offset?: { x: number; y: number }; scale?: number }[];
  /** Free named points in scene units (y up). */
  points?: { id: string; x: number; y: number; name?: string; nameAr?: string; dot?: boolean; circled?: boolean; color?: string }[];
  /** a/b: a spec point id, or `{shape: index, vertex: i}`. */
  lines?: { a: PointRef; b: PointRef; dashed?: boolean; arrow?: ConLine['arrow']; force?: boolean; color?: string; symbol?: string; vec?: boolean; heads?: 1 | 2; caps?: boolean; text?: string }[];
  angles?: { at: PointRef; a: PointRef; b: PointRef; text?: string; color?: string; fill?: boolean; size?: number }[];
  rights?: [PointRef, PointRef, PointRef][];
}
type PointRef = string | { shape: number; vertex: number };

async function build(spec: BuildSpec) {
  if (!spec || typeof spec !== 'object') fail('build() needs a spec object. See help().');
  g().clearAll(); await sleep(50);
  if (spec.canvas) {
    const { w, h } = spec.canvas;
    if (!(w >= 50 && h >= 50 && w <= 4000 && h <= 4000)) fail('canvas w and h must be between 50 and 4000.');
    g().setCanvas(spec.canvas);
  }
  const made: string[] = [];
  for (const [i, sh] of (spec.shapes ?? []).entries()) {
    const def = defOf(sh.def);
    const params = checkParams(def, sh.params);
    g().addShape(sh.def, params);
    const s = g().shapes[g().shapes.length - 1];
    made.push(s.id);
    const patch: Record<string, unknown> = {};
    if (sh.rotation !== undefined) patch.rotation = sh.rotation;
    if (sh.offset) patch.offset = sh.offset;
    if (sh.scale !== undefined) { if (!(sh.scale > 0)) fail(`shapes[${i}].scale must be > 0.`); patch.scale = sh.scale; }
    if (Object.keys(patch).length) g().patchShape(s.id, patch);
  }
  const ptIds = new Set((spec.points ?? []).map((p) => p.id));
  const ref = (r: PointRef): Ref => {
    if (typeof r === 'string') { if (!ptIds.has(r)) fail(`unknown point id "${r}" (declare it in points).`); return { p: r }; }
    const id = made[r.shape] ?? fail(`shape index ${r.shape} does not exist.`);
    return { s: id, i: r.vertex };
  };
  const points = (spec.points ?? []).map((p) => ({ id: p.id, name: p.name || '', showLabel: !!p.name, dot: !!p.dot, circled: p.circled, color: p.color, nameAr: p.nameAr, def: { t: 'world', x: p.x, y: p.y } })) as unknown as ConPoint[];
  const lines = (spec.lines ?? []).map((l, i) => ({ id: 'l' + i, a: ref(l.a), b: ref(l.b), dashed: !!l.dashed, arrow: l.arrow || 'none', kind: l.force ? 'force' : undefined, vec: l.vec, heads: l.heads, caps: l.caps, color: l.color, symbol: l.symbol, label: { text: l.text || '', unit: false } })) as unknown as ConLine[];
  const marks = [
    ...(spec.angles ?? []).map((a, i) => ({ id: 'm' + i, kind: 'angle', at: ref(a.at), a: ref(a.a), b: ref(a.b), text: a.text || '', color: a.color, fill: a.fill, size: a.size })),
    ...(spec.rights ?? []).map((r, i) => ({ id: 'r' + i, kind: 'right', at: ref(r[0]), a: ref(r[1]), b: ref(r[2]) })),
  ] as unknown as ConMark[];
  useStore.setState({ points: [...g().points, ...points], lines: [...g().lines, ...lines], marks: [...g().marks, ...marks], selectedId: null });
  const s = scene();
  useStore.setState(fitScene(s));
  await sleep(50); g().fit(); await frame(); g().select(null);
  return state();
}

function state() {
  const s = g();
  return {
    canvas: s.canvas, viewScale: s.viewScale,
    shapes: s.shapes.map(brief),
    points: s.points.map((p) => ({ id: p.id, name: p.name })),
    lines: s.lines.map((l) => ({ id: l.id, a: l.a, b: l.b, kind: l.kind ?? 'line' })),
    marks: s.marks.map((m) => ({ id: m.id, kind: m.kind })),
    tool: s.tool, notice: s.notice ? { kind: s.notice.kind, text: s.notice.text } : null,
    canUndo: s.past.length > 0, canRedo: s.future.length > 0,
  };
}

function describe() {
  return {
    shapes: SHAPE_DEFS.filter((d) => !d.hidden).map((d) => ({
      id: d.id, label: d.label, group: d.group, tip: d.tip,
      params: d.params.map((p) => ({ key: p.key, label: p.label, def: p.def, min: p.min, max: p.max, ...(p.options ? { options: p.options } : {}) })),
    })),
    tools: TOOLS.map((t) => ({ id: t.id, label: t.label, group: t.group, tip: t.tip, steps: t.steps, prompts: t.prompts, openEnded: !!t.openEnded })),
    toolOptions: g().toolOpts,
    rules: [
      'Line weight is fixed at 0.797 pt; do not try to change it.',
      'Everything drawn must stay inside the image: call check() after building and fix anything it reports.',
      'Points and lines are in scene units, y up. Each figure is exported in Arabic and English.',
    ],
  };
}

async function runTool(toolId: string, picks: PickSpec[] = [], opts: Partial<ToolOpts> = {}) {
  const tool = TOOL_BY_ID[toolId] ?? fail(`unknown tool "${toolId}". Valid ids: ${TOOLS.map((t) => t.id).join(', ')}.`);
  if (!tool.openEnded && picks.length !== tool.steps.length) fail(`tool "${toolId}" needs ${tool.steps.length} pick(s): ${tool.steps.join(', ')} — ${tool.prompts.join(' / ')}`);
  for (const k of Object.keys(opts)) if (!(k in DEFAULT_OPTS)) fail(`unknown option "${k}". Options: ${Object.keys(DEFAULT_OPTS).join(', ')}.`);
  const targets = picks.map(toTarget);
  const before = { p: ids(g().points), l: ids(g().lines), m: ids(g().marks), s: ids(g().shapes) };
  const prevOpts = Object.fromEntries(Object.keys(opts).map((k) => [k, g().toolOpts[k as keyof ToolOpts]])) as Partial<ToolOpts>;
  g().setToolOpts(opts);
  g().setTool(toolId);
  g().clearNotice();
  for (const t of targets) g().pickTarget(t);
  if (tool.openEnded) g().finishOpenTool();
  const n = g().notice;
  g().setToolOpts(prevOpts); // one-off options must not leak into the next manual tool use
  if (n?.kind === 'error') { g().setTool(null); fail(n.text); }
  return {
    ok: true, info: n?.text ?? '',
    added: { points: added(before.p, g().points), lines: added(before.l, g().lines), marks: added(before.m, g().marks), shapes: added(before.s, g().shapes) },
  };
}

/** Renders each language exactly as it would be exported and looks for ink touching the image border (= clipped). */
async function check() {
  const issues: string[] = [];
  for (const s of g().shapes) { const e = geometryOf(s).error; if (e) issues.push(`shape ${s.id} (${s.defId}): ${e}`); }
  const s = g();
  if (!s.shapes.length && !s.points.length && !s.lines.length && !s.marks.length) return { ok: true, issues };
  for (const lang of ['ar', 'en'] as Lang[]) {
    try {
      const cropped = cropScene(scene(), lang).scene;
      const png = await svgToPng(await buildSvg(cropped, lang), cropped.canvas.w, cropped.canvas.h, 2);
      const img = new Image(); const url = URL.createObjectURL(png); img.src = url; await img.decode(); URL.revokeObjectURL(url);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
      const ink = (x: number, y: number) => { const i = (y * W + x) * 4; return d[i + 3] > 40 && (d[i] + d[i + 1] + d[i + 2]) / 3 < 200; };
      const sides: string[] = [];
      for (let x = 0; x < W && !sides.includes('top'); x++) if (ink(x, 0)) sides.push('top');
      for (let x = 0; x < W && !sides.includes('bottom'); x++) if (ink(x, H - 1)) sides.push('bottom');
      for (let y = 0; y < H && !sides.includes('left'); y++) if (ink(0, y)) sides.push('left');
      for (let y = 0; y < H && !sides.includes('right'); y++) if (ink(W - 1, y)) sides.push('right');
      if (sides.length) issues.push(`${lang}: drawing touches the ${sides.join(', ')} edge of the image (clipped) — call fit() or enlarge the canvas.`);
    } catch (e) { issues.push(`${lang}: could not render (${(e as Error).message}).`); }
  }
  return { ok: issues.length === 0, issues };
}

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const MIME: Record<string, string> = { png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf' };

/** Returns the figure files as data (no download dialog): `{ "<name>_ar.png": { mime, bytes, base64 | text } , ... }`. */
async function exportFiles(o: { lang?: Lang | 'both'; formats?: ('png' | 'svg' | 'pdf')[]; ratio?: number; name?: string } = {}) {
  const langs: Lang[] = o.lang === 'ar' ? ['ar'] : o.lang === 'en' ? ['en'] : ['ar', 'en'];
  const formats = o.formats ?? ['png', 'svg', 'pdf'];
  const ratio = o.ratio ?? 2;
  if (!(ratio >= 1 && ratio <= 8)) fail('ratio must be between 1 and 8.');
  const name = (o.name || g().fileName || 'figure').trim() || 'figure';
  const s = g();
  if (!s.shapes.length && !s.points.length && !s.lines.length && !s.marks.length) fail('the drawing is empty.');
  const out: Record<string, { mime: string; bytes: number; base64?: string; text?: string }> = {};
  for (const lang of langs) {
    const files = await figureFiles(scene(), lang, name, ratio);
    for (const [fname, data] of Object.entries(files)) {
      const ext = fname.split('.').pop()!;
      if (!formats.includes(ext as 'png')) continue;
      out[fname] = ext === 'svg' ? { mime: MIME[ext], bytes: data.length, text: new TextDecoder().decode(data) } : { mime: MIME[ext], bytes: data.length, base64: b64(data) };
    }
  }
  return out;
}

const HELP = `window.nagwa — control Figure Studio from code. All functions are async-safe; errors are thrown with a hint.
  nagwa.describe()                    -> catalogue: shapes (with param ranges), tools (with steps), tool options, rules
  nagwa.state()                       -> what is on the canvas now (shape ids, vertices, points, lines, marks)
  nagwa.build(spec)                   -> clear and build a whole figure in one call, then fit. spec = { canvas?, shapes?, points?, lines?, angles?, rights? }
  nagwa.addShape(def, params?)        -> add one shape, returns its info (id, vertices)
  nagwa.setParams(shapeId, params)    -> change a shape's params (validated)
  nagwa.runTool(toolId, picks, opts?) -> run a construction tool. picks: {shape, vertex} | {shape, side, k?} | {point} | {x, y}
  nagwa.check()                       -> { ok, issues }: anything clipped or invalid. Fix and re-check until ok.
  nagwa.export({lang?, formats?, ratio?, name?}) -> files as data (png/pdf base64, svg text), no download dialog
  nagwa.projectText() / nagwa.loadProject(text) -> save/load the project JSON
  nagwa.clear() undo() redo() fit() select(id|null)
Example: await nagwa.build({ shapes:[{def:'mech-planes', params:{count:2,t1:0,l1:6,t2:1,l2:7,a2:30}}], rights:[] }); await nagwa.runTool('attach-block',[{shape:'<id from state()>', side:1}]); (await nagwa.check()).ok`;

export function installAgentApi() {
  const api = {
    version: 1,
    help: () => HELP,
    describe,
    state,
    build,
    addShape: (def: string, params?: Record<string, number>) => {
      const d = defOf(def);
      g().addShape(def, checkParams(d, params));
      return brief(g().shapes[g().shapes.length - 1]);
    },
    setParams: (shapeId: string, params: Record<string, number>) => {
      const s = g().shapes.find((x) => x.id === shapeId) ?? fail(`no shape with id "${shapeId}".`);
      try { g().patchShape(shapeId, { params: checkParams(defOf(s.defId), params, s.params) }); }
      catch (e) { fail((e as Error).message.replace(/^nagwa: /, '')); }
      return brief(g().shapes.find((x) => x.id === shapeId)!);
    },
    runTool,
    check,
    export: exportFiles,
    projectText: () => projectText(),
    loadProject: (text: string) => { try { loadProjectText(text); } catch (e) { fail(`could not load the project: ${(e as Error).message}`); } return state(); },
    clear: () => { g().clearAll(); return state(); },
    undo: () => { g().undo(); return state(); },
    redo: () => { g().redo(); return state(); },
    fit: () => { g().fit(); return state(); },
    select: (id: string | null) => { g().select(id); },
  };
  (window as unknown as { nagwa: unknown }).nagwa = Object.freeze(api);
}
