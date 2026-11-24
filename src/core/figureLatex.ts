import { bakeLatex, getBakedMath, type BakedMath } from './mathliveHost';
import { mathLocale, splitQmsMath } from './qmsMath';
import { FONT_AR, FONT_EN } from './fonts';
import type { Lang } from './types';

export type CaptionSeg = { kind: 'text'; value: string } | { kind: 'math'; value: string };
export type Ink =
  | { k: 'text'; x: number; y: number; s: string; size: number; italic?: boolean; dir?: 'rtl' | 'ltr' }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; sw: number }
  | { k: 'svg'; x: number; y: number; w: number; h: number; markup: string; tex?: string };
export type LaidOut = { w: number; h: number; ink: Ink[] };

export function splitCaption(src: string): CaptionSeg[] {
  return splitQmsMath(src);
}

function cw(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    if (ch === ' ') w += size * 0.28;
    else if (/[\u0600-\u06FF]/.test(ch)) w += size * 0.62;
    else w += size * 0.54;
  }
  return w;
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Real text width in the font the caption is drawn with (falls back to the rough per-letter estimate). */
function textWidth(s: string, size: number, lang: Lang): number {
  if (typeof document === 'undefined') return cw(s, size);
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return cw(s, size);
  const family = lang === 'ar' || /[\u0600-\u06FF]/.test(s) ? FONT_AR : FONT_EN;
  measureCtx.font = `100px ${family}`;
  const w = measureCtx.measureText(s).width;
  return w > 0 ? (w * size) / 100 : cw(s, size);
}

/** sp = width of the plain spaces that were typed before / after this text (SVG <text> collapses them, so they are laid out as gaps). */
type Box = { w: number; h: number; d: number; a: number; ink: Ink[]; sp?: [number, number] };

function shift(b: Box, dx: number, dy: number): Box {
  return {
    ...b,
    ink: b.ink.map((p) => {
      if (p.k === 'text') return { ...p, x: p.x + dx, y: p.y + dy };
      if (p.k === 'svg') return { ...p, x: p.x + dx, y: p.y + dy };
      return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
    }),
  };
}

function layoutText(src: string, size: number, lang: Lang): Box {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(src);
  const body = m ? m[2] : src;
  const space = textWidth(' ', size, lang) || size * 0.25;
  const padL = m && m[1] ? space : 0;
  const padR = m && m[3] && body ? space : 0;
  if (!body) return { w: 0, h: size, a: size * 0.72, d: size * 0.22, ink: [], sp: [padL, 0] };
  const w = textWidth(body, size, lang);
  return { w, h: size, a: size * 0.72, d: size * 0.22, ink: [{ k: 'text', x: 0, y: 0, s: body, size, dir }], sp: [padL, padR] };
}

function fromBake(b: BakedMath, size: number, tex: string): Box {
  const k = size;
  const markup = b.markup.replace(/width="[\d.]+"/, `width="${b.w * k}"`).replace(/height="[\d.]+"/, `height="${b.h * k}"`);
  return {
    w: b.w * k,
    h: b.h * k,
    a: b.a * k,
    d: b.d * k,
    ink: [{ k: 'svg', x: 0, y: -b.a * k, w: b.w * k, h: b.h * k, markup, tex }],
  };
}

function layoutMath(src: string, size: number, lang: Lang): Box {
  const loc = mathLocale(src) === 'ar' ? 'ar' : lang;
  const baked = getBakedMath(src, loc);
  if (baked?.markup) return fromBake(baked, size, src);
  void bakeLatex(src, loc);
  const est: BakedMath = {
    w: Math.max([...src].length, 1) * 0.42,
    h: /\\frac|\\sqrt/.test(src) ? 1.9 : 1.15,
    a: 0.85,
    d: 0.35,
    markup: '',
  };
  return {
    w: est.w * size,
    h: est.h * size,
    a: est.a * size,
    d: est.d * size,
    ink: [{ k: 'svg', x: 0, y: -est.a * size, w: est.w * size, h: est.h * size, markup: '', tex: src }],
  };
}

function lineWidth(segs: CaptionSeg[], size: number, lang: Lang): number {
  return layoutLine(segs, size, lang).w;
}

