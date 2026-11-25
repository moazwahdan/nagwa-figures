import { useEffect, useRef, useState } from 'react';
import { PALETTE } from '../core/palette';

const sw = (hex: string, on: boolean) => ({ width: 18, height: 18, borderRadius: 3, background: hex, border: on ? '2px solid var(--accent)' : '1px solid #0004', padding: 0, cursor: 'pointer' } as const);

/** Colour picker: one button showing the current colour that opens the team palette. `value` undefined = default black. */
export function ColorSwatches({ value, onPick, label }: { value?: string; onPick: (hex: string | undefined) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cur = value?.toLowerCase();
  const curName = cur ? PALETTE.find((c) => c.hex.toLowerCase() === cur)?.name ?? cur : 'Black';

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(4, Math.min(r.left, window.innerWidth - 190)), top: Math.min(r.bottom + 4, window.innerHeight - 150) });
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); };
  }, [open]);

  const pick = (hex: string | undefined) => { onPick(hex); setOpen(false); };
  return (
    <div className="color-swatches" role="group" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button ref={btn} type="button" className="btn sm" aria-haspopup="true" aria-expanded={open} title={`${label}: ${curName}`} data-color-button=""
        onClick={() => setOpen(!open)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px' }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, background: cur ?? '#000', border: '1px solid #0006', display: 'inline-block' }} />
        <span style={{ fontSize: 11 }}>{curName}</span><span aria-hidden style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div ref={panel} role="listbox" aria-label={`${label} palette`}
          style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000, background: '#fff', border: '1px solid #0003', borderRadius: 6, padding: 6, boxShadow: '0 4px 16px #0003', display: 'flex', flexWrap: 'wrap', gap: 4, width: 182 }}>
          <button type="button" title="Black" aria-label="Black" aria-pressed={!cur} data-swatch="" onClick={() => pick(undefined)} style={sw('#000', !cur)} />
          {PALETTE.filter((c) => c.name !== 'Ink').map((c) => (
            <button key={c.hex} type="button" title={`${c.name} ${c.hex}`} aria-label={c.name} aria-pressed={c.hex.toLowerCase() === cur} data-swatch={c.hex}
              onClick={() => pick(c.hex)} style={sw(c.hex, c.hex.toLowerCase() === cur)} />
          ))}
        </div>
      )}
    </div>
  );
}
