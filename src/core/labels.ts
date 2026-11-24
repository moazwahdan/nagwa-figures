import type { Lang, StyleSettings } from './types';

/** English letter -> Arabic letter used in Egyptian math figures.
 * O has an empty default so it does not conflict with F (و) and users can pick any Arabic label. */
export const AR_MAP: Record<string, string> = {
  A: 'ا',
  B: 'ب',
  C: 'ج',
  D: 'د',
  E: 'ه',
  F: 'و',
  G: 'ز',
  H: 'ح',
  I: 'ط',
  J: 'ي',
  K: 'ك',
  L: 'ل',
  M: 'م',
  N: 'ن',
  O: '',
  X: 'س',
  Y: 'ص',
  Z: 'ع',
};

/** Private-use marker rendered as the looped exam-figure alif. */
export const ALEF_LOOP = '\uE000';

const DIGITS = '٠١٢٣٤٥٦٧٨٩';

export type LabelStyle = Pick<StyleSettings, 'dAsHamza' | 'arabicTatweel' | 'alefForm'>;

export function toArabicDigits(s: string): string {
  return s
    .replace(/[0-9]/g, (d) => DIGITS[Number(d)])
    .replace(/\./g, '٫')
    .replace(/-/g, '−');
}

/** Plain Arabic letter -> the matching Arabic-math glyph (the letters on the math keyboard), drawn with NagwaArabicMath. */
const MATH_CP: Record<string, number> = { 'ب': 0x01, 'ج': 0x02, 'د': 0x03, 'ه': 0x24, 'و': 0x05, 'ز': 0x06, 'ح': 0x07, 'ط': 0x08, 'ي': 0x09, 'ك': 0x0a, 'ل': 0x0b, 'م': 0x0c, 'ن': 0x0d, 'س': 0x0e, 'ع': 0x0f, 'ف': 0x10, 'ص': 0x11, 'ق': 0x12, 'ر': 0x13, 'ش': 0x14, 'ت': 0x15, 'ث': 0x16, 'خ': 0x17, 'ذ': 0x18, 'ض': 0x19, 'ظ': 0x1a, 'غ': 0x1b };
export function toMathLetter(ch: string): string {
  if (ch === 'ا') return ALEF_LOOP;
  const cp = MATH_CP[ch];
  return cp === undefined ? ch : String.fromCodePoint(0x1ee00 + cp);
}

export function arLetter(ch: string, style: LabelStyle): string {
  /* A is always the exam-figure alif; the D / alif / tatweel options were removed (letters are picked from the palette instead). */
  void style;
  const up = ch.toUpperCase();
  if (up === 'A') return ALEF_LOOP;
  const plain = AR_MAP[up];
  return plain === undefined ? ch : toMathLetter(plain);
}

/** Arabic letters shown in the name box. The looped alif is the plain alif glyph there. */
export function shownArabicName(name: string, nameAr: string | undefined, caseMode: 'upper' | 'lower', style: LabelStyle): string {
  if (nameAr !== undefined) return nameAr;
  return localizeName(name, 'ar', caseMode, style).split(ALEF_LOOP).join('ا');
}

/** Point name drawn on the figure. A custom Arabic name replaces the derived letter. */
export function pointLabel(name: string, nameAr: string | undefined, lang: Lang, caseMode: 'upper' | 'lower', style: LabelStyle): string {
  if (lang === 'ar' && nameAr !== undefined) return nameAr;
  return localizeName(name, lang, caseMode, style);
}

/** Vertex / point name as displayed in the given language. */
export function localizeName(
  name: string,
  lang: Lang,
  caseMode: 'upper' | 'lower',
  style: LabelStyle,
): string {
  if (lang === 'ar') {
    return [...name].map((c) => {
      if ('₀₁₂₃₄₅₆₇₈₉'.includes(c)) return '٠١٢٣٤٥٦٧٨٩'['₀₁₂₃₄₅₆₇₈₉'.indexOf(c)];
      if (/[0-9]/.test(c)) return DIGITS[Number(c)];
      return arLetter(c, style);
    }).join('');
  }
  return caseMode === 'lower' ? name.toLowerCase() : name.toUpperCase();
}

