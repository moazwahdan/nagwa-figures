import { bakeLatex } from './mathliveHost';
import { svgToPdf, svgToPng, buildSvg } from './exportImage';
import { convertSvgTextToPaths } from './svgTextToPath';
import { newCaptionShape, newShape, DEFAULT_CANVAS, DEFAULT_STYLE, vertexName } from './scene';
import { pointLabel, localizeName, AR_MAP } from './labels';
import { migrateMathDelimiters, splitQmsMath } from './qmsMath';
import { parseProjectText } from './project';
import { useStore } from './store';
import { cropScene } from './crop';
import type { SceneData, ConLine, ConMark, ConPoint } from './types';
import { fitScene } from './world';


export interface BuildSpec {
  canvas?: { w: number; h: number };
  points: { id: string; x: number; y: number; name?: string; nameAr?: string; dot?: boolean; circled?: boolean; color?: string }[];
  lines?: { a: string; b: string; dashed?: boolean; arrow?: ConLine['arrow']; force?: boolean; color?: string; symbol?: string; vec?: boolean; pos?: ConLine['labelPos']; side2?: 1 | -1; text?: string; curve?: 'arc' | 'spline'; frac?: 0.25 | 0.5 | 0.75; side?: 1 | -1; via?: string[]; heads?: 1 | 2; caps?: boolean }[];
  angles?: { v: string; a: string; b: string; text?: string; color?: string; fill?: boolean; size?: number }[];
  rights?: [string, string, string][];
}

/** Dev-only: replace the drawing with a line-only scene (world points, lines, angle and right-angle marks) and fit it. */
async function buildScene(spec: BuildSpec) {
  const st = useStore, g = () => st.getState(), sl = (ms: number) => new Promise((r) => setTimeout(r, ms));
  g().clearAll(); await sl(200);
  if (spec.canvas) { g().setCanvas(spec.canvas); await sl(300); }
  const points = spec.points.map((p) => ({ id: p.id, name: p.name || '', showLabel: !!p.name, dot: !!p.dot, circled: p.circled, color: p.color, nameAr: p.nameAr, def: { t: 'world', x: p.x, y: p.y } })) as unknown as ConPoint[];
  const lines = (spec.lines ?? []).map((l, i) => ({ id: 'l' + i, a: { p: l.a }, b: { p: l.b }, dashed: !!l.dashed, arrow: l.arrow || 'none', kind: l.force ? 'force' : undefined, vec: l.vec, labelPos: l.pos, labelSide: l.side2, heads: l.heads, caps: l.caps, color: l.color, symbol: l.symbol, curve: l.curve, arcFraction: l.frac, arcSide: l.side, via: l.via?.map((p) => ({ p })), label: { text: l.text || '', unit: false } })) as unknown as ConLine[];
  const marks = [
    ...(spec.angles ?? []).map((a, i) => ({ id: 'm' + i, kind: 'angle', at: { p: a.v }, a: { p: a.a }, b: { p: a.b }, text: a.text || '', color: a.color, fill: a.fill, size: a.size })),
    ...(spec.rights ?? []).map((r, i) => ({ id: 'r' + i, kind: 'right', at: { p: r[0] }, a: { p: r[1] }, b: { p: r[2] } })),
  ] as unknown as ConMark[];
  st.setState({ points, lines, marks, selectedId: null });
  const s = g();
  st.setState(fitScene({ canvas: s.canvas, shapes: s.shapes, points: s.points, lines: s.lines, marks: s.marks, style: s.style, viewScale: s.viewScale }));
  await sl(500); g().fit(); await sl(600); g().select(null);
}

/** Dev-only: every drawn element of the two previews that sticks out of its image (px). Empty = nothing clipped. */
function clipCheck() {
  const out: [string, string, number][] = [];
  for (const sv of document.querySelectorAll('.stage-grid svg.scene-svg')) {
    const R = sv.getBoundingClientRect();
    for (const t of sv.querySelectorAll('text,path,line,circle')) {
      const b = t.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      const d = Math.max(R.left - b.left, R.top - b.top, b.right - R.right, b.bottom - R.bottom);
      if (d > 0.5) out.push([t.tagName, (t.textContent || '').slice(0, 4), Math.round(d * 10) / 10]);
    }
  }
  return out;
}

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
    buildScene,
    clipCheck,
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
