import { useEffect, useRef, useState } from 'react';
import { ARABIC_FUNCTION_BUTTONS, ARABIC_LETTER_GROUPS } from '../core/arabicLetters';
import { FONT_AR_MATH } from '../core/fonts';
import { NAGWA_MATH_MACROS } from '../core/mathliveMacros';
import { splitQmsMath } from '../core/qmsMath';
import { operatorWordFor } from '../core/mathjaxSvg';
import { useStore } from '../core/store';
import { Tooltip } from './Tooltip';
import '../mathpad.css';

type Atom = { type: string; mode: string; value?: string };
type MixedModel = { root: { children: Atom[]; branch?: (name: string) => Atom[] | undefined }; atomToString: (a: Atom, format: string) => string };
type MixedEl = HTMLElement & {
  mode?: string;
  value?: string;
  defaultMode?: string;
  mathVirtualKeyboardPolicy?: string;
  macros?: Record<string, string>;
  locale?: string;
  insert: (s: string, o?: Record<string, unknown>) => boolean;
  setValue: (s: string, o?: Record<string, unknown>) => void;
  executeCommand: (c: unknown) => void;
  _mathfield?: { model?: MixedModel };
};
export type MixedApi = { insertMath: (latex: string) => void; toggleKeyboard: () => void; focus: () => void };

/** Caption source ("text $math$ text") from the field: text-mode atoms are plain words, math-mode atoms are formulas. */
function captionFromField(mf: MixedEl): string {
  const model = mf._mathfield?.model;
  if (!model) return (mf.value ?? '').trim();
  let out = '';
  let math: string[] = [];
  const flush = () => { if (math.length) { out += `$${math.join(' ')}$`; math = []; } };
  // branch('body') = the top-level atoms only (root.children also lists the insides of fractions, roots ...)
  for (const a of model.root.branch?.('body') ?? model.root.children) {
    if (!a || a.type === 'first') continue;
    if (a.mode === 'text') { flush(); out += (a.value ?? '').replace(/\$/g, ''); continue; }
    const piece = model.atomToString(a, 'latex').trim();
    math.push(piece.startsWith('$') && piece.endsWith('$') ? piece.slice(1, -1).trim() : piece);
  }
  flush();
  return out;
}