/** Free text (side values, angle values): digits + single latin letters get localised. */
export function localizeText(
  text: string,
  lang: Lang,
  style: LabelStyle,
): string {
  if (lang === 'en') return text;
  return toArabicDigits(text).replace(/[A-Za-z]/g, (c) => arLetter(c, style));
}

const FN_AR: Record<string, string> = { f: 'د', m: 'م', q: 'ق' };

/** Curve name: f(x) → د(س), m(x) → م(س), q(x) → ق(س). */
export function localizeFunctionLabel(label: string, lang: Lang, style: LabelStyle): string {
  if (lang !== 'ar') return label;
  const m = /^\s*([A-Za-z])\s*\(\s*([A-Za-z])\s*\)\s*$/.exec(label);
  if (!m) return localizeText(label, 'ar', style);
  const letter = FN_AR[m[1].toLowerCase()] ?? arLetter(m[1], style);
  const arg = m[2].toLowerCase() === 'x' ? 'س' : arLetter(m[2], style);
  return `${letter}(${arg})`;
}

/** Unit label for side values. With the unitless system, this returns empty (no cm/m/km shown). */
export function unitLabel(_lang: Lang): string {
  return '';
}

export function formatNumber(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

/** Common LaTeX symbol names, written with or without a leading backslash. */
const SYMBOLS: Record<string, string> = {
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  infty: '∞', inf: '∞', pm: '±', mp: '∓', times: '×', cdot: '·', div: '÷', leq: '≤', geq: '≥',
  neq: '≠', approx: '≈', equiv: '≡', sim: '∼', degree: '°', circ: '°', angle: '∠', perp: '⊥',
  parallel: '∥', sqrt: '√', partial: '∂', nabla: '∇', forall: '∀', exists: '∃',
};

/** Turn a short label such as `pi` or `\theta` into its symbol. Unknown commands are shown as plain text. */
export function renderSymbol(input: string): string {
  const s = input.trim();
  if (!s) return '';
  const replaced = s.replace(/\\([A-Za-z]+)/g, (_, cmd: string) => SYMBOLS[cmd.toLowerCase()] ?? cmd);
  return SYMBOLS[replaced.toLowerCase()] ?? replaced;
}

/** Arabic letters offered for vertex names (the ones geometry figures actually use). */
/** Stretched forms (جـ حـ خـ هـ = letter + tatweel, drawn with the normal Arabic font) sit right after their plain letters. */
const STRETCHED = new Set(['ج', 'ح', 'خ', 'ه']);
export const VERTEX_AR_LETTERS = [
  ALEF_LOOP,
  'أ',
  ...'بجدهوزحطيكلمنسعفصقرشتثخذضظغ'.split('').flatMap((c) => (STRETCHED.has(c) ? [toMathLetter(c), `${c}ـ`] : [toMathLetter(c)])),
  'ء',
];

/** A letter picked from the vertex palette, styled like the auto letters (looped alif, tatweel). */
export function styledArabicLetter(ch: string, style: LabelStyle): string {
  void style;
  return ch;
}

type VertexNamed = { names: string[]; namesAr?: (string | null)[]; caseMode: 'upper' | 'lower' };

/** Vertex label of a shape in a language; a picked Arabic letter replaces the derived one. */
export function vertexLabelOf(s: VertexNamed, i: number, lang: Lang, style: LabelStyle): string {
  const custom = s.namesAr?.[i];
  if (lang === 'ar' && custom) return toMathLetter(custom);
  return localizeName(s.names[i] ?? '', lang, s.caseMode, style);
}

/** Arabic letter shown for a vertex in the picker (plain, no tatweel / loop marks). */
export function vertexArabicPlain(s: VertexNamed, i: number, style: LabelStyle): string {
  const c = s.namesAr?.[i];
  if (c) return toMathLetter(c);
  return localizeName(s.names[i] ?? '', 'ar', s.caseMode, style);
}
