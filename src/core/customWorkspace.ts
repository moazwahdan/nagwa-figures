import { create } from 'zustand';
import { currentProject, parseProjectText } from './project';
import { useStore, type DrawingBackup } from './store';
import { DEFAULT_CANVAS, DEFAULT_STYLE } from './scene';
import { cloneScene } from './sceneClone';
import { useCustomStore } from './customStore';
import { customNameKey, mergeCustom, validateCustom, type CustomShape } from './customShapes';
import type { ProjectDocument } from './project';
const DRAFT_KEY='nagwa-figure-studio.custom-draft.v1';
export const useCustomEditor=create<{name:string;editingKey:string|null;error:string;draftError:string}>(()=>({name:'',editingKey:null,error:'',draftError:''}));
function blank():ProjectDocument {
  return {format:'nagwa-figure-studio',version:1,scene:{canvas:{...DEFAULT_CANVAS},style:{...DEFAULT_STYLE},viewScale:40,shapes:[],points:[],lines:[],marks:[]},settings:{fileName:'custom_figure',theme:useStore.getState().theme,lockAll:true,separateLabels:false}};
}
function showDraft(project:ProjectDocument){
  useStore.setState({...project.scene,...project.settings,past:[],future:[],selectedId:project.scene.shapes[0]?.id??null,tool:null,axesTool:null,picks:[],notice:null,repeatTool:false});
}
export function openCustomWorkspace(){
  const s=useStore.getState();if(s.workspaceMode==='custom')return;
  const project=currentProject();
  const drawingBackup:DrawingBackup={scene:project.scene,settings:project.settings,past:s.past,future:s.future,selectedId:s.selectedId,repeatTool:s.repeatTool,toolOpts:structuredClone(s.toolOpts)};
  // Atomic mode/backup publication prevents batch tracking from observing draft edits.
  useStore.setState({workspaceMode:'custom',drawingBackup});
  let draft=blank();useCustomEditor.setState({name:'',editingKey:null,error:'',draftError:''});
  try{
    const text=localStorage.getItem(DRAFT_KEY);
    if(text){if(text.length>5_000_000)throw new Error('Draft exceeds 5 MB.');const saved=JSON.parse(text);if(saved.format!=='nagwa-custom-draft'||saved.version!==1||typeof saved.name!=='string'||saved.name.length>80||(saved.editingKey!==null&&typeof saved.editingKey!=='string'))throw new Error('Invalid draft.');draft=parseProjectText(JSON.stringify(saved.project));const exists=useCustomStore.getState().shapes.some(s=>customNameKey(s.name)===saved.editingKey);useCustomEditor.setState({name:saved.name,editingKey:exists?saved.editingKey:null});}
  }catch{useCustomEditor.setState({draftError:'The previous draft could not be restored. Saved custom figures are still available.'});}
  showDraft(draft);
}
export function closeCustomWorkspace(){
  const s=useStore.getState();if(s.workspaceMode!=='custom'||!s.drawingBackup)return;
  persistDraft();const b=s.drawingBackup;
  useStore.setState({...b.scene,...b.settings,past:b.past,future:b.future,selectedId:b.selectedId,repeatTool:b.repeatTool,toolOpts:b.toolOpts,tool:null,axesTool:null,picks:[],notice:null,workspaceMode:'drawing',drawingBackup:null});
}
export function newCustomDraft(){
  if(useStore.getState().workspaceMode!=='custom')return;
  useCustomEditor.setState({name:'',editingKey:null,error:''});showDraft(blank());
}
export function draftFromDrawing(){
  const s=useStore.getState(),b=s.drawingBackup;if(s.workspaceMode!=='custom'||!b)return;
  useCustomEditor.setState({name:'',editingKey:null,error:''});showDraft({format:'nagwa-figure-studio',version:1,scene:cloneScene(b.scene),settings:{...b.settings,fileName:'custom_figure'}});
}
export function editCustomDraft(item:CustomShape){
  if(useStore.getState().workspaceMode!=='custom')return;
  useCustomEditor.setState({name:item.name,editingKey:customNameKey(item.name),error:''});
  showDraft({...item.project,scene:cloneScene(item.project.scene)});
}
export function saveCustomDraft(){
  if(useStore.getState().workspaceMode!=='custom')return;
  const {name,editingKey}=useCustomEditor.getState(),library=useCustomStore.getState();
  const item=validateCustom({name,project:currentProject()});
  if(editingKey){
    if(!library.shapes.some(s=>customNameKey(s.name)===editingKey))throw new Error('This saved figure no longer exists. Start a new figure to add it again.');
    const remaining=library.shapes.filter(s=>customNameKey(s.name)!==editingKey);
    const checked=mergeCustom(remaining,[item]);
    // Keep list position stable when updating or renaming an existing figure.
    library.set(library.shapes.map(s=>customNameKey(s.name)===editingKey?checked[checked.length-1]:s));
  }else library.set(mergeCustom(library.shapes,[item]));
  useCustomEditor.setState({name:item.name,editingKey:customNameKey(item.name),error:''});persistDraft();
  useStore.getState().notify('info',`${item.name}: saved to Custom shapes.`);
}
export function deleteCustom(item:CustomShape){
  const key=customNameKey(item.name);useCustomStore.getState().set(useCustomStore.getState().shapes.filter(s=>customNameKey(s.name)!==key));
  if(useCustomEditor.getState().editingKey===key)useCustomEditor.setState({editingKey:null,error:''});
}
function persistDraft(){
  if(useStore.getState().workspaceMode!=='custom')return;
  try{const {name,editingKey}=useCustomEditor.getState(),text=JSON.stringify({format:'nagwa-custom-draft',version:1,name,editingKey,project:currentProject()});if(text.length>5_000_000)throw new Error('Draft too large');localStorage.setItem(DRAFT_KEY,text);useCustomEditor.setState({draftError:''});}
  catch{useCustomEditor.setState({draftError:'Draft autosave is unavailable. Use Add / Save changes, then Export collection for a backup.'});}
}
export function installCustomDraftAutosave(){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const changed=()=>{if(useStore.getState().workspaceMode!=='custom')return;clearTimeout(timer);timer=setTimeout(persistDraft,500);};
  const stopScene=useStore.subscribe((s,p)=>{if(['workspaceMode','canvas','shapes','points','lines','marks','style','viewScale','lockAll','separateLabels'].some(k=>s[k as keyof typeof s]!==p[k as keyof typeof p]))changed();});
  const stopName=useCustomEditor.subscribe((s,p)=>{if(s.name!==p.name||s.editingKey!==p.editingKey)changed();});
  const flush=()=>persistDraft();window.addEventListener('pagehide',flush);
  return ()=>{stopScene();stopName();clearTimeout(timer);window.removeEventListener('pagehide',flush);};
}
