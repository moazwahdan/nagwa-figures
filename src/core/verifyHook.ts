import { bakeLatex } from './mathliveHost';
import { svgToPdf, svgToPng, buildSvg } from './exportImage';
import { convertSvgTextToPaths } from './svgTextToPath';
import { newCaptionShape, newShape, DEFAULT_CANVAS, DEFAULT_STYLE, vertexName } from './scene';
import { pointLabel, localizeName, AR_MAP } from './labels';
import { migrateMathDelimiters, splitQmsMath } from './qmsMath';
import { parseProjectText } from './project';
import { useStore } from './store';
import { cropScene } from './crop';
import type { SceneData } from './types';

/** Dev-only helpers for Chrome/WebKit runtime evidence. */
export function installVerify() {
  (window as unknown as { __nagwaVerify: unknown }).__nagwaVerify = {
    bakeLatex,
    svgToPdf,
    svgToPng,
    buildSvg,
    convertSvgTextToPaths,
    newCaptionShape,
    newShape,
    DEFAULT_CANVAS,
    DEFAULT_STYLE,
    vertexName,
    pointLabel,
    localizeName,
    AR_MAP,
    migrateMathDelimiters,
    splitQmsMath,
    parseProjectText,
    useStore,
    cropScene,
    sampleScene(): SceneData {
      const sq = newShape('quad-square');
      const cap = newCaptionShape({
        ar: 'المساحة $\\frac{١}{٢}$ والجذر $\\sqrt{٩}$ والسالب $-٣$',
        en: 'Area $\\frac{1}{2}$ root $\\sqrt{9}$ neg $-3$',
      });
      return {
        canvas: { ...DEFAULT_CANVAS },
        style: { ...DEFAULT_STYLE },
        viewScale: 40,
        shapes: [sq, cap],
        points: [],
        lines: [],
        marks: [],
      };
    },
  };
}
