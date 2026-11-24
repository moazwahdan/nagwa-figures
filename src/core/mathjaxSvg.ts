import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor, type LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import 'mathjax-full/js/input/tex/unicode/UnicodeConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import { NAGWA_MATH_MACROS } from './mathliveMacros';
import { FONT_AR, FONT_AR_MATH } from './fonts';

const EM = 16;
const EX = 8;

type Converter = {
  adaptor: LiteAdaptor;
  html: ReturnType<typeof mathjax.document>;
};

let converter: Converter | null = null;

function mathjaxMacros(): Record<string, string | [string, number]> {
  const out: Record<string, string | [string, number]> = { alt: ['#1', 1] };
  for (const [name, def] of Object.entries(NAGWA_MATH_MACROS)) {
    const inner = /^\\alt\{([\s\S]*)\}$/.exec(def);
    out[name] = inner ? `\\text{${inner[1]}}` : def; // one mtext per letter run, re-laid out with real glyph advances (fixArabicMathRuns)
  }
  return out;
}

function engine(): Converter {
  if (converter) return converter;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({
    packages: ['base', 'ams', 'newcommand', 'noundefined', 'unicode', 'boldsymbol'],
    macros: mathjaxMacros(),
  });
  const svg = new SVG({ fontCache: 'local' });
  const html = mathjax.document('', { InputJax: tex, OutputJax: svg });
  converter = { adaptor, html };
  return converter;
}

function parseEx(value: string | null, fallback = 0): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}


/** Function names on the keyboard (جا جتا ظا ظتا قا قتا ...) come out of MathLive as isolated math-alphabet letters.
 * Draw them as real Arabic letters instead, so the browser joins them the way the keyboard shows them. */
const MATH_BLOCK = (...us: number[]) => us.map((u) => String.fromCodePoint(u)).join('');
const OPERATOR_WORDS: [string, string][] = [
  [MATH_BLOCK(0x1ee02, 0x1ee15, 0x1ee00, 0x1ee06), 'جتاز'], [MATH_BLOCK(0x1ee1a, 0x1ee15, 0x1ee00, 0x1ee06), 'ظتاز'], [MATH_BLOCK(0x1ee12, 0x1ee15, 0x1ee00, 0x1ee06), 'قتاز'],
  [MATH_BLOCK(0x1ee02, 0x1ee00, 0x1ee06), 'جاز'], [MATH_BLOCK(0x1ee1a, 0x1ee00, 0x1ee06), 'ظاز'], [MATH_BLOCK(0x1ee12, 0x1ee00, 0x1ee06), 'قاز'],
  [MATH_BLOCK(0x1ee02, 0x1ee15, 0x1ee00), 'جتا'], [MATH_BLOCK(0x1ee1a, 0x1ee15, 0x1ee00), 'ظتا'], [MATH_BLOCK(0x1ee12, 0x1ee15, 0x1ee00), 'قتا'],
  [MATH_BLOCK(0x1ee02, 0x1ee00), 'جا'], [MATH_BLOCK(0x1ee1a, 0x1ee00), 'ظا'], [MATH_BLOCK(0x1ee12, 0x1ee00), 'قا'],
  [MATH_BLOCK(0x1ee0b, 0x1ee05), 'لو'], [MATH_BLOCK(0x1ee0d, 0x1ee24, 0x1ee00), 'نهـا'],
];
/** The real-letter spelling of a function name typed as math-alphabet letters, or undefined. */
export function operatorWordFor(body: string): string | undefined {
  return OPERATOR_WORDS.find(([from]) => from === body)?.[1];
}
export function joinOperatorWords(tex: string): string {
  return tex.replace(/\\text\s*\{([^{}]*)\}/g, (whole, body: string) => {
    const hit = OPERATOR_WORDS.find(([from]) => from === body);
    return hit ? `\\text{${hit[1]}}` : whole;
  });
}

/** MathJax SVG from TeX. MathLive is responsible for producing that TeX (expanded macros). */
export function mathjaxTexToSvg(tex: string): { w: number; h: number; a: number; d: number; markup: string } {
  const { adaptor, html } = engine();
  tex = joinOperatorWords(tex);
  const node = html.convert(tex || ' ', { display: false, em: EM, ex: EX });
  const svg = adaptor.tags(node, 'svg')[0];
  if (!svg) {
    return { w: 0.2, h: 0.4, a: 0.3, d: 0.1, markup: '' };
  }
  adaptor.setAttribute(svg, 'data-qms-math', '1');
  adaptor.setAttribute(svg, 'overflow', 'visible');
  adaptor.setAttribute(svg, 'fill', '#000');
  adaptor.setAttribute(svg, 'color', '#000');
  adaptor.removeAttribute(svg, 'role');
  adaptor.removeAttribute(svg, 'focusable');
  const widthEx = parseEx(adaptor.getAttribute(svg, 'width'));
  const heightEx = parseEx(adaptor.getAttribute(svg, 'height'));
  const style = adaptor.getAttribute(svg, 'style') || '';
  const depthEx = parseEx((/vertical-align:\s*([-0-9.]+)ex/.exec(style) || [])[1], 0);
  const w = Math.max((widthEx * EX) / EM, 0.2);
  const h = Math.max((heightEx * EX) / EM, 0.4);
  const d = Math.max(Math.abs(depthEx) * EX / EM, 0.02);
  const a = Math.max(h - d, 0.2);
  adaptor.setAttribute(svg, 'width', String(w));
  adaptor.setAttribute(svg, 'height', String(h));
  adaptor.setAttribute(svg, 'style', 'color:#000');
  const fixed = fixArabicMathRuns(fontArabicText(adaptor.outerHTML(svg).replace(/currentColor/g, '#000')), w);
  return { w: fixed.w, h, a, d, markup: fixed.markup };
}

