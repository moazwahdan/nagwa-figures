import type React from 'react';
import { localizeName, vertexLabelOf, localizeText, unitLabel } from '../core/labels';
import { solidSettings, type SolidGeometry } from '../core/shapes3d';
import { toUnits } from '../core/scene';
import { toPx } from '../core/world';
import type { Lang, SceneData, ShapeInstance, Vec } from '../core/types';
import { Txt } from './FigureText';
import { labelSize } from '../core/labelSizing';
import { DOT_TO_STROKE } from '../core/paper';

const mid = (a:Vec,b:Vec):Vec => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const sub = (a:Vec,b:Vec):Vec => ({x:a.x-b.x,y:a.y-b.y});
/** Convex projected outline used only as a hit area, never as a fake wireframe. */
function hull(points:Vec[]):Vec[] {
  const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(o:Vec,a:Vec,b:Vec)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const half=(ps:Vec[])=>{const h:Vec[]=[];for(const q of ps){while(h.length>=2&&cross(h[h.length-2],h[h.length-1],q)<=0)h.pop();h.push(q);}return h;};
  const lower=half(p),upper=half([...p].reverse());lower.pop();upper.pop();return [...lower,...upper];
}
interface Props {
  data:SceneData;shape:ShapeInstance;geometry:SolidGeometry;pts:Vec[];lang:Lang;interactive:boolean;locked:boolean;
  place:(anchor:Vec,outward:Vec,w:number,h:number)=>Vec;
}
export function SolidSvg({data,shape:s,geometry:g,pts,lang,interactive,locked,place}:Props) {
  const options=solidSettings(s.solid),st=data.style;
  const map=(v:Vec)=>toPx(data,toUnits(s,v));
  const center=map({x:0,y:0});
  const size=labelSize(data,s,lang);
  const nudge=(key:string,pos:Vec):Vec=>{const n=s.nudgeByLang?.[lang]?.[key]??s.nudge[key];return n?{x:pos.x+n.x,y:pos.y+n.y}:pos;};
  const text=(key:string,value:string,anchor:Vec,outward:Vec,letter=false):React.JSX.Element=>{
    const fs=letter?size:size*0.9;
    return <Txt key={key} pos={nudge(key,place(anchor,outward,value.length*fs*0.56,fs*0.8))} text={value} lang={lang} size={fs} italic={letter&&st.italicLetters} interactive={interactive} locked={locked} owner={s.id} shapeId={s.id} labelKey={key} />;
  };
  const stroke={stroke:'#000',strokeWidth:st.stroke,fill:'none',strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
  const edges:React.JSX.Element[]=[],visible:React.JSX.Element[]=[],labels:React.JSX.Element[]=[],dots:React.JSX.Element[]=[];
  const pointsString=(ps:Vec[])=>ps.map(p=>`${p.x},${p.y}`).join(' ');
  g.edges.forEach((e,i)=>{
    if(e.hidden&&!options.showHidden)return;
    const a=pts[e.a],b=pts[e.b];
    const el=<line key={`e${i}`} data-solid-edge={i} data-hidden={e.hidden?'1':'0'} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...stroke} strokeDasharray={e.hidden?'9 7':undefined} />;
    (e.hidden?edges:visible).push(el);
    const label=s.sides[i];
    if(label?.text.trim()){
      const raw=localizeText(label.text.trim(),lang,st),value=label.unit?`${raw} ${unitLabel(lang)}`:raw;
      const m=mid(a,b);let outward=sub(m,center);
      if(Math.hypot(outward.x,outward.y)<1)outward={x:-(b.y-a.y),y:b.x-a.x};
      labels.push(text(`s${i}`,value,m,outward));
    }
  });
  g.curves.forEach((c,i)=>{
    if(c.hidden&&!options.showHidden)return;
    const el=<polyline key={`curve${i}`} data-solid-curve={i} data-hidden={c.hidden?'1':'0'} points={pointsString(c.points.map(map))} {...stroke} strokeDasharray={c.hidden?'9 7':undefined} />;
    (c.hidden?edges:visible).push(el);
  });
  g.guides.forEach(guide=>{
    const on=guide.key==='height'?options.showHeight:guide.key==='radius'?options.showRadius:options.showDiagonal;
    if(!on)return;
    const a=map(guide.a),b=map(guide.b),m=mid(a,b);
    visible.push(<line key={`guide-${guide.key}`} data-solid-guide={guide.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...stroke} strokeDasharray={guide.key==='radius'?undefined:'9 7'} />);
    const label=options.labels[guide.key];
    if(label.text.trim()){
      const raw=localizeText(label.text.trim(),lang,st),value=label.unit?`${raw} ${unitLabel(lang)}`:raw;
      labels.push(text(`g-${guide.key}`,value,m,{x:-(b.y-a.y),y:b.x-a.x}));
    }
    if(guide.key==='height'&&s.showRightMarks){
      // A true spatial right angle at the foot, drawn along projected directions.
      const radial=g.guides.find(g=>g.key==='radius');
      if(radial){
        const r=map(radial.b),u=sub(b,a),v=sub(r,a),lu=Math.hypot(u.x,u.y),lv=Math.hypot(v.x,v.y);
        if(lu>1&&lv>1){
          const k=Math.min(st.markSize,lu*0.15,lv*0.15),p={x:a.x+u.x/lu*k,y:a.y+u.y/lu*k},q={x:p.x+v.x/lv*k,y:p.y+v.y/lv*k},t={x:a.x+v.x/lv*k,y:a.y+v.y/lv*k};
          visible.push(<polyline key="height-right" points={pointsString([p,q,t])} {...stroke} strokeWidth={st.stroke} />);
        }
      }
    }
  });
  pts.forEach((p,i)=>{
    const incident=g.edges.filter(e=>e.a===i||e.b===i);
    if(!options.showHidden&&incident.length&&incident.every(e=>e.hidden))return;
    if(s.showVertexDots)dots.push(<circle key={`dot${i}`} cx={p.x} cy={p.y} r={st.stroke*DOT_TO_STROKE} fill="#000" />);
    if(s.showVertexLabels){const name=vertexLabelOf(s,i,lang,st);if(name)labels.push(text(`v${i}`,name,p,sub(p,center),true));}
  });
  if(s.center.show){
    const p=map(g.center),name=lang==='ar'&&s.center.name.toUpperCase()==='O'?'م':localizeName(s.center.name,lang,s.caseMode,st);
    dots.push(<circle key="center" cx={p.x} cy={p.y} r={st.stroke*DOT_TO_STROKE} fill="#000" />);
    labels.push(text('c',name,p,{x:-1,y:1},true));
  }
  return <g data-shape-id={s.id} data-solid={s.defId}>
    {interactive&&<polygon points={pointsString(hull(g.bounds.map(map)))} fill="rgba(0,0,0,0.001)" stroke="none" style={{cursor:'move'}} />}
    <g style={interactive?{cursor:'move'}:undefined}>{edges}{visible}</g>
    {dots}{labels}
  </g>;
}
