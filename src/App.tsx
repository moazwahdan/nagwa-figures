import { useEffect, useRef, useState } from 'react';
import { Inspector } from './components/Inspector';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { Tooltip } from './components/Tooltip';
import { exportZip } from './core/exportImage';
import type { Lang } from './core/types';
import { useStore } from './core/store';
import { AUTOSAVE_KEY, workspaceTextFromFile } from './core/project';
import { installBatchTracking, loadWorkspaceText, workspaceText, useBatchStore } from './core/batch';
import { BatchImport, BatchPanel } from './components/BatchPanel';
import { growRoom } from './core/imageFrames';
import { TOOL_BY_ID } from './core/tools';
import { BatchGallery } from './components/BatchGallery';
import { restoreCustom } from './core/customStore';
import { openCustomWorkspace, closeCustomWorkspace, installCustomDraftAutosave } from './core/customWorkspace';
import { CustomEditorBar, CustomShapesPanel } from './components/CustomShapesPanel';
import { TextComposer } from './components/TextsPanel';

function ProjectMenu() {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('Autosave ready');
  useEffect(() => {
    const stopTracking=installBatchTracking();
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) { loadWorkspaceText(saved); setStatus('Autosave restored'); }
    } catch { setStatus('Autosave could not be restored'); }
    let timer: number | undefined;
    let last = workspaceText();
    const save = () => {
      try { const next=workspaceText(); if(next!==last){localStorage.setItem(AUTOSAVE_KEY,next);last=next;} setStatus('Autosaved'); }
      catch { setStatus('Autosave unavailable — use Save'); }
    };
    const changed = () => {
      setStatus('Saving…');
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 500);
    };
    // Serialize the full batch only after the debounce, rather than on every
    // pointer move or tool notice. Each row remains responsive in large batches.
    const unsubscribe = useStore.subscribe((s,previous)=>{
      if(s.workspaceMode!=='drawing')return;
      if(['canvas','shapes','points','lines','marks','style','viewScale','fileName','theme','lockAll','separateLabels','unit'].some(k=>s[k as keyof typeof s]!==previous[k as keyof typeof s]))changed();
    });
    const unsubscribeBatch = useBatchStore.subscribe((s,previous)=>{
      if(s.enabled!==previous.enabled||s.active!==previous.active||s.single!==previous.single||s.rows.length!==previous.rows.length||s.rows.some((r,i)=>r.project!==previous.rows[i]?.project||r.reviewed!==previous.rows[i]?.reviewed))changed();
    });
    const flush = () => { if (timer !== undefined) save(); };
    window.addEventListener('pagehide', flush);
    return () => { stopTracking(); unsubscribe(); unsubscribeBatch(); window.clearTimeout(timer); window.removeEventListener('pagehide', flush); };
  }, []);
  const download = () => {
    const url = URL.createObjectURL(new Blob([workspaceText()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = useBatchStore.getState().rows.length ? 'batch.figure.json' : `${useStore.getState().fileName || 'figure'}.figure.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <span className="save-status" role="status">{status}</span>
    <button className="btn" onClick={download}>Save</button>
    <button className="btn" onClick={() => input.current?.click()}>Load</button>
    <input ref={input} type="file" accept=".json,.svg" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (!file) return;
      try {
        if (file.size > 20_000_000) throw new Error('Workspace exceeds 20 MB.');
        loadWorkspaceText(workspaceTextFromFile(file.name, await file.text()));
        useStore.getState().notify('info', useBatchStore.getState().rows.length ? 'Batch workspace loaded.' : 'Project loaded. Ctrl+Z restores the previous drawing.');
      } catch (err) { useStore.getState().notify('error', err instanceof Error ? err.message : 'Could not load project.'); }
    }} />
  </>;
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const empty = useStore((s) => s.shapes.length === 0);

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const s = useStore.getState();
      const data = { canvas: s.canvas, shapes: s.shapes, points: s.points, lines: s.lines, marks: s.marks, style: s.style, viewScale: s.viewScale };
      const name = s.fileName.trim() || 'figure';
      await exportZip(data, { fileName: name, theme: s.theme, lockAll: s.lockAll, separateLabels: s.separateLabels }, name, ratio);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export">
      <button className="btn primary" disabled={empty} onClick={() => setOpen(!open)}>Export ▾</button>
      {open && (
        <div className="pop">
          <div className="pop-row">
            <span>PNG scale</span>
            <div className="chips">
              {[1, 2].map((r) => (
                <button key={r} className={`chip sm ${ratio === r ? 'on' : ''}`} onClick={() => setRatio(r)}>{r}×</button>
              ))}
            </div>
          </div>
          <button className="btn primary wide" disabled={busy} onClick={() => void run()}>
            {busy ? 'Working…' : 'PNG, SVG, PDF, JSON'}
          </button>
          {err && <div className="warn">{err}</div>}
        </div>
      )}
    </div>
  );
}


function ToolBar() {
  const axesTool=useStore(s=>s.axesTool);
  const tool = useStore((s) => s.tool);
  const picks = useStore((s) => s.picks);
  const notice = useStore((s) => s.notice);
  const { setTool, clearNotice } = useStore.getState();

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => (tool && notice.kind === 'info' ? undefined : clearNotice()), notice.kind === 'error' ? 9000 : 6000);
    return () => window.clearTimeout(t);
  }, [notice, tool, clearNotice]);

  if(axesTool)return <div className={`toolbar ${notice?.kind==='error'?'err':''}`} role="status"><span className="tb-name">Axes · {axesTool.kind} {axesTool.picks.length}/{axesTool.kind==='point'?1:axesTool.kind==='plane'?4:2}</span><span className="tb-text">{notice?.kind==='error'?notice.text:'Click points on either image. Existing points keep their exact coordinates.'}</span><button className="btn sm" disabled={!axesTool.picks.length} onClick={()=>useStore.setState({axesTool:{...axesTool,picks:axesTool.picks.slice(0,-1)},notice:null})}>Undo pick</button><button className="btn sm" onClick={()=>useStore.getState().cancelInteraction()}>Done (Esc)</button></div>;
  if (!tool && !notice) return <div className="toolbar ghost-bar" aria-hidden />;
  const def = tool ? TOOL_BY_ID[tool] : null;
  const prompt = def ? def.prompts[Math.min(picks.length, def.prompts.length - 1)] : '';
  const text = notice?.text ?? prompt;
  return (
    <div className={`toolbar ${notice?.kind === 'error' ? 'err' : ''}`} role="status">
      {def && (
        <span className="tb-name">
          {def.label}
          {def.steps.length > 1 && <em> {Math.min(picks.length + 1, def.steps.length)}/{def.steps.length}</em>}
        </span>
      )}
      <span className="tb-text">{text}</span>
      {def && <button className="btn sm" onClick={() => setTool(null)}>Done (Esc)</button>}
    </div>
  );
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const fileName = useStore((s) => s.fileName);
  const canvas = useStore((s) => s.canvas);
  const lockAll = useStore((s) => s.lockAll);
  const separateLabels = useStore((s) => s.separateLabels);
  const repeatTool = useStore(s=>s.repeatTool);
  const tool = useStore(s=>s.tool);
  const axesTool=useStore(s=>s.axesTool);
  const batchEnabled = useBatchStore(s=>s.enabled);
  const customMode=useStore(s=>s.workspaceMode==='custom');
  const [freeLang, setFreeLang] = useState<Lang | null>(null);
  const [freePick, setFreePick] = useState(false);
  const [growBy, setGrowBy] = useState('80');
  const [growDir, setGrowDir] = useState<'left' | 'right' | 'up' | 'down'>('right');
  const { undo, redo, fit, setTheme, setFileName, setLockAll, resetLabels } = useStore.getState();

  useEffect(()=>restoreCustom(),[]);
  useEffect(()=>installCustomDraftAutosave(),[]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); useStore.getState().cancelInteraction(); (e.target as HTMLElement).blur?.(); return; }
      const tag = (e.target as HTMLElement).tagName;
      const t = e.target as HTMLElement;
      // typing / deleting inside any field (including the MathLive text fields) must never act on the selected shape
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'MATH-FIELD' || t.isContentEditable || t.closest?.('math-field')) return;
      const st = useStore.getState();
      if (e.key === 'Enter' && st.tool && TOOL_BY_ID[st.tool]?.openEnded) { e.preventDefault(); st.finishOpenTool(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) {
        e.preventDefault();
        st.removeShape(st.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◭</span>
          <div>
            <b>Figure Studio</b>
            <small>Math · Geometry &amp; constructions</small>
          </div>
        </div>
        <div className="top-mid">
          <button className={`btn studio-button ${customMode?'on':''}`} onClick={customMode?closeCustomWorkspace:openCustomWorkspace}>{customMode?'Back to drawing':'Go to Custom shapes studio'}</button>
          <div className="drawing-file" hidden={customMode}>
          <Tooltip tip="Used as the file name: name_ar.png / name_en.png" side="bottom">
            <label className="fname">
              <span>File name</span>
              <input value={fileName} onChange={(e) => setFileName(e.target.value.replace(/[^\w\-.]+/g, '_'))} />
            </label>
          </Tooltip>
          <span className="size-pill">{canvas.w} × {canvas.h}</span>
          </div>
        </div>
        <div className="top-right">
          {!customMode&&<BatchImport />}
          <div className="project-menu-actions" hidden={customMode}><ProjectMenu /></div>
          {!customMode&&<ExportMenu />}
        </div>
      </header>
      <main className="workspace">
        <Sidebar />
        <section className="stage" onPointerDown={(e) => {
          // empty workspace around / between the two images: deselect (clicks on the images themselves are handled by Preview)
          const t = e.target as Element;
          if (t === e.currentTarget || (t.closest('.stage-grid') && !t.closest('svg, button, input, select, textarea, math-field'))) useStore.getState().select(null);
        }}>
          <div className="workspace-heading"><div><h1>{customMode?'Custom shapes studio':'Your drawing workspace'}</h1><p>{customMode?'Create and manage reusable figures in a separate workspace.':'Build once. Review in Arabic and English.'}</p></div><span className="workspace-mode">{customMode ? 'Custom editor' : batchEnabled ? 'CSV batch' : 'Single image'}</span></div>
          {customMode?<CustomEditorBar />:<BatchPanel />}
          <div className="editor-controls">
            <button className={`btn ${!tool&&!axesTool?'on':''}`} onClick={()=>useStore.getState().cancelInteraction()} title="Cancel tool and selection (Esc)">Select / move <kbd>Esc</kbd></button>
            <button className={`btn ${repeatTool?'on':''}`} aria-pressed={repeatTool} onClick={()=>useStore.getState().setRepeatTool(!repeatTool)} title="Keep the construction tool active after each completed item">Repeat tool</button>
          <Tooltip tip="Undo (Ctrl+Z)" side="bottom"><button className="icon-btn" disabled={!canUndo} onClick={undo}>↶</button></Tooltip>
          <Tooltip tip="Redo (Ctrl+Y)" side="bottom"><button className="icon-btn" disabled={!canRedo} onClick={redo}>↷</button></Tooltip>
          <Tooltip tip="Crop each language to its own ink. The canvas size and the style line and text sizes stay as they are." side="bottom"><button className="btn" onClick={fit}>Fit</button></Tooltip>
          <Tooltip tip={lockAll ? 'All labels are locked, so nothing can be dragged by accident. Click to unlock all. (Each shape can also be locked on its own in the right panel.)' : 'Labels can be dragged. Click to lock all of them.'} side="bottom">
            <button className={`btn lock ${lockAll ? 'on' : ''}`} onClick={() => setLockAll(!lockAll)}>{lockAll ? '🔒 Locked' : '🔓 Unlocked'}</button>
          </Tooltip>
          <Tooltip tip="When enabled, dragging a label changes only this preview's language. Shape geometry remains shared." side="bottom">
            <button className={`btn lock ${separateLabels ? 'on' : ''}`} aria-pressed={separateLabels} onClick={() => useStore.getState().setSeparateLabels(!separateLabels)}>{separateLabels ? 'Separate labels' : 'Linked labels'}</button>
          </Tooltip>
          <Tooltip tip="Put every dragged label back at its default position" side="bottom"><button className="btn" onClick={() => resetLabels()}>Reset labels</button></Tooltip>
          <Tooltip tip="Light / dark interface (figures stay white)" side="bottom">
            <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '☾' : '☀'}</button>
          </Tooltip>
          <Tooltip tip="Zoom one language and add canvas space in a single direction" side="bottom">
            <button className={`btn ${freeLang ? 'on' : ''}`} aria-pressed={!!freeLang} onClick={() => { if (freeLang) { setFreeLang(null); setFreePick(false); } else setFreePick((v) => !v); }}>{freeLang ? 'Exit free view' : 'Free view'}</button>
          </Tooltip>
          {freePick && !freeLang && (
            <div className="chips" role="group" aria-label="Free view language">
              <button type="button" className="chip sm" onClick={() => { setFreeLang('ar'); setFreePick(false); }}>عربي</button>
              <button type="button" className="chip sm" onClick={() => { setFreeLang('en'); setFreePick(false); }}>English</button>
            </div>
          )}
          </div>
          <TextComposer />
          <ToolBar />
          {freeLang && (
            <form className="free-grow" onSubmit={(e) => { e.preventDefault(); useStore.getState().growCanvas(growDir, Number(growBy)); }}>
              <span>Add space</span>
              <input aria-label="Pixels to add" type="number" min={1} max={Math.max(1, growRoom(canvas.w, canvas.h, growDir).room)} value={growBy} onChange={(e) => setGrowBy(e.target.value)} />
              <select aria-label="Direction" value={growDir} onChange={(e) => setGrowDir(e.target.value as 'left' | 'right' | 'up' | 'down')}>
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
              <button className="btn sm" type="submit">Add</button>
            </form>
          )}
          {freeLang ? <div className="stage-grid single-canvas free-stage"><Preview lang={freeLang} zoom={2} /></div> : batchEnabled&&!customMode ? <BatchGallery /> : <div className="stage-grid single-canvas"><Preview lang="ar" /><Preview lang="en" /></div>}
        </section>
        {customMode?<div className="custom-studio-side"><CustomShapesPanel /><Inspector /></div>:<Inspector />}
      </main>
    </div>
  );
}
