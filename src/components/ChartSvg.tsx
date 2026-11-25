import type { Lang, SceneData, ShapeInstance } from '../core/types';
import { chartLayout } from '../core/chartLayout';
import { GRID_COLOR, INK_COLOR } from '../core/palette';
import { Txt } from './FigureText';

export function ChartSvg({ data, shape: s, lang, interactive, lockAll }: { data: SceneData; shape: ShapeInstance; lang: Lang; interactive: boolean; lockAll: boolean }) {
  const L = chartLayout(data, s, lang), stroke = L.stroke, locked = lockAll || s.locked;
  const xs = L.pts.map((p) => p.x), ys = L.pts.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const seg = (g: { a: { x: number; y: number }; b: { x: number; y: number } }, i: number, color: string, w: number, extra?: Record<string, unknown>) => (
    <line key={i} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke={color} strokeWidth={w} {...extra} />
  );
  return (
    <g data-chart={s.chart!.kind}>
      {interactive && <rect data-shape-id={s.id} x={x0 - 10} y={y0 - 10} width={Math.max(...xs) - x0 + 20} height={Math.max(...ys) - y0 + 20} fill="transparent" pointerEvents="all" />}
      <g pointerEvents="none">
        {s.chart!.gridOverBars === false && L.grid.map((g, i) => seg(g, i, GRID_COLOR, stroke, { 'data-chart-grid': '' }))}
        {L.bars.map((b, i) => <polygon key={'b' + i} data-chart-bar={i} points={b.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={b.fill} />)}
        {s.chart!.gridOverBars !== false && L.grid.map((g, i) => seg(g, i, GRID_COLOR, stroke, { 'data-chart-grid': '' }))}
        {L.bars.map((b, i) => <polygon key={'o' + i} data-chart-bar-outline={i} points={b.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={INK_COLOR} strokeWidth={stroke} strokeLinejoin="miter" />)}
        {L.line && <polyline data-chart-line="" points={L.line.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={L.lineColor} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" />}
        {L.axes.map((g, i) => seg(g, i, '#000', stroke, { 'data-chart-axis': '' }))}
        {L.ticks.map((g, i) => seg(g, i, '#000', stroke, { 'data-chart-tick': '' }))}
        {L.heads.map((h, i) => {
          const base = { x: h.tip.x - h.dir.x * L.arrowLen, y: h.tip.y - h.dir.y * L.arrowLen }, w = L.arrowLen * 0.42;
          return <polygon key={'h' + i} data-chart-arrow="" points={`${h.tip.x},${h.tip.y} ${base.x - h.dir.y * w},${base.y + h.dir.x * w} ${base.x + h.dir.y * w},${base.y - h.dir.x * w}`} fill="#000" />;
        })}
        {L.dots.map((d, i) => <circle key={'d' + i} data-chart-dot="" cx={d.c.x} cy={d.c.y} r={d.r} fill={d.color} />)}
      </g>
      {L.texts.map((t) => {
        const el = <Txt key={t.key} pos={t.rot ? { x: 0, y: 0 } : t.pos} text={t.text} lang={lang} size={t.size} italic={t.italic && lang === 'en' && data.style.italicLetters} interactive={interactive} locked={locked} shapeId={s.id} labelKey={t.key} owner={s.id} direction={/^ct:(x:|y:|zero)/.test(t.key) ? 'ltr' : undefined} />;
        return t.rot ? <g key={t.key} transform={`translate(${t.pos.x} ${t.pos.y}) rotate(-90)`}>{el}</g> : el;
      })}
    </g>
  );
}
