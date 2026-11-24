import { projector, solidSettings, type Vec3 } from './shapes3d';
import { geometryOf } from './scene';
import type { ConstructionPlane, ShapeInstance, Vec } from './types';

export const add3=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const sub3=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const mul3=(a:Vec3,k:number):Vec3=>({x:a.x*k,y:a.y*k,z:a.z*k});
export const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const length3=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);
export const unit3=(a:Vec3)=>mul3(a,1/(length3(a)||1));
export const cross3=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export const planeVector=(x:number,y:number,plane:ConstructionPlane='xy'):Vec3=>plane==='xy'?{x,y,z:0}:plane==='xz'?{x,y:0,z:y}:{x:0,y:x,z:y};
export const planeNormal=(p:ConstructionPlane='xy'):Vec3=>p==='xy'?{x:0,y:0,z:1}:p==='xz'?{x:0,y:-1,z:0}:{x:1,y:0,z:0};
export const perpendicular3=(v:Vec3,p:ConstructionPlane='xy')=>unit3(cross3(planeNormal(p),v));
export const direction3=(angle:number,p:ConstructionPlane='xy')=>planeVector(Math.cos(angle*Math.PI/180),Math.sin(angle*Math.PI/180),p);
export function foot3(p:Vec3,a:Vec3,b:Vec3){const d=sub3(b,a),l=dot(d,d);return l<1e-18?null:{k:dot(sub3(p,a),d)/l,point:add3(a,mul3(d,dot(sub3(p,a),d)/l))};}

/** Invert a projected click onto the chosen plane through the solid's origin. */
export function unprojectPlane(s:ShapeInstance,q:Vec,plane:ConstructionPlane='xy'):Vec3|null {
  const {project}=projector(solidSettings(s.solid));
  const a=project(planeVector(1,0,plane)),b=project(planeVector(0,1,plane)),det=a.x*b.y-a.y*b.x;
  if(Math.abs(det)<1e-8)return null;
  return planeVector((q.x*b.y-q.y*b.x)/det,(a.x*q.y-a.y*q.x)/det,plane);
}
export function circularPoint(s:ShapeInstance,angle:number):Vec3|null {
  if(!['solid-cylinder','solid-cone','solid-sphere'].includes(s.defId))return null;
  const a=angle*Math.PI/180,r=s.params.radius;
  return {x:r*Math.cos(a),y:s.defId==='solid-sphere'?0:-s.params.height/2,z:r*Math.sin(a)};
}
/** Nearest forward intersection with the physical surface, independent of projection. */
export function solidHits(s:ShapeInstance,o:Vec3,d:Vec3):{t:number;point:Vec3}[] {
  const g=geometryOf(s).solid;if(!g||length3(d)<1e-10)return [];
  const candidates:number[]=[],eps=1e-7;
  const push=(t:number)=>{if(Number.isFinite(t)&&t>eps)candidates.push(t);};
  const roots=(a:number,b:number,c:number,accept:(t:number)=>boolean)=>{
    const rs:number[]=[];
    if(Math.abs(a)<1e-12){if(Math.abs(b)>1e-12)rs.push(-c/b);}
    else {const disc=b*b-4*a*c;if(disc>=-1e-10){const r=Math.sqrt(Math.max(0,disc));rs.push((-b-r)/(2*a),(-b+r)/(2*a));}}
    rs.forEach(t=>{if(accept(t))push(t);});
  };
  if(g.faces.length){
    for(const face of g.faces){
      const a=g.vertices[face[0]],b=g.vertices[face[1]],c=g.vertices[face[2]],n=cross3(sub3(b,a),sub3(c,a)),den=dot(n,d);
      if(Math.abs(den)<1e-12)continue;
      const t=dot(n,sub3(a,o))/den,p=add3(o,mul3(d,t));
      let sign=0,inside=true;
      for(let i=0;i<face.length;i++){
        const v=g.vertices[face[i]],w=g.vertices[face[(i+1)%face.length]],vsign=dot(cross3(sub3(w,v),sub3(p,v)),n);
        if(Math.abs(vsign)<1e-8)continue;
        if(sign&&Math.sign(vsign)!==sign){inside=false;break;}sign=Math.sign(vsign);
      }
      if(inside)push(t);
    }
  }else if(s.defId==='solid-sphere'){
    roots(dot(d,d),2*dot(o,d),dot(o,o)-s.params.radius**2,()=>true);
  }else{
    const r=s.params.radius,h=s.params.height,lo=-h/2,hi=h/2;
    const within=(t:number)=>{const y=o.y+t*d.y;return y>=lo-eps&&y<=hi+eps;};
    if(s.defId==='solid-cylinder')roots(d.x*d.x+d.z*d.z,2*(o.x*d.x+o.z*d.z),o.x*o.x+o.z*o.z-r*r,within);
    else {const k=(r/h)**2;roots(d.x*d.x+d.z*d.z-k*d.y*d.y,2*(o.x*d.x+o.z*d.z+k*(hi-o.y)*d.y),o.x*o.x+o.z*o.z-k*(hi-o.y)**2,within);}
    if(Math.abs(d.y)>1e-12)for(const y of s.defId==='solid-cylinder'?[lo,hi]:[lo]){const t=(y-o.y)/d.y,p=add3(o,mul3(d,t));if(p.x*p.x+p.z*p.z<=r*r+eps)push(t);}
  }
  return candidates.sort((a,b)=>a-b).filter((t,i,all)=>i===0||Math.abs(t-all[i-1])>eps).map(t=>({t,point:add3(o,mul3(d,t))}));
}
