import { AXES_DEFS } from './axes';
import { CHART_DEFS } from './charts';
import { MECHANICS_DEFS } from './shapesMechanics';
import { SOLID_DEFS, type SolidGeometry } from './shapes3d';
import type { SolidSettings, Vec } from './types';
import type { ShapeKind } from './types';

export interface ParamDef {
  key: string;
  label: string;
  def: number;
  min: number;
  max: number;
  step?: number;
  /** If present the param is a choice: value -> label */
  options?: { value: number; label: string }[];
}

export interface GeoStroke {
  pts: Vec[];
  closed?: boolean;
  dashed?: boolean;
  arrow?: boolean;
  fill?: boolean;
  hatch?: boolean;
}

export interface Geometry {
  /** Vertices in order (math coordinates, y up), bbox-centred. */
  points: Vec[];
  circle?: { r: number; cx?: number; cy?: number };
  circles?: { r: number; cx: number; cy: number }[];
  strokes?: GeoStroke[];
  /** When true, `points` is an open chain (a rod, string, ground) rather than a filled polygon. */
  open?: boolean;
  error?: string;
  solid?: SolidGeometry;
}

export interface ShapeDef {
  id: string;
  kind: ShapeKind;
  group: 'Triangles' | 'Quadrilaterals' | 'Polygons & circle' | '3D solids' | 'Axes' | 'Charts' | 'Mechanics' | 'Texts';
  hidden?: boolean;
  label: string;
  tip: string;
  params: ParamDef[];
  build: (p: Record<string, number>, settings?: SolidSettings) => Geometry;
}

const rad = (d: number) => (d * Math.PI) / 180;

