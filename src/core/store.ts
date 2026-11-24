import { validateAxes } from './axes';
import { create } from 'zustand';
import { appendScene } from './sceneClone';
import { localAnchors } from './anchors';
import { DEFAULT_CANVAS, DEFAULT_STYLE, mergeShapePatch, newCaptionShape, newShape, placeBelow, placeOnTop, syncArrays, uid } from './scene';
import { DEFAULT_OPTS, stepAccepts, stepHint, TOOL_BY_ID, type Target, type ToolOpts } from './tools';
import type { AnchorKey, DrawingKit, Lang, ProjectSettings, Vec, CanvasSize, ConLine, ConMark, ConPoint, FigureCaption, Ref, SceneData, ShapeInstance, StyleSettings, AxesTool } from './types';
import { lockedPaperInk } from './paper';
import { cropViewBox } from './crop';
import { growRoom } from './imageFrames';
import './crop';
import { fitScene, followShape, ownerOfDef, ownerOfRef, pruneUnresolved } from './world';

type Snapshot = SceneData;

export interface Notice {
  kind: 'error' | 'info';
  text: string;
  /** monotonically increasing so identical messages re-trigger the timer */
  n: number;
}

export interface DrawingBackup {
  scene:SceneData;
  settings:ProjectSettings;
  past:SceneData[];future:SceneData[];selectedId:string|null;repeatTool:boolean;toolOpts:ToolOpts;
}
interface Store extends SceneData {
  workspaceMode:'drawing'|'custom';
  drawingKit: DrawingKit;
  setDrawingKit: (kit: DrawingKit) => void;
  drawingBackup:DrawingBackup|null;
  selectedId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  theme: 'light' | 'dark';
  /** Slide / question id used for file naming until the real format is decided. */
  fileName: string;

  /** Lock: when true no label can be dragged by accident. */
  lockAll: boolean;
  separateLabels: boolean;
  setSeparateLabels: (v: boolean) => void;
  moveLabel: (kind: "shape" | "point" | "line", id: string, key: string, lang: Lang, delta: Vec) => void;
  loadProject: (scene: SceneData, settings: ProjectSettings) => void;
  /** Grow the canvas on one side without moving the ink. */
  growCanvas: (dir: 'left' | 'right' | 'up' | 'down', amount: number) => void;
  /** Per-language crop applied by Fit; Arabic and English can differ because their labels differ. */
  langView: Partial<Record<Lang, { x: number; y: number; w: number; h: number }>> | null;
  tool: string | null;
  axesTool:AxesTool|null;
  repeatTool: boolean;
  setRepeatTool: (value: boolean) => void;
  cancelInteraction: () => void;
  toolOpts: ToolOpts;
  picks: Target[];
  notice: Notice | null;

  addShape: (defId: string) => void;
  addCaption: (caption: FigureCaption) => void;
  /** `new` = composer for a fresh note; a shape id = edit that caption. */
  textComposer: 'new' | string | null;
  setTextComposer: (v: 'new' | string | null) => void;
  insertScene: (scene: SceneData) => void;
  removeShape: (id: string) => void;
  duplicateShape: (id: string) => void;
  select: (id: string | null) => void;
  /** Move a layer forward (+1, drawn later) or backward (-1). */
  reorderShape: (id: string, dir: 1 | -1) => void;
  /** discrete edit: pushes history, optionally re-fits the view */
  patchShape: (id: string, patch: Partial<ShapeInstance>, opts?: { fit?: boolean }) => void;
  /** begin a drag: push one history entry */
  beginDrag: () => void;
  /** during a drag: no history, no re-fit */
  dragShape: (id: string, patch: Partial<ShapeInstance>) => void;
  dragPointLabel: (id: string, nudge: { x: number; y: number }) => void;
  dragLineLabel: (id: string, nudge: { x: number; y: number }) => void;
  setCanvas: (c: CanvasSize) => void;
  setStyle: (patch: Partial<StyleSettings>) => void;
  fit: () => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  setTheme: (t: 'light' | 'dark') => void;
  setFileName: (n: string) => void;

  setLockAll: (v: boolean) => void;
  toggleShapeLock: (id: string) => void;
  /** Put every dragged label back to its default place (one shape, or all). */
  resetLabels: (shapeId?: string) => void;
  resetLabel: (key: { shape?: string; key?: string; point?: string; line?: string; lang?: Lang }) => void;

