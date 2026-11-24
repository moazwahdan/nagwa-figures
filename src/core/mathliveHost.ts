import type { Lang } from './types';
import { NAGWA_MATH_MACROS } from './mathliveMacros';
import { mathjaxTexToSvg } from './mathjaxSvg';
import { mathLocale, splitQmsMath } from './qmsMath';
import { rtlizeMath } from './rtlMath';

export type BakedMath = { w: number; h: number; a: number; d: number; markup: string };

const cache = new Map<string, BakedMath>();

export function mathCacheKey(tex: string, lang: Lang): string {
  return `${lang}\n${tex}`;
}

export function getBakedMath(tex: string, lang: Lang): BakedMath | undefined {
  return cache.get(mathCacheKey(tex, lang));
}

async function ensureMathlive(): Promise<void> {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('math-field')) await import('@nagwa-limited/mathlive');
  const Ctor = customElements.get('math-field') as (CustomElementConstructor & { fontsDirectory?: string | null }) | undefined;
  if (Ctor) Ctor.fontsDirectory = null;
}

function host(): HTMLElement {
  let el = document.getElementById('figure-mathlive-host');
  if (!el) {
    el = document.createElement('div');
    el.id = 'figure-mathlive-host';
    document.body.appendChild(el);
  }
  return el;
}

/** Expand Nagwa/MathLive macros to TeX MathJax can typeset. */
async function mathliveOutput(tex: string, loc: 'ar' | 'en'): Promise<string> {
  if (typeof document === 'undefined' || typeof customElements === 'undefined') return tex;
  await ensureMathlive();
  await customElements.whenDefined('math-field').catch(() => undefined);
  const mf = document.createElement('math-field') as HTMLElement & {
    macros?: Record<string, string>;
    locale?: string;
    value?: string;
    getValue?: (format?: string) => string;
  };
  mf.setAttribute('read-only', '');
  mf.setAttribute('virtual-keyboard-mode', 'off');
  mf.setAttribute('dir', loc === 'ar' ? 'rtl' : 'ltr');
  mf.setAttribute('lang', loc);
  mf.setAttribute('locale', loc);
  mf.macros = { ...(mf.macros ?? {}), ...NAGWA_MATH_MACROS };
  host().appendChild(mf);
  mf.locale = loc;
  mf.textContent = tex;
  if (typeof mf.value === 'string') mf.value = tex;
  for (let i = 0; i < 12; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  let out = tex;
  try {
    const expanded = mf.getValue?.('latex-expanded');
    if (expanded && expanded.trim()) out = expanded;
  } catch { /* keep tex */ }
  mf.remove();
  return unwrapMathliveAlt(out);
}

/** MathLive leaves \\alt{...} in latex-expanded; MathJax has no AltArabic command. */
function unwrapMathliveAlt(tex: string): string {
  let prev = '';
  let cur = tex;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/\\alt\s*\{([^{}]*)\}/g, '\\text{$1}');
  }
  return cur;
}

export async function bakeLatex(tex: string, lang: Lang = mathLocale(tex)): Promise<BakedMath> {
  const key = mathCacheKey(tex, lang);
  const hit = cache.get(key);
  if (hit) return hit;
  const loc = lang === 'ar' ? 'ar' : 'en';
  if (typeof document === 'undefined') {
    const est: BakedMath = {
      w: Math.max([...tex].length, 1) * 0.42,
      h: /\\frac|\\sqrt/.test(tex) ? 1.9 : 1.15,
      a: 0.85,
      d: 0.35,
      markup: '',
    };
    cache.set(key, est);
    return est;
  }
  try { await document.fonts?.load("100px 'NagwaArabicMath'", '\u{1EE00}'); } catch { /* measure with whatever is loaded */ }
  const expanded = await mathliveOutput(tex, loc);
  const baked = rtlizeMath(mathjaxTexToSvg(expanded), expanded);
  cache.set(key, baked);
  return baked;
}

export async function bakeCaptionMath(src: string, fallbackLang: Lang): Promise<void> {
  await Promise.all(
    splitQmsMath(src)
      .filter((s) => s.kind === 'math')
      .map((s) => bakeLatex(s.value, mathLocale(s.value) === 'ar' ? 'ar' : fallbackLang)),
  );
}