function centre(points: Vec[]): Vec[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

function poly(points: Vec[], error?: string): Geometry {
  return { points: centre(points), error };
}

/** Cyclically shift so that the vertex at index `from` ends up at index `to`. */
function shiftTo(pts: Vec[], from: number, to: number): Vec[] {
  const n = pts.length;
  const k = (((from - to) % n) + n) % n;
  return pts.map((_, i) => pts[(i + k) % n]);
}

const RIGHT_AT: ParamDef = {
  key: 'rightAt',
  label: 'Right angle at',
  def: 1,
  min: 0,
  max: 2,
  options: [
    { value: 0, label: 'A' },
    { value: 1, label: 'B' },
    { value: 2, label: 'C' },
  ],
};

const sq = (n: number) => n * n;

export const SHAPE_DEFS: ShapeDef[] = [
  {
    id: 'tri-equilateral',
    kind: 'triangle',
    group: 'Triangles',
    label: 'Equilateral',
    tip: 'Triangle with three equal sides (all angles 60°).',
    params: [{ key: 's', label: 'Side', def: 5, min: 0.5, max: 100 }],
    build: ({ s }) => poly([{ x: s / 2, y: (s * Math.sqrt(3)) / 2 }, { x: 0, y: 0 }, { x: s, y: 0 }]),
  },
  {
    id: 'tri-isosceles',
    kind: 'triangle',
    group: 'Triangles',
    label: 'Isosceles',
    tip: 'Two equal legs and a base. Apex is vertex A.',
    params: [
      { key: 'base', label: 'Base', def: 6, min: 0.5, max: 100 },
      { key: 'leg', label: 'Equal leg', def: 5, min: 0.5, max: 100 },
    ],
    build: ({ base, leg }) => {
      const k = sq(leg) - sq(base / 2);
      if (k <= 0) return poly([{ x: base / 2, y: 0.01 }, { x: 0, y: 0 }, { x: base, y: 0 }], 'Leg is too short for this base');
      return poly([{ x: base / 2, y: Math.sqrt(k) }, { x: 0, y: 0 }, { x: base, y: 0 }]);
    },
  },
  {
    id: 'tri-scalene',
    kind: 'triangle',
    group: 'Triangles',
    label: 'Scalene',
    tip: 'Triangle from its three sides: a = BC, b = CA, c = AB.',
    params: [
      { key: 'a', label: 'a = BC', def: 7, min: 0.5, max: 100 },
      { key: 'b', label: 'b = CA', def: 5, min: 0.5, max: 100 },
      { key: 'c', label: 'c = AB', def: 6, min: 0.5, max: 100 },
    ],
    build: ({ a, b, c }) => {
      const x = (sq(a) + sq(c) - sq(b)) / (2 * a);
      const k = sq(c) - sq(x);
      if (k <= 0) return poly([{ x: a / 2, y: 0.01 }, { x: 0, y: 0 }, { x: a, y: 0 }], 'These sides do not form a triangle');
      return poly([{ x, y: Math.sqrt(k) }, { x: 0, y: 0 }, { x: a, y: 0 }]);
    },
  },
  {
    id: 'tri-right',
    kind: 'triangle',
    group: 'Triangles',
    label: 'Right',
    tip: 'Right-angled triangle from its two legs. Choose which vertex holds the right angle.',
    params: [
      { key: 'l1', label: 'Leg 1', def: 4, min: 0.5, max: 100 },
      { key: 'l2', label: 'Leg 2', def: 3, min: 0.5, max: 100 },
      RIGHT_AT,
    ],
    build: ({ l1, l2, rightAt }) => {
      // right angle built at index 1, then shifted so it lands on `rightAt`
      const pts = [{ x: 0, y: l2 }, { x: 0, y: 0 }, { x: l1, y: 0 }];
      return poly(shiftTo(pts, 1, rightAt));
    },
  },
  {
    id: 'tri-right-isosceles',
    kind: 'triangle',
    group: 'Triangles',
    label: 'Right isosceles',
    tip: 'Right triangle with two equal legs (45° - 45° - 90°).',
    params: [{ key: 'l', label: 'Leg', def: 4, min: 0.5, max: 100 }, RIGHT_AT],
    build: ({ l, rightAt }) => poly(shiftTo([{ x: 0, y: l }, { x: 0, y: 0 }, { x: l, y: 0 }], 1, rightAt)),
  },
  {
    id: 'tri-obtuse',
    kind: 'triangle',
    group: 'Triangles',
    label: 'Obtuse',
    tip: 'Triangle with an obtuse angle at vertex B, from two sides and that angle.',
    params: [
      { key: 'base', label: 'BC', def: 5, min: 0.5, max: 100 },
      { key: 'side', label: 'BA', def: 3.5, min: 0.5, max: 100 },
      { key: 'angle', label: '∠B (°)', def: 120, min: 91, max: 175, step: 1 },
    ],
    build: ({ base, side, angle }) =>
      poly([{ x: side * Math.cos(rad(angle)), y: side * Math.sin(rad(angle)) }, { x: 0, y: 0 }, { x: base, y: 0 }]),
  },
  {
    id: 'quad-square',
    kind: 'square',
    group: 'Quadrilaterals',
    label: 'Square',
    tip: 'Four equal sides and four right angles.',
    params: [{ key: 's', label: 'Side', def: 4, min: 0.5, max: 100 }],
    build: ({ s }) => poly([{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }]),
  },
  {
    id: 'quad-rectangle',
    kind: 'rectangle',
    group: 'Quadrilaterals',
    label: 'Rectangle',
    tip: 'Width × height with four right angles.',
    params: [
      { key: 'w', label: 'Width', def: 6, min: 0.5, max: 100 },
      { key: 'h', label: 'Height', def: 4, min: 0.5, max: 100 },
    ],
    build: ({ w, h }) => poly([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]),
  },
  {
    id: 'quad-rhombus',
    kind: 'rhombus',
    group: 'Quadrilaterals',
    label: 'Rhombus',
    tip: 'Four equal sides; the angle at A sets how slanted it is.',
    params: [
      { key: 's', label: 'Side', def: 4, min: 0.5, max: 100 },
      { key: 'angle', label: '∠A (°)', def: 60, min: 10, max: 170, step: 1 },
    ],
    build: ({ s, angle }) => {
      const c = s * Math.cos(rad(angle));
      const h = s * Math.sin(rad(angle));
      return poly([{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s + c, y: h }, { x: c, y: h }]);
    },
  },
  {
    id: 'quad-parallelogram',
    kind: 'parallelogram',
    group: 'Quadrilaterals',
    label: 'Parallelogram',
    tip: 'Base, slanted side and the angle at A.',
    params: [
      { key: 'base', label: 'Base AB', def: 6, min: 0.5, max: 100 },
      { key: 'side', label: 'Side AD', def: 3.5, min: 0.5, max: 100 },
      { key: 'angle', label: '∠A (°)', def: 60, min: 10, max: 170, step: 1 },
    ],
    build: ({ base, side, angle }) => {
      const c = side * Math.cos(rad(angle));
      const h = side * Math.sin(rad(angle));
      return poly([{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base + c, y: h }, { x: c, y: h }]);
    },
  },
  {
    id: 'quad-trapezoid-right',
    kind: 'trapezoid',
    group: 'Quadrilaterals',
    label: 'Right trapezoid',
    tip: 'Trapezoid with two right angles (at A and D).',
    params: [
      { key: 'base', label: 'Long base AB', def: 7, min: 0.5, max: 100 },
      { key: 'top', label: 'Short base DC', def: 4, min: 0.5, max: 100 },
      { key: 'h', label: 'Height', def: 3.5, min: 0.5, max: 100 },
    ],
    build: ({ base, top, h }) => poly([{ x: 0, y: 0 }, { x: base, y: 0 }, { x: top, y: h }, { x: 0, y: h }]),
  },
  {
    id: 'quad-trapezoid-isosceles',
    kind: 'trapezoid',
    group: 'Quadrilaterals',
    label: 'Isosceles trapezoid',
    tip: 'Trapezoid whose non-parallel sides are equal.',
    params: [
      { key: 'base', label: 'Long base AB', def: 7, min: 0.5, max: 100 },
      { key: 'top', label: 'Short base DC', def: 4, min: 0.5, max: 100 },
      { key: 'h', label: 'Height', def: 3, min: 0.5, max: 100 },
    ],
    build: ({ base, top, h }) => {
      const d = (base - top) / 2;
      return poly([{ x: 0, y: 0 }, { x: base, y: 0 }, { x: base - d, y: h }, { x: d, y: h }]);
    },
  },
  ...[5, 6, 7, 8].map<ShapeDef>((n) => ({
    id: `poly-${n}`,
    kind: 'polygon',
    group: 'Polygons & circle',
    label: { 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon', 8: 'Octagon' }[n] as string,
    tip: `Regular polygon with ${n} equal sides.`,
    params: [{ key: 's', label: 'Side', def: 3, min: 0.5, max: 100 }],
    build: ({ s }) => {
      const R = s / (2 * Math.sin(Math.PI / n));
      const start = -Math.PI / 2 - Math.PI / n; // bottom edge horizontal, A at bottom-left
      return poly(
        Array.from({ length: n }, (_, i) => ({
          x: R * Math.cos(start + (2 * Math.PI * i) / n),
          y: R * Math.sin(start + (2 * Math.PI * i) / n),
        })),
      );
    },
  })),
  {
    id: 'poly-n',
    kind: 'polygon',
    group: 'Polygons & circle',
    label: 'Regular n-gon',
    tip: 'Regular polygon with any number of sides (3 – 20).',
    params: [
      { key: 'n', label: 'Sides', def: 9, min: 3, max: 20, step: 1 },
      { key: 's', label: 'Side', def: 2.5, min: 0.5, max: 100 },
    ],
    build: ({ n, s }) => {
      const N = Math.max(3, Math.min(20, Math.round(n)));
      const R = s / (2 * Math.sin(Math.PI / N));
      const start = -Math.PI / 2 - Math.PI / N;
      return poly(
        Array.from({ length: N }, (_, i) => ({
          x: R * Math.cos(start + (2 * Math.PI * i) / N),
          y: R * Math.sin(start + (2 * Math.PI * i) / N),
        })),
      );
    },
  },
  {
    id: 'circle',
    kind: 'circle',
    group: 'Polygons & circle',
    label: 'Circle',
    tip: 'Circle with an optional labelled centre.',
    params: [{ key: 'r', label: 'Radius', def: 3, min: 0.5, max: 100 }],
    build: ({ r }) => ({ points: [], circle: { r } }),
  },
];

SHAPE_DEFS.push(
  ...SOLID_DEFS,
  ...AXES_DEFS,
  ...CHART_DEFS,
  ...MECHANICS_DEFS,
  {
    id: 'free-poly',
    kind: 'polygon',
    group: 'Polygons & circle',
    hidden: true,
    label: 'Free line',
    tip: 'A free-drawn polyline or polygon. Scale, rotate and edit its vertices from the right panel.',
    params: [{ key: 'n', label: 'Vertices', def: 3, min: 2, max: 20, step: 1 }],
    build: ({ n }) => {
      const N = Math.max(2, Math.min(20, Math.round(n)));
      const R = 2;
      const start = -Math.PI / 2;
      return {
        points: Array.from({ length: N }, (_, i) => ({
          x: R * Math.cos(start + (2 * Math.PI * i) / N),
          y: R * Math.sin(start + (2 * Math.PI * i) / N),
        })),
        open: N < 3,
      };
    },
  },
  {
    id: 'figure-text',
    kind: 'caption',
    group: 'Texts',
    hidden: true,
    label: 'Text',
    tip: 'Free bilingual text. Arabic and English are written separately. Wrap math in $...$ like $\\\\frac{\\\\text{Area}}{5}$.',
    params: [],
    build: () => ({ points: [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: -2, y: 1 }] }),
  },
);

export const DEF_BY_ID: Record<string, ShapeDef> = Object.fromEntries(SHAPE_DEFS.map((d) => [d.id, d]));

export function defaultParams(def: ShapeDef): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.def]));
}

export function interiorAngles(points: Vec[]): number[] {
  const n = points.length;
  return points.map((p, i) => {
    const a = points[(i + n - 1) % n];
    const b = points[(i + 1) % n];
    const u = { x: a.x - p.x, y: a.y - p.y };
    const v = { x: b.x - p.x, y: b.y - p.y };
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

export function sideLengths(points: Vec[], open = false): number[] {
  const n = points.length;
  const count = open ? Math.max(0, n - 1) : n;
  return Array.from({ length: count }, (_, i) => Math.hypot(points[(i + 1) % n].x - points[i].x, points[(i + 1) % n].y - points[i].y));
}
