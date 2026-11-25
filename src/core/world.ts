import { boundsUnits, geometryOf, toUnits, unionBounds } from './scene';
import { circleCircle, lineCircleAt } from './intersections';
import type { ConPoint, PointDef, Ref, SceneData, ShapeInstance, Vec } from './types';
import { projector, solidSettings } from './shapes3d';
import { add3, sub3, mul3, unit3, length3, foot3, direction3, perpendicular3, solidHits, circularPoint } from './spatial';

/* ---------- small vector helpers (scene units, y up) ---------- */
export const vadd = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const vmul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const vlen = (a: Vec) => Math.hypot(a.x, a.y);
export const vdot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const vcross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const vunit = (a: Vec): Vec => {
  const l = vlen(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const vrot90 = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

export const refEq = (a: Ref, b: Ref) => JSON.stringify(a) === JSON.stringify(b);
export const refKey = (r: Ref) => JSON.stringify(r);

export interface World {
  data: SceneData;
  pt: Map<string, Vec | null>;
  /** Scale used for tolerances: size of the drawing in scene units. */
  size: number;
  ref: (r: Ref) => Vec | null;
}

function shapeOf(data: SceneData, id: string): ShapeInstance | undefined {
  return data.shapes.find((s) => s.id === id);
}

/** Boundary hits of a ray from `o` along unit direction `d` with a shape, sorted by distance (t > eps). */
export function boundaryHits(data: SceneData, shapeId: string, o: Vec, d: Vec, eps: number): { t: number; p: Vec }[] {
  const s = shapeOf(data, shapeId);
  if (!s) return [];
  const geo = geometryOf(s);
  const hits: { t: number; p: Vec }[] = [];
  if (geo.circle) {
    const r = geo.circle.r * s.scale;
    const centre = toUnits(s, { x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 });
    const f = vsub(o, centre);
    const b = vdot(f, d);
    const c = vdot(f, f) - r * r;
    const disc = b * b - c;
    if (disc >= 0) {
      for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) if (t > eps) hits.push({ t, p: vadd(o, vmul(d, t)) });
    }
  }
  const pts = geo.points.map((p) => toUnits(s, p));
  const n = pts.length;
  const last = geo.open || n < 3 ? n - 1 : n;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const e = vsub(pts[(i + 1) % n], a);
    const den = vcross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const w = vsub(a, o);
    const t = vcross(w, e) / den;
    const u = vcross(w, d) / den;
    if (t > eps && u >= -1e-9 && u <= 1 + 1e-9) hits.push({ t, p: vadd(o, vmul(d, t)) });
  }
  return hits.sort((x, y) => x.t - y.t);
}

