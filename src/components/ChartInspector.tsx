import { useEffect, useState } from 'react';
import { PALETTE } from '../core/palette';
import { validateChart } from '../core/charts';
import { parseAxisNumber } from '../core/axisActions';
import { useStore } from '../core/store';
import type { ChartPoint, ChartSettings, ChartText, ShapeInstance } from '../core/types';

function Num({ value, onCommit, label, step }: { value: number; onCommit: (n: number) => void; label: string; step?: string }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  const commit = () => { try { const n = parseAxisNumber(t, label); if (n !== value) onCommit(n); else setT(String(value)); } catch { setT(String(value)); } };
  return <input aria-label={label} inputMode="decimal" step={step} value={t} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function Swatches({ value, onPick, label }: { value: string; onPick: (hex: string) => void; label: string }) {
  return <div className="chart-swatches" role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
    {PALETTE.map((c) => <button key={c.hex} type="button" title={`${c.name} ${c.hex}`} aria-label={c.name} aria-pressed={c.hex.toLowerCase() === value.toLowerCase()} data-swatch={c.hex}
      onClick={() => onPick(c.hex)} style={{ width: 20, height: 20, borderRadius: 4, background: c.hex, border: c.hex.toLowerCase() === value.toLowerCase() ? '2px solid var(--accent)' : '1px solid #0004', padding: 0, cursor: 'pointer' }} />)}
  </div>;
}

function Bilingual({ label, value, onChange }: { label: string; value: ChartText; onChange: (t: ChartText) => void }) {
  return <div className="fields"><label className="field"><span>{label} (EN)</span><input aria-label={`${label} English`} value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} /></label>
    <label className="field"><span>{label} (AR)</span><input aria-label={`${label} Arabic`} dir="rtl" value={value.ar} onChange={(e) => onChange({ ...value, ar: e.target.value })} /></label></div>;
}

