import { useEffect, useState } from 'react';
import { ColorSwatches } from './ColorSwatches';
import { AxesConstructions } from './AxesInspector';
import { CustomShapePicker } from './CustomShapesPanel';
import { TextsPanel } from './TextsPanel';
import { ANCHOR_KEYS, canHaveAnchors } from '../core/anchors';
import { FONT_PT, STROKE_PT, ptToPx } from '../core/paper';
import { frameSize, IMAGE_FRAMES, inferFrame, limitText, type ImageFrame } from '../core/imageFrames';
import { geometryOf } from '../core/scene';
import { SHAPE_DEFS } from '../core/shapes2d';
import { useStore } from '../core/store';
import { GLOBAL_TOOLS, SHAPE_LINE_TOOLS, TOOLS, TOOL_BY_ID, type ToolGroup } from '../core/tools';
import type { AnchorKey, ShapeInstance } from '../core/types';
import { ShapeIcon } from './ShapeIcon';
import { Tooltip } from './Tooltip';

const SHAPE_FAMILIES = ['Triangles', 'Quadrilaterals', 'Polygons & circle', '3D solids', 'Axes', 'Charts', 'Lines', 'Mechanics'] as const;

function Section({ title, children, open: o = true, count, tip }: { title: string; children: React.ReactNode; open?: boolean; count?: number; tip?: string }) {
  const [open, setOpen] = useState(o);
  const head = (
      <button className="sec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`chev ${open ? 'open' : ''}`}>›</span>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </button>
  );
  return (
    <section className="sec">
      {tip ? <Tooltip tip={tip}>{head}</Tooltip> : head}
      {open && <div className="sec-body">{children}</div>}
    </section>
  );
}


const TOOL_GROUPS: ToolGroup[] = ['Points', 'Lines', 'Circle', 'Marks'];
const ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180];

/** Title of the options box of each tool that has options. */
const OPTION_TITLES: Record<string, string> = {
  'rel-point': 'Direction & distance',
  segment: 'Line style',
  perp: 'Foot placement',
  altitude: 'Foot placement',
  extend: 'Extension',
  mark: 'Mark style',
  'free-point': 'Construction plane',
  'perp-at': 'Construction plane',
  median: 'Triangle face',
  bisector: 'Face angle',
  arc:'Arc shape',
  'draw-arc':'Circular line',
  polyline:'Polyline',
  'polyline-curve':'Polyline',
  'force-line':'Force line',
  'draw-force':'Force',
  'attach-wall':'Wall hatching',
  'attach-hinge':'Attachment size',
};

