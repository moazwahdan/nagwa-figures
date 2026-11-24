import { useEffect, useState } from 'react';
import { FONT_AR, FONT_EN } from '../core/fonts';
import { layoutCaption, type Ink } from '../core/figureLatex';
import { bakeCaptionMath } from '../core/mathliveHost';
import type { Lang } from '../core/types';

function drawInk(p: Ink, lang: Lang, i: number) {
  if (p.k === 'svg') {
    if (!p.markup) return null;
    return <g key={i} transform={`translate(${p.x} ${p.y})`} pointerEvents="none" dangerouslySetInnerHTML={{ __html: p.markup }} />;
  }
  if (p.k === 'line') {
    return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#000" strokeWidth={p.sw} strokeLinecap="round" pointerEvents="none" />;
  }
  const arabic = /[\u0600-\u06FF]/.test(p.s);
  return (
    <text
      key={i}
      x={p.x}
      y={p.y}
      fontSize={p.size}
      fontFamily={arabic || (lang === 'ar' && p.dir !== 'ltr') ? FONT_AR : FONT_EN}
      fontStyle={p.italic && !arabic ? 'italic' : 'normal'}
      direction="ltr"
      unicodeBidi={arabic ? 'isolate' : p.dir === 'ltr' ? 'bidi-override' : 'isolate'}
      textAnchor="start"
      dominantBaseline="alphabetic"
      fill="#000"
      pointerEvents="none"
    >
      {p.s}
    </text>
  );
}

export function CaptionInk({ text, lang, size, maxWidth }: { text: string; lang: Lang; size: number; maxWidth?: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void bakeCaptionMath(text, lang).then(() => { if (live) setTick((n) => n + 1); });
    return () => { live = false; };
  }, [text, lang]);
  const laid = layoutCaption(text, lang, size, maxWidth);
  return <g>{laid.ink.map((p, i) => drawInk(p, lang, i))}</g>;
}
