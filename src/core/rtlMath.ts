import type { BakedMath } from './mathliveHost';

/** Arabic letters/digits (incl. Arabic Mathematical Alphabetic Symbols) make a formula read right-to-left. */
export const RTL_MATH_RE = /[؀-ۿ\u{1EE00}-\u{1EEFF}]/u;

const FENCE_RE = /^[()[\]{}|‖⟨⟩〈〉]$/;
const TRANSLATE_RE = /^\s*translate\(\s*(-?[\d.]+(?:e-?\d+)?)(?:[\s,]+(-?[\d.]+(?:e-?\d+)?))?\s*\)\s*$/i;

/**
 * Lay a formula out right-to-left, the way Arabic maths is written: the first thing typed ends up
 * rightmost, so `=\frac{١}{٢}` reads "½ =". Only the order of the top-level pieces is reversed; each piece
 * (a number like ٢٥, a fraction, a \text{} word, a root) keeps its own internal order. Brackets are
 * flipped so "(a+b)" still looks like a bracketed group. Needs a real browser DOM for getBBox; elsewhere
 * (node tests) the formula is returned unchanged.
 */
function fenceChar(el: Element): string {
  const code = el.getAttribute('data-c') ?? el.querySelector('[data-c]')?.getAttribute('data-c') ?? '';
  const n = parseInt(code, 16);
  return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
}

export function rtlizeMath(baked: BakedMath, tex: string): BakedMath {
  if (typeof document === 'undefined' || !baked.markup || !RTL_MATH_RE.test(tex)) return baked;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  host.innerHTML = baked.markup;
  document.body.appendChild(host);
  try {
    const svg = host.querySelector('svg');
    const math = svg?.querySelector('[data-mml-node="math"]');
    if (!svg || !math) return baked;
    const kids = Array.from(math.children).filter((el): el is SVGGElement => el.tagName.toLowerCase() === 'g' && el.hasAttribute('data-mml-node'));
    if (kids.length < 2) return baked;
    const items: Array<{ el: SVGGElement; tx: number; ty: string; adv: number; box: DOMRect }> = [];
    for (const el of kids) {
      const m = TRANSLATE_RE.exec(el.getAttribute('transform') ?? 'translate(0)');
      if (!m) return baked; // unknown transform: leave the formula as MathJax laid it out
      items.push({ el, tx: parseFloat(m[1]), ty: m[2] ?? '0', adv: 0, box: el.getBBox() });
    }
    // Each piece owns the stretch from its origin to the next piece's origin (MathJax's own spacing);
    // the last one owns its measured width. Reversing those stretches keeps every gap MathJax chose.
    items.forEach((it, i) => {
      const next = items[i + 1];
      it.adv = next ? next.tx - it.tx : Math.max(it.box.x + it.box.width, 0);
    });
    const first = items[0].tx;
    const last = items[items.length - 1];
    const total = last.tx + last.adv;
    for (const it of items) {
      const tx = first + (total - (it.tx + it.adv));
      let transform = `translate(${tx}, ${it.ty})`;
      if (it.el.getAttribute('data-mml-node') === 'mo' && FENCE_RE.test((it.el.textContent ?? '').trim() || fenceChar(it.el))) {
        const cx = it.box.x + it.box.width / 2;
        transform += ` translate(${cx},0) scale(-1,1) translate(${-cx},0)`;
      }
      it.el.setAttribute('transform', transform);
    }
    return { ...baked, markup: svg.outerHTML };
  } catch {
    return baked;
  } finally {
    host.remove();
  }
}
