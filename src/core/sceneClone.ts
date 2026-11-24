import type { SceneData, Ref, PointDef } from './types';
import { uid, boundsUnits, unionBounds } from './scene';
import { buildWorld } from './world';
/** Deep copy every object and redirect all construction references. */
export function cloneScene(source:SceneData):SceneData {
  const scene:SceneData=structuredClone(source);
  const ids=new Map([...scene.shapes,...scene.points,...scene.lines,...scene.marks].map(x=>[x.id,uid()]));
  const id=(old:string)=>{const value=ids.get(old);if(!value)throw new Error('Missing construction reference.');return value;};
  const ref=(r:Ref):Ref=>'s' in r?{s:id(r.s),i:r.i}:'c' in r?{c:id(r.c)}:{p:id(r.p)};
  const def=(d:PointDef):PointDef=>{
    switch(d.t){
      case 'world':return {...d};
      case 'local':case 'circ':return {...d,shape:id(d.shape)};
      case 'ratio':return {...d,a:ref(d.a),b:ref(d.b)};
      case 'offset':return {...d,from:ref(d.from)};
      case 'rayHit':return {...d,from:ref(d.from),shape:id(d.shape)};
      case 'bisectHit':return {...d,v:ref(d.v),a:ref(d.a),b:ref(d.b),shape:id(d.shape)};
      case 'dirHit':return {...d,from:ref(d.from),a:ref(d.a),b:ref(d.b),shape:id(d.shape)};
      case 'foot':return {...d,from:ref(d.from),a:ref(d.a),b:ref(d.b)};
      case 'cross':return {...d,a:ref(d.a),b:ref(d.b),c:ref(d.c),d:ref(d.d)};
      case 'lineCircle':return {...d,a:ref(d.a),b:ref(d.b),shape:id(d.shape)};
      case 'circs':return {...d,shape:id(d.shape),other:id(d.other)};
      case 'perpAt':return {...d,at:ref(d.at),toward:ref(d.toward)};
    }
  };
  scene.shapes=scene.shapes.map(s=>({...s,id:id(s.id)}));
  scene.points=scene.points.map(p=>({...p,id:id(p.id),def:def(p.def)}));
  scene.lines=scene.lines.map(l=>({...l,id:id(l.id),a:ref(l.a),b:ref(l.b)}));
  scene.marks=scene.marks.map(m=>{
    if(m.kind==='right'||m.kind==='attachment')return {...m,id:id(m.id),a:ref(m.a),b:ref(m.b),at:ref(m.at)};
    if('circle' in m)return {...m,id:id(m.id),circle:id(m.circle)};
    return {...m,id:id(m.id),a:ref(m.a),b:ref(m.b)};
  });
  return scene;
}
function bounds(scene:SceneData){
  const b=unionBounds(scene.shapes.map(boundsUnits));
  for(const p of buildWorld(scene).pt.values())if(p){b.minx=Math.min(b.minx,p.x);b.maxx=Math.max(b.maxx,p.x);b.miny=Math.min(b.miny,p.y);b.maxy=Math.max(b.maxy,p.y);}
  return b;
}
export function appendScene(current:SceneData,source:SceneData):SceneData {
  if([...(['shapes','points','lines','marks'] as const)].some(k=>current[k].length+source[k].length>1000))throw new Error('Maximum 1000 objects of each type per image.');
  const copy=cloneScene(source);
  if(current.shapes.length){const a=bounds(current),b=bounds(copy),dx=(a.minx+a.maxx-b.minx-b.maxx)/2,dy=(a.miny+a.maxy-b.miny-b.maxy)/2;
    copy.shapes=copy.shapes.map(s=>({...s,offset:{x:s.offset.x+dx,y:s.offset.y+dy}}));
    copy.points=copy.points.map(p=>p.def.t==='world'?{...p,def:{...p.def,x:p.def.x+dx,y:p.def.y+dy}}:p);}
  return {...current,shapes:[...current.shapes,...copy.shapes],points:[...current.points,...copy.points],lines:[...current.lines,...copy.lines],marks:[...current.marks,...copy.marks]};
}
