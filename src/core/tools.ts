import { allPointRefs, spatialDef, spatialRef } from './world';
import type { Vec3 } from './shapes3d';
import { sub3, mul3, unit3, length3, foot3, perpendicular3, solidHits, unprojectPlane } from './spatial';
import { targetScenePos } from './angleSnap';
import { lineCircleTs } from './intersections';
import { fromUnits, geometryOf, newFreePathShape, newShape, sitOnPoint, toUnits, uid } from './scene';
import type { ConLine, ConMark, ConPoint, ConstructionPlane, PointDef, Ref, SceneData, ShapeInstance, Vec } from './types';
import {
  boundaryHits,
  buildWorld,
  findExisting,
  nextName,
  ownerOfRef,
  refName,
  resolveDef,
  vadd,
  vdot,
  vlen,
  vmul,
  vrot90,
  vsub,
  vunit,
  type World,
} from './world';

/* ------------------------------------------------------------------ */
/* Pick targets                                                        */
/* ------------------------------------------------------------------ */
export type Target =
  | { kind: 'point'; ref: Ref }
  /** `via` is set when the click snapped to this line's crossing with another line, or with a circle. */
  | { kind: 'line'; a: Ref; b: Ref; k: number; via?: { a: Ref; b: Ref } | { circle: string; which: 0 | 1 } }
  | { kind: 'circles'; shape: string; other: string; which: 0 | 1; x: number; y: number }
  | { kind: 'circle'; shape: string; angle: number }
  | { kind: 'free'; shape: string; x: number; y: number }
  | { kind: 'world'; x: number; y: number };

export type StepKind = 'point' | 'line' | 'circle' | 'lineOrCircle' | 'lineOrPoint' | 'pointOrCanvas' | 'canvas';

export interface ToolOpts {
  plane: ConstructionPlane;
  face: number;
  angle: number;
  dist: number;
  hit: boolean;
  connect: boolean;
  dashed: boolean;
  requireOn: boolean;
  markKind: 'tick' | 'arrow';
  markN: number;
  extendPct: number;
  namePoint: boolean;
  shift: boolean;
  arrow: 'none' | 'start' | 'end' | 'both' | 'middle';
  arcFraction: 0.25 | 0.5 | 0.75;
  arcSide: 1 | -1;
  anchor: 'top-left'|'top'|'top-right'|'left'|'center'|'right'|'bottom-left'|'bottom'|'bottom-right';
  lineWeight: number;
  hatchSide: 1 | -1;
  attachSize: number;
}

export const DEFAULT_OPTS: ToolOpts = {
  plane: 'xy',
  face: -1,
  angle: 45,
  dist: 3,
  hit: false,
  connect: false,
  dashed: false,
  requireOn: false,
  markKind: 'tick',
  markN: 1,
  extendPct: 40,
  namePoint: true,
  shift: false,
  arrow: 'none',
  arcFraction: 0.25,
  arcSide: 1,
  anchor: 'center',
  lineWeight: 1,
  hatchSide: -1,
  attachSize: 3,
};

export type ToolResult =
  | { ok: false; error: string }
  | { ok: true; points: ConPoint[]; lines: ConLine[]; marks: ConMark[]; removeMarks: string[]; shapes: ShapeInstance[]; showCentre?: string; info?: string; measurePx?: number };

export type ToolGroup = 'Points' | 'Lines' | 'Circle' | 'Marks';

export interface ToolDef {
  id: string;
  label: string;
  group: ToolGroup;
  tip: string;
  steps: StepKind[];
  prompts: string[];
  /** Keep accepting clicks until finishOpenTool (Enter or Finish). */
  openEnded?: boolean;
  run: (data: SceneData, picks: Target[], o: ToolOpts) => ToolResult;
}

/* ------------------------------------------------------------------ */
/* Builder: accumulates new items and validates them                   */
/* ------------------------------------------------------------------ */
class Fail extends Error {}
const fail = (m: string): never => {
  throw new Fail(m);
};

function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const ab = vsub(b, a);
  const l2 = vdot(ab, ab);
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, vdot(vsub(p, a), ab) / l2));
  return vlen(vsub(p, vadd(a, vmul(ab, t))));
}

class Builder {
  data: SceneData;
  world: World;
  points: ConPoint[] = [];
  lines: ConLine[] = [];
  marks: ConMark[] = [];
  shapes: ShapeInstance[] = [];
  removeMarks: string[] = [];
  infos: string[] = [];
  showCentre?: string;

  constructor(d: SceneData) {
    this.data = d;
    this.world = buildWorld(d);
  }
  private rebuild() {
    this.world = buildWorld(this.data);
  }
  get tol() {
    return this.world.size * 1e-5;
  }
  pos(r: Ref): Vec {
    const p = this.world.ref(r);
    if (!p) fail('That point is no longer available.');
    return p as Vec;
  }
  n(r: Ref) {
    return refName(this.data, r);
  }
  owner(...refs: Ref[]): string | undefined {
    for (const r of refs) {
      const o = ownerOfRef(this.data, r);
      if (o) return o;
    }
    return undefined;
  }

  /** Create a point (or reuse an existing one at the same position). */
  addPoint(def: PointDef, label: boolean, uniqueMsg?: string): Ref {
    const pos = resolveDef(this.world, def);
    if (!pos) return fail('That construction does not meet the figure.');
    const spatial = spatialDef(this.data, def);
    const ex = spatial ? allPointRefs(this.data).find(r => {
      const q = spatialRef(this.data, r);
      return q?.owner === spatial.owner && Math.hypot(q.position.x-spatial.position.x, q.position.y-spatial.position.y, q.position.z-spatial.position.z) < this.tol;
    }) : findExisting(this.world, pos as Vec);
    if (ex) {
      if (uniqueMsg) fail(`${uniqueMsg} (${this.n(ex)}).`);
      return ex;
    }
    const p: ConPoint = { id: uid(), name: label ? nextName(this.data) : '', showLabel: label, dot: label, def };
    this.points.push(p);
    this.data = { ...this.data, points: [...this.data.points, p] };
    this.rebuild();
    return { p: p.id };
  }

