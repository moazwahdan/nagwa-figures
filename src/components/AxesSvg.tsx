import { useId, type ReactElement } from 'react';
import type { AxisCoord, AxesTool, Lang, SceneData, ShapeInstance, Vec } from '../core/types';
import { axisNumberSize, axisTick, axisTickMarks, axisRayHidden, axisUsesTickUnit, clipAxisLine, planeOrder, projectAxes, ranges, equationGeometry } from '../core/axes';
import { toUnits } from '../core/scene';
import { toPx } from '../core/world';
import { labelSize } from '../core/labelSizing';
import { ARROW_TO_STROKE, DOT_TO_STROKE } from '../core/paper';
import { formatNumber, localizeFunctionLabel, localizeName, renderSymbol, toArabicDigits } from '../core/labels';
import { curveGeometry } from '../core/functions';
import { Txt } from './FigureText';
export function AxesSvg({data,shape:s,lang,interactive,lockAll,tool}:{data:SceneData;shape:ShapeInstance;lang:Lang;interactive:boolean;lockAll:boolean;tool?:AxesTool|null}){
  const a=s.axes!,marker='axis-arrow-'+useId().replace(/:/g,''),stroke=data.style.stroke,fs=labelSize(data,s,lang),locked=lockAll||s.locked,ui=Math.min(data.canvas.w,data.canvas.h)/900;
  const P=(p:AxisCoord)=>toPx(data,toUnits(s,projectAxes(p,a)));
  const txt=(key:string,pos:Vec,text:string,size=fs,kind?:'tick'|'fn')=>{const n=s.nudgeByLang?.[lang]?.[key]??s.nudge[key];return <Txt key={key} pos={{x:pos.x+(n?.x??0),y:pos.y+(n?.y??0)}} text={text} lang={lang} size={size} interactive={interactive} locked={locked} owner={s.id} shapeId={s.id} labelKey={key} direction={kind==='tick'||kind==='fn'?'ltr':undefined} paint={kind==='fn'&&lang==='ar'?'fn-rtl':undefined}/>;};
  const number=(n:number)=>{const abs=formatNumber(Math.abs(n)),digits=lang==='ar'?toArabicDigits(abs):abs;if(n<-1e-8)return lang==='ar'?digits+'−':'-'+abs;return lang==='ar'?digits:formatNumber(n);};
  const tickText=(n:number,key:'x'|'y'|'z')=>{const sym=axisUsesTickUnit(a,key)?renderSymbol(a.tickUnit??''):'';if(!sym)return number(n);const abs=Math.abs(n),coef=abs<1e-8?'0':Math.abs(abs-1)<1e-6?'':formatNumber(abs),ar=lang==='ar'?toArabicDigits(coef):coef,body=lang==='ar'?sym+ar:ar+sym;if(n<-1e-8)return lang==='ar'?body+'−':'-'+body;return body;};
  const coord=(p:AxisCoord)=>'('+[p.x,p.y,...a.dimension===3?[p.z]:[]].map(number).join(lang==='ar'?'، ':', ')+')';
  const grid=[],ticks=[],axisLines=[],arrows:ReactElement[]=[],texts=[];const zero={x:0,y:0,z:0},origin=P(zero);
  const nScale=axisNumberSize(a);
  const arrowLen=stroke*ARROW_TO_STROKE,extra=arrowLen+stroke*3;
  const boundsPts=[...ranges(s.params,a.dimension).flatMap(r=>[P({...zero,[r.key]:r.min}),P({...zero,[r.key]:r.max})]),...a.points.map(p=>P(p.at))];
  const xs=boundsPts.map(p=>p.x),ys=boundsPts.map(p=>p.y);
  const head=(tip:Vec,u:Vec,id:string)=>{const base={x:tip.x-u.x*arrowLen,y:tip.y-u.y*arrowLen},side={x:-u.y*(arrowLen*.42),y:u.x*(arrowLen*.42)};arrows.push(<polygon key={id} data-axis-arrow={id} points={`${tip.x},${tip.y} ${base.x+side.x},${base.y+side.y} ${base.x-side.x},${base.y-side.y}`} fill="#000"/>);};
  for(const r of ranges(s.params,a.dimension)){
    const p=P({...zero,[r.key]:r.min}),q=P({...zero,[r.key]:r.max}),dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,u={x:dx/len,y:dy/len},n={x:u.y,y:-u.x};
    const pTip={x:p.x-u.x*extra,y:p.y-u.y*extra},qTip={x:q.x+u.x*extra,y:q.y+u.y*extra};
    xs.push(pTip.x,qTip.x);ys.push(pTip.y,qTip.y);
    axisLines.push(<line key={r.key} data-axis={r.key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#000" strokeWidth={stroke}/>);
    if(r.min<0){axisLines.push(<line key={r.key+'-pad'} x1={p.x} y1={p.y} x2={pTip.x+u.x*arrowLen} y2={pTip.y+u.y*arrowLen} stroke="#000" strokeWidth={stroke}/>);head(pTip,{x:-u.x,y:-u.y},r.key+'-');}
    if(r.max>0){axisLines.push(<line key={r.key+'+pad'} x1={q.x} y1={q.y} x2={qTip.x-u.x*arrowLen} y2={qTip.y-u.y*arrowLen} stroke="#000" strokeWidth={stroke}/>);head(qTip,u,r.key+'+');}
    texts.push(txt('axis:'+r.key,{x:qTip.x+u.x*fs*.7,y:qTip.y+u.y*fs*.7},lang==='ar'?({x:'س',y:'ص',z:'ع'}[r.key]):r.key,fs));
    const scale=axisTick(a,r.key);
    if(a.grid||a.numbers)for(const mark of axisTickMarks(r.min,r.max,scale.spacing,scale.steps)){
      const at=P({...zero,[r.key]:mark.geo});
      if(a.dimension===2&&a.grid){const other=r.key==='x'?'y':'x',lo=P({...zero,[r.key]:mark.geo,[other]:s.params[other+'Min']}),hi=P({...zero,[r.key]:mark.geo,[other]:s.params[other+'Max']});grid.push(<line key={r.key+mark.geo} data-axis-grid={r.key} x1={lo.x} y1={lo.y} x2={hi.x} y2={hi.y} stroke="#c9d0d5" strokeWidth={stroke}/>);}
      if(a.numbers){
        ticks.push(<line key={r.key+'t'+mark.geo} data-axis-tick={r.key} x1={at.x-n.x*4*ui} y1={at.y-n.y*4*ui} x2={at.x+n.x*4*ui} y2={at.y+n.y*4*ui} stroke="#000" strokeWidth={stroke}/>);
        if(!axisRayHidden(a,r.key,mark.geo)){
          const size=fs*.64*nScale;
          texts.push(txt(`tick:${r.key}:${mark.value}`,(a.dimension===2&&r.key==='y'||a.dimension===3&&r.key==='z')?{x:at.x-(size*.85+5*ui),y:at.y}:{x:at.x,y:at.y+(size*.85+5*ui)},tickText(mark.value,r.key),size,'tick'));
        }
      }
    }
  }
  const curves:ReactElement[]=[];
  for(const f of a.functions??[]){
    const pieces=curveGeometry(f,s.params,a);
    if(f.area){const tk=a.axisTicks?.x,sp=tk?.spacing&&tk.spacing>0?tk.spacing:a.step>0?a.step:1,stp=tk?.steps&&tk.steps>0?tk.steps:(a.numberStep&&a.numberStep>0?a.numberStep:sp),ux=(a.tickUnit??'').trim().toLowerCase().replace(/^\\/,'')==='pi'&&(a.tickUnitOn===undefined||a.tickUnitOn.includes('x'))?Math.PI:1,g=(v:number)=>v*sp/stp*ux;
      const lo=g(f.area.from),hi=g(f.area.to);
      pieces.forEach((c,i)=>{const pts=c.pts.filter(p=>p.x>=lo-1e-9&&p.x<=hi+1e-9);if(pts.length<2)return;const q=pts.map(p=>P({x:p.x,y:p.y,z:0})),b0=P({x:pts[0].x,y:0,z:0}),b1=P({x:pts[pts.length-1].x,y:0,z:0});
        curves.push(<path key={f.id+':area'+i} data-axis-area={f.id} d={`M${b0.x.toFixed(2)},${b0.y.toFixed(2)}`+q.map(p=>`L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('')+`L${b1.x.toFixed(2)},${b1.y.toFixed(2)}Z`} fill={f.area!.color} stroke="none"/>);});}
    pieces.forEach((c,i)=>{const d=c.pts.map((p,j)=>{const q=P({x:p.x,y:p.y,z:0});return (j?'L':'M')+q.x.toFixed(2)+','+q.y.toFixed(2);}).join('');curves.push(<path key={f.id+':'+i} data-axis-function={f.id} d={d} fill="none" stroke={f.color??'#000'} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={f.dashed?'9 6':undefined} markerStart={f.arrows&&c.startClipped?`url(#${marker})`:undefined} markerEnd={f.arrows&&c.endClipped?`url(#${marker})`:undefined}/>);});
    if(f.showLabel&&pieces.length){const target=s.params.xMin+(s.params.xMax-s.params.xMin)*.88;let best=pieces[0].pts[0];for(const c of pieces)for(const p of c.pts)if(Math.abs(p.x-target)<Math.abs(best.x-target))best=p;const q=P({x:best.x,y:best.y,z:0});texts.push(txt('axis-fn:'+f.id,{x:q.x+fs*.7,y:q.y-fs*.7},localizeFunctionLabel(f.label,lang,data.style),fs*.85,'fn'));}
  }
  if(a.showZero??a.numbers)texts.push(txt('axis:zero',{x:origin.x-fs*.45,y:origin.y+fs*.55},number(0),fs*.64,'tick'));
  return <g data-axes={a.dimension}>
    <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#000" strokeWidth="1.2"/></marker></defs>
    {interactive&&<rect data-shape-id={s.id} x={Math.min(...xs)-10} y={Math.min(...ys)-10} width={Math.max(...xs)-Math.min(...xs)+20} height={Math.max(...ys)-Math.min(...ys)+20} fill="transparent" pointerEvents="all"/>}
    <g pointerEvents="none">{grid}{a.planes.map(plane=>{const coords=plane.points.map(id=>a.points.find(p=>p.id===id)!.at),order=planeOrder(coords);return <polygon key={plane.id} data-axis-plane={plane.id} points={order.map(i=>{const p=P(coords[i]);return p.x+','+p.y;}).join(' ')} stroke="#000" strokeWidth={stroke} fill="#dce7eb" fillOpacity=".38"/>;})}{(a.equations??[]).map(eq=>{const g=equationGeometry(eq,s.params,a.dimension);if(!g)return null;if(eq.kind==='plane')return <polygon key={eq.id} data-axis-equation="plane" points={g.map(p=>{const q=P(p);return q.x+','+q.y;}).join(' ')} stroke="#000" strokeWidth={stroke} fill="#dce7eb" fillOpacity=".38"/>;const [p,q]=g.map(P);return <line key={eq.id} data-axis-equation={eq.kind} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#000" strokeWidth={stroke} strokeDasharray={eq.dashed?'9 6':undefined} markerStart={eq.kind==='line'?`url(#${marker})`:undefined} markerEnd={`url(#${marker})`}/>;})}{curves}{axisLines}{arrows}{ticks}
    {a.lines.map(l=>{const from=a.points.find(p=>p.id===l.a)!.at,to=a.points.find(p=>p.id===l.b)!.at,ends=l.kind==='line'?clipAxisLine(from,to,s.params,a.dimension):[from,to];if(!ends)return null;const [p,q]=ends.map(P);return <line key={l.id} data-axis-line={l.kind} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#000" strokeWidth={stroke} strokeDasharray={l.dashed?'9 6':undefined} markerStart={l.kind==='line'?`url(#${marker})`:undefined} markerEnd={`url(#${marker})`}/>;})}</g>
    {texts}
    {a.points.map(point=>{const p=P(point.at),name=localizeName(point.name,lang,s.caseMode,data.style);return <g key={point.id}><circle data-axis-point={point.id} cx={p.x} cy={p.y} r={stroke*DOT_TO_STROKE} fill="#000" pointerEvents="none"/>{point.showName&&txt('axis-name:'+point.id,{x:p.x+fs*.58,y:p.y-fs*.6},name,fs*.8)}{point.showCoordinates&&txt('axis-coord:'+point.id,point.coordinatePosition==='below'?{x:p.x,y:p.y+fs*1.05}:{x:p.x+fs*(.8+coord(point.at).length*.72*.28),y:p.y+fs*.2},coord(point.at),fs*.72,'tick')}</g>;})}
    {interactive&&tool?.shape===s.id&&tool.picks.map((p,i)=>{const at=P(p);return <circle key={'pick'+i} cx={at.x} cy={at.y} r={11*ui} fill="none" stroke="#14796d" strokeWidth={3*ui} pointerEvents="none"/>;})}
  </g>;
}
