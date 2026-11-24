import { EquationEditor } from './EquationEditor';
import { FunctionEditor } from './FunctionEditor';
import { useEffect, useState } from 'react';
import { AXIS_KEYS, AXIS_RAYS, PRESETS_2D, PRESETS_3D, axisNumberSize, axisTick, presetRanges } from '../core/axes';
import { addAxisItem, editAxisPoint, parseAxisNumber, patchAxes, removeAxisPoint, startAxisTool } from '../core/axisActions';
import { useStore } from '../core/store';
import type { AxisCoord, AxisKey, AxisPoint, AxesSettings, AxesTool, ShapeInstance } from '../core/types';
import { Tooltip } from './Tooltip';

export function AxesInspector({s}:{s:ShapeInstance}){
  const a=s.axes!,keys=AXIS_KEYS.slice(0,a.dimension);
  const [range,setRange]=useState<Record<string,string>>({}),[spacing,setSpacing]=useState('1'),[steps,setSteps]=useState('1'),[applyTo,setApplyTo]=useState<AxisKey|'all'>('all'),[nSize,setNSize]=useState('100'),[unit,setUnit]=useState(a.tickUnit??''),[error,setError]=useState('');
  const [preset,setPreset]=useState('0'),[long,setLong]=useState('8'),[short,setShort]=useState('4');
  useEffect(()=>{const t=axisTick(a,applyTo==='all'?'x':applyTo);setRange(Object.fromEntries(Object.entries(s.params).map(([k,v])=>[k,String(v)])));setSpacing(String(t.spacing));setSteps(String(t.steps));setNSize(String(Math.round(axisNumberSize(a)*100)));setUnit(a.tickUnit??'');},[s.id,s.params,a.step,a.axisTicks,a.numberStep,a.numberSize,a.tickUnit,applyTo]);
  const run=(fn:()=>void)=>{try{fn();setError('');useStore.getState().clearNotice();}catch(e){setError((e as Error).message);useStore.getState().notify('error',(e as Error).message);}};
  const patch=(p:Partial<AxesSettings>,fit=false)=>run(()=>patchAxes(s.id,p,undefined,fit));
  const presets=a.dimension===2?PRESETS_2D:[{name:'Equal positive / negative',long:[]},...PRESETS_3D];
  const commitUnit=()=>{if(unit!==(a.tickUnit??''))patch({tickUnit:unit});};
  return <div className="panel axes-panel">
    <div className="insp-title">{a.dimension}D axes <span className="actions"><button className="icon-btn" aria-label="Duplicate axes" onClick={()=>useStore.getState().duplicateShape(s.id)}>⧉</button><button className="icon-btn danger" aria-label="Delete axes" onClick={()=>useStore.getState().removeShape(s.id)}>✕</button></span></div>
    {error&&<div className="warn" role="alert">{error}</div>}
    <div className="group-title">Axis lengths</div>
    <label className="field"><span>Length preset</span><select aria-label="Axis length preset" value={preset} onChange={e=>setPreset(e.target.value)}>{presets.map((p,i)=><option key={i} value={i}>{p.name}</option>)}</select></label>
    <div className="fields"><label className="field"><span>Long / equal length</span><input value={long} onChange={e=>setLong(e.target.value)} /></label><label className="field"><span>Short length</span><input value={short} onChange={e=>setShort(e.target.value)} /></label></div>
    <button className="btn ghost wide" onClick={()=>run(()=>{const l=parseAxisNumber(long),v=parseAxisNumber(short);if(l<=0||v<=0||Number(preset)!==0&&l<=v)throw new Error('Lengths must be positive; the long length must exceed the short length.');patchAxes(s.id,{},presetRanges(a.dimension,presets[Number(preset)].long,Number(preset)===0,l,v),true);useStore.setState({axesTool:null});})}>Apply length preset</button>
    <div className="group-title">Coordinate ranges</div>
    {keys.map(k=><div className="fields" key={k}>{['Min','Max'].map(t=><label className="field" key={t}><span>{k.toUpperCase()} {t==='Min'?'minimum':'maximum'}</span><input aria-label={`${k.toUpperCase()} ${t==='Min'?'minimum':'maximum'}`} value={range[k+t]??''} onChange={e=>setRange({...range,[k+t]:e.target.value})} /></label>)}</div>)}
    <button className="btn ghost wide" onClick={()=>run(()=>{patchAxes(s.id,{},Object.fromEntries(Object.entries(range).map(([k,v])=>[k,parseAxisNumber(v,k)])),true);useStore.setState({axesTool:null});})}>Apply ranges</button>
    <div className="group-title">Grid &amp; numbering</div>
    {a.dimension===2&&<label className="check"><input type="checkbox" checked={a.grid} onChange={e=>patch({grid:e.target.checked})} />Square grid</label>}
    <label className="check"><input type="checkbox" checked={a.numbers} onChange={e=>patch({numbers:e.target.checked})} />Numbered axes</label>
    <Tooltip tip="Unlock labels to drag the zero in either image.">
      <label className="check"><input type="checkbox" checked={a.showZero??a.numbers} onChange={e=>patch({showZero:e.target.checked})} />Show origin zero</label>
    </Tooltip>
    <Tooltip tip="Spacing is the gap between tick marks. Steps is the number written on each tick (first after 0, then 2×, 3×, …). The square grid follows the ticks. Apply to one axis or all of them.">
      <div className="fields"><label className="field"><span>Spacing</span><input aria-label="Tick spacing" value={spacing} onChange={e=>setSpacing(e.target.value)} /></label><label className="field"><span>Steps</span><input aria-label="Tick steps" value={steps} onChange={e=>setSteps(e.target.value)} /></label></div>
    </Tooltip>
    <div className="chips" role="group" aria-label="Apply ticks to">{(['all',...keys] as const).map(k=>{const on=applyTo===k;return <button key={k} type="button" className={`chip sm ${on?'on':''}`} aria-pressed={on} onClick={()=>setApplyTo(k)}>{k==='all'?'All axes':k.toUpperCase()}</button>;})}</div>
    <label className="slider"><span>Axis number size <b>{nSize}%</b></span><input aria-label="Axis number size" type="range" min="40" max="220" step="5" value={nSize} onChange={e=>setNSize(e.target.value)} /></label>
    <button className="btn ghost wide" onClick={()=>run(()=>{const sp=parseAxisNumber(spacing,'Spacing'),st=parseAxisNumber(steps,'Steps');const targets=applyTo==='all'?keys:[applyTo];const axisTicks={...a.axisTicks};for(const k of targets)axisTicks[k]={spacing:sp,steps:st};patchAxes(s.id,{axisTicks,step:axisTick({...a,axisTicks},'x').spacing,numberSize:parseAxisNumber(nSize,'Axis number size')/100});})}>Apply numbering</button>
    <div className="group-title">Hide numbers on</div>
    <div className="chips">{AXIS_RAYS.filter(r=>a.dimension===3||r.startsWith('x')||r.startsWith('y')).map(r=>{const on=a.hideRays?.includes(r);return <button key={r} className={`chip sm ${on?'on':''}`} aria-pressed={!!on} onClick={()=>patch({hideRays:on?(a.hideRays??[]).filter(x=>x!==r):[...a.hideRays??[],r]})}>{r.toUpperCase()}</button>;})}</div>
    <Tooltip tip="Empty keeps 1, 2, 3. pi or \pi draws π, 2π, 3π on the axes you select (Arabic reads 2π right-to-left). Other LaTeX names, such as \theta, are drawn as their symbol. 2D functions use those tick values (sin peaks at ½π when π is on X and a tick is labelled 0.5).">
      <label className="field"><span>Tick labels as</span><input aria-label="Tick unit" placeholder="pi, \pi or \theta" value={unit} onChange={e=>setUnit(e.target.value)} onBlur={commitUnit} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}} /></label>
    </Tooltip>
    <div className="chips" role="group" aria-label="Tick unit axis">{keys.map(k=>{const selected=a.tickUnitOn===undefined||a.tickUnitOn.includes(k);return <button key={k} type="button" className={`chip sm ${selected?'on':''}`} aria-pressed={selected} onClick={()=>{const cur=a.tickUnitOn??[...keys];const next=cur.includes(k)?cur.filter(x=>x!==k):[...cur,k];patch({tickUnitOn:keys.filter(x=>next.includes(x))});}}>{k.toUpperCase()}</button>;})}</div>
    <div className="group-title">Labels &amp; layout</div><label className="check"><input type="checkbox" checked={s.locked} onChange={()=>useStore.getState().toggleShapeLock(s.id)} />Lock this axes system's labels</label><div className="split2"><button className="btn ghost" onClick={()=>useStore.getState().resetLabels(s.id)}>Reset labels</button><button className="btn ghost" onClick={()=>useStore.getState().patchShape(s.id,{offset:{x:0,y:0}},{fit:true})}>Re-centre axes</button></div>
    <div className="fields"><label className="field"><span>Rotation</span><input type="number" value={s.rotation} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))useStore.getState().patchShape(s.id,{rotation:n},{fit:true});}} /></label><label className="field"><span>Scale %</span><input type="number" min="10" max="1000000000" value={Math.round(s.scale*100)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=10&&n<=1e9)useStore.getState().patchShape(s.id,{scale:n/100});}} /></label></div>
  </div>;
}
export function AxesConstructions({s}:{s:ShapeInstance}){
  const a=s.axes!,keys=AXIS_KEYS.slice(0,a.dimension);
  const [plane,setPlane]=useState<AxesTool['plane']>(a.front),[level,setLevel]=useState('0'),[error,setError]=useState('');
  const [kind,setKind]=useState<AxesTool['kind']>('point'),[rows,setRows]=useState<string[][]>(Array.from({length:4},()=>['0','0','0']));
  const [name,setName]=useState(''),[coords,setCoords]=useState(false),[position,setPosition]=useState<'beside'|'below'>('beside'),[dashed,setDashed]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  useEffect(()=>{setPlane(a.front);setEditing(null);setError('');},[s.id,a.front]);
  useEffect(()=>{const t=useStore.getState().axesTool;if(t?.shape!==s.id)return;try{const value=parseAxisNumber(level),fixed=AXIS_KEYS.find(k=>!plane.includes(k))!;if(a.dimension===3&&(value<s.params[fixed+'Min']||value>s.params[fixed+'Max']))return;useStore.setState({axesTool:{...t,plane,level:value,showCoordinates:coords,coordinatePosition:position}});}catch{}},[plane,level,coords,position]);
  const run=(fn:()=>void)=>{try{fn();setError('');useStore.getState().clearNotice();}catch(e){setError((e as Error).message);useStore.getState().notify('error',(e as Error).message);}};
  const patch=(p:Partial<AxesSettings>,fit=false)=>run(()=>patchAxes(s.id,p,undefined,fit));
  const count=kind==='point'?1:kind==='plane'?4:2;
  const tool=(k:AxesTool['kind'])=>run(()=>{const v=a.dimension===3?parseAxisNumber(level,'Placement level'):0;const fixed=AXIS_KEYS.find(q=>!plane.includes(q))!;if(a.dimension===3&&(v<s.params[fixed+'Min']||v>s.params[fixed+'Max']))throw new Error('Placement level is outside its axis range.');startAxisTool(s.id,k,{plane,level:v,showCoordinates:coords,coordinatePosition:position});});
  return <div className="axes-constructions">
    {error&&<div className="warn" role="alert">{error}</div>}
    <Tooltip tip={a.dimension===2?(a.grid?'Clicks snap to grid coordinates.':'Click anywhere inside the coordinate range.'):'Choose a placement plane and fix its third coordinate. Clicking an existing point uses its exact 3D coordinates.'}>
      <div className="group-title">Add on the image</div>
    </Tooltip>
    {a.dimension===3&&<div className="fields"><label className="field"><span>Placement plane</span><select value={plane} onChange={e=>setPlane(e.target.value as AxesTool['plane'])}>{['xy','xz','yz'].map(p=><option value={p} key={p}>{p.toUpperCase()}</option>)}</select></label><label className="field"><span>{AXIS_KEYS.find(k=>!plane.includes(k))!.toUpperCase()} fixed at</span><input aria-label="Placement level" value={level} onChange={e=>setLevel(e.target.value)} /></label></div>}
    <label className="check"><input type="checkbox" checked={coords} onChange={e=>setCoords(e.target.checked)} />Show new point coordinates</label><label className="field"><span>Coordinate label position</span><select value={position} onChange={e=>setPosition(e.target.value as 'beside'|'below')}><option value="beside">Beside point</option><option value="below">Below point</option></select></label>
    <div className="split2">{(['point','line','vector'] as AxesTool['kind'][]).map(k=><button key={k} className="btn ghost" onClick={()=>tool(k)}>Pick {k}</button>)}</div>
    <div className="group-title">Add by coordinates</div>
    <label className="field"><span>Item type</span><select aria-label="Coordinate item type" value={kind} onChange={e=>setKind(e.target.value as AxesTool['kind'])}><option value="point">Point</option><option value="line">Infinite line · two points</option><option value="vector">Vector · start → end</option></select></label>
    {kind==='point'&&<label className="field"><span>Point name (optional)</span><input aria-label="New point name" value={name} onChange={e=>setName(e.target.value)} /></label>}
    {Array.from({length:count},(_,i)=><div className="axis-coordinates" key={i}><span>{kind==='vector'?(i?'End':'Start'):`P${i+1}`}</span>{keys.map((k,j)=><label key={k}><span>{k.toUpperCase()}</span><input aria-label={`P${i+1} ${k.toUpperCase()}`} value={rows[i][j]} onChange={e=>setRows(rows.map((r,n)=>n===i?r.map((v,m)=>m===j?e.target.value:v):r))} /></label>)}</div>)}
    {(kind==='line'||kind==='vector')&&<label className="check"><input type="checkbox" checked={dashed} onChange={e=>setDashed(e.target.checked)} />Dashed</label>}
    <button className="btn primary wide" onClick={()=>run(()=>{const values=rows.slice(0,count).map((r,i)=>({x:parseAxisNumber(r[0],`P${i+1} X`),y:parseAxisNumber(r[1],`P${i+1} Y`),z:a.dimension===3?parseAxisNumber(r[2],`P${i+1} Z`):0}));addAxisItem(s.id,kind,values,{name,showCoordinates:coords,coordinatePosition:position,dashed});useStore.setState({axesTool:null});})}>Add {kind} by coordinates</button>
    <EquationEditor s={s} />
    {a.dimension===2&&<FunctionEditor s={s} />}
    <Tooltip tip="Deleting a point also removes attached lines, vectors and planes. Undo restores them.">
      <div className="group-title">Points <small>{a.points.length}</small></div>
    </Tooltip>
    {a.points.map(p=><div key={p.id} className="axis-item"><div className="con-row"><button className="mini" onClick={()=>setEditing(editing===p.id?null:p.id)}>{p.name} ({keys.map(k=>Number(p.at[k].toFixed(3))).join(', ')})</button><button className="icon-btn danger" aria-label={`Delete axes point ${p.name}`} onClick={()=>run(()=>removeAxisPoint(s.id,p.id))}>✕</button></div>{editing===p.id&&<AxisPointEditor key={p.id} p={p} dimension={a.dimension} onSave={v=>run(()=>editAxisPoint(s,p.id,v))} />}</div>)}
    {a.lines.length>0&&<><div className="group-title">Lines &amp; vectors</div>{a.lines.map(l=><div key={l.id} className="con-row"><span>{l.kind} {a.points.find(p=>p.id===l.a)?.name}{l.kind==='vector'?' → ':' — '}{a.points.find(p=>p.id===l.b)?.name}</span><label className="check tiny"><input type="checkbox" checked={l.dashed} onChange={e=>patch({lines:a.lines.map(q=>q.id===l.id?{...q,dashed:e.target.checked}:q)})} />dash</label><button className="icon-btn danger" aria-label="Delete axes line" onClick={()=>patch({lines:a.lines.filter(q=>q.id!==l.id)})}>✕</button></div>)}</>}
    {a.planes.length>0&&<><div className="group-title">Planes</div>{a.planes.map(p=><div key={p.id} className="con-row"><span>{p.points.map(id=>a.points.find(q=>q.id===id)?.name).join(' · ')}</span><button className="icon-btn danger" aria-label="Delete axes plane" onClick={()=>patch({planes:a.planes.filter(q=>q.id!==p.id)})}>✕</button></div>)}</>}
  </div>;
}
function AxisPointEditor({p,dimension,onSave}:{p:AxisPoint;dimension:2|3;onSave:(p:Partial<AxisPoint>)=>void}){
 const [name,setName]=useState(p.name),[at,setAt]=useState([String(p.at.x),String(p.at.y),String(p.at.z)]),[show,setShow]=useState(p.showName),[coords,setCoords]=useState(p.showCoordinates),[pos,setPos]=useState(p.coordinatePosition),[error,setError]=useState('');
 useEffect(()=>{setName(p.name);setAt([String(p.at.x),String(p.at.y),String(p.at.z)]);setShow(p.showName);setCoords(p.showCoordinates);setPos(p.coordinatePosition);},[p]);
 return <div><label className="field"><span>Point name</span><input value={name} onChange={e=>setName(e.target.value)} /></label><div className="axis-coordinates">{AXIS_KEYS.slice(0,dimension).map((k,i)=><label key={k}><span>{k.toUpperCase()}</span><input value={at[i]} onChange={e=>setAt(at.map((v,j)=>i===j?e.target.value:v))} /></label>)}</div><label className="check"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)} />Show name</label><label className="check"><input type="checkbox" checked={coords} onChange={e=>setCoords(e.target.checked)} />Show coordinates</label><select aria-label="Point coordinate position" value={pos} onChange={e=>setPos(e.target.value as 'beside'|'below')}><option value="beside">Beside</option><option value="below">Below</option></select>{error&&<div className="warn">{error}</div>}<button className="btn ghost wide" onClick={()=>{try{const value:AxisCoord={x:parseAxisNumber(at[0]),y:parseAxisNumber(at[1]),z:dimension===3?parseAxisNumber(at[2]):0};setError('');onSave({name:name.trim(),at:value,showName:show,showCoordinates:coords,coordinatePosition:pos});}catch(e){setError((e as Error).message);}}}>Update point</button></div>;
}
