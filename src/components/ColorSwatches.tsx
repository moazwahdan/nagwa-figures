import { PALETTE } from '../core/palette';

/** Compact colour picker over the team palette. `value` undefined = default black. */
export function ColorSwatches({ value, onPick, label }: { value?: string; onPick: (hex: string | undefined) => void; label: string }) {
  const cur = value?.toLowerCase();
  return (
    <div className="color-swatches" role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
      <button type="button" title="Black" aria-label="Black" aria-pressed={!cur} data-swatch="" onClick={() => onPick(undefined)}
        style={{ width: 16, height: 16, borderRadius: 3, background: '#000', border: !cur ? '2px solid var(--accent)' : '1px solid #0004', padding: 0, cursor: 'pointer' }} />
      {PALETTE.filter((c) => c.name !== 'Ink').map((c) => (
        <button key={c.hex} type="button" title={`${c.name} ${c.hex}`} aria-label={c.name} aria-pressed={c.hex.toLowerCase() === cur} data-swatch={c.hex} onClick={() => onPick(c.hex)}
          style={{ width: 16, height: 16, borderRadius: 3, background: c.hex, border: c.hex.toLowerCase() === cur ? '2px solid var(--accent)' : '1px solid #0004', padding: 0, cursor: 'pointer' }} />
      ))}
    </div>
  );
}