  /** Create a segment, refusing duplicates and segments that already lie on a side. Returns false if skipped silently. */
  addLine(a: Ref, b: Ref, o: { dashed?: boolean; silent?: boolean; arrow?:ConLine['arrow']; weight?:number; force?:boolean } = {}): boolean {
    const A = this.pos(a);
    const B = this.pos(b);
    const tol = this.tol;
    const nm = `${this.n(a)}${this.n(b)}`;
    const bad = (m: string) => {
      if (o.silent) return false;
      return fail(m);
    };
    const SA = spatialRef(this.data, a), SB = spatialRef(this.data, b);
    if (SA || SB) {
      if (!SA || !SB || SA.owner !== SB.owner) return bad('Choose two points on the same solid.');
      const same3 = (p: Vec3, q: Vec3) => Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z) < tol;
      const on3 = (p: Vec3, a: Vec3, b: Vec3) => {
        const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},ap={x:p.x-a.x,y:p.y-a.y,z:p.z-a.z};
        const l2=ab.x*ab.x+ab.y*ab.y+ab.z*ab.z;
        const k=l2<1e-18?0:Math.max(0,Math.min(1,(ap.x*ab.x+ap.y*ab.y+ap.z*ab.z)/l2));
        return same3(p,{x:a.x+k*ab.x,y:a.y+k*ab.y,z:a.z+k*ab.z});
      };
      const p=SA.position,q=SB.position;
      if(same3(p,q))return bad('The two points are the same point.');
      for(const l of this.data.lines){
        const x=spatialRef(this.data,l.a),y=spatialRef(this.data,l.b);
        if(x?.owner===SA.owner&&y?.owner===SA.owner&&on3(p,x.position,y.position)&&on3(q,x.position,y.position))return bad(`${nm} is already drawn on that spatial line.`);
      }
      const shape=this.data.shapes.find(s=>s.id===SA.owner)!;
      const g=geometryOf(shape).solid!;
      for(const e of g.edges)if(on3(p,g.vertices[e.a],g.vertices[e.b])&&on3(q,g.vertices[e.a],g.vertices[e.b]))return bad(`${nm} is already part of an edge of the solid.`);
      const l: ConLine = { id: uid(), a, b, dashed: !!o.dashed, arrow:o.arrow??'none', weight:o.weight??1, ...(o.force?{kind:'force' as const}:{}), label: { text: '', unit: !o.force } };
      this.lines.push(l);this.data={...this.data,lines:[...this.data.lines,l]};return true;
    }
    if (vlen(vsub(A, B)) < tol) return bad('The two points are the same point.');
    const same = (p: Vec, q: Vec) => vlen(vsub(p, q)) < tol;
    if (!o.force) {
    for (const l of this.data.lines) {
      if (spatialRef(this.data, l.a) || spatialRef(this.data, l.b)) continue;
      const la = this.world.ref(l.a);
      const lb = this.world.ref(l.b);
      if (!la || !lb) continue;
      if ((same(la, A) && same(lb, B)) || (same(la, B) && same(lb, A))) return bad(`${nm} is already drawn.`);
      if (distToSegment(A, la, lb) < tol && distToSegment(B, la, lb) < tol)
        return bad(`${nm} lies on the line ${this.n(l.a)}${this.n(l.b)} that is already drawn.`);
    }
    for (const s of this.data.shapes) {
      const geo = geometryOf(s);
      if (geo.circle || geo.solid) continue;
      const pts = this.shapePts(s);
      const last = geo.open || pts.length < 3 ? pts.length - 1 : pts.length;
      for (let i = 0; i < last; i++) {
        const E1 = pts[i];
        const E2 = pts[(i + 1) % pts.length];
        if (distToSegment(A, E1, E2) < tol && distToSegment(B, E1, E2) < tol) {
          if ((same(A, E1) && same(B, E2)) || (same(A, E2) && same(B, E1)))
            return bad(`${nm} is already a side of the figure.`);
          return bad(`${this.n(a)} and ${this.n(b)} are both on side ${s.names[i]}${s.names[(i + 1) % pts.length]}, so the segment between them is already part of that side.`);
        }
      }
    }
    }
    const l: ConLine = { id: uid(), a, b, dashed: !!o.dashed, arrow:o.arrow??'none', weight:o.weight??1, ...(o.force?{kind:'force' as const}:{}), label: { text: '', unit: !o.force } };
    this.lines.push(l);
    this.data = { ...this.data, lines: [...this.data.lines, l] };
    return true;
  }
  addSpline(refs:Ref[],dashed=false){
    if(refs.length<2)fail('Click at least two points, then finish.');
    const a=refs[0],b=refs[refs.length-1],via=refs.slice(1,-1);
    const line:ConLine={id:uid(),a,b,dashed,curve:'spline',via,arrow:'none',label:{text:'',unit:false}};
    this.lines.push(line);this.data={...this.data,lines:[...this.data.lines,line]};
  }
  addArc(a:Ref,b:Ref,fraction:0.25|0.5|0.75,side:1|-1,dashed=false){
    if(vlen(vsub(this.pos(a),this.pos(b)))<this.tol)fail('The two points are the same point.');
    const duplicate=[...this.data.lines,...this.lines].some(l=>l.curve==='arc'&&l.arcFraction===fraction&&l.arcSide===side&&sameLine(this,l.a,l.b,a,b));
    if(duplicate)fail('This arc is already drawn.');
    const line:ConLine={id:uid(),a,b,dashed,curve:'arc',arcFraction:fraction,arcSide:side,arrow:'none',label:{text:'',unit:true}};
    this.lines.push(line);this.data={...this.data,lines:[...this.data.lines,line]};
  }
  private shapePts(s: ShapeInstance): Vec[] {
    return geometryOf(s).points.map((_, i) => this.world.ref({ s: s.id, i }) as Vec);
  }
  addMark(m: ConMark) {
    this.marks.push(m);
    this.data = { ...this.data, marks: [...this.data.marks, m] };
  }
  addBody(defId: 'mech-particle' | 'mech-block', at: Vec, along: Vec) {
    const shape = sitOnPoint(newShape(defId), at, along);
    this.shapes.push(shape);
    this.data = { ...this.data, shapes: [...this.data.shapes, shape] };
  }
  result(): ToolResult {
    return {
      ok: true,
      points: this.points,
      lines: this.lines,
      marks: this.marks,
      shapes: this.shapes,
      removeMarks: this.removeMarks,
      showCentre: this.showCentre,
      info: this.infos.join(' '),
    };
  }
}

