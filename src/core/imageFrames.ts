import type { CanvasSize, StyleSettings } from './types';

/** Ink tuned for a canvas whose shorter side is 900px (the old 900×1200 sheet). */
const INK_REFERENCE = 900;

export type ImageOrient = 'portrait' | 'landscape' | 'square';
export type GrowDir = 'left' | 'right' | 'up' | 'down';

export interface ImageFrame {
  id: ImageOrient;
  orient: ImageOrient;
  label: string;
  w: number;
  h: number;
  maxW: number;
  maxH: number;
}

export const CANVAS_MIN = 200;

export const IMAGE_FRAMES: ImageFrame[] = [
  { id: 'portrait', orient: 'portrait', label: 'Portrait', w: 200, h: 250, maxW: 350, maxH: 360 },
  { id: 'landscape', orient: 'landscape', label: 'Landscape', w: 250, h: 200, maxW: 360, maxH: 350 },
  { id: 'square', orient: 'square', label: 'Square', w: 200, h: 200, maxW: 360, maxH: 360 },
];

export const QUESTION_PORTRAIT = IMAGE_FRAMES[0];

export const CANVAS_PRESETS: Record<string, CanvasSize> = {
  portrait: { w: 200, h: 250 },
  landscape: { w: 250, h: 200 },
  square: { w: 200, h: 200 },
  '3:4': { w: 200, h: 250 },
  '4:3': { w: 250, h: 200 },
  '1:1': { w: 200, h: 200 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export function orientOf(w: number, h: number): ImageOrient {
  if (w === h) return 'square';
  return h > w ? 'portrait' : 'landscape';
}

export function inferFrame(w: number, h: number): ImageFrame {
  const id = orientOf(w, h);
  return IMAGE_FRAMES.find((f) => f.id === id) ?? IMAGE_FRAMES[0];
}

/** Clamp a size to the chosen orientation. Square keeps both sides equal. */
export function frameSize(frame: ImageFrame, w: number, h: number, prefer: 'w' | 'h' = 'w'): CanvasSize {
  if (frame.orient === 'square') {
    const side = clamp(prefer === 'h' ? h : w, CANVAS_MIN, Math.min(frame.maxW, frame.maxH));
    return { w: side, h: side };
  }
  return { w: clamp(w, CANVAS_MIN, frame.maxW), h: clamp(h, CANVAS_MIN, frame.maxH) };
}

export function canvasLimitError(w: number, h: number): string | null {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < CANVAS_MIN || h < CANVAS_MIN) {
    return `Canvas dimensions: integers from ${CANVAS_MIN} px.`;
  }
  const frame = inferFrame(w, h);
  if (w > frame.maxW || h > frame.maxH) {
    if (frame.orient === 'square') return `Square images are at most ${frame.maxW}×${frame.maxH} px.`;
    if (frame.orient === 'portrait') return `Portrait images are at most ${frame.maxW} px wide and ${frame.maxH} px tall.`;
    return `Landscape images are at most ${frame.maxW} px wide and ${frame.maxH} px tall.`;
  }
  return null;
}

export function limitText(frame: ImageFrame): string {
  if (frame.orient === 'portrait') return `Portrait: default ${frame.w}×${frame.h} px. Width at most ${frame.maxW} px, height at most ${frame.maxH} px.`;
  if (frame.orient === 'landscape') return `Landscape: default ${frame.w}×${frame.h} px. Width at most ${frame.maxW} px, height at most ${frame.maxH} px.`;
  return `Square: default ${frame.w}×${frame.h} px. At most ${frame.maxW}×${frame.maxH} px.`;
}

export function growRoom(w: number, h: number, dir: GrowDir): { room: number; max: number; axis: 'width' | 'height' } {
  const frame = inferFrame(w, h);
  const axis = dir === 'left' || dir === 'right' ? 'width' : 'height';
  const max = axis === 'width' ? frame.maxW : frame.maxH;
  const current = axis === 'width' ? w : h;
  return { room: Math.max(0, max - current), max, axis };
}

/** Keep line, mark, arc and dot weight in proportion to the canvas. Label size stays a ratio.
 * Floors only stop the ink from vanishing; they must stay below the weight of a 200px sheet. */
export function scaleInk(style: StyleSettings, fromMin: number, toMin: number): StyleSettings {
  if (!(fromMin > 0) || !(toMin > 0)) return style;
  const k = toMin / fromMin;
  if (Math.abs(k - 1) < 1e-6) return style;
  const n = (v: number, floor: number) => Math.max(floor, Math.round(v * k * 100) / 100);
  return { ...style, stroke: n(style.stroke, 0.35), markSize: n(style.markSize, 2), arcRadius: n(style.arcRadius, 4), dotRadius: n(style.dotRadius, 0.45) };
}

export function inkForCanvas(style: StyleSettings, canvas: CanvasSize, fromMin = INK_REFERENCE): StyleSettings {
  return scaleInk(style, fromMin, Math.min(canvas.w, canvas.h));
}
