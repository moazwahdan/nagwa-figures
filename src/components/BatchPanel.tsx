import { useRef, useState } from 'react';
import { useCustomStore } from '../core/customStore';
import { SHAPE_DEFS } from '../core/shapes2d';
import { CSV_TEMPLATE, previewCsv, type CsvPreview } from '../core/csv';
import { importCsvBatch, useBatchStore, switchBatchRow, setBatchReviewed, pauseBatch, resumeBatch } from '../core/batch';
import { useStore } from '../core/store';
import { download } from '../core/exportImage';
import { exportBatchZip } from '../core/exportBatch';

export function BatchImport(){
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[preview,setPreview]=useState<CsvPreview|null>(null),[err,setErr]=useState('');
  const existing=useBatchStore(s=>s.rows.length>0);
  const check=(value:string)=>{const s=useStore.getState();setText(value);setErr('');setPreview(previewCsv(value,useCustomStore.getState().shapes,s.style,Math.min(s.canvas.w,s.canvas.h)));};
  return <>
    <button className="btn" onClick={()=>setOpen(true)}>CSV batch</button>
    {open&&<div className="modal-backdrop"><section className="batch-modal" role="dialog" aria-modal="true" aria-label="Import CSV batch">
      <div className="batch-heading"><h2>Import images from CSV</h2><button className="btn" onClick={()=>setOpen(false)}>Close</button></div>
      <p>One row per image. Import creates editable 2D/3D figures; review and complete each image using the existing tools. Up to 200 images, 2 MB. New images use the current drawing's Line weight and Label size.</p>
      <div className="batch-actions">
        <button className="btn" onClick={()=>input.current?.click()}>Choose CSV file</button>
        <button className="btn" onClick={()=>download(new Blob(['\uFEFF'+CSV_TEMPLATE],{type:'text/csv;charset=utf-8'}),'figure-template.csv')}>Download CSV template</button>
        <button className="btn" onClick={()=>check(CSV_TEMPLATE)}>Try example</button>
      </div>
      <input ref={input} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden aria-label="CSV file" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>2_000_000)throw new Error('CSV exceeds 2 MB.');check(await file.text());}catch(e){setErr((e as Error).message);setPreview(null);}}}/>
      <label className="csv-input"><span>Paste CSV or tab-separated cells from a spreadsheet</span><textarea aria-label="CSV content" value={text} onChange={e=>{setText(e.target.value);setPreview(null);setErr('');}} placeholder="id,shape,params&#10;figure_001,quad-square,s=5" /></label>
      <button className="btn" onClick={()=>check(text)}>Preview CSV</button>
      {err&&<div className="warn" role="alert">{err}</div>}
      {preview&&<>
        {preview.issues.length>0&&<div className="csv-errors" role="alert"><b>Fix {preview.issues.length} error(s) before importing</b><ul>{preview.issues.map((issue,i)=><li key={i}>{issue.row?`Row ${issue.row}: `:''}{issue.message}</li>)}</ul></div>}
        <div className="csv-table-wrap"><table className="csv-table"><thead><tr><th>Row</th><th>File name / ID</th><th>Shape</th><th>Image size</th></tr></thead><tbody>{preview.rows.map(r=><tr key={r.row}><td>{r.row}</td><td>{r.name}</td><td>{r.shape}</td><td>{r.project.scene.canvas.w} × {r.project.scene.canvas.h}</td></tr>)}</tbody></table></div>
        {existing&&<p className="muted">This replaces the existing batch. Use Save to keep a copy of that batch first.</p>}
        <button className="btn primary" disabled={!!preview.issues.length||!preview.rows.length} onClick={()=>{try{importCsvBatch(preview);setOpen(false);useStore.getState().notify('info',`Imported ${preview.rows.length} images. Review each image before exporting.`);}catch(e){setErr((e as Error).message);}}}>{existing?'Replace batch with':'Import'} {preview.rows.length} images</button>
      </>}
      <details className="csv-help"><summary>Columns and supported shapes</summary>
        <p>Saved custom figures: use <b>custom:Name</b> or their exact name in shape. Import their collection first. Custom rows accept id and canvas size columns; geometry and labels come from the saved figure.</p>
        <p><b>shape</b> is required. <b>id</b> sets the output name. Blank optional cells use defaults.</p>
        <p><b>params</b>: key=value;key=value, or use individual parameter columns. <b>canvas_size</b>: portrait (200×250), landscape (250×200), square (200×200). <b>canvas_width</b> and <b>canvas_height</b>: both required. Portrait at most 350×360, landscape at most 360×350, square at most 360×360.</p>
        <p><b>names</b>: English vertex names separated by |; Arabic names are generated automatically. <b>rotation</b>: degrees. <b>scale</b>: percent (10–1000). <b>show_dimensions</b>: true/false. <b>case_mode</b>: upper/lower. <b>center_name</b>: circle/solid centre name.</p>
        <p>Numbers can use English or Arabic digits. Files may use comma, semicolon or tab separators. Each row starts with one shape; add other shapes and constructions during review.</p>
        <table className="csv-table"><thead><tr><th>Shape ID</th><th>Name</th><th>Parameters (defaults)</th></tr></thead><tbody>{SHAPE_DEFS.filter(d=>!d.hidden).map(d=><tr key={d.id}><td>{d.id}</td><td>{d.label}</td><td>{d.params.map(p=>`${p.key}=${p.def}`).join('; ')}</td></tr>)}</tbody></table>
      </details>
    </section></div>}
  </>;
}

