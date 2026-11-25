import { useState, type KeyboardEvent } from 'react';
import type { AxisFunction, ShapeInstance } from '../core/types';
import { addAxisFunction, removeAxisFunction, updateAxisFunction, type FunctionInput } from '../core/axisActions';
import { compileFunction, evalAreaBound, evalConstant, xUnit } from '../core/functions';
import { useStore } from '../core/store';
import { Tooltip } from './Tooltip';
import { ColorSwatches } from './ColorSwatches';
const EXAMPLES=['x^2 - 3x + 1','sin(x)','ln(x)','log(x)','log_2(x + 3)','sqrt(x) + ln(x - 1)','e^(-x^2)','1/(x - 2)','x*ln(x)'];
export function FunctionEditor({s}:{s:ShapeInstance}){
 const a=s.axes!,list=a.functions??[],ux=xUnit(a);
 const blank={expr:'x^2 - 2',from:'',to:'',label:'',dashed:false,arrows:true,showLabel:false,color:undefined as string|undefined,areaOn:false,areaFrom:'',areaTo:'',areaColor:'#F9DDA4'};
 type Form=typeof blank;
 const [f,setF]=useState<Form>(blank),[editing,setEditing]=useState<string|null>(null),[error,setError]=useState('');
 if(a.dimension!==2)return null;
 const fail=(e:unknown)=>{const m=(e as Error).message;setError(m);useStore.getState().notify('error',m);};
 const num=(v:number)=>String(Math.round(v*1e6)/1e6);
 const read=(x:Form):FunctionInput=>{compileFunction(x.expr);const input:FunctionInput={expr:x.expr,dashed:x.dashed,arrows:x.arrows,showLabel:x.showLabel,label:x.label};if(x.color)input.color=x.color;if(x.areaOn)input.area={from:evalAreaBound(x.areaFrom,a,'Area from'),to:evalAreaBound(x.areaTo,a,'Area to'),color:x.areaColor};if(x.from.trim())input.from=evalConstant(x.from,'Domain from');if(x.to.trim())input.to=evalConstant(x.to,'Domain to');return input;};
 /** Every change is applied at once to the function being edited (no second copy is added). */
 const change=(patch:Partial<Form>)=>{const next={...f,...patch};setF(next);if(!editing)return;try{updateAxisFunction(s.id,editing,read(next));setError('');}catch(e){setError((e as Error).message);}};
 const add=()=>{try{const input=read(f);addAxisFunction(s.id,input);const fresh=useStore.getState().shapes.find(x=>x.id===s.id)?.axes?.functions?.slice(-1)[0];useStore.setState({axesTool:null});useStore.getState().clearNotice();setError('');if(fresh)setEditing(fresh.id);}catch(e){fail(e);}};
 const edit=(fn:AxisFunction)=>{setEditing(fn.id);setError('');setF({expr:fn.expr,from:fn.from===undefined?'':String(fn.from),to:fn.to===undefined?'':String(fn.to),label:fn.label,dashed:fn.dashed,arrows:fn.arrows,showLabel:fn.showLabel,color:fn.color,areaOn:!!fn.area,areaFrom:fn.area?num(fn.area.from/ux):'',areaTo:fn.area?num(fn.area.to/ux):'',areaColor:fn.area?.color??'#F9DDA4'});};
 const fresh=()=>{setEditing(null);setError('');setF(blank);};
 const toggle=(fn:AxisFunction,patch:Partial<AxisFunction>)=>{try{const next={...fn,...patch};updateAxisFunction(s.id,fn.id,{expr:next.expr,from:next.from,to:next.to,dashed:next.dashed,arrows:next.arrows,showLabel:next.showLabel,label:next.label,color:next.color,area:next.area});if(editing===fn.id)edit(next);}catch(e){fail(e);}};
 const exprKey=(e:KeyboardEvent)=>{if(e.key==='Enter'){if(editing)change({});else add();}};
 return <><div className="group-title">Function curves <small>{list.length}</small></div>
 {list.map(fn=><div className={'con-row equation-row'+(editing===fn.id?' active':'')} key={fn.id} style={editing===fn.id?{outline:'2px solid var(--accent)',borderRadius:6}:undefined}><button className="mini" aria-label={`Edit function ${fn.label}`} aria-pressed={editing===fn.id} onClick={()=>{if(editing===fn.id)fresh();else edit(fn);}}><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:fn.color??'#000',marginInlineEnd:6}}/><b>{fn.label}</b> = {fn.expr}{fn.from!==undefined||fn.to!==undefined?`  [${fn.from??'−∞'}, ${fn.to??'∞'}]`:''}</button><label className="check tiny"><input type="checkbox" checked={fn.showLabel} onChange={e=>toggle(fn,{showLabel:e.target.checked})} />label</label><button className="icon-btn danger" aria-label={`Delete function ${fn.label}`} onClick={()=>{try{removeAxisFunction(s.id,fn.id);if(editing===fn.id)fresh();}catch(e){fail(e);}}}>✕</button></div>)}
 <div className="group-title" style={{fontSize:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><span>{editing?'Editing — changes apply as you type':'New function'}</span>{editing&&<button type="button" className="btn sm primary" onClick={fresh}>+ New function</button>}</div>
 <Tooltip tip="y = f(x). Write x^2, 2x, sin(x), ln(x), log(x) (base 10), log_2(x) or log(x, 2), sqrt(x), abs(x), e^x, pi. x and y follow the tick values (Spacing / Steps). If π is on the X axis, sin(x) peaks at the tick labelled ½π. Arabic labels: f(x) → د(س), m(x) → م(س), q(x) → ق(س).">
 <label className="field"><span>y =</span><input dir="ltr" aria-label="Function expression" value={f.expr} onChange={e=>setF({...f,expr:e.target.value})} onBlur={()=>{if(editing)change({});}} onKeyDown={exprKey} /></label>
 </Tooltip>
 <div className="chips" role="group" aria-label="Function examples">{EXAMPLES.map(x=><button key={x} type="button" className="mini" onClick={()=>change({expr:x})}>{x}</button>)}</div>
 <div className="fields"><label className="field"><span>Domain from (optional)</span><input dir="ltr" aria-label="Function domain from" value={f.from} placeholder="axis minimum" onChange={e=>setF({...f,from:e.target.value})} onBlur={()=>{if(editing)change({});}} /></label><label className="field"><span>Domain to (optional)</span><input dir="ltr" aria-label="Function domain to" value={f.to} placeholder="axis maximum" onChange={e=>setF({...f,to:e.target.value})} onBlur={()=>{if(editing)change({});}} /></label></div>
 <label className="field"><span>Curve label</span><input dir="ltr" aria-label="Function label" value={f.label} placeholder="f(x)" onChange={e=>setF({...f,label:e.target.value})} onBlur={()=>{if(editing)change({});}} /></label>
 <label className="check"><input type="checkbox" checked={f.showLabel} onChange={e=>change({showLabel:e.target.checked})} />Show label on the curve</label>
 <label className="check"><input type="checkbox" checked={f.arrows} onChange={e=>change({arrows:e.target.checked})} />Arrowheads where the curve leaves the axes</label>
 <div className="field"><span>Curve colour</span><ColorSwatches label="Curve colour" value={f.color} onPick={c=>change({color:c})}/></div>
 <label className="check"><input type="checkbox" checked={f.areaOn} onChange={e=>change({areaOn:e.target.checked,...(e.target.checked&&!f.areaFrom&&!f.areaTo?{areaFrom:'0',areaTo:'1'}:{})})} />Shade the area under the curve</label>
 {f.areaOn&&<><div className="fields"><label className="field"><span>Area from</span><input dir="ltr" aria-label="Shaded area from" value={f.areaFrom} placeholder={ux!==1?'0.5 = ½π  ·  pi/2':''} onChange={e=>setF({...f,areaFrom:e.target.value})} onBlur={()=>{if(editing)change({});}} onKeyDown={exprKey} /></label><label className="field"><span>Area to</span><input dir="ltr" aria-label="Shaded area to" value={f.areaTo} placeholder={ux!==1?'0.5 = ½π  ·  pi/2':''} onChange={e=>setF({...f,areaTo:e.target.value})} onBlur={()=>{if(editing)change({});}} onKeyDown={exprKey} /></label></div><div className="field"><span>Area colour</span><ColorSwatches label="Area colour" value={f.areaColor} onPick={(h)=>change({areaColor:h??'#F9DDA4'})}/></div></>}
 <label className="check"><input type="checkbox" checked={f.dashed} onChange={e=>change({dashed:e.target.checked})} />Dashed curve</label>
 {error&&<div className="warn" role="alert">{error}</div>}
 <div className="split2">{editing?<button className="btn primary" onClick={fresh}>Done · add another</button>:<Tooltip tip="Undefined parts are skipped, and the curve is broken at asymptotes and jumps (1/x, tan(x), ln(x) at 0). The curve is cut at the axis ranges."><button className="btn primary" onClick={add}>Add function</button></Tooltip>}</div></>;
}
