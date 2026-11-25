import { geometryOf } from './scene';
import type { ShapeInstance, Vec } from './types';

const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function polySnaps(p: Vec[], open?: boolean): Vec[] {
  if (!p.length) return [];
  const last = open || p.length < 3 ? p.length - 1 : p.length;
  const mids: Vec[] = [];
  for (let i = 0; i < last; i++) mids.push(mid(p[i], p[(i + 1) % p.length]));
  const c = { x: p.reduce((n, q) => n + q.x, 0) / p.length, y: p.reduce((n, q) => n + q.y, 0) / p.length };
  return [...p, ...mids, c];
}

export const COMPASS_DEG = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export const SIDE_FRACS = [0.25, 0.5, 0.75] as const;

function rim(c: Vec, r: number): Vec[] {
  return COMPASS_DEG.map((d) => {
    const t = (d * Math.PI) / 180;
    return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r };
  });
}

/** Vertices, side midpoints, centres, and 45° rim points on every drawable body. */
export function forceSnapLocals(s: ShapeInstance): Vec[] {
  if ((s.axes||s.chart) || s.caption) return [];
  const g = geometryOf(s);
  const out: Vec[] = [];
  if (g.circle) {
    const c = { x: g.circle.cx ?? 0, y: g.circle.cy ?? 0 };
    out.push(c, ...rim(c, g.circle.r));
  }
  for (const extra of g.circles ?? []) out.push({ x: extra.cx, y: extra.cy }, ...rim({ x: extra.cx, y: extra.cy }, extra.r));
  if (g.points.length) out.push(...polySnaps(g.points, g.open));
  const seen = new Set<string>();
  return out.filter(p => {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
