import type { Lang, SceneData, ShapeInstance, Vec } from './types';
import type { ChartLayout } from './chartLayout';
import { toUnits } from './scene';
import { toPx } from './world';
import { labelSize } from './labelSizing';
import { formatNumber, toArabicDigits } from './labels';

/** Fill colours of the pie sectors when a row has no colour of its own (the reference chart's pastels). */
export const PIE_COLORS = ['#E1877D', '#F4C871', '#80B0DE', '#95C68F', '#AD8FE9'];

const numText = (n: number, lang: Lang) => (lang === 'ar' ? toArabicDigits(formatNumber(n)) : formatNumber(n));
const estW = (t: string, size: number) => Math.max([...t].length, 1) * size * 0.56;
const rad = (d: number) => (d * Math.PI) / 180;

function helpers(data: SceneData, s: ShapeInstance, lang: Lang, out: ChartLayout) {
  const P = (x: number, y: number): Vec => toPx(data, toUnits(s, { x, y }));
  const pt = (p: Vec) => { out.pts.push(p); return p; };
  const nudged = (key: string, pos: Vec): Vec => { const nd = s.nudgeByLang?.[lang]?.[key] ?? s.nudge[key]; return { x: pos.x + (nd?.x ?? 0), y: pos.y + (nd?.y ?? 0) }; };
  const text = (key: string, pos: Vec, t: string, size: number) => { if (t) out.texts.push({ key, pos: nudged(key, pos), text: t, size }); };
  const pick = (t: { ar: string; en: string } | undefined) => (t ? (lang === 'ar' ? t.ar || t.en : t.en || t.ar) : '').trim();
  return { P, pt, nudged, text, pick };
}

/** Pie chart: sectors counter-clockwise from `startAngle`, separators, and the name + value inside each sector. */
export function pieLayout(data: SceneData, s: ShapeInstance, lang: Lang, out: ChartLayout): ChartLayout {
  const c = s.chart!, fs = labelSize(data, s, lang), R = s.params.w / 2;
  const { P, pt, text, pick } = helpers(data, s, lang, out);
  const vals = c.points.map((p) => Math.max(0, p.y)), total = vals.reduce((a, b) => a + b, 0);
  const start = c.startAngle ?? 0, centre = P(0, 0), shown = vals.filter((v) => v > 0).length;
  const at = (deg: number, r: number) => P(R * r * Math.cos(rad(deg)), R * r * Math.sin(rad(deg)));
  let acc = 0;
  if (total > 0) c.points.forEach((p, i) => {
    if (vals[i] <= 0) return;
    const a0 = start + (acc / total) * 360, a1 = start + ((acc + vals[i]) / total) * 360;
    acc += vals[i];
    const steps = Math.max(2, Math.ceil((a1 - a0) / 2)), ring: Vec[] = [];
    for (let k = 0; k <= steps; k++) ring.push(at(a0 + ((a1 - a0) * k) / steps, 1));
    out.sectors.push({ pts: [centre, ...ring].map(pt), fill: p.color ?? PIE_COLORS[i % PIE_COLORS.length] });
    if (shown > 1) out.axes.push({ a: pt(centre), b: pt(at(a0, 1)) });
    const mid = at((a0 + a1) / 2, c.labelRadius ?? 0.58), name = pick(p.label), value = c.showValues === false ? '' : numText(p.y, lang);
    if (name && value) { text(`ct:pie:${i}:n`, { x: mid.x, y: mid.y - fs * 0.78 }, name, fs); text(`ct:pie:${i}:v`, { x: mid.x, y: mid.y + fs * 0.78 }, value, fs); }
    else text(`ct:pie:${i}:n`, mid, name || value, fs);
  });
  if (c.frame) { const ring: Vec[] = []; for (let d = 0; d <= 360; d += 4) ring.push(pt(at(d, 1))); out.line = ring; out.lineColor = '#000'; }
  else { pt(at(0, 1)); pt(at(90, 1)); pt(at(180, 1)); pt(at(270, 1)); }
  const top = P(0, R);
  text('ct:title', { x: top.x, y: top.y - fs * 1.15 }, pick(c.title), fs);
  return out;
}

/** Stem-and-leaf plot: a header row, the stem | leaf rule lines, one row per stem, and the optional boxed key on the right. */
export function stemLayout(data: SceneData, s: ShapeInstance, lang: Lang, out: ChartLayout): ChartLayout {
  const c = s.chart!, fs = labelSize(data, s, lang);
  const { P, pt, nudged, text, pick } = helpers(data, s, lang, out);
  const cw = s.params.w, rh = s.params.h, rows = c.points, n = rows.length;
  const m = Math.max(1, ...rows.map((r) => r.leaves?.length ?? 0));
  const W = cw * (2.43 + m), H = rh * (n + 1), L = -W / 2, Rr = W / 2, T = H / 2, B = -H / 2;
  const vx = L + 2.03 * cw, rowY = (i: number) => T - rh * (i + 1.5);
  out.axes.push({ a: pt(P(L, T - rh)), b: pt(P(Rr, T - rh)) });
  out.axes.push({ a: pt(P(vx, T)), b: pt(P(vx, B)) });
  text('ct:head:stem', P(L + 1.015 * cw, T - rh / 2), pick(c.xTitle), fs);
  text('ct:head:leaf', P(vx + 1.1 * cw, T - rh / 2), pick(c.yTitle), fs);
  rows.forEach((r, i) => {
    text(`ct:stem:${i}`, P(L + 1.015 * cw, rowY(i)), numText(r.x, lang), fs);
    (r.leaves ?? []).forEach((v, j) => text(`ct:leaf:${i}:${j}`, P(vx + (1.1 + j) * cw, rowY(i)), numText(v, lang), fs));
  });
  const key = pick(c.keyText);
  if (c.showKey !== false && key) {
    const ks = fs * 0.92, bw = estW(key, ks) + fs * 2.8, bh = fs * 2.7;
    const base = P(Rr + 0.82 * cw, rowY(Math.min(1, Math.max(n - 1, 0))));
    const centre = nudged('ct:key', { x: base.x + bw / 2, y: base.y });
    text('ct:key', { x: base.x + bw / 2, y: base.y }, key, ks);
    const a = { x: centre.x - bw / 2, y: centre.y - bh / 2 }, b = { x: centre.x + bw / 2, y: centre.y + bh / 2 };
    const q = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    for (let k = 0; k < 4; k++) out.axes.push({ a: pt(q[k]), b: pt(q[(k + 1) % 4]) });
  }
  const top = P(0, T);
  text('ct:title', { x: top.x, y: top.y - fs * 1.15 }, pick(c.title), fs);
  return out;
}
