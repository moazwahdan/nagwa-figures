import type { GeoStroke, Geometry, ShapeDef } from './shapes2d';
import type { Vec } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

function recenter(geo: Geometry): Geometry {
  const pts: Vec[] = [...geo.points];
  for (const stroke of geo.strokes ?? []) pts.push(...stroke.pts);
  if (geo.circle) {
    const cx = geo.circle.cx ?? 0, cy = geo.circle.cy ?? 0;
    pts.push({ x: cx - geo.circle.r, y: cy }, { x: cx + geo.circle.r, y: cy }, { x: cx, y: cy - geo.circle.r }, { x: cx, y: cy + geo.circle.r });
  }
  for (const extra of geo.circles ?? []) {
    pts.push({ x: extra.cx - extra.r, y: extra.cy }, { x: extra.cx + extra.r, y: extra.cy }, { x: extra.cx, y: extra.cy - extra.r }, { x: extra.cx, y: extra.cy + extra.r });
  }
  if (!pts.length) return geo;
  const cx = (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2;
  const cy = (Math.min(...pts.map(p => p.y)) + Math.max(...pts.map(p => p.y))) / 2;
  const t = (p: Vec): Vec => ({ x: p.x - cx, y: p.y - cy });
  return {
    ...geo,
    points: geo.points.map(t),
    strokes: geo.strokes?.map(s => ({ ...s, pts: s.pts.map(t) })),
    circle: geo.circle ? { ...geo.circle, cx: (geo.circle.cx ?? 0) - cx, cy: (geo.circle.cy ?? 0) - cy } : undefined,
    circles: geo.circles?.map(c => ({ ...c, cx: c.cx - cx, cy: c.cy - cy })),
  };
}

/** Short 45° hatch ticks on one side of a supporting line (not perpendicular). */
function hatch(from: Vec, to: Vec, side: 1 | -1, step = 0.45, len = 0.28): GeoStroke[] {
  const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy * side, ny = ux * side;
  const hx = (ux + nx) * Math.SQRT1_2, hy = (uy + ny) * Math.SQRT1_2;
  const strokes: GeoStroke[] = [];
  for (let t = step * 0.4; t < L; t += step) {
    const x = from.x + ux * t, y = from.y + uy * t;
    strokes.push({ pts: [{ x, y }, { x: x + hx * len, y: y + hy * len }], hatch: true });
  }
  return strokes;
}

export const MECHANICS_DEFS: ShapeDef[] = [
  {
    id: 'mech-particle',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Particle',
    tip: 'A point mass. Add force arrows and strings around it.',
    params: [{ key: 'r', label: 'Radius', def: 0.28, min: 0.12, max: 1.2, step: 0.02 }],
    build: ({ r }) => recenter({ points: [], circle: { r } }),
  },
  {
    id: 'mech-block',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Block',
    tip: 'Rectangular body (crate, lift cabin, mass on a plane).',
    params: [{ key: 'w', label: 'Width', def: 3.2, min: 0.5, max: 40 }, { key: 'h', label: 'Height', def: 2.2, min: 0.5, max: 40 }],
    build: ({ w, h }) => recenter({ points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }),
  },
  {
    id: 'mech-rod',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Rod',
    tip: 'Uniform rod. Endpoints can take weights, hinges and strings.',
    params: [{ key: 'l', label: 'Length', def: 6, min: 0.8, max: 80 }, { key: 'weight', label: 'Line weight', def: 1, min: 0.5, max: 4, step: 0.1 }],
    build: ({ l }) => recenter({ points: [{ x: 0, y: 0 }, { x: l, y: 0 }], open: true, strokes: [{ pts: [{ x: 0, y: 0 }, { x: l, y: 0 }] }] }),
  },
  {
    id: 'mech-wedge',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Inclined plane',
    tip: 'Wedge / rough or smooth incline. Slope length and angle set the geometry.',
    params: [
      { key: 'l', label: 'Slope length', def: 7, min: 1, max: 80 },
      { key: 'angle', label: 'Incline (°)', def: 30, min: 5, max: 80, step: 1 },
      { key: 'rough', label: 'Surface', def: 1, min: 0, max: 1, options: [{value:1,label:'Rough — show hatching'},{value:0,label:'Smooth — hide hatching'}] },
    ],
    build: ({ l, angle, rough }) => {
      const a = rad(angle), B = { x: l * Math.cos(a), y: l * Math.sin(a) };
      const A = { x: 0, y: 0 };
      return recenter({ points: [A, B], open: true, strokes: [{ pts: [A, B] }, ...(rough ? hatch(A, B, -1) : [])] });
    },
  },
  {
    id: 'mech-ground',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Ground',
    tip: 'Horizontal surface with hatching.',
    params: [{ key: 'w', label: 'Width', def: 8, min: 1, max: 80 }, { key: 'rough', label: 'Surface', def: 1, min: 0, max: 1, options: [{value:1,label:'Rough — show hatching'},{value:0,label:'Smooth — hide hatching'}] }],
    build: ({ w, rough }) => {
      const A = { x: 0, y: 0 }, B = { x: w, y: 0 };
      return recenter({ points: [A, B], open: true, strokes: [{ pts: [A, B] }, ...(rough ? hatch(A, B, -1) : [])] });
    },
  },
  {
    id: 'mech-wall',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Wall',
    tip: 'Vertical surface with hatching.',
    params: [{ key: 'h', label: 'Height', def: 6, min: 1, max: 80 }, { key: 'rough', label: 'Surface', def: 1, min: 0, max: 1, options: [{value:1,label:'Rough — show hatching'},{value:0,label:'Smooth — hide hatching'}] }, {key:'hatchSide',label:'Hatching direction',def:-1,min:-1,max:1,options:[{value:-1,label:'Left'},{value:1,label:'Right'}]}],
    build: ({ h, rough, hatchSide }) => {
      const A = { x: 0, y: 0 }, B = { x: 0, y: h };
      return recenter({ points: [A, B], open: true, strokes: [{ pts: [A, B] }, ...(rough ? hatch(A, B, hatchSide >= 0 ? 1 : -1) : [])] });
    },
  },
  {
    id: 'mech-pulley',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Pulley',
    tip: 'Fixed pulley with a ceiling bracket. Strings attach on the rim.',
    params: [{ key: 'r', label: 'Radius', def: 0.9, min: 0.25, max: 4, step: 0.05 }],
    build: ({ r }) => {
      const c = { x: 0, y: 0 };
      const top = { x: 0, y: r + 0.55 };
      return recenter({
        points: [{ x: -r, y: 0 }, { x: r, y: 0 }],
        open: true,
        circle: { r, cx: c.x, cy: c.y },
        circles: [{ r: r * 0.55, cx: c.x, cy: c.y }],
        strokes: [
          { pts: [{ x: -r * 0.35, y: r * 0.75 }, top, { x: r * 0.35, y: r * 0.75 }] },
          { pts: [{ x: -0.7, y: top.y }, { x: 0.7, y: top.y }] },
        ],
      });
    },
  },
  {
    id: 'mech-roller',
    kind: 'mechanics',
    group: 'Mechanics',
    label: 'Roller',
    tip: 'Roller support: a wheel on a hatched surface.',
    params: [{ key: 'r', label: 'Radius', def: 0.55, min: 0.2, max: 2.5, step: 0.05 }],
    build: ({ r }) => {
      const A = { x: -r * 1.8, y: -r }, B = { x: r * 1.8, y: -r };
      return recenter({
        points: [{ x: 0, y: 0 }],
        open: true,
        circle: { r, cx: 0, cy: 0 },
        strokes: [{ pts: [A, B] }, ...hatch(A, B, -1, 0.4, 0.22)],
      });
    },
  },
  {
    id: 'mech-hinge',
    kind: 'mechanics',
    group: 'Mechanics',
    hidden: true,
    label: 'Hinge',
    tip: 'Use Hinge on rod in Constructions.',
    params: [{ key: 's', label: 'Size', def: 0.7, min: 0.25, max: 2.5, step: 0.05 }],
    build: ({ s }) => recenter({
      points: [{ x: -s, y: 0 }, { x: s, y: 0 }, { x: 0, y: s * 0.9 }],
      open: true,
      strokes: [{ pts: [{ x: -s, y: 0 }, { x: s, y: 0 }, { x: 0, y: s * 0.9 }], closed: true, fill: true }],
    }),
  },
  {
    id: 'mech-force',
    kind: 'mechanics',
    group: 'Mechanics',
    hidden: true,
    label: 'Force',
    tip: 'Use the Force construction.',
    params: [{ key: 'l', label: 'Length', def: 3.2, min: 0.6, max: 80 }, { key: 'weight', label: 'Line weight', def: 1, min: 0.5, max: 4, step: 0.1 }],
    build: ({ l }) => recenter({ points: [{ x: 0, y: 0 }, { x: l, y: 0 }], open: true, strokes: [{ pts: [{ x: 0, y: 0 }, { x: l, y: 0 }], arrow: true }] }),
  },
];
