import { useStore } from './store';
import { uid } from './scene';
import { planeOrder, sameCoordinate, validateAxes, validateCoordinate } from './axes';
import { compileFunction, curveGeometry } from './functions';
import type { AxisCoord, AxisFunction, AxisPoint, AxesSettings, AxesTool, ShapeInstance } from './types';
export function axisShape(id:string){const s=useStore.getState().shapes.find(s=>s.id===id);if(!s?.axes)throw new Error('Select an axes system first.');return s;}
export function patchAxes(id:string,patch:Partial<AxesSettings>,params?:Record<string,number>,fit=false){const s=axisShape(id),next={...s,axes:{...s.axes!,...patch},params:params??s.params};validateAxes(next);useStore.getState().patchShape(id,{axes:next.axes,params:next.params},{fit});}
export function parseAxisNumber(text:string,label='Coordinate'):number{const raw=text.trim().replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/٫/g,'.').replace(/−/g,'-');if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))throw new Error(`${label}: enter a valid number.`);const n=Number(raw);if(!Number.isFinite(n))throw new Error(`${label}: enter a finite number.`);return n;}
function nextName(a:AxesSettings){const used=new Set(a.points.map(p=>p.name.toUpperCase()));for(let i=0;i<500;i++){const name=String.fromCharCode(65+i%26)+(i>=26?Math.floor(i/26):'');if(!used.has(name))return name;}throw new Error('Too many named points.');}
export function addAxisItem(id:string,kind:AxesTool['kind'],coordinates:AxisCoord[],options:{name?:string;showCoordinates?:boolean;coordinatePosition?:'beside'|'below';dashed?:boolean}={}){
  const s=axisShape(id),a=structuredClone(s.axes!);for(const p of coordinates)validateCoordinate(p,s);
  const count=kind==='point'?1:kind==='plane'?4:2;if(coordinates.length!==count)throw new Error(`Choose ${count} point(s).`);
  if(coordinates.some((p,i)=>coordinates.slice(i+1).some(q=>sameCoordinate(p,q))))throw new Error('Choose distinct points.');
  if(kind==='plane'){if(a.dimension!==3)throw new Error('Planes require 3D axes.');planeOrder(coordinates);}
  if(kind==='point'&&a.points.some(p=>sameCoordinate(p.at,coordinates[0])))throw new Error('A point already exists at these coordinates. Select it to edit its label.');
  const ids=coordinates.map(at=>{const old=a.points.find(p=>sameCoordinate(p.at,at));if(old)return old.id;const p:AxisPoint={id:uid(),name:kind==='point'&&options.name?.trim()?options.name.trim():nextName(a),at:{...at},showName:true,showCoordinates:options.showCoordinates??false,coordinatePosition:options.coordinatePosition??'beside'};a.points.push(p);return p.id;});
  if(kind==='line'||kind==='vector')a.lines.push({id:uid(),kind,a:ids[0],b:ids[1],dashed:options.dashed??false});
  if(kind==='plane')a.planes.push({id:uid(),points:planeOrder(coordinates).map(i=>ids[i]) as [string,string,string,string]});
  validateAxes({...s,axes:a});useStore.getState().patchShape(id,{axes:a});
}
export function removeAxisPoint(shapeId:string,id:string){const s=axisShape(shapeId),a=s.axes!;patchAxes(shapeId,{points:a.points.filter(p=>p.id!==id),lines:a.lines.filter(l=>l.a!==id&&l.b!==id),planes:a.planes.filter(p=>!p.points.includes(id))});}
export function startAxisTool(shape:string,kind:AxesTool['kind'],options:Partial<AxesTool>={}){const s=axisShape(shape);if(kind==='plane'&&s.axes!.dimension!==3)throw new Error('Planes require 3D axes.');useStore.setState({selectedId:shape,tool:null,picks:[],axesTool:{kind,shape,picks:[],plane:s.axes!.front,level:0,showCoordinates:false,coordinatePosition:'beside',...options},notice:null});}
export function pickAxisCoordinate(at:AxisCoord){
  const st=useStore.getState(),tool=st.axesTool;if(!tool)return;
  try{const s=axisShape(tool.shape);validateCoordinate(at,s);if(tool.picks.some(p=>sameCoordinate(p,at)))throw new Error('This point is already selected. Choose another point or Undo pick.');
    const picks=[...tool.picks,at],count=tool.kind==='point'?1:tool.kind==='plane'?4:2;
    if(picks.length<count){useStore.setState({axesTool:{...tool,picks}});return;}
    addAxisItem(tool.shape,tool.kind,picks,tool);useStore.setState({axesTool:st.repeatTool?{...tool,picks:[]}:null});st.notify('info',`${tool.kind}: added.${st.repeatTool?' Pick the next item.':' Select / move mode.'}`);
  }catch(e){st.notify('error',(e as Error).message);}
}
export function editAxisPoint(s:ShapeInstance,id:string,patch:Partial<AxisPoint>){patchAxes(s.id,{points:s.axes!.points.map(p=>p.id===id?{...p,...patch}:p)});}
/* ---------- y = f(x) curves (2D axes) ---------- */
export type FunctionInput={expr:string;from?:number;to?:number;dashed?:boolean;arrows?:boolean;showLabel?:boolean;label?:string};
function nextFunctionLabel(a:AxesSettings){const used=new Set((a.functions??[]).map(f=>f.label));for(const n of 'fghkpqrstuvw'){const label=`${n}(x)`;if(!used.has(label))return label;}return `f${(a.functions??[]).length+1}(x)`;}
function buildFunction(s:ShapeInstance,id:string,input:FunctionInput,fallbackLabel:string):AxisFunction{
  if(s.axes!.dimension!==2)throw new Error('Function curves are available only on 2D axes.');
  const expr=input.expr.trim();compileFunction(expr);
  const item:AxisFunction={id,expr,dashed:input.dashed??false,arrows:input.arrows??false,showLabel:input.showLabel??false,label:(input.label??'').trim()||fallbackLabel};
  if(input.from!==undefined)item.from=input.from;if(input.to!==undefined)item.to=input.to;
  if(item.from!==undefined&&item.to!==undefined&&!(item.from<item.to))throw new Error('The domain start must be smaller than its end.');
  if(!curveGeometry(item,s.params,s.axes).length)throw new Error('This function has no visible part inside the current axis ranges and domain. Expand the ranges or change the expression.');
  return item;
}
export function addAxisFunction(id:string,input:FunctionInput){const s=axisShape(id),a=s.axes!;patchAxes(id,{functions:[...a.functions??[],buildFunction(s,uid(),input,nextFunctionLabel(a))]});}
export function updateAxisFunction(id:string,fnId:string,input:FunctionInput){const s=axisShape(id),a=s.axes!,old=(a.functions??[]).find(f=>f.id===fnId);if(!old)throw new Error('This function no longer exists.');patchAxes(id,{functions:a.functions!.map(f=>f.id===fnId?buildFunction(s,fnId,input,old.label):f)});}
export function removeAxisFunction(id:string,fnId:string){const a=axisShape(id).axes!;patchAxes(id,{functions:(a.functions??[]).filter(f=>f.id!==fnId)});}
