import { ChartInspector } from './ChartInspector';
import { AxesInspector } from './AxesInspector';
import { useEffect, useState } from 'react';
import { ALEF_LOOP, VERTEX_AR_LETTERS, formatNumber, localizeName, shownArabicName, vertexArabicPlain } from '../core/labels';
import '../mathpad.css';
import { ALEF_GLYPH, FONT_ALEF, FONT_AR_MATH } from '../core/fonts';
import { geometryOf, resampleFreePath } from '../core/scene';
import { buildWorld, ownerOfDef, ownerOfRef, refEq, refName, spatialDistance, vlen, vsub } from '../core/world';
import { DEF_BY_ID, sideLengths } from '../core/shapes2d';
import { useStore } from '../core/store';
import { solidSettings } from '../core/shapes3d';
import type { SolidSettings, ShapeInstance } from '../core/types';
import { ShapeIcon } from './ShapeIcon';
import { Tooltip } from './Tooltip';
import { ColorSwatches } from './ColorSwatches';
import { effectiveForceSymbol, forceSymbolName } from '../core/forceSymbols';
import { ForceSymbolPicker } from './ForceSymbolPicker';

function NumField({ label, value, onCommit, min, max, step, suffix }: { label: string; value: number; onCommit: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => {
    let n = Number(txt);
    if (!Number.isFinite(n) || txt.trim() === '') return setTxt(String(value));
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onCommit(n);
    else setTxt(String(value));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div className="inp">
        <input type="number" step={step ?? 'any'} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function TextField({ value, onCommit, placeholder, width, className, label, dir }: { value: string; onCommit: (t: string) => void; placeholder?: string; width?: number; className?: string; label?: string; dir?: 'ltr' | 'rtl' }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return (
    <input
      className={className ? `txt ${className}` : 'txt'}
      style={width ? { width } : undefined}
      value={txt}
      placeholder={placeholder}
      aria-label={label}
      dir={dir}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => txt !== value && onCommit(txt)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const PRESETS = [0, 30, 45, 60, 90, 120, 135, 150, 180];

function pointKind(t: string): string {
  if (t === 'foot') return 'foot';
  if (t === 'cross' || t === 'lineCircle' || t === 'circs') return 'intersection';
  if (t === 'ratio') return 'on a line';
  if (t === 'circ') return 'on circle';
  if (t === 'local') return 'free';
  return 'derived';
}

function ConstructionList() {
  const points = useStore((s) => s.points);
  const lines = useStore((s) => s.lines);
  const marks = useStore((s) => s.marks);
  const shapes = useStore((s) => s.shapes);
  const style = useStore((s) => s.style);
  const { patchPoint, patchLine, patchMark, removePoint, removeLine, removeMark, clearConstructions, clearPoints, clearLines, clearMarks } = useStore.getState();
  const listedPoints = points.filter((p) => p.name.trim() || p.showLabel || p.dot);
  if (!listedPoints.length && !lines.length && !marks.length) return null;
  const st = useStore.getState();
  const data = { canvas: st.canvas, shapes: st.shapes, points: st.points, lines: st.lines, marks: st.marks, style: st.style, viewScale: st.viewScale };
  const nm = (r: Parameters<typeof refName>[1]) => refName(data, r);

  const fillLengths = () => {
    const w = buildWorld(data);
    for (const l of lines) {
      if (l.kind==='force' || l.label.text.trim()) continue;
      const a = w.ref(l.a);
      const b = w.ref(l.b);
      if (!a || !b) continue;
      const own = shapes.find((x) => x.id === ownerOfRef(data, l.a));
      patchLine(l.id, { label: { ...l.label, text: formatNumber(spatialDistance(data, l.a, l.b) ?? vlen(vsub(a, b)) / (own?.scale ?? 1)) } });
    }
  };

  return (
    <div className="panel">
      <div className="insp-title">
        Constructions
        <Tooltip tip="Delete every point, line and mark you added. The shapes stay. Ctrl+Z undoes it." side="bottom">
          <button className="mini danger" style={{ marginLeft: 'auto' }} onClick={clearConstructions}>Remove all</button>
        </Tooltip>
      </div>
      {listedPoints.length > 0 && (
        <>
          <div className="group-title">
            Points
            <span className="mini-group">
              <Tooltip tip="Delete all added points. Lines and marks that use them go too." side="bottom">
                <button className="mini danger" onClick={clearPoints}>Remove all</button>
              </Tooltip>
            </span>
          </div>
          <div className="cons">
            {listedPoints.map((p) => {
              const own = shapes.find((s) => s.id === ownerOfDef(data, p.def));
              const caseMode = own?.caseMode ?? 'upper';
              const arabic = shownArabicName(p.name, p.nameAr, caseMode, style);
              const autoArabic = shownArabicName(p.name, undefined, caseMode, style);
              return (
              <div key={p.id} className="con-row con-point">
                <TextField className="con-name-en" dir="ltr" label={`English name ${p.name || p.id}`} value={p.name} onCommit={(t) => { const name = t.toUpperCase(); patchPoint(p.id, { name, showLabel: name.trim() !== '' || !!p.nameAr?.trim() }); }} />
                <span className="con-point-kind muted small">{pointKind(p.def.t)}</span>
                <TextField className={p.nameAr === undefined && localizeName(p.name, 'ar', caseMode, style).includes('\uE000') ? 'con-name-ar loop' : 'con-name-ar'} dir="rtl" label={`Arabic name ${p.name || p.id}`} value={arabic} onCommit={(t) => { const next = t.trim(); patchPoint(p.id, { nameAr: next === autoArabic ? undefined : next, showLabel: p.name.trim() !== '' || next !== '' }); }} />
                <div className="con-point-tools">
                  <label className="check tiny"><input type="checkbox" checked={p.showLabel} onChange={(e) => patchPoint(p.id, { showLabel: e.target.checked })} />name</label>
                  <label className="check tiny"><input type="checkbox" checked={!!p.circled} onChange={(e) => patchPoint(p.id, { circled: e.target.checked })} />circle</label>
                  <ColorSwatches label={`Colour ${p.name || p.id}`} value={p.color} onPick={(hex) => patchPoint(p.id, { color: hex })} />
                  <label className="check tiny"><input type="checkbox" checked={p.dot} onChange={(e) => patchPoint(p.id, { dot: e.target.checked })} />dot</label>
                  <button className="icon-btn danger" onClick={() => removePoint(p.id)} aria-label="Delete point">✕</button>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}
      {lines.length > 0 && (
        <>
          <div className="group-title">
            Lines
            <span className="mini-group">
              <Tooltip tip="Write each empty line's real length (from the drawing dimensions) into its label." side="bottom">
                <button className="mini" onClick={fillLengths}>Fill lengths</button>
              </Tooltip>
              <Tooltip tip="Delete all added lines (the points stay)." side="bottom">
                <button className="mini danger" onClick={clearLines}>Remove all</button>
              </Tooltip>
            </span>
          </div>
          <div className="cons">
            {lines.map((l) => (
              <div key={l.id} className="con-row con-line">
                <div className="con-head">
                  <b>{nm(l.a)}{nm(l.b)}</b>
                  {l.kind==='force'&&<span className="muted small">force</span>}
                  {l.curve==='arc'&&<span className="muted small">{l.arcFraction===.25?'¼':l.arcFraction===.5?'½':'¾'} arc</span>}
                  {l.curve==='spline'&&<span className="muted small">curve</span>}
                  <button className="icon-btn danger" onClick={() => removeLine(l.id)} aria-label="Delete line">✕</button>
                </div>
                {(()=>{
                  const w=buildWorld(data),A=w.ref(l.a),B=w.ref(l.b),bp='p' in l.b?points.find(p=>p.id===(l.b as {p:string}).p):undefined;
                  if(!A||!B||!bp||l.curve||!((bp.def.t==='offset'&&refEq(bp.def.from,l.a))||bp.def.t==='world'))return null;
                  const len=Math.hypot(B.x-A.x,B.y-A.y),ang=Math.atan2(B.y-A.y,B.x-A.x)*180/Math.PI;
                  const move=(L:number,deg:number)=>{
                    if(!(L>0))return;
                    if(bp.def.t==='offset')patchPoint(bp.id,{def:{...bp.def,dist:L,angle:deg}});
                    else{const r=deg*Math.PI/180;patchPoint(bp.id,{def:{t:'world',x:A.x+Math.cos(r)*L,y:A.y+Math.sin(r)*L}});}
                  };
                  return <div className="fields"><NumField label="Length" value={Math.round(len*100)/100} min={0.05} step={0.1} onCommit={(v)=>move(v,ang)}/><NumField label="Angle °" value={Math.round(ang*10)/10} min={-360} max={360} onCommit={(v)=>move(len,v)}/></div>;
                })()}
                <div className="fields"><label className="field"><span>Arrowheads</span><select aria-label="Arrowhead count" value={l.heads??1} onChange={e=>patchLine(l.id,{heads:Number(e.target.value)===2?2:undefined})}><option value="1">Single</option><option value="2">Double</option></select></label><label className="check" style={{alignSelf:'end'}}><input type="checkbox" checked={!!l.caps} onChange={e=>patchLine(l.id,{caps:e.target.checked||undefined})} />End bars (dimension)</label></div>
                {l.kind==='force'&&<><label className="check"><input type="checkbox" checked={!!l.vec} onChange={e=>patchLine(l.id,{vec:e.target.checked||undefined})} />Vector arrow over the symbol</label><div className="fields"><label className="field"><span>Symbol position</span><select aria-label="Symbol position" value={l.labelPos??'auto'} onChange={e=>patchLine(l.id,{labelPos:e.target.value==='auto'?undefined:e.target.value as 'end'|'middle'|'start'})}><option value="auto">Auto (end / middle)</option><option value="end">At the arrow tip</option><option value="middle">Middle of the line</option><option value="start">Near the start</option></select></label><label className="field"><span>Side</span><button type="button" className="btn sm" onClick={()=>patchLine(l.id,{labelSide:(l.labelSide??1)===1?-1:1})}>Flip side</button></label></div></>}
                {l.kind==='force'&&<div className="field"><span>Symbol</span>
                  <ForceSymbolPicker label={`Force symbol ${nm(l.a)}${nm(l.b)}`} value={l.symbol} auto={effectiveForceSymbol(lines.map(x=>x.id===l.id?{...x,symbol:undefined}:x),{...l,symbol:undefined})} onPick={(next)=>{
                    const sym=effectiveForceSymbol(lines.map(x=>x.id===l.id?{...x,symbol:next}:x),{...l,symbol:next});
                    const clash=sym!=='none'&&lines.some(x=>x.id!==l.id&&x.kind==='force'&&effectiveForceSymbol(lines,x)===sym);
                    if(clash&&!window.confirm(`The symbol ${forceSymbolName(sym)} is already used by another force. Use it again?`))return;
                    patchLine(l.id,{symbol:next});
                  }}/></div>}
                <div className="con-tools">
                  <TextField value={l.label.text} placeholder="hidden" onCommit={(t) => patchLine(l.id, { label: { ...l.label, text: t } })} />
                  <label className="check tiny"><input type="checkbox" checked={l.label.unit} onChange={(e) => patchLine(l.id, { label: { ...l.label, unit: e.target.checked } })} />cm</label>
                  <label className="check tiny"><input type="checkbox" checked={l.dashed} onChange={(e) => patchLine(l.id, { dashed: e.target.checked })} />dash</label>
                  <select aria-label={`Arrow on ${nm(l.a)}${nm(l.b)}`} value={l.arrow??'none'} onChange={e=>patchLine(l.id,{arrow:e.target.value as typeof l.arrow})}><option value="none">no arrow</option><option value="start">start</option><option value="end">end</option><option value="both">both</option><option value="middle">middle</option></select>
                  <ColorSwatches label={`Colour ${nm(l.a)}${nm(l.b)}`} value={l.color} onPick={(hex)=>patchLine(l.id,{color:hex})}/>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {marks.length > 0 && (
        <>
          <div className="group-title">
            Marks
            <span className="mini-group">
              <Tooltip tip="Delete all right-angle marks, ticks and parallel arrows." side="bottom">
                <button className="mini danger" onClick={clearMarks}>Remove all</button>
              </Tooltip>
            </span>
          </div>
          <div className="cons">
            {marks.map((m) => (
              m.kind==='attachment' ? (
                <div key={m.id} className="con-row">
                  <span className="muted small">{m.item}</span>
                  {(m.item==='wall'||m.item==='hinge')&&<label className="slider"><span>size <b>{(m.size??3).toFixed(1)}</b></span>
                    <input aria-label={`${m.item} size`} type="range" min={1} max={10} step={.5} value={m.size??3} onChange={e=>patchMark(m.id,{size:Number(e.target.value)})}/>
                  </label>}
                  <button className="icon-btn danger" onClick={() => removeMark(m.id)} aria-label={`Delete ${m.item}`}>✕</button>
                </div>
              ) : m.kind==='angle' ? (
                <div key={m.id} className="con-row">
                  <span className="muted small">angle {nm(m.a)}{nm(m.at)}{nm(m.b)}</span>
                  <TextField value={m.text} placeholder="no label" onCommit={(t)=>patchMark(m.id,{text:t.slice(0,20)})}/>
                  <label className="check tiny"><input type="checkbox" checked={!!m.fill} onChange={e=>patchMark(m.id,{fill:e.target.checked})}/>fill</label>
                  <label className="slider"><span>size <b>{(m.size??1).toFixed(1)}</b></span><input aria-label="Angle arc size" type="range" min={.5} max={4} step={.1} value={m.size??1} onChange={e=>patchMark(m.id,{size:Number(e.target.value)})}/></label>
                  <ColorSwatches label="Angle colour" value={m.color} onPick={(hex)=>patchMark(m.id,{color:hex})}/>
                  <button className="icon-btn danger" onClick={() => removeMark(m.id)} aria-label="Delete angle">✕</button>
                </div>
              ) : (
                <button key={m.id} className="chip sm" onClick={() => removeMark(m.id)} title="Remove this mark">
                  {m.kind === 'right' ? '∟ right angle' : 'circle' in m ? `${m.kind === 'tick' ? 'circle ticks' : 'circle »'} ×${m.n}` : m.kind === 'tick' ? `${nm(m.a)}${nm(m.b)} ticks ×${m.n}` : `${nm(m.a)}${nm(m.b)} » ×${m.n}`} ✕
                </button>
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}


export function Inspector() {
  const shapes = useStore((s) => s.shapes);
  const selectedId = useStore((s) => s.selectedId);
  const style = useStore((s) => s.style);
  const { select, patchShape, removeShape, duplicateShape, reorderShape } = useStore.getState();
  const sel = shapes.find((s) => s.id === selectedId);

  return (
    <aside className="inspector">
      <div className="insp-title">Layers</div>
      {shapes.length === 0 && <div className="muted">No shapes yet.</div>}
      <div className="layers">
        {[...shapes].reverse().map((s) => {
          const i = shapes.indexOf(s);
          return (
          <div key={s.id} className={`layer ${s.id === selectedId ? 'on' : ''}`}>
            <button type="button" className="layer-pick" onClick={() => select(s.id)}>
              <ShapeIcon defId={s.defId} size={22} />
              <span>{s.caption?(s.caption.ar.trim()||s.caption.en.trim()||'Text'):DEF_BY_ID[s.defId].label}</span>
            </button>
            <span className="layer-order">
              <button type="button" aria-label="Bring forward" title="Bring forward" disabled={i === shapes.length - 1} onClick={() => reorderShape(s.id, 1)}>↑</button>
              <button type="button" aria-label="Send backward" title="Send backward" disabled={i === 0} onClick={() => reorderShape(s.id, -1)}>↓</button>
            </span>
          </div>
          );
        })}
      </div>
      <ConstructionList />
      {sel?.axes && <AxesInspector key={sel.id} s={sel} />}
      {sel?.chart && <ChartInspector key={sel.id} s={sel} />}
      {sel?.caption&&<div className="panel"><div className="insp-title">Text<span className="actions"><Tooltip tip="Duplicate" side="bottom"><button className="icon-btn" onClick={()=>duplicateShape(sel.id)}>⧉</button></Tooltip><Tooltip tip="Delete (Del)" side="bottom"><button className="icon-btn danger" onClick={()=>removeShape(sel.id)}>✕</button></Tooltip></span></div><Tooltip tip="Arabic and English are edited separately in the bar above the drawing. Math goes in $...$."><button type="button" className="btn wide" onClick={()=>useStore.getState().setTextComposer(sel.id)}>Edit Arabic / English</button></Tooltip><TransformFields s={sel} patch={(p,fit)=>patchShape(sel.id,p,{fit})}/></div>}
      {sel && !sel.axes && !sel.chart && !sel.caption && <ShapePanel s={sel} style={style} patch={(p, fit) => patchShape(sel.id, p, { fit })} onDelete={() => removeShape(sel.id)} onDup={() => duplicateShape(sel.id)} />}
    </aside>
  );
}

function TransformFields({s,patch}:{s:ShapeInstance;patch:(p:Partial<ShapeInstance>,fit?:boolean)=>void}){
  return <><div className="group-title">Position &amp; size</div><div className="fields"><label className="field"><span>X</span><input type="number" step="any" value={Number(s.offset.x.toFixed(2))} onChange={e=>patch({offset:{...s.offset,x:Number(e.target.value)||0}})}/></label><label className="field"><span>Y</span><input type="number" step="any" value={Number(s.offset.y.toFixed(2))} onChange={e=>patch({offset:{...s.offset,y:Number(e.target.value)||0}})}/></label></div><div className="fields"><label className="field"><span>Rotation °</span><input type="number" value={s.rotation} onChange={e=>patch({rotation:Number(e.target.value)||0},true)}/></label>{!s.caption&&<label className="field"><span>Scale %</span><input type="number" min="10" max="1000000000" value={Math.round(s.scale*100)} onChange={e=>{const n=Number(e.target.value);if(n>=10)patch({scale:n/100});}}/></label>}</div><div className="split2"><label className="check"><input type="checkbox" checked={s.flipX} onChange={e=>patch({flipX:e.target.checked},true)}/>Flip horizontal</label><label className="check"><input type="checkbox" checked={s.flipY} onChange={e=>patch({flipY:e.target.checked},true)}/>Flip vertical</label></div></>;
}

/** Palette / cell glyph: the exam-figure alif is drawn with the Arabic math font, like the keyboard. */
function arKey(c: string) {
  if (c === ALEF_LOOP) return <span style={{ fontFamily: FONT_ALEF }}>{ALEF_GLYPH}</span>;
  if (c && c.codePointAt(0)! >= 0x1ee00) return <span style={{ fontFamily: FONT_AR_MATH }}>{c}</span>;
  return c || '—';
}

function ShapePanel({ s, style: figStyle, patch, onDelete, onDup }: { s: ShapeInstance; style: { dAsHamza: boolean; arabicTatweel: boolean; alefForm: 'hamza' | 'loop' }; patch: (p: Partial<ShapeInstance>, fit?: boolean) => void; onDelete: () => void; onDup: () => void }) {
  const def = DEF_BY_ID[s.defId];
  const [pickIdx, setPickIdx] = useState<number | null>(null);
  useEffect(() => setPickIdx(null), [s.id]);
  const geo = geometryOf(s);
  const n = geo.points.length;
  const setParam = (key: string, v: number) => {
    if (s.path && key === 'n') {
      const N = Math.max(2, Math.min(20, Math.round(v)));
      const closed = !!s.pathClosed && N >= 3;
      const path = resampleFreePath(s.path, N, closed);
      patch({ params: { ...s.params, n: N }, path, pathClosed: closed }, true);
      return;
    }
    patch({ params: { ...s.params, [key]: v } }, true);
  };
  const setArr = <K extends 'names' | 'sides' | 'angles'>(k: K, i: number, v: ShapeInstance[K][number]) => {
    const arr = [...s[k]] as ShapeInstance[K];
    (arr as unknown[])[i] = v;
    patch({ [k]: arr } as Partial<ShapeInstance>);
  };

  const fillSides = () => {
    const lens = geo.solid ? geo.solid.edges.map(e => e.length) : sideLengths(geo.points, !!geo.open);
    patch({ sides: lens.map((l) => ({ text: formatNumber(l), unit: true })) });
  };

  return (
    <div className="panel">
      <div className="insp-title">
        {s.path ? (s.pathClosed && n >= 3 ? 'Free polygon' : n === 2 ? 'Free line' : 'Free polyline') : def.label}
        <span className="actions">
          <Tooltip tip="Duplicate" side="bottom"><button className="icon-btn" onClick={onDup}>⧉</button></Tooltip>
          <Tooltip tip="Delete (Del)" side="bottom"><button className="icon-btn danger" onClick={onDelete}>✕</button></Tooltip>
        </span>
      </div>
      {geo.error && <div className="warn">{geo.error}</div>}

      {s.path && (
        <div className="checks">
          <label className="check"><input type="checkbox" checked={!!s.pathClosed && n >= 3} disabled={n < 3} onChange={(e) => {
            const closed = e.target.checked && n >= 3;
            patch({ pathClosed: closed }, true);
          }} />Closed polygon</label>
          <label className="check"><input type="checkbox" checked={!!s.pathDashed} onChange={(e) => patch({ pathDashed: e.target.checked })} />Dashed</label>
          <label className="check"><input type="checkbox" checked={!!s.pathCurved} onChange={(e) => patch({ pathCurved: e.target.checked })} />Smooth curve</label>
        </div>
      )}

      <div className="group-title">Dimensions <small>for the drawing only — figure is auto-scaled</small></div>
      <div className="fields">
        {def.params.filter((p) => !p.show || p.show(s.params)).map((p) =>
          p.options ? (
            <label className="field" key={p.key}>
              <span>{p.label}</span>
              <select value={s.params[p.key]} onChange={(e) => setParam(p.key, Number(e.target.value))}>
                {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ) : (
            <NumField key={p.key} label={p.label} value={s.params[p.key]} min={p.min} max={p.max} step={p.step} onCommit={(v) => setParam(p.key, v)} />
          ),
        )}
      </div>

      {geo.solid && <SolidControls s={s} patch={patch} />}

      <div className="group-title">Colour</div>
      <div className="field"><span>Outline</span><ColorSwatches label="Outline colour" value={s.color} onPick={(hex) => patch({ color: hex })} /></div>
      <div className="field"><span>Fill</span><ColorSwatches label="Fill colour" value={s.fillColor} onPick={(hex) => patch({ fillColor: hex })} /></div>
      <div className="group-title">Position &amp; rotation</div>
      <div className="fields">
        <NumField label="X" value={Math.round(s.offset.x * 100) / 100} onCommit={(v) => patch({ offset: { ...s.offset, x: v } })} />
        <NumField label="Y" value={Math.round(s.offset.y * 100) / 100} onCommit={(v) => patch({ offset: { ...s.offset, y: v } })} />
        <NumField label="Rotation" suffix="°" value={s.rotation} onCommit={(v) => patch({ rotation: v }, true)} />
        <NumField label="Scale" suffix="%" value={Math.round(s.scale * 100)} min={10} max={1e9} onCommit={(v) => patch({ scale: v / 100 })} />
        <NumField label="Width stretch" suffix="%" value={Math.round((s.scaleX ?? 1) * 100)} min={10} max={1e9} onCommit={(v) => patch({ scaleX: v / 100 })} />
        <NumField label="Height stretch" suffix="%" value={Math.round((s.scaleY ?? 1) * 100)} min={10} max={1e9} onCommit={(v) => patch({ scaleY: v / 100 })} />
      </div>
      <div className="chips">
        {PRESETS.map((a) => (
          <button key={a} className={`chip sm ${s.rotation === a ? 'on' : ''}`} onClick={() => patch({ rotation: a }, true)}>{a}°</button>
        ))}
        <Tooltip tip="Flip the sign: 45° ↔ −45°" side="bottom">
          <button className="chip sm" onClick={() => patch({ rotation: -s.rotation }, true)}>±</button>
        </Tooltip>
      </div>
      <div className="checks">
        <label className="check"><input type="checkbox" checked={s.flipX} onChange={(e) => patch({ flipX: e.target.checked })} />Flip horizontal</label>
        <label className="check"><input type="checkbox" checked={s.flipY} onChange={(e) => patch({ flipY: e.target.checked })} />Flip vertical</label>
      </div>
      <div className="group-title">Labels</div>
      <Tooltip tip="Locked labels (names, lengths, angles) can't be dragged. Unlock, then drag to fine-tune; double-click a label to reset it. Hold Shift while scaling to snap to 5%. The top-bar lock locks every shape at once.">
        <label className="check"><input type="checkbox" checked={s.locked} onChange={() => useStore.getState().toggleShapeLock(s.id)} />Lock this shape's labels</label>
      </Tooltip>
      <div className="split2">
        <button className="btn ghost" onClick={() => patch({ offset: { x: 0, y: 0 } }, true)}>Re-centre shape</button>
        <Tooltip tip="Put this shape's labels (and its constructions' labels) back at their default places." side="bottom">
          <button className="btn ghost" onClick={() => useStore.getState().resetLabels(s.id)}>Reset labels</button>
        </Tooltip>
      </div>

      {n > 0 && (
        <>
          <div className="group-title">Vertex names</div>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={s.showVertexLabels} onChange={(e) => patch({ showVertexLabels: e.target.checked })} />Show</label>
            <label className="check"><input type="checkbox" checked={s.showVertexDots} onChange={(e) => patch({ showVertexDots: e.target.checked })} />Dots</label>
            {!geo.solid && <Tooltip tip="Right-angle marks stay visible by default after adding a median, altitude or another construction. Enable this to hide marks crossed by a construction."><label className="check"><input type="checkbox" checked={s.hideSplitRightMarks??false} onChange={e=>patch({hideSplitRightMarks:e.target.checked})} />Hide marks split by constructions</label></Tooltip>}
            {!geo.solid && <label className="check"><input type="checkbox" checked={s.showRightMarks} onChange={(e) => patch({ showRightMarks: e.target.checked })} />Right-angle marks</label>}
          </div>
          <div className="chips">
            <button className={`chip sm ${s.caseMode === 'upper' ? 'on' : ''}`} onClick={() => patch({ caseMode: 'upper' })}>A B C</button>
            <button className={`chip sm ${s.caseMode === 'lower' ? 'on' : ''}`} onClick={() => patch({ caseMode: 'lower' })}>a b c</button>
          </div>
          <div className="names">
            {s.names.map((nm, i) => (
              <div key={i} className="name-cell">
                <TextField value={nm} width={46} onCommit={(t) => setArr('names', i, t.toUpperCase())} />
                <button type="button" className={`ar-pick ${pickIdx === i ? 'on' : ''}`} dir="rtl" title="Pick the Arabic letter" aria-label={`Arabic letter for ${nm}`} onClick={() => setPickIdx(pickIdx === i ? null : i)}>{arKey(vertexArabicPlain(s, i, figStyle))}</button>
              </div>
            ))}
          </div>
          {pickIdx !== null && pickIdx < s.names.length && (() => {
            const taken = new Set(s.names.map((_, j) => (j === pickIdx ? '' : vertexArabicPlain(s, j, figStyle))));
            const free = VERTEX_AR_LETTERS.filter((c) => !taken.has(c));
            const choose = (c: string | null) => {
              const arr = Array.from({ length: s.names.length }, (_, j) => s.namesAr?.[j] ?? null);
              arr[pickIdx] = c;
              patch({ namesAr: arr });
              setPickIdx(null);
            };
            return (
              <div className="ar-palette" role="dialog" aria-label="Arabic vertex letters" dir="rtl">
                <span className="ar-palette-title">حرف الرأس {s.names[pickIdx] || pickIdx + 1}</span>
                <div className="ar-palette-row">
                  {free.map((c) => <button key={c} type="button" className="ar-palette-key" onClick={() => choose(c)}>{arKey(c)}</button>)}
                </div>
                <button type="button" className="ar-palette-auto" onClick={() => choose(null)}>تلقائي</button>
                <button type="button" className="ar-palette-close" aria-label="Close" onClick={() => setPickIdx(null)}>✕</button>
              </div>
            );
          })()}

          <div className="group-title">
            {geo.solid ? "Edge lengths" : "Side lengths"}
            <Tooltip tip="Fill every side with its drawn length (from the dimensions above)." side="bottom">
              <button className="mini" onClick={fillSides}>Fill from dimensions</button>
            </Tooltip>
          </div>
          <div className="rows">
            {s.sides.map((sd, i) => (
              <div key={i} className="row-item">
                <b>{geo.solid ? `${s.names[geo.solid.edges[i]?.a] ?? ""}${s.names[geo.solid.edges[i]?.b] ?? ""}` : `${s.names[i]}${s.names[(i + 1) % n]}`}</b>
                <TextField value={sd.text} placeholder="hidden" onCommit={(t) => setArr('sides', i, { ...sd, text: t })} />
                <label className="check tiny"><input type="checkbox" checked={sd.unit} onChange={(e) => setArr('sides', i, { ...sd, unit: e.target.checked })} />cm</label>
              </div>
            ))}
          </div>

          {!geo.solid && s.defId === 'mech-wedge' && <>
          <Tooltip tip="The label can be any value, even if it is not the true slope angle. A horizontal base is drawn from the lower end under the incline.">
            <div className="group-title">Angle at the base</div>
          </Tooltip>
          <div className="rows">
            <div className="row-item">
              <label className="check tiny"><input type="checkbox" checked={s.angles[0]?.show ?? false} onChange={(e) => setArr('angles', 0, { ...(s.angles[0] ?? { show: false, text: '', arc: true }), show: e.target.checked })} /><b>Show</b></label>
              <TextField value={s.angles[0]?.text ?? ''} placeholder="any label (or auto)" onCommit={(t) => setArr('angles', 0, { ...(s.angles[0] ?? { show: true, text: '', arc: true }), text: t, show: true })} />
              <label className="check tiny"><input type="checkbox" checked={s.angles[0]?.arc ?? true} onChange={(e) => setArr('angles', 0, { ...(s.angles[0] ?? { show: true, text: '', arc: true }), arc: e.target.checked })} />arc</label>
            </div>
          </div>
          </>}
          {!geo.solid && s.defId !== 'mech-wedge' && <>
          <div className="group-title">Angles</div>
          <div className="rows">
            {s.angles.map((an, i) => (
              <div key={i} className="row-item">
                <label className="check tiny"><input type="checkbox" checked={an.show} onChange={(e) => setArr('angles', i, { ...an, show: e.target.checked })} /><b>∠{s.names[i]}</b></label>
                <TextField value={an.text} placeholder="auto" onCommit={(t) => setArr('angles', i, { ...an, text: t })} />
                <label className="check tiny"><input type="checkbox" checked={an.arc} onChange={(e) => setArr('angles', i, { ...an, arc: e.target.checked })} />arc</label>
              </div>
            ))}
          </div>
          </>}
        </>
      )}

      {(geo.circle || geo.solid) && (
        <>
          <div className="group-title">{geo.solid && s.defId !== "solid-sphere" ? "Base centre" : "Centre"}</div>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={s.center.show} onChange={(e) => patch({ center: { ...s.center, show: e.target.checked } })} />{geo.solid && s.defId !== "solid-sphere" ? "Show base centre" : "Show centre"}</label>
            <TextField value={s.center.name} width={46} onCommit={(t) => patch({ center: { ...s.center, name: t.toUpperCase() } })} />
          </div>
        </>
      )}
    </div>
  );
}

function SolidControls({ s, patch }: { s: ShapeInstance; patch: (p: Partial<ShapeInstance>, fit?: boolean) => void }) {
  const settings = solidSettings(s.solid);
  const geometry = geometryOf(s).solid!;
  const set = (p: Partial<SolidSettings>, fit = false) => patch({ solid: { ...settings, ...p } }, fit);
  const labels = settings.labels;
  return <>
    <div className="group-title">3D view</div>
    <div className="chips">
      <button className={`chip sm ${settings.projection === 'cabinet' ? 'on' : ''}`} onClick={() => set({ projection: 'cabinet', angle: 45, depth: 0.5 }, true)}>Cabinet</button>
      <button className={`chip sm ${settings.projection === 'orthographic' ? 'on' : ''}`} onClick={() => set({ projection: 'orthographic', angle: 35.264 }, true)}>Isometric</button>
    </div>
    <div className="fields">
      <NumField label={settings.projection === 'cabinet' ? 'Depth angle' : 'Elevation'} suffix="°" value={settings.angle} min={5} max={80} onCommit={angle => set({ angle }, true)} />
      <NumField label="Turn solid" suffix="°" value={settings.yaw} min={-360} max={360} onCommit={yaw => set({ yaw }, true)} />
      {settings.projection === 'cabinet' && <NumField label="Depth scale" value={settings.depth} min={0.1} max={1} step={0.1} onCommit={depth => set({ depth }, true)} />}
    </div>
    <div className="chips">
      {[0, 45, 90, 135, 180, 225, 270, 315].map(yaw => <button key={yaw} className={`chip sm ${settings.yaw === yaw ? 'on' : ''}`} onClick={() => set({ yaw }, true)}>{yaw}°</button>)}
    </div>
    <label className="check"><input type="checkbox" checked={settings.showHidden} onChange={e => set({ showHidden: e.target.checked })} />Show hidden edges (dashed)</label>
    {geometry.guides.length > 0 && <>
      <Tooltip tip="Lengths come from the solid's 3D dimensions. Rotate the view to reveal other faces.">
      <div className="group-title">3D guides</div>
      </Tooltip>
      <div className="rows">
        {geometry.guides.map(g => {
          const key = g.key === 'height' ? 'showHeight' : g.key === 'radius' ? 'showRadius' : 'showDiagonal';
          const title = g.key === 'height' ? 'Height' : g.key === 'radius' ? 'Radius' : 'Space diagonal';
          return <div key={g.key} className="row-item">
            <label className="check tiny"><input type="checkbox" checked={settings[key]} onChange={e => set({ [key]: e.target.checked })} />{title}</label>
            <TextField value={labels[g.key].text} placeholder="label" onCommit={text => set({ labels: { ...labels, [g.key]: { ...labels[g.key], text } } })} />
            <label className="check tiny"><input type="checkbox" checked={labels[g.key].unit} onChange={e => set({ labels: { ...labels, [g.key]: { ...labels[g.key], unit: e.target.checked } } })} />cm</label>
          </div>;
        })}
      </div>
      <button className="btn ghost wide" onClick={() => set({ labels: Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, { ...value, text: geometry.guides.find(g => g.key === key) ? formatNumber(geometry.guides.find(g => g.key === key)!.length) : value.text }])) as SolidSettings['labels'] })}>Fill guide lengths</button>
      {geometry.guides.some(g => g.key === 'height') && <label className="check"><input type="checkbox" checked={s.showRightMarks} onChange={e => patch({ showRightMarks: e.target.checked })} />Mark right angle at altitude foot</label>}
    </>}
  </>;
}
