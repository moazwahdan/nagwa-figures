import { validateAxes } from './axes';
import { validateChart } from './charts';
import { useStore } from './store';
import { geometryOf } from './scene';
import { SHAPE_DEFS } from './shapes2d';
import type { ProjectSettings, SceneData } from './types';
import { buildWorld, ownerOfDef, spatialDef, spatialRef } from './world';
import { migrateMathDelimiters } from './qmsMath';

export const AUTOSAVE_KEY = 'nagwa-figure-studio.project.v1';
export interface ProjectDocument {
  format: 'nagwa-figure-studio'; version: 1; scene: SceneData;
  settings: ProjectSettings;
}
export function projectSettingsOf(s: { fileName: string; theme: 'light' | 'dark'; lockAll: boolean; separateLabels: boolean }): ProjectSettings {
  return { fileName: s.fileName, theme: s.theme, lockAll: s.lockAll, separateLabels: s.separateLabels };
}
export function documentFor(scene: SceneData, settings: ProjectSettings): ProjectDocument {
  return { format: 'nagwa-figure-studio', version: 1, scene, settings };
}
export function currentProject(): ProjectDocument {
  const s = useStore.getState();
  const scene: SceneData = { canvas: s.canvas, shapes: s.shapes, points: s.points, lines: s.lines, marks: s.marks, style: s.style, viewScale: s.viewScale };
  return documentFor(scene, projectSettingsOf(s));
}
/** Main workspace stays authoritative while the custom editor owns the canvas. */
export function drawingProject():ProjectDocument {
  const s=useStore.getState();
    if((s.workspaceMode==='custom')&&s.drawingBackup)return documentFor(s.drawingBackup.scene, projectSettingsOf(s.drawingBackup.settings));
  return currentProject();
}
export function projectText() { return JSON.stringify(currentProject(), null, 2); }
export function parseProjectText(text: string): ProjectDocument {
  if (text.length > 5_000_000) throw new Error('Project exceeds 5 MB.');
  const p = JSON.parse(text);
  const fail = () => { throw new Error('Invalid or unsupported Figure Studio project.'); };
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7;
  const vec = (v: any) => v && finite(v.x) && finite(v.y);
  const nudges = (v: any, shape = false) => v === undefined || (v && Object.entries(v).every(([k, n]) => (k === 'ar' || k === 'en') && (shape ? n && Object.values(n).every(vec) : vec(n))));
  if (p?.format !== 'nagwa-figure-studio' || p.version !== 1) fail();
  const d = p.scene, o = p.settings;
  if (!d || !o || typeof o.fileName !== 'string' || !['light', 'dark'].includes(o.theme) || typeof o.lockAll !== 'boolean' || typeof o.separateLabels !== 'boolean') fail();
  delete o.unit; delete o.lengthRange; delete p.measures;
  if (!d.canvas || !finite(d.canvas.w) || !finite(d.canvas.h) || d.canvas.w < 1 || d.canvas.h < 1 || d.canvas.w > 4000 || d.canvas.h > 4000 || !finite(d.viewScale) || d.viewScale <= 0) fail();
  if (![d.shapes, d.points, d.lines, d.marks].every(a => Array.isArray(a) && a.length <= 1000)) fail();
  const ids = new Set<string>();
  for (const a of [d.shapes, d.points, d.lines, d.marks]) for (const item of a) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id)) fail();
    ids.add(item.id);
  }
  const ref = (r: any) => r && ((typeof r.s === 'string' && Number.isInteger(r.i) && r.i >= 0) || typeof r.c === 'string' || typeof r.p === 'string');
  for (const s of d.shapes) {
    if (s.symbol !== undefined || s.clip !== undefined || (typeof s.defId === 'string' && s.defId.startsWith('uploaded-'))) throw new Error('This file contains symbols or picture stamps. They are no longer supported, so the file was not opened.');
    const def = SHAPE_DEFS.find(x => x.id === s.defId);
    if (!def || !s.params || !def.params.every(p => finite(s.params[p.key]) && s.params[p.key] >= p.min && s.params[p.key] <= p.max && (!p.options || p.options.some(o => o.value === s.params[p.key])))) fail();
    if (!SHAPE_DEFS.find(x => x.id === s.defId) || !s.params || !Object.values(s.params).every(finite) || !vec(s.offset) || !finite(s.rotation) || !finite(s.scale) || s.scale <= 0 || (s.scaleX !== undefined && (!finite(s.scaleX) || s.scaleX <= 0)) || (s.scaleY !== undefined && (!finite(s.scaleY) || s.scaleY <= 0)) || !Array.isArray(s.names) || !s.names.every((n: unknown) => typeof n === 'string') || !['upper','lower'].includes(s.caseMode) || !s.center || typeof s.center.name !== 'string' || typeof s.center.show !== 'boolean' || !s.nudge || !Object.values(s.nudge).every(vec) || !nudges(s.nudgeByLang, true)) fail();
    for(const k of ['color','fillColor'])if(s[k]!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(s[k]))fail();
    if(s.hideSplitRightMarks!==undefined&&typeof s.hideSplitRightMarks!=='boolean')fail();
    if(def?.kind==='axes')validateAxes(s);
    else if(s.axes!==undefined)fail();
    if(def?.kind==='chart')validateChart(s.chart);
    else if(s.chart!==undefined)fail();
    if(def?.kind==='caption'){
      const c=s.caption;
      if(!c||typeof c.ar!=='string'||typeof c.en!=='string'||c.ar.length>4000||c.en.length>4000)fail();
      c.ar = migrateMathDelimiters(c.ar);
      c.en = migrateMathDelimiters(c.en);
    } else if(s.caption!==undefined)fail();
    if (s.sit !== undefined && (!vec(s.sit.at) || !vec(s.sit.along))) fail();
    if (s.path !== undefined) {
      if (!Array.isArray(s.path) || s.path.length < 2 || s.path.length > 20 || !s.path.every(vec)) fail();
      if (s.pathClosed !== undefined && typeof s.pathClosed !== 'boolean') fail();
      if (s.pathCurved !== undefined && typeof s.pathCurved !== 'boolean') fail();
      if (s.pathDashed !== undefined && typeof s.pathDashed !== 'boolean') fail();
    } else if (s.pathClosed !== undefined || s.pathCurved !== undefined || s.pathDashed !== undefined) fail();
    if (def?.id === 'free-poly' && (!s.path || s.path.length < 2)) fail();
    if (def?.kind === 'solid') {
      const solid = s.solid;
      if (!solid || !['cabinet', 'orthographic'].includes(solid.projection) || !finite(solid.angle) || solid.angle < 5 || solid.angle > 80 || !finite(solid.depth) || solid.depth < 0.1 || solid.depth > 1 || !finite(solid.yaw) || Math.abs(solid.yaw) > 360) fail();
      for (const k of ['showHidden', 'showHeight', 'showRadius', 'showDiagonal']) if (typeof solid[k] !== 'boolean') fail();
      for (const k of ['height', 'radius', 'diagonal']) if (!solid.labels?.[k] || typeof solid.labels[k].text !== 'string' || typeof solid.labels[k].unit !== 'boolean') fail();
      const geometry = geometryOf(s);
      if (s.names.length !== geometry.points.length || s.sides.length !== geometry.solid?.edges.length || !geometry.solid?.bounds.every(vec)) fail();
    } else if (s.solid !== undefined) fail();
    for (const k of ['flipX','flipY','showVertexLabels','showVertexDots','showRightMarks','locked']) if (typeof s[k] !== 'boolean') fail();
    if (!Array.isArray(s.sides) || !s.sides.every((x: any) => typeof x.text === 'string' && typeof x.unit === 'boolean') || !Array.isArray(s.angles) || !s.angles.every((x: any) => typeof x.text === 'string' && typeof x.show === 'boolean' && typeof x.arc === 'boolean')) fail();
  }
  const defs: Record<string, string[]> = { local: ['shape','x','y'], world: ['x','y'], ratio: ['a','b','k'], offset: ['from','angle','dist'], rayHit: ['from','angle','shape'], bisectHit: ['v','a','b','shape'], dirHit: ['from','a','b','mode','sign','shape'], foot: ['from','a','b'], perpAt: ['at','toward','dist'], cross: ['a','b','c','d'], lineCircle: ['a','b','shape','which'], circs: ['shape','other','which'], circ: ['shape','angle'] };
  for (const pt of d.points) {
    const f = pt.def;
    if (f?.plane !== undefined && !['xy','xz','yz'].includes(f.plane)) fail();
    if (f?.z !== undefined && (f.t !== 'local' || !finite(f.z))) fail();
    if (typeof pt.name !== 'string' || (pt.nameAr !== undefined && (typeof pt.nameAr !== 'string' || pt.nameAr.length > 32)) || typeof pt.showLabel !== 'boolean' || typeof pt.dot !== 'boolean' || !f || !defs[f.t] || !nudges(pt.nudgeByLang) || (pt.nudge !== undefined && !vec(pt.nudge))) fail();
    if(pt.anchor!==undefined&&!['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'].includes(pt.anchor))fail();
    for (const k of defs[f.t]) {
      if (['a','b','c','d','from','v','at','toward'].includes(k) ? !ref(f[k]) : k === 'shape' || k === 'other' ? typeof f[k] !== 'string' : k === 'mode' ? !['par','perp'].includes(f[k]) : k === 'sign' ? ![1,-1].includes(f[k]) : k === 'which' ? ![0,1].includes(f[k]) : !finite(f[k])) fail();
    }
  }
  for (const p of d.points) {
    if (p.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(p.color)) fail();
    if (p.circled !== undefined && typeof p.circled !== 'boolean') fail();
  }
  for (const l of d.lines) {
    if (!ref(l.a) || !ref(l.b) || typeof l.dashed !== 'boolean' || !l.label || typeof l.label.text !== 'string' || typeof l.label.unit !== 'boolean' || !nudges(l.nudgeByLang) || (l.nudge !== undefined && !vec(l.nudge))) fail();
    if(l.curve!==undefined&&l.curve!=='arc'&&l.curve!=='spline')fail();
    if(l.curve==='arc'&&(![.25,.5,.75].includes(l.arcFraction)||![1,-1].includes(l.arcSide)))fail();
    if(l.via!==undefined&&(!Array.isArray(l.via)||l.via.length>80||!l.via.every(ref)))fail();
    if(l.arrow!==undefined&&!['none','start','end','both','middle'].includes(l.arrow))fail();
    if(l.weight!==undefined&&(!finite(l.weight)||l.weight<.5||l.weight>4))fail();
    if(l.kind!==undefined&&l.kind!=='force')fail();
    if(l.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(l.color))fail();
    if(l.vec!==undefined&&typeof l.vec!=='boolean')fail();
    if(l.labelPos!==undefined&&!['end','middle','start'].includes(l.labelPos))fail();
    if(l.labelSide!==undefined&&l.labelSide!==1&&l.labelSide!==-1)fail();
    if(l.symbol!==undefined&&!/^(none|F([1-9]|1\d|20)?|[A-Z]|c:[^|]{0,8}\|[^|]{0,8})$/.test(l.symbol))fail();
  }
  for (const m of d.marks) {
    if (!['right','angle','tick','arrow','attachment'].includes(m.kind)) fail();
    const onCircle = (m.kind === 'tick' || m.kind === 'arrow') && 'circle' in m;
    if (onCircle) {
      if (typeof m.circle !== 'string' || !d.shapes.some((s: { id: string }) => s.id === m.circle) || !finite(m.angle) || !Number.isInteger(m.n) || m.n < 1 || m.n > 10) fail();
      continue;
    }
    if (!ref(m.a) || !ref(m.b)) fail();
    if((m.kind==='right'||m.kind==='angle')&&!ref(m.at))fail();
    if(m.kind==='angle'&&(typeof m.text!=='string'||m.text.length>20||(m.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(m.color))||(m.fill!==undefined&&typeof m.fill!=='boolean')||(m.size!==undefined&&(!finite(m.size)||m.size<0.4||m.size>6))))fail();
    if((m.kind==='tick'||m.kind==='arrow')&&(!Number.isInteger(m.n)||m.n<1||m.n>10))fail();
    if(m.kind==='attachment'&&(!ref(m.at)||!['wall','hinge','particle','block'].includes(m.item)||![1,-1].includes(m.side)||(m.size!==undefined&&(!finite(m.size)||m.size<0.4||m.size>20))))fail();
  }
  if (!d.style) fail();
  for (const k of ['stroke','fontSize','markSize','arcRadius','dotRadius','fill']) if (!finite(d.style[k]) || d.style[k] <= 0) fail();
  for (const k of ['dAsHamza','italicLetters']) if (typeof d.style[k] !== 'boolean') fail();
  if (d.style.arabicTatweel !== undefined && typeof d.style.arabicTatweel !== 'boolean') fail();
  if (d.style.alefForm !== undefined && d.style.alefForm !== 'hamza' && d.style.alefForm !== 'loop') fail();
  if (d.style.arabicTatweel === undefined) d.style.arabicTatweel = false;
  if (d.style.alefForm === undefined) d.style.alefForm = 'hamza';
  // Resolve every reference before touching the current project (also rejects cycles).
  try {
    const w = buildWorld(d);
    for (const pt of d.points) {
      if (!w.ref({ p: pt.id })) fail();
      const owner = d.shapes.find((s: { id: string }) => s.id === ownerOfDef(d, pt.def));
      if (owner?.solid && !spatialDef(d, pt.def)) fail();
      if (pt.def.t === 'ratio' && (spatialRef(d, pt.def.a) || spatialRef(d, pt.def.b)) && !spatialDef(d, pt.def)) fail();
    }
    for (const line of d.lines) {
      const a = spatialRef(d, line.a), b = spatialRef(d, line.b);
      if ((a || b) && (!a || !b || a.owner !== b.owner)) fail();
    }
    for (const mark of d.marks) {
      if ((mark.kind === 'tick' || mark.kind === 'arrow') && 'circle' in mark) continue;
      const refs = mark.kind === 'right'||mark.kind==='angle'||mark.kind==='attachment' ? [mark.at, mark.a, mark.b] : [mark.a, mark.b];
      const spatial = refs.map(r => spatialRef(d, r));
      if (spatial.some(Boolean) && (spatial.some(p => !p) || new Set(spatial.map(p => p?.owner)).size !== 1)) fail();
    }
    for (const line of d.lines) if (!w.ref(line.a) || !w.ref(line.b)) fail();
    for (const mark of d.marks) {
      if ((mark.kind === 'tick' || mark.kind === 'arrow') && 'circle' in mark) continue;
      if (!w.ref(mark.a) || !w.ref(mark.b) || ((mark.kind === 'right' || mark.kind === 'angle' || mark.kind === 'attachment') && !w.ref(mark.at))) fail();
    }
  } catch { fail(); }
  return { format: 'nagwa-figure-studio', version: 1, scene: d, settings: o };
}

