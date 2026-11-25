import { axisTick, unprojectAxes, projectAxes } from '../core/axes';
import { pickAxisCoordinate } from '../core/axisActions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cardinalGuide, extraGuideAngles, snapTargetToGuides, targetScenePos } from '../core/angleSnap';
import { fromUnits, geometryOf, toUnits, placeShape, shapeForLang } from '../core/scene';
import { useStore } from '../core/store';
import { GLOBAL_TOOLS, SHAPE_LINE_TOOLS, TOOL_BY_ID, stepAccepts, type Target } from '../core/tools';
import type { Lang, Ref, SceneData } from '../core/types';
import { buildWorld, findExisting, fromPx, toPx } from '../core/world';
import { SceneSvg, boundsPx } from './SceneSvg';
import { layoutCaption } from '../core/figureLatex';
import { inkBoundsPx } from '../core/crop';
import { CROP_PAD_PT, ptToPx } from '../core/paper';
import { circularPoint, unprojectPlane } from '../core/spatial';
import { projector, solidSettings } from '../core/shapes3d';

type Vec = { x: number; y: number };
type Drag =
  | { mode: 'move'; id: string; start: Vec; off: Vec; shift0: { ar?: Vec; en?: Vec } }
  | { mode: 'scale'; id: string; dist0: number; scale0: number; scaleX0: number; scaleY0: number; center: Vec; start: Vec; ok?: { scale: number; scaleX: number; scaleY: number } }
  | { mode: 'rotate'; id: string; angle0: number; rotation0: number; center: Vec }
  | { mode: 'label'; id: string; key: string; start: Vec; nudge: Vec }
  | { mode: 'conLabel'; kind: 'point' | 'line'; id: string; start: Vec; nudge: Vec };

const DRAG_THRESHOLD_PX = 5; // screen pixels the pointer must travel before anything moves

const INTERSECTION_PX = 12;