export function resolveDef(world: World, def: PointDef): Vec | null {
  const { data, ref, size } = world;
  const owner=ownerOfDef(data,def),shape=data.shapes.find(s=>s.id===owner);
  if((shape?.axes||shape?.chart))return null;
  if(shape?.solid){
    const p=spatialDef(data,def);
    return p?toUnits(shape,projector(solidSettings(shape.solid)).project(p.position)):null;
  }
  const eps = size * 1e-6;
  switch (def.t) {
    case 'world':
      return { x: def.x, y: def.y };
    case 'local': {
      const s = shapeOf(data, def.shape);
      return s ? toUnits(s, { x: def.x, y: def.y }) : null;
    }
    case 'ratio': {
      const a = ref(def.a);
      const b = ref(def.b);
      return a && b ? vadd(a, vmul(vsub(b, a), def.k)) : null;
    }
    case 'offset': {
      const f = ref(def.from);
      return f ? vadd(f, { x: def.dist * Math.cos(rad(def.angle)), y: def.dist * Math.sin(rad(def.angle)) }) : null;
    }
    case 'rayHit': {
      const f = ref(def.from);
      if (!f) return null;
      const h = boundaryHits(data, def.shape, f, { x: Math.cos(rad(def.angle)), y: Math.sin(rad(def.angle)) }, eps)[0];
      return h ? h.p : null;
    }
    case 'bisectHit': {
      const v = ref(def.v);
      const a = ref(def.a);
      const b = ref(def.b);
      if (!v || !a || !b) return null;
      const bis = vunit(vadd(vunit(vsub(a, v)), vunit(vsub(b, v))));
      if (vlen(bis) < 1e-9) return null;
      const h = boundaryHits(data, def.shape, v, bis, eps)[0];
      return h ? h.p : null;
    }
    case 'dirHit': {
      const f = ref(def.from);
      const a = ref(def.a);
      const b = ref(def.b);
      if (!f || !a || !b) return null;
      let d = vunit(vsub(b, a));
      if (def.mode === 'perp') d = vrot90(d);
      const h = boundaryHits(data, def.shape, f, vmul(d, def.sign), eps)[0];
      return h ? h.p : null;
    }
    case 'foot': {
      const f = ref(def.from);
      const a = ref(def.a);
      const b = ref(def.b);
      if (!f || !a || !b) return null;
      const ab = vsub(b, a);
      const l2 = vdot(ab, ab);
      if (l2 < 1e-18) return null;
      return vadd(a, vmul(ab, vdot(vsub(f, a), ab) / l2));
    }
    case 'cross': {
      const a = ref(def.a), b = ref(def.b), c = ref(def.c), d = ref(def.d);
      if (!a || !b || !c || !d) return null;
      const r = vsub(b, a), s = vsub(d, c), den = vcross(r, s);
      if (Math.abs(den) < 1e-12 * Math.max(1e-12, vlen(r) * vlen(s))) return null;
      return vadd(a, vmul(r, vcross(vsub(c, a), s) / den));
    }
    case 'lineCircle': {
      const a = ref(def.a), b = ref(def.b), s = shapeOf(data, def.shape);
      const geo = s ? geometryOf(s) : null;
      if (!a || !b || !s || !geo?.circle || (def.which !== 0 && def.which !== 1)) return null;
      return lineCircleAt(a, b, toUnits(s, { x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }), geo.circle.r * s.scale, def.which);
    }
    case 'circs': {
      const a = shapeOf(data, def.shape), b = shapeOf(data, def.other);
      const ca = a ? shapeCircle(a) : null, cb = b ? shapeCircle(b) : null;
      if (!ca || !cb || (def.which !== 0 && def.which !== 1)) return null;
      return circleCircle(ca.c, ca.r, cb.c, cb.r)[def.which] ?? null;
    }
    case 'perpAt': {
      const at = ref(def.at);
      const to = ref(def.toward);
      if (!at || !to) return null;
      return vadd(at, vmul(vrot90(vunit(vsub(to, at))), def.dist));
    }
    case 'circ': {
      const s = shapeOf(data, def.shape);
      if (!s) return null;
      const geo = geometryOf(s);
      if (!geo.circle) return null;
      const r = geo.circle.r;
      const a = rad(def.angle);
      return toUnits(s, { x: (geo.circle.cx ?? 0) + r * Math.cos(a), y: (geo.circle.cy ?? 0) + r * Math.sin(a) });
    }
  }
}

/** Circle in scene units, using the same radius as line–circle intersections. */
export function shapeCircle(s: ShapeInstance): { c: Vec; r: number } | null {
  const geo = geometryOf(s);
  if (!geo.circle || !(geo.circle.r > 0)) return null;
  return { c: toUnits(s, { x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }), r: geo.circle.r * s.scale };
}

export function sceneSize(data: SceneData): number {
  if (!data.shapes.length) return 1;
  const b = unionBounds(data.shapes.map(boundsUnits));
  return Math.max(b.maxx - b.minx, b.maxy - b.miny, 1e-6);
}

export function buildWorld(data: SceneData): World {
  const pt = new Map<string, Vec | null>();
  const world: World = {
    data,
    pt,
    size: sceneSize(data),
    ref: (r) => {
      if ('s' in r) {
        const s = shapeOf(data, r.s);
        if (!s || (s.axes||s.chart)) return null;
        const geo = geometryOf(s);
        const p = geo.points[r.i];
        return p ? toUnits(s, p) : null;
      }
      if ('c' in r) {
        const s = shapeOf(data, r.c);
        if (!s || (s.axes||s.chart)) return null;
        const geo = geometryOf(s);
        return geo.solid ? toUnits(s, geo.solid.center) : geo.circle ? toUnits(s, { x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }) : null;
      }
      return pt.get(r.p) ?? null;
    },
  };
  for (const p of data.points) pt.set(p.id, resolveDef(world, p.def));
  return world;
}

