import type { StyleSettings } from './types';

/** CSS px at 96dpi. 1pt = 1/72 in. */
export const DEFAULT_VIEW_SCALE = 40;

export const PX_PER_PT = 96 / 72;
/** 1cm = 28.3465pt, so a line's on-page length is its length in pt divided by this. */
export const PT_PER_CM = 28.3465;
export const STROKE_PT = 0.797;
export const FONT_PT = 11.25;
/** Dot radius and arrow length stay a fixed multiple of the stroke. */
export const DOT_TO_STROKE = 1.5;
export const ARROW_TO_STROKE = 8;
export const MARK_TO_STROKE = 8;
export const ARC_TO_STROKE = 16;
/** A hair of white after the last ink, so the stroke is not clipped. */
export const CROP_PAD_PT = 1.5;

export const ptToPx = (pt: number) => pt * PX_PER_PT;

/** Caption layout size in world units so mixed notes match paper type, not 1-em overlays. */
export function captionEm(fontSize = ptToPx(FONT_PT), viewScale = DEFAULT_VIEW_SCALE): number {
  return fontSize / viewScale;
}

/** World-unit wrap width that stays inside the 200px question portrait at the default view scale. */
export const CAPTION_FIT_WORLD = 4.5;
export const pxToPt = (px: number) => px / PX_PER_PT;
/** On-page centimetres of a length measured in viewBox pixels. */
export const pxToCm = (px: number) => pxToPt(px) / PT_PER_CM;

export function tiedInk(style: StyleSettings, stroke = style.stroke): StyleSettings {
  return {
    ...style,
    stroke,
    dotRadius: stroke * DOT_TO_STROKE,
    markSize: stroke * MARK_TO_STROKE,
    arcRadius: stroke * ARC_TO_STROKE,
  };
}

/** Line weight and label size stay on paper values until the sliders are reopened. */
export function lockedPaperInk(style: StyleSettings): StyleSettings {
  const stroke = ptToPx(STROKE_PT);
  return tiedInk({ ...style, stroke, fontSize: ptToPx(FONT_PT) }, stroke);
}
