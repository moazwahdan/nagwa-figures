import { AR_MAP, localizeName, toArabicDigits, type LabelStyle } from './labels';
import type { ConLine, Lang } from './types';

/** Choices for the symbol written on a force arrow. */
export const FORCE_SYMBOL_CHOICES: string[] = ['F', ...Array.from({ length: 20 }, (_, i) => `F${i + 1}`)];
/** Letters that have an Arabic equivalent, the same as ordinary point names. */
export const LETTER_SYMBOL_CHOICES: string[] = Object.keys(AR_MAP).filter((c) => AR_MAP[c]);
/** Any text for each language: `c:<English>|<Arabic>`, e.g. c:R|ح. */
export const SYMBOL_PATTERN = /^(none|F([1-9]|1\d|20)?|[A-Z]|c:[^|]{0,8}\|[^|]{0,8})$/;
export const isForceSymbol = (v: unknown): v is string => typeof v === 'string' && SYMBOL_PATTERN.test(v);
export const customSymbol = (en: string, ar: string) => `c:${en.trim().replace(/\|/g, '')}|${ar.trim().replace(/\|/g, '')}`;

/** Symbol a force line really shows: its own choice, or F (F1, F2… when there are several forces). */
export function effectiveForceSymbol(lines: ConLine[], l: ConLine): string {
  if (l.symbol) return l.symbol;
  const forces = lines.filter((x) => x.kind === 'force');
  return forces.length >= 2 ? `F${forces.findIndex((x) => x.id === l.id) + 1}` : 'F';
}

/** Text and subscript to draw for a symbol in a language; null = nothing written. */
export function forceSymbolParts(sym: string, lang: Lang, style: LabelStyle): { text: string; sub?: string } | null {
  if (sym === 'none') return null;
  if (sym.startsWith('c:')) {
    const [en, ar] = sym.slice(2).split('|');
    const text = lang === 'ar' ? (ar || en) : (en || ar);
    return text ? { text } : null;
  }
  const m = /^F(\d+)?$/.exec(sym);
  if (m) {
    const sub = m[1] ? (lang === 'ar' ? toArabicDigits(m[1]) : m[1]) : undefined;
    return { text: lang === 'ar' ? 'ق' : 'F', sub };
  }
  return { text: localizeName(sym, lang, 'upper', style) };
}

/** Readable name of a symbol for lists: "F₂ / ق٢". */
export function forceSymbolName(sym: string): string {
  if (sym === 'none') return 'No symbol';
  if (sym.startsWith('c:')) return sym.slice(2).replace('|', ' / ');
  const m = /^F(\d+)?$/.exec(sym);
  if (!m) return AR_MAP[sym] ? `${sym} / ${AR_MAP[sym]}` : sym;
  const n = m[1];
  const sub = n ? [...n].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join('') : '';
  return `F${sub} / ق${n ? toArabicDigits(n) : ''}`;
}
