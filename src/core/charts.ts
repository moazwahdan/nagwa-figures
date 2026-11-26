import type { ShapeDef } from './shapes2d';
import type { ChartKind, ChartPoint, ChartSettings, ChartText, Vec } from './types';
import { isHexColor } from './palette';

const T = (en: string, ar: string): ChartText => ({ en, ar });

export function defaultChart(kind: ChartKind): ChartSettings {
  const base = {
    title: T('', ''), xTitle: T('', ''), yTitle: T('', ''),
    xMin: 0, xMax: 6, xStep: 1, yMin: 0, yMax: 10, yStep: 1,
    grid: 'none' as const, gridAt: 'center' as const, arrows: false, showAxisNames: false, showNumbers: true, frame: false, tickMarks: true, gridOverBars: true,
    barWidth: 0.5, color: '#62AADF', lineConnect: true, markers: true,
  };
  if (kind === 'bar') {
    const rows: [string, string, number][] = [['Apple', 'تفاح', 1], ['Banana', 'موز', 6], ['Mango', 'مانجو', 5], ['Orange', 'برتقال', 3]];
    return { ...base, kind, xTitle: T('Favorite Fruits', 'الفاكهة المفضلة'), yTitle: T('Number of Students', 'عدد الطلاب'), yMax: 7, grid: 'full',
      points: rows.map(([en, ar, y], i) => ({ x: i + 1, y, label: T(en, ar) })) };
  }
  if (kind === 'line') {
    return { ...base, kind, xTitle: T('Number of Flower Bouquets Sold', 'عدد الباقات المباعة'), yTitle: T('Money Earned (LE)', 'المبلغ المكتسب (جنيه)'),
      xMax: 6, yMax: 60, yStep: 10, grid: 'full', arrows: true, showAxisNames: true, color: '#E14B3B',
      points: [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: x * 10, marker: x > 0 })) };
  }
  if (kind === 'pie') {
    const rows: [string, string, number, string][] = [['Football', 'كرة القدم', 80, '#E1877D'], ['Basketball', 'كرة السلة', 40, '#F4C871'], ['Handball', 'كرة اليد', 30, '#80B0DE'], ['Tennis', 'التنس', 30, '#95C68F'], ['Swimming', 'السباحة', 60, '#AD8FE9']];
    return { ...base, kind, showValues: true, labelRadius: 0.58, startAngle: 0, points: rows.map(([en, ar, y, color]) => ({ x: 0, y, label: T(en, ar), color })) };
  }
  if (kind === 'stem') {
    const rows: [number, number[]][] = [[1, [0, 3, 6]], [2, [1, 6, 7, 8]], [3, [5, 5, 6]], [4, [1, 1, 5, 6, 9]], [5, [0, 3, 6, 8]]];
    return { ...base, kind, xTitle: T('Stem', 'الساق'), yTitle: T('Leaf', 'الورقة'), keyText: T('Key: 1 | 6 = 16 years old', 'المفتاح: ١ | ٦ = ١٦ سنة'), showKey: true,
      points: rows.map(([x, leaves]) => ({ x, y: 0, leaves })) };
  }
  const counts = [2, 1, 6, 5, 4, 1, 1];
  return { ...base, kind, axisPad: 0.65, title: T('Scores Achieved by Classes in School', 'الدرجات التي حصلت عليها الفصول'), arrows: true, color: '#333333',
    points: counts.map((y, x) => ({ x, y })) };
}

const LABELS: Record<ChartKind, [string, string]> = {
  bar: ['Bar chart', 'Vertical bars with a category axis, grid and axis titles.'],
  line: ['Line graph', 'Line graph on a square grid with arrowed axes and markers.'],
  dot: ['Dot plot', 'Dots stacked above a number line.'],
  pie: ['Pie chart', 'Coloured sectors sized by value, with the name and value inside each one.'],
  stem: ['Stem-and-leaf plot', 'Stems and leaves in a table, with an optional boxed key.'],
};

