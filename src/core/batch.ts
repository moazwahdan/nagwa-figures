import { create } from 'zustand';
import { currentProject, drawingProject, parseProjectText, type ProjectDocument } from './project';
import { useStore } from './store';
import type { SceneData } from './types';
import { CSV_LIMIT, type CsvPreview } from './csv';
import { geometryOf } from './scene';

interface BatchRow { sourceRow:number; reviewed:boolean; project:ProjectDocument; past:SceneData[]; future:SceneData[] }
interface BatchState { rows:BatchRow[]; active:number; enabled:boolean; single:ProjectDocument|null; singlePast:SceneData[]; singleFuture:SceneData[] }
export const useBatchStore=create<BatchState>(()=>({rows:[],active:0,enabled:false,single:null,singlePast:[],singleFuture:[]}));
let switching=false;
export function installBatchTracking(){
  return useStore.subscribe(()=>{
    if(switching||useStore.getState().workspaceMode!=='drawing')return;
    const b=useBatchStore.getState();if(!b.rows.length)return;
    const s=useStore.getState(),project=currentProject();
    if(b.enabled){
      const old=b.rows[b.active],changed=JSON.stringify(old.project)!==JSON.stringify(project);
      if(!changed&&old.past===s.past&&old.future===s.future)return;
      useBatchStore.setState({rows:b.rows.map((r,i)=>i===b.active?{...r,project:changed?project:r.project,past:s.past,future:s.future,reviewed:changed?false:r.reviewed}:r)});
    }else {
      const changed=JSON.stringify(b.single)!==JSON.stringify(project);
      if(!changed&&b.singlePast===s.past&&b.singleFuture===s.future)return;
      useBatchStore.setState({single:changed?project:b.single,singlePast:s.past,singleFuture:s.future});
    }
  });
}
function show(project:ProjectDocument,past:SceneData[]=[],future:SceneData[]=[]){
  useStore.getState().loadProject(project.scene,project.settings);
  useStore.setState({past,future,selectedId:project.scene.shapes[0]?.id??null});
}
export function importCsvBatch(preview:CsvPreview){
  if(preview.issues.length||!preview.rows.length||preview.rows.length>CSV_LIMIT)throw new Error('Fix every CSV error before importing.');
  const old=useBatchStore.getState(),st=useStore.getState();
  const single=old.enabled?old.single:currentProject(),singlePast=old.enabled?old.singlePast:st.past,singleFuture=old.enabled?old.singleFuture:st.future;
  const rows=preview.rows.map(r=>({sourceRow:r.row,reviewed:false,project:r.project,past:[],future:[]}));
  switching=true;try{useBatchStore.setState({rows,active:0,enabled:true,single,singlePast,singleFuture});show(rows[0].project);}finally{switching=false;}
}
export function switchBatchRow(index:number){
  const b=useBatchStore.getState();if(!b.enabled||index<0||index>=b.rows.length||!Number.isInteger(index))return;
  const row=b.rows[index];switching=true;try{useBatchStore.setState({active:index});show(row.project,row.past,row.future);}finally{switching=false;}
}
export function setBatchReviewed(reviewed:boolean){const b=useBatchStore.getState();if(!b.enabled)return;useBatchStore.setState({rows:b.rows.map((r,i)=>i===b.active?{...r,reviewed}:r)});}
export function pauseBatch(){
  const b=useBatchStore.getState();if(!b.enabled||!b.single)return;
  switching=true;try{useBatchStore.setState({enabled:false});show(b.single,b.singlePast,b.singleFuture);}finally{switching=false;}
}
export function resumeBatch(){
  const b=useBatchStore.getState();if(b.enabled||!b.rows.length)return;
  const r=b.rows[b.active];switching=true;try{useBatchStore.setState({enabled:true});show(r.project,r.past,r.future);}finally{switching=false;}
}
export function workspaceText(){
  const b=useBatchStore.getState();if(!b.rows.length)return JSON.stringify(drawingProject(),null,2);
  const rows=b.rows.map((r,i)=>({sourceRow:r.sourceRow,reviewed:r.reviewed,project:b.enabled&&i===b.active?drawingProject():r.project}));
  return JSON.stringify({format:'nagwa-figure-batch',version:1,active:b.active,enabled:b.enabled,single:b.enabled?b.single:drawingProject(),rows},null,2);
}
export function loadWorkspaceText(text:string){
  if(text.length>20_000_000)throw new Error('Workspace exceeds 20 MB.');
  const parsed:unknown=JSON.parse(text);
  if(!parsed||typeof parsed!=='object')throw new Error('Invalid workspace.');
  const p=parsed as Record<string,unknown>;
  if(p.format!=='nagwa-figure-batch'){
    const project=parseProjectText(text);
    switching=true;try{useBatchStore.setState({rows:[],active:0,enabled:false,single:null,singlePast:[],singleFuture:[]});useStore.getState().loadProject(project.scene,project.settings);}finally{switching=false;}return;
  }
  if(p.version!==1||!Array.isArray(p.rows)||p.rows.length<1||p.rows.length>CSV_LIMIT||!Number.isInteger(p.active)||Number(p.active)<0||Number(p.active)>=p.rows.length||typeof p.enabled!=='boolean')throw new Error('Invalid batch workspace.');
  // Validate every image before changing either store: bad rows cannot partially load.
  const rows:BatchRow[]=p.rows.map((value:unknown)=>{
    if(!value||typeof value!=='object')throw new Error('Invalid batch row.');const r=value as Record<string,unknown>;
    if(!Number.isInteger(r.sourceRow)||Number(r.sourceRow)<1||typeof r.reviewed!=='boolean')throw new Error('Invalid batch row.');
    return {sourceRow:Number(r.sourceRow),reviewed:r.reviewed,project:parseProjectText(JSON.stringify(r.project)),past:[],future:[]};
  });
  const single=parseProjectText(JSON.stringify(p.single));
  switching=true;try{useBatchStore.setState({rows,active:Number(p.active),enabled:p.enabled,single,singlePast:[],singleFuture:[]});show(p.enabled?rows[Number(p.active)].project:single);}finally{switching=false;}
}
/** Resolve names at export time, including edits made after import. */
export function batchExportNames(){
  const b=useBatchStore.getState(),seen=new Set<string>();
  return b.rows.map((r,i)=>{
    const project=b.enabled&&i===b.active?drawingProject():r.project;
    const name=project.settings.fileName.trim();
    if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(name))throw new Error(`Image ${i+1}: file name must use letters, numbers, underscores, dots or hyphens (up to 120 characters).`);
    if(seen.has(name.toLowerCase()))throw new Error(`Duplicate file name: ${name}. Rename one image before exporting.`);seen.add(name.toLowerCase());
    if(!project.scene.shapes.length)throw new Error(`Image ${i+1} (${name}) is empty.`);
    for(const shape of project.scene.shapes){const error=geometryOf(shape).error;if(error)throw new Error(`Image ${i+1} (${name}): ${error}`);}
    return {name,project,reviewed:r.reviewed,sourceRow:r.sourceRow};
  });
}
