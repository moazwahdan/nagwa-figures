import type { AxisCoord, AxisEquation, ShapeInstance } from './types';
import { clipAxisLine, sameCoordinate, validateCoordinate } from './axes';
const add=(a:AxisCoord,b:AxisCoord)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const dot=(a:AxisCoord,b:AxisCoord)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:AxisCoord,b:AxisCoord)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const sub=(a:AxisCoord,b:AxisCoord)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const finite=(p:AxisCoord)=>p&&[p.x,p.y,p.z].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6);
export function planePolygon(normal:AxisCoord,constant:number,params:Record<string,number>):AxisCoord[]{
 const norm=Math.hypot(normal.x,normal.y,normal.z);if(!norm)return [];
 const n={x:normal.x/norm,y:normal.y/norm,z:normal.z/norm},d=constant/norm;
 const corners:Array<AxisCoord>=[];for(const x of [params.xMin,params.xMax])for(const y of [params.yMin,params.yMax])for(const z of [params.zMin,params.zMax])corners.push({x,y,z});
 const points:AxisCoord[]=[],push=(p:AxisCoord)=>{if(!points.some(q=>sameCoordinate(p,q)))points.push(p);};
 for(let i=0;i<8;i++)for(let bit=1;bit<=4;bit*=2){const j=i^bit;if(j<=i)continue;const a=corners[i],b=corners[j],fa=dot(n,a)-d,fb=dot(n,b)-d;if(Math.abs(fa)<1e-8)push(a);if(Math.abs(fb)<1e-8)push(b);if(fa*fb<0){const t=fa/(fa-fb);push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}}
 if(points.length<3)return [];
 const c={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length,z:points.reduce((s,p)=>s+p.z,0)/points.length};
 const u=sub(points[0],c),v=cross(n,u);return points.sort((a,b)=>Math.atan2(dot(sub(a,c),v),dot(sub(a,c),u))-Math.atan2(dot(sub(b,c),v),dot(sub(b,c),u)));
}
export function equationGeometry(e:AxisEquation,params:Record<string,number>,dimension:2|3):AxisCoord[]|null{
 if(e.kind==='plane'){const p=planePolygon(e.normal,e.constant,params);return p.length>=3?p:null;}
 return e.kind==='vector'?[e.origin,add(e.origin,e.direction)]:clipAxisLine(e.origin,add(e.origin,e.direction),params,dimension);
}
export function validateEquations(s:Pick<ShapeInstance,'params'|'axes'>){
 const a=s.axes!,items=a.equations??[];if(!Array.isArray(items)||items.length>200)throw new Error('Maximum 200 equation objects per axes system.');
 const ids=new Set([...a.points??[],...a.lines??[],...a.planes??[]].map(p=>p.id));
 for(const e of items){if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id))throw new Error('Equation IDs must be unique.');ids.add(e.id);
  if(e.kind==='plane'){if(a.dimension!==3||!finite(e.normal)||!Number.isFinite(e.constant)||Math.abs(e.constant)>1e6||Math.hypot(e.normal.x,e.normal.y,e.normal.z)<1e-9)throw new Error('A plane needs 3D axes and a nonzero normal.');}
  else if(e.kind==='line'||e.kind==='vector'){if(!finite(e.origin)||!finite(e.direction)||Math.hypot(e.direction.x,e.direction.y,e.direction.z)<1e-9||typeof e.dashed!=='boolean')throw new Error('Enter a finite origin and a nonzero direction.');if(a.dimension===2&&(e.origin.z!==0||e.direction.z!==0))throw new Error('2D equations must have z = 0.');if(e.kind==='vector'){validateCoordinate(e.origin,s);validateCoordinate(add(e.origin,e.direction),s);}}
  else throw new Error('Unknown equation type.');
  const g=equationGeometry(e,s.params,a.dimension);if(!g||e.kind==='line'&&sameCoordinate(g[0],g[1]))throw new Error('The equation does not intersect the current ranges. Expand the ranges or change the equation.');
 }
 for(let i=0;i<items.length;i++)for(const b of items.slice(i+1)){const e=items[i];if(e.kind!==b.kind)continue;
  if(e.kind==='plane'&&b.kind==='plane'){const len=Math.hypot(e.normal.x,e.normal.y,e.normal.z),bl=Math.hypot(b.normal.x,b.normal.y,b.normal.z);const sign=dot(e.normal,b.normal)<0?-1:1;if(Math.hypot(e.normal.x/len-sign*b.normal.x/bl,e.normal.y/len-sign*b.normal.y/bl,e.normal.z/len-sign*b.normal.z/bl)<1e-7&&Math.abs(e.constant/len-sign*b.constant/bl)<1e-7)throw new Error('This plane equation already exists.');}
  else if(e.kind!=='plane'&&b.kind!=='plane'){if(e.kind==='vector'){if(sameCoordinate(e.origin,b.origin)&&sameCoordinate(e.direction,b.direction))throw new Error('This vector already exists.');}else if(Math.hypot(...Object.values(cross(e.direction,b.direction)))<1e-7*Math.hypot(...Object.values(e.direction))*Math.hypot(...Object.values(b.direction))&&Math.hypot(...Object.values(cross(e.direction,sub(b.origin,e.origin))))<1e-7*Math.hypot(...Object.values(e.direction))*Math.max(1,Math.hypot(...Object.values(sub(b.origin,e.origin)))))throw new Error('This line equation already exists.');}
 }
}
export function implicitLine(a:number,b:number,c:number){const n=Math.hypot(a,b);if(!Number.isFinite(n)||n<1e-9)throw new Error('At least one X/Y coefficient must be nonzero.');return {origin:{x:a/n*(c/n),y:b/n*(c/n),z:0},direction:{x:-b/n,y:a/n,z:0}};}