export const CHART_DEFS: ShapeDef[] = (['bar', 'line', 'dot', 'pie', 'stem'] as const).map((kind) => ({
  id: `chart-${kind}`,
  kind: 'chart' as const,
  group: 'Statistics' as const,
  label: LABELS[kind][0],
  tip: LABELS[kind][1],
  params: [
    { key: 'w', label: kind === 'pie' ? 'Diameter' : kind === 'stem' ? 'Column width' : 'Plot width', def: kind === 'dot' ? 8 : kind === 'line' ? 5.5 : kind === 'pie' ? 6 : kind === 'stem' ? 1 : 6, min: kind === 'stem' ? 0.2 : 1, max: 40 },
    { key: 'h', label: kind === 'stem' ? 'Row height' : 'Plot height', def: kind === 'dot' ? 0.4 : kind === 'line' ? 8 : kind === 'pie' ? 6 : kind === 'stem' ? 1 : 5, min: 0.2, max: 40 },
  ],
  build: (p) => ({ points: plotCorners(p.w, p.h) }),
}));

export function plotCorners(w: number, h: number): Vec[] {
  return [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (t: unknown) => !!t && typeof (t as ChartText).ar === 'string' && typeof (t as ChartText).en === 'string' && (t as ChartText).ar.length < 400 && (t as ChartText).en.length < 400;

/** Throws on anything the renderer cannot draw. */
export function validateChart(c: unknown): asserts c is ChartSettings {
  const s = c as ChartSettings | undefined;
  const bad = () => { throw new Error('Invalid chart definition.'); };
  if (!s || !['bar', 'line', 'dot', 'pie', 'stem'].includes(s.kind) || !text(s.title) || !text(s.xTitle) || !text(s.yTitle)) bad();
  if (!Array.isArray(s!.points) || s!.points.length > 60) bad();
  for (const k of ['xMin', 'xMax', 'xStep', 'yMin', 'yMax', 'yStep', 'barWidth'] as const) if (!finite(s![k])) bad();
  if (s!.xMax <= s!.xMin || s!.yMax <= s!.yMin || s!.xStep <= 0 || s!.yStep <= 0 || s!.barWidth <= 0 || s!.barWidth > 1) bad();
  if ((s!.xMax - s!.xMin) / s!.xStep > 200 || (s!.yMax - s!.yMin) / s!.yStep > 200) throw new Error('Too many ticks: increase the step.');
  if (!['none', 'horizontal', 'full'].includes(s!.grid) || !['center', 'edge', 'cell'].includes(s!.gridAt) || !isHexColor(s!.color)) bad();
  for (const k of ['xLabelMax', 'yLabelMin', 'yLabelMax', 'axisPad'] as const) if (s![k] !== undefined && !finite(s![k])) bad();
  if (s!.axisPad !== undefined && (s!.axisPad < 0 || s!.axisPad > 5)) bad();
  if (s!.gridOverBars !== undefined && typeof s!.gridOverBars !== 'boolean') bad();
  for (const k of ['arrows', 'showAxisNames', 'showNumbers', 'frame', 'tickMarks', 'lineConnect', 'markers'] as const) if (typeof s![k] !== 'boolean') bad();
  for (const k of ['showValues', 'showKey'] as const) if (s![k] !== undefined && typeof s![k] !== 'boolean') bad();
  if (s!.labelRadius !== undefined && (!finite(s!.labelRadius) || s!.labelRadius < 0 || s!.labelRadius > 1.5)) bad();
  if (s!.startAngle !== undefined && (!finite(s!.startAngle) || Math.abs(s!.startAngle) > 720)) bad();
  if (s!.keyText !== undefined && !text(s!.keyText)) bad();
  for (const p of s!.points as ChartPoint[]) {
    if (!finite(p.x) || !finite(p.y)) bad();
    if (s!.kind === 'pie' && p.y < 0) throw new Error('Pie values cannot be negative.');
    if (p.leaves !== undefined && (!Array.isArray(p.leaves) || p.leaves.length > 40 || p.leaves.some((v) => !Number.isInteger(v) || v < 0 || v > 999))) bad();
    if (p.color !== undefined && !isHexColor(p.color)) bad();
    if (p.label !== undefined && !text(p.label)) bad();
  }
}
