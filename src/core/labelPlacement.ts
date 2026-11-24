import type { Vec } from './types';
const norm = (v: Vec): Vec => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
function distSeg(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
}

export interface Obstacles {
  segs: [Vec, Vec][];
  circles: { c: Vec; r: number }[];
}
function distObs(p: Vec, o: Obstacles): number {
  let d = 1e9;
  for (const [a, b] of o.segs) d = Math.min(d, distSeg(p, a, b));
  for (const c of o.circles) d = Math.min(d, Math.abs(Math.hypot(p.x - c.c.x, p.y - c.c.y) - c.r));
  return d;
}

/** Pick the free spot around `anchor` (8 candidates) that stays clear of lines, preferring `outward`. */
export interface Box { c: Vec; w: number; h: number }
export function placeLabel(anchor: Vec, outward: Vec, w: number, h: number, o: Obstacles, taken: Box[] = [], vgap = 9): Vec {
  const scale=h/30.4;
  let best = add(anchor, outward, 30);
  let bestScore = -1e9;
  const ou = norm(outward);
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const c = { x: anchor.x + dx * (w / 2 + 9*scale), y: anchor.y + dy * (h / 2 + vgap*scale) };
      const samples = [c, { x: c.x - w / 2, y: c.y }, { x: c.x + w / 2, y: c.y }, { x: c.x, y: c.y - h / 2 }, { x: c.x, y: c.y + h / 2 }];
      const clear = Math.min(...samples.map((s) => distObs(s, o)));
      const dir = norm({ x: dx, y: dy });
      let score = Math.min(clear, 34*scale) + 16*scale * (dir.x * ou.x + dir.y * ou.y);
      for (const t of taken) {
        if (Math.abs(c.x - t.c.x) < (w + t.w) / 2 + 4*scale && Math.abs(c.y - t.c.y) < (h + t.h) / 2 + 4*scale) score -= 80*scale;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

