import { axesBounds, defaultAxes } from './axes';
import { captionSize } from './figureLatex';
import { DEF_BY_ID, defaultParams, type Geometry } from './shapes2d';
import { DEFAULT_SOLID, solidSettings } from './shapes3d';
import { QUESTION_PORTRAIT } from './imageFrames';
import { FONT_PT, STROKE_PT, captionEm, lockedPaperInk, ptToPx } from './paper';
import type { CanvasSize, FigureCaption, Lang, SceneData, ShapeInstance, StyleSettings, Vec } from './types';

const LEGACY_STYLE: StyleSettings = {
  stroke: ptToPx(STROKE_PT),
  fontSize: ptToPx(FONT_PT),
  markSize: 1,
  arcRadius: 1,
  dotRadius: 1,
  fill: 0.66,
  dAsHamza: false,
  italicLetters: true,
  arabicTatweel: false,
  alefForm: 'loop',
};

export const DEFAULT_CANVAS: CanvasSize = { w: QUESTION_PORTRAIT.w, h: QUESTION_PORTRAIT.h };

/** Stroke, dots and arrows are absolute paper sizes. They do not shrink when the canvas changes. */
export const DEFAULT_STYLE: StyleSettings = lockedPaperInk(LEGACY_STYLE);

const LETTERS = 'ABCDEFGHIJKLMNOPQRST';

/** Unicode subscript digits for visual subscripts after the alphabet cycles. */
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/** Convert a number to visual subscript characters (e.g. 12 → ₁₂). */
function toSubscript(n: number): string {
  return String(n).split('').map(d => SUBSCRIPT_DIGITS[+d]).join('');
}

/** Generate a vertex name: A–T for first 20, then A₁, B₁, ... T₁, A₂, B₂... */
export function vertexName(index: number): string {
  const base = LETTERS[index % LETTERS.length];
  const cycle = Math.floor(index / LETTERS.length);
  return cycle === 0 ? base : `${base}${toSubscript(cycle)}`;
}

let counter = 0;
export function uid(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function geometryOf(s: ShapeInstance): Geometry {
  if(s.axes)return {points:axesBounds(s.params,s.axes)};
  if(s.caption){
    const box=captionSize(s.caption.ar,s.caption.en,captionEm());
    const k=1.05,w=Math.max(box.w*k,1.2),h=Math.max(box.h*k,0.7);
    return {points:[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}]};
  }
  if (s.path && s.path.length >= 2) {
    return { points: s.path, open: !s.pathClosed };
  }
  return DEF_BY_ID[s.defId].build(s.params, s.solid ? solidSettings(s.solid) : undefined);
}

export function newShape(defId: string): ShapeInstance {
  const def = DEF_BY_ID[defId];
  const params = defaultParams(def);
  const geo = def.build(params);
  const n = def.kind==='axes'?0:geo.points.length;
  const sideCount = geo.solid?.edges.length ?? (geo.open ? Math.max(0, n - 1) : n);
  const particle = def.id === 'mech-particle' || def.id === 'mech-roller';
  return {
    id: uid(),
    defId,
    params,
    ...(def.kind==='axes'?{axes:defaultAxes(defId==='axes-3d'?3:2)}:{}),
    ...(def.kind === "solid" ? { solid: JSON.parse(JSON.stringify({ ...DEFAULT_SOLID, ...(defId === "solid-sphere" || defId === "solid-cylinder" || defId === "solid-cone" ? { projection: "orthographic", angle: 25 } : {}) })) } : {}),
    offset: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    names: Array.from({ length: n }, (_, i) => vertexName(i)),
    caseMode: 'upper',
    showVertexLabels: n > 2,
    showVertexDots: false,
    showRightMarks: def.kind !== 'mechanics',
    sides: Array.from({ length: sideCount }, () => ({ text: '', unit: true })),
    angles: Array.from({ length: n }, () => ({ show: false, text: '', arc: true })),
    nudge: {},
    center: { show: particle, name: def.id === 'mech-charge' ? '' : 'O' },
    locked: false,
  };
}

