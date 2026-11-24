import { fromUnits, geometryOf, toUnits } from './scene';
import type { Vec } from './types';
import type { Target } from './tools';
import { buildWorld, fromPx, ownerOfRef, toPx } from './world';
import type { SceneData } from './types';

export const CARDINAL_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

const wrap = (d: number) => ((d % 360) + 360) % 360;
const angDiff = (a: number, b: number) => Math.min(wrap(a - b), wrap(b - a));

export function snapToAngles(deg: number, extras: number[] = []): number {
  const a = wrap(deg);
  const cand = [...CARDINAL_DEG, ...extras.map(wrap)];
  return cand.reduce((best, c) => (angDiff(a, c) < angDiff(a, best) ? c : best), cand[0]);
}

export function snapCardinal(deg: number, extras: number[] = []): number {
  return snapToAngles(deg, extras);
}

export function sceneAngle(from: Vec, to: Vec): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function alongAngle(from: Vec, deg: number, dist: number): Vec {
  const t = (deg * Math.PI) / 180;
  return { x: from.x + Math.cos(t) * dist, y: from.y + Math.sin(t) * dist };
}

export function targetScenePos(data: SceneData, t: Target): Vec | null {
  const world = buildWorld(data);
  if (t.kind === 'point') return world.ref(t.ref);
  if (t.kind === 'line') {
    const a = world.ref(t.a), b = world.ref(t.b);
    if (!a || !b) return null;
    return { x: a.x + (b.x - a.x) * t.k, y: a.y + (b.y - a.y) * t.k };
  }
  if (t.kind === 'world' || t.kind === 'circles') return { x: t.x, y: t.y };
  if (t.kind === 'free') {
    const s = data.shapes.find(x => x.id === t.shape);
    return s ? toUnits(s, { x: t.x, y: t.y }) : null;
  }
  return null;
}

export function extraGuideAngles(data: SceneData, from: Target): number[] {
  const ownerId = from.kind === 'point' ? ownerOfRef(data, from.ref) : from.kind === 'free' ? from.shape : undefined;
  const s = ownerId ? data.shapes.find(x => x.id === ownerId) : undefined;
  const out: number[] = [];
  const add = (deg: number) => { out.push(deg, deg + 180); };
  if (s?.sit) add((Math.atan2(s.sit.along.y, s.sit.along.x) * 180) / Math.PI);
  if (s?.defId === 'mech-wedge') {
    const g = geometryOf(s);
    if (g.points.length >= 2) {
      const A = toUnits(s, g.points[0]), B = toUnits(s, g.points[1]);
      add(sceneAngle(A, B));
    }
  }
  return out;
}

export function snapTargetToGuides(data: SceneData, from: Target, to: Target, extras: number[] = []): Target {
  const origin = targetScenePos(data, from);
  if (!origin) return to;
  if (to.kind === 'world') {
    const dist = Math.hypot(to.x - origin.x, to.y - origin.y);
    if (dist < 1e-6) return to;
    const snapped = alongAngle(origin, snapToAngles(sceneAngle(origin, to), extras), dist);
    return { ...to, x: snapped.x, y: snapped.y };
  }
  if (to.kind !== 'free') return to;
  const s = data.shapes.find(x => x.id === to.shape);
  if (!s) return to;
  const raw = toUnits(s, { x: to.x, y: to.y });
  const dist = Math.hypot(raw.x - origin.x, raw.y - origin.y);
  if (dist < 1e-6) return to;
  const snapped = alongAngle(origin, snapToAngles(sceneAngle(origin, raw), extras), dist);
  const local = fromUnits(s, snapped);
  return { ...to, x: local.x, y: local.y };
}

export function snapFreeToCardinal(data: SceneData, from: Target, free: Extract<Target, { kind: 'free' }>): Extract<Target, { kind: 'free' }> {
  const t = snapTargetToGuides(data, from, free);
  return t.kind === 'free' ? t : free;
}

export function cardinalGuide(data: SceneData, origin: Vec, mousePx: Vec, snap: boolean, extras: number[] = []): { originPx: Vec; tipPx: Vec; rays: { angle: number; tip: Vec }[]; deg: number } {
  const mouse = fromPx(data, mousePx);
  const dist = Math.hypot(mouse.x - origin.x, mouse.y - origin.y);
  const deg = snap ? snapToAngles(sceneAngle(origin, mouse), extras) : sceneAngle(origin, mouse);
  const far = Math.max(data.canvas.w, data.canvas.h) / (data.viewScale || 40);
  const angles = [...CARDINAL_DEG, ...extras.map(wrap)];
  const seen = new Set<string>();
  const rays = angles.filter(a => { const k = wrap(a).toFixed(1); if (seen.has(k)) return false; seen.add(k); return true; }).map(angle => ({ angle, tip: toPx(data, alongAngle(origin, angle, far)) }));
  return {
    originPx: toPx(data, origin),
    tipPx: toPx(data, alongAngle(origin, deg, dist)),
    deg,
    rays,
  };
}
