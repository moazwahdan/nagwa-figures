import { parse, type Font, type Path } from 'opentype.js';
import { shapeArabicRun } from './arabicShape';
import nagwaArabicMathUrl from '../assets/fonts/NagwaArabicMath-12-25.otf?url';
import nagwaMathUrl from '../assets/fonts/NagwaMath.otf?url';
import notoRegularUrl from '../assets/fonts/Noto-Regular.ttf?url';
import stix2RegularUrl from '../assets/fonts/STIX2Text-Regular.otf?url';
import stix2ItalicUrl from '../assets/fonts/STIX2Text-Italic.otf?url';

/**
 * Outline fonts only (OTF/TTF). woff2 (KaTeX_*) cannot be parsed by opentype.js.
 * font.getPath() applies GSUB and throws on Noto Arabic; use isolated glyph.getPath().
 */
const FACE_URLS: Record<string, string> = {
  NagwaArabicMath: nagwaArabicMathUrl,
  NagwaMath: nagwaMathUrl,
  Noto: notoRegularUrl,
  STIX2: stix2RegularUrl,
  STIX2Italic: stix2ItalicUrl,
};

const fontCache = new Map<string, Promise<Font>>();

async function loadFace(name: keyof typeof FACE_URLS): Promise<Font> {
  const url = FACE_URLS[name];
  let p = fontCache.get(url);
  if (!p) {
    p = fetch(url).then(async (res) => parse(new Uint8Array(await res.arrayBuffer()).buffer));
    fontCache.set(url, p);
  }
  return p;
}

function preferredFaces(family: string, italic: boolean, raw = ''): Array<keyof typeof FACE_URLS> {
  const faces: Array<keyof typeof FACE_URLS> = [];
  if (/[\u{1EE00}-\u{1EEFF}]/u.test(raw) || /[\u0660-\u0669\u06F0-\u06F9]/.test(raw)) faces.push('NagwaArabicMath');
  if (/[\u0600-\u065F\u0670-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(raw)) faces.push('Noto');
  if (/NagwaArabicMath|AltArabic|KaTeX_Looped/i.test(family)) faces.push('NagwaArabicMath');
  if (/NagwaMath/i.test(family) && !/Arabic/i.test(family)) faces.push('NagwaMath');
  if (/KaTeX_Main|KaTeX_Math/i.test(family)) {
    if (/NagwaArabicMath|AltArabic/i.test(family)) faces.push('NagwaArabicMath');
    else faces.push('NagwaMath');
  }
  if (/KaTeX_Size/i.test(family)) faces.push('NagwaMath', 'NagwaArabicMath');
  if (/Noto|FigArabic|Naskh/i.test(family)) faces.push('Noto');
  if (/STIX|FigSerif/i.test(family) || italic) faces.push(italic ? 'STIX2Italic' : 'STIX2');
  faces.push(italic ? 'STIX2Italic' : 'STIX2', 'STIX2', 'NagwaMath', 'Noto', 'NagwaArabicMath');
  return [...new Set(faces)];
}

function arabicLetter(ch: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(ch);
}

function pathCommandsToD(
  commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }>,
  x: number,
  y: number,
  rotDeg: number,
  sx = 1,
): string {
  const a = (rotDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const bits: string[] = [];
  const xy = (px: number, py: number) => {
    const qx = px * sx, qy = py * sx;
    const rx = x + qx * c - qy * s;
    const ry = y + qx * s + qy * c;
    return `${rx} ${ry}`;
  };
  for (const cmd of commands) {
    if (cmd.type === 'M') bits.push(`M ${xy(cmd.x!, cmd.y!)}`);
    else if (cmd.type === 'L') bits.push(`L ${xy(cmd.x!, cmd.y!)}`);
    else if (cmd.type === 'C') bits.push(`C ${xy(cmd.x1!, cmd.y1!)} ${xy(cmd.x2!, cmd.y2!)} ${xy(cmd.x!, cmd.y!)}`);
    else if (cmd.type === 'Q') bits.push(`Q ${xy(cmd.x1!, cmd.y1!)} ${xy(cmd.x!, cmd.y!)}`);
    else if (cmd.type === 'Z') bits.push('Z');
  }
  return bits.join(' ');
}

function outlineChar(ch: string, fonts: Font[], size: number, fallback?: string): { path: Path; advance: number } | null {
  const nfkc = ch.normalize('NFKC');
  const tryChars = [...new Set([ch, fallback, nfkc].filter((c): c is string => !!c))];
  for (const font of fonts) {
    for (const candidate of tryChars) {
      const g = font.charToGlyph(candidate);
      if (!g || g.index === 0) continue;
      const path = g.getPath(0, 0, size);
      const advance = ((g.advanceWidth || 0) * size) / (font.unitsPerEm || 1000);
      if (!path.commands.length) continue;
      return { path, advance };
    }
  }
  return null;
}

function familyOf(el: SVGTextElement): { family: string; italic: boolean; size: number; fill: string } {
  const cs = getComputedStyle(el);
  const attrSize = parseFloat(el.getAttribute('font-size') || '');
  return {
    family: `${el.getAttribute('font-family') || ''} ${cs.fontFamily || ''}`,
    italic: cs.fontStyle === 'italic' || el.getAttribute('font-style') === 'italic',
    size: (Number.isFinite(attrSize) && attrSize > 0 ? attrSize : parseFloat(cs.fontSize)) || 12,
    fill: (cs.fill && cs.fill !== 'none' ? cs.fill : null) || el.getAttribute('fill') || '#000',
  };
}

function charSlots(el: SVGTextElement, raw: string): Array<{ ch: string; index: number }> {
  // Walk the string, not getNumberOfChars(): SVG often omits leading/trailing
  // spaces from the char count, which dropped the trailing 't' of "limit"/"root".
  void el;
  const points = [...raw];
  let u = 0;
  return points.map((ch) => {
    const index = u;
    u += ch.codePointAt(0)! > 0xffff ? 2 : 1;
    return { ch, index };
  });
}

function positionOf(el: SVGTextElement, index: number): { x: number; y: number; rot: number } | null {
  try {
    const p = el.getStartPositionOfChar(index);
    const rot = el.getRotationOfChar(index) || 0;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y, rot };
  } catch {
    return null;
  }
}

