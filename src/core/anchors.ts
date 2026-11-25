import { geometryOf, toUnits } from './scene';
import type { AnchorKey, ShapeInstance, Vec } from './types';

export const ANCHOR_KEYS: AnchorKey[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

export function localAnchors(s: ShapeInstance): Record<AnchorKey, Vec> {
  const g = geometryOf(s);
  const local = [...g.points];
  if (g.circle) {
    const c = { x: g.circle.cx ?? 0, y: g.circle.cy ?? 0 }, r = g.circle.r;
    local.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
  }
  const fallback = { x: 0, y: 0 };
  if (!local.length) return Object.fromEntries(ANCHOR_KEYS.map(k => [k, fallback])) as Record<AnchorKey, Vec>;
  let minx = Math.min(...local.map(p => p.x)), maxx = Math.max(...local.map(p => p.x));
  let miny = Math.min(...local.map(p => p.y)), maxy = Math.max(...local.map(p => p.y));
  const span = Math.max(maxx - minx, maxy - miny, 0.4);
  if (maxx - minx < span * 0.05) {
    const m = (minx + maxx) / 2;
    minx = m - span / 2;
    maxx = m + span / 2;
  }
  if (maxy - miny < span * 0.05) {
    const m = (miny + maxy) / 2;
    miny = m - span / 2;
    maxy = m + span / 2;
  }
  const centre = g.circle
    ? { x: g.circle.cx ?? 0, y: g.circle.cy ?? 0 }
    : g.points.length
      ? { x: g.points.reduce((n, p) => n + p.x, 0) / g.points.length, y: g.points.reduce((n, p) => n + p.y, 0) / g.points.length }
      : { x: (minx + maxx) / 2, y: (miny + maxy) / 2 };
  const xOf = (k: AnchorKey) => (k === 'center' ? centre.x : k === 'top' || k === 'bottom' ? (minx + maxx) / 2 : k === 'left' || k.endsWith('left') ? minx : maxx);
  const yOf = (k: AnchorKey) => (k === 'center' ? centre.y : k === 'left' || k === 'right' ? (miny + maxy) / 2 : k === 'top' || k.startsWith('top') ? maxy : miny);
  return Object.fromEntries(ANCHOR_KEYS.map(k => [k, { x: xOf(k), y: yOf(k) }])) as Record<AnchorKey, Vec>;
}

export function unitAnchors(s: ShapeInstance): Record<AnchorKey, Vec> {
  const local = localAnchors(s);
  return Object.fromEntries(ANCHOR_KEYS.map(k => [k, toUnits(s, local[k])])) as Record<AnchorKey, Vec>;
}

export function canHaveAnchors(s: ShapeInstance): boolean {
  return !(s.axes||s.chart) && !s.solid && !s.caption;
}
