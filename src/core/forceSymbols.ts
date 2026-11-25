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

/** Where the symbol of a force line is drawn (px). `mark` is the arrowhead size. */
export function forceLabelAt(a: { x: number; y: number }, b: { x: number; y: number }, arrow: string | undefined, pos: 'end' | 'middle' | 'start' | undefined, side: 1 | -1 | undefined, fs: number, mark: number): { x: number; y: number } {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, e = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  let nx = -e.y, ny = e.x;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const sd = side ?? 1;
  const where = pos ?? (arrow === 'middle' ? 'middle' : 'end');
  if (where === 'middle') return { x: (a.x + b.x) / 2 + nx * fs * 0.74 * sd, y: (a.y + b.y) / 2 + ny * fs * 0.74 * sd };
  if (where === 'start') return { x: a.x + e.x * Math.min(len * 0.2, fs * 2) + nx * fs * 0.74 * sd, y: a.y + e.y * Math.min(len * 0.2, fs * 2) + ny * fs * 0.74 * sd };
  const start = arrow === 'start', tip = start ? a : b, dir = start ? { x: -e.x, y: -e.y } : e;
  return { x: tip.x + dir.x * mark * 1.15, y: tip.y + dir.y * mark * 1.15 };
}

/** Geometry of the vector accent over a symbol centred at `pos`: segment from x0 to x1 at height y, head on the left for Arabic. */
export function vectorAccent(pos: { x: number; y: number }, text: string, sub: string | undefined, fs: number, lang: 'ar' | 'en') {
  const w = Math.max(fs * 0.5, [...text].length * fs * 0.62);
  const shift = sub && lang === 'en' ? -[...sub].length * fs * 0.31 / 2 : 0;
  const cx = pos.x + shift, y = pos.y - fs * 0.62;
  return { x0: cx - w / 2, x1: cx + w / 2, y, head: fs * 0.16 };
}
