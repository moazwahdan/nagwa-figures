import type React from 'react';
import { DEFAULT_SOLID } from '../core/shapes3d';
import { DEF_BY_ID, defaultParams } from '../core/shapes2d';

/** Tiny icon drawn from the real geometry of the shape. */
export function ShapeIcon({ defId, size = 30 }: { defId: string; size?: number }) {
  const def = DEF_BY_ID[defId];
  const geo = def.build(defaultParams(def), ['solid-sphere', 'solid-cylinder', 'solid-cone'].includes(defId) ? { ...DEFAULT_SOLID, projection: 'orthographic', angle: 25 } : undefined);
  const box = 24;
  let body: React.JSX.Element;
  if(def.kind==='chart')body=defId==='chart-pie'?<g><circle cx="12" cy="12" r="9"/><path d="M12 12V3M12 12L19.8 16.5M12 12L4.5 16"/></g>:defId==='chart-stem'?<g><path d="M10 4V21M3 8H21"/><path d="M5 12H7M5 16H7M5 20H7M13 12H15M17 12H19M13 16H15M13 20H15M17 20H19"/></g>:defId==='chart-bar'?<g><path d="M3 21H21M3 21V3"/><rect x="6" y="11" width="3.5" height="10"/><rect x="11" y="6" width="3.5" height="15"/><rect x="16" y="14" width="3.5" height="7"/></g>:defId==='chart-line'?<g><path d="M3 21H21M3 21V3M5 19L10 14L14 16L20 6"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="16" r="1"/><circle cx="20" cy="6" r="1"/></g>:<g><path d="M2 20H22"/><circle cx="6" cy="16" r="1.2"/><circle cx="12" cy="16" r="1.2"/><circle cx="12" cy="11" r="1.2"/><circle cx="12" cy="6" r="1.2"/><circle cx="18" cy="16" r="1.2"/><circle cx="18" cy="11" r="1.2"/></g>;
  else if(def.kind==='axes')body=<g><path d="M2 12H22M12 22V2M19 9L22 12L19 15M9 5L12 2L15 5" />{defId==='axes-3d'&&<path d="M12 12L3 21M3 17V21H7" />}</g>;
  else if (geo.strokes?.length || geo.circles?.length || (geo.circle && (geo.points.length || geo.open))) {
    const extras = [
      ...geo.points,
      ...(geo.strokes ?? []).flatMap(s => s.pts),
      ...(geo.circle ? [{ x: (geo.circle.cx ?? 0) - geo.circle.r, y: geo.circle.cy ?? 0 }, { x: (geo.circle.cx ?? 0) + geo.circle.r, y: geo.circle.cy ?? 0 }] : []),
      ...(geo.circles ?? []).flatMap(c => [{ x: c.cx - c.r, y: c.cy }, { x: c.cx + c.r, y: c.cy }]),
    ];
    const xs = extras.map(p => p.x), ys = extras.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1;
    const k = (box - 5) / Math.max(w, h);
    const map = (p: { x: number; y: number }) => ({ x: box / 2 + p.x * k, y: box / 2 - p.y * k });
    body = <g>
      {geo.circle && <circle cx={map({ x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }).x} cy={map({ x: geo.circle.cx ?? 0, y: geo.circle.cy ?? 0 }).y} r={geo.circle.r * k} />}
      {(geo.circles ?? []).map((c, i) => <circle key={i} cx={map({ x: c.cx, y: c.cy }).x} cy={map({ x: c.cx, y: c.cy }).y} r={c.r * k} />)}
      {(geo.strokes ?? []).map((s, i) => <polyline key={i} points={s.pts.map(p => { const q = map(p); return `${q.x},${q.y}`; }).join(' ')} fill={s.fill ? 'currentColor' : 'none'} />)}
    </g>;
  } else if (geo.circle) {
    body = <circle cx={box / 2} cy={box / 2} r={box / 2 - 2.5} />;
  } else {
    const xs = (geo.solid?.bounds ?? geo.points).map((p) => p.x);
    const ys = (geo.solid?.bounds ?? geo.points).map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const k = (box - 5) / Math.max(w, h);
    const map = (p: { x: number; y: number }) => `${box / 2 + p.x * k},${box / 2 - p.y * k}`;
    if (geo.solid) body = <g>
      {geo.solid.edges.map((e, i) => <polyline key={`e${i}`} points={[geo.points[e.a], geo.points[e.b]].map(map).join(' ')} strokeDasharray={e.hidden ? '2 2' : undefined} />)}
      {geo.solid.curves.map((c, i) => <polyline key={`c${i}`} points={c.points.map(map).join(' ')} strokeDasharray={c.hidden ? '2 2' : undefined} />)}
    </g>;
    else body = (
      <polygon
        points={geo.points.map((p) => `${box / 2 + p.x * k},${box / 2 - p.y * k}`).join(' ')}
        strokeLinejoin="round"
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      {body}
    </svg>
  );
}