export function loadProjectText(text: string) { const p = parseProjectText(text); useStore.getState().loadProject(p.scene, p.settings); }

const SVG_TAG = /<svg\b[^>]*>/;
const SVG_META = /<metadata id="nagwa-figure-studio">([A-Za-z0-9+/=]+)<\/metadata>/;
const toB64 = (s: string) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const fromB64 = (s: string) => { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); };
/** Stores the whole project inside the SVG, so the site can reopen its own images. */
export function embedProjectInSvg(svg: string, doc: ProjectDocument): string {
  if (!SVG_TAG.test(svg)) throw new Error('Not an SVG image.');
  return svg.replace(SVG_TAG, (m) => `${m}<metadata id="nagwa-figure-studio">${toB64(JSON.stringify(doc))}</metadata>`);
}
/** Returns the project text of an SVG made by this site; rejects every other SVG. */
export function projectTextFromSvg(svg: string): string {
  const m = SVG_META.exec(svg);
  if (!m) throw new Error('This SVG was not made by Figure Studio, so it cannot be opened.');
  try { return fromB64(m[1]); } catch { throw new Error('This SVG was not made by Figure Studio, so it cannot be opened.'); }
}
/** Accepts only a Figure Studio .json or a Figure Studio .svg. Everything else is rejected. */
export function workspaceTextFromFile(name: string, text: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.svg')) return projectTextFromSvg(text);
  if (n.endsWith('.json')) return text;
  throw new Error('Only Figure Studio .json or .svg files can be opened.');
}
