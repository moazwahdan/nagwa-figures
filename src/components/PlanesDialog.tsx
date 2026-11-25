import { useEffect, useState } from 'react';
import { DEF_BY_ID, defaultParams } from '../core/shapes2d';

/** Pick how many planes, then the type / angle / slope / hatching of each, and build them joined end to end. */
export function PlanesDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Record<string, number>) => void }) {
  const def = DEF_BY_ID['mech-planes'];
  const [p, setP] = useState<Record<string, number>>(defaultParams(def));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const set = (key: string, v: number) => setP((q) => ({ ...q, [key]: v }));
  const opts = (key: string) => def.params.find((x) => x.key === key)!.options!;
  const Sel = ({ k, label }: { k: string; label: string }) => (
    <label className="field"><span>{label}</span>
      <select value={p[k]} onChange={(e) => set(k, Number(e.target.value))}>{opts(k).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    </label>
  );
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="symbol-modal planes-modal" role="dialog" aria-label="Connected planes">
        <h2>Connected planes</h2>
        <p className="hint">Planes are joined end to end from left to right. Lengths can be changed later in the Inspector.</p>
        <Sel k="count" label="Number of planes" />
        <div className="planes-cols" style={{ gridTemplateColumns: `repeat(${p.count},minmax(0,1fr))` }}>
          {[1, 2, 3].filter((i) => i <= p.count).map((i) => (
            <div className="planes-col" key={i}>
              <b>Plane {i}</b>
              <Sel k={`t${i}`} label="Type" />
              {p[`t${i}`] === 1 && <label className="field"><span>Angle °</span><input type="number" min={5} max={85} value={p[`a${i}`]} onChange={(e) => { const v = Number(e.target.value); if (v >= 5 && v <= 85) set(`a${i}`, v); }} /></label>}
              {p[`t${i}`] === 1 && <Sel k={`s${i}`} label="Slope" />}
              {p[`t${i}`] === 2 && <Sel k={`h${i}`} label="Hatching" />}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onCreate(p)}>Create</button>
        </div>
      </div>
    </div>
  );
}
