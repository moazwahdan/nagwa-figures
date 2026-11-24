import { customNameKey, type CustomShape } from './customShapes';
import { cloneScene } from './sceneClone';
import type { StyleSettings } from './types';
import { SHAPE_DEFS } from './shapes2d';
import { CANVAS_PRESETS, canvasLimitError } from './imageFrames';
import { DEFAULT_CANVAS, DEFAULT_STYLE, newShape, geometryOf, syncArrays } from './scene';
import { fitScene } from './world';
import { formatNumber } from './labels';
import { parseProjectText, type ProjectDocument } from './project';

export const CSV_LIMIT=200;
export interface CsvIssue { row:number; message:string }
export interface CsvRow { row:number; name:string; shape:string; project:ProjectDocument }
export interface CsvPreview { rows:CsvRow[]; issues:CsvIssue[] }
const standard=['id','shape','canvas_size','canvas_width','canvas_height','params','names','rotation','scale','show_dimensions','case_mode','center_name'];
const paramKeys=new Set(SHAPE_DEFS.flatMap(d=>d.params.map(p=>p.key)));
const normalizedNumber=(s:string)=>s.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/٫/g,'.').replace(/−/g,'-');
function number(s:string,label:string){const value=normalizedNumber(s.trim());if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))throw new Error(`${label}: enter a number.`);const n=Number(value);if(!Number.isFinite(n))throw new Error(`${label}: enter a finite number.`);return n;}
/** CSV/TSV parser with quotes, escaped quotes and multiline cells. Records
 * retain physical source lines for errors; input is never evaluated. */