/** Remove everything that can no longer be resolved (after deleting a shape or point). */
export function pruneUnresolved(data: SceneData): SceneData {
  let cur = data;
  for (let guard = 0; guard < 50; guard++) {
    const w = buildWorld(cur);
    const points = cur.points.filter((p) => w.pt.get(p.id));
    const ok = (r: Ref) => (w.ref(r) ? true : false);
    const lines = cur.lines.filter((l) => ok(l.a) && ok(l.b) && !(l.via??[]).some(r=>!ok(r)));
    const marks = cur.marks.filter((m) => {
      if ('circle' in m) return cur.shapes.some((s) => s.id === m.circle);
      if (m.kind === 'right' || m.kind === 'angle' || m.kind === 'attachment') return ok(m.at) && ok(m.a) && ok(m.b);
      return ok(m.a) && ok(m.b);
    });
    const same = points.length === cur.points.length && lines.length === cur.lines.length && marks.length === cur.marks.length;
    cur = { ...cur, points, lines, marks };
    if (same) break;
  }
  return cur;
}

/** The shape that "owns" a point/ref (used for locking). */
export function ownerOfRef(data: SceneData, r: Ref, depth = 0): string | undefined {
  if ('s' in r) return r.s;
  if ('c' in r) return r.c;
  if (depth > 20) return undefined;
  const p = data.points.find((q) => q.id === r.p);
  return p ? ownerOfDef(data, p.def, depth + 1) : undefined;
}
/**
 * Construction points store some lengths in scene units (`offset`, `perpAt`).
 * A uniform change of the owning shape's scale has to multiply those lengths
 * by the same factor, or the external pieces stay put while the shape grows
 * and the figure stops being similar.
 */
export function scaleOwnedDistances(data: SceneData, shapeId: string, k: number): ConPoint[] {
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-12) return data.points;
  return data.points.map((p) => {
    if (ownerOfDef(data, p.def) !== shapeId) return p;
    if (p.def.t !== 'offset' && p.def.t !== 'perpAt') return p;
    return { ...p, def: { ...p.def, dist: p.def.dist * k } };
  });
}

/** Scene-frame angles on an owned construction rotate with the shape, so the group stays one piece. */
export function rotateOwnedAngles(data: SceneData, shapeId: string, delta: number): ConPoint[] {
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) return data.points;
  return data.points.map((p) => {
    if (ownerOfDef(data, p.def) !== shapeId) return p;
    if (p.def.t !== 'offset' && p.def.t !== 'rayHit') return p;
    return { ...p, def: { ...p.def, angle: p.def.angle + delta } };
  });
}

/** Points that travel with a shape when its scale or rotation changes. */
export function followShape(data: SceneData, shapeId: string, prev: { scale: number; rotation: number } | undefined, patch: { scale?: number; rotation?: number }): ConPoint[] {
  const scaleK = prev && patch.scale !== undefined && prev.scale > 0 ? patch.scale / prev.scale : 1;
  const dRot = prev && patch.rotation !== undefined ? patch.rotation - prev.rotation : 0;
  const scaled = scaleOwnedDistances(data, shapeId, scaleK);
  return rotateOwnedAngles({ ...data, points: scaled }, shapeId, dRot);
}

/** Construction points that belong with this shape, in image pixels. Other shapes' points are left out. */
export function groupExtraPx(data: SceneData, shapeId: string): Vec[] {
  const w = buildWorld(data);
  const owned = (r: Ref) => ownerOfRef(data, r) === shapeId;
  const out: Vec[] = [];
  const seen = new Set<string>();
  const add = (r: Ref) => {
    const key = JSON.stringify(r);
    if (seen.has(key)) return;
    const owner = ownerOfRef(data, r);
    if (owner && owner !== shapeId) return;
    const u = w.ref(r);
    if (!u) return;
    seen.add(key);
    out.push(toPx(data, u));
  };
  for (const p of data.points) if (ownerOfDef(data, p.def) === shapeId) add({ p: p.id });
  for (const l of data.lines) {
    if (!owned(l.a) && !owned(l.b)) continue;
    for (const r of [l.a, l.b, ...(l.via ?? [])]) add(r);
  }
  const s = data.shapes.find((x) => x.id === shapeId);
  const geo = s ? geometryOf(s) : null;
  if (s && geo?.circle) {
    for (const m of data.marks) {
      if ((m.kind !== 'tick' && m.kind !== 'arrow') || !('circle' in m) || m.circle !== shapeId) continue;
      const a = (m.angle * Math.PI) / 180;
      const u = toUnits(s, { x: (geo.circle.cx ?? 0) + geo.circle.r * Math.cos(a), y: (geo.circle.cy ?? 0) + geo.circle.r * Math.sin(a) });
      out.push(toPx(data, u));
    }
  }
  return out;
}

