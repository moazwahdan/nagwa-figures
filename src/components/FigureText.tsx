import { ALEF_GLYPH, FONT_ALEF, FONT_AR, FONT_EN } from '../core/fonts';
import { ALEF_LOOP } from '../core/labels';
import type { Lang, Vec } from '../core/types';
interface TxtProps {
  pos: Vec;
  text: string;
  lang: Lang;
  size: number;
  italic?: boolean;
  interactive: boolean;
  locked: boolean;
  owner?: string;
  shapeId?: string;
  labelKey?: string;
  con?: string;
  direction?:'ltr'|'rtl';
  /** Arabic function name: د on the right, (س) to its left. */
  paint?: 'fn-rtl';
  sub?: string;
  flip?: boolean;
}

function AlefLoop({ size }: { size: number }) {
  return (
    <text
      x={0}
      y={0}
      dy="0.35em"
      textAnchor="middle"
      fontSize={size}
      fontFamily={FONT_ALEF}
      fill="#000"
    >
      {ALEF_GLYPH}
    </text>
  );
}

export function Txt({ pos, text, lang, size, italic, interactive, locked, owner, shapeId, labelKey, con, direction, paint, sub, flip }: TxtProps) {
  const attrs: Record<string, unknown> = {};
  if (interactive) {
    if (shapeId) attrs['data-shape-id'] = shapeId;
    if (labelKey) attrs['data-label-key'] = labelKey;
    if (con) attrs['data-con'] = con;
    attrs['data-owner'] = owner ?? '';
    attrs['data-locked'] = locked ? '1' : '0';
    attrs.style = { cursor: locked ? 'default' : 'grab' };
    attrs.pointerEvents = 'all';
  }
  if (paint === 'fn-rtl') {
    const m = /^(.*)\((.*)\)\s*$/.exec(text);
    const letter = m?.[1] ?? text;
    const arg = m ? `(${m[2]})` : '';
    const letterW = Math.max(size * 0.55, [...letter].length * size * 0.62);
    const argW = [...arg].length * size * 0.55;
    const gap = size * 0.06;
    const total = letterW + (arg ? argW + gap : 0);
    return (
      <g transform={`translate(${pos.x} ${pos.y})`} {...attrs}>
        <text x={total / 2 - letterW / 2} y={0} dy="0.35em" textAnchor="middle" fontSize={size} fontFamily={FONT_AR} fill="#000">{letter}</text>
        {arg ? <text x={-(total / 2 - argW / 2)} y={0} dy="0.35em" textAnchor="middle" fontSize={size} fontFamily={FONT_AR} unicodeBidi="bidi-override" direction="ltr" fill="#000">{arg}</text> : null}
        {sub ? <text x={size * 0.28} y={size * 0.42} fontSize={size * 0.62} fontFamily={FONT_AR} fill="#000">{sub}</text> : null}
      </g>
    );
  }
  if (text.includes(ALEF_LOOP)) {
    const parts = text.split(ALEF_LOOP);
    if (parts.length === 2 && !parts[0] && !parts[1]) {
      return (
        <text
          x={0}
          y={0}
          dy="0.35em"
          textAnchor="middle"
          fontSize={size}
          fontFamily={FONT_ALEF}
          fill="#000"
          transform={`translate(${pos.x} ${pos.y})`}
          {...attrs}
        >
          {ALEF_GLYPH}
          {sub ? <tspan fontSize={size * 0.62} dy={size * 0.28} fontStyle="normal">{sub}</tspan> : null}
        </text>
      );
    }
    return (
      <g transform={`translate(${pos.x} ${pos.y})`} {...attrs}>
        {parts.map((chunk, i) => (
          <g key={i} transform={`translate(${(i - (parts.length - 1) / 2) * size * 0.7} 0)`}>
            {i > 0 && <AlefLoop size={size} />}
            {chunk ? <text x={0} y={0} dy="0.35em" textAnchor="middle" fontSize={size} fontFamily={FONT_AR} fill="#000">{chunk}</text> : null}
          </g>
        ))}
        {sub ? <text x={size * 0.28} y={size * 0.42} fontSize={size * 0.62} fontFamily={FONT_AR} fill="#000">{sub}</text> : null}
      </g>
    );
  }
  return (
    <text
      x={0}
      y={0}
      dy="0.35em"
      textAnchor="middle"
      fontSize={size}
      fontFamily={lang === 'ar' ? FONT_AR : FONT_EN}
      fontStyle={italic && lang === 'en' ? 'italic' : 'normal'}
      unicodeBidi={flip || direction === 'ltr' ? 'bidi-override' : direction ? 'isolate' : undefined}
      direction={flip ? 'rtl' : (direction??(lang === 'ar' ? 'rtl' : 'ltr'))}
      fill="#000"
      transform={`translate(${pos.x} ${pos.y})`}
      {...attrs}
    >
      {text}{sub ? <tspan fontSize={size * 0.62} dy={size * 0.28} fontStyle="normal">{sub}</tspan> : null}
    </text>
  );
}