/** Arabic caption field: a right-to-left MathLive field that starts in text mode, like the mixed-text lab. */
function MixedField({ lang, value, onChange, onFocus, onMode, apiRef }: { lang: 'ar' | 'en'; value: string; onChange: (v: string) => void; onFocus: () => void; onMode: (m: 'text' | 'math') => void; apiRef: { current: MixedApi | null } }) {
  const host = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MixedEl | null>(null);
  const last = useRef<string | null>(null);
  const suppress = useRef(false);
  const valueRef = useRef(value);
  const cb = useRef({ onChange, onFocus, onMode });
  const [mode, setMode] = useState<'text' | 'math'>('text');
  valueRef.current = value;
  cb.current = { onChange, onFocus, onMode };

  const emit = (mf: MixedEl) => {
    if (suppress.current) return;
    const next = captionFromField(mf);
    last.current = next;
    cb.current.onChange(next);
  };
  const load = (mf: MixedEl, src: string) => {
    suppress.current = true;
    try {
      mf.setValue('');
      for (const seg of splitQmsMath(src)) mf.insert(seg.value, { mode: seg.kind === 'math' ? 'math' : 'text', selectionMode: 'after' });
      if (mf.mode !== 'text') mf.executeCommand(['switchMode', 'text']);
    } finally {
      requestAnimationFrame(() => { suppress.current = false; });
    }
  };
  /** Leave the formula: the caret goes just after the whole top-level formula atom, then plain text mode. */
  const leaveMath = (mf: MixedEl) => {
    try {
      const m = mf._mathfield?.model as any;
      let a = m?.at?.(m.position);
      while (a?.parent && a.parent !== m.root) a = a.parent;
      if (a && a.parent === m.root) m.position = m.offsetOf(a);
    } catch { /* keep the cursor where it is */ }
    if (mf.mode !== 'text') mf.executeCommand(['switchMode', 'text']);
  };
  const keyboard = () => (window as unknown as { mathVirtualKeyboard?: { visible: boolean; show: () => void; hide: (o?: unknown) => void } }).mathVirtualKeyboard;
  /** One button: starts a formula at the caret, or finishes it. The keyboard opens only when the user asks for it. */
  const toggleFormula = () => {
    const mf = mfRef.current;
    if (!mf) return;
    mf.focus();
    if (mf.mode === 'math') leaveMath(mf);
    else mf.executeCommand(['switchMode', 'math']);
    setMode(mf.mode === 'math' ? 'math' : 'text');
    cb.current.onMode(mf.mode === 'math' ? 'math' : 'text');
  };

  useEffect(() => {
    let dead = false;
    let el: MixedEl | null = null;
    void (async () => {
      if (!customElements.get('math-field')) await import('@nagwa-limited/mathlive');
      await customElements.whenDefined('math-field');
      if (dead || !host.current) return;
      el = document.createElement('math-field') as MixedEl;
      el.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      el.setAttribute('lang', lang);
      el.className = `text-composer-mixed ${lang === 'en' ? 'is-ltr' : ''}`;
      el.defaultMode = 'text';
      el.mathVirtualKeyboardPolicy = 'manual';
      el.locale = lang;
      el.macros = { ...(el.macros ?? {}), ...NAGWA_MATH_MACROS };
      el.addEventListener('input', () => emit(el!));
      // The mode follows the caret: inside a formula = math, anywhere else = plain text. The keyboard is never opened by itself.
      let shown: 'text' | 'math' | null = null;
      const sync = () => {
        const m = el!.mode === 'math' ? 'math' : 'text';
        if (m === shown) return;
        shown = m;
        setMode(m);
        cb.current.onMode(m);
      };
      el.addEventListener('mode-change', sync);
      el.addEventListener('selection-change', sync); // the caret moving in or out of a formula
      el.addEventListener('focusin', () => { cb.current.onFocus(); shown = null; sync(); });
      // Leaving the field closes the keyboard (moving between the Arabic and English fields keeps it).
      el.addEventListener('focusout', () => {
        window.setTimeout(() => {
          if (dead || document.activeElement?.tagName === 'MATH-FIELD') return;
          keyboard()?.hide({ animate: true });
        }, 150);
      });
      // Physical keys work inside a formula exactly like the on-screen keyboard, but "\\" and "$" are blocked so nobody types LaTeX by hand.
      el.addEventListener('keydown', (e) => {
        if (e.key === '$' || e.key === '\\') e.preventDefault(); // no hand-written LaTeX, in any mode
        // Forward arrow at the end of a formula steps out of it (plain text from there) instead of getting stuck.
        const forward = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight';
        if (e.key === forward && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && el!.mode === 'math') {
          const m = el!._mathfield?.model as any;
          const cur = m?.at?.(m.position);
          const next = m?.at?.(m.position + 1);
          if (cur && cur.mode === 'math' && cur.parent === m.root && (!next || next.mode !== 'math')) {
            e.preventDefault();
            el!.executeCommand(['switchMode', 'text']);
            sync(); // switchMode alone fires no event: refresh the button + close the keyboard
          }
        }
      }, true);
      host.current.appendChild(el);
      // Tint the formula zones: MathLive renders every atom with data-atom-id, so mark the math-mode top-level atoms after each render.
      const sr = el.shadowRoot;
      if (sr) {
        const st = document.createElement('style');
        st.textContent = '.nz-math{background:rgba(15,118,110,.12);box-shadow:0 2px 0 rgba(15,118,110,.55);}';
        sr.appendChild(st);
        const mark = () => {
          const body = (el!._mathfield?.model?.root?.branch?.('body') ?? []) as Array<Atom & { id?: string }>;
          for (const a of body) {
            if (!a || a.type === 'first' || a.mode !== 'math' || !a.id) continue;
            sr.querySelectorAll(`[data-atom-id="${a.id}"]`).forEach((n) => n.classList.add('nz-math'));
          }
        };
        // جا جتا ظا ... are stored as math-alphabet letters, which never join. Show them as real letters so they read joined, like the keyboard key.
        const joinWords = () => {
          sr.querySelectorAll<HTMLElement>('.ML__alt-arabic').forEach((n) => {
            const word = operatorWordFor(n.textContent ?? '');
            if (!word) return;
            n.textContent = word;
            n.style.fontFamily = "'Noto-Regular','Noto Naskh Arabic',serif";
          });
        };
        new MutationObserver(() => { mark(); joinWords(); }).observe(sr, { childList: true, subtree: true });
        joinWords();
        el.addEventListener('input', mark);
      }
      mfRef.current = el;
      last.current = valueRef.current;
      load(el, valueRef.current);
      apiRef.current = {
        focus: () => el?.focus(),
        toggleKeyboard: () => {
          const kb = (window as unknown as { mathVirtualKeyboard?: { visible: boolean; show: () => void; hide: () => void } }).mathVirtualKeyboard;
          if (!kb || !el) return;
          el.focus();
          if (kb.visible) kb.hide(); else kb.show();
        },
        insertMath: (latex: string) => {
          if (!el) return;
          el.focus();
          const wasMath = el.mode === 'math';
          if (!wasMath) el.executeCommand(['switchMode', 'math']);
          el.insert(latex, { mode: 'math', focus: true, selectionMode: 'after' });
          if (!wasMath && el.mode !== 'text') el.executeCommand(['switchMode', 'text']);
          emit(el);
        },
      };
    })();
    return () => {
      dead = true;
      (window as unknown as { mathVirtualKeyboard?: { hide: (o?: unknown) => void } }).mathVirtualKeyboard?.hide({ animate: false });
      el?.remove();
      mfRef.current = null;
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = mfRef.current;
    if (mf && value !== last.current) { last.current = value; load(mf, value); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="text-composer-mixedwrap">
      <div ref={host} />
      <div className="text-composer-modes">
        <button type="button" className={`btn sm ${mode === 'math' ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={toggleFormula}>
          {mode === 'math' ? (lang === 'ar' ? '\u2713 خلصت المعادلة' : '\u2713 Done with formula') : (lang === 'ar' ? '\u03A3 معادلة' : '\u03A3 Formula')}
        </button>
      </div>
    </div>
  );
}

function preview(ar: string, en: string) {
  const t = (en.trim() || ar.trim()).replace(/\s+/g, ' ');
  return t.length > 28 ? t.slice(0, 27) + '…' : t || 'Text';
}

export function TextsPanel() {
  const shapes = useStore((s) => s.shapes);
  const selectedId = useStore((s) => s.selectedId);
  const captions = shapes.filter((q) => q.caption);
  const { setTextComposer, select, removeShape } = useStore.getState();
  return (
    <div className="texts-panel">
      <Tooltip tip="Opens a bar at the top. Write Arabic and English separately. Math goes in $...$ like $\frac{\text{Area}}{5}$. Use \text{...} for connected words and \alef for the looped alif.">
        <button type="button" className="btn primary wide" onClick={() => useStore.setState({ selectedId: null, textComposer: 'new' })}>New text</button>
      </Tooltip>
      {captions.length > 0 && (
        <ul className="texts-list">
          {captions.map((s) => (
            <li key={s.id}>
              <button type="button" className={`texts-item ${s.id === selectedId ? 'on' : ''}`} onClick={() => { select(s.id); setTextComposer(s.id); }}>
                {preview(s.caption!.ar, s.caption!.en)}
              </button>
              <button type="button" className="icon-btn danger" aria-label="Delete text" onClick={() => removeShape(s.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TextComposer() {
  const composer = useStore((s) => s.textComposer);
  const shapes = useStore((s) => s.shapes);
  const selectedId = useStore((s) => s.selectedId);
  const editing = typeof composer === 'string' ? shapes.find((s) => s.id === composer && s.caption) : undefined;
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const [lettersOpen, setLettersOpen] = useState(false);
  const [mathActive, setMathActive] = useState(false);
  const arApi = useRef<MixedApi | null>(null);
  const enApi = useRef<MixedApi | null>(null);
  const enRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'ar' | 'en'>('ar');
  useEffect(() => {
    if (composer === 'new') { setAr(''); setEn(''); }
    else if (editing) { setAr(editing.caption!.ar); setEn(editing.caption!.en); }
  }, [composer, editing?.id, editing?.caption?.ar, editing?.caption?.en]);
  // The bar follows the selection: selecting a text opens it with that text, selecting anything else (or nothing) closes it.
  // A brand-new text ('new') stays open until it is added, closed, or another text is selected.
  useEffect(() => {
    const st = useStore.getState();
    const sel = selectedId ? st.shapes.find((x) => x.id === selectedId) : undefined;
    if (sel?.caption) { if (st.textComposer !== sel.id) st.setTextComposer(sel.id); }
    else if (st.textComposer && st.textComposer !== 'new') st.setTextComposer(null);
  }, [selectedId, composer, shapes]);
  // The text being edited is gone (deleted, undone, project reloaded ...): there is nothing left to edit, so close the bar.
  const gone = typeof composer === 'string' && composer !== 'new' && !editing;
  useEffect(() => { if (gone) useStore.getState().setTextComposer(null); }, [gone]);
  if (!composer || gone) return null;
  const { addCaption, patchShape, setTextComposer } = useStore.getState();
  /** Put an Arabic letter/function macro (\\behi, \\arsin ...) at the caret of the field used last.
   * Inside $...$ it is added as is; outside it is wrapped in $...$. Right after a closing $ it joins that
   * formula, so several letters in a row stay one formula instead of "$a$$b$" (which reads as display math). */
  const insertLatex = (latex: string) => {
    const which = lastField.current;
    const api = which === 'ar' ? arApi.current : enApi.current;
    if (api) { api.insertMath(latex); return; }
    const ta = which === 'ar' ? null : enRef.current;
    const value = which === 'ar' ? ar : en;
    const setValue = which === 'ar' ? setAr : setEn;
    const start = Math.min(ta?.selectionStart ?? value.length, value.length);
    const end = Math.min(ta?.selectionEnd ?? start, value.length);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const dollars = before.match(/(?<!\\)\$/g)?.length ?? 0;
    const inMath = dollars % 2 === 1;
    let head = before;
    let piece: string;
    if (inMath) piece = `${latex} `;
    else if (before.endsWith('$') && !before.endsWith('$$') && !before.endsWith('\\$')) {
      head = before.slice(0, -1);
      piece = `${latex}$`;
    } else piece = `$${latex}$`;
    const next = head + piece + after;
    if (next.length > 4000) return;
    setValue(next);
    const caret = head.length + piece.length;
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };
  const insertMacro = (name: string) => insertLatex(`\\${name}`);
  const save = () => {
    if (composer === 'new') addCaption({ ar, en });
    else if (editing) {
      // Both fields emptied = the text is deleted: remove it and close the bar instead of keeping an empty "Update".
      if (!ar.trim() && !en.trim()) useStore.getState().removeShape(editing.id);
      else patchShape(editing.id, { caption: { ar: ar.slice(0, 4000), en: en.slice(0, 4000) } }, { fit: true });
    }
  };
  return (
    <div className="text-composer" role="region" aria-label="Figure text">
      <div className="text-composer-fields">
        <label>
          <span>Arabic</span>
          <MixedField lang="ar" value={ar} onChange={setAr} onFocus={() => { lastField.current = 'ar'; }} onMode={(m) => { if (lastField.current === 'ar') setMathActive(m === 'math'); }} apiRef={arApi} />
        </label>
        <label>
          <span>English</span>
          <MixedField lang="en" value={en} onChange={setEn} onFocus={() => { lastField.current = 'en'; }} onMode={(m) => { if (lastField.current === 'en') setMathActive(m === 'math'); }} apiRef={enApi} />
        </label>
      </div>
      {lettersOpen && mathActive && (
        <div className="arabic-letters" dir="rtl" role="group" aria-label="Arabic letters">
          {ARABIC_LETTER_GROUPS.map((group) => (
            <div key={group.id} className="arabic-letters-group">
              <div className="arabic-letters-title">{group.label}</div>
              <div className="arabic-letters-grid">
                {group.items.map((l) => (
                  <button
                    key={l.name}
                    type="button"
                    className="arabic-letter"
                    style={{ fontFamily: FONT_AR_MATH }}
                    title={`\\${l.name}`}
                    aria-label={l.name}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMacro(l.name)}
                  >
                    {l.char}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="arabic-letters-group">
            <div className="arabic-letters-title">دوال</div>
            <div className="arabic-letters-grid">
              {ARABIC_FUNCTION_BUTTONS.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className="arabic-letter fn"
                  title={`\\${f.name}`}
                  aria-label={f.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMacro(f.name)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="text-composer-actions">
        {mathActive && (
          <Tooltip tip="Arabic math letters (alef, beh, behi, sadt ...). Click a letter to put it in the formula you are typing.">
            <button type="button" className={`btn ${lettersOpen ? 'on' : ''}`} aria-pressed={lettersOpen} onMouseDown={(e) => e.preventDefault()} onClick={() => setLettersOpen((v) => !v)}>
              <span className="arabic-letters-icon" style={{ fontFamily: FONT_AR_MATH }}>{'\u{1EE00}\u{1EE01}\u{1EE02}'}</span> Arabic letters
            </button>
          </Tooltip>
        )}
        <button type="button" className="btn primary" onClick={save}>{composer === 'new' ? 'Add to drawing' : 'Update'}</button>
        <button type="button" className="btn" onClick={() => useStore.setState({ textComposer: null, selectedId: null })}>Close</button>
      </div>
    </div>
  );
}