export function ownerOfDef(data: SceneData, d: PointDef, depth = 0): string | undefined {
  switch (d.t) {
    case 'world':
      return undefined;
    case 'local':
    case 'circ':
      return d.shape;
    case 'ratio':
    case 'cross':
      return ownerOfRef(data, d.a, depth);
    case 'lineCircle':
    case 'circs':
      return d.shape;
    case 'offset':
    case 'rayHit':
    case 'dirHit':
    case 'foot':
      return ownerOfRef(data, d.from, depth);
    case 'bisectHit':
      return ownerOfRef(data, d.v, depth);
    case 'perpAt':
      return ownerOfRef(data, d.at, depth);
  }
}

/** Display name for a ref (canonical, English). */
export function refName(data: SceneData, r: Ref): string {
  if ('s' in r) return shapeOf(data, r.s)?.names[r.i] ?? '?';
  if ('c' in r) return shapeOf(data, r.c)?.center.name ?? 'O';
  const p = data.points.find((q) => q.id === r.p);
  return p?.name || '·';
}

export function allPointRefs(data: SceneData): Ref[] {
  const out: Ref[] = [];
  for (const s of data.shapes) {
    if((s.axes||s.chart)||s.caption)continue;
    const geo = geometryOf(s);
    geo.points.forEach((_, i) => out.push({ s: s.id, i }));
    if ((geo.solid || geo.circle) && s.center.show) out.push({ c: s.id });
  }
  for (const p of data.points) out.push({ p: p.id });
  return out;
}

/** An existing point (vertex, centre, construction point) at this position. */
export function findExisting(world: World, pos: Vec): Ref | null {
  const tol = world.size * 1e-5;
  for (const r of allPointRefs(world.data)) {
    if (spatialRef(world.data, r)) continue;
    const q = world.ref(r);
    if (q && vlen(vsub(q, pos)) < tol) return r;
  }
  return null;
}

const NAME_POOL = 'ABCDEFGHIJKLMNXYZ';
export function nextName(data: SceneData, extra: string[] = []): string {
  const used = new Set<string>(extra);
  for (const s of data.shapes) {
    s.names.forEach((n) => used.add(n.toUpperCase()));
    if (s.center.show) used.add(s.center.name.toUpperCase());
  }
  for (const p of data.points) if (p.name) used.add(p.name.toUpperCase());
  for (const ch of NAME_POOL) if (!used.has(ch)) return ch;
  return 'P' + (used.size + 1);
}

export function pointPositions(data: SceneData): Map<string, Vec | null> {
  return buildWorld(data).pt;
}

/** Re-centre the group (shapes + constructions) on the image and choose the px-per-unit scale. */
let inkFit: ((d: SceneData) => SceneData) | null = null;
/** crop.ts registers the ink-based refinement (it needs glyph metrics). */
export function setInkFit(f: (d: SceneData) => SceneData) { inkFit = f; }

export function fitScene(data: SceneData): SceneData {
  const fitted = fitSceneUnits(data);
  return inkFit ? inkFit(fitted) : fitted;
}

function fitSceneUnits(data: SceneData): SceneData {
  if (data.shapes.length === 0) return { ...data, viewScale: 40 * Math.min(data.canvas.w, data.canvas.h) / 900 };
  const w = buildWorld(data);
  const b = unionBounds(data.shapes.map(boundsUnits));
  for (const p of w.pt.values()) {
    if (!p) continue;
    b.minx = Math.min(b.minx, p.x);
    b.maxx = Math.max(b.maxx, p.x);
    b.miny = Math.min(b.miny, p.y);
    b.maxy = Math.max(b.maxy, p.y);
  }
  const cx = (b.minx + b.maxx) / 2;
  const cy = (b.miny + b.maxy) / 2;
  const bw = Math.max(b.maxx - b.minx, 1e-6);
  const bh = Math.max(b.maxy - b.miny, 1e-6);
  const G = Math.min((data.canvas.w * data.style.fill) / bw, (data.canvas.h * data.style.fill) / bh);
  return {
    ...data,
    viewScale: G,
    shapes: data.shapes.map((s) => ({ ...s, offset: { x: s.offset.x - cx, y: s.offset.y - cy } })),
  };
}

