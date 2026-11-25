import { validateEquations } from './axisEquations';
import { validateFunctions } from './functions';
export { equationGeometry } from './axisEquations';
import type { AxisCoord, AxisKey, AxisRay, AxesSettings, ShapeInstance, Vec } from './types';
import type { ShapeDef } from './shapes2d';
export const AXIS_KEYS=['x','y','z'] as const;
export type { AxisKey };
export function defaultAxes(dimension:2|3):AxesSettings{return {dimension,grid:false,numbers:true,showZero:true,minusRight:true,tickUnit:'',equations:[],step:1,front:'yz',depthDirection:'down-left',points:[],lines:[],planes:[]};}
export const AXIS_RAYS:AxisRay[]=['x+','x-','y+','y-','z+','z-'];
export function axisTick(a:AxesSettings,key:AxisKey){
  const t=a.axisTicks?.[key];
  const spacing=t?.spacing&&t.spacing>0?t.spacing:a.step;
  const steps=t?.steps&&t.steps>0?t.steps:(a.numberStep&&a.numberStep>0?a.numberStep:a.step);
  return {spacing,steps};
}
export function axisNumberStep(a:AxesSettings,key:AxisKey='x'){return axisTick(a,key).steps;}
export function axisNumberStart(a:AxesSettings,key:AxisKey='x'){return axisTick(a,key).steps;}
export function axisNumberSize(a:AxesSettings){return a.numberSize&&a.numberSize>0?a.numberSize:1;}
export function axisTickMarks(min:number,max:number,spacing:number,steps:number){
  const out:{geo:number;value:number}[]=[];
  for(let k=1;k*spacing<=max+1e-8;k++)out.push({geo:Number((k*spacing).toFixed(10)),value:Number((k*steps).toFixed(10))});
  for(let k=1;k*spacing<=-min+1e-8;k++)out.push({geo:Number((-k*spacing).toFixed(10)),value:Number((-k*steps).toFixed(10))});
  return out;
}
export function axisNumberValues(min:number,max:number,start:number,step:number){
  return axisTickMarks(min,max,start,step).map(t=>t.value);
}
export function axisUsesTickUnit(a:AxesSettings,key:AxisKey){
  if(!(a.tickUnit??'').trim())return false;
  const on=a.tickUnitOn;
  if(on===undefined)return true;
  return on.includes(key);
}
export function axisUnitMultiplier(a:AxesSettings,key:AxisKey){
  if(!axisUsesTickUnit(a,key))return 1;
  const raw=(a.tickUnit??'').trim().toLowerCase().replace(/^\\/,'');
  return raw==='pi'||raw==='π'?Math.PI:1;
}
export function axisRayHidden(a:AxesSettings,key:string,value:number){
  if(!(a.numbers&&value))return true;
  const ray=`${key}${value>0?'+':'-'}` as AxisRay;
  return !!a.hideRays?.includes(ray);
}
export function ranges(params:Record<string,number>,dimension:2|3){return AXIS_KEYS.slice(0,dimension).map(key=>({key,min:params[key+'Min'],max:params[key+'Max']}));}
export function axisBasis(settings:AxesSettings):Record<AxisKey,Vec>{
  return settings.dimension===2?{x:{x:1,y:0},y:{x:0,y:1},z:{x:-.55,y:-.38}}:{x:{x:-.55,y:-.38},y:{x:1,y:0},z:{x:0,y:1}};
}
export function projectAxes(p:AxisCoord,settings:AxesSettings):Vec{const b=axisBasis(settings);return {x:p.x*b.x.x+p.y*b.y.x+(settings.dimension===3?p.z*b.z.x:0),y:p.x*b.x.y+p.y*b.y.y+(settings.dimension===3?p.z*b.z.y:0)};}
export function axesBounds(params:Record<string,number>,settings:AxesSettings):Vec[]{
  /* 3D axes are three crossing lines, not a box: only the axis ends are drawn, so the far box corners would add empty space around the figure. */
  if(settings.dimension===3)return ranges(params,3).flatMap(r=>[projectAxes({x:0,y:0,z:0,[r.key]:r.min} as AxisCoord,settings),projectAxes({x:0,y:0,z:0,[r.key]:r.max} as AxisCoord,settings)]);
  const points:Vec[]=[];for(const x of [params.xMin,params.xMax])for(const y of [params.yMin,params.yMax])for(const z of settings.dimension===3?[params.zMin,params.zMax]:[0])points.push(projectAxes({x,y,z},settings));return points;
}
export const AXES_DEFS:ShapeDef[]=([2,3] as const).map(dimension=>({id:`axes-${dimension}d`,kind:'axes',group:'Axes',label:`${dimension}D axes`,tip:`Coordinate axes with points, lines, vectors${dimension===3?' and plane patches':''}.`,params:AXIS_KEYS.slice(0,dimension).flatMap(key=>[{key:key+'Min',label:key.toUpperCase()+' minimum',def:-5,min:-1000,max:1000},{key:key+'Max',label:key.toUpperCase()+' maximum',def:5,min:-1000,max:1000}]),build:params=>({points:axesBounds(params,defaultAxes(dimension))})}));
const sub=(a:AxisCoord,b:AxisCoord):AxisCoord=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a:AxisCoord,b:AxisCoord):AxisCoord=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const dot=(a:AxisCoord,b:AxisCoord)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=(a:AxisCoord)=>Math.hypot(a.x,a.y,a.z);
export const sameCoordinate=(a:AxisCoord,b:AxisCoord)=>length(sub(a,b))<1e-7;
export function validateCoordinate(p:AxisCoord,s:Pick<ShapeInstance,'params'|'axes'>){
  if(!p||![p.x,p.y,p.z].every(n=>typeof n==='number'&&Number.isFinite(n)))throw new Error('Coordinates must be finite numbers.');
  if(s.axes!.dimension===2&&Math.abs(p.z)>1e-9)throw new Error('2D points must have z = 0.');
  for(const r of ranges(s.params,s.axes!.dimension))if(p[r.key]<r.min-1e-8||p[r.key]>r.max+1e-8)throw new Error(`${r.key.toUpperCase()} = ${p[r.key]} is outside ${r.min} to ${r.max}. Change the axis range or coordinates.`);
}
/** Sort four coplanar, convex corners in their real plane, independent of view. */
export function planeOrder(points:AxisCoord[]):number[]{
  if(points.length!==4||points.some((p,i)=>points.slice(i+1).some(q=>sameCoordinate(p,q))))throw new Error('A plane needs four distinct points.');
  const e=sub(points[1],points[0]),normal=cross(e,sub(points[2],points[0])),span=Math.max(...points.map(p=>length(sub(p,points[0])))),tol=1e-7*Math.max(span,1);
  if(length(normal)<tol*tol)throw new Error('The first three plane points must not be collinear.');
  const n={x:normal.x/length(normal),y:normal.y/length(normal),z:normal.z/length(normal)};
  if(Math.abs(dot(sub(points[3],points[0]),n))>tol)throw new Error('The four points are not coplanar. Adjust the fourth point.');
  const u={x:e.x/length(e),y:e.y/length(e),z:e.z/length(e)},v=cross(n,u),center={x:points.reduce((t,p)=>t+p.x,0)/4,y:points.reduce((t,p)=>t+p.y,0)/4,z:points.reduce((t,p)=>t+p.z,0)/4};
  const order=points.map((p,i)=>({i,angle:Math.atan2(dot(sub(p,center),v),dot(sub(p,center),u))})).sort((a,b)=>a.angle-b.angle).map(a=>a.i);
  let sign=0;for(let i=0;i<4;i++){const a=points[order[i]],b=points[order[(i+1)%4]],c=points[order[(i+2)%4]],turn=dot(cross(sub(b,a),sub(c,b)),n);if(Math.abs(turn)<tol*tol||sign&&Math.sign(turn)!==sign)throw new Error('Use four non-collinear corners of a convex plane patch; no corner may lie inside the other three.');sign=Math.sign(turn);}
  return order;
}
export function validateAxes(s:Pick<ShapeInstance,'params'|'axes'|'defId'>):void{
  const a=s.axes;if(!a||a.dimension!==(s.defId==='axes-3d'?3:2)||!['axes-2d','axes-3d'].includes(s.defId))throw new Error('Invalid axes definition.');
  for(const r of ranges(s.params,a.dimension))if(![r.min,r.max].every(Number.isFinite)||r.min>0||r.max<0||r.max-r.min<.01||r.min< -1000||r.max>1000)throw new Error(`${r.key.toUpperCase()} range must include zero, increase from minimum to maximum, and stay within −1000 to 1000.`);
  if(a.showZero!==undefined&&typeof a.showZero!=='boolean')throw new Error('Invalid origin visibility.');
  if(a.minusRight!==undefined&&typeof a.minusRight!=='boolean')throw new Error('Invalid negative-sign setting.');
  if(a.tickUnit!==undefined&&(typeof a.tickUnit!=='string'||a.tickUnit.length>40))throw new Error('Tick unit must be a short symbol, such as pi or \\theta.');
  if(a.tickUnitOn!==undefined&&(!Array.isArray(a.tickUnitOn)||a.tickUnitOn.some(k=>!AXIS_KEYS.slice(0,a.dimension).includes(k))||new Set(a.tickUnitOn).size!==a.tickUnitOn.length))throw new Error('Tick unit must apply to X, Y or Z.');
  if(a.axisTicks!==undefined){
    if(!a.axisTicks||typeof a.axisTicks!=='object')throw new Error('Invalid axis tick settings.');
    for(const key of AXIS_KEYS){
      const t=a.axisTicks[key];if(t===undefined)continue;
      if(!t||!Number.isFinite(t.spacing)||t.spacing<=0||t.spacing>2000||!Number.isFinite(t.steps)||t.steps<=0||t.steps>2000)throw new Error(`${key.toUpperCase()} spacing and steps must be greater than zero and at most 2000.`);
    }
  }
  if(a.numberStep!==undefined&&(!Number.isFinite(a.numberStep)||a.numberStep<=0||a.numberStep>2000))throw new Error('Tick steps must be greater than zero and at most 2000.');
  if(a.numberStart!==undefined&&(!Number.isFinite(a.numberStart)||a.numberStart<=0||a.numberStart>2000))throw new Error('Tick steps must be greater than zero and at most 2000.');
  if(a.numberSize!==undefined&&(!Number.isFinite(a.numberSize)||a.numberSize<0.3||a.numberSize>4))throw new Error('Axis number size must be between 30% and 400%.');
  if(a.hideRays!==undefined&&(!Array.isArray(a.hideRays)||a.hideRays.some(r=>!AXIS_RAYS.includes(r))||new Set(a.hideRays).size!==a.hideRays.length))throw new Error('Invalid hidden-axis numbers.');
  if(a.numbers&&ranges(s.params,a.dimension).some(r=>(r.max-r.min)/axisTick(a,r.key).spacing>200))throw new Error('Too many numbered labels. Increase the spacing or reduce the range.');
  validateEquations(s);validateFunctions(s);
  if(typeof a.grid!=='boolean'||typeof a.numbers!=='boolean'||a.dimension===3&&a.grid)throw new Error('Square grids are available only on 2D axes.');
  if(!Number.isFinite(a.step)||a.step<=0||a.step>2000)throw new Error('Tick spacing must be greater than zero and at most 2000.');
  if((a.grid||a.numbers)&&ranges(s.params,a.dimension).some(r=>(r.max-r.min)/axisTick(a,r.key).spacing>200))throw new Error('Too many grid lines / ticks. Increase the spacing or reduce the range (maximum 200 intervals per axis).');
  if(!['xy','xz','yz'].includes(a.front)||!['down-left','down-right','up-left','up-right'].includes(a.depthDirection))throw new Error('Invalid 3D view.');
  if(![a.points,a.lines,a.planes].every(v=>Array.isArray(v)&&v.length<=200))throw new Error('Maximum 200 points, lines or planes per axes system.');
  const ids=new Set<string>(),names=new Set<string>();for(const entity of [...a.points,...a.lines,...a.planes]){if(!entity||typeof entity.id!=='string'||!entity.id||ids.has(entity.id))throw new Error('Axes item IDs must be unique.');ids.add(entity.id);}
  for(const p of a.points){validateCoordinate(p.at,s);if(typeof p.name!=='string'||!p.name||p.name.length>20||names.has(p.name.toUpperCase())||typeof p.showName!=='boolean'||typeof p.showCoordinates!=='boolean'||!['beside','below'].includes(p.coordinatePosition))throw new Error('Point names must be distinct and contain 1–20 characters; coordinate label settings must be valid.');names.add(p.name.toUpperCase());}
  for(let i=0;i<a.points.length;i++)if(a.points.slice(i+1).some(p=>sameCoordinate(p.at,a.points[i].at)))throw new Error('A point already exists at these coordinates.');
  const point=(id:string)=>{const p=a.points.find(p=>p.id===id);if(!p)throw new Error('Missing axes point reference.');return p.at;};
  const lineKeys=new Set<string>();for(const l of a.lines){if(!['line','vector'].includes(l.kind)||typeof l.dashed!=='boolean'||sameCoordinate(point(l.a),point(l.b)))throw new Error('A line or vector needs two distinct points.');const key=l.kind+':'+(l.kind==='line'?[l.a,l.b].sort().join(':'):[l.a,l.b].join(':'));if(lineKeys.has(key))throw new Error('This line or vector already exists.');lineKeys.add(key);}
  const infinite=a.lines.filter(l=>l.kind==='line');for(let i=0;i<infinite.length;i++)for(const other of infinite.slice(i+1)){const l=infinite[i],p=point(l.a),d=sub(point(l.b),p),q=point(other.a),e=sub(point(other.b),q);if(length(cross(d,e))<=1e-7*length(d)*length(e)&&length(cross(d,sub(q,p)))<=1e-7*length(d)*Math.max(1,length(sub(q,p))))throw new Error('An infinite line already passes through these points.');}
  const planeKeys=new Set<string>();for(const p of a.planes){if(a.dimension!==3||!Array.isArray(p.points)||p.points.length!==4)throw new Error('A plane requires four points on 3D axes.');planeOrder(p.points.map(point));const key=[...p.points].sort().join(':');if(planeKeys.has(key))throw new Error('This plane already exists.');planeKeys.add(key);}
}
export function unprojectAxes(p:Vec,a:AxesSettings,plane:'xy'|'xz'|'yz',level:number):AxisCoord{
  const b=axisBasis(a),[u,v]=plane.split('') as [AxisKey,AxisKey],fixed=AXIS_KEYS.find(k=>!plane.includes(k))!;
  if(a.dimension===2)return {x:p.x,y:p.y,z:0};
  const q={x:p.x-b[fixed].x*level,y:p.y-b[fixed].y*level},det=b[u].x*b[v].y-b[v].x*b[u].y;
  if(Math.abs(det)<1e-8)throw new Error('This placement plane is edge-on. Choose another view or plane.');
  return {...{x:0,y:0,z:0},[fixed]:level,[u]:(q.x*b[v].y-q.y*b[v].x)/det,[v]:(b[u].x*q.y-b[u].y*q.x)/det};
}
export function clipAxisLine(a:AxisCoord,b:AxisCoord,params:Record<string,number>,dimension:2|3):[AxisCoord,AxisCoord]|null{
  let lo=-Infinity,hi=Infinity;const d=sub(b,a);
  for(const r of ranges(params,dimension)){if(Math.abs(d[r.key])<1e-12){if(a[r.key]<r.min||a[r.key]>r.max)return null;}else{const t1=(r.min-a[r.key])/d[r.key],t2=(r.max-a[r.key])/d[r.key];lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}}
  if(lo>hi||!Number.isFinite(lo)||!Number.isFinite(hi))return null;const at=(t:number)=>({x:a.x+d.x*t,y:a.y+d.y*t,z:a.z+d.z*t});return [at(lo),at(hi)];
}
export const PRESETS_2D=[{name:'Equal positive / negative',long:['x+','x-','y+','y-']},{name:'Positive longer',long:['x+','y+']},{name:'Negative longer',long:['x-','y-']},{name:'X+ and Y− longer',long:['x+','y-']},{name:'Y+ and X− longer',long:['y+','x-']}];
const rays=['x+','x-','y+','y-','z+','z-'];
export const PRESETS_3D=rays.flatMap((a,i)=>rays.slice(i+1).flatMap((b,j)=>rays.slice(i+j+2).map(c=>({name:[a,b,c].join(', ')+' longer',long:[a,b,c]}))));
export function presetRanges(dimension:2|3,long:string[],equal=false,longLength=8,shortLength=4):Record<string,number>{return Object.fromEntries(AXIS_KEYS.slice(0,dimension).flatMap(k=>[[k+'Min',-(equal?longLength:long.includes(k+'-')?longLength:shortLength)],[k+'Max',equal?longLength:long.includes(k+'+')?longLength:shortLength]]));}
