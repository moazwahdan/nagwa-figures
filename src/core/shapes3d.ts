import type { Geometry, ParamDef, ShapeDef } from './shapes2d';
import type { SolidSettings, Vec } from './types';

export interface Vec3 { x: number; y: number; z: number }
export interface SolidEdge { a: number; b: number; hidden: boolean; length: number }
export interface SolidCurve { points: Vec[]; hidden: boolean }
export interface SolidGuide { key: 'height' | 'radius' | 'diagonal'; a: Vec; b: Vec; length: number }
export interface SolidGeometry {
  vertices: Vec3[];
  faces: number[][];
  edges: SolidEdge[];
  curves: SolidCurve[];
  guides: SolidGuide[];
  /** Sampled silhouette and projected vertices, for fitting/selection. */
  bounds: Vec[];
  center: Vec;
}

export const DEFAULT_SOLID: SolidSettings = {
  projection: 'cabinet', angle: 45, depth: 0.5, yaw: 0,
  showHidden: true, showHeight: false, showRadius: false, showDiagonal: false,
  labels: { height: { text: '', unit: true }, radius: { text: '', unit: true }, diagonal: { text: '', unit: true } },
};
export function solidSettings(settings?: SolidSettings): SolidSettings {
  return { ...DEFAULT_SOLID, ...settings, labels: { ...DEFAULT_SOLID.labels, ...settings?.labels } };
}
const rad = (a: number) => a * Math.PI / 180;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z });
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x*k, y: a.y*k, z: a.z*k });
export const dot3 = (a: Vec3, b: Vec3) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit = (v: Vec3): Vec3 => mul(v, 1/(Math.hypot(v.x,v.y,v.z)||1));
const origin: Vec3 = {x:0,y:0,z:0};
const mean = (vs: Vec3[]): Vec3 => mul(vs.reduce(add, origin), 1/vs.length);

/** Linear projection and its camera direction. No perspective distortion. */
export function projector(settings: SolidSettings) {
  const yaw = rad(settings.yaw), c = Math.cos(yaw), s = Math.sin(yaw);
  const rotate = (v: Vec3): Vec3 => ({x:c*v.x+s*v.z,y:v.y,z:-s*v.x+c*v.z});
  const a=rad(settings.angle), k=settings.depth;
  const right: Vec3 = settings.projection === 'cabinet' ? {x:1,y:0,z:k*Math.cos(a)} : {x:Math.SQRT1_2,y:0,z:Math.SQRT1_2};
  const up: Vec3 = settings.projection === 'cabinet' ? {x:0,y:1,z:k*Math.sin(a)} : {x:-Math.SQRT1_2*Math.sin(a),y:Math.cos(a),z:Math.SQRT1_2*Math.sin(a)};
  const camera = unit(mul(cross(right, up), -1));
  const project = (v: Vec3): Vec => { const r=rotate(v); return {x:dot3(r,right),y:dot3(r,up)}; };
  // Camera expressed in the unrotated object's coordinates, used for visibility.
  const view: Vec3 = {x:c*camera.x-s*camera.z,y:camera.y,z:s*camera.x+c*camera.z};
  return { project, view };
}

function mesh(vertices: Vec3[], faces: number[][], settings: SolidSettings, guideDefs: {key:SolidGuide['key'];a:Vec3;b:Vec3}[]): Geometry {
  const {project,view}=projector(settings);
  const center=mean(vertices);
  const visible=faces.map(face=>{
    const [a,b,c]=face.map(i=>vertices[i]);
    let n=cross(sub(b,a),sub(c,a));
    const fc=mean(face.map(i=>vertices[i]));
    if(dot3(n,sub(fc,center))<0)n=mul(n,-1);
    return dot3(n,view)>1e-9;
  });
  const map=new Map<string,{a:number;b:number;faces:number[]}>();
  faces.forEach((face,fi)=>face.forEach((v,i)=>{
    const a=Math.min(v,face[(i+1)%face.length]),b=Math.max(v,face[(i+1)%face.length]);
    const key=`${a}:${b}`;
    const edge=map.get(key)??{a,b,faces:[]};edge.faces.push(fi);map.set(key,edge);
  }));
  const edges=[...map.values()].sort((a,b)=>a.a-b.a||a.b-b.b).map(e=>({a:e.a,b:e.b,hidden:!e.faces.some(i=>visible[i]),length:Math.hypot(...Object.values(sub(vertices[e.a],vertices[e.b])))}));
  const points=vertices.map(project);
  const baseY=Math.min(...vertices.map(v=>v.y));
  return {points,solid:{vertices,faces,edges,curves:[],bounds:points,center:project({x:0,y:baseY,z:0}),guides:guideDefs.map(g=>({...g,a:project(g.a),b:project(g.b),length:Math.hypot(...Object.values(sub(g.a,g.b)))}))}};
}