export function BatchPanel(){
  const b=useBatchStore(),[ratio,setRatio]=useState(1);
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  if(!b.rows.length)return null;
  if(!b.enabled)return <div className="batch-bar"><span>Batch paused · {b.rows.length} images saved in this workspace</span><button className="btn sm" onClick={resumeBatch}>Resume batch</button></div>;
  const row=b.rows[b.active],reviewed=b.rows.filter(r=>r.reviewed).length;
  return <div className="batch-bar">
    <div className="batch-actions">
      <b>CSV batch</b><button className="btn sm" disabled={b.active===0} onClick={()=>switchBatchRow(b.active-1)}>Previous image</button>
      <select aria-label="Batch image" value={b.active} onChange={e=>switchBatchRow(Number(e.target.value))}>{b.rows.map((r,i)=><option key={i} value={i}>{i+1}. {r.project.settings.fileName} {r.reviewed?'✓':''}</option>)}</select>
      <button className="btn sm" disabled={b.active===b.rows.length-1} onClick={()=>switchBatchRow(b.active+1)}>Next image</button>
      <label className="check"><input type="checkbox" checked={row.reviewed} onChange={e=>setBatchReviewed(e.target.checked)} />Reviewed</label><span className="muted small">{reviewed}/{b.rows.length} reviewed</span>
      <button className="btn sm" onClick={pauseBatch}>Return to single image</button>
    </div>
    <div className="batch-actions">
      <select aria-label="Batch PNG scale" value={ratio} onChange={e=>setRatio(Number(e.target.value))}><option value={1}>1×</option><option value={2}>2×</option></select>
      <button className="btn primary sm" disabled={busy} onClick={async()=>{setBusy(true);setError('');controller.current=new AbortController();try{await exportBatchZip(ratio,(done,total,name)=>setProgress(`${done}/${total} · ${name}`),controller.current.signal);setProgress('Batch ZIP downloaded.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Exporting…':'Export PNG, SVG, PDF, JSON'}</button>
      {busy&&<button className="btn sm" onClick={()=>controller.current?.abort()}>Cancel export</button>}
      <span className="small" role="status">{progress||'Save and Autosave include every image.'}</span>
    </div>
    {reviewed<b.rows.length&&<span className="muted small">The ZIP includes all {b.rows.length} images, including {b.rows.length-reviewed} awaiting review.</span>}
    {error&&<div className="warn" role="alert">{error}</div>}
  </div>;
}
