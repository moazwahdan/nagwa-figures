import { labelSize } from '../core/labelSizing';
import { ARROW_TO_STROKE, ARC_TO_STROKE, DOT_TO_STROKE, MARK_TO_STROKE } from '../core/paper';
import { projector, solidSettings } from '../core/shapes3d';
import { circularPoint, add3, sub3, mul3, unit3 } from '../core/spatial';
import type React from 'react';
import { useEffect, useState } from 'react';
import { bakeCaptionMath } from '../core/mathliveHost';
import type { CSSProperties } from 'react';
import { placeLabel, placeOutward, type Obstacles, type Box } from '../core/labelPlacement';
import { Txt } from './FigureText';
import { CaptionInk } from './CaptionSvg';
import { layoutCaption } from '../core/figureLatex';
import { ChartSvg } from './ChartSvg';
import { AxesSvg } from './AxesSvg';
import type { AxesTool } from '../core/types';
import { SolidSvg } from './SolidSvg';
import { toUnits } from '../core/scene';
import { formatNumber, localizeName, vertexLabelOf, localizeText, pointLabel, toArabicDigits, unitLabel } from '../core/labels';
import { dataForLang, placeShape, type Placed } from '../core/scene';
import { inkBoundsPx, vertexGapShifts } from '../core/crop';
import { effectiveForceSymbol, forceSymbolParts } from '../core/forceSymbols';
import { interiorAngles } from '../core/shapes2d';
import type { StepKind, Target } from '../core/tools';
import { COMPASS_DEG, SIDE_FRACS, forceSnapLocals } from '../core/forceSnaps';
import { circleCircle, findCircleHits, findCrossings, type PixelCircle, type PixelSegment } from '../core/intersections';
import type { Lang, Ref, SceneData, ShapeInstance, StyleSettings, Vec } from '../core/types';
import { allPointRefs, buildWorld, groupExtraPx, ownerOfDef, ownerOfRef, shapeCircle, spatialRef, refKey, toPx } from '../core/world';