export function ChartInspector({ s }: { s: ShapeInstance }) {
  const c = s.chart!, [error, setError] = useState('');
  const apply = (next: ChartSettings, fit = false, params?: Record<string, number>) => {
    try { validateChart(next); useStore.getState().patchShape(s.id, { chart: next, ...(params ? { params } : {}) }, { fit }); setError(''); }
    catch (e) { setError((e as Error).message); }
  };
  const patch = (p: Partial<ChartSettings>, fit = false) => apply({ ...c, ...p }, fit);
  const setRow = (i: number, p: Partial<ChartPoint>, fit = false) => apply({ ...c, points: c.points.map((r, j) => (j === i ? { ...r, ...p } : r)) }, fit);
  const addRow = () => {
    const last = c.points[c.points.length - 1];
    const row: ChartPoint = c.kind === 'bar' ? { x: c.points.length + 1, y: 1, label: { en: '', ar: '' } } : { x: (last?.x ?? -1) + 1, y: c.kind === 'dot' ? 1 : last?.y ?? 0 };
    apply({ ...c, points: [...c.points, row] }, true);
  };
  const bar = c.kind === 'bar', line = c.kind === 'line', dot = c.kind === 'dot';
  const title = { bar: 'Bar chart', line: 'Line graph', dot: 'Dot plot' }[c.kind];
  return <div className="panel chart-panel" data-chart-inspector={c.kind}>
    <div className="insp-title">{title}<span className="actions"><button className="icon-btn" aria-label="Duplicate chart" onClick={() => useStore.getState().duplicateShape(s.id)}>⧉</button><button className="icon-btn danger" aria-label="Delete chart" onClick={() => useStore.getState().removeShape(s.id)}>✕</button></span></div>
    {error && <div className="warn" role="alert">{error}</div>}
    <div className="group-title">Data table</div>
    <table className="chart-table" style={{ width: '100%', fontSize: 12 }}><thead><tr>
      {bar ? <><th>EN</th><th>AR</th></> : <th>{dot ? 'Value' : 'x'}</th>}<th>{bar ? 'Value' : dot ? 'Dots' : 'y'}</th>{!dot && <th>Colour</th>}{line && <th>●</th>}<th /></tr></thead>
      <tbody>{c.points.map((p, i) => <tr key={i} data-chart-row={i}>
        {bar ? <>
          <td><input aria-label={`Row ${i + 1} English`} value={p.label?.en ?? ''} onChange={(e) => setRow(i, { label: { ar: p.label?.ar ?? '', en: e.target.value } })} /></td>
          <td><input aria-label={`Row ${i + 1} Arabic`} dir="rtl" value={p.label?.ar ?? ''} onChange={(e) => setRow(i, { label: { en: p.label?.en ?? '', ar: e.target.value } })} /></td>
        </> : <td><Num label={`Row ${i + 1} x`} value={p.x} onCommit={(n) => setRow(i, { x: n })} /></td>}
        <td><Num label={`Row ${i + 1} y`} value={p.y} onCommit={(n) => setRow(i, { y: n })} /></td>
        {!dot && <td><select aria-label={`Row ${i + 1} colour`} value={p.color ?? ''} onChange={(e) => setRow(i, { color: e.target.value || undefined })} style={{ background: p.color ?? 'transparent' }}>
          <option value="">Default</option>{PALETTE.map((col) => <option key={col.hex} value={col.hex}>{col.name}</option>)}</select></td>}
        {line && <td><input type="checkbox" aria-label={`Row ${i + 1} marker`} checked={p.marker !== false} onChange={(e) => setRow(i, { marker: e.target.checked })} /></td>}
        <td><button className="icon-btn danger" aria-label={`Delete row ${i + 1}`} onClick={() => apply({ ...c, points: c.points.filter((_, j) => j !== i) }, true)}>✕</button></td>
      </tr>)}</tbody></table>
    <button className="btn ghost wide" onClick={addRow}>+ Add row</button>
    <div className="group-title">Titles</div>
    <Bilingual label="Title" value={c.title} onChange={(t) => patch({ title: t })} />
    <Bilingual label="X title" value={c.xTitle} onChange={(t) => patch({ xTitle: t })} />
    {!dot && <Bilingual label="Y title" value={c.yTitle} onChange={(t) => patch({ yTitle: t })} />}
    <div className="group-title">Axes</div>
    {!bar && <div className="fields"><label className="field"><span>X min</span><Num label="X min" value={c.xMin} onCommit={(n) => patch({ xMin: n }, true)} /></label><label className="field"><span>X max</span><Num label="X max" value={c.xMax} onCommit={(n) => patch({ xMax: n }, true)} /></label><label className="field"><span>X step</span><Num label="X step" value={c.xStep} onCommit={(n) => patch({ xStep: n }, true)} /></label></div>}
    {!dot && <div className="fields"><label className="field"><span>Y min</span><Num label="Y min" value={c.yMin} onCommit={(n) => patch({ yMin: n }, true)} /></label><label className="field"><span>Y max</span><Num label="Y max" value={c.yMax} onCommit={(n) => patch({ yMax: n }, true)} /></label><label className="field"><span>Y step</span><Num label="Y step" value={c.yStep} onCommit={(n) => patch({ yStep: n }, true)} /></label></div>}
    <div className="fields"><label className="field"><span>Plot width</span><Num label="Plot width" value={s.params.w} onCommit={(n) => { if (n >= 1 && n <= 40) apply(c, true, { ...s.params, w: n }); }} /></label>{!dot && <label className="field"><span>Plot height</span><Num label="Plot height" value={s.params.h} onCommit={(n) => { if (n >= 1 && n <= 40) apply(c, true, { ...s.params, h: n }); }} /></label>}</div>
    {!dot && <label className="field"><span>Grid</span><select aria-label="Grid" value={c.grid} onChange={(e) => patch({ grid: e.target.value as ChartSettings['grid'] })}><option value="none">None</option><option value="horizontal">Horizontal lines</option><option value="full">Full grid</option></select></label>}
    {bar && c.grid === 'full' && <label className="field"><span>Vertical lines</span><select aria-label="Vertical grid position" value={c.gridAt} onChange={(e) => patch({ gridAt: e.target.value as ChartSettings['gridAt'] })}><option value="center">Through bar centres</option><option value="edge">Between bars</option><option value="cell">Cells (each bar fills one cell)</option></select></label>}
    <label className="check"><input type="checkbox" checked={c.showNumbers} onChange={(e) => patch({ showNumbers: e.target.checked }, true)} />Numbers on axes</label>
    <label className="check"><input type="checkbox" checked={c.frame} onChange={(e) => patch({ frame: e.target.checked }, true)} />Frame around the plot</label>
    {!dot && <div className="fields"><label className="field"><span>First y number</span><Num label="First y number" value={c.yLabelMin ?? c.yMin} onCommit={(n) => patch({ yLabelMin: n <= c.yMin ? undefined : n })} /></label><label className="field"><span>Last y number</span><Num label="Last y number" value={c.yLabelMax ?? c.yMax} onCommit={(n) => patch({ yLabelMax: n >= c.yMax ? undefined : n })} /></label></div>}
    {dot && <label className="field"><span>Line extends past ends (x units)</span><Num label="Axis padding" value={c.axisPad ?? 0} onCommit={(n) => { if (n >= 0 && n <= 5) patch({ axisPad: n }, true); }} /></label>}
    {!bar && <label className="field"><span>Last x number shown</span><Num label="Last x number" value={c.xLabelMax ?? c.xMax} onCommit={(n) => patch({ xLabelMax: n >= c.xMax ? undefined : n })} /></label>}
    {!bar && <label className="check"><input type="checkbox" checked={c.arrows} onChange={(e) => patch({ arrows: e.target.checked }, true)} />Arrow heads</label>}
    {line && <label className="check"><input type="checkbox" checked={c.showAxisNames} onChange={(e) => patch({ showAxisNames: e.target.checked }, true)} />Axis names (x, y / س، ص)</label>}
    {line && <label className="check"><input type="checkbox" checked={c.lineConnect} onChange={(e) => patch({ lineConnect: e.target.checked })} />Connect points</label>}
    {line && <label className="check"><input type="checkbox" checked={c.markers} onChange={(e) => patch({ markers: e.target.checked })} />Markers</label>}
    {bar && c.gridAt !== 'cell' && <label className="slider"><span>Bar width <b>{Math.round(c.barWidth * 100)}%</b></span><input aria-label="Bar width" type="range" min="10" max="100" step="5" value={Math.round(c.barWidth * 100)} onChange={(e) => patch({ barWidth: Number(e.target.value) / 100 })} /></label>}
    <div className="group-title">{bar ? 'Bar colour' : line ? 'Line colour' : 'Dot colour'}</div>
    <Swatches label="Default colour" value={c.color} onPick={(hex) => patch({ color: hex })} />
    <div className="group-title">Labels &amp; layout</div>
    <label className="check"><input type="checkbox" checked={s.locked} onChange={() => useStore.getState().toggleShapeLock(s.id)} />Lock this chart's labels</label>
    <div className="split2"><button className="btn ghost" onClick={() => useStore.getState().patchShape(s.id, { nudge: {}, nudgeByLang: undefined })}>Reset label positions</button></div>
  </div>;
}
