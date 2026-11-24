import { useRef, useState } from 'react';
import { useStore } from '../core/store';
import { useCustomStore } from '../core/customStore';
import { customText, mergeCustom, parseCustomText } from '../core/customShapes';
import { useCustomEditor, newCustomDraft, draftFromDrawing, editCustomDraft, saveCustomDraft, deleteCustom } from '../core/customWorkspace';
import { download } from '../core/exportImage';
import { SceneSvg } from './SceneSvg';
import { Tooltip } from './Tooltip';
/** Insertion only. Management belongs exclusively to the dedicated workspace. */
export function CustomShapePicker(){
  const shapes=useCustomStore(s=>s.shapes),error=useCustomStore(s=>s.error);
  return <div className="custom-picker"><Tooltip tip="Choose a saved figure to add an independent copy."><select aria-label="Add custom shape" value="" disabled={!shapes.length} onChange={e=>{if(e.target.value==='')return;const item=shapes[Number(e.target.value)];if(!item)return;try{useStore.getState().insertScene(item.project.scene);}catch(e){useStore.getState().notify('error',(e as Error).message);}}}>
    <option value="">{shapes.length?'Choose a custom shape…':'No custom shapes saved yet'}</option>{shapes.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}
  </select></Tooltip>{error&&<div className="warn" role="alert">{error}</div>}</div>;
}
export function CustomEditorBar(){
  const editor=useCustomEditor(),hasShapes=useStore(s=>s.shapes.length>0);
  const run=(action:()=>void)=>{try{action();useCustomEditor.setState({error:''});}catch(e){useCustomEditor.setState({error:(e as Error).message});}};
  return <div className="custom-editor-bar"><div className="custom-editor-actions">
    <label><span>Custom figure name</span><input aria-label="Custom figure name" value={editor.name} maxLength={80} onChange={e=>useCustomEditor.setState({name:e.target.value,error:''})}/></label>
    <button className="btn primary" disabled={!hasShapes} onClick={()=>run(saveCustomDraft)}>{editor.editingKey?'Save changes':'Add'}</button>
    <button className="btn" onClick={newCustomDraft}>New figure</button><button className="btn" onClick={draftFromDrawing}>Use current image</button>
  </div><p className="muted small">{editor.editingKey?'Edit geometry or rename, then Save changes. Existing copies in your drawings stay independent.':'Build a figure in the two previews, name it, then Add to the collection.'}</p>
  {(editor.error||editor.draftError)&&<div className="warn" role="alert">{editor.error||editor.draftError}</div>}</div>;
}
/** Collection operations are only mounted inside the custom studio. */
export function CustomShapesPanel(){
  const library=useCustomStore(),editor=useCustomEditor(),[error,setError]=useState(''),[replace,setReplace]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const run=(action:()=>void)=>{try{action();setError('');}catch(e){setError((e as Error).message);}};
  return <section className="custom-library-manager"><div className="heading-row"><b>Saved custom shapes</b><span className="count">{library.shapes.length}</span></div>
    <div className="batch-actions"><button className="btn sm" onClick={()=>run(()=>download(new Blob([customText(library.shapes)],{type:'application/json'}),'custom-shapes.json'))}>Export collection</button><button className="btn sm" onClick={()=>input.current?.click()}>Import collection</button><button className="btn sm" disabled={!library.previous} onClick={library.undo}>Undo collection change</button></div>
    <label className="check"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Replace same names on import</label>
    <input ref={input} type="file" accept=".json,application/json" aria-label="Custom collection file" hidden onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>10_000_000)throw new Error('Custom collection exceeds 10 MB.');const incoming=parseCustomText(await file.text());library.set(mergeCustom(useCustomStore.getState().shapes,incoming,replace));setError('');}catch(e){setError((e as Error).message);}}}/>
    {(error||library.error)&&<div className="warn" role="alert">{error||library.error}</div>}
    {!library.shapes.length&&<p className="muted small">Your saved custom figures will appear here. Add your first figure from the canvas.</p>}
    <div className="custom-manager-list">{library.shapes.map(item=><article className={`custom-card ${editor.editingKey===item.name.normalize('NFKC').toLowerCase()?'editing':''}`} key={item.name}>
      <div className="custom-thumbnail"><SceneSvg data={item.project.scene} lang="en"/></div><b>{item.name}</b>
      <div className="small muted">{item.project.scene.shapes.length} shapes · {item.project.scene.points.length} points</div>
      <div className="batch-actions"><button className="btn sm" onClick={()=>editCustomDraft(item)}>Edit</button><button className="btn sm" onClick={()=>run(()=>deleteCustom(item))}>Delete</button></div>
    </article>)}</div><p className="muted small">CSV: <b>custom:Your name</b>. Export this collection to share it or use it on another device.</p>
  </section>;
}