  setTool: (id: string | null) => void;
  setToolOpts: (p: Partial<ToolOpts>) => void;
  pickTarget: (t: Target) => void;
  finishOpenTool: () => void;
  ensureLocalPoint: (shapeId: string, x: number, y: number) => { p: string };
  notify: (kind: 'error' | 'info', text: string) => void;
  clearNotice: () => void;

  patchPoint: (id: string, patch: Partial<ConPoint>) => void;
  patchLine: (id: string, patch: Partial<ConLine>) => void;
  patchMark: (id: string, patch: Partial<Extract<ConMark, { kind: 'attachment' }>>) => void;
  toggleAnchor: (shapeId: string, key: AnchorKey) => void;
  ensureAnchor: (shapeId: string, key: AnchorKey) => Ref | null;
  removePoint: (id: string) => void;
  removeLine: (id: string) => void;
  removeMark: (id: string) => void;
  /** Bulk removal of constructions (shapes are never touched). All are undoable. */
  clearConstructions: () => void;
  clearPoints: () => void;
  clearLines: () => void;
  clearMarks: () => void;
}

const snap = (s: SceneData): Snapshot =>
  JSON.parse(
    JSON.stringify({
      canvas: s.canvas,
      shapes: s.shapes,
      points: s.points,
      lines: s.lines,
      marks: s.marks,
      style: s.style,
      viewScale: s.viewScale,
    }),
  );

const initial: SceneData = {
  canvas: DEFAULT_CANVAS,
  shapes: [],
  points: [],
  lines: [],
  marks: [],
  style: DEFAULT_STYLE,
  viewScale: 40,
};

let noticeCounter = 0;