/** MathJax draws characters its own font lacks (Arabic letters) as <text font-family="serif">. The Arabic math letters
 * (U+1EE00 block: \\alef, \\behi, the جا / جتا function names ...) exist on almost no system font, so they showed as boxes.
 * Give those <text> nodes the Nagwa Arabic math font, and plain Arabic letters the Arabic text font. */
function fontArabicText(markup: string): string {
  return markup.replace(/<text([^>]*)>([^<]*)<\/text>/g, (whole, attrs: string, body: string) => {
    const family = /[\u{1EE00}-\u{1EEFF}]/u.test(body) ? FONT_AR_MATH : /[\u0600-\u06FF]/.test(body) ? FONT_AR : '';
    if (!family) return whole;
    const clean = attrs.replace(/\sfont-family="[^"]*"/, '');
    return `<text${clean} font-family="${family.replace(/"/g, "'")}">${body}</text>`;
  });
}

const ARABIC_MATH_RE = /[\u{1EE00}-\u{1EEFF}]/u;
const MJX_ESTIMATE = 600; // MathJax gives every character it has no metrics for this advance (1/1000 em)

function shiftX(el: Element, dx: number): void {
  const t = el.getAttribute('transform') || '';
  const m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(t);
  if (m) el.setAttribute('transform', t.replace(m[0], `translate(${parseFloat(m[1]) + dx},${m[2]})`));
  else el.setAttribute('transform', `translate(${dx},0) ${t}`.trim());
}

/** MathJax lays Arabic math letters out on a fixed 0.6em grid, left to right. Re-lay each run with the font's real
 * advances, first letter at the right end (they read right to left), and move what follows. Browser only. */
function fixArabicMathRuns(markup: string, w: number): { markup: string; w: number } {
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined' || !/[\u0600-\u06FF\u{1EE00}-\u{1EEFF}]/u.test(markup)) return { markup, w };
  try {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const svg = doc.documentElement;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx || svg.querySelector('parsererror')) return { markup, w };
    ctx.font = `884px ${FONT_AR_MATH}`;
    let topDelta = 0;
    const plainCtx = document.createElement('canvas').getContext('2d');
    if (plainCtx) plainCtx.font = `884px ${FONT_AR}`;
    for (const g of Array.from(svg.querySelectorAll('g[data-mml-node="mtext"]'))) {
      const letters = Array.from(g.children).filter((c) => c.tagName === 'text');
      if (plainCtx && letters.length && letters.length === g.children.length && letters.every((t) => /^[\u0600-\u06FF]+$/.test(t.textContent || ''))) {
        const word = letters.map((t) => t.textContent).join('');
        const first = letters[0];
        const width = plainCtx.measureText(word).width;
        first.textContent = word;
        letters.slice(1).forEach((t) => t.remove());
        const delta = width - letters.length * MJX_ESTIMATE;
        for (let sib = g.nextElementSibling; sib; sib = sib.nextElementSibling) shiftX(sib, delta);
        if (g.parentElement?.getAttribute('data-mml-node') === 'math') topDelta += delta;
        continue;
      }

      const texts = Array.from(g.children).filter((c) => c.tagName === 'text');
      if (!texts.length || texts.length !== g.children.length || !texts.every((t) => ARABIC_MATH_RE.test(t.textContent || ''))) continue;
      const adv = texts.map((t) => ctx.measureText(t.textContent || '').width);
      const total = adv.reduce((x, y) => x + y, 0);
      let x = total;
      texts.forEach((t, i) => {
        x -= adv[i];
        t.setAttribute('transform', `translate(${x},0) scale(1,-1)`);
      });
      const delta = total - texts.length * MJX_ESTIMATE;
      for (let sib = g.nextElementSibling; sib; sib = sib.nextElementSibling) shiftX(sib, delta);
      if (g.parentElement?.getAttribute('data-mml-node') === 'math') topDelta += delta;
    }
    if (topDelta) {
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      if (vb.length === 4 && vb[2] > 0) {
        const nw = Math.max(vb[2] + topDelta, 1);
        svg.setAttribute('viewBox', `${vb[0]} ${vb[1]} ${nw} ${vb[3]}`);
        w = (w * nw) / vb[2];
        svg.setAttribute('width', String(w));
      }
    }
    return { markup: new XMLSerializer().serializeToString(svg), w };
  } catch {
    return { markup, w };
  }
}