function markTarget(el: Element): Target | null {
  const kind = el.getAttribute('data-xmark');
  if (kind === 'cc') {
    const shape = el.getAttribute('data-shape') ?? '';
    const other = el.getAttribute('data-other') ?? '';
    const which = Number(el.getAttribute('data-which'));
    const x = Number(el.getAttribute('data-x')), y = Number(el.getAttribute('data-y'));
    if (!shape || !other || (which !== 0 && which !== 1) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { kind: 'circles', shape, other, which, x, y };
  }
  const a = parseRef(el.getAttribute('data-a')), b = parseRef(el.getAttribute('data-b'));
  const k = Number(el.getAttribute('data-k'));
  if (!a || !b || !Number.isFinite(k)) return null;
  if (kind === 'xc') {
    const circle = el.getAttribute('data-circle') ?? '';
    const which = Number(el.getAttribute('data-which'));
    return circle && (which === 0 || which === 1) ? { kind: 'line', a, b, k, via: { circle, which } } : null;
  }
  if (kind === 'x') {
    const c = parseRef(el.getAttribute('data-c')), d = parseRef(el.getAttribute('data-d'));
    return c && d ? { kind: 'line', a, b, k, via: { a: c, b: d } } : null;
  }
  return null;
}

function nearestHotPoint(root: HTMLElement | null, p: Vec): Vec | null {
  const svg = root?.querySelector('svg');
  if (!svg) return null;
  let bestD = Infinity;
  let best: Vec | null = null;
  const consider = (el: Element) => {
    const x = Number(el.getAttribute('cx')), y = Number(el.getAttribute('cy'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= INTERSECTION_PX && d < bestD) {
      bestD = d;
      best = { x, y };
    }
  };
  for (const el of svg.querySelectorAll('.hot-pt, [data-xmark]')) consider(el);
  return best;
}

function nearestMark(root: HTMLElement | null, p: Vec): { d: number; el: Element; target: Target } | null {
  const svg = root?.querySelector('svg');
  if (!svg) return null;
  let best: { d: number; el: Element; target: Target } | null = null;
  for (const el of svg.querySelectorAll('[data-xmark]')) {
    const d = Math.hypot(p.x - Number(el.getAttribute('cx')), p.y - Number(el.getAttribute('cy')));
    const target = d <= INTERSECTION_PX ? markTarget(el) : null;
    if (target && (!best || d < best.d)) best = { d, el, target };
  }
  return best;
}

function parseRef(s: string | null): Ref | null {
  if (!s) return null;
  try {
    const r = JSON.parse(s);
    if (r && typeof r === 'object' && ('s' in r || 'c' in r || 'p' in r)) return r as Ref;
  } catch {
    /* ignore */
  }
  return null;
}

export function Preview({ lang, zoom = 1 }: { lang: Lang; zoom?: number }) {
  const canvas = useStore((s) => s.canvas);
  const shapes = useStore((s) => s.shapes);
  const points = useStore((s) => s.points);
  const lines = useStore((s) => s.lines);
  const marks = useStore((s) => s.marks);
  const style = useStore((s) => s.style);
  const viewScale = useStore((s) => s.viewScale);
  const selectedId = useStore((s) => s.selectedId);
  const lockAll = useStore((s) => s.lockAll);
  const tool = useStore((s) => s.tool);
  const axesTool = useStore(s=>s.axesTool);
  const picks = useStore((s) => s.picks);
  const data: SceneData = { canvas, shapes, points, lines, marks, style, viewScale };
  const crop = useStore((s) => s.langView?.[lang] ?? null);

  const cell = useRef<HTMLDivElement>(null);
  const svgWrap = useRef<HTMLDivElement>(null);
  const drag = useRef<(Drag & { started: boolean; client: Vec; pointerId:number }) | null>(null);
  const stopDrag=useCallback(()=>{const d=drag.current;drag.current=null;const frame=svgWrap.current;if(d&&frame?.hasPointerCapture(d.pointerId))frame.releasePointerCapture(d.pointerId);},[]);
  useEffect(()=>{
    const release=(e:PointerEvent)=>{if(drag.current?.pointerId===e.pointerId)stopDrag();};
    const hidden=()=>{if(document.hidden)stopDrag();};
    window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);window.addEventListener('blur',stopDrag);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true);window.removeEventListener('blur',stopDrag);document.removeEventListener('visibilitychange',hidden);stopDrag();};
  },[stopDrag]);
  const [box, setBox] = useState({ w: 300, h: 400 });

  useEffect(() => {
    const el = cell.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const margin = zoom > 1 ? 48 : 8;
      const cw = crop?.w ?? canvas.w, ch = crop?.h ?? canvas.h;
      const k = Math.min((el.clientWidth - margin) / cw, (el.clientHeight - margin) / ch);
      setBox({ w: Math.max(80, cw * k * zoom), h: Math.max(80, ch * k * zoom) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvas.w, canvas.h, zoom, crop?.w, crop?.h]);

  const toSvg = (e: React.PointerEvent | React.MouseEvent): Vec => {
    const svg = svgWrap.current!.querySelector('svg')!;
    const m = svg.getScreenCTM()!.inverse();
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(m);
    return { x: r.x, y: r.y };
  };

  /** Turn a click into a pick target for the active construction tool. */
  const targetFrom = (e: React.PointerEvent, st: ReturnType<typeof useStore.getState>): Target | null => {
    const data: SceneData = { canvas: st.canvas, shapes: st.shapes, points: st.points, lines: st.lines, marks: st.marks, style: st.style, viewScale: st.viewScale };
    const world = buildWorld(data);
    const P = (r: Ref): Vec | null => {
      const u = world.ref(r);
      return u ? toPx(data, u) : null;
    };
    const p = toSvg(e);
    const hotEl = (e.target as Element).closest('[data-hot]');
    const kind = hotEl?.getAttribute('data-hot');
    const toolDef = st.tool ? TOOL_BY_ID[st.tool] : null;
    const step = toolDef ? toolDef.steps[Math.min(st.picks.length, toolDef.steps.length - 1)] : null;
    const mark = nearestMark(svgWrap.current, p);
    const pointDist = hotEl && (kind === 'p' || kind === 'snap')
      ? Math.hypot(p.x - Number(hotEl.getAttribute('cx')), p.y - Number(hotEl.getAttribute('cy')))
      : Infinity;
    if (mark && step && mark.d < pointDist) {
      if (step === 'circle') {
        const prefer = kind === 'c' ? hotEl?.getAttribute('data-shape') : null;
        const shape = mark.target.kind === 'line' && mark.target.via && 'circle' in mark.target.via
          ? mark.target.via.circle
          : mark.target.kind === 'circles'
            ? (prefer === mark.target.other ? mark.target.other : mark.target.shape)
            : null;
        const s = shape ? st.shapes.find((x) => x.id === shape) : undefined;
        const c = s && !s.solid ? placeShape(s, st.viewScale, st.canvas).circle : undefined;
        if (s && c) {
          const mx = Number(mark.el.getAttribute('cx')), my = Number(mark.el.getAttribute('cy'));
          const angle = (Math.atan2(-(my - c.c.y), mx - c.c.x) * 180) / Math.PI - s.rotation;
          return { kind: 'circle', shape: s.id, angle };
        }
      } else if (stepAccepts(step, mark.target)) return mark.target;
    }
    if (hotEl && kind === 'p') {
      const ref = parseRef(hotEl.getAttribute('data-ref'));
      return ref && world.ref(ref) ? { kind: 'point', ref } : null;
    }
    if (hotEl && (kind === 'x' || kind === 'xc')) {
      const a = parseRef(hotEl.getAttribute('data-a')), b = parseRef(hotEl.getAttribute('data-b'));
      const k = Number(hotEl.getAttribute('data-k'));
      if (!a || !b || !Number.isFinite(k) || !world.ref(a) || !world.ref(b)) return null;
      if (kind === 'xc') {
        const shape = hotEl.getAttribute('data-circle') ?? '';
        const which = Number(hotEl.getAttribute('data-which'));
        return shape && (which === 0 || which === 1) ? { kind: 'line', a, b, k, via: { circle: shape, which } } : null;
      }
      const c = parseRef(hotEl.getAttribute('data-c')), d = parseRef(hotEl.getAttribute('data-d'));
      return c && d && world.ref(c) && world.ref(d) ? { kind: 'line', a, b, k, via: { a: c, b: d } } : null;
    }
    if (hotEl && kind === 'l') {
      const a = parseRef(hotEl.getAttribute('data-a'));
      const b = parseRef(hotEl.getAttribute('data-b'));
      const pa = a && P(a);
      const pb = b && P(b);
      if (!a || !b || !pa || !pb) return null;
      const stored = Number(hotEl.getAttribute('data-k'));
      if (Number.isFinite(stored)) return { kind: 'line', a, b, k: stored };
      const ab = { x: pb.x - pa.x, y: pb.y - pa.y };
      const k = ((p.x - pa.x) * ab.x + (p.y - pa.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1);
      return { kind: 'line', a, b, k: Math.max(0, Math.min(1, k)) };
    }
    if (hotEl && kind === 'snap') {
      const shape = hotEl.getAttribute('data-shape') ?? '';
      const x = Number(hotEl.getAttribute('data-x')), y = Number(hotEl.getAttribute('data-y'));
      const s = st.shapes.find((q) => q.id === shape);
      if (!s || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      const scene = toUnits(s, { x, y });
      const existing = findExisting(world, scene);
      if (existing) return { kind: 'point', ref: existing };
      return { kind: 'free', shape: s.id, x, y };
    }
    if (hotEl && kind === 'c') {
      const s = st.shapes.find((x) => x.id === hotEl.getAttribute('data-shape'));
      if (!s) return null;
      if(s.solid){
        const rim=circularPoint(s,0);if(!rim)return null;
        const local=fromUnits(s,fromPx(data,p)),base=projector(solidSettings(s.solid)).project({x:0,y:rim.y,z:0});
        const q=unprojectPlane(s,{x:local.x-base.x,y:local.y-base.y},'xz');
        return q?{kind:'circle',shape:s.id,angle:Math.atan2(q.z,q.x)*180/Math.PI}:null;
      }
      const supplied=hotEl.getAttribute('data-angle');
      if (supplied!==null) return { kind: 'circle', shape: s.id, angle: Number(supplied) };
      const local = fromUnits(s, fromPx(data, p));
      const geo = geometryOf(s);
      const ang = Math.atan2(local.y - (geo.circle?.cy ?? 0), local.x - (geo.circle?.cx ?? 0)) * 180 / Math.PI;
      return { kind: 'circle', shape: s.id, angle: ang };
    }
    const u = fromPx(data, p);
    if (st.tool && SHAPE_LINE_TOOLS.includes(st.tool)) return { kind: 'world', x: u.x, y: u.y };
    // free click: attach to the selected shape (or the first one)
    const hitShape=(e.target as Element).closest('[data-shape-id]')?.getAttribute('data-shape-id');
    const s = st.shapes.find((x) => x.id === hitShape) ?? st.shapes.find((x) => x.id === st.selectedId) ?? st.shapes[0];
    if (!s || s.axes) {
      return { kind: 'world', x: u.x, y: u.y };
    }
    const l = fromUnits(s, fromPx(data, p));
    return { kind: 'free', shape: s.id, x: l.x, y: l.y };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const st = useStore.getState();

    if(st.axesTool){
      const t=st.axesTool,s=st.shapes.find(s=>s.id===t.shape);if(!s?.axes)return;
      try{
        const p=toSvg(e),local=fromUnits(s,fromPx(st,p));
        const svg=svgWrap.current!.querySelector('svg')!,matrix=svg.getScreenCTM()!;
        const near=s.axes.points.map(q=>{const v=toPx(st,toUnits(s,projectAxes(q.at,s.axes!)));return {q,dist:Math.hypot(v.x-p.x,v.y-p.y)*Math.hypot(matrix.a,matrix.b)};}).filter(q=>q.dist<10).sort((a,b)=>a.dist-b.dist);
        if(near.length>1&&Math.abs(near[0].dist-near[1].dist)<2)throw new Error('These points overlap in this view. Change the front view or enter coordinates.');
        const at=near[0]?.q.at??unprojectAxes(local,s.axes,t.plane,t.level);
        const q={...at};if(s.axes.grid&&!near.length){const sx=axisTick(s.axes,'x').spacing,sy=axisTick(s.axes,'y').spacing;q.x=Math.round(q.x/sx)*sx;q.y=Math.round(q.y/sy)*sy;}
        pickAxisCoordinate(q);
      }catch(error){st.notify('error',(error as Error).message);}return;
    }
    if (st.tool) {
      if (!st.shapes.length && !GLOBAL_TOOLS.includes(st.tool)) return st.notify('error', 'Add a shape first.');
      st.setToolOpts({ shift: e.shiftKey });
      let t = targetFrom(e, st);
      const snapTools = GLOBAL_TOOLS.includes(st.tool);
      const data: SceneData = { canvas: st.canvas, shapes: st.shapes, points: st.points, lines: st.lines, marks: st.marks, style: st.style, viewScale: st.viewScale };
      if (e.shiftKey && snapTools && st.picks.length === 1 && t && (t.kind === 'free' || t.kind === 'world')) {
        t = snapTargetToGuides(data, st.picks[0], t, extraGuideAngles(data, st.picks[0]));
      }
      if (t) st.pickTarget(t);
      return;
    }

    const target = e.target as Element;
    const p = toSvg(e);
    const handle = target.closest('[data-handle]');
    const labelEl = target.closest('[data-label-key]');
    const conEl = target.closest('[data-con]');
    let shapeEl = target.closest('[data-shape-id]');
    // A text's hit rectangle must only catch clicks that are really on the text box. Outside it the click is on empty
    // canvas (so it deselects) even when the browser reports the transparent rectangle under the pointer.
    const insideBox = (el: Element) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    if (shapeEl && shapeEl.parentElement?.hasAttribute('data-caption') && !insideBox(shapeEl)) {
      // the transparent rectangle the browser reported is not really under the pointer: look at what else is there
      shapeEl = null;
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const cand = el.closest('[data-shape-id]');
        if (!cand || !svgWrap.current?.contains(cand)) continue;
        if (cand.parentElement?.hasAttribute('data-caption') && !insideBox(cand)) continue;
        shapeEl = cand;
        break;
      }
    }
    const client = { x: e.clientX, y: e.clientY };
    let d: Drag | null = null;

    const labelLocked = (el: Element) => el.getAttribute('data-locked') === '1';
    const lockMsg = () => st.notify('info', 'Labels are locked so nothing moves by accident. Use the 🔒 button in the top bar (or this shape\'s lock) to unlock.');

    if (handle && st.selectedId) {
      const s = st.shapes.find((x) => x.id === st.selectedId)!;
      const center = placeShape(shapeForLang(s, lang), st.viewScale, st.canvas).center;
      if(handle.getAttribute('data-handle')==='rotate'){
        d={mode:'rotate',id:s.id,angle0:Math.atan2(-(p.y-center.y),p.x-center.x)*180/Math.PI,rotation0:s.rotation,center};
      }else d = { mode: 'scale', id: s.id, dist0: Math.max(Math.hypot(p.x - center.x, p.y - center.y), 1), scale0: s.scale, scaleX0: s.scaleX ?? 1, scaleY0: s.scaleY ?? 1, center, start: p };
    } else if (conEl) {
      if (labelLocked(conEl)) return lockMsg();
      const [kind, id] = (conEl.getAttribute('data-con') ?? '').split(':');
      const item = kind === 'point' ? st.points.find((x) => x.id === id) : st.lines.find((x) => x.id === id);
      if (!item || (kind !== 'point' && kind !== 'line')) return;
      d = { mode: 'conLabel', kind, id, start: p, nudge: item.nudge ?? { x: 0, y: 0 } };
    } else if (labelEl && shapeEl) {
      const id = shapeEl.getAttribute('data-shape-id')!;
      const key = labelEl.getAttribute('data-label-key')!;
      st.select(id);
      if (labelLocked(labelEl)) return lockMsg();
      const s = st.shapes.find((x) => x.id === id)!;
      d = { mode: 'label', id, key, start: p, nudge: s.nudge[key] ?? { x: 0, y: 0 } };
    } else if (shapeEl) {
      const id = shapeEl.getAttribute('data-shape-id')!;
      const s = st.shapes.find((x) => x.id === id)!;
      st.select(id);
      if (e.altKey) {
        const center = placeShape(shapeForLang(s, lang), st.viewScale, st.canvas).center;
        d = { mode: 'rotate', id: s.id, angle0: Math.atan2(-(p.y - center.y), p.x - center.x) * 180 / Math.PI, rotation0: s.rotation, center };
      } else d = { mode: 'move', id, start: p, off: { ...s.offset }, shift0: { ar: s.langShift?.ar, en: s.langShift?.en } };
    } else {
      st.select(null);
      return;
    }
    drag.current = { ...d, started: false, client, pointerId:e.pointerId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const hover = useRef<Vec | null>(null);
  const [guide, setGuide] = useState<{ originPx: Vec; tipPx: Vec; rays: { angle: number; tip: Vec }[]} | null>(null);
  const refreshGuide = useCallback((shift: boolean) => {
    const st = useStore.getState();
    const p = hover.current;
    const snapTools = !!st.tool && GLOBAL_TOOLS.includes(st.tool);
    if (!p || !st.tool || !st.picks.length) { setGuide(null); return; }
    const data: SceneData = { canvas: st.canvas, shapes: st.shapes, points: st.points, lines: st.lines, marks: st.marks, style: st.style, viewScale: st.viewScale };
    const last = st.picks[st.picks.length - 1];
    const origin = targetScenePos(data, last);
    if (!origin) { setGuide(null); return; }
    const originPx = toPx(data, origin);
    const highlighted = nearestHotPoint(svgWrap.current, p);
    if (highlighted) {
      setGuide({ originPx, tipPx: highlighted, rays: [] });
      return;
    }
    if (shift && snapTools) {
      const g = cardinalGuide(data, origin, p, true, extraGuideAngles(data, last));
      setGuide({ originPx: g.originPx, tipPx: g.tipPx, rays: g.rays });
      return;
    }
    const open = !!TOOL_BY_ID[st.tool]?.openEnded || st.picks.length === 1;
    if (!open) { setGuide(null); return; }
    setGuide({ originPx, tipPx: p, rays: [] });
  }, [lang]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Shift') refreshGuide(e.type === 'keydown'); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, [refreshGuide, tool, picks]);

  const onMove = (e: React.PointerEvent) => {
    hover.current = toSvg(e);
    refreshGuide(e.shiftKey);
    const d = drag.current;
    if (!d || e.pointerId!==d.pointerId) return;
    if((e.buttons&1)===0){stopDrag();return;}
    if (!d.started) {
      if (Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < DRAG_THRESHOLD_PX) return;
      d.started = true;
      useStore.getState().beginDrag(); // one undo step per drag
    }
    const st = useStore.getState();
    const p = toSvg(e);
    if (d.mode === 'move') {
      let dx = (p.x - d.start.x) / st.viewScale;
      let dy = -(p.y - d.start.y) / st.viewScale;
      if (e.shiftKey) (Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0));
      /* Each language image keeps its own edge limit: the shared offset moves by the strictest limit, and a per-language shift gives the looser image the rest. */
      const sh = st.shapes.find((x) => x.id === d.id);
      let patch: Partial<typeof sh & object> = { offset: { x: d.off.x + dx, y: d.off.y + dy } };
      if (sh) {
        const vs = st.viewScale, pad = ptToPx(CROP_PAD_PT);
        const rx = dx * vs, ry = -dy * vs;
        const lim = (l: Lang) => {
          const k = d.shift0[l] ?? { x: 0, y: 0 };
          const at = { ...sh, offset: { x: d.off.x + k.x, y: d.off.y + k.y }, langShift: undefined };
          let box: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
          if (sh.caption) {
            const lc = layoutCaption(sh.caption[l].trim() ? sh.caption[l] : ' ', l, st.style.fontSize);
            const c = placeShape(at, vs, st.canvas).center, r = (sh.rotation * Math.PI) / 180;
            const hw = (Math.abs(lc.w * Math.cos(r)) + Math.abs(lc.h * Math.sin(r))) / 2, hh = (Math.abs(lc.w * Math.sin(r)) + Math.abs(lc.h * Math.cos(r))) / 2;
            box = { minX: c.x - hw, maxX: c.x + hw, minY: c.y - hh, maxY: c.y + hh };
          } else {
            const solo = { canvas: st.canvas, shapes: [at], points: [], lines: [], marks: [], style: st.style, viewScale: vs };
            box = inkBoundsPx(solo, l);
            if (!box) { const bb = boundsPx(placeShape(at, vs, st.canvas)); box = { minX: bb.x, maxX: bb.x + bb.w, minY: bb.y, maxY: bb.y + bb.h }; }
          }
          const ok = Number.isFinite(box.minX + box.maxX + box.minY + box.maxY);
          const cr = st.langView?.[l];
          const m = cr ? { minX: cr.x, minY: cr.y, maxX: cr.x + cr.w, maxY: cr.y + cr.h } : { minX: pad, minY: pad, maxX: st.canvas.w - pad, maxY: st.canvas.h - pad };
          const fitsX = ok && box.maxX - box.minX <= m.maxX - m.minX + 1, fitsY = ok && box.maxY - box.minY <= m.maxY - m.minY + 1;
          return {
            loX: fitsX ? m.minX - box.minX : -Infinity, hiX: fitsX ? m.maxX - box.maxX : Infinity,
            loY: fitsY ? m.minY - box.minY : -Infinity, hiY: fitsY ? m.maxY - box.maxY : Infinity,
          };
        };
        const L = { ar: lim('ar'), en: lim('en') };
        const cl = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(hi, lo));
        const sx = cl(rx, Math.max(L.ar.loX, L.en.loX), Math.min(L.ar.hiX, L.en.hiX));
        const sy = cl(ry, Math.max(L.ar.loY, L.en.loY), Math.min(L.ar.hiY, L.en.hiY));
        const shift = (l: Lang) => {
          const k = d.shift0[l] ?? { x: 0, y: 0 };
          return { x: k.x + (cl(rx, L[l].loX, L[l].hiX) - sx) / vs, y: k.y - (cl(ry, L[l].loY, L[l].hiY) - sy) / vs };
        };
        patch = { offset: { x: d.off.x + sx / vs, y: d.off.y - sy / vs }, langShift: { ar: shift('ar'), en: shift('en') } };
      }
      st.dragShape(d.id, patch as Partial<import('../core/types').ShapeInstance>);
    } else if (d.mode === 'scale') {
      const clamp = (v: number) => Math.min(1e7, Math.max(0.1, v));
      let want: { scale: number; scaleX: number; scaleY: number } | null = null;
      if (e.shiftKey) {
        const rx = Math.max(Math.abs(d.start.x - d.center.x), 4);
        const ry = Math.max(Math.abs(d.start.y - d.center.y), 4);
        const sx = clamp(d.scaleX0 * Math.abs(p.x - d.center.x) / rx);
        const sy = clamp(d.scaleY0 * Math.abs(p.y - d.center.y) / ry);
        if (Number.isFinite(sx) && Number.isFinite(sy)) want = { scale: d.scale0, scaleX: sx, scaleY: sy };
      } else {
        const k = clamp(d.scale0 * (Math.hypot(p.x - d.center.x, p.y - d.center.y) / d.dist0));
        if (Number.isFinite(k)) want = { scale: k, scaleX: d.scaleX0, scaleY: d.scaleY0 };
      }
      const sh = st.shapes.find((x) => x.id === d.id);
      if (want && sh) {
        /* A shape can be enlarged only while its ink stays inside the image (the Fit crop when showing, otherwise the canvas). */
        const vs = st.viewScale, pad = ptToPx(CROP_PAD_PT);
        const overflow = (sc: { scale: number; scaleX: number; scaleY: number }) => {
          const solo = { canvas: st.canvas, shapes: [{ ...sh, ...sc }], points: [], lines: [], marks: [], style: st.style, viewScale: vs };
          let total = 0;
          for (const l of ['ar', 'en'] as Lang[]) {
            const b = sh.caption ? null : inkBoundsPx(solo, l);
            if (!b) continue;
            const cr = st.langView?.[l];
            const m = cr ? { minX: cr.x, minY: cr.y, maxX: cr.x + cr.w, maxY: cr.y + cr.h } : { minX: pad, minY: pad, maxX: st.canvas.w - pad, maxY: st.canvas.h - pad };
            total += Math.max(0, m.minX - 0.05 - b.minX) + Math.max(0, m.minY - 0.05 - b.minY) + Math.max(0, b.maxX - m.maxX - 0.05) + Math.max(0, b.maxY - m.maxY - 0.05);
          }
          return total;
        };
        const cur = { scale: sh.scale, scaleX: sh.scaleX ?? 1, scaleY: sh.scaleY ?? 1 };
        const base = overflow(cur) + 1e-6;
        let next = want;
        if (!sh.caption && overflow(want) > base) {
          const from = d.ok ?? cur;
          const mix = (t: number) => ({ scale: from.scale + (want!.scale - from.scale) * t, scaleX: from.scaleX + (want!.scaleX - from.scaleX) * t, scaleY: from.scaleY + (want!.scaleY - from.scaleY) * t });
          let lo = 0, hi = 1;
          for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (overflow(mix(mid)) <= base) lo = mid; else hi = mid; }
          next = mix(lo);
        }
        d.ok = next;
        st.dragShape(d.id, next);
      }
    } else if(d.mode==='rotate'){
      const angle=Math.atan2(-(p.y-d.center.y),p.x-d.center.x)*180/Math.PI;
      let rotation=d.rotation0+angle-d.angle0;
      if(e.shiftKey)rotation=Math.round(rotation/15)*15;
      if(Number.isFinite(rotation))st.dragShape(d.id,{rotation});
    } else {
      // Labels never leave the image: the Fit crop when it is showing, otherwise the canvas.
      const apply = (dx: number, dy: number) => {
        if (d.mode === 'label') st.moveLabel('shape', d.id, d.key, lang, { x: dx, y: dy });
        else if (d.mode === 'conLabel') st.moveLabel(d.kind, d.id, '', lang, { x: dx, y: dy });
      };
      const sceneNow = (): SceneData => { const s = useStore.getState(); return { canvas: s.canvas, shapes: s.shapes, points: s.points, lines: s.lines, marks: s.marks, style: s.style, viewScale: s.viewScale }; };
      const pad = ptToPx(CROP_PAD_PT);
      const langs: Lang[] = st.separateLabels ? [lang] : ['ar', 'en'];
      type B = { minX: number; maxX: number; minY: number; maxY: number };
      const limOf = (l: Lang): B => { const cr = useStore.getState().langView?.[l]; return cr ? { minX: cr.x, minY: cr.y, maxX: cr.x + cr.w, maxY: cr.y + cr.h } : { minX: pad, minY: pad, maxX: st.canvas.w - pad, maxY: st.canvas.h - pad }; };
      const slack = 0.5;
      const over = (b: B | null, l: Lang) => { const m = limOf(l); return !b ? 0 : Math.max(0, m.minX - slack - b.minX) + Math.max(0, m.minY - slack - b.minY) + Math.max(0, b.maxX - m.maxX - slack) + Math.max(0, b.maxY - m.maxY - slack); };
      const overall = () => { const sc = sceneNow(); return langs.reduce((n, l) => n + over(inkBoundsPx(sc, l), l), 0); };
      const was = overall();
      const tries: [number, number][] = [[p.x - d.start.x, p.y - d.start.y], [p.x - d.start.x, 0], [0, p.y - d.start.y]];
      for (const [dx, dy] of tries) {
        if (!dx && !dy) continue;
        apply(dx, dy);
        const now = overall();
        if (now === 0 || now <= was) { d.start = { x: d.start.x + dx, y: d.start.y + dy }; break; }
        apply(-dx, -dy);
      }
    }
  };

  const onUp = stopDrag;

  /** Double-click a label to put it back where it was by default. */
  const onDouble = (e: React.MouseEvent) => {
    const st = useStore.getState();
    if (st.tool || st.axesTool) return;
    // pointer capture retargets the event to the frame, so look at what is under the cursor
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const el = under?.closest('[data-label-key],[data-con]');
    if (!el || el.getAttribute('data-locked') === '1') return;
    const con = el.getAttribute('data-con');
    if (con) {
      const [kind, id] = con.split(':');
      st.resetLabel(kind === 'point' ? { point: id, lang } : { line: id, lang });
    } else {
      const shape = (el.closest('[data-shape-id]') ?? el).getAttribute('data-shape-id');
      const key = el.getAttribute('data-label-key');
      if (shape && key) st.resetLabel({ shape, key, lang });
    }
  };

  const step = tool ? TOOL_BY_ID[tool].steps[Math.min(picks.length, TOOL_BY_ID[tool].steps.length - 1)] : null;
  const title = lang === 'ar' ? 'Arabic · عربي' : 'English';

  return (
    <div className="preview-col">
      <div className="preview-title">
        <span className={`badge badge-${lang}`}>{lang.toUpperCase()}</span>
        {title}
      </div>
      <div className={`preview-cell${zoom > 1 ? ' free' : ''}`} ref={cell} onDragStart={(e) => e.preventDefault()}>
        <div
          className={`frame ${tool || axesTool ? 'tool-active' : ''}`}
          ref={svgWrap}
          style={{ width: box.w, height: box.h }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onDoubleClick={onDouble}
        >
          <SceneSvg axesTool={axesTool} data={data} lang={lang} interactive selectedId={selectedId} hot={step} picks={picks} linkPicks={tool !== 'rel-point'} angleGuide={tool === 'rel-point' ? null : guide} lockAll={lockAll} className="scene-svg" crop={crop} />
          {shapes.length === 0 && <div className="empty-hint">Pick a shape from the left panel</div>}
        </div>
      </div>
    </div>
  );
}