function box(p:Record<string,number>, settings:SolidSettings, cube=false):Geometry {
  const w=cube?p.side:p.width,h=cube?p.side:p.height,d=cube?p.side:p.depth;
  const v:Vec3[]=[{x:-w/2,y:-h/2,z:-d/2},{x:w/2,y:-h/2,z:-d/2},{x:w/2,y:h/2,z:-d/2},{x:-w/2,y:h/2,z:-d/2},
    {x:-w/2,y:-h/2,z:d/2},{x:w/2,y:-h/2,z:d/2},{x:w/2,y:h/2,z:d/2},{x:-w/2,y:h/2,z:d/2}];
  return mesh(v,[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]],settings,[{key:'diagonal',a:v[0],b:v[6]}]);
}
function regular(p:Record<string,number>,settings:SolidSettings,pyramid:boolean):Geometry {
  const n=Math.round(p.n),r=p.radius,h=p.height;
  const base=Array.from({length:n},(_,i)=>{const a=2*Math.PI*i/n-Math.PI/2;return {x:r*Math.cos(a),y:-h/2,z:r*Math.sin(a)};});
  const vertices=pyramid?[...base,{x:0,y:h/2,z:0}]:[...base,...base.map(v=>({...v,y:h/2}))];
  const faces:number[][]=[base.map((_,i)=>i)];
  if(!pyramid)faces.push(base.map((_,i)=>i+n));
  for(let i=0;i<n;i++)faces.push(pyramid?[i,(i+1)%n,n]:[i,(i+1)%n,(i+1)%n+n,i+n]);
  return mesh(vertices,faces,settings,[{key:'height',a:{x:0,y:-h/2,z:0},b:{x:0,y:h/2,z:0}}, {key:'radius',a:{x:0,y:-h/2,z:0},b:base[0]}]);
}