export const useStore = create<Store>((set, get) => {
  const push = () => {
    const s = get();
    set({ past: [...s.past.slice(-99), snap(s)], future: [] });
  };
  const data = (): SceneData => {
    const s = get();
    return { canvas: s.canvas, shapes: s.shapes, points: s.points, lines: s.lines, marks: s.marks, style: s.style, viewScale: s.viewScale };
  };
  const notice = (kind: 'error' | 'info', text: string): Notice => ({ kind, text, n: ++noticeCounter });
  const commitTool = (picks: Target[]) => {
    const st = get();
    const tool = st.tool ? TOOL_BY_ID[st.tool] : null;
    if (!tool) return;
    const res = tool.run(data(), picks, st.toolOpts);
    if (!res.ok) {
      set({ picks: [], notice: notice('error', res.error) });
      return;
    }
    const added = res.shapes ?? [];
    const changed = !!(res.points.length || res.lines.length || res.marks.length || res.removeMarks.length || added.length || res.showCentre);
    if (changed) push();
    const d = data();
    let shapes = d.shapes;
    if (res.showCentre) shapes = shapes.map((s) => (s.id === res.showCentre ? { ...s, center: { ...s.center, show: true } } : s));
    const next = {
      ...d,
      shapes: [...shapes, ...added],
      points: [...d.points, ...res.points],
      lines: [...d.lines, ...res.lines],
      marks: [...d.marks.filter((m) => !res.removeMarks.includes(m.id)), ...res.marks],
    };
    const keepTool = st.repeatTool;
    set({
      ...(changed ? next : {}),
      selectedId: added[added.length - 1]?.id ?? get().selectedId,
      picks: [],
      tool: keepTool ? st.tool : null,
      notice: notice('info', res.info ? res.info : `${tool.label}: done.${keepTool ? ' '+tool.prompts[0] : ' Select / move mode.'}`),
    });
  };

  return {
    ...initial,
    workspaceMode:'drawing',
    drawingKit: 'geometry',
    setDrawingKit: drawingKit => set({ drawingKit }),
    drawingBackup:null,
    selectedId: null,
    past: [],
    future: [],
    theme: 'light',
    fileName: 'figure',
    lockAll: true,
    separateLabels: false,
    setSeparateLabels: (separateLabels) => set({ separateLabels }),
    loadProject: (scene, settings) => {
      push();
      set({ ...scene, style: lockedPaperInk(scene.style), ...settings, selectedId: null, tool: null, axesTool:null, picks: [], notice: null, textComposer: null, langView: null });
    },
    moveLabel: (kind, id, key, lang, delta) => {
      const langs: Lang[] = get().separateLabels ? [lang] : ["ar", "en"];
      if (kind === "shape") set({ shapes: get().shapes.map(s => {
        if (s.id !== id) return s;
        const nudgeByLang = { ...s.nudgeByLang };
        for (const l of langs) {
          const n = nudgeByLang[l]?.[key] ?? s.nudge[key] ?? { x: 0, y: 0 };
          nudgeByLang[l] = { ...nudgeByLang[l], [key]: { x: n.x + delta.x, y: n.y + delta.y } };
        }
        return { ...s, nudgeByLang };
      }) });
      else {
        const update = <T extends ConPoint | ConLine>(item: T): T => {
          if (item.id !== id) return item;
          const nudgeByLang = { ...item.nudgeByLang };
          for (const l of langs) {
            const n = nudgeByLang[l] ?? item.nudge ?? { x: 0, y: 0 };
            nudgeByLang[l] = { x: n.x + delta.x, y: n.y + delta.y };
          }
          return { ...item, nudgeByLang };
        };
        if (kind === "point") set({ points: get().points.map(update) });
        else set({ lines: get().lines.map(update) });
      }
    },
    tool: null,
    axesTool:null,
    repeatTool: false,
    setRepeatTool: repeatTool => set({repeatTool}),
    textComposer: null,
    setTextComposer: (textComposer) => set({ textComposer }),
    cancelInteraction: () => set({tool:null,axesTool:null,picks:[],selectedId:null,notice:null,textComposer:null}),
    toolOpts: DEFAULT_OPTS,
    picks: [],
    notice: null,
    langView: null,

    insertScene: (scene) => {
      const next=appendScene(data(),scene);
      push();
      set({...next,selectedId:next.shapes[next.shapes.length-1]?.id??null,tool:null,axesTool:null,picks:[],langView:null});
    },
    addShape: (defId) => {
      push();
      const d = data();
      const fresh = placeOnTop(d.shapes, newShape(defId));
      if (!d.shapes.length) {
        const next = fitScene({ ...d, shapes: [fresh] });
        set({ ...next, selectedId: fresh.id, tool: null, axesTool:null, picks: [], langView: null });
      } else set({ shapes: [...d.shapes, fresh], selectedId: fresh.id, tool: null, axesTool:null, picks: [], langView: null });
    },
    addCaption: (caption) => {
      const ar=caption.ar.slice(0,4000),en=caption.en.slice(0,4000);
      if(!ar.trim()&&!en.trim()){set({notice:notice('error','Write Arabic or English text first.')});return;}
      push();
      const d=data(),fresh=placeBelow(d.shapes,newCaptionShape({ar,en}));
      // Always re-fit: a note that sits under the drawing used to land outside the canvas (invisible, unclickable) when the scene already had shapes.
      const next=fitScene({...d,shapes:[...d.shapes,fresh]});
      set({...next,selectedId:fresh.id,tool:null,axesTool:null,picks:[],textComposer:fresh.id});
    },
    removeShape: (id) => {
      push();
      const d = data();
      const next = pruneUnresolved({ ...d, shapes: d.shapes.filter((s) => s.id !== id) });
      set({ ...next, selectedId: get().selectedId === id ? null : get().selectedId, axesTool:get().axesTool?.shape===id?null:get().axesTool, picks: [], textComposer: get().textComposer === id ? null : get().textComposer });
    },
    duplicateShape: (id) => {
      const d = data();
      const src = d.shapes.find((s) => s.id === id);
      if (!src) return;
      push();
      const copy: ShapeInstance = JSON.parse(JSON.stringify({ ...src, id: uid(), sit: undefined }));
      const placed = placeOnTop(d.shapes, copy);
      set({ shapes: [...d.shapes, placed], selectedId: placed.id, axesTool:null, tool:null, picks:[] });
    },
    select: (id) => set({ selectedId: id, axesTool:get().axesTool?.shape===id?get().axesTool:null }),
    reorderShape: (id, dir) => {
      const shapes = [...get().shapes];
      const i = shapes.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= shapes.length) return;
      push();
      const [item] = shapes.splice(i, 1);
      shapes.splice(j, 0, item);
      set({ shapes });
    },
    patchShape: (id, patch, opts) => {
      const candidate=get().shapes.find(s=>s.id===id);if(candidate?.axes)validateAxes({...candidate,...patch});
      push();
      const d = data();
      const old = d.shapes.find(s => s.id === id);
      const topologyChanged = (!!old?.solid || !!old?.path) && patch.params?.n !== undefined && patch.params.n !== old.params.n;
      const shapes = d.shapes.map((s) => (s.id === id ? syncArrays(mergeShapePatch(s, { ...patch, ...(topologyChanged ? { sides: [], nudge: {}, nudgeByLang: undefined } : {}) })) : s));
      let next: SceneData = { ...d, shapes, points: followShape(d, id, old, patch) };
      if (topologyChanged) {
        next = pruneUnresolved({ ...next,
          points: d.points.filter(p => ownerOfDef(d, p.def) !== id),
          lines: d.lines.filter(l => ownerOfRef(d, l.a) !== id && ownerOfRef(d, l.b) !== id),
          marks: d.marks.filter(m => ('circle' in m ? m.circle !== id : ownerOfRef(d, m.a) !== id && ownerOfRef(d, m.b) !== id)),
        });
      } else next = pruneUnresolved(next);
      set(next);
      if (topologyChanged) get().notify('info', 'Base sides changed: dependent constructions and edge labels were reset. Ctrl+Z restores them.');
    },
    beginDrag: () => push(),
    dragShape: (id, patch) => {
      const d = data();
      const old = d.shapes.find((s) => s.id === id);
      set({
        shapes: d.shapes.map((s) => (s.id === id ? mergeShapePatch(s, patch) : s)),
        points: followShape(d, id, old, patch),
      });
    },
    ensureLocalPoint: (shapeId, x, y) => {
      const d = data();
      const hit = d.points.find(p => p.def.t === 'local' && p.def.shape === shapeId && Math.hypot(p.def.x - x, p.def.y - y) < 1e-3);
      if (hit) return { p: hit.id };
      const p: ConPoint = { id: uid(), name: '', showLabel: false, dot: false, def: { t: 'local', shape: shapeId, x, y } };
      set({ points: [...d.points, p] });
      return { p: p.id };
    },
    dragPointLabel: (id, nudge) => set({ points: get().points.map((p) => (p.id === id ? { ...p, nudge } : p)) }),
    dragLineLabel: (id, nudge) => set({ lines: get().lines.map((l) => (l.id === id ? { ...l, nudge } : l)) }),
    setCanvas: (canvas) => {
      push();
      set({ canvas, langView: null });
    },
    setStyle: (patch) => {
      push();
      const d = data();
      const style = lockedPaperInk({ ...d.style, ...patch });
      set(patch.fill !== undefined ? fitScene({ ...d, style }) : { style });
    },
    growCanvas: (dir, amount) => {
      const n = Math.round(amount);
      if (!Number.isFinite(n) || n < 1) {
        set({ notice: notice('error', 'Enter how many pixels to add.') });
        return;
      }
      const d = data();
      const { room, max, axis } = growRoom(d.canvas.w, d.canvas.h, dir);
      if (room <= 0) {
        set({ notice: notice('error', `This ${axis} is already at the maximum (${max} px).`) });
        return;
      }
      if (n > room) {
        set({ notice: notice('error', `The most you can add is ${room} px (maximum ${max} px ${axis}).`) });
        return;
      }
      const vs = d.viewScale || 1;
      let w = d.canvas.w, h = d.canvas.h, deltaSx = 0, deltaSy = 0;
      if (dir === 'left' || dir === 'right') {
        const w2 = w + n;
        deltaSx = (dir === 'right' ? w / 2 - w2 / 2 : w / 2 + n - w2 / 2) / vs;
        w = w2;
      } else {
        const h2 = h + n;
        deltaSy = (dir === 'down' ? n / 2 : -n / 2) / vs;
        h = h2;
      }
      push();
      set({
        canvas: { w, h },
        shapes: d.shapes.map((s) => ({ ...s, offset: { x: s.offset.x + deltaSx, y: s.offset.y + deltaSy } })),
        points: d.points.map((p) => p.def.t === 'world' ? { ...p, def: { ...p.def, x: p.def.x + deltaSx, y: p.def.y + deltaSy } } : p),
        langView: null,
      });
    },
    fit: () => {
      const d = data();
      const ar = cropViewBox(d, 'ar');
      const en = cropViewBox(d, 'en');
      push();
      set({ langView: { ...(ar ? { ar } : {}), ...(en ? { en } : {}) } });
    },
    undo: () => {
      const { past, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ ...prev, axesTool:null, past: past.slice(0, -1), future: [snap(data()), ...future], picks: [], langView: null });
    },
    redo: () => {
      const { past, future } = get();
      if (!future.length) return;
      const nxt = future[0];
      set({ ...nxt, axesTool:null, past: [...past, snap(data())], future: future.slice(1), picks: [], langView: null });
    },
    clearAll: () => {
      push();
      set({ shapes: [], points: [], lines: [], marks: [], selectedId: null, axesTool:null, picks: [], textComposer: null, langView: null });
    },
    setTheme: (theme) => set({ theme }),
    setFileName: (fileName) => set({ fileName }),

    setLockAll: (lockAll) => set({ lockAll }),
    toggleShapeLock: (id) => {
      push();
      set({ shapes: get().shapes.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)) });
    },
    resetLabels: (shapeId) => {
      push();
      const d = data();
      const owner = (id: string | undefined) => !shapeId || id === shapeId;
      // constructions are attached to whichever shape their first reference belongs to
      const ownerOf = (id: string) => ownerCache(d, id);
      set({
        shapes: d.shapes.map((s) => (owner(s.id) ? { ...s, nudge: {}, nudgeByLang: undefined } : s)),
        points: d.points.map((p) => (owner(ownerOf(p.id)) ? { ...p, nudge: undefined, nudgeByLang: undefined } : p)),
        lines: d.lines.map((l) => (owner(ownerOfRef(d, l.a)) ? { ...l, nudge: undefined, nudgeByLang: undefined } : l)),
      });
      get().notify('info', 'Labels are back at their default positions.');
    },
    resetLabel: ({ shape, key, point, line, lang }) => {
      push();
      const local = get().separateLabels && lang;
      if (shape && key) set({ shapes: get().shapes.map(s => {
        if (s.id !== shape) return s;
        if (local) return { ...s, nudgeByLang: { ...s.nudgeByLang, [local]: { ...s.nudgeByLang?.[local], [key]: { x: 0, y: 0 } } } };
        return { ...s, nudge: Object.fromEntries(Object.entries(s.nudge).filter(([k]) => k !== key)), nudgeByLang: Object.fromEntries(Object.entries(s.nudgeByLang ?? {}).map(([l, ns]) => [l, Object.fromEntries(Object.entries(ns).filter(([k]) => k !== key))])) };
      }) });
      const reset = <T extends ConPoint | ConLine>(item: T): T => local ? { ...item, nudgeByLang: { ...item.nudgeByLang, [local]: { x: 0, y: 0 } } } : { ...item, nudge: undefined, nudgeByLang: undefined };
      if (point) set({ points: get().points.map(p => p.id === point ? reset(p) : p) });
      if (line) set({ lines: get().lines.map(l => l.id === line ? reset(l) : l) });
    },

    setTool: (tool) => set({ tool, axesTool:null, picks: [], notice: tool ? notice('info', stepHint(TOOL_BY_ID[tool].steps[0])) : null }),
    finishOpenTool: () => {
      const st = get();
      const tool = st.tool ? TOOL_BY_ID[st.tool] : null;
      if (!tool?.openEnded) return;
      commitTool(st.picks);
    },
    setToolOpts: (p) => set({ toolOpts: { ...get().toolOpts, ...p } }),
    notify: (kind, text) => set({ notice: notice(kind, text) }),
    clearNotice: () => set({ notice: null }),
    pickTarget: (t) => {
      const st = get();
      const tool = st.tool ? TOOL_BY_ID[st.tool] : null;
      if (!tool) return;
      const step = tool.steps[Math.min(st.picks.length, tool.steps.length - 1)];
      if (!stepAccepts(step, t)) {
        set({ notice: notice('error', stepHint(step)) });
        return;
      }
      const owners = (target: Target): (string | undefined)[] => target.kind === 'point' ? [ownerOfRef(st, target.ref)] : target.kind === 'line' ? [ownerOfRef(st, target.a), ownerOfRef(st, target.b)] : target.kind === 'world' ? [] : target.kind === 'circles' ? [target.shape, target.other] : [target.shape];
      const allOwners = [...st.picks, t].flatMap(owners).filter((id): id is string => !!id);
      if(allOwners.some(id=>st.shapes.find(s=>s.id===id)?.axes)){get().notify('error','Use the axes tools in the right panel.');return;}
      const hasSolid = allOwners.some(id => st.shapes.find(s => s.id === id)?.solid);
      if (hasSolid && new Set(allOwners).size !== 1) {
        set({ picks: [], notice: notice('error', 'Choose points and edges on the same solid for this construction.') });
        return;
      }
      const picks = [...st.picks, t];
      if (tool.openEnded || picks.length < tool.steps.length) {
        set({ picks, notice: notice('info', tool.prompts[Math.min(picks.length, tool.prompts.length - 1)] ?? (tool.openEnded ? 'Click the next point, or press Enter to finish.' : stepHint(tool.steps[Math.min(picks.length, tool.steps.length - 1)]))) });
        return;
      }
      commitTool(picks);
    },

    patchPoint: (id, patch) => {
      push();
      set({ points: get().points.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },
    patchLine: (id, patch) => {
      push();
      set({ lines: get().lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    },
    patchMark: (id, patch) => {
      push();
      set({ marks: get().marks.map((m) => (m.id === id && m.kind === 'attachment' ? { ...m, ...patch } : m)) });
    },
    toggleAnchor: (shapeId, key) => {
      const d = data();
      const existing = d.points.find(p => p.anchor === key && p.def.t === 'local' && p.def.shape === shapeId);
      const s = d.shapes.find(x => x.id === shapeId);
      if (!s) return;
      push();
      if (existing) set(fitScene(pruneUnresolved({ ...d, points: d.points.filter(p => p.id !== existing.id) })));
      else {
        const loc = localAnchors(s)[key];
        set({ points: [...d.points, { id: uid(), name: '', showLabel: false, dot: true, def: { t: 'local', shape: shapeId, x: loc.x, y: loc.y }, anchor: key }] });
      }
    },
    ensureAnchor: (shapeId, key) => {
      const d = data();
      const existing = d.points.find(p => p.anchor === key && p.def.t === 'local' && p.def.shape === shapeId);
      if (existing) return { p: existing.id };
      const s = d.shapes.find(x => x.id === shapeId);
      if (!s) return null;
      const loc = localAnchors(s)[key];
      const p: ConPoint = { id: uid(), name: '', showLabel: false, dot: true, def: { t: 'local', shape: shapeId, x: loc.x, y: loc.y }, anchor: key };
      set({ points: [...d.points, p] });
      return { p: p.id };
    },
    removePoint: (id) => {
      push();
      const d = data();
      set(fitScene(pruneUnresolved({ ...d, points: d.points.filter((p) => p.id !== id) })));
    },
    removeLine: (id) => {
      push();
      set({ lines: get().lines.filter((l) => l.id !== id) });
    },
    removeMark: (id) => {
      push();
      set({ marks: get().marks.filter((m) => m.id !== id) });
    },

    clearConstructions: () => {
      const d = data();
      const n = d.points.length + d.lines.length + d.marks.length;
      if (!n) return;
      push();
      set(fitScene({ ...d, points: [], lines: [], marks: [] }));
      get().notify('info', `Removed all constructions (${d.points.length} points, ${d.lines.length} lines, ${d.marks.length} marks). Ctrl+Z brings them back.`);
    },
    clearPoints: () => {
      const d = data();
      if (!d.points.length) return;
      push();
      // lines and marks that used those points can't exist without them
      const next = fitScene(pruneUnresolved({ ...d, points: [] }));
      set(next);
      const gone = d.lines.length - next.lines.length;
      const goneM = d.marks.length - next.marks.length;
      const extra = gone || goneM ? ` Also removed ${gone} line${gone === 1 ? '' : 's'} and ${goneM} mark${goneM === 1 ? '' : 's'} that used them.` : '';
      get().notify('info', `Removed ${d.points.length} point${d.points.length === 1 ? '' : 's'}.${extra} Ctrl+Z brings them back.`);
    },
    clearLines: () => {
      const d = data();
      if (!d.lines.length) return;
      push();
      set({ lines: [] });
      get().notify('info', `Removed ${d.lines.length} line${d.lines.length === 1 ? '' : 's'} (the points stay). Ctrl+Z brings them back.`);
    },
    clearMarks: () => {
      const d = data();
      if (!d.marks.length) return;
      push();
      set({ marks: [] });
      get().notify('info', `Removed ${d.marks.length} mark${d.marks.length === 1 ? '' : 's'}. Ctrl+Z brings them back.`);
    },
  };
});

function ownerCache(d: SceneData, pointId: string): string | undefined {
  const p = d.points.find((q) => q.id === pointId);
  return p ? ownerOfDef(d, p.def) : undefined;
}