export function toPx(data: SceneData, u: Vec): Vec {
  return { x: data.canvas.w / 2 + u.x * data.viewScale, y: data.canvas.h / 2 - u.y * data.viewScale };
}
export function fromPx(data: SceneData, p: Vec): Vec {
  return { x: (p.x - data.canvas.w / 2) / data.viewScale, y: -(p.y - data.canvas.h / 2) / data.viewScale };
}

export type { ConPoint };

/** Actual local 3D coordinates for solid vertices and affine points on their edges.
 * Solid instances have independent coordinate frames; points from different solids
 * must not be compared as though they belong to one spatial object.
 */
export interface SpatialPoint { owner: string; position: import('./shapes3d').Vec3 }
export function spatialRef(data: SceneData, r: Ref, depth = 0): SpatialPoint | null {
  if (depth > 100) return null;
  if ('s' in r || 'c' in r) {
    const s = data.shapes.find(s => s.id === ('s' in r ? r.s : r.c));
    if (!s) return null;
    const g = geometryOf(s).solid;
    if (!g) return null;
    const position = 's' in r ? g.vertices[r.i] : { x: 0, y: s.defId === 'solid-sphere' ? 0 : -(s.params.height ?? s.params.side ?? 0) / 2, z: 0 };
    return position ? { owner: s.id, position } : null;
  }
  const p = data.points.find(p => p.id === r.p);
  return p ? spatialDef(data, p.def, depth + 1) : null;
}
export function spatialDef(data: SceneData, def: PointDef, depth = 0): SpatialPoint | null {
  if(depth>100||def.t==='cross'||def.t==='lineCircle'||def.t==='circs'||def.t==='world')return null;
  const get=(r:Ref)=>spatialRef(data,r,depth+1);
  if(def.t==='local'||def.t==='circ'){
    const s=shapeOf(data,def.shape);if(!s?.solid)return null;
    const p=def.t==='circ'?circularPoint(s,def.angle):def.z!==undefined?{x:def.x,y:def.y,z:def.z}:null;
    return p?{owner:s.id,position:p}:null;
  }
  const base=get(def.t==='ratio'?def.a:def.t==='bisectHit'?def.v:def.t==='perpAt'?def.at:def.from);
  if(!base)return null;
  const s=shapeOf(data,base.owner);if(!s?.solid)return null;
  const other=(r:Ref)=>{const p=get(r);return p?.owner===base.owner?p.position:null;};
  const result=(p:import('./shapes3d').Vec3|null):SpatialPoint|null=>p&&Object.values(p).every(Number.isFinite)?{owner:base.owner,position:p}:null;
  const p=base.position;
  switch(def.t){
    case 'ratio':{const b=other(def.b);return result(b?add3(p,mul3(sub3(b,p),def.k)):null);}
    case 'offset':return result(add3(p,mul3(direction3(def.angle,def.plane),def.dist)));
    case 'rayHit':return def.shape===base.owner?result(solidHits(s,p,direction3(def.angle,def.plane))[0]?.point??null):null;
    case 'foot':{const a=other(def.a),b=other(def.b);return result(a&&b?foot3(p,a,b)?.point??null:null);}
    case 'perpAt':{const b=other(def.toward),dir=b?perpendicular3(sub3(b,p),def.plane):null;return result(dir&&length3(dir)>1e-9?add3(p,mul3(dir,def.dist)):null);}
    case 'dirHit':{
      const a=other(def.a),b=other(def.b);if(!a||!b||def.shape!==base.owner)return null;
      const ab=sub3(b,a),dir=def.mode==='par'?unit3(ab):perpendicular3(ab,def.plane);
      return result(solidHits(s,p,mul3(dir,def.sign))[0]?.point??null);
    }
    case 'bisectHit':{
      const a=other(def.a),b=other(def.b);if(!a||!b||def.shape!==base.owner)return null;
      const dir=unit3(add3(unit3(sub3(a,p)),unit3(sub3(b,p))));
      return result(solidHits(s,p,dir)[0]?.point??null);
    }
  }
}
export function spatialDistance(data: SceneData, a: Ref, b: Ref): number | null {
  const p = spatialRef(data, a), q = spatialRef(data, b);
  if (!p || !q || p.owner !== q.owner) return null;
  return Math.hypot(p.position.x-q.position.x, p.position.y-q.position.y, p.position.z-q.position.z);
}