export function newFreePathShape(worldPts: Vec[], o: { closed?: boolean; curved?: boolean; dashed?: boolean } = {}): ShapeInstance {
  if (worldPts.length < 2) throw new Error('Click at least two points, then finish.');
  let pts = worldPts.map((p) => ({ x: p.x, y: p.y }));
  let closed = !!o.closed;
  const join = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  if (!closed && pts.length >= 3 && join < 0.4) {
    pts = pts.slice(0, -1);
    closed = true;
  }
  closed = closed && pts.length >= 3;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const path = pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const n = path.length;
  const shape = newShape('free-poly');
  return {
    ...shape,
    params: { n },
    path,
    pathClosed: closed,
    pathCurved: !!o.curved,
    pathDashed: !!o.dashed,
    offset: { x: cx, y: cy },
    names: Array.from({ length: n }, (_, i) => vertexName(i)),
    sides: Array.from({ length: closed ? n : n - 1 }, () => ({ text: '', unit: true })),
    angles: Array.from({ length: n }, () => ({ show: false, text: '', arc: true })),
    showVertexLabels: n > 2,
    showRightMarks: closed,
  };
}

export function resampleFreePath(path: Vec[], n: number, closed: boolean): Vec[] {
  const N = Math.max(2, Math.min(20, Math.round(n)));
  if (closed && N >= 3) {
    const R = path.reduce((s, p) => s + Math.hypot(p.x, p.y), 0) / path.length || 1;
    const start = Math.atan2(path[0]?.y ?? -1, path[0]?.x ?? 0);
    return Array.from({ length: N }, (_, i) => ({
      x: R * Math.cos(start + (2 * Math.PI * i) / N),
      y: R * Math.sin(start + (2 * Math.PI * i) / N),
    }));
  }
  if (path.length < 2 || N === path.length) return path.map((p) => ({ ...p }));
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    seg.push(d);
    total += d;
  }
  if (total < 1e-9) return Array.from({ length: N }, () => ({ ...path[0] }));
  const out = [path[0]];
  for (let k = 1; k < N - 1; k++) {
    let t = (total * k) / (N - 1);
    for (let i = 1; i < path.length; i++) {
      const len = seg[i - 1];
      if (t <= len || i === path.length - 1) {
        const u = len < 1e-12 ? 0 : t / len;
        out.push({ x: path[i - 1].x + (path[i].x - path[i - 1].x) * u, y: path[i - 1].y + (path[i].y - path[i - 1].y) * u });
        break;
      }
      t -= len;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

export function newCaptionShape(caption: FigureCaption): ShapeInstance {
  return {
    ...newShape('figure-text'),
    caption: { ar: caption.ar.slice(0, 4000), en: caption.en.slice(0, 4000) },
    names: [],
    sides: [],
    angles: [],
    showVertexLabels: false,
    showVertexDots: false,
    showRightMarks: false,
    center: { show: false, name: 'O' },
  };
}

/** Keep per-vertex arrays in sync when the vertex count changes (regular n-gon). */
export function syncArrays(s: ShapeInstance): ShapeInstance {
  if(s.axes||s.caption)return s;
  if (s.path && s.params.n !== s.path.length) s = { ...s, params: { ...s.params, n: s.path.length } };
  const geo = geometryOf(s);
  const n = geo.points.length;
  const edges = geo.solid?.edges.length ?? (geo.open ? Math.max(0, n - 1) : n);
  if (s.names.length === n && s.sides.length === edges) return s;
  const fix = <T,>(arr: T[], make: (i: number) => T) => Array.from({ length: n }, (_, i) => arr[i] ?? make(i));
  return {
    ...s,
    names: fix(s.names, (i) => vertexName(i)),
    sides: Array.from({ length: edges }, (_, i) => s.sides[i] ?? { text: '', unit: true }),
    angles: fix(s.angles, () => ({ show: false, text: '', arc: true })),
  };
}

/** Sit a particle or block on a supporting line so its lower midpoint (or the particle’s bottom) is at `at`. */
export function sitOnPoint(shape: ShapeInstance, at: Vec, along: Vec): ShapeInstance {
  const len = Math.hypot(along.x, along.y) || 1;
  let ux = along.x / len, uy = along.y / len;
  let nx = -uy, ny = ux;
  if (ny < 0) { ux = -ux; uy = -uy; nx = -nx; ny = -ny; }
  const rotation = Math.atan2(uy, ux) * 180 / Math.PI;
  const geo = geometryOf(shape);
  const foot = geo.circle
    ? { x: geo.circle.cx ?? 0, y: (geo.circle.cy ?? 0) - geo.circle.r }
    : (() => {
      const xs = geo.points.map(p => p.x), ys = geo.points.map(p => p.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) };
    })();
  const t = (rotation * Math.PI) / 180, sx = foot.x * scaleXOf(shape), sy = foot.y * scaleYOf(shape);
  return { ...shape, rotation, offset: { x: at.x - (sx * Math.cos(t) - sy * Math.sin(t)), y: at.y - (sx * Math.sin(t) + sy * Math.cos(t)) }, sit: { at, along } };
}

export function applySit(s: ShapeInstance): ShapeInstance {
  return s.sit ? sitOnPoint(s, s.sit.at, s.sit.along) : s;
}

/** Keep contact when resizing a sitting body; drop sit when the body is moved or rotated by hand. */
export function mergeShapePatch(s: ShapeInstance, patch: Partial<ShapeInstance>): ShapeInstance {
  const next = { ...s, ...patch };
  const resized = patch.scale !== undefined || patch.scaleX !== undefined || patch.scaleY !== undefined || patch.params !== undefined;
  const moved = patch.offset !== undefined || patch.rotation !== undefined;
  if (moved && !resized) return { ...next, sit: undefined };
  if (next.sit && resized) return sitOnPoint(next, next.sit.at, next.sit.along);
  return next;
}

export function scaleXOf(s: ShapeInstance): number {
  return s.scale * (s.scaleX ?? 1);
}
export function scaleYOf(s: ShapeInstance): number {
  return s.scale * (s.scaleY ?? 1);
}

export function toUnits(s: ShapeInstance, p: Vec): Vec {
  const x = p.x * (s.flipX ? -1 : 1) * scaleXOf(s);
  const y = p.y * (s.flipY ? -1 : 1) * scaleYOf(s);
  const t = (s.rotation * Math.PI) / 180;
  return {
    x: x * Math.cos(t) - y * Math.sin(t) + s.offset.x,
    y: x * Math.sin(t) + y * Math.cos(t) + s.offset.y,
  };
}

/** Inverse of toUnits: scene units -> the shape's local coordinates. */
export function fromUnits(s: ShapeInstance, u: Vec): Vec {
  const t = (-s.rotation * Math.PI) / 180;
  const dx = u.x - s.offset.x;
  const dy = u.y - s.offset.y;
  const x = (dx * Math.cos(t) - dy * Math.sin(t)) / scaleXOf(s);
  const y = (dx * Math.sin(t) + dy * Math.cos(t)) / scaleYOf(s);
  return { x: x * (s.flipX ? -1 : 1), y: y * (s.flipY ? -1 : 1) };
}

export interface Bounds {
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
}

export function boundsUnits(s: ShapeInstance): Bounds {
  const geo = geometryOf(s);
  const extras: Vec[] = [];
  if (geo.circle) {
    const c = { x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }, r = geo.circle.r;
    extras.push({ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }, { x: c.x, y: c.y - r }, { x: c.x, y: c.y + r });
  }
  for (const extra of geo.circles ?? []) extras.push({ x: extra.cx - extra.r, y: extra.cy }, { x: extra.cx + extra.r, y: extra.cy }, { x: extra.cx, y: extra.cy - extra.r }, { x: extra.cx, y: extra.cy + extra.r });
  for (const stroke of geo.strokes ?? []) extras.push(...stroke.pts);
  const local = [...(geo.solid?.bounds ?? geo.points), ...extras];
  if (!local.length) {
    const r = 0.5 * Math.max(scaleXOf(s), scaleYOf(s));
    return { minx: s.offset.x - r, maxx: s.offset.x + r, miny: s.offset.y - r, maxy: s.offset.y + r };
  }
  const pts = local.map((p) => toUnits(s, p));
  return {
    minx: Math.min(...pts.map((p) => p.x)),
    maxx: Math.max(...pts.map((p) => p.x)),
    miny: Math.min(...pts.map((p) => p.y)),
    maxy: Math.max(...pts.map((p) => p.y)),
  };
}

export function unionBounds(list: Bounds[]): Bounds {
  return {
    minx: Math.min(...list.map((b) => b.minx)),
    maxx: Math.max(...list.map((b) => b.maxx)),
    miny: Math.min(...list.map((b) => b.miny)),
    maxy: Math.max(...list.map((b) => b.maxy)),
  };
}

/** Stack a new shape on the centre of the existing ones. Their offsets stay put. */
export function placeOnTop(existing: ShapeInstance[], s: ShapeInstance): ShapeInstance {
  if (existing.length === 0) return s;
  const group = unionBounds(existing.map(boundsUnits));
  const mine = boundsUnits(s);
  const dx = (group.minx + group.maxx) / 2 - (mine.minx + mine.maxx) / 2;
  const dy = (group.miny + group.maxy) / 2 - (mine.miny + mine.maxy) / 2;
  return { ...s, offset: { x: s.offset.x + dx, y: s.offset.y + dy } };
}

/** Sit a note under the drawing. World Y is up, so page-below is toward miny (the previous maxy offset painted above). */
export function placeBelow(existing: ShapeInstance[], s: ShapeInstance): ShapeInstance {
  if (existing.length === 0) return s;
  const group = unionBounds(existing.map(boundsUnits));
  const mine = boundsUnits(s);
  const dx = (group.minx + group.maxx) / 2 - (mine.minx + mine.maxx) / 2;
  const dy = group.miny - 0.55 - mine.maxy;
  return { ...s, offset: { x: s.offset.x + dx, y: s.offset.y + dy } };
}

export interface Placed {
  /** Vertices in image pixels (y down). */
  pts: Vec[];
  center: Vec;
  circle?: { c: Vec; r: number };
  geo: Geometry;
  boundsPts?: Vec[];
}

export function placeShape(s: ShapeInstance, G: number, canvas: CanvasSize): Placed {
  const geo = geometryOf(s);
  const map = (p: Vec): Vec => {
    const u = toUnits(s, p);
    return { x: canvas.w / 2 + u.x * G, y: canvas.h / 2 - u.y * G };
  };
  const center = map({ x: 0, y: 0 });
  const circle = geo.circle ? { c: map({ x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }), r: geo.circle.r * Math.max(scaleXOf(s), scaleYOf(s)) * G } : undefined;
  const extra = [
    ...(geo.solid?.bounds ?? []),
    ...(geo.strokes ?? []).flatMap(stroke => stroke.pts),
    ...(geo.circles ?? []).flatMap(c => [{ x: c.cx - c.r, y: c.cy }, { x: c.cx + c.r, y: c.cy }, { x: c.cx, y: c.cy - c.r }, { x: c.cx, y: c.cy + c.r }]),
  ].map(map);
  return { pts: geo.points.map(map), center, circle, geo, ...(extra.length || geo.solid ? { boundsPts: extra.length ? extra : geo.solid!.bounds.map(map) } : {}) };
}

/** Scene as drawn in one language: every shape sits at its shared offset plus that language's own shift. */
export function dataForLang(data: SceneData, lang: Lang): SceneData {
  if (!data.shapes.some((s) => s.langShift?.[lang])) return data;
  return { ...data, shapes: data.shapes.map((s) => { const k = s.langShift?.[lang]; return k ? { ...s, offset: { x: s.offset.x + k.x, y: s.offset.y + k.y }, langShift: undefined } : s; }) };
}

/** One shape as drawn in one language (for hit-testing and handles). */
export function shapeForLang(s: ShapeInstance, lang: Lang): ShapeInstance {
  const k = s.langShift?.[lang];
  return k ? { ...s, offset: { x: s.offset.x + k.x, y: s.offset.y + k.y }, langShift: undefined } : s;
}
