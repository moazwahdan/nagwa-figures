import { parseProjectText, type ProjectDocument } from './project';
import { geometryOf } from './scene';
import { SHAPE_DEFS } from './shapes2d';
export interface CustomShape { name:string; project:ProjectDocument }
export const CUSTOM_KEY='nagwa-figure-studio.custom-shapes.v1';
export const customNameKey=(name:string)=>name.trim().normalize('NFKC').toLowerCase();
export function checkCustomName(name:string):string {
  name=name.trim().normalize('NFKC');
  if(!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name)||name.toLowerCase().startsWith('custom:'))throw new Error('Use a name of 1–80 characters without control characters or custom: prefix.');
  if(SHAPE_DEFS.some(d=>[d.id,d.label].some(n=>customNameKey(n)===customNameKey(name))))throw new Error('This name belongs to a built-in shape. Choose another name.');
  return name;
}
export function validateCustom(value:CustomShape):CustomShape {
  const name=checkCustomName(value.name),project=parseProjectText(JSON.stringify(value.project));
  if(!project.scene.shapes.length)throw new Error('Add a shape before saving a custom figure.');
  if(project.scene.shapes.some(s=>geometryOf(s).error))throw new Error('Fix invalid geometry before saving.');
  return {name,project};
}
export function customText(shapes:CustomShape[]):string {
  const text=JSON.stringify({format:'nagwa-custom-shapes',version:1,shapes},null,2);
  if(new TextEncoder().encode(text).length>10_000_000)throw new Error('Custom collection exceeds 10 MB.');return text;
}
export function parseCustomText(text:string):CustomShape[] {
  if(new TextEncoder().encode(text).length>10_000_000)throw new Error('Custom collection exceeds 10 MB.');
  const value=JSON.parse(text);
  if(value?.format!=='nagwa-custom-shapes'||value.version!==1||!Array.isArray(value.shapes)||value.shapes.length>100)throw new Error('Invalid custom-shapes collection (maximum 100 figures).');
  const keys=new Set<string>();
  return value.shapes.map((v:CustomShape)=>{if(!v||typeof v.name!=='string')throw new Error('Invalid custom figure.');const shape=validateCustom(v),key=customNameKey(shape.name);if(keys.has(key))throw new Error(`Duplicate custom name: ${shape.name}.`);keys.add(key);return shape;});
}
export function mergeCustom(existing:CustomShape[],incoming:CustomShape[],replace=false):CustomShape[]{
  const result=[...existing];
  for(const item of incoming){const i=result.findIndex(s=>customNameKey(s.name)===customNameKey(item.name));if(i>=0){if(!replace)throw new Error(`Name already saved: ${item.name}. Enable Replace same names to overwrite.`);result[i]=item;}else result.push(item);}
  if(result.length>100)throw new Error('Maximum 100 custom figures.');customText(result);return result;
}