interface Props {
  axesTool?: AxesTool | null;
  data: SceneData;
  lang: Lang;
  interactive?: boolean;
  selectedId?: string | null;
  /** current construction step -> draws click hotspots */
  hot?: StepKind | null;
  picks?: Target[];
  linkPicks?: boolean;
  angleGuide?: { originPx: Vec; tipPx: Vec; rays: { angle: number; tip: Vec }[]; path?: Vec[] } | null;
  lockAll?: boolean;
  /** extra CSS (embedded @font-face when exporting) */
  css?: string;
  className?: string;
  style?: CSSProperties;
  /** Crop the SVG view to this language's ink (Fit / export). */
  crop?: { x: number; y: number; w: number; h: number } | null;
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const estW = (t: string, size: number) => t.length * size * 0.56;

export function boundsPx(p: Placed): { x: number; y: number; w: number; h: number } {
  if (p.circle) return { x: p.circle.c.x - p.circle.r, y: p.circle.c.y - p.circle.r, w: p.circle.r * 2, h: p.circle.r * 2 };
  const xs = (p.boundsPts ?? p.pts).map((q) => q.x);
  const ys = (p.boundsPts ?? p.pts).map((q) => q.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function SceneSvg({ axesTool, data: rawData, lang, interactive = false, selectedId = null, hot = null, picks = [], linkPicks = true, angleGuide = null, lockAll = false, css, className, style, crop = null }: Props) {
  const data = dataForLang(rawData, lang);
  /* Formulas inside notes are measured after they are typeset. Redraw once they are ready so the selection box matches the text. */
  const [, setBakeTick] = useState(0);
  const noteKey = data.shapes.map((s) => s.caption?.[lang] ?? '').join('\u0001');
  useEffect(() => {
    let live = true;
    const notes = data.shapes.filter((s) => s.caption).map((s) => s.caption![lang]);
    if (!notes.length) return;
    void Promise.all(notes.map((n) => bakeCaptionMath(n, lang))).then(() => { if (live) setBakeTick((n) => n + 1); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey, lang]);
  const { w, h } = data.canvas;
  const st: StyleSettings = data.style;
  const dotR = st.stroke * DOT_TO_STROKE;
  const mark = st.stroke * MARK_TO_STROKE;
  const arcR = st.stroke * ARC_TO_STROKE;
  const G = data.viewScale;
  /* Chrome tuned on the old 900px sheet. Scale it with the page so handles and marks keep the same size on screen. */
  const ui = Math.min(w, h) / 900;
  const world = buildWorld(data);
  const P = (r: Ref): Vec | null => {
    const u = world.ref(r);
    return u ? toPx(data, u) : null;
  };
  const sizeFor=(id?:string)=>labelSize(data,data.shapes.find(s=>s.id===id),lang);
  const lockedFor = (id?: string) => lockAll || !!(id && data.shapes.find((s) => s.id === id)?.locked);
  const caseOf = (id?: string) => data.shapes.find((s) => s.id === id)?.caseMode ?? 'upper';

  const placedAll = data.shapes.map((s) => ({ s, pl: placeShape(s, G, data.canvas) }));
  let figSpan = 0;
  for (const { s, pl } of placedAll) {
    if (s.caption || (s.axes||s.chart)) continue;
    const boxPts = [...pl.pts, ...(pl.boundsPts ?? [])];
    if (pl.circle) {
      const { c, r } = pl.circle;
      boxPts.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    }
    if (!boxPts.length) continue;
    const xs = boxPts.map((p) => p.x), ys = boxPts.map((p) => p.y);
    figSpan = Math.max(figSpan, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }
  if (!(figSpan > 8)) figSpan = Math.min(w, h);
  /** Hover halo: smaller on a large figure, larger on a small one. */
  const hotR = Math.min(9.5, Math.max(4.2, 780 / figSpan));
  const nearHot = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y) < Math.max(hotR * 0.85, 3);

  /* ---- obstacles for label placement ---- */
  const obs: Obstacles = { segs: [], circles: [] };
  for (const { s, pl } of placedAll) {
    if((s.axes||s.chart)||s.caption) continue;
    if (pl.geo.solid) {
      const solid = pl.geo.solid;
      const map = (v: Vec) => toPx(data, toUnits(s, v));
      for (const e of solid.edges) obs.segs.push([pl.pts[e.a], pl.pts[e.b]]);
      for (const c of solid.curves) c.points.slice(1).forEach((p, i) => obs.segs.push([map(c.points[i]), map(p)]));
    } else {
      if (pl.circle) obs.circles.push({ c: pl.circle.c, r: pl.circle.r });
      for (const extra of pl.geo.circles ?? []) {
        const c = toPx(data, toUnits(s, { x: extra.cx, y: extra.cy }));
        obs.circles.push({ c, r: extra.r * s.scale * G });
      }
      const n = pl.pts.length;
      if (n > 1) {
        const last = pl.geo.open || n < 3 ? n - 1 : n;
        for (let i = 0; i < last; i++) obs.segs.push([pl.pts[i], pl.pts[(i + 1) % n]]);
      }
      for (const stroke of pl.geo.strokes ?? []) {
        const pts = stroke.pts.map((p) => toPx(data, toUnits(s, p)));
        const last = stroke.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < last; i++) obs.segs.push([pts[i], pts[(i + 1) % pts.length]]);
      }
    }
  }
  const conLines = data.lines
    .map((l) => ({ l, a: P(l.a), b: P(l.b) }))
    .filter((x): x is { l: typeof x.l; a: Vec; b: Vec } => !!x.a && !!x.b);
  const splinePts = (l: (typeof conLines)[number]['l'], a: Vec, b: Vec) => [a, ...(l.via ?? []).map(P).filter((p): p is Vec => !!p), b];
  const catmull = (pts: Vec[]) => {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      d += ` C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
    }
    return d;
  };
  for (const c of conLines) {
    if (c.l.curve === 'spline') {
      const pts = splinePts(c.l, c.a, c.b);
      for (let i = 1; i < pts.length; i++) obs.segs.push([pts[i - 1], pts[i]]);
    } else obs.segs.push([c.a, c.b]);
  }

  const taken: Box[] = [];
  /** place a label and remember its box so later labels keep clear of it */
  const place = (anchor: Vec, outward: Vec, w: number, hh: number): Vec => {
    const c = placeLabel(anchor, outward, w, hh, obs, taken, 9);
    taken.push({ c, w, h: hh });
    return c;
  };
  /* Letters on a 3D solid sit at a fixed side of their vertex, so resizing never makes them jump. */
  const placeSolid = (anchor: Vec, outward: Vec, w: number, hh: number): Vec => placeOutward(anchor, outward, w, hh, 9);
  const bodies: React.JSX.Element[] = [];
  const drawn: React.JSX.Element[] = [];
  const dots: React.JSX.Element[] = [];
  const texts: React.JSX.Element[] = [];
  const vrecs: { s: ShapeInstance; i: number; v: Vec; base: Vec; text: string; size: number; lk: boolean }[] = [];
  const hots: React.JSX.Element[] = [];

  const stroke = { stroke: '#000', strokeWidth: st.stroke, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const nzS = (s: ShapeInstance, key: string, p: Vec): Vec => {
    const n = s.nudgeByLang?.[lang]?.[key] ?? s.nudge[key];
    return n ? { x: p.x + n.x, y: p.y + n.y } : p;
  };
  const nzV = (n: Vec | undefined, p: Vec): Vec => (n ? { x: p.x + n.x, y: p.y + n.y } : p);

  /* ---- shapes ---- */
  for (const { s, pl } of placedAll) {
    if(s.chart){bodies.push(<ChartSvg key={s.id} data={data} shape={s} lang={lang} interactive={interactive} lockAll={lockAll} />);continue;}
    if(s.axes){bodies.push(<AxesSvg key={s.id} data={data} shape={s} lang={lang} interactive={interactive} lockAll={lockAll} tool={axesTool?.shape===s.id?axesTool:null} />);continue;}
    const size=sizeFor(s.id);
    const lk = lockedFor(s.id);
    const hit = interactive ? { 'data-shape-id': s.id, style: { cursor: 'move' }, pointerEvents: 'all' as const } : {};
    const fill = s.fillColor ?? (interactive ? 'rgba(0,0,0,0.001)' : 'none');
    const shapeInk = s.color ?? '#000';
    const shapeStroke = { ...stroke, stroke: shapeInk, strokeWidth: st.stroke };

    if(s.caption){
      const text=s.caption[lang];
      if(!text.trim())continue;
      /* Text is always drawn at the style's font size (11.25pt) - it never scales with the drawing. */
      const laid=layoutCaption(text||' ',lang,data.style.fontSize);
      const sx=s.flipX?-1:1,sy=s.flipY?-1:1;
      const transform=`translate(${pl.center.x} ${pl.center.y}) rotate(${-s.rotation}) scale(${sx} ${sy}) translate(${-laid.w/2} ${-laid.h/2})`;
      bodies.push(<g key={`b${s.id}`} data-caption={s.id} transform={transform}>
        {text.trim()?<CaptionInk text={text} lang={lang} size={data.style.fontSize}/>:null}
        {interactive&&<rect x={0} y={0} width={laid.w} height={laid.h} fill="transparent" data-shape-id={s.id} style={{cursor:'move'}} pointerEvents="all"/>}
      </g>);
      continue;
    }
    if (pl.geo.solid) {
      bodies.push(<SolidSvg key={`b${s.id}`} data={data} shape={s} geometry={pl.geo.solid} pts={pl.pts} lang={lang} interactive={interactive} locked={lk} place={placeSolid} />);
      continue;
    }
    const mapLocal = (v: Vec) => toPx(data, toUnits(s, v));
    const parts: React.JSX.Element[] = [];
    const ring = (key: string, cx: number, cy: number, r: number, fillRule: string) => {
      const c = mapLocal({ x: cx, y: cy });
      const px = mapLocal({ x: cx + r, y: cy });
      const py = mapLocal({ x: cx, y: cy + r });
      const rx = Math.hypot(px.x - c.x, px.y - c.y), ry = Math.hypot(py.x - c.x, py.y - c.y);
      const rot = (Math.atan2(px.y - c.y, px.x - c.x) * 180) / Math.PI;
      return <ellipse key={key} cx={c.x} cy={c.y} rx={rx} ry={ry} transform={`rotate(${rot} ${c.x} ${c.y})`} fill={fillRule} {...shapeStroke} />;
    };
    if (pl.geo.circle) parts.push(ring(`c${s.id}`, pl.geo.circle.cx ?? 0, pl.geo.circle.cy ?? 0, pl.geo.circle.r, s.defId==='mech-particle'?'none':fill));
    for (const extra of pl.geo.circles ?? []) parts.push(ring(`xc${s.id}${extra.cx}${extra.cy}`, extra.cx, extra.cy, extra.r, fill));
    if (s.defId === 'mech-pulley' && pl.circle) {
      parts.push(<circle key={`hub${s.id}`} cx={pl.circle.c.x} cy={pl.circle.c.y} r={Math.max(3, pl.circle.r * 0.2)} fill="#000" stroke="none" />);
    }
    if (s.defId === 'mech-wedge' && pl.geo.points.length >= 2) {
      const A = toUnits(s, pl.geo.points[0]), B = toUnits(s, pl.geo.points[1]);
      const lower = A.y <= B.y ? A : B, upper = A.y <= B.y ? B : A;
      const C = { x: upper.x, y: lower.y };
      const Lp = toPx(data, lower), Cp = toPx(data, C);
      parts.push(<line key={`wbase${s.id}`} x1={Lp.x} y1={Lp.y} x2={Cp.x} y2={Cp.y} {...shapeStroke} />);
    }
    for (let i = 0; i < (pl.geo.strokes ?? []).length; i++) {
      const sk = pl.geo.strokes![i];
      if(sk.hatch&&s.params.rough===0)continue;
      const pts = sk.pts.map(mapLocal);
      const d = pts.map((p, n) => `${n ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + (sk.closed ? 'Z' : '');
      parts.push(<path key={`sk${s.id}${i}`} d={d} fill={sk.fill ? shapeInk : fill} {...shapeStroke} strokeDasharray={sk.dashed ? `${st.stroke * 4} ${st.stroke * 3}` : undefined} />);
      if (sk.arrow && pts.length >= 2) {
        const b = pts[pts.length - 1], a = pts[pts.length - 2];
        const u = norm(sub(b, a)), nrm = { x: -u.y, y: u.x }, m = st.stroke * ARROW_TO_STROKE;
        const base = add(b, u, -m);
        parts.push(<path key={`ar${s.id}${i}`} d={`M${b.x} ${b.y} L${base.x + nrm.x * m * 0.38} ${base.y + nrm.y * m * 0.38} L${base.x - nrm.x * m * 0.38} ${base.y - nrm.y * m * 0.38} Z`} fill={shapeInk} stroke="none" />);
      }
    }
    const pts = pl.pts;
    const n = pts.length;
    const closedPoly = n >= 3 && !pl.geo.open;
    const pathDash = s.pathDashed ? `${st.stroke * 4} ${st.stroke * 3}` : undefined;
    if (s.pathCurved && n >= 2) {
      parts.push(<path key={`pg${s.id}`} d={catmull(pts) + (closedPoly ? 'Z' : '')} fill={closedPoly ? fill : 'none'} {...shapeStroke} strokeDasharray={pathDash} strokeLinejoin="round" />);
    } else if (closedPoly) parts.push(<polygon key={`pg${s.id}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={fill} {...shapeStroke} strokeDasharray={pathDash} />);
    else if (n >= 2 && !(pl.geo.strokes ?? []).length) parts.push(<polyline key={`pl${s.id}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" {...shapeStroke} strokeDasharray={pathDash} />);
    const box = boundsPx(pl);
    if (interactive) parts.push(<rect key={`hit${s.id}`} x={box.x} y={box.y} width={Math.max(box.w, 8 * ui)} height={Math.max(box.h, 8 * ui)} fill="transparent" data-shape-id={s.id} style={{ cursor: 'move' }} pointerEvents="all" />);
    bodies.push(<g key={`b${s.id}`}>{parts}</g>);
    if (pl.circle && s.center.show) {
      const { c } = pl.circle;
      const raw = s.center.name.trim();
      if (raw) {
        dots.push(<circle key={`cd${s.id}`} cx={c.x} cy={c.y} r={dotR} fill="#000" />);
        const name = lang === 'ar' && raw.toUpperCase() === 'O' ? 'م' : localizeName(raw, lang, s.caseMode, st);
        const pos = nzS(s, 'c', place(c, { x: -0.7, y: 0.7 }, estW(name, size), size * 0.8));
        texts.push(<Txt key={`cl${s.id}`} pos={pos} text={name} lang={lang} size={size} italic={st.italicLetters} interactive={interactive} locked={lk} owner={s.id} shapeId={s.id} labelKey="c" />);
      }
    }
    if (!n) continue;
    const centroid = { x: pts.reduce((a, p) => a + p.x, 0) / n, y: pts.reduce((a, p) => a + p.y, 0) / n };
    const angles = closedPoly ? interiorAngles(pl.geo.points) : [];

    for (let i = 0; i < n; i++) {
      const v = pts[i];
      const prev = pts[(i + n - 1) % n];
      const next = pts[(i + 1) % n];
      const u1 = norm(sub(prev, v));
      const u2 = norm(sub(next, v));
      const isRight = closedPoly && Math.abs(angles[i] - 90) < 0.6;

      const cr = u1.x * u2.y - u1.y * u2.x;
      const splitByLine = conLines.some((c) => {
        const other = Math.hypot(c.a.x - v.x, c.a.y - v.y) < 0.5 ? c.b : Math.hypot(c.b.x - v.x, c.b.y - v.y) < 0.5 ? c.a : null;
        if (!other) return false;
        const d = norm(sub(other, v));
        return (u1.x * d.y - u1.y * d.x) * cr > 1e-3 && (d.x * u2.y - d.y * u2.x) * cr > 1e-3;
      });
      const rightMarkVisible=s.showRightMarks&&isRight&&!(s.hideSplitRightMarks&&splitByLine);
      if (rightMarkVisible) {
        const m = mark;
        const a = add(v, u1, m);
        const b = add(a, u2, m);
        const c = add(v, u2, m);
        drawn.push(<path data-right-mark={`${s.id}:${i}`} key={`rm${s.id}${i}`} d={`M${a.x} ${a.y} L${b.x} ${b.y} L${c.x} ${c.y}`} fill="none" stroke="#000" strokeWidth={st.stroke} />);
      }

      const al = s.angles[i];
      if (al?.show && s.defId !== 'mech-wedge') {
        const bis = norm(add(u1, u2));
        const r = arcR;
        if (al.arc && !rightMarkVisible) {
          const a = add(v, u1, r);
          const b = add(v, u2, r);
          const cross = u1.x * u2.y - u1.y * u2.x;
          drawn.push(<path key={`arc${s.id}${i}`} d={`M${a.x} ${a.y} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${b.x} ${b.y}`} fill="none" stroke="#000" strokeWidth={st.stroke} />);
        }
        const text = localizeText(al.text.trim() || `${formatNumber(angles[i])}°`, lang, st);
        const ext = Math.abs(bis.x) * estW(text, size * 0.8) * 0.5 + Math.abs(bis.y) * size * 0.4;
        texts.push(<Txt key={`al${s.id}${i}`} pos={nzS(s, `a${i}`, add(v, bis, arcR + ext + 8 * ui))} text={text} lang={lang} size={size * 0.8} interactive={interactive} locked={lk} owner={s.id} shapeId={s.id} labelKey={`a${i}`} />);
      }

      if (s.showVertexDots) dots.push(<circle key={`dot${s.id}${i}`} cx={v.x} cy={v.y} r={dotR} fill="#000" />);

      if (s.showVertexLabels) {
        const text = vertexLabelOf(s, i, lang, st);
        if (text) {
          vrecs.push({ s, i, v, base: place(v, sub(v, centroid), estW(text, size), size * 0.8), text, size, lk });
        }
      }

      const sl = s.sides[i];
      if (sl && sl.text.trim() && (closedPoly || i < n - 1)) {
        const mid = { x: (v.x + next.x) / 2, y: (v.y + next.y) / 2 };
        const e = norm(sub(next, v));
        let nrm = { x: -e.y, y: e.x };
        if (nrm.x * (mid.x - centroid.x) + nrm.y * (mid.y - centroid.y) < 0) nrm = { x: -nrm.x, y: -nrm.y };
        const raw = localizeText(sl.text.trim(), lang, st);
        const text = sl.unit ? `${raw} ${unitLabel(lang)}` : raw;
        const ext = Math.abs(nrm.x) * estW(text, size * 0.9) * 0.5 + Math.abs(nrm.y) * size * 0.45;
        texts.push(<Txt key={`sl${s.id}${i}`} pos={nzS(s, `s${i}`, add(mid, nrm, ext + size/38*14))} text={text} lang={lang} size={size * 0.9} interactive={interactive} locked={lk} owner={s.id} shapeId={s.id} labelKey={`s${i}`} />);
      }
    }
    if (s.defId === 'mech-wedge' && pl.geo.points.length >= 2 && s.angles[0]?.show) {
      const A = toUnits(s, pl.geo.points[0]), B = toUnits(s, pl.geo.points[1]);
      const lower = A.y <= B.y ? A : B, upper = A.y <= B.y ? B : A;
      const C = { x: upper.x, y: lower.y };
      const v = toPx(data, lower), slope = toPx(data, upper), base = toPx(data, C);
      const u1 = norm(sub(base, v)), u2 = norm(sub(slope, v));
      const al = s.angles[0];
      const r = arcR;
      if (al.arc) {
        const a = add(v, u1, r), bpt = add(v, u2, r);
        const cross = u1.x * u2.y - u1.y * u2.x;
        drawn.push(<path key={`warc${s.id}`} d={`M${a.x} ${a.y} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${bpt.x} ${bpt.y}`} fill="none" stroke="#000" strokeWidth={st.stroke} />);
      }
      const trueDeg = Math.abs((Math.atan2(upper.y - lower.y, upper.x - lower.x) * 180) / Math.PI);
      const text = localizeText(al.text.trim() || `${formatNumber(trueDeg)}°`, lang, st);
      const bis = norm(add(u1, u2));
      const ext = Math.abs(bis.x) * estW(text, size * 0.8) * 0.5 + Math.abs(bis.y) * size * 0.4;
      texts.push(<Txt key={`wal${s.id}`} pos={nzS(s, 'a0', add(v, bis, arcR + ext + 8 * ui))} text={text} lang={lang} size={size * 0.8} interactive={interactive} locked={lk} owner={s.id} shapeId={s.id} labelKey="a0" />);
    }
  }

  /* ---- construction lines ---- */
  for (const { l, a, b } of conLines) {
    const e=norm(sub(b,a)),nrm={x:-e.y,y:e.x},dash=l.dashed?'9 7':undefined;
    const ink=l.color??'#000';
    const lineStroke={...stroke,stroke:ink,strokeWidth:st.stroke};
    if(l.curve==='arc'){
      const theta=(l.arcFraction??.25)*Math.PI*2,chord=Math.hypot(b.x-a.x,b.y-a.y);
      const radius=chord/(2*Math.sin(Math.min(theta,Math.PI*2-theta)/2)||1);
      drawn.push(<path key={`cl${l.id}`} d={`M${a.x} ${a.y} A${radius} ${radius} 0 ${theta>Math.PI?1:0} ${(l.arcSide??1)>0?0:1} ${b.x} ${b.y}`} fill="none" {...lineStroke} strokeDasharray={dash}/>);
    }else if(l.curve==='spline'){
      drawn.push(<path key={`cl${l.id}`} d={catmull(splinePts(l,a,b))} fill="none" {...lineStroke} strokeDasharray={dash} strokeLinejoin="round"/>);
    }else drawn.push(<line key={`cl${l.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...lineStroke} strokeDasharray={dash} />);
    const m=st.stroke*ARROW_TO_STROKE;
    const arrow=(tip:Vec,dir:Vec,key:string)=>{
      const base=add(tip,dir,-m),nn={x:-dir.y,y:dir.x};
      drawn.push(<path key={key} d={`M${tip.x} ${tip.y} L${base.x+nn.x*m*.38} ${base.y+nn.y*m*.38} L${base.x-nn.x*m*.38} ${base.y-nn.y*m*.38} Z`} fill={ink}/>);
    };
    if(l.arrow==='end'||l.arrow==='both')arrow(b,e,`lae${l.id}`);
    if(l.arrow==='start'||l.arrow==='both')arrow(a,{x:-e.x,y:-e.y},`las${l.id}`);
    if(l.arrow==='middle')arrow(add({x:(a.x+b.x)/2,y:(a.y+b.y)/2},e,m*.42),e,`lam${l.id}`);
    if(l.kind==='force'){
      const parts=forceSymbolParts(effectiveForceSymbol(data.lines,l),lang,st);
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const up=nrm.y>0?{x:-nrm.x,y:-nrm.y}:nrm;
      const at=l.arrow==='middle'?add(mid,up,sizeFor(ownerOfRef(data,l.a))*0.7):add(l.arrow==='start'?a:b,l.arrow==='start'?{x:-e.x,y:-e.y}:e,mark*1.15);
      const own=ownerOfRef(data,l.a);
      const fs=sizeFor(own)*0.95;
      if(parts)texts.push(<Txt key={`cf${l.id}`} color={ink} pos={nzV(l.nudgeByLang?.[lang]??l.nudge,at)} text={parts.text} sub={parts.sub} lang={lang} size={fs} italic={lang==='en'&&st.italicLetters} interactive={interactive} locked={lockedFor(own)} owner={own} con={`line:${l.id}`} direction={lang==='ar'?'rtl':'ltr'} flip={lang==='ar'}/>);
    } else if (l.label.text.trim()) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const raw = localizeText(l.label.text.trim(), lang, st);
      const text = l.label.unit ? `${raw} ${unitLabel(lang)}` : raw;
      const own = ownerOfRef(data, l.a);
      const fs = sizeFor(own) * 0.9;
      texts.push(
        <Txt key={`ct${l.id}`} color={ink} pos={nzV(l.nudgeByLang?.[lang] ?? l.nudge, placeLabel(mid, nrm, estW(text, fs), fs * 0.8, { segs: obs.segs.filter(([p, q]) => !(p === a && q === b)), circles: obs.circles }, taken))}
          text={text} lang={lang} size={fs} interactive={interactive} locked={lockedFor(own)} owner={own} con={`line:${l.id}`} />,
      );
    }
  }

  /* ---- marks ---- */
  for (const m of data.marks) {
    if(m.kind==='attachment'){
      const at=P(m.at),pa=P(m.a),pb=P(m.b);if(!at||!pa||!pb)continue;
      const e=norm(sub(pb,pa));
      const sit=(prefer:'up'|'down')=>{
        let n={x:-e.y,y:e.x};
        if(prefer==='up'&&n.y>0)n={x:-n.x,y:-n.y};
        if(prefer==='down'&&n.y<0)n={x:-n.x,y:-n.y};
        return n;
      };
      const k=mark*(m.size??3)/3;
      if(m.item==='wall'){
        const up={x:0,y:-1},end=add(at,up,k*4.2);
        drawn.push(<line key={`att${m.id}`} x1={at.x} y1={at.y} x2={end.x} y2={end.y} {...stroke}/>);
        const hx=m.side*(Math.SQRT1_2),hy=Math.SQRT1_2;
        for(let i=.4;i<4.1;i+=.55){
          const p=add(at,up,k*i);
          drawn.push(<line key={`ath${m.id}${i}`} x1={p.x} y1={p.y} x2={p.x+hx*k*.7} y2={p.y+hy*k*.7} {...stroke} strokeWidth={st.stroke}/>);
        }
      }else if(m.item==='hinge'){
        const n=sit('down'),left=add(add(at,n,k*1.4),e,-k*.9),right=add(add(at,n,k*1.4),e,k*.9);
        drawn.push(<path key={`att${m.id}`} d={`M${at.x} ${at.y} L${left.x} ${left.y} L${right.x} ${right.y} Z`} fill="#000" {...stroke}/>);
      }
    } else if (m.kind === 'angle') {
      const at = P(m.at), pa = P(m.a), pb = P(m.b);
      if (!at || !pa || !pb) continue;
      const u1 = norm(sub(pa, at)), u2 = norm(sub(pb, at));
      const r = arcR * (m.size ?? 1), ink = m.color ?? '#000';
      const a = add(at, u1, r), b = add(at, u2, r), cross = u1.x * u2.y - u1.y * u2.x;
      const arc = `A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${b.x} ${b.y}`;
      if (m.fill) drawn.push(<path key={`mkf${m.id}`} d={`M${at.x} ${at.y} L${a.x} ${a.y} ${arc} Z`} fill={ink} fillOpacity={0.4} stroke="none" />);
      drawn.push(<path key={`mk${m.id}`} d={`M${a.x} ${a.y} ${arc}`} fill="none" stroke={ink} strokeWidth={st.stroke} />);
      if (m.text.trim()) {
        const bis = norm(add(u1, u2)), fs = data.style.fontSize * 0.9;
        const dir = Math.hypot(bis.x, bis.y) < 1e-6 ? { x: -u1.y, y: u1.x } : bis;
        const ext = Math.abs(dir.x) * estW(m.text, fs) * 0.5 + Math.abs(dir.y) * fs * 0.4;
        texts.push(<Txt key={`mt${m.id}`} color={ink} pos={add(at, dir, r + ext + 5 * ui)} text={m.text} lang="en" size={fs} interactive={false} locked />);
      }
    } else if (m.kind === 'right') {
      const at = P(m.at);
      const pa = P(m.a);
      const pb = P(m.b);
      if (!at || !pa || !pb) continue;
      const u1 = norm(sub(pa, at));
      const u2 = norm(sub(pb, at));
      const k = mark;
      let a = add(at, u1, k), b = add(a, u2, k), c = add(at, u2, k);
      const sp=spatialRef(data,m.at),sa=spatialRef(data,m.a),sb=spatialRef(data,m.b);
      if(sp&&sa&&sb&&sp.owner===sa.owner&&sp.owner===sb.owner){
        const shape=data.shapes.find(s=>s.id===sp.owner)!;
        const project=projector(solidSettings(shape.solid)).project;
        const map=(p:import('../core/shapes3d').Vec3)=>toPx(data,toUnits(shape,project(p)));
        const length=Math.min(k/(shape.scale*G),Math.hypot(...Object.values(sub3(sa.position,sp.position)))*0.2,Math.hypot(...Object.values(sub3(sb.position,sp.position)))*0.2);
        const d1=mul3(unit3(sub3(sa.position,sp.position)),length),d2=mul3(unit3(sub3(sb.position,sp.position)),length);
        a=map(add3(sp.position,d1));b=map(add3(add3(sp.position,d1),d2));c=map(add3(sp.position,d2));
      }
      drawn.push(<path key={`mk${m.id}`} d={`M${a.x} ${a.y} L${b.x} ${b.y} L${c.x} ${c.y}`} fill="none" stroke="#000" strokeWidth={st.stroke} />);
    } else if ('circle' in m) {
      const s = data.shapes.find((x) => x.id === m.circle);
      const geo = s ? placeShape(s, G, data.canvas).geo : null;
      if (!s || !geo?.circle) continue;
      const rad = (d: number) => (d * Math.PI) / 180;
      const atOf = (deg: number) => toPx(data, toUnits(s, { x: (geo.circle!.cx ?? 0) + geo.circle!.r * Math.cos(rad(deg)), y: (geo.circle!.cy ?? 0) + geo.circle!.r * Math.sin(rad(deg)) }));
      const at = atOf(m.angle);
      const ahead = atOf(m.angle + 6);
      let tangent = norm(sub(ahead, at));
      if (m.kind === 'arrow' && (tangent.x < -1e-6 || (Math.abs(tangent.x) < 1e-6 && tangent.y > 0))) tangent = { x: -tangent.x, y: -tangent.y };
      const across = { x: -tangent.y, y: tangent.x };
      if (m.kind === 'tick') {
        for (let i = 0; i < m.n; i++) {
          const c = add(at, tangent, (i - (m.n - 1) / 2) * 8 * ui);
          const p1 = add(c, across, -9 * ui);
          const p2 = add(c, across, 9 * ui);
          drawn.push(<line key={`tk${m.id}${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#000" strokeWidth={st.stroke} strokeLinecap="round" />);
        }
      } else {
        for (let i = 0; i < m.n; i++) {
          const tip = add(at, tangent, ((i - (m.n - 1) / 2) * 11 + 5) * ui);
          const p1 = add(add(tip, tangent, -9 * ui), across, 7 * ui);
          const p2 = add(add(tip, tangent, -9 * ui), across, -7 * ui);
          drawn.push(<path key={`ar${m.id}${i}`} d={`M${p1.x} ${p1.y} L${tip.x} ${tip.y} L${p2.x} ${p2.y}`} fill="none" stroke="#000" strokeWidth={st.stroke} strokeLinecap="round" strokeLinejoin="round" />);
        }
      }
    } else {
      const pa = P(m.a);
      const pb = P(m.b);
      if (!pa || !pb) continue;
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      let e = norm(sub(pb, pa));
      const nrm = { x: -e.y, y: e.x };
      if (m.kind === 'tick') {
        for (let i = 0; i < m.n; i++) {
          const c = add(mid, e, (i - (m.n - 1) / 2) * 8 * ui);
          const p1 = add(c, nrm, -9 * ui);
          const p2 = add(c, nrm, 9 * ui);
          drawn.push(<line key={`tk${m.id}${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#000" strokeWidth={st.stroke} strokeLinecap="round" />);
        }
      } else {
        // all parallel arrows point the same way (right, or up for vertical lines)
        if (e.x < -1e-6 || (Math.abs(e.x) < 1e-6 && e.y > 0)) e = { x: -e.x, y: -e.y };
        const nn = { x: -e.y, y: e.x };
        for (let i = 0; i < m.n; i++) {
          const tip = add(mid, e, ((i - (m.n - 1) / 2) * 11 + 5) * ui);
          const p1 = add(add(tip, e, -9 * ui), nn, 7 * ui);
          const p2 = add(add(tip, e, -9 * ui), nn, -7 * ui);
          drawn.push(<path key={`ar${m.id}${i}`} d={`M${p1.x} ${p1.y} L${tip.x} ${tip.y} L${p2.x} ${p2.y}`} fill="none" stroke="#000" strokeWidth={st.stroke} strokeLinecap="round" strokeLinejoin="round" />);
        }
      }
    }
  }

  /* ---- construction points ---- */
  const centroidOf = (id?: string): Vec | null => {
    const e = placedAll.find((x) => x.s.id === id);
    if (!e) return null;
    return e.pl.geo.solid ? e.pl.center : e.pl.circle ? e.pl.circle.c : { x: e.pl.pts.reduce((a, p) => a + p.x, 0) / e.pl.pts.length, y: e.pl.pts.reduce((a, p) => a + p.y, 0) / e.pl.pts.length };
  };
  for (const p of data.points) {
    const pos = P({ p: p.id });
    if (!pos) continue;
    /* A point sitting on a circle centre that already shows the same name would draw a second letter. */
    const dupCentre = placedAll.some((e) => e.pl.circle && e.s.center.show && e.s.center.name.trim().toUpperCase() === p.name.trim().toUpperCase() && Math.hypot(e.pl.circle.c.x - pos.x, e.pl.circle.c.y - pos.y) < 1.5);
    if (dupCentre && !p.circled && !p.color) continue;
    const ink = p.color ?? '#000';
    if (p.dot) dots.push(<circle key={`pd${p.id}`} cx={pos.x} cy={pos.y} r={dotR} fill={ink} />);
    const own = ownerOfDef(data, p.def);
    const text = pointLabel(p.name, p.nameAr, lang, caseOf(own), st);
    if (p.showLabel && text) {
      const size=sizeFor(own);
      const cen = centroidOf(own);
      const outward = cen ? sub(pos, cen) : { x: 0, y: -1 };
      const at = nzV(p.nudgeByLang?.[lang] ?? p.nudge, place(pos, Math.hypot(outward.x, outward.y) < 1e-6 ? { x: 0, y: -1 } : outward, p.circled ? Math.max(estW(text, size), size * 1.56) : estW(text, size), p.circled ? size * 1.56 : size * 0.8));
      if (p.circled) dots.push(<circle key={`pc${p.id}`} cx={at.x} cy={at.y} r={size * 0.78} fill="#fff" stroke={ink} strokeWidth={st.stroke} />);
      texts.push(<Txt key={`pl${p.id}`} color={ink} pos={at} text={text} lang={lang} size={size} italic={st.italicLetters} interactive={interactive} locked={lockedFor(own)} owner={own} con={`point:${p.id}`} />);
    }
  }

  /* ---- click hotspots while a construction tool is active ---- */
  if (interactive && hot) {
    const wantLines = hot === 'line' || hot === 'lineOrCircle'||hot==='lineOrPoint'||hot==='pointOrCanvas';
    const wantCircles = hot === 'circle' || hot === 'lineOrCircle';
    const wantPoints = hot === 'point'||hot==='lineOrPoint'||hot==='pointOrCanvas'||hot==='canvas'||hot==='lineOrCircle';
    const occupied: Vec[] = [];
    const isTaken = (p: Vec) => occupied.some((q) => nearHot(p, q));
    const pin = (key: string, p: Vec, extra: Record<string, string>) => {
      occupied.push(p);
      hots.push(
        <g key={key}>
          <circle className={`hot hot-pt${extra['data-hot'] === 'snap' ? ' hot-snap' : ''}`} cx={p.x} cy={p.y} r={hotR} {...extra} />
          <circle cx={p.x} cy={p.y} r={Math.max(1.3, hotR * 0.26)} fill="#4f6bed" pointerEvents="none" />
        </g>,
      );
    };
    if (wantLines) {
      for (const { s, pl } of placedAll) {
        if((s.axes||s.chart)) continue;
        if (pl.geo.solid) {
          pl.geo.solid.edges.forEach((e, i) => {
            if (e.hidden && s.solid?.showHidden === false) return;
            const p = pl.pts[e.a], q = pl.pts[e.b];
            hots.push(<line key={`hs${s.id}${i}`} className="hot" x1={p.x} y1={p.y} x2={q.x} y2={q.y} data-hot="l" data-a={JSON.stringify({ s: s.id, i: e.a })} data-b={JSON.stringify({ s: s.id, i: e.b })} />);
          });
          continue;
        }
        if (pl.circle&&pl.pts.length<2) continue;
        const last=pl.geo.open||pl.pts.length<3?pl.pts.length-1:pl.pts.length;
        pl.pts.slice(0,last).forEach((p, i) => {
          const q = pl.pts[(i + 1) % pl.pts.length];
          hots.push(<line key={`hs${s.id}${i}`} className="hot" x1={p.x} y1={p.y} x2={q.x} y2={q.y} data-hot="l" data-a={JSON.stringify({ s: s.id, i })} data-b={JSON.stringify({ s: s.id, i: (i + 1) % pl.pts.length })} />);
        });
      }
      for (const { l, a, b } of conLines) hots.push(<line key={`hl${l.id}`} className="hot" x1={a.x} y1={a.y} x2={b.x} y2={b.y} data-hot="l" data-a={JSON.stringify(l.a)} data-b={JSON.stringify(l.b)} />);
    }
    if (wantCircles) {
      for (const { s, pl } of placedAll) {
        if((s.axes||s.chart)) continue;
        if (pl.circle) hots.push(<circle key={`hc${s.id}`} className="hot hot-ring" cx={pl.circle.c.x} cy={pl.circle.c.y} r={pl.circle.r} data-hot="c" data-shape={s.id} />);
        else if(circularPoint(s,0)){
          const {project,view}=projector(solidSettings(s.solid));
          for(let angle=0;angle<360;angle+=3){
            const a=circularPoint(s,angle)!,b=circularPoint(s,angle+3)!;
            if(s.solid?.showHidden===false&&a.x*view.x+a.z*view.z<0)continue;
            const pa=toPx(data,toUnits(s,project(a))),pb=toPx(data,toUnits(s,project(b)));
            hots.push(<line key={`hc${s.id}-${angle}`} className="hot" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} data-hot="c" data-shape={s.id} data-angle={angle+1.5} />);
          }
        }
      }
    }
    if (wantPoints) {
      for (const r of allPointRefs(data)) {
        if (hot === 'lineOrCircle' && 'c' in r) continue;
        const p = P(r);
        if (!p || isTaken(p)) continue;
        pin(`hp${refKey(r)}`, p, { 'data-hot': 'p', 'data-ref': JSON.stringify(r) });
      }
    }
    if (wantLines) {
      const fracOn = (key: string, a: Vec, b: Vec, ra: Ref, rb: Ref) => {
        for (const k of SIDE_FRACS) {
          const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          if (isTaken(p)) continue;
          pin(`${key}-${k}`, p, { 'data-hot': 'l', 'data-a': JSON.stringify(ra), 'data-b': JSON.stringify(rb), 'data-k': String(k) });
        }
      };
      for (const { s, pl } of placedAll) {
        if ((s.axes||s.chart)) continue;
        if (pl.geo.solid) {
          pl.geo.solid.edges.forEach((e, i) => {
            if (e.hidden && s.solid?.showHidden === false) return;
            fracOn(`hf${s.id}${i}`, pl.pts[e.a], pl.pts[e.b], { s: s.id, i: e.a }, { s: s.id, i: e.b });
          });
          continue;
        }
        if (pl.circle && pl.pts.length < 2) continue;
        const last = pl.geo.open || pl.pts.length < 3 ? pl.pts.length - 1 : pl.pts.length;
        for (let i = 0; i < last; i++) {
          const j = (i + 1) % pl.pts.length;
          fracOn(`hf${s.id}${i}`, pl.pts[i], pl.pts[j], { s: s.id, i }, { s: s.id, i: j });
        }
      }
      for (const { l, a, b } of conLines) fracOn(`hfl${l.id}`, a, b, l.a, l.b);
    }
    if (wantCircles) {
      for (const { s, pl } of placedAll) {
        if ((s.axes||s.chart) || !pl.circle) continue;
        const geo = pl.geo.circle;
        if (!geo) continue;
        const cx = geo.cx ?? 0, cy = geo.cy ?? 0;
        for (const deg of COMPASS_DEG) {
          const t = (deg * Math.PI) / 180;
          const loc = { x: cx + Math.cos(t) * geo.r, y: cy + Math.sin(t) * geo.r };
          const p = toPx(data, toUnits(s, loc));
          if (isTaken(p)) continue;
          pin(`hr${s.id}-${deg}`, p, { 'data-hot': 'c', 'data-shape': s.id, 'data-angle': String(deg) });
        }
      }
    }
    if (hot === 'point'||hot==='lineOrPoint'||hot==='pointOrCanvas'||hot==='canvas') {
      for (const { s } of placedAll) {
        for (const loc of forceSnapLocals(s)) {
          const p = toPx(data, toUnits(s, loc));
          if (isTaken(p)) continue;
          pin(`hs${s.id}-${loc.x.toFixed(3)}-${loc.y.toFixed(3)}`, p, { 'data-hot': 'snap', 'data-shape': s.id, 'data-x': String(loc.x), 'data-y': String(loc.y) });
        }
      }
    }
  }

  /* ---- crossings: visible snap spots while a construction tool is active. They do not take the pointer, so line and point hover stays as it is. ---- */
  const crossMarks: React.JSX.Element[] = [];
  if (interactive && hot) {
    const segs: PixelSegment[] = [];
    for (const { s, pl } of placedAll) {
      if ((s.axes||s.chart) || s.solid || s.caption || pl.geo.solid || s.pathCurved) continue;
      const n = pl.pts.length;
      if (n < 2) continue;
      const last = pl.geo.open || n < 3 ? n - 1 : n;
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % n;
        segs.push({ a: { s: s.id, i }, b: { s: s.id, i: j }, pa: pl.pts[i], pb: pl.pts[j] });
      }
    }
    for (const { l, a, b } of conLines) if (!l.curve) segs.push({ a: l.a, b: l.b, pa: a, pb: b });
    const existing: Vec[] = [];
    for (const r of allPointRefs(data)) { const p = P(r); if (p) existing.push(p); }
    const tol = Math.max(3 * ui, dotR * 0.9);
    const seen: Vec[] = [];
    const nearAny = (at: Vec) => existing.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < tol) || seen.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < tol);
    const mark = (key: string, at: Vec, attrs: Record<string, string | number>) => {
      if (crossMarks.length >= 80 || nearAny(at)) return;
      seen.push(at);
      crossMarks.push(<g key={key}>
        <circle className="hot hot-pt" cx={at.x} cy={at.y} r={hotR} {...attrs} />
        <circle cx={at.x} cy={at.y} r={Math.max(1.3, hotR * 0.26)} fill="#4f6bed" pointerEvents="none" />
      </g>);
    };
    for (const c of findCrossings(segs, existing, tol)) {
      mark(`sx${c.at.x.toFixed(1)}_${c.at.y.toFixed(1)}`, c.at, { 'data-xmark': 'x', 'data-a': JSON.stringify(c.a), 'data-b': JSON.stringify(c.b), 'data-c': JSON.stringify(c.c), 'data-d': JSON.stringify(c.d), 'data-k': c.k });
    }
    const circles: PixelCircle[] = placedAll.filter(({ s, pl }) => pl.circle && !s.solid && !(s.axes||s.chart)).map(({ s, pl }) => ({ shape: s.id, c: pl.circle!.c, r: pl.circle!.r }));
    for (const c of findCircleHits(segs, circles, existing, tol)) {
      mark(`sc${c.at.x.toFixed(1)}_${c.at.y.toFixed(1)}`, c.at, { 'data-xmark': 'xc', 'data-a': JSON.stringify(c.a), 'data-b': JSON.stringify(c.b), 'data-circle': c.shape, 'data-which': c.which, 'data-k': c.k });
    }
    const sceneCircles = placedAll.flatMap(({ s }) => {
      const circ = shapeCircle(s);
      return circ && !s.solid && !(s.axes||s.chart) ? [{ id: s.id, ...circ }] : [];
    });
    for (let i = 0; i < sceneCircles.length; i++) for (let j = i + 1; j < sceneCircles.length; j++) {
      circleCircle(sceneCircles[i].c, sceneCircles[i].r, sceneCircles[j].c, sceneCircles[j].r).forEach((at, which) => {
        const px = toPx(data, at);
        mark(`cc${i}${j}${which}`, px, { 'data-xmark': 'cc', 'data-shape': sceneCircles[i].id, 'data-other': sceneCircles[j].id, 'data-which': which, 'data-x': at.x, 'data-y': at.y });
      });
    }
  }

  /* ---- what has been picked so far ---- */
  const pickMarks: React.JSX.Element[] = [];
  if (interactive) {
    const pickPts = picks.map((t) => {
      const u = t.kind === 'point' ? P(t.ref) : t.kind === 'world' || t.kind === 'circles' ? toPx(data, { x: t.x, y: t.y }) : t.kind === 'free' ? (() => {
        const sh = data.shapes.find((s) => s.id === t.shape);
        return sh ? toPx(data, toUnits(sh, { x: t.x, y: t.y })) : null;
      })() : t.kind === 'line' ? (() => {
        const a = P(t.a), b = P(t.b);
        return a && b ? { x: a.x + (b.x - a.x) * t.k, y: a.y + (b.y - a.y) * t.k } : null;
      })() : null;
      return u;
    });
    pickPts.forEach((p, i) => {
      if (!p) return;
      pickMarks.push(<circle key={`pk${i}`} cx={p.x} cy={p.y} r={6 * ui} fill="#4f6bed" stroke="none" pointerEvents="none" />);
      const q = pickPts[i - 1];
      if (linkPicks && q) pickMarks.push(<line key={`pks${i}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y} stroke="#4f6bed" strokeWidth={st.stroke} pointerEvents="none" />);
    });
    picks.forEach((t, i) => {
      if (t.kind !== 'line') return;
      const a = P(t.a);
      const b = P(t.b);
      if (a && b) pickMarks.push(<line key={`pkl${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4f6bed" strokeWidth={st.stroke + 4 * ui} strokeOpacity={0.35} pointerEvents="none" />);
    });
  }

  /* ---- selection box ---- */
  const sel = interactive && selectedId && !hot ? data.shapes.find((s) => s.id === selectedId) : undefined;
  let overlay: React.JSX.Element | null = null;
  if (sel) {
    const capLaid = sel.caption ? layoutCaption((sel.caption[lang] ?? '').trim() ? sel.caption[lang] : ' ', lang, data.style.fontSize) : null;
    const capCenter = capLaid ? placeShape(sel, G, data.canvas).center : null;
    /* Axes are selected by their ink (arrow tips, letters, numbers), not by the empty range box around them. */
    const axInk = (sel.axes||sel.chart) ? inkBoundsPx({ ...rawData, shapes: rawData.shapes.filter((x) => x.id === sel.id), points: [], lines: [], marks: [] }, lang) : null;
    const base = capLaid && capCenter ? { x: capCenter.x - capLaid.w / 2, y: capCenter.y - capLaid.h / 2, w: capLaid.w, h: capLaid.h } : axInk ? { x: axInk.minX, y: axInk.minY, w: axInk.maxX - axInk.minX, h: axInk.maxY - axInk.minY } : boundsPx(placeShape(sel, G, data.canvas));
    const extra = groupExtraPx(data, sel.id);
    let minx = base.x, miny = base.y, maxx = base.x + base.w, maxy = base.y + base.h;
    for (const p of extra) { minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
    const b = { x: minx, y: miny, w: Math.max(maxx - minx, 1), h: Math.max(maxy - miny, 1) };
    const pad = 16 * ui;
    const x = b.x - pad;
    const y = b.y - pad;
    const bw = b.w + pad * 2;
    const bh = b.h + pad * 2;
    const hs = 11 * ui;
    const rotateY = y - 34 * ui;
    const rx = x + bw / 2;
    overlay = (
      <g transform={capCenter ? `rotate(${-sel.rotation} ${capCenter.x} ${capCenter.y})` : undefined}>
        <rect x={x} y={y} width={bw} height={bh} fill="none" stroke="#4f6bed" strokeWidth={1.6 * ui} strokeDasharray={`${7 * ui} ${6 * ui}`} pointerEvents="none" />
        <line x1={rx} y1={y} x2={rx} y2={rotateY} stroke="#4f6bed" strokeWidth={1.6 * ui} pointerEvents="none"/>
        <circle cx={rx} cy={rotateY} r={16 * ui} fill="transparent" data-handle="rotate" className="rotate-handle"/>
        <circle cx={rx} cy={rotateY} r={8 * ui} fill="#fff" stroke="#4f6bed" strokeWidth={2 * ui} data-handle="rotate" className="rotate-handle"/>
        <path d={`M${rx - 4 * ui} ${rotateY - 2.5 * ui} A${4 * ui} ${4 * ui} 0 1 1 ${rx + 4 * ui} ${rotateY - 2.5 * ui}`} fill="none" stroke="#4f6bed" strokeWidth={1.4 * ui} pointerEvents="none"/>
        {(sel.caption ? [] : [
          [x, y],
          [x + bw, y],
          [x, y + bh],
          [x + bw, y + bh],
        ]).map(([hx, hy], i) => (
          <rect key={i} x={hx - hs / 2} y={hy - hs / 2} width={hs} height={hs} rx={2 * ui} fill="#fff" stroke="#4f6bed" strokeWidth={2 * ui} data-handle="scale" style={{ cursor: i === 0 || i === 3 ? 'nwse-resize' : 'nesw-resize' }} />
        ))}
      </g>
    );
  }

  {
    const adj = vertexGapShifts(vrecs.map((r) => ({ v: r.v, c: r.base, text: r.text, size: r.size })), lang, st.italicLetters);
    vrecs.forEach((r, k) => texts.push(<Txt key={`vl${r.s.id}${r.i}`} pos={nzS(r.s, `v${r.i}`, adj[k])} text={r.text} lang={lang} size={r.size} italic={st.italicLetters} interactive={interactive} locked={r.lk} owner={r.s.id} shapeId={r.s.id} labelKey={`v${r.i}`} />));
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${w} ${h}`} {...(interactive ? {} : { width: crop?.w ?? w, height: crop?.h ?? h })} className={className} style={{ ...style, ['--ui' as string]: ui }} data-lang={lang}>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <rect width={w} height={h} fill="#fff" />
      {bodies}
      {drawn}
      {dots}
      {texts}
      {pickMarks}
      {hots}
      <g className="x-marks">{crossMarks}</g>
      {angleGuide && (
        <g pointerEvents="none" stroke="#4f6bed" strokeWidth={1.4 * ui} fill="none" strokeDasharray={`${7 * ui} ${6 * ui}`}>
          {angleGuide.rays.map(r => <line key={r.angle} x1={angleGuide.originPx.x} y1={angleGuide.originPx.y} x2={r.tip.x} y2={r.tip.y} strokeOpacity={0.45} />)}
          {angleGuide.path && angleGuide.path.length >= 2
            ? <path d={catmull(angleGuide.path)} fill="none" strokeWidth={2 * ui} strokeDasharray={`${5 * ui} ${4 * ui}`} strokeLinejoin="round" />
            : <line x1={angleGuide.originPx.x} y1={angleGuide.originPx.y} x2={angleGuide.tipPx.x} y2={angleGuide.tipPx.y} strokeWidth={2 * ui} strokeDasharray={`${5 * ui} ${4 * ui}`} />}
          <circle cx={angleGuide.tipPx.x} cy={angleGuide.tipPx.y} r={5 * ui} fill="#4f6bed" stroke="none" />
        </g>
      )}
      {overlay}
    </svg>
  );
}