function run(data: SceneData, f: (b: Builder) => void): ToolResult {
  const b = new Builder(data);
  try {
    f(b);
    return b.result();
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: e.message };
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const L = (t: Target): { a: Ref; b: Ref; k: number } => (t.kind === 'line' ? t : fail('Pick a side or a line.'));
function pointFrom(b: Builder, t: Target, label = true, uniqueMsg?: string): Ref {
  if (t.kind === 'point') return t.ref;
  if (t.kind === 'circles') return b.addPoint({ t: 'circs', shape: t.shape, other: t.other, which: t.which }, label, uniqueMsg);
  if (t.kind === 'line' && t.via) {
    if ('circle' in t.via) return b.addPoint({ t: 'lineCircle', a: t.a, b: t.b, shape: t.via.circle, which: t.via.which }, label, uniqueMsg);
    return b.addPoint({ t: 'cross', a: t.a, b: t.b, c: t.via.a, d: t.via.b }, label, uniqueMsg);
  }
  return fail('Pick a point.');
}
function targetRef(b:Builder,t:Target,nameIfNew=false):Ref{
  if(t.kind==='point')return t.ref;
  if(t.kind==='circles'||(t.kind==='line'&&t.via))return pointFrom(b,t,nameIfNew);
  if(t.kind==='line'){
    if(t.k<0.08)return t.a;
    if(t.k>0.92)return t.b;
    return b.addPoint({t:'ratio',a:t.a,b:t.b,k:snapK(t.k)},nameIfNew);
  }
  const pos=targetScenePos(b.data,t);
  if(pos){
    const ex=findExisting(b.world,pos);
    if(ex)return ex;
  }
  if(t.kind==='free')return b.addPoint({t:'local',shape:t.shape,x:t.x,y:t.y},nameIfNew);
  if(t.kind==='world')return b.addPoint({t:'world',x:t.x,y:t.y},nameIfNew);
  return fail('Pick a point, line, or empty position.');
}
const looseTarget = (t: Target) => t.kind === 'world' || t.kind === 'free';

/** A loose click stays a fixed distance from the point it was measured from, so later moves keep the segment. */
function namedRef(data: SceneData, r: Ref): boolean {
  if ('s' in r) {
    const s = data.shapes.find((q) => q.id === r.s);
    return !!(s?.showVertexLabels && (s.names[r.i] ?? '').trim());
  }
  if ('c' in r) {
    const s = data.shapes.find((q) => q.id === r.c);
    return !!(s?.center.show && s.center.name.trim());
  }
  if ('p' in r) {
    const p = data.points.find((q) => q.id === r.p);
    return !!(p && (p.name.trim() || p.showLabel));
  }
  return false;
}

function ensureNamed(b: Builder, r: Ref): Ref {
  if (namedRef(b.data, r) || !('p' in r)) return r;
  const p = b.points.find((q) => q.id === r.p) ?? b.data.points.find((q) => q.id === r.p);
  if (!p || p.name.trim()) return r;
  const name = nextName(b.data, b.points.map((q) => q.name));
  p.name = name;
  p.showLabel = true;
  p.dot = true;
  b.data = { ...b.data, points: b.data.points.map((q) => (q.id === p.id ? { ...q, name, showLabel: true, dot: true } : q)) };
  return r;
}

function anchorLoose(b: Builder, from: Target, to: Target, o: { dashed?: boolean; arrow?: ConLine['arrow']; weight?: number; force?: boolean }) {
  const origin = ensureNamed(b, targetRef(b, from, true));
  const A = b.pos(origin);
  const B = targetScenePos(b.data, to) ?? fail('Could not read that location.');
  const dist = Math.hypot(B.x - A.x, B.y - A.y);
  const angle = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  if (!(dist > 1e-6)) fail('The two positions are the same point.');
  const end = b.addPoint({ t: 'offset', from: origin, angle, dist, plane: 'xy' }, true);
  b.addLine(origin, end, o);
}

function connectEnds(b: Builder, t1: Target, t2: Target, o: { dashed?: boolean; arrow?: ConLine['arrow']; weight?: number; force?: boolean }) {
  if (looseTarget(t2) && pickAttached(b.data, t1)) return anchorLoose(b, t1, t2, o);
  if (looseTarget(t1) && pickAttached(b.data, t2)) return anchorLoose(b, t2, t1, o);
  b.addLine(targetRef(b, t1, true), targetRef(b, t2, true), o);
}

function pickAttached(data: SceneData, t: Target): boolean {
  if (t.kind === 'world') return false;
  if (t.kind === 'free' || t.kind === 'circle' || t.kind === 'circles') return true;
  if (t.kind === 'point') return !!ownerOfRef(data, t.ref);
  if (t.kind === 'line') return !!(ownerOfRef(data, t.a) || ownerOfRef(data, t.b));
  return false;
}

function forceArrow(from:Target,to:Target,data:SceneData,chosen:ConLine['arrow']|undefined):ConLine['arrow']{
  if(chosen&&chosen!=='none')return chosen;
  const start=from.kind==='point'?ownerOfRef(data,from.ref):from.kind==='free'?from.shape:undefined;
  const end=to.kind==='point'?ownerOfRef(data,to.ref):to.kind==='free'?to.shape:to.kind==='line'?ownerOfRef(data,to.a):undefined;
  if(from.kind==='point'&&to.kind==='point')return end&&end!==start?'middle':'end';
  return 'middle';
}
function support(b:Builder,t:Target):{a:Ref;b:Ref;at:Ref;shape:ShapeInstance;k:number}{
  if(t.kind==='line'){
    const owner=b.owner(t.a,t.b);
    const shape=owner?b.data.shapes.find(s=>s.id===owner):undefined;
    if(!shape)return fail('Pick a side of a mechanics shape.');
    const k=Math.max(0,Math.min(1,t.k));
    const at=t.via?pointFrom(b,t,false):k<0.05?t.a:k>0.95?t.b:b.addPoint({t:'ratio',a:t.a,b:t.b,k:snapK(k)},false);
    return {a:t.a,b:t.b,at,shape,k};
  }
  const at=pointFrom(b,t);
  const ownerId='s' in at ? at.s : b.owner(at);
  if(!ownerId)return fail('Pick a side or a point of the mechanics shape.');
  const shape=shapeById(b,ownerId),n=geometryOf(shape).points.length;
  if(n<2)fail('That shape has no supporting line.');
  const a={s:ownerId,i:0},bRef={s:ownerId,i:n-1};
  const k='s' in at && at.s===ownerId && n>1 ? at.i/(n-1) : 0.5;
  return {a,b:bRef,at,shape,k};
}
const snapAngle = (a: number) => {
  const m = ((a % 360) + 360) % 360;
  const r = Math.round(m / 15) * 15;
  return Math.abs(m - r) < 2.5 ? r % 360 : Math.round(m * 10) / 10;
};
const snapK = (k: number) => {
  const kk = Math.max(0.04, Math.min(0.96, k));
  for (const s of [0.25, 0.5, 0.75]) if (Math.abs(kk - s) < 0.03) return s;
  return Math.round(kk * 1000) / 1000;
};

function shapeById(b: Builder, id: string): ShapeInstance {
  return b.data.shapes.find((s) => s.id === id) ?? fail('That shape no longer exists.');
}

function perpFrom(b: Builder, p: Ref, la: Ref, lb: Ref, requireOn: boolean) {
  const Pp = b.pos(p);
  const A = b.pos(la);
  const B = b.pos(lb);
  const ab = vsub(B, A);
  const l2 = vdot(ab, ab);
  if (l2 < 1e-18 && !spatialRef(b.data,la)) fail('That line is degenerate.');
  const sp=spatialRef(b.data,p),sa=spatialRef(b.data,la),sb=spatialRef(b.data,lb);
  const sf=sp&&sa&&sb&&sp.owner===sa.owner&&sp.owner===sb.owner?foot3(sp.position,sa.position,sb.position):null;
  if(sp&&!sf)fail('Choose a non-degenerate line on the same solid.');
  const k = sf?.k ?? vdot(vsub(Pp, A), ab) / l2;
  const foot = vadd(A, vmul(ab, k));
  const lname = `${b.n(la)}${b.n(lb)}`;
  if ((sf&&sp?length3(sub3(sp.position,sf.point)):vlen(vsub(Pp, foot))) < b.tol)
    fail(`${b.n(p)} already lies on ${lname}. To draw a perpendicular through it use “Perpendicular at a point”.`);
  const onSeg = k >= -1e-6 && k <= 1 + 1e-6;
  if (!onSeg && requireOn)
    fail(
      `The foot of the perpendicular from ${b.n(p)} falls outside ${lname}, on its extension, so it can't land on the side itself. Untick “Foot must be on the side” to draw it on the extension.`,
    );
  const fr = b.addPoint({ t: 'foot', from: p, a: la, b: lb }, true);
  if (!b.addLine(p, fr, { silent: true }))
    fail(`The perpendicular from ${b.n(p)} to ${lname} is the segment ${b.n(p)}${b.n(fr)}, which is already drawn.`);
  if (!onSeg) {
    const end = k < 0 ? la : lb;
    b.addLine(end, fr, { dashed: true, silent: true });
    b.infos.push(`The foot ${b.n(fr)} lies on the extension of ${lname} (beyond ${b.n(end)}), so the extension is drawn dashed.`);
  }
  const FP = b.pos(fr);
  const cands = k < 0 ? [la, lb] : k > 1 ? [lb, la] : k < 0.5 ? [lb, la] : [la, lb];
  const other = cands.find((c) => sf?length3(sub3(spatialRef(b.data,c)!.position,sf.point))>b.tol:vlen(vsub(b.pos(c), FP)) > b.tol);
  if (other) b.addMark({ id: uid(), kind: 'right', at: fr, a: p, b: other });
}

function faceAt(b:Builder,v:{s:string;i:number},face:number):number[]{
  const g=geometryOf(shapeById(b,v.s));
  if(!g.solid)return g.points.map((_,i)=>i);
  const f=face<0?g.solid.faces.find(f=>f.includes(v.i)):g.solid.faces[face];
  if(!f?.includes(v.i))return fail('Choose a face containing the selected vertex.');
  return f;
}
function trianglePair(b: Builder, v: Ref, face=-1): { a: Ref; c: Ref } {
  if (!('s' in v)) return fail('Pick a vertex of a triangle.');
  const g=geometryOf(shapeById(b,v.s));
  const f=g.solid&&face<0?g.solid.faces.find(f=>f.length===3&&f.includes(v.i)):faceAt(b,v,face);
  if (!f||f.length!==3) return fail('Choose a triangular face containing this vertex. For other faces use “Perpendicular from a point”.');
  const [a,c]=f.filter(i=>i!==v.i);
  return { a: { s: v.s, i:a }, c: { s: v.s, i:c } };
}

function spatialDirectionHit(b:Builder,from:Ref,a:Ref,c:Ref,mode:'par'|'perp',o:ToolOpts):Ref|null{
  const p=spatialRef(b.data,from);if(!p)return null;
  const A=spatialRef(b.data,a),B=spatialRef(b.data,c);
  if(!A||!B||p.owner!==A.owner||p.owner!==B.owner)fail('Choose points and edges on the same solid.');
  const foot=foot3(p.position,A!.position,B!.position);if(!foot)fail('That line is degenerate.');
  const distance=length3(sub3(p.position,foot!.point));
  if(mode==='perp'&&(distance>b.tol||foot!.k< -1e-6||foot!.k>1+1e-6))fail('Choose a point on this edge, or use “Perpendicular from a point”.');
  if(mode==='par'&&distance<b.tol)fail('A parallel through this point would be the same line.');
  const ab=sub3(B!.position,A!.position),dir=mode==='par'?unit3(ab):perpendicular3(ab,o.plane);
  if(length3(dir)<1e-9)fail('This edge is normal to the chosen plane. Choose another construction plane.');
  const shape=shapeById(b,p.owner),forward=solidHits(shape,p.position,dir)[0],back=solidHits(shape,p.position,mul3(dir,-1))[0];
  if(!forward&&!back)fail('This direction does not meet the solid again. Choose another plane or use “Point from a point”.');
  const sign=forward&&(!back||forward.t<=back.t)?1:-1;
  const hit=b.addPoint({t:'dirHit',from,a,b:c,mode,sign,shape:p.owner,plane:o.plane},true);
  b.addLine(from,hit);
  if(mode==='perp'){
    const far=length3(sub3(A!.position,p.position))>length3(sub3(B!.position,p.position))?a:c;
    b.addMark({id:uid(),kind:'right',at:from,a:hit,b:far});
  }else{
    const base=b.data.marks.find(m=>m.kind==='arrow'&&'a' in m&&sameLine(b,m.a,m.b,a,c));
    const used=b.data.marks.filter(m=>m.kind==='arrow').map(m=>(m as {n:number}).n);
    const n=base?(base as {n:number}).n:Math.min(3,(used.length?Math.max(...used):0)+1);
    if(!base)b.addMark({id:uid(),kind:'arrow',a,b:c,n});
    b.addMark({id:uid(),kind:'arrow',a:from,b:hit,n});
  }
  return hit;
}

/** First direction (of the two) in which the shape boundary is hit, preferring the nearer hit. */
function chooseSign(b: Builder, shape: string, from: Vec, d: Vec): 1 | -1 | null {
  const e = b.tol;
  const h1 = boundaryHits(b.data, shape, from, d, e)[0];
  const h2 = boundaryHits(b.data, shape, from, vmul(d, -1), e)[0];
  if (h1 && h2) return h1.t <= h2.t ? 1 : -1;
  if (h1) return 1;
  if (h2) return -1;
  return null;
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */
function addCrossing(b: Builder, t: Target): boolean {
  if (t.kind === 'circles' || (t.kind === 'line' && t.via)) {
    pointFrom(b, t, true, 'A point already exists there');
    return true;
  }
  return false;
}
export const TOOLS: ToolDef[] = [
  {
    id: 'side-point',
    label: 'Point on side',
    group: 'Points',
    tip: 'Click on a side (or a circle) to put a labelled point exactly there. Clicks near ¼, ½ or ¾ snap to them.',
    steps: ['lineOrCircle'],
    prompts: ['Click on a side or on the circle where the point should go'],
    run: (d, [t]) =>
      run(d, (b) => {
        if (t.kind === 'point' || addCrossing(b, t)) return;
        if (t.kind === 'circle') {
          b.addPoint({ t: 'circ', shape: t.shape, angle: snapAngle(t.angle) }, true, 'A point already exists there');
        } else {
          const l = L(t);
          b.addPoint({ t: 'ratio', a: l.a, b: l.b, k: snapK(l.k) }, true, 'A point already exists there');
        }
      }),
  },
  {
    id: 'free-point',
    label: 'Free point',
    group: 'Points',
    tip: 'Click anywhere (inside, on or outside the figure) to add a labelled point.',
    steps: ['canvas'],
    prompts: ['Click where the point should go'],
    run: (d, [t], o) =>
      run(d, (b) => {
        if (addCrossing(b, t)) return;
        if (t.kind !== 'free') fail('Click on an empty spot.');
        else {
          const shape=shapeById(b,t.shape);
          if(shape.solid){
            const p=unprojectPlane(shape,{x:t.x,y:t.y},o.plane);
            if(!p)fail('The chosen plane is edge-on in this view. Choose another plane or turn the solid.');
            b.addPoint({t:'local',shape:t.shape,x:p!.x,y:p!.y,z:p!.z,plane:o.plane},true);
          }else b.addPoint({t:'local',shape:t.shape,x:t.x,y:t.y},true);
        }
      }),
  },
  {
    id:'anchor-point',
    label:'9-position point',
    group:'Points',
    tip:'Place a point at a corner, side midpoint, or geometric centre of the clicked shape.',
    steps:['canvas'],
    prompts:['Click the shape that should receive the selected anchor point'],
    run:(d,[t],o)=>run(d,b=>{
      if(t.kind!=='free')return fail('Click inside the target shape.');
      const shape=shapeById(b,t.shape),g=geometryOf(shape);
      const local=[...g.points];
      if(g.circle){const c={x:g.circle.cx??0,y:g.circle.cy??0},r=g.circle.r;local.push({x:c.x-r,y:c.y-r},{x:c.x+r,y:c.y+r});}
      if(!local.length)fail('This shape has no 2D anchor positions.');
      const minx=Math.min(...local.map(p=>p.x)),maxx=Math.max(...local.map(p=>p.x)),miny=Math.min(...local.map(p=>p.y)),maxy=Math.max(...local.map(p=>p.y));
      const centre=g.circle?{x:g.circle.cx??0,y:g.circle.cy??0}:{x:g.points.reduce((s,p)=>s+p.x,0)/g.points.length,y:g.points.reduce((s,p)=>s+p.y,0)/g.points.length};
      const [v,h]=o.anchor.split('-').length===2?o.anchor.split('-'):[o.anchor,o.anchor];
      const x=o.anchor==='center'?centre.x:o.anchor==='top'||o.anchor==='bottom'?(minx+maxx)/2:(h==='left'||v==='left'?minx:maxx);
      const y=o.anchor==='center'?centre.y:o.anchor==='left'||o.anchor==='right'?(miny+maxy)/2:(v==='top'?maxy:miny);
      b.addPoint({t:'local',shape:shape.id,x,y},true,'A point already exists there');
    }),
  },
  {
    id: 'midpoint',
    label: 'Midpoint',
    group: 'Points',
    tip: 'Click a side to mark its midpoint.',
    steps: ['line'],
    prompts: ['Click the side whose midpoint you want'],
    run: (d, [t]) =>
      run(d, (b) => {
        const l = L(t);
        b.addPoint({ t: 'ratio', a: l.a, b: l.b, k: 0.5 }, true, 'The midpoint already exists');
      }),
  },
  {
    id: 'rel-point',
    label: 'Point from a point',
    group: 'Points',
    tip: 'Click the origin, then the new location. Hold Shift while moving to snap to 0° / 45° / 90° …',
    steps: ['point', 'pointOrCanvas'],
    prompts: ['Click the point to measure from', 'Click the new location (Shift snaps to 0° / 45° / 90° …)'],
    run: (d, picks, o) =>
      run(d, (b) => {
        const from = pointFrom(b, picks[0]);
        let angle = o.angle, dist = o.dist;
        if (picks[1]) {
          const A = b.pos(from);
          const B = targetScenePos(d, picks[1]) ?? fail('Could not read that location.');
          dist = Math.hypot(B.x - A.x, B.y - A.y);
          angle = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
          if (!(dist > 1e-6)) fail('The two positions are the same point.');
        } else if (!o.hit && !(dist > 0)) fail('Enter a distance greater than 0.');
        let target: Ref;
        if (o.hit) {
          const shape = b.owner(from) ?? b.data.shapes[0]?.id ?? fail('Add a shape first.');
          b.addPoint({ t: 'rayHit', from, angle, shape, plane: o.plane }, true);
        } else {
          b.addPoint({ t: 'offset', from, angle, dist, plane: o.plane }, true);
        }
      }),
  },
  {
    id: 'segment',
    label: 'Segment',
    group: 'Lines',
    tip: 'Join two points with a line. Hold Shift to snap to 0° / 45° / 90°. Duplicates and segments that already lie on a side are refused.',
    steps: ['pointOrCanvas', 'pointOrCanvas'],
    prompts: ['Click the first point', 'Click the second point (Shift snaps to 0° / 45° / 90° …)'],
    run: (d, [t1, t2], o) => run(d, (b) => {
      if (!pickAttached(d, t1) && !pickAttached(d, t2)) {
        const a = targetScenePos(d, t1) ?? fail('Could not read that location.');
        const c = targetScenePos(d, t2) ?? fail('Could not read that location.');
        b.shapes.push(newFreePathShape([a, c], { dashed: o.dashed }));
        return;
      }
      connectEnds(b, t1, t2, { dashed: o.dashed, arrow: o.arrow });
    }),
  },
  {
    id:'arc',
    label:'Circular arc',
    group:'Lines',
    tip:'Draw a quarter, half, or three-quarter circle between two points.',
    steps:['point','point'],
    prompts:['Click the first endpoint','Click the second endpoint'],
    run:(d,[a,b],o)=>run(d,x=>x.addArc(pointFrom(x,a),pointFrom(x,b),o.arcFraction,o.arcSide,o.dashed)),
  },
  {
    id:'force-line',
    label:'Smart force',
    group:'Lines',
    tip:'Start at a point, then click the end. Hold Shift to snap to 0° / 45° / 90°. Arrow auto-picks middle or end; you can change it.',
    steps:['pointOrCanvas','pointOrCanvas'],
    prompts:['Click the force start point','Click the end (Shift snaps to 0° / 45° / 90° …)'],
    run:(d,[from,to],o)=>run(d,b=>{
      connectEnds(b, from, to, {dashed:o.dashed,arrow:forceArrow(from,to,d,o.arrow),weight:o.lineWeight,force:true});
    }),
  },
  {
    id:'draw-force',
    label:'Force',
    group:'Lines',
    tip:'Click two points anywhere — no shape has to be selected. Hold Shift for 0° / 45° / 90° and slope-parallel guides.',
    steps:['pointOrCanvas','pointOrCanvas'],
    prompts:['Click the force start','Click the force end (Shift snaps to 0° / 45° / 90° …)'],
    run:(d,[from,to],o)=>run(d,b=>{
      connectEnds(b, from, to, {dashed:o.dashed,arrow:forceArrow(from,to,d,o.arrow),weight:o.lineWeight,force:true});
    }),
  },
  {
    id:'draw-arc',
    label:'Circular line',
    group:'Lines',
    tip:'Click two points for a circular arc. Choose ¼, ½ or ¾ in the options. No shape has to be selected first.',
    steps:['pointOrCanvas','pointOrCanvas'],
    prompts:['Click the first end of the arc','Click the second end'],
    run:(d,[a,b],o)=>run(d,x=>x.addArc(targetRef(x,a,false),targetRef(x,b,false),o.arcFraction,o.arcSide,o.dashed)),
  },
  {
    id:'polyline',
    label:'Free poly line (straight)',
    group:'Lines',
    tip:'Click vertices in order. Press Enter or Finish line to finish. Hold Shift for 0° / 45° / 90°.',
    steps:['pointOrCanvas'],
    prompts:['Click the first point','Click the next point (Enter or Finish line to finish)'],
    openEnded:true,
    run:(d,picks,o)=>run(d,b=>{
      if(picks.length<2)fail('Click at least two points, then press Enter or Finish line.');
      const pts=picks.map(t=>targetScenePos(d,t)??fail('Could not read that location.'));
      b.shapes.push(newFreePathShape(pts,{dashed:o.dashed}));
    }),
  },
  {
    id:'polyline-curve',
    label:'Free poly line (curved)',
    group:'Lines',
    tip:'Click vertices in order for a smooth curve. Press Enter or Finish line to finish.',
    steps:['pointOrCanvas'],
    prompts:['Click the first point','Click the next point (Enter or Finish line to finish)'],
    openEnded:true,
    run:(d,picks,o)=>run(d,b=>{
      if(picks.length<2)fail('Click at least two points, then press Enter or Finish line.');
      const pts=picks.map(t=>targetScenePos(d,t)??fail('Could not read that location.'));
      b.shapes.push(newFreePathShape(pts,{curved:true,dashed:o.dashed}));
    }),
  },
  {
    id:'attach-wall',label:'Wall on ground',group:'Lines',tip:'Attach a vertical rough wall to either endpoint of a ground line.',
    steps:['lineOrPoint'],prompts:['Click either endpoint of the ground'],
    run:(d,[t],o)=>run(d,b=>{const s=support(b,t);if(s.shape.defId!=='mech-ground')fail('Choose an endpoint of Ground.');if(s.k>0.08&&s.k<0.92)fail('Choose one of the two ground endpoints.');b.addMark({id:uid(),kind:'attachment',item:'wall',at:s.at,a:s.a,b:s.b,side:o.hatchSide>=0?1:-1,size:o.attachSize});}),
  },
  {
    id:'attach-hinge',label:'Hinge on rod',group:'Lines',tip:'Attach a hinge at an endpoint or any selected point of a rod.',
    steps:['lineOrPoint'],prompts:['Click a point or position on the rod'],
    run:(d,[t],o)=>run(d,b=>{const s=support(b,t);if(s.shape.defId!=='mech-rod')fail('Choose a point on a Rod.');b.addMark({id:uid(),kind:'attachment',item:'hinge',at:s.at,a:s.a,b:s.b,side:-1,size:o.attachSize});}),
  },
  ...(['particle','block'] as const).map(item=>({
    id:`attach-${item}`,label:`${item[0].toUpperCase()+item.slice(1)} on plane`,group:'Lines' as const,
    tip:`Place a ${item} with the midpoint of its lower edge on a ground, inclined plane, or rod.`,
    steps:['lineOrPoint'] as StepKind[],prompts:['Click an endpoint or any position on the supporting line'],
    run:(d:SceneData,[t]:Target[])=>run(d,b=>{const s=support(b,t);if(!['mech-ground','mech-wedge','mech-rod'].includes(s.shape.defId))fail('Choose a Ground, Inclined plane, or Rod.');b.addBody(`mech-${item}`,b.pos(s.at),vsub(b.pos(s.b),b.pos(s.a)));}),
  })),
  {
    id: 'extend',
    label: 'Extend a side',
    group: 'Lines',
    tip: 'Click near one end of a side to extend it past that end with a dashed line (and an optional named point).',
    steps: ['line'],
    prompts: ['Click the side near the end you want to extend'],
    run: (d, [t], o) =>
      run(d, (b) => {
        const l = L(t);
        const pct = Math.max(5, o.extendPct) / 100;
        const beyondB = t.kind === 'line' && t.k >= 0.5;
        const np = b.addPoint({ t: 'ratio', a: l.a, b: l.b, k: beyondB ? 1 + pct : -pct }, o.namePoint);
        b.addLine(beyondB ? l.b : l.a, np, { dashed: true });
      }),
  },
  {
    id: 'perp',
    label: 'Perpendicular from a point',
    group: 'Lines',
    tip: 'Drop a perpendicular from a point onto a side or line. If the foot falls outside the side, it goes on the extension (dashed).',
    steps: ['point', 'line'],
    prompts: ['Click the point to drop the perpendicular from', 'Click the side or line it should be perpendicular to'],
      run: (d, [t1, t2], o) => run(d, (b) => perpFrom(b, pointFrom(b, t1), L(t2).a, L(t2).b, o.requireOn)),
  },
  {
    id: 'perp-at',
    label: 'Perpendicular at a point',
    group: 'Lines',
    tip: 'Draw the perpendicular to a side through a point that lies on it, up to the other side of the figure.',
    steps: ['point', 'line'],
    prompts: ['Click the point on the side', 'Click the side the perpendicular is to'],
    run: (d, [t1, t2], o) =>
      run(d, (b) => {
        const from = pointFrom(b, t1);
        const l = L(t2);
        if(spatialDirectionHit(b,from,l.a,l.b,'perp',o))return;
        const Pp = b.pos(from);
        const A = b.pos(l.a);
        const B = b.pos(l.b);
        if (distToSegment(Pp, A, B) > b.tol)
          fail(`${b.n(from)} is not on ${b.n(l.a)}${b.n(l.b)}. For a point off the line use “Perpendicular from a point”.`);
        const shape = b.owner(from, l.a) ?? fail('Add a shape first.');
        const dir = vrot90(vunit(vsub(B, A)));
        const sign = chooseSign(b, shape, Pp, dir);
        if (!sign) fail('The perpendicular does not meet the figure again. Use “Point from a point” with 90° instead.');
        const hit = b.addPoint({ t: 'dirHit', from, a: l.a, b: l.b, mode: 'perp', sign: sign as 1 | -1, shape }, true);
        b.addLine(from, hit);
        const far = vlen(vsub(A, Pp)) > vlen(vsub(B, Pp)) ? l.a : l.b;
        b.addMark({ id: uid(), kind: 'right', at: from, a: hit, b: far });
      }),
  },
  {
    id: 'altitude',
    label: 'Altitude of a triangle',
    group: 'Lines',
    tip: 'Click a vertex: the height onto the opposite side is drawn (on its extension, dashed, for obtuse triangles).',
    steps: ['point'],
    prompts: ['Click a vertex of the triangle'],
    run: (d, [t], o) =>
      run(d, (b) => {
        const v = pointFrom(b, t);
        const { a, c } = trianglePair(b, v, o.face);
        perpFrom(b, v, a, c, o.requireOn);
      }),
  },
  {
    id: 'median',
    label: 'Median of a triangle',
    group: 'Lines',
    tip: 'Click a vertex: the line to the midpoint of the opposite side (with equal-half ticks).',
    steps: ['point'],
    prompts: ['Click a vertex of the triangle'],
    run: (d, [t], o) =>
      run(d, (b) => {
        const v = pointFrom(b, t);
        const { a, c } = trianglePair(b, v, o.face);
        const m = b.addPoint({ t: 'ratio', a, b: c, k: 0.5 }, true);
        b.addLine(v, m);
        b.addMark({ id: uid(), kind: 'tick', a, b: m, n: 1 });
        b.addMark({ id: uid(), kind: 'tick', a: m, b: c, n: 1 });
      }),
  },
  {
    id: 'bisector',
    label: 'Angle bisector',
    group: 'Lines',
    tip: 'Click a vertex: its angle bisector is drawn to the opposite side of the figure.',
    steps: ['point'],
    prompts: ['Click the vertex whose angle you want to bisect'],
    run: (d, [t], o) =>
      run(d, (b) => {
        const v = pointFrom(b, t);
        if (!('s' in v)) fail('Pick a vertex of a polygon.');
        const vv = v as { s: string; i: number };
        const face=faceAt(b,vv,o.face),i=face.indexOf(vv.i),n=face.length;
        const hit = b.addPoint(
          { t: 'bisectHit', v, a: { s: vv.s, i: face[(i + n - 1) % n] }, b: { s: vv.s, i: face[(i + 1) % n] }, shape: vv.s },
          true,
        );
        b.addLine(v, hit);
      }),
  },
  {
    id: 'parallel',
    label: 'Parallel to a side',
    group: 'Lines',
    tip: 'From a point, draw the parallel to a side up to the figure boundary, with matching parallel arrows.',
    steps: ['point', 'line'],
    prompts: ['Click the point the parallel passes through', 'Click the side it must be parallel to'],
    run: (d, [t1, t2], o) =>
      run(d, (b) => {
        const from = pointFrom(b, t1);
        const l = L(t2);
        if(spatialDirectionHit(b,from,l.a,l.b,'par',o))return;
        const Pp = b.pos(from);
        const A = b.pos(l.a);
        const B = b.pos(l.b);
        const dir = vunit(vsub(B, A));
        const cross = Math.abs(dir.x * (Pp.y - A.y) - dir.y * (Pp.x - A.x));
        if (cross < b.tol) fail(`${b.n(from)} lies on ${b.n(l.a)}${b.n(l.b)}, so a parallel through it would be the same line.`);
        const shape = b.owner(from, l.a) ?? fail('Add a shape first.');
        const sign = chooseSign(b, shape, Pp, dir);
        if (!sign) fail(`The parallel through ${b.n(from)} does not meet the figure. Use “Point from a point” to place its end.`);
        const hit = b.addPoint({ t: 'dirHit', from, a: l.a, b: l.b, mode: 'par', sign: sign as 1 | -1, shape }, true);
        b.addLine(from, hit);
        const key = (m: ConMark) => m.kind === 'arrow';
        const base = b.data.marks.find((m) => key(m) && 'a' in m && sameLine(b, m.a, m.b, l.a, l.b));
        const used = b.data.marks.filter(key).map((m) => (m as { n: number }).n);
        const n = base ? (base as { n: number }).n : Math.min(3, (used.length ? Math.max(...used) : 0) + 1);
        if (!base) b.addMark({ id: uid(), kind: 'arrow', a: l.a, b: l.b, n });
        b.addMark({ id: uid(), kind: 'arrow', a: from, b: hit, n });
      }),
  },
  {
    id: 'radius',
    label: 'Radius',
    group: 'Circle',
    tip: 'Click on the circle: a radius to that point is drawn (the centre becomes visible).',
    steps: ['circle'],
    prompts: ['Click on the circle where the radius should end'],
    run: (d, [t]) =>
      run(d, (b) => {
        if (t.kind !== 'circle') fail('Click on the circle.');
        else {
          shapeById(b, t.shape);
          const pt = b.addPoint({ t: 'circ', shape: t.shape, angle: snapAngle(t.angle) }, true, 'A point already exists there');
          b.addLine({ c: t.shape }, pt);
          b.showCentre = t.shape;
        }
      }),
  },
  {
    id: 'diameter',
    label: 'Diameter',
    group: 'Circle',
    tip: 'Click on the circle: a diameter through that point and its opposite is drawn.',
    steps: ['circle'],
    prompts: ['Click on the circle for one end of the diameter'],
    run: (d, [t]) =>
      run(d, (b) => {
        if (t.kind !== 'circle') fail('Click on the circle.');
        else {
          shapeById(b, t.shape);
          const a1 = snapAngle(t.angle);
          const p1 = b.addPoint({ t: 'circ', shape: t.shape, angle: a1 }, true);
          const p2 = b.addPoint({ t: 'circ', shape: t.shape, angle: (a1 + 180) % 360 }, true);
          b.addLine(p1, p2);
          b.showCentre = t.shape;
        }
      }),
  },
  {
    id: 'tangent',
    label: 'Tangent',
    group: 'Circle',
    tip: 'Click on the circle: the tangent at that point is drawn with its radius and the right-angle mark.',
    steps: ['circle'],
    prompts: ['Click on the circle where the tangent touches'],
    run: (d, [t]) =>
      run(d, (b) => {
        if (t.kind !== 'circle') fail('Click on the circle.');
        else {
          const s = shapeById(b, t.shape);
          const r = s.solid?s.params.radius:(geometryOf(s).circle?.r ?? 1) * s.scale;
          const c: Ref = { c: t.shape };
          const pt = b.addPoint({ t: 'circ', shape: t.shape, angle: snapAngle(t.angle) }, true, 'A point already exists there');
          b.addLine(c, pt);
          const t1 = b.addPoint({ t: 'perpAt', at: pt, toward: c, dist: r * 0.8, ...(s.solid?{plane:'xz' as const}:{}) }, false);
          const t2 = b.addPoint({ t: 'perpAt', at: pt, toward: c, dist: -r * 0.8, ...(s.solid?{plane:'xz' as const}:{}) }, false);
          b.addLine(t1, t2);
          b.addMark({ id: uid(), kind: 'right', at: pt, a: c, b: t1 });
          b.showCentre = t.shape;
        }
      }),
  },
  {
    id: 'mark',
    label: 'Ticks / parallel arrows',
    group: 'Marks',
    tip: 'Click a side to mark it. On a circle, the mark sits where you click; hold Shift to mark the arc between the line cuts. Click the same mark again to remove it.',
    steps: ['lineOrCircle'],
    prompts: ['Click a side, or a circle (Shift marks the arc between the cuts)'],
    run: (d, [t], o) =>
      run(d, (b) => {
        if (t.kind === 'circle') {
          markCircle(b, t.shape, t.angle, o.shift, o.markKind, o.markN);
          return;
        }
        const l = L(t);
        const full = enclosingSide(b, l.a, l.b);
        const pair = o.shift ? fragmentOnSide(b, full, l) : full;
        const old = b.data.marks.find((m) => m.kind === o.markKind && 'a' in m && sameLine(b, m.a, m.b, pair.a, pair.b));
        if (old) {
          b.removeMarks.push(old.id);
          if ((old as { n: number }).n === o.markN) {
            b.infos.push('Mark removed.');
            return;
          }
        }
        b.addMark({ id: uid(), kind: o.markKind, a: pair.a, b: pair.b, n: o.markN });
      }),
  },
];

const wrap360 = (d: number) => ((d % 360) + 360) % 360;
const angGap = (a: number, b: number) => {
  const d = Math.abs(wrap360(a) - wrap360(b));
  return Math.min(d, 360 - d);
};

/** Local angles where a straight line meets this circle, including ends that already sit on it. */
function circleCutAngles(data: SceneData, shape: ShapeInstance): number[] {
  const geo = geometryOf(shape);
  if (!geo.circle) return [];
  const c = { x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 };
  const r = geo.circle.r;
  const tol = Math.max(r * 0.04, 1e-4);
  const w = buildWorld(data);
  const angles: number[] = [];
  const push = (p: Vec) => {
    if (Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - r) > tol) return;
    angles.push((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI);
  };
  const consider = (sa: Vec, sb: Vec) => {
    const a = fromUnits(shape, sa), b = fromUnits(shape, sb);
    for (const t of lineCircleTs(a, b, c, r)) {
      if (t < -0.02 || t > 1.02) continue;
      push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    push(a);
    push(b);
  };
  for (const line of data.lines) {
    if (line.curve) continue;
    const a = w.ref(line.a), b = w.ref(line.b);
    if (a && b) consider(a, b);
  }
  for (const s of data.shapes) {
    if (s.id === shape.id || (s.axes||s.chart) || s.caption) continue;
    const g = geometryOf(s);
    if (g.circle && g.points.length < 2) continue;
    const pts = g.points.map((p) => toUnits(s, p));
    const last = g.open || pts.length < 3 ? pts.length - 1 : pts.length;
    for (let i = 0; i < last; i++) consider(pts[i], pts[(i + 1) % pts.length]);
  }
  return angles;
}

/** Middle of the arc between two neighbouring cuts that contains `click`. */
function arcMidAngle(cuts: number[], click: number): number | null {
  const uniq: number[] = [];
  for (const raw of cuts) {
    const a = wrap360(raw);
    if (!uniq.some((u) => angGap(u, a) < 1.5)) uniq.push(a);
  }
  if (uniq.length < 2) return null;
  uniq.sort((p, q) => p - q);
  const c = wrap360(click);
  for (let i = 0; i < uniq.length; i++) {
    const start = uniq[i];
    const end = uniq[(i + 1) % uniq.length];
    const span = (end - start + 360) % 360 || 360;
    if ((c - start + 360) % 360 <= span + 1e-4) return wrap360(start + span / 2);
  }
  return null;
}

function markCircle(b: Builder, shapeId: string, click: number, shift: boolean, kind: 'tick' | 'arrow', n: number) {
  const shape = b.data.shapes.find((s) => s.id === shapeId) ?? fail('Click on the circle.');
  if (!geometryOf(shape).circle) fail('Click on the circle.');
  const mid = shift ? arcMidAngle(circleCutAngles(b.data, shape), click) : null;
  if (shift && mid === null) b.infos.push('No line cuts this circle, so the mark sits where you clicked.');
  const angle = mid ?? click;
  const old = b.data.marks.find((m) => m.kind === kind && 'circle' in m && m.circle === shapeId && angGap(m.angle, angle) < 6);
  if (old && 'n' in old) {
    b.removeMarks.push(old.id);
    if (old.n === n) {
      b.infos.push('Mark removed.');
      return;
    }
  }
  b.addMark({ id: uid(), kind, circle: shapeId, angle, n });
}

function onSeg(p: Vec, a: Vec, b: Vec, tol: number): number | null {
  const ab = vsub(b, a), l2 = vdot(ab, ab);
  if (l2 < 1e-18) return null;
  const k = vdot(vsub(p, a), ab) / l2;
  if (k < -1e-6 || k > 1 + 1e-6) return null;
  if (vlen(vsub(p, vadd(a, vmul(ab, k)))) > tol) return null;
  return Math.max(0, Math.min(1, k));
}
function enclosingSide(b: Builder, a: Ref, bRef: Ref): { a: Ref; b: Ref } {
  const A = b.pos(a), B = b.pos(bRef), tol = b.tol * 12;
  for (const s of b.data.shapes) {
    if ((s.axes||s.chart)) continue;
    const geo = geometryOf(s);
    if (geo.solid) {
      for (const e of geo.solid.edges) {
        const ra = { s: s.id, i: e.a }, rb = { s: s.id, i: e.b };
        const Pa = b.world.ref(ra), Pb = b.world.ref(rb);
        if (Pa && Pb && onSeg(A, Pa, Pb, tol) !== null && onSeg(B, Pa, Pb, tol) !== null) return { a: ra, b: rb };
      }
      continue;
    }
    if (geo.circle && geo.points.length < 2) continue;
    const last = geo.open || geo.points.length < 3 ? geo.points.length - 1 : geo.points.length;
    for (let i = 0; i < last; i++) {
      const ra = { s: s.id, i }, rb = { s: s.id, i: (i + 1) % geo.points.length };
      const Pa = b.world.ref(ra), Pb = b.world.ref(rb);
      if (Pa && Pb && onSeg(A, Pa, Pb, tol) !== null && onSeg(B, Pa, Pb, tol) !== null) return { a: ra, b: rb };
    }
  }
  return { a, b: bRef };
}
function fragmentOnSide(b: Builder, side: { a: Ref; b: Ref }, click: { a: Ref; b: Ref; k: number }): { a: Ref; b: Ref } {
  const S = b.pos(side.a), E = b.pos(side.b);
  const clickAt = vadd(b.pos(click.a), vmul(vsub(b.pos(click.b), b.pos(click.a)), click.k));
  const t = onSeg(clickAt, S, E, b.tol * 40) ?? 0.5;
  const pts: { ref: Ref; k: number }[] = [{ ref: side.a, k: 0 }, { ref: side.b, k: 1 }];
  for (const r of allPointRefs(b.data)) {
    const p = b.world.ref(r);
    if (!p) continue;
    const k = onSeg(p, S, E, b.tol * 8);
    if (k !== null && k > 1e-4 && k < 1 - 1e-4) pts.push({ ref: r, k });
  }
  pts.sort((x, y) => x.k - y.k);
  const uniq = pts.filter((p, i) => i === 0 || Math.abs(p.k - pts[i - 1].k) > 1e-4);
  for (let i = 0; i < uniq.length - 1; i++) if (t >= uniq[i].k - 1e-9 && t <= uniq[i + 1].k + 1e-9) return { a: uniq[i].ref, b: uniq[i + 1].ref };
  return side;
}

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

function sameLine(b: Builder, a1: Ref, b1: Ref, a2: Ref, b2: Ref): boolean {
  const spatial=[a1,b1,a2,b2].map(r=>spatialRef(b.data,r));
  if(spatial.some(Boolean)){
    if(spatial.some(p=>!p)||new Set(spatial.map(p=>p?.owner)).size!==1)return false;
    const [a,b1p,c,d]=spatial.map(p=>p!.position),eq=(u:Vec3,v:Vec3)=>length3(sub3(u,v))<b.tol;
    return eq(a,c)&&eq(b1p,d)||eq(a,d)&&eq(b1p,c);
  }
  const p = [a1, b1, a2, b2].map((r) => b.world.ref(r));
  if (p.some((x) => !x)) return false;
  const t = b.tol;
  const eq = (u: Vec, v: Vec) => vlen(vsub(u, v)) < t;
  const [A1, B1, A2, B2] = p as Vec[];
  return (eq(A1, A2) && eq(B1, B2)) || (eq(A1, B2) && eq(B1, A2));
}

const isCrossing = (t: Target) => t.kind === 'circles' || (t.kind === 'line' && !!t.via);
export function stepAccepts(step: StepKind, t: Target): boolean {
  switch (step) {
    case 'point':
      return t.kind === 'point' || isCrossing(t);
    case 'line':
      return t.kind === 'line';
    case 'circle':
      return t.kind === 'circle';
    case 'lineOrCircle':
      return t.kind === 'line' || t.kind === 'circle' || t.kind === 'point' || isCrossing(t);
    case 'lineOrPoint':
      return t.kind==='line'||t.kind==='point'||isCrossing(t);
    case 'pointOrCanvas':
      return t.kind==='point'||t.kind==='line'||t.kind==='free'||t.kind==='world'||t.kind==='circles';
    case 'canvas':
      return t.kind === 'free' || t.kind === 'world' || isCrossing(t);
  }
}

export function stepHint(step: StepKind): string {
  switch (step) {
    case 'point':
      return 'Click a point, or a highlighted intersection.';
    case 'line':
      return 'Click a side or a drawn line.';
    case 'circle':
      return 'Click on the circle.';
    case 'lineOrCircle':
      return 'Click on a side, a circle, or a highlighted intersection.';
    case 'lineOrPoint':
      return 'Click a point or a position on a line.';
    case 'pointOrCanvas':
      return 'Click a point, a highlighted intersection, or an empty spot.';
    case 'canvas':
      return 'Click a highlighted intersection, or an empty spot of the figure.';
  }
}

export const GLOBAL_TOOLS = ['draw-force', 'segment', 'force-line', 'rel-point', 'draw-arc', 'polyline', 'polyline-curve'];
/** Line / Force / circular / polyline tiles in Shapes → Lines (not listed again under Constructions). */
export const SHAPE_LINE_TOOLS = ['segment', 'draw-force', 'draw-arc', 'polyline', 'polyline-curve'];