/** Split a smooth closed curve exactly at visibility transitions. */
function ring(project:(v:Vec3)=>Vec, r:number, y:number, view:Vec3, coneHeight?:number, capVisible=false):SolidCurve[] {
  const sideVisible=(t:number)=>dot3({x:Math.cos(t),y:coneHeight===undefined?0:r/coneHeight,z:Math.sin(t)},view)>-1e-9;
  const cuts=[0,2*Math.PI];
  if(!capVisible){
    const amplitude=Math.hypot(view.x,view.z),offset=coneHeight===undefined?0:r/coneHeight*view.y;
    if(amplitude>1e-9&&Math.abs(offset/amplitude)<1){
      const phase=Math.atan2(view.z,view.x),delta=Math.acos(-offset/amplitude);
      for(const t of [phase-delta,phase+delta])cuts.push((t%(2*Math.PI)+2*Math.PI)%(2*Math.PI));
    }
  }
  const ordered=cuts.sort((a,b)=>a-b).filter((t,i,all)=>i===0||t-all[i-1]>1e-8);
  return ordered.slice(0,-1).map((start,i)=>{
    const end=ordered[i+1];
    const count=Math.max(2,Math.ceil((end-start)/(2*Math.PI)*128));
    return {hidden:!capVisible&&!sideVisible((start+end)/2),points:Array.from({length:count+1},(_,j)=>{const t=start+(end-start)*j/count;return project({x:r*Math.cos(t),y,z:r*Math.sin(t)});})};
  });
}
function roundSolid(p:Record<string,number>,settings:SolidSettings,kind:'cylinder'|'cone'|'sphere'):Geometry {
  const r=p.radius,h=p.height??2*r;
  const {project,view}=projector(settings);
  const curves:SolidCurve[]=[];
  const guides:SolidGuide[]=[];
  const makeGuide=(key:SolidGuide['key'],a:Vec3,b:Vec3)=>guides.push({key,a:project(a),b:project(b),length:Math.hypot(...Object.values(sub(a,b)))});
  let points:Vec[]=[];
  if(kind==='sphere'){
    // The silhouette lies in the plane normal to the camera. Orthographic gives a true circle.
    const u=unit(cross(view,Math.abs(view.y)<0.9?{x:0,y:1,z:0}:{x:1,y:0,z:0})),v=unit(cross(view,u));
    curves.push({hidden:false,points:Array.from({length:129},(_,i)=>{const t=i*Math.PI/64;return project(mul(add(mul(u,Math.cos(t)),mul(v,Math.sin(t))),r));})});
    curves.push(...ring(project,r,0,view));
    makeGuide('radius',origin,mul(u,r));
  }else{
    curves.push(...ring(project,r,-h/2,view,kind==='cone'?h:undefined,view.y<0));
    if(kind==='cylinder')curves.push(...ring(project,r,h/2,view,undefined,view.y>0));
    const amp=Math.hypot(view.x,view.z),offset=kind==='cone'?r/h*view.y:0;
    if(amp>1e-9&&Math.abs(offset/amp)<1){
      const phase=Math.atan2(view.z,view.x),delta=Math.acos(-offset/amp);
      for(const t of [phase-delta,phase+delta]){
        const a={x:r*Math.cos(t),y:-h/2,z:r*Math.sin(t)};
        const b=kind==='cone'?{x:0,y:h/2,z:0}:{...a,y:h/2};
        curves.push({hidden:false,points:[project(a),project(b)]});
      }
    }
    if(kind==='cone')points=[project({x:0,y:h/2,z:0})];
    makeGuide('height',{x:0,y:-h/2,z:0},{x:0,y:h/2,z:0});
    makeGuide('radius',{x:0,y:-h/2,z:0},{x:r,y:-h/2,z:0});
  }
  const bounds=curves.flatMap(c=>c.points);
  return {points,solid:{vertices:kind==='cone'?[{x:0,y:h/2,z:0}]:[],faces:[],edges:[],curves,guides,bounds,center:project(kind==='sphere'?origin:{x:0,y:-h/2,z:0})}};
}
const dim=(key:string,label:string,def:number):ParamDef=>({key,label,def,min:0.5,max:100});
const nParam:ParamDef={key:'n',label:'Base sides',def:3,min:3,max:6,step:1,options:[3,4,5,6].map(value=>({value,label:String(value)}))};
export const SOLID_DEFS:ShapeDef[]=[
  {id:'solid-cube',kind:'solid',group:'3D solids',label:'Cube',tip:'A cube with equal edges and automatically dashed hidden edges.',params:[dim('side','Side',5)],build:(p,s=DEFAULT_SOLID)=>box(p,s,true)},
  {id:'solid-cuboid',kind:'solid',group:'3D solids',label:'Cuboid',tip:'A rectangular prism: width, height and depth.',params:[dim('width','Width',6),dim('height','Height',4),dim('depth','Depth',3)],build:(p,s=DEFAULT_SOLID)=>box(p,s)},
  {id:'solid-prism',kind:'solid',group:'3D solids',label:'Prism',tip:'A right prism with a regular triangular, square, pentagonal or hexagonal base.',params:[nParam,dim('radius','Base radius',3),dim('height','Height',5)],build:(p,s=DEFAULT_SOLID)=>regular(p,s,false)},
  {id:'solid-pyramid',kind:'solid',group:'3D solids',label:'Pyramid',tip:'A right regular pyramid with 3–6 base sides. Optional altitude and base radius.',params:[{...nParam,def:4},dim('radius','Base radius',3),dim('height','Height',5)],build:(p,s=DEFAULT_SOLID)=>regular(p,s,true)},
  {id:'solid-cylinder',kind:'solid',group:'3D solids',label:'Cylinder',tip:'A right circular cylinder with visible and hidden parts of its rims.',params:[dim('radius','Radius',2.5),dim('height','Height',5)],build:(p,s=DEFAULT_SOLID)=>roundSolid(p,s,'cylinder')},
  {id:'solid-cone',kind:'solid',group:'3D solids',label:'Cone',tip:'A right circular cone with a dashed back rim, altitude and radius.',params:[dim('radius','Radius',3),dim('height','Height',5)],build:(p,s=DEFAULT_SOLID)=>roundSolid(p,s,'cone')},
  {id:'solid-sphere',kind:'solid',group:'3D solids',label:'Sphere',tip:'A sphere with a great-circle equator, centre and radius.',params:[dim('radius','Radius',3)],build:(p,s=DEFAULT_SOLID)=>roundSolid(p,s,'sphere')},
];
