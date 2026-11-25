import { useState } from 'react';
import { AR_MAP, toArabicDigits } from '../core/labels';
import { FORCE_SYMBOL_CHOICES, LETTER_SYMBOL_CHOICES } from '../core/forceSymbols';

/** F with a true subscript: F₂ / ق٢ */
export function SymbolText({ sym }: { sym: string }) {
  if (sym === 'none') return <>No symbol</>;
  const m = /^F(\d+)?$/.exec(sym);
  if (!m) return <>{AR_MAP[sym] ? `${sym} / ${AR_MAP[sym]}` : sym}</>;
  return <>F{m[1] && <sub>{m[1]}</sub>} / ق{m[1] && <sub>{toArabicDigits(m[1])}</sub>}</>;
}

export function ForceSymbolPicker({ value, auto, onPick, label }: { value?: string; auto: string; onPick: (sym: string | undefined) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const choose = (v: string | undefined) => { setOpen(false); onPick(v); };
  const chip = (key: string, v: string | undefined, content: React.ReactNode, on: boolean) => (
    <button key={key} type="button" className={`chip sm ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => choose(v)}>{content}</button>
  );
  return (
    <div className="force-symbol" role="group" aria-label={label}>
      <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {value ? <SymbolText sym={value} /> : <>Automatic (<SymbolText sym={auto} />)</>} ▾
      </button>
      {open && (
        <div className="chips" style={{ flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {chip('auto', undefined, <>Automatic</>, !value)}
          {chip('none', 'none', <>No symbol</>, value === 'none')}
          {FORCE_SYMBOL_CHOICES.map((c) => chip(c, c, <SymbolText sym={c} />, value === c))}
          {LETTER_SYMBOL_CHOICES.map((c) => chip(c, c, <SymbolText sym={c} />, value === c))}
        </div>
      )}
    </div>
  );
}