function wrapSegs(segs: CaptionSeg[], size: number, lang: Lang, maxWidth?: number): CaptionSeg[][] {
  if (!maxWidth || segs.length === 0) return segs.length ? [segs] : [];
  const lines: CaptionSeg[][] = [[]];
  const push = (seg: CaptionSeg) => {
    const cur = lines[lines.length - 1];
    const trial = [...cur, seg];
    if (cur.length && lineWidth(trial, size, lang) > maxWidth) lines.push([seg]);
    else cur.push(seg);
  };
  for (const seg of segs) {
    if (seg.kind === 'math') { push(seg); continue; }
    const words = seg.value.split(/(\s+)/).filter((w) => w.length);
    let buf = '';
    const flush = () => { if (buf) { push({ kind: 'text', value: buf }); buf = ''; } };
    for (const w of words) {
      if (/^\s+$/.test(w)) { buf += w; continue; }
      const trial = buf + w;
      const cur = lines[lines.length - 1];
      const width = lineWidth([...cur, { kind: 'text', value: trial }], size, lang);
      if (cur.length && width > maxWidth) {
        flush();
        lines.push([]);
        buf = w;
      } else buf = trial;
    }
    flush();
  }
  return lines.filter((l) => l.length);
}

function layoutLine(segs: CaptionSeg[], size: number, lang: Lang): Box {
  const boxes = segs.map((s) => (s.kind === 'math' ? layoutMath(s.value, size, lang) : layoutText(s.value, size, lang)));
  const gap = size * 0.08;
  let a = size * 0.72, d = size * 0.22;
  for (const b of boxes) {
    a = Math.max(a, b.a);
    d = Math.max(d, b.d);
  }
  // distance between neighbours: a small gap plus the real typed spaces on either side of the join
  const between = (i: number) => gap + (boxes[i - 1].sp?.[1] ?? 0) + (boxes[i].sp?.[0] ?? 0);
  const ink: Ink[] = [];
  if (lang === 'ar') {
    // Logical order, packed from the right so the first authoring segment stays rightmost
    // even after wrapping. Reversing each wrapped line independently used to paint ٣−٩√.
    let total = boxes.reduce((w, b) => w + b.w, 0);
    for (let i = 1; i < boxes.length; i++) total += between(i);
    let x = total;
    boxes.forEach((b, i) => {
      x -= b.w;
      ink.push(...shift(b, x, 0).ink);
      if (i < boxes.length - 1) x -= between(i + 1);
    });
    return { w: Math.max(0, total), h: a + d, a, d, ink };
  }
  let x = 0;
  boxes.forEach((b, i) => {
    ink.push(...shift(b, x, 0).ink);
    x += b.w + (i < boxes.length - 1 ? between(i + 1) : 0);
  });
  return { w: Math.max(0, x), h: a + d, a, d, ink };
}

export function layoutCaption(src: string, lang: Lang, size: number, maxWidth?: number): LaidOut {
  const segs = splitCaption(src);
  if (!segs.length) return { w: size * 0.8, h: size, ink: [] };
  const rawLines: CaptionSeg[][] = [[]];
  for (const s of segs) {
    if (s.kind === 'math') { rawLines[rawLines.length - 1].push(s); continue; }
    const parts = s.value.split('\n');
    parts.forEach((p, i) => {
      if (p) rawLines[rawLines.length - 1].push({ kind: 'text', value: p });
      if (i < parts.length - 1) rawLines.push([]);
    });
  }
  const lines = rawLines.flatMap((line) => wrapSegs(line, size, lang, maxWidth));
  const laid = lines.map((line) => layoutLine(line, size, lang));
  const w = Math.max(...laid.map((b) => b.w), size * 0.4);
  let y = 0;
  const ink: Ink[] = [];
  for (const b of laid) {
    const dy = y + b.a;
    ink.push(...shift(b, lang === 'ar' ? w - b.w : 0, dy).ink);
    y += b.h + size * 0.18;
  }
  return { w, h: Math.max(y - size * 0.18, size), ink };
}

export function captionSize(ar: string, en: string, size = 1, maxWidth?: number): { w: number; h: number } {
  const a = layoutCaption(ar, 'ar', size, maxWidth), e = layoutCaption(en, 'en', size, maxWidth);
  return { w: Math.max(a.w, e.w, 0.8), h: Math.max(a.h, e.h, 0.8) };
}
