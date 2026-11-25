import type { Lang, SceneData, ShapeInstance, Vec } from './types';
import { toUnits } from './scene';
import { toPx } from './world';
import { labelSize } from './labelSizing';
import { ARROW_TO_STROKE, DOT_TO_STROKE } from './paper';
import { formatNumber, toArabicDigits } from './labels';
import { GRID_COLOR, INK_COLOR } from './palette';

export interface ChartTxt { key: string; pos: Vec; text: string; size: number; rot?: boolean; italic?: boolean }
export interface ChartSeg { a: Vec; b: Vec }
export interface ChartLayout {
  grid: ChartSeg[];
  axes: ChartSeg[];
  ticks: ChartSeg[];
  heads: { tip: Vec; dir: Vec }[];
  bars: { pts: Vec[]; fill: string }[];
  line: Vec[] | null;
  lineColor: string;
  dots: { c: Vec; r: number; color: string }[];
  texts: ChartTxt[];
  /** Every ink point except the glyph boxes. */
  pts: Vec[];
  stroke: number;
  arrowLen: number;
}

const numText = (n: number, lang: Lang) => (lang === 'ar' ? toArabicDigits(formatNumber(n)) : formatNumber(n));
const estW = (t: string, size: number) => Math.max([...t].length, 1) * size * 0.56;
const norm = (v: Vec): Vec => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };

/** Everything a chart draws, in image pixels. Shared by the renderer and the ink-bounds fit, so the two never disagree. */
export function chartLayout(data: SceneData, s: ShapeInstance, lang: Lang): ChartLayout {
  const c = s.chart!;
  const W = s.params.w, H = s.params.h;
  const stroke = data.style.stroke, fs = labelSize(data, s, lang), ui = Math.min(data.canvas.w, data.canvas.h) / 900;
  const P = (x: number, y: number): Vec => toPx(data, toUnits(s, { x, y }));
  const L = -W / 2, R = W / 2, B = -H / 2, Tp = H / 2;
  const n = c.points.length;
  const mapY = (v: number) => B + ((v - c.yMin) / (c.yMax - c.yMin)) * H;
  const mapX = (v: number) => L + ((v - c.xMin) / (c.xMax - c.xMin)) * W;
  const slot = W / Math.max(n, 1);
  const cx = (i: number) => L + (i + 0.5) * slot;
  const o = P(0, 0), ex = norm({ x: P(1, 0).x - o.x, y: P(1, 0).y - o.y }), ey = norm({ x: P(0, 1).x - o.x, y: P(0, 1).y - o.y });
  const add = (a: Vec, d: Vec, k = 1): Vec => ({ x: a.x + d.x * k, y: a.y + d.y * k });
  const arrowLen = stroke * ARROW_TO_STROKE, ext = arrowLen + stroke * 3;
  const out: ChartLayout = { grid: [], axes: [], ticks: [], heads: [], bars: [], line: null, lineColor: c.color, dots: [], texts: [], pts: [], stroke, arrowLen };
  const pt = (p: Vec) => { out.pts.push(p); return p; };
  const text = (key: string, pos: Vec, t: string, size: number, extra: Partial<ChartTxt> = {}) => {
    if (!t) return;
    const nd = s.nudgeByLang?.[lang]?.[key] ?? s.nudge[key];
    out.texts.push({ key, pos: { x: pos.x + (nd?.x ?? 0), y: pos.y + (nd?.y ?? 0) }, text: t, size, ...extra });
  };
  const pick = (t: { ar: string; en: string } | undefined) => (t ? (lang === 'ar' ? t.ar || t.en : t.en || t.ar) : '').trim();
  const tickSize = fs * 0.7;
  const dot = c.kind === 'dot', bar = c.kind === 'bar';
  const yAxis = !dot;

  /* Value ticks. */
  const stepsOf = (min: number, max: number, step: number) => {
    const list: number[] = [];
    for (let i = 0; i <= 1000; i++) { const v = Math.round((min + i * step) * 1e6) / 1e6; if (v > max + 1e-9) break; list.push(v); }
    return list;
  };
  const yTicks = yAxis ? stepsOf(c.yMin, c.yMax, c.yStep) : [];
  const xTicks = bar ? [] : stepsOf(c.xMin, c.xMax, c.xStep);

  /* Grid. */
  if (c.grid !== 'none' && !dot) {
    for (const v of yTicks) if (v > c.yMin + 1e-9) out.grid.push({ a: pt(P(L, mapY(v))), b: pt(P(R, mapY(v))) });
    if (c.grid === 'full') {
      if (bar) for (let i = c.gridAt === 'edge' ? 1 : 0; i < (c.gridAt === 'edge' ? n + 1 : n); i++) { const gx = c.gridAt === 'edge' ? L + i * slot : cx(i); out.grid.push({ a: pt(P(gx, B)), b: pt(P(gx, Tp)) }); }
      else for (const v of xTicks) if (v > c.xMin + 1e-9) out.grid.push({ a: pt(P(mapX(v), B)), b: pt(P(mapX(v), Tp)) });
    }
  }

  /* Data marks. */
  if (bar) {
    c.points.forEach((p, i) => {
      const half = (slot * c.barWidth) / 2, top = mapY(Math.min(Math.max(p.y, c.yMin), c.yMax));
      out.bars.push({ fill: p.color ?? c.color, pts: [P(cx(i) - half, B), P(cx(i) + half, B), P(cx(i) + half, top), P(cx(i) - half, top)].map(pt) });
    });
  } else if (c.kind === 'line') {
    const pts = c.points.map((p) => pt(P(mapX(p.x), mapY(p.y))));
    if (c.lineConnect && pts.length > 1) out.line = pts;
    if (c.markers) c.points.forEach((p, i) => { if (p.marker !== false) out.dots.push({ c: pts[i], r: Math.max(stroke * DOT_TO_STROKE, fs * 0.2), color: p.color ?? c.color }); });
  } else {
    const r = Math.max(stroke * DOT_TO_STROKE, fs * 0.24), base = P(0, B);
    for (const p of c.points) for (let k = 0; k < Math.round(p.y); k++) {
      const q = P(mapX(p.x), B);
      out.dots.push({ c: pt({ x: q.x + ey.x * (r * 2.4 + k * r * 4.6), y: q.y + ey.y * (r * 2.4 + k * r * 4.6) }), r, color: p.color ?? c.color });
    }
    void base;
    for (const d of out.dots) { pt({ x: d.c.x - d.r, y: d.c.y - d.r }); pt({ x: d.c.x + d.r, y: d.c.y + d.r }); }
  }
  if (c.kind === 'line') for (const d of out.dots) { pt({ x: d.c.x - d.r, y: d.c.y - d.r }); pt({ x: d.c.x + d.r, y: d.c.y + d.r }); }

  /* Axes with optional arrow heads. */
  const xa = P(L, B), xb = P(R, B), ya = P(L, B), yb = P(L, Tp);
  const axisTo = (a: Vec, b: Vec, u: Vec, arrowEnd: boolean, arrowStart = false) => {
    let p = a, q = b;
    if (arrowEnd) { const tip = add(b, u, ext); out.heads.push({ tip: pt(tip), dir: u }); q = add(tip, u, -arrowLen); }
    if (arrowStart) { const tip = add(a, u, -ext); out.heads.push({ tip: pt(tip), dir: { x: -u.x, y: -u.y } }); p = add(tip, u, arrowLen); }
    out.axes.push({ a: pt(p), b: pt(q) });
  };
  axisTo(xa, xb, ex, c.arrows, c.arrows && dot);
  if (yAxis) axisTo(ya, yb, ey, c.arrows);
  const xTip = add(xb, ex, c.arrows ? ext : 0), yTip = add(yb, ey, c.arrows ? ext : 0);
  if (c.showAxisNames && c.kind === 'line') {
    text('ct:axis:x', add(xTip, ex, fs * 0.8), lang === 'ar' ? 'س' : 'x', fs, { italic: true });
    text('ct:axis:y', add(yTip, ey, fs * 0.8), lang === 'ar' ? 'ص' : 'y', fs, { italic: true });
  }

  if (c.frame) for (const [a, b] of [[[L, B], [R, B]], [[R, B], [R, Tp]], [[R, Tp], [L, Tp]], [[L, Tp], [L, B]]] as const) out.axes.push({ a: pt(P(a[0], a[1])), b: pt(P(b[0], b[1])) });

  /* Ticks and numbers. */
  const oneZero = c.kind === 'line' && c.xMin === 0 && c.yMin === 0;
  let yLabelW = 0;
  if (yAxis) for (const v of yTicks) {
    const a = P(L, mapY(v));
    out.ticks.push({ a: pt(a), b: pt(add(a, ex, -5 * ui)) });
    if (!c.showNumbers || (oneZero && v === 0)) continue;
    const t = numText(v, lang), w = estW(t, tickSize);
    yLabelW = Math.max(yLabelW, w);
    text(`ct:y:${v}`, { x: a.x - (w / 2 + 8 * ui), y: a.y }, t, tickSize);
  }
  if (!bar) for (const v of xTicks) {
    const a = P(mapX(v), B);
    out.ticks.push({ a: pt(a), b: pt(add(a, ey, -5 * ui)) });
    if (!c.showNumbers || (oneZero && v === 0) || (c.xLabelMax !== undefined && v > c.xLabelMax + 1e-9)) continue;
    text(`ct:x:${v}`, { x: a.x, y: a.y + tickSize * 0.85 + 8 * ui }, numText(v, lang), tickSize);
  }
  if (oneZero && c.showNumbers) text('ct:zero', { x: xa.x - tickSize * 0.9, y: xa.y + tickSize * 0.9 + 4 * ui }, numText(0, lang), tickSize);

  /* Category names. */
  const catSize = fs * 0.8;
  if (bar) c.points.forEach((p, i) => { const a = P(cx(i), B); text(`ct:cat:${i}`, { x: a.x, y: a.y + catSize * 0.9 + 8 * ui }, pick(p.label), catSize); });

  /* Titles. */
  const rowBottom = (bar ? catSize : c.showNumbers ? tickSize : 0) * 1.7 + 8 * ui;
  const midX = P(0, B);
  text('ct:xTitle', { x: midX.x, y: midX.y + rowBottom + fs * 0.75 + 4 * ui }, pick(c.xTitle), fs * 0.9);
  const midY = P(L, 0);
  text('ct:yTitle', { x: midY.x - (yLabelW + 8 * ui) - fs * 1.05 - 6 * ui, y: midY.y }, pick(c.yTitle), fs * 0.9, { rot: true });
  const topMid = P(0, Tp);
  const topY = dot ? Math.min(topMid.y, ...out.pts.map((p) => p.y)) : topMid.y - (c.arrows && yAxis ? ext : 0);
  text('ct:title', { x: topMid.x, y: topY - fs * 1.15 }, pick(c.title), fs);
  return out;
}

export { GRID_COLOR, INK_COLOR };