export function csvRecords(text:string):{line:number;cells:string[]}[]{
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const first=text.split('\n')[0],counts=[',',';','\t'].map(delimiter=>({delimiter,n:[...first].filter(c=>c===delimiter).length}));
  const delimiter=counts.sort((a,b)=>b.n-a.n)[0].delimiter;
  const rows:{line:number;cells:string[]}[]=[],cells:string[]=[];
  let value='',quoted=false,closed=false,line=1,start=1;
  const cell=()=>{cells.push(value);value='';closed=false;};
  const record=()=>{cell();if(cells.some(c=>c.trim()))rows.push({line:start,cells:[...cells]});cells.length=0;start=line+1;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else{value+=c;if(c==='\n')line++;}continue;}
    if(c===delimiter){cell();continue;}if(c==='\n'){record();line++;continue;}
    if(c==='"'){if(value.length||closed)throw new Error(`Row ${line}: unexpected quote.`);quoted=true;continue;}
    if(closed){if(c===' '||c==='\t')continue;throw new Error(`Row ${line}: text after closing quote.`);}value+=c;
  }
  if(quoted)throw new Error(`Row ${start}: missing closing quote.`);
  if(value.length||cells.length||closed)record();return rows;
}
/** `baseStyle` (line weight, label size…) is applied to every generated row so imported images match the current drawing. */
export function previewCsv(text:string,custom:CustomShape[]=[],baseStyle:StyleSettings=DEFAULT_STYLE,baseMin=Math.min(DEFAULT_CANVAS.w,DEFAULT_CANVAS.h)):CsvPreview{
  const rows:CsvRow[]=[],issues:CsvIssue[]=[];
  if(new TextEncoder().encode(text).length>2_000_000)return {rows,issues:[{row:0,message:'CSV exceeds 2 MB.'}]};
  let records:ReturnType<typeof csvRecords>;try{records=csvRecords(text);}catch(e){return {rows,issues:[{row:0,message:(e as Error).message}]};}
  if(records.length<2)return {rows,issues:[{row:0,message:'Include a header and at least one image row.'}]};
  const headers=records[0].cells.map(c=>{const lower=c.trim().toLowerCase();return [...paramKeys].find(k=>k.toLowerCase()===lower)??lower;});
  if(new Set(headers).size!==headers.length||headers.some(h=>!h))issues.push({row:records[0].line,message:'Headers must be nonempty and unique.'});
  if(!headers.includes('shape'))issues.push({row:records[0].line,message:'Missing shape column.'});
  for(const h of headers)if(!standard.includes(h)&&!paramKeys.has(h))issues.push({row:records[0].line,message:`Unknown column: ${h}.`});
  if(records.length-1>CSV_LIMIT)issues.push({row:0,message:`Maximum ${CSV_LIMIT} images per batch.`});
  if(issues.length)return {rows,issues};
  const names=new Set<string>();
  for(const record of records.slice(1))try{
    if(record.cells.length!==headers.length)throw new Error(`Expected ${headers.length} columns, got ${record.cells.length}.`);
    const fields:Record<string,string>=Object.fromEntries(headers.map((h,i)=>[h,record.cells[i].trim()]));
    const customMatches=custom.filter(c=>customNameKey(c.name)===customNameKey(fields.shape.replace(/^custom:/i,'')));
    if(customMatches.length){
      if(customMatches.length!==1)throw new Error('Ambiguous custom name.');
      for(const [key,value] of Object.entries(fields))if(value&&!['id','shape','canvas_size','canvas_width','canvas_height'].includes(key))throw new Error(`Custom figures preserve saved geometry: ${key} is not supported. Edit the image after import.`);
      const name=fields.id||`figure_${String(rows.length+1).padStart(3,'0')}`;
      if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(name))throw new Error('id: use up to 120 letters, numbers, underscores, hyphens or dots.');
      if(names.has(name.toLowerCase()))throw new Error(`Duplicate image ID: ${name}.`);
      const source=customMatches[0],project=structuredClone(source.project);project.settings.fileName=name;project.scene=cloneScene(source.project.scene);
      if(fields.canvas_size){const pair=CANVAS_PRESETS[fields.canvas_size];if(!pair)throw new Error('canvas_size: portrait, landscape or square.');project.scene.canvas={...pair};}
      if(!!fields.canvas_width!==!!fields.canvas_height)throw new Error('Supply both canvas_width and canvas_height.');
      if(fields.canvas_width){const canvas={w:number(fields.canvas_width,'canvas_width'),h:number(fields.canvas_height,'canvas_height')};const err=canvasLimitError(canvas.w,canvas.h);if(err)throw new Error(err);project.scene.canvas=canvas;}
      if(fields.canvas_size||fields.canvas_width)project.scene=fitScene(project.scene);
      parseProjectText(JSON.stringify(project));names.add(name.toLowerCase());rows.push({row:record.line,name,shape:`Custom: ${source.name}`,project});continue;
    }
    const matches=SHAPE_DEFS.filter(d=>!d.hidden&&(d.id===fields.shape.toLowerCase()||d.label.toLowerCase()===fields.shape.toLowerCase()));
    if(matches.length!==1)throw new Error(`Unknown or ambiguous shape: ${fields.shape||'(empty)'}. Use a shape ID from the reference.`);
    const def=matches[0],s=newShape(def.id),specified:Record<string,string>=Object.create(null);
    if(fields.params)for(const entry of fields.params.split(';')){const pair=entry.split('=');if(pair.length!==2||!pair[0].trim()||!pair[1].trim())throw new Error('params must use key=value;key=value.');const k=pair[0].trim();if(k in specified)throw new Error(`Repeated parameter: ${k}.`);specified[k]=pair[1].trim();}
    for(const k of paramKeys)if(fields[k]){if(k in specified)throw new Error(`Parameter ${k} occurs in both params and a column.`);specified[k]=fields[k];}
    for(const [k,v] of Object.entries(specified)){
      const p=def.params.find(p=>p.key===k);if(!p)throw new Error(`${k} is not a parameter of ${def.label}.`);
      const n=number(v,k);if(n<p.min||n>p.max||p.options&&!p.options.some(o=>o.value===n)||k==='n'&&!Number.isInteger(n))throw new Error(`${k}: allowed ${p.options?p.options.map(o=>o.value).join(', '):`${p.min}–${p.max}`}.`);s.params[k]=n;
    }
    Object.assign(s,syncArrays(s));const g=geometryOf(s);if(g.error)throw new Error(g.error);
    if(fields.names){const ns=fields.names.split('|').map(n=>n.trim());if(ns.length!==s.names.length||ns.some(n=>! /^[A-Za-z][A-Za-z0-9]{0,19}$/.test(n))||new Set(ns.map(n=>n.toUpperCase())).size!==ns.length)throw new Error(`names: enter ${s.names.length} distinct English names separated by |.`);s.names=ns.map(n=>n.toUpperCase());}
    if(fields.rotation)s.rotation=number(fields.rotation,'rotation');
    if(fields.scale){s.scale=number(fields.scale,'scale')/100;if(s.scale<0.1||s.scale>1e7)throw new Error('scale: allowed 10–1000000000 (%).');}
    if(fields.case_mode){if(!['upper','lower'].includes(fields.case_mode))throw new Error('case_mode: upper or lower.');s.caseMode=fields.case_mode as 'upper'|'lower';}
    if(fields.center_name){if(!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(fields.center_name))throw new Error('center_name: use an English name.');if(!g.circle&&!g.solid)throw new Error('center_name needs a circle or solid.');s.center={show:true,name:fields.center_name.toUpperCase()};}
    if(fields.show_dimensions&&!['true','false','1','0'].includes(fields.show_dimensions.toLowerCase()))throw new Error('show_dimensions: true or false.');
    if(['true','1'].includes(fields.show_dimensions?.toLowerCase())){
      s.sides=s.sides.map((label,i)=>({...label,text:formatNumber(g.solid?g.solid.edges[i].length:Math.hypot(g.points[i].x-g.points[(i+1)%g.points.length].x,g.points[i].y-g.points[(i+1)%g.points.length].y))}));
      if(s.solid)for(const guide of g.solid!.guides){s.solid.labels[guide.key].text=formatNumber(guide.length);if(guide.key==='height')s.solid.showHeight=true;else if(guide.key==='radius')s.solid.showRadius=true;else s.solid.showDiagonal=true;}
    }
    let canvas={...DEFAULT_CANVAS};
    if(fields.canvas_size){const pair=CANVAS_PRESETS[fields.canvas_size];if(!pair)throw new Error('canvas_size: portrait, landscape or square.');canvas={...pair};}
    if(!!fields.canvas_width!==!!fields.canvas_height)throw new Error('Supply both canvas_width and canvas_height.');
    if(fields.canvas_width){canvas={w:number(fields.canvas_width,'canvas_width'),h:number(fields.canvas_height,'canvas_height')};const err=canvasLimitError(canvas.w,canvas.h);if(err)throw new Error(err);}
    const name=fields.id||`figure_${String(rows.length+1).padStart(3,'0')}`;
    if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(name))throw new Error('id: use up to 120 letters, numbers, underscores, hyphens or dots.');
    if(names.has(name.toLowerCase()))throw new Error(`Duplicate image ID: ${name}.`);names.add(name.toLowerCase());
    const project:ProjectDocument={format:'nagwa-figure-studio',version:1,scene:fitScene({canvas,style:{...baseStyle},shapes:[s],points:[],lines:[],marks:[],viewScale:40}),settings:{fileName:name,theme:'light',lockAll:true,separateLabels:false}};
    parseProjectText(JSON.stringify(project));rows.push({row:record.line,name,shape:def.label,project});
  }catch(e){issues.push({row:record.line,message:(e as Error).message});}
  return {rows,issues};
}
export const CSV_TEMPLATE='id,shape,canvas_size,canvas_width,canvas_height,params,names,show_dimensions\nfigure_001,quad-square,portrait,,,s=5,A|B|C|D,true\nfigure_002,tri-right,landscape,,,l1=4;l2=3,A|B|C,true\nfigure_003,solid-cuboid,,250,200,width=6;height=4;depth=3,A|B|C|D|E|F|G|H,true\nfigure_004,circle,square,,,r=3,,false\n';
