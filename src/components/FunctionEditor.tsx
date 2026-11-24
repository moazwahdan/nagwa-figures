import { useState } from 'react';
import type { AxisFunction, ShapeInstance } from '../core/types';
import { addAxisFunction, removeAxisFunction, updateAxisFunction, type FunctionInput } from '../core/axisActions';
import { compileFunction, evalConstant } from '../core/functions';
import { useStore } from '../core/store';
import { Tooltip } from './Tooltip';
const EXAMPLES=['x^2 - 3x + 1','sin(x)','ln(x)','log(x)','log_2(x + 3)','sqrt(x) + ln(x - 1)','e^(-x^2)','1/(x - 2)','x*ln(x)'];
export function FunctionEditor({s}:{s:ShapeInstance}){
 const a=s.axes!,list=a.functions??[];
 const [expr,setExpr]=useState('x^2 - 2'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[label,setLabel]=useState(''),[dashed,setDashed]=useState(false),[arrows,setArrows]=useState(true),[showLabel,setShowLabel]=useState(false),[editing,setEditing]=useState<string|null>(null),[error,setError]=useState('');
 if(a.dimension!==2)return null;
 const fail=(e:unknown)=>{const m=(e as Error).message;setError(m);useStore.getState().notify('error',m);};
 const reset=()=>{setEditing(null);setError('');};
 const read=():FunctionInput=>{compileFunction(expr);const input:FunctionInput={expr,dashed,arrows,showLabel,label};if(from.trim())input.from=evalConstant(from,'Domain from');if(to.trim())input.to=evalConstant(to,'Domain to');return input;};
 const submit=()=>{try{const input=read();if(editing)updateAxisFunction(s.id,editing,input);else addAxisFunction(s.id,input);useStore.setState({axesTool:null});useStore.getState().clearNotice();reset();}catch(e){fail(e);}};
 const edit=(f:AxisFunction)=>{setEditing(f.id);setExpr(f.expr);setFrom(f.from===undefined?'':String(f.from));setTo(f.to===undefined?'':String(f.to));setLabel(f.label);setDashed(f.dashed);setArrows(f.arrows);setShowLabel(f.showLabel);setError('');};
 const toggle=(f:AxisFunction,patch:Partial<AxisFunction>)=>{try{patchAxesFunctions(f,patch);}catch(e){fail(e);}};
 const patchAxesFunctions=(f:AxisFunction,patch:Partial<AxisFunction>)=>{const next={...f,...patch};updateAxisFunction(s.id,f.id,{expr:next.expr,from:next.from,to:next.to,dashed:next.dashed,arrows:next.arrows,showLabel:next.showLabel,label:next.label});};
 return <><div className="group-title">Function curves <small>{list.length}</small></div>
 <Tooltip tip="y = f(x). Write x^2, 2x, sin(x), ln(x), log(x) (base 10), log_2(x) or log(x, 2), sqrt(x), abs(x), e^x, pi. x and y follow the tick values (Spacing / Steps). If π is on the X axis, sin(x) peaks at the tick labelled ½π. Arabic labels: f(x) → د(س), m(x) → م(س), q(x) → ق(س).">
 <label className="field"><span>y =</span><input dir="ltr" aria-label="Function expression" value={expr} onChange={e=>setExpr(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();}} /></label>
 </Tooltip>
 <div className="chips" role="group" aria-label="Function examples">{EXAMPLES.map(x=><button key={x} type="button" className="mini" onClick={()=>setExpr(x)}>{x}</button>)}</div>
 <div className="fields"><label className="field"><span>Domain from (optional)</span><input dir="ltr" aria-label="Function domain from" value={from} placeholder="axis minimum" onChange={e=>setFrom(e.target.value)} /></label><label className="field"><span>Domain to (optional)</span><input dir="ltr" aria-label="Function domain to" value={to} placeholder="axis maximum" onChange={e=>setTo(e.target.value)} /></label></div>
 <label className="field"><span>Curve label</span><input dir="ltr" aria-label="Function label" value={label} placeholder="f(x)" onChange={e=>setLabel(e.target.value)} /></label>
 <label className="check"><input type="checkbox" checked={showLabel} onChange={e=>setShowLabel(e.target.checked)} />Show label on the curve</label>
 <label className="check"><input type="checkbox" checked={arrows} onChange={e=>setArrows(e.target.checked)} />Arrowheads where the curve leaves the axes</label>
 <label className="check"><input type="checkbox" checked={dashed} onChange={e=>setDashed(e.target.checked)} />Dashed curve</label>
 {error&&<div className="warn" role="alert">{error}</div>}
 <div className="split2"><Tooltip tip="Undefined parts are skipped, and the curve is broken at asymptotes and jumps (1/x, tan(x), ln(x) at 0). The curve is cut at the axis ranges."><button className="btn primary" onClick={submit}>{editing?'Save changes':'Add function'}</button></Tooltip>{editing&&<button className="btn ghost" onClick={reset}>Cancel</button>}</div>
 {list.map(f=><div className="con-row equation-row" key={f.id}><button className="mini" aria-label={`Edit function ${f.label}`} onClick={()=>edit(f)}><b>{f.label}</b> = {f.expr}{f.from!==undefined||f.to!==undefined?`  [${f.from??'−∞'}, ${f.to??'∞'}]`:''}</button><label className="check tiny"><input type="checkbox" checked={f.showLabel} onChange={e=>toggle(f,{showLabel:e.target.checked})} />label</label><button className="icon-btn danger" aria-label={`Delete function ${f.label}`} onClick={()=>{try{removeAxisFunction(s.id,f.id);if(editing===f.id)reset();}catch(e){fail(e);}}}>✕</button></div>)}</>;
}