/** Replace laid-out SVG <text> with <path> using isolated OpenType glyphs (no GSUB). */
export async function convertSvgTextToPaths(root: SVGSVGElement): Promise<{ converted: number; leftover: number; missing: string[] }> {
  await document.fonts.ready;
  const loaded = {
    NagwaArabicMath: await loadFace('NagwaArabicMath'),
    NagwaMath: await loadFace('NagwaMath'),
    Noto: await loadFace('Noto'),
    STIX2: await loadFace('STIX2'),
    STIX2Italic: await loadFace('STIX2Italic'),
  };
  const nodes = Array.from(root.querySelectorAll('text'));
  let converted = 0;
  const missing: string[] = [];
  const ns = root.ownerDocument ?? document;
  for (const el of nodes) {
    const raw = el.textContent ?? '';
    if (!raw.trim()) { el.remove(); continue; }
    const { family, italic, size, fill } = familyOf(el);
    const fonts = preferredFaces(family, italic, raw).map((name) => loaded[name as keyof typeof loaded]);
    const slots = charSlots(el, raw);
    const shaped = shapeArabicRun(raw);
    const letters = [...raw.replace(/\s+/g, '')];
    const mathRun = el.getAttribute('data-qms-math-run') === '1' || !!el.closest('svg[data-qms-math]');
    const arabicRun = !mathRun && letters.length > 0 && letters.every((ch) => arabicLetter(ch) || /[\u0660-\u0669\u06F0-\u06F9]/.test(ch));
    const parts: string[] = [];
    let cursorX: number | null = null;
    let cursorY: number | null = null;
    let box: DOMRect | null = null;
    try {
      box = el.getBBox();
      cursorX = box.x;
      cursorY = box.y + size * 0.8;
    } catch { /* keep null; positions come from getStartPositionOfChar */ }
    if (arabicRun && box) {
      const glyphs = shaped
        .map((ch, i) => ({ ch, logical: [...raw][i] ?? ch, outlined: outlineChar(ch, fonts, size, [...raw][i]) }))
        .filter((g) => g.ch !== '\n' && g.ch !== '\u200b');
      const total = glyphs.reduce((w, g) => w + (g.outlined?.advance ?? size * 0.35), 0);
      let x = box.x + box.width / 2 + total / 2;
      const y = box.y + box.height * 0.8;
      for (const g of glyphs) {
        if (g.ch === ' ' || g.ch === '\u00a0') { x -= size * 0.3; continue; }
        if (!g.outlined) { missing.push(g.ch); continue; }
        x -= g.outlined.advance;
        const d = pathCommandsToD(g.outlined.path.commands, x, y, 0);
        if (d) parts.push(d);
      }
    } else {
    const spaced = /\s/.test(raw) && el.getAttribute('text-anchor') !== 'middle';
    const origin = positionOf(el, 0);
    if (spaced && origin) {
      cursorX = origin.x;
      cursorY = origin.y;
    }
    for (const slot of slots) {
      const logical = slot.ch;
      const ch = arabicLetter(logical) ? (shaped[slot.index] ?? logical) : logical;
      if (logical === '\n' || logical === '\u200b') continue;
      if (logical === ' ' || logical === '\u00a0') {
        if (cursorX != null) cursorX += size * 0.28;
        else {
          const pos = positionOf(el, slot.index);
          if (pos) { cursorX = pos.x + size * 0.28; cursorY = pos.y; }
        }
        continue;
      }
      const outlined = outlineChar(ch, fonts, size, logical);
      if (!outlined) {
        missing.push(ch);
        continue;
      }
      const pos = spaced ? null : positionOf(el, slot.index);
      const x = pos?.x ?? cursorX ?? 0;
      const y = pos?.y ?? cursorY ?? 0;
      const rot = pos?.rot ?? 0;
      const d = pathCommandsToD(outlined.path.commands, x, y, rot);
      if (d) parts.push(d);
      cursorX = x + outlined.advance;
      cursorY = y;
    }
    }
    if (!parts.length) { continue; }
    const path = ns.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', parts.join(' '));
    path.setAttribute('fill', fill);
    const tr = el.getAttribute('transform');
    if (tr) path.setAttribute('transform', tr);
    path.setAttribute('data-from-text', raw.slice(0, 80));
    el.replaceWith(path);
    converted += 1;
  }
  return { converted, leftover: root.querySelectorAll('text').length, missing };
}