/** Options of the active tool, shown right under the tool group the tool belongs to. */
function ToolOptions({ group }: { group: ToolGroup }) {
  const tool = useStore((s) => s.tool);
  const o = useStore((s) => s.toolOpts);
  const set = useStore.getState().setToolOpts;
  const shape=useStore(s=>s.shapes.find(q=>q.id===s.selectedId)??s.shapes[0]);
  const hasSolids=useStore(s=>s.shapes.some(q=>!!q.solid));
  const faces=shape?.solid?geometryOf(shape).solid!.faces:[];
  if (!tool || !OPTION_TITLES[tool] || TOOL_BY_ID[tool].group !== group) return null;
  return (
    <div className="tool-opts">
      <div className="tool-opts-title">{OPTION_TITLES[tool]}</div>
      {hasSolids&&['rel-point','free-point','perp-at'].includes(tool)&&
        <Tooltip tip="Directions and distances use the solid’s axes. Free points lie on this plane through its centre.">
          <label><span>3D construction plane</span><select aria-label="3D construction plane" value={o.plane} onChange={e=>set({plane:e.target.value as 'xy'|'xz'|'yz'})}><option value="xy">XY — width / height</option><option value="xz">XZ — width / depth (base)</option><option value="yz">YZ — height / depth</option></select></label>
        </Tooltip>}
      {hasSolids&&['altitude','median','bisector'].includes(tool)&&
        <Tooltip tip="Median and altitude need a triangular face. Select the solid first to list its faces.">
          <label><span>3D face</span><select aria-label="3D face" value={o.face} onChange={e=>set({face:Number(e.target.value)})}><option value={-1}>Auto — face at picked vertex</option>{faces.map((f,i)=><option key={i} value={i}>{i+1}: {f.map(v=>shape?.names[v]).join('')}</option>)}</select></label>
        </Tooltip>}
      {tool === 'rel-point' && (
        <>
          <div className="chips">
            {ANGLES.map((a) => (
              <button key={a} className={`chip sm ${o.angle === a ? 'on' : ''}`} onClick={() => set({ angle: a })}>{a}°</button>
            ))}
            <Tooltip tip="Flip the sign: 45° ↔ −45° (measured from the horizontal, counter-clockwise)" side="bottom">
              <button className="chip sm" onClick={() => set({ angle: -o.angle })}>±</button>
            </Tooltip>
          </div>
          <div className="row2">
            <label><span>Angle</span><input type="number" value={o.angle} onChange={(e) => set({ angle: Number(e.target.value) || 0 })} /></label>
            <label><span>Dist.</span><input type="number" min={0} step="any" value={o.dist} disabled={o.hit} onChange={(e) => set({ dist: Number(e.target.value) })} /></label>
          </div>
          <Tooltip tip="Or click the destination on the canvas. Hold Shift while moving to snap to 0° / 45° / 90° / 135° …">
            <label className="check"><input type="checkbox" checked={o.hit} onChange={(e) => set({ hit: e.target.checked })} />Stop where it meets the figure</label>
          </Tooltip>
        </>
      )}
      {(tool === 'segment'||tool==='force-line'||tool==='draw-force') && (
        <>
        <label className="check"><input type="checkbox" checked={o.dashed} onChange={(e) => set({ dashed: e.target.checked })} />Dashed</label>
        {tool==='segment'&&<label><span>Arrow</span><select value={o.arrow} onChange={e=>set({arrow:e.target.value as typeof o.arrow})}><option value="none">No arrow</option><option value="start">At start</option><option value="end">At end</option><option value="both">Both ends</option><option value="middle">In the middle</option></select></label>}
        {(tool==='force-line'||tool==='draw-force')&&<>
          <label><span>Arrow</span><select value={o.arrow} onChange={e=>set({arrow:e.target.value as typeof o.arrow})}><option value="none">Auto</option><option value="end">At the end</option><option value="middle">In the middle</option><option value="start">At the start</option><option value="both">Both ends</option></select></label>
          <Tooltip tip="Hold Shift after the start to snap to 0° / 45° / 90° and, on a body sitting on an incline, a line parallel to the slope. Auto puts the arrowhead in the middle for a free force, or at the end when it joins two points on the same body. You can override it here or in the inspector. Thickening the line also enlarges the arrowhead.">
            <label className="slider"><span>Force line weight <b>{o.lineWeight.toFixed(1)}×</b></span><input type="range" min={.5} max={4} step={.1} value={o.lineWeight} onChange={e=>set({lineWeight:Number(e.target.value)})}/></label>
          </Tooltip>
        </>}
        </>
      )}
      {(tool==='arc'||tool==='draw-arc')&&<><div className="chips">{([.25,.5,.75] as const).map(f=><button key={f} className={`chip sm ${o.arcFraction===f?'on':''}`} onClick={()=>set({arcFraction:f})}>{f===.25?'¼':f===.5?'½':'¾'} circle</button>)}</div><div className="chips"><button className={`chip sm ${o.arcSide===1?'on':''}`} onClick={()=>set({arcSide:1})}>Side 1</button><button className={`chip sm ${o.arcSide===-1?'on':''}`} onClick={()=>set({arcSide:-1})}>Side 2</button></div><label className="check"><input type="checkbox" checked={o.dashed} onChange={e=>set({dashed:e.target.checked})}/>Dashed</label></>}
      {(tool==='polyline'||tool==='polyline-curve')&&<><label className="check"><input type="checkbox" checked={o.dashed} onChange={e=>set({dashed:e.target.checked})}/>Dashed</label><p className="muted small">Each click adds a vertex and draws the next side. Click near the first point to close a polygon. Press Enter or Finish line to finish.</p><Tooltip tip="Click vertices in order. Press Enter or Finish line to finish."><button type="button" className="btn ghost wide" onClick={()=>useStore.getState().finishOpenTool()}>Finish line</button></Tooltip></>}
      {tool==='attach-wall'&&<><div className="chips"><button className={`chip sm ${o.hatchSide===-1?'on':''}`} onClick={()=>set({hatchSide:-1})}>Hatch left</button><button className={`chip sm ${o.hatchSide===1?'on':''}`} onClick={()=>set({hatchSide:1})}>Hatch right</button></div><label className="slider"><span>Wall height <b>{o.attachSize.toFixed(1)}</b></span><input type="range" min={1} max={10} step={.5} value={o.attachSize} onChange={e=>set({attachSize:Number(e.target.value)})}/></label></>}
      {tool==='attach-hinge'&&<label className="slider"><span>Size <b>{o.attachSize.toFixed(1)}</b></span><input type="range" min={1} max={10} step={.5} value={o.attachSize} onChange={e=>set({attachSize:Number(e.target.value)})}/></label>}
      {(tool === 'perp' || tool === 'altitude') && (
        <Tooltip tip="Off: if the foot falls outside the side, the extension is drawn dashed. On: you get an error instead.">
          <label className="check"><input type="checkbox" checked={o.requireOn} onChange={(e) => set({ requireOn: e.target.checked })} />Foot must be on the side</label>
        </Tooltip>
      )}
      {tool === 'extend' && (
        <>
          <label className="slider">
            <span>Extension length <b>{o.extendPct}%</b></span>
            <input type="range" min={10} max={100} step={5} value={o.extendPct} onChange={(e) => set({ extendPct: Number(e.target.value) })} />
          </label>
          <label className="check"><input type="checkbox" checked={o.namePoint} onChange={(e) => set({ namePoint: e.target.checked })} />Name the end point</label>
        </>
      )}
      {tool === 'angle-mark' && (
        <>
          <label><span>Label</span><input value={o.angleText} maxLength={20} placeholder="θ, α, 60° …" onChange={(e) => set({ angleText: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={o.angleFill} onChange={(e) => set({ angleFill: e.target.checked })} />Fill the sector</label>
          <ColorSwatches label="Angle colour" value={o.angleColor} onPick={(hex) => set({ angleColor: hex })} />
        </>
      )}
      {tool === 'mark' && (
        <Tooltip tip="On a side, the mark sits on the whole side; Shift marks only the clicked piece. On a circle, the mark sits where you click; Shift marks the arc between the line cuts.">
          <div>
          <div className="chips">
            <button className={`chip sm ${o.markKind === 'tick' ? 'on' : ''}`} onClick={() => set({ markKind: 'tick' })}>Equal ticks</button>
            <button className={`chip sm ${o.markKind === 'arrow' ? 'on' : ''}`} onClick={() => set({ markKind: 'arrow' })}>Parallel »</button>
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {[1, 2, 3].map((n) => (
              <button key={n} className={`chip sm ${o.markN === n ? 'on' : ''}`} onClick={() => set({ markN: n })}>{n}</button>
            ))}
          </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

const ANCHOR_LABELS: Record<AnchorKey, string> = {
  'top-left':'↖','top':'↑','top-right':'↗',left:'←',center:'•',right:'→','bottom-left':'↙',bottom:'↓','bottom-right':'↘',
};

function AnchorPad({ shape }: { shape: ShapeInstance }) {
  const points = useStore(s => s.points);
  const toggle = useStore.getState().toggleAnchor;
  const active = (key: AnchorKey) => points.some(p => p.anchor === key && p.def.t === 'local' && p.def.shape === shape.id);
  return (
    <div className="tool-opts">
      <div className="tool-opts-title">9-position points</div>
      <Tooltip tip="Show or hide a point. Off until you pick one.">
      <div className="anchor-grid" role="group" aria-label="Nine-position points">
        {ANCHOR_KEYS.map(key => (
          <button key={key} type="button" className={`chip ${active(key) ? 'on' : ''}`} aria-pressed={active(key)} title={key} onClick={() => toggle(shape.id, key)}>{ANCHOR_LABELS[key]}</button>
        ))}
      </div>
      </Tooltip>
    </div>
  );
}

const ROUND_SOLIDS = ['solid-cylinder', 'solid-cone', 'solid-sphere'];
function toolsFor(shape: ShapeInstance): string[] {
  const def = SHAPE_DEFS.find((d) => d.id === shape.defId);
  const points = ['side-point', 'free-point', 'rel-point'];
  const lines = ['segment', 'arc', 'perp', 'perp-at', 'bisector', 'parallel'];
  if (!def || def.kind === 'axes' || def.kind === 'chart' || def.kind === 'caption') return [];
  const mechExtras=['force-line',...(['mech-ground'].includes(shape.defId)?['attach-wall','attach-particle','attach-block']:[]),...(['mech-rod'].includes(shape.defId)?['attach-hinge','attach-particle','attach-block']:[]),...(['mech-wedge'].includes(shape.defId)?['attach-particle','attach-block']:[])];
  if(def.kind==='mechanics'){
    const geo=geometryOf(shape);
    const list = [...points,...(geo.points.length>1?['midpoint','extend','mark']:[]),...lines,...(geo.circle?['radius','diameter','tangent']:[]),...mechExtras];
    return list.includes('mark') ? list : [...list, 'mark'];
  }
  if (def.kind === 'circle') return [...points, 'segment','arc', 'perp', 'perp-at', 'radius', 'diameter', 'tangent', 'force-line', 'mark'];
  const withSides = [...points, 'midpoint', ...lines, 'extend', 'mark', 'force-line'];
  if (def.kind === 'triangle') return [...withSides, 'altitude', 'median'];
  if (def.kind === 'solid') {
    const faces = geometryOf(shape).solid?.faces ?? [];
    return [...withSides, ...(faces.some((f) => f.length === 3) ? ['altitude', 'median'] : []), ...(ROUND_SOLIDS.includes(shape.defId) ? ['radius', 'diameter', 'tangent'] : [])];
  }
  return withSides;
}

export function Sidebar() {
  const addShape = useStore((s) => s.addShape);
  const customMode=useStore(s=>s.workspaceMode==='custom');
  const canvas = useStore((s) => s.canvas);
  const setCanvas = useStore((s) => s.setCanvas);
  const style = useStore((s) => s.style);
  const setStyle = useStore((s) => s.setStyle);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const selected=useStore(s=>s.shapes.find(q=>q.id===s.selectedId));
  const captionCount=useStore(s=>s.shapes.filter(q=>q.caption).length);
  const allowed=selected?toolsFor(selected):[];
  const allowedKey=allowed.join(',');
  const [shapeFamily,setShapeFamily]=useState<string>('Quadrilaterals');
  useEffect(()=>{if(tool&&!GLOBAL_TOOLS.includes(tool)&&!allowedKey.split(',').includes(tool))setTool(null);},[tool,allowedKey,setTool]);
  const [cw, setCw] = useState<string | null>(null);
  const [ch, setCh] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pane, setPane] = useState<'setup' | 'shapes' | 'tools'>(selected ? 'tools' : 'shapes');
  useEffect(() => { if (tool) setPane('tools'); }, [tool]);
  const byPick = IMAGE_FRAMES.find((f) => f.id === pickedId) ?? null;
  const inferred = inferFrame(canvas.w, canvas.h);
  const picked: ImageFrame = byPick && byPick.orient === inferred.orient ? byPick : inferred;

  const applySize = () => {
    const w = Math.round(Number(cw ?? canvas.w));
    const h = Math.round(Number(ch ?? canvas.h));
    if (!Number.isFinite(w) || !Number.isFinite(h)) { setCw(null); setCh(null); return; }
    const prefer = h !== canvas.h && w === canvas.w ? 'h' : 'w';
    const next = frameSize(picked, w, h, prefer);
    if (next.w !== canvas.w || next.h !== canvas.h) setCanvas(next);
    setCw(null);
    setCh(null);
  };
  const startLineTool = (id: string) => { const next=tool===id?null:id; setTool(next); if(next) setPane('tools'); };
  const lineTiles = (
    <div className="grid">
      <Tooltip tip={TOOL_BY_ID.segment.tip}>
        <button className={`tile ${tool==='segment'?'on':''}`} onClick={()=>startLineTool('segment')}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M4 18 L20 6"/></svg>
          <span>Line</span>
        </button>
      </Tooltip>
      <Tooltip tip={TOOL_BY_ID['draw-force'].tip}>
        <button className={`tile ${tool==='draw-force'?'on':''}`} onClick={()=>startLineTool('draw-force')}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path d="M3 12h13"/>
            <path d="M13 7l7 5-7 5z" fill="currentColor" stroke="none"/>
          </svg>
          <span>Force</span>
        </button>
      </Tooltip>
      <Tooltip tip={TOOL_BY_ID['draw-arc'].tip}>
        <button className={`tile ${tool==='draw-arc'?'on':''}`} onClick={()=>startLineTool('draw-arc')}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M5 18 A10 10 0 0 1 19 8"/></svg>
          <span>Circular line</span>
        </button>
      </Tooltip>
      <Tooltip tip={TOOL_BY_ID.polyline.tip}>
        <button className={`tile ${tool==='polyline'?'on':''}`} onClick={()=>startLineTool('polyline')}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M4 18 L9 8 L15 14 L20 6"/></svg>
          <span>Free poly line (straight)</span>
        </button>
      </Tooltip>
      <Tooltip tip={TOOL_BY_ID['polyline-curve'].tip}>
        <button className={`tile ${tool==='polyline-curve'?'on':''}`} onClick={()=>startLineTool('polyline-curve')}>
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M4 18 C8 8, 12 16, 20 6"/></svg>
          <span>Free poly line (curved)</span>
        </button>
      </Tooltip>
    </div>
  );

  const chooseFrame = (f: ImageFrame) => { setPickedId(f.id); setCanvas({ w: f.w, h: f.h }); };
  const canvasBlock = (
    <>
      <div className="chips canvas-orients">
        {IMAGE_FRAMES.map((f) => (
          <Tooltip key={f.id} tip={`${f.w} × ${f.h} px · max ${f.maxW} × ${f.maxH}`} side="bottom">
            <button type="button" className={`chip ${picked.id === f.id ? 'on' : ''}`} aria-pressed={picked.id === f.id} onClick={() => chooseFrame(f)}>
              {f.label}
            </button>
          </Tooltip>
        ))}
      </div>
      <p className="muted small canvas-limit">{limitText(picked)}</p>
      <div className="row2">
        <label>
          <span>W <small className="unit">px</small></span>
          <input type="number" aria-label="Canvas width in pixels" min={200} max={picked.maxW} value={cw ?? canvas.w} onChange={(e) => setCw(e.target.value)} onBlur={applySize} onKeyDown={(e) => e.key === 'Enter' && applySize()} />
        </label>
        <label>
          <span>H <small className="unit">px</small></span>
          <input type="number" aria-label="Canvas height in pixels" min={200} max={picked.maxH} value={ch ?? canvas.h} onChange={(e) => setCh(e.target.value)} onBlur={applySize} onKeyDown={(e) => e.key === 'Enter' && applySize()} />
        </label>
      </div>
    </>
  );
  const styleBlock = (
    <>
      <label className="slider locked">
        <span>Line weight <b>{STROKE_PT} pt</b></span>
        <input type="range" min={0.4} max={4} step={0.01} value={ptToPx(STROKE_PT)} disabled aria-disabled="true" />
      </label>
      <label className="slider locked">
        <span>Label size <b>{FONT_PT} pt</b></span>
        <input type="range" min={8} max={32} step={0.25} value={ptToPx(FONT_PT)} disabled aria-disabled="true" />
      </label>
      <label className="check">
        <input type="checkbox" checked={style.italicLetters} onChange={(e) => setStyle({ italicLetters: e.target.checked })} />
        Italic English letters
      </label>
    </>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist" aria-label="Left panel">
        <button type="button" role="tab" className={`sidebar-tab ${pane==='setup'?'on':''}`} aria-selected={pane==='setup'} onClick={()=>setPane('setup')}>Setup</button>
        <button type="button" role="tab" className={`sidebar-tab ${pane==='shapes'?'on':''}`} aria-selected={pane==='shapes'} onClick={()=>setPane('shapes')}>Shapes</button>
        <button type="button" role="tab" className={`sidebar-tab ${pane==='tools'?'on':''}`} aria-selected={pane==='tools'} onClick={()=>setPane('tools')}>Constructions</button>
      </div>
      <div className="sidebar-scroll">
        {pane==='setup' && (
          <>
            <Section title="Canvas">{canvasBlock}</Section>
            <Section title="Style">{styleBlock}</Section>
          </>
        )}

        {pane==='shapes' && (
          <>
            <Tooltip tip="Mix any categories in one drawing.">
              <div className="shape-families" aria-label="Shape families">{SHAPE_FAMILIES.map(g=><button key={g} className={`shape-family ${g===shapeFamily?'on':''}`} aria-pressed={g===shapeFamily} onClick={()=>setShapeFamily(g)}>{g}<span>{g==='Lines'?SHAPE_LINE_TOOLS.length:SHAPE_DEFS.filter(d=>d.group===g&&!d.hidden).length}</span></button>)}</div>
            </Tooltip>
            {shapeFamily==='Lines'?lineTiles:shapeFamily==='Mechanics'?<div className="grid">{SHAPE_DEFS.filter(d=>d.group==='Mechanics'&&!d.hidden).map(d=><Tooltip key={d.id} tip={d.tip}><button className="tile" onClick={()=>addShape(d.id)}><ShapeIcon defId={d.id}/><span>{d.label}</span></button></Tooltip>)}</div>:<div className="grid">{SHAPE_DEFS.filter(d=>d.group===shapeFamily&&!d.hidden).map(d=><Tooltip key={d.id} tip={d.tip}><button className="tile" onClick={()=>addShape(d.id)}><ShapeIcon defId={d.id}/><span>{d.label}</span></button></Tooltip>)}</div>}
            <Section title="Texts" count={captionCount} open={false} tip="Free notes on the figure. Arabic and English are written separately. Math in $...$ like $\frac{\text{Area}}{5}$. Looped alif is \alef."><TextsPanel /></Section>
            {!customMode&&<Section title="Custom shapes" open={false} tip="Choose a saved figure to add an independent copy. Create and manage them in Custom shapes studio."><CustomShapePicker /></Section>}
          </>
        )}

        {pane==='tools' && (
          selected&&!selected.caption ? (
            selected.axes ? <AxesConstructions key={selected.id} s={selected}/> : <>
              {canHaveAnchors(selected)&&<AnchorPad shape={selected}/>}
              {TOOL_GROUPS.map((g) => {
                const list=TOOLS.filter((t) => t.group === g && (allowed.includes(t.id)||(GLOBAL_TOOLS.includes(t.id)&&t.id===tool)));
                if(!list.length)return null;
                return (
                <div key={g} className="tool-group">
                  <div className="tool-group-title">{g}</div>
                  <div className="grid">
                    {list.map((t) => (
                      <Tooltip key={t.id} tip={t.tip}>
                        <button className={`tile tool ${tool === t.id ? 'on' : ''}`} onClick={() => setTool(tool === t.id ? null : t.id)}>
                          <span>{t.label}</span>
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                  <ToolOptions group={g} />
                </div>
                );
              })}
            </>
          ) : tool && GLOBAL_TOOLS.includes(tool) ? (
            <div className="tool-group">
              <ToolOptions group={TOOL_BY_ID[tool].group} />
            </div>
          ) : selected?.caption ? <p className="muted small">Text has no constructions. Drag, scale or rotate it on the image. Edit the words in the bar above the drawing.</p>
          : <p className="muted small">Select a figure first, then its constructions appear here.</p>
        )}
      </div>
    </aside>
  );
}
