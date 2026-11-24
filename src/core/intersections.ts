import type { Ref, Vec } from './types';
/** A straight piece of the drawing (a shape side or a construction line) in canvas pixels. */
export interface PixelSegment { a: Ref; b: Ref; pa: Vec; pb: Vec }
/** Where two segments cross in their interiors, with the line parameter along the first segment. */
export interface Crossing { at: Vec; a: Ref; b: Ref; c: Ref; d: Ref; k: number }
const cross = (p: Vec, q: Vec) => p.x * q.y - p.y * q.x;
/**
 * Interior crossings between pairs of segments. Crossings that coincide with an existing point
 * (vertices, segment ends, other points) are left out because those points can already be picked,
 * and near-duplicate crossings (three lines through one point) are reported once.
 */
/** Parameters along a→b where the infinite line meets the circle, sorted from a toward b. */
export function lineCircleTs(a: Vec, b: Vec, c: Vec, r: number): number[] {
  const dx = b.x - a.x, dy = b.y - a.y, A = dx * dx + dy * dy;
  if (A < 1e-18 || !(r > 0)) return [];
  const fx = a.x - c.x, fy = a.y - c.y, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < -1e-8 * A) return [];
  if (disc <= 1e-8 * A) return [-B / (2 * A)];
  const s = Math.sqrt(disc);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].sort((p, q) => p - q);
}
/** Both intersections of two circles, ordered by angle around the first centre (y up). */
export function circleCircle(c1: Vec, r1: number, c2: Vec, r2: number): Vec[] {
  const dx = c2.x - c1.x, dy = c2.y - c1.y, d = Math.hypot(dx, dy);
  if (!(r1 > 0) || !(r2 > 0) || d < 1e-9 || d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -1e-6) return [];
  const h = Math.sqrt(Math.max(0, h2));
  const ux = dx / d, uy = dy / d, px = c1.x + a * ux, py = c1.y + a * uy;
  const pts = h < 1e-6
    ? [{ x: px, y: py }]
    : [{ x: px - uy * h, y: py + ux * h }, { x: px + uy * h, y: py - ux * h }];
  return pts.sort((p, q) => Math.atan2(p.y - c1.y, p.x - c1.x) - Math.atan2(q.y - c1.y, q.x - c1.x));
}
export function lineCircleAt(a: Vec, b: Vec, c: Vec, r: number, which: 0 | 1): Vec | null {
  const ts = lineCircleTs(a, b, c, r);
  const t = ts[Math.min(which, ts.length - 1)];
  if (t === undefined || !Number.isFinite(t)) return null;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export interface PixelCircle { shape: string; c: Vec; r: number }
/** Where a drawn segment meets a circle in its interior. `which` matches `lineCircleTs` order. */
export interface CircleHit { at: Vec; a: Ref; b: Ref; shape: string; which: 0 | 1; k: number }
export function findCircleHits(segments: PixelSegment[], circles: PixelCircle[], existing: Vec[], tol = 3, limit = 80): CircleHit[] {
  const out: CircleHit[] = [];
  for (const s of segments) {
    for (const circ of circles) {
      if (out.length >= limit) return out;
      const ts = lineCircleTs(s.pa, s.pb, circ.c, circ.r);
      ts.forEach((t, which) => {
        if (t <= 1e-3 || t >= 1 - 1e-3) return;
        const at = { x: s.pa.x + (s.pb.x - s.pa.x) * t, y: s.pa.y + (s.pb.y - s.pa.y) * t };
        const near = (p: Vec) => Math.hypot(p.x - at.x, p.y - at.y) < tol;
        if (near(s.pa) || near(s.pb) || existing.some(near) || out.some((c) => near(c.at))) return;
        out.push({ at, a: s.a, b: s.b, shape: circ.shape, which: which as 0 | 1, k: t });
      });
    }
  }
  return out;
}
export function findCrossings(segments: PixelSegment[], existing: Vec[], tol = 3, limit = 80): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 0; i < segments.length && out.length < limit; i++) {
    for (let j = i + 1; j < segments.length && out.length < limit; j++) {
      const s = segments[i], u = segments[j];
      const r = { x: s.pb.x - s.pa.x, y: s.pb.y - s.pa.y }, v = { x: u.pb.x - u.pa.x, y: u.pb.y - u.pa.y };
      const lr = Math.hypot(r.x, r.y), lv = Math.hypot(v.x, v.y), den = cross(r, v);
      if (lr < 1e-9 || lv < 1e-9 || Math.abs(den) < 1e-9 * lr * lv) continue; // degenerate, parallel or collinear
      const w = { x: u.pa.x - s.pa.x, y: u.pa.y - s.pa.y };
      const t = cross(w, v) / den, q = cross(w, r) / den;
      if (t < 0 || t > 1 || q < 0 || q > 1) continue;
      const at = { x: s.pa.x + r.x * t, y: s.pa.y + r.y * t };
      const near = (p: Vec) => Math.hypot(p.x - at.x, p.y - at.y) < tol;
      if (near(s.pa) || near(s.pb) || near(u.pa) || near(u.pb) || existing.some(near) || out.some(c => near(c.at))) continue;
      out.push({ at, a: s.a, b: s.b, c: u.a, d: u.b, k: t });
    }
  }
  return out;
}
