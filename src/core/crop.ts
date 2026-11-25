import { inferFrame } from './imageFrames';
import { FONT_AR, FONT_EN } from './fonts';
import { dataForLang, geometryOf, placeShape, toUnits } from './scene';
import { axisNumberSize, axisTick, axisTickMarks, axisRayHidden, axisUsesTickUnit, clipAxisLine, equationGeometry, planeOrder, projectAxes, ranges } from './axes';
import { chartLayout } from './chartLayout';
import { formatNumber, localizeFunctionLabel, localizeName as localizeVertexName, renderSymbol, toArabicDigits } from './labels';
import { curveGeometry } from './functions';
import { ARROW_TO_STROKE } from './paper';
import { setInkFit } from './world';
import type { AxisCoord, ShapeInstance } from './types';
import { labelSize } from './labelSizing';
import { placeLabel, placeOutward, type Box, type Obstacles } from './labelPlacement';
import { vertexLabelOf, localizeText, pointLabel, unitLabel } from './labels';
import type { Lang, Ref, SceneData, Vec } from './types';
import { buildWorld, toPx } from './world';
import { CROP_PAD_PT, MARK_TO_STROKE, ptToPx } from './paper';

export const CROP_MESSAGE = 'برجاء تقريب الرموز من النقط الخاصة بها قدر الامكان وعدم ترك فراغات غير مرغوب بها علي جوانب الشكل الاربعة';

export interface InkBox { minX: number; minY: number; maxX: number; maxY: number }

/** Same width the drawing uses when it picks a free spot for a letter. */
const slotW = (t: string, size: number) => t.length * size * 0.56;

const glyphCache = new Map<string, { x: number; y: number; w: number; h: number }>();
let probe: SVGTextElement | null = null;
let inkCanvas: HTMLCanvasElement | null = null;

/** Ink of a letter as drawn: middle anchor, baseline 0.35em below the anchor. */
export function glyphBox(text: string, size: number, lang: Lang, italic: boolean): { x: number; y: number; w: number; h: number } {
  const key = `${lang}|${italic ? 1 : 0}|${size}|${text}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  let box: { x: number; y: number; w: number; h: number };
  if (typeof document !== 'undefined') {
    if (!probe) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;left:-9999px;top:0;overflow:visible';
      probe = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      probe.setAttribute('x', '0');
      probe.setAttribute('y', '0');
      probe.setAttribute('dy', '0.35em');
      probe.setAttribute('text-anchor', 'middle');
      svg.appendChild(probe);
      document.body.appendChild(svg);
    }
    probe.setAttribute('font-size', String(size));
    probe.setAttribute('font-family', lang === 'ar' ? FONT_AR : FONT_EN);
    probe.setAttribute('font-style', italic && lang === 'en' ? 'italic' : 'normal');
    probe.textContent = text;
    const b = probe.getBBox();
    box = { x: b.x, y: b.y, w: Math.max(b.width, 0.5), h: Math.max(b.height, 0.5) };
    /* Tight ink (not the font's em box): the crop and the drag limit stop right after the last ink pixel. */
    try {
      const ctx = (inkCanvas ??= document.createElement('canvas')).getContext('2d');
      if (ctx) {
        ctx.font = `${italic && lang === 'en' ? 'italic ' : ''}${size}px ${lang === 'ar' ? FONT_AR : FONT_EN}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText(text);
        const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent, l = m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight;
        if ([asc, desc, l, r].every(Number.isFinite) && l + r > 0.1 && asc + desc > 0.1) {
          const base = size * 0.35;
          box = { x: -l, y: base - asc, w: l + r, h: asc + desc };
        }
      }
    } catch { /* keep the em box */ }
  } else {
    const w = slotW(text, size) + size * 0.35;
    const above = size * (lang === 'ar' ? 0.75 : 0.5);
    const below = size * (lang === 'ar' ? 1 : 0.65);
    box = { x: -w / 2, y: -above, w, h: above + below };
  }
  /* Fonts load on first use. Measuring before that gives the fallback font's size, so such a measurement is used once and not remembered. */
  let ready = true;
  try {
    if (typeof document !== 'undefined' && document.fonts) {
      const spec = `${italic && lang === 'en' ? 'italic ' : ''}${Math.max(size, 1)}px ${lang === 'ar' ? FONT_AR : FONT_EN}`;
      ready = document.fonts.check(spec, text);
      if (!ready) void document.fonts.load(spec, text).catch(() => undefined);
    }
  } catch { ready = true; }
  if (ready) glyphCache.set(key, box);
  return box;
}

export interface VertexRec { v: Vec; c: Vec; text: string; size: number }
/** Gap between a vertex and the nearest ink of its letter. Every vertex letter in the image is moved to the average gap. */
export function vertexGapShifts(recs: VertexRec[], lang: Lang, italic: boolean): Vec[] {
  if (recs.length < 2) return recs.map((r) => r.c);
  const rectOf = (r: VertexRec, c: Vec) => { const g = glyphBox(r.text, r.size, lang, italic); return { x0: c.x + g.x, y0: c.y + g.y, x1: c.x + g.x + g.w, y1: c.y + g.y + g.h }; };
  const dist = (v: Vec, q: { x0: number; y0: number; x1: number; y1: number }) => Math.hypot(Math.max(q.x0 - v.x, 0, v.x - q.x1), Math.max(q.y0 - v.y, 0, v.y - q.y1));
  const gaps = recs.map((r) => dist(r.v, rectOf(r, r.c)));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return recs.map((r, k) => {
    if (Math.abs(gaps[k] - mean) < 0.3) return r.c;
    const q = rectOf(r, r.c);
    let ux = (q.x0 + q.x1) / 2 - r.v.x, uy = (q.y0 + q.y1) / 2 - r.v.y;
    const L = Math.hypot(ux, uy);
    if (L < 1e-6) return r.c;
    ux /= L; uy /= L;
    const f = (t: number) => dist(r.v, rectOf(r, { x: r.c.x + ux * t, y: r.c.y + uy * t })) - mean;
    let lo = -L, hi = L + Math.max(mean, gaps[k]) * 3 + 50;
    for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return { x: r.c.x + ux * hi, y: r.c.y + uy * hi };
  });
}

function addGlyph(add: (x: number, y: number) => void, at: Vec, text: string, size: number, lang: Lang, italic: boolean) {
  if (!text) return;
  const g = glyphBox(text, size, lang, italic);
  add(at.x + g.x, at.y + g.y);
  add(at.x + g.x + g.w, at.y + g.y + g.h);
}

/** Ink of a chart: the same layout the renderer draws, plus every text (the rotated y title swaps its box). */
function addChartInk(add: (x: number, y: number) => void, data: SceneData, s: ShapeInstance, lang: Lang, italic: boolean) {
  const lay = chartLayout(data, s, lang);
  for (const p of lay.pts) add(p.x, p.y);
  for (const t of lay.texts) {
    if (!t.rot) { addGlyph(add, t.pos, t.text, t.size, lang, !!t.italic && italic); continue; }
    const g = glyphBox(t.text, t.size, lang, false);
    for (const [dx, dy] of [[g.x, g.y], [g.x + g.w, g.y], [g.x, g.y + g.h], [g.x + g.w, g.y + g.h]]) add(t.pos.x + dy, t.pos.y - dx);
  }
}

/** Every ink point of a coordinate-axes shape: arrow tips, axis names (س ص ع / x y z), tick marks and numbers, function labels, point names. Mirrors AxesSvg. */
function addAxesInk(add: (x: number, y: number) => void, data: SceneData, s: ShapeInstance, lang: Lang, italic: boolean) {
  const a = s.axes!;
  const stroke = data.style.stroke, fs = labelSize(data, s, lang), ui = Math.min(data.canvas.w, data.canvas.h) / 900;
  const P = (p: AxisCoord) => toPx(data, toUnits(s, projectAxes(p, a)));
  const nudge = (key: string): Vec => { const n = s.nudgeByLang?.[lang]?.[key] ?? s.nudge[key]; return { x: n?.x ?? 0, y: n?.y ?? 0 }; };
  const glyph = (key: string, pos: Vec, text: string, size: number) => { const n = nudge(key); addGlyph(add, { x: pos.x + n.x, y: pos.y + n.y }, text, size, lang, italic); };
  const number = (n: number) => { const abs = formatNumber(Math.abs(n)), digits = lang === 'ar' ? toArabicDigits(abs) : abs; if (n < -1e-8) return lang === 'ar' ? digits + '−' : '-' + abs; return lang === 'ar' ? digits : formatNumber(n); };
  const tickText = (n: number, key: 'x' | 'y' | 'z') => {
    const sym = axisUsesTickUnit(a, key) ? renderSymbol(a.tickUnit ?? '') : '';
    if (!sym) return number(n);
    const abs = Math.abs(n), coef = abs < 1e-8 ? '0' : Math.abs(abs - 1) < 1e-6 ? '' : formatNumber(abs), ar = lang === 'ar' ? toArabicDigits(coef) : coef, body = lang === 'ar' ? sym + ar : ar + sym;
    if (n < -1e-8) return lang === 'ar' ? body + '−' : '-' + body;
    return body;
  };
  const coord = (p: AxisCoord) => '(' + [p.x, p.y, ...(a.dimension === 3 ? [p.z] : [])].map(number).join(lang === 'ar' ? '، ' : ', ') + ')';
  const zero = { x: 0, y: 0, z: 0 };
  const arrowLen = stroke * ARROW_TO_STROKE, extra = arrowLen + stroke * 3;
  const nScale = axisNumberSize(a);
  for (const r of ranges(s.params, a.dimension)) {
    const p = P({ ...zero, [r.key]: r.min }), q = P({ ...zero, [r.key]: r.max });
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, u = { x: dx / len, y: dy / len }, n = { x: u.y, y: -u.x };
    const pTip = { x: p.x - u.x * extra, y: p.y - u.y * extra }, qTip = { x: q.x + u.x * extra, y: q.y + u.y * extra };
    const hw = arrowLen * 0.42;
    for (const [tip, dir, on] of [[pTip, { x: -u.x, y: -u.y }, r.min < 0], [qTip, u, r.max > 0]] as const) {
      if (!on) continue;
      add(tip.x, tip.y);
      const bx = tip.x - dir.x * arrowLen, by = tip.y - dir.y * arrowLen;
      add(bx - dir.y * hw, by + dir.x * hw); add(bx + dir.y * hw, by - dir.x * hw);
    }
    add(p.x, p.y); add(q.x, q.y);
    glyph('axis:' + r.key, { x: qTip.x + u.x * fs * 0.7, y: qTip.y + u.y * fs * 0.7 }, lang === 'ar' ? ({ x: 'س', y: 'ص', z: 'ع' } as Record<string, string>)[r.key] : r.key, fs);
    const scale = axisTick(a, r.key);
    if (a.grid || a.numbers) for (const mark of axisTickMarks(r.min, r.max, scale.spacing, scale.steps)) {
      const at = P({ ...zero, [r.key]: mark.geo });
      if (!a.numbers) continue;
      add(at.x - n.x * 4 * ui, at.y - n.y * 4 * ui); add(at.x + n.x * 4 * ui, at.y + n.y * 4 * ui);
      if (!axisRayHidden(a, r.key, mark.geo)) {
        const size = fs * 0.64 * nScale;
        const vertical = (a.dimension === 2 && r.key === 'y') || (a.dimension === 3 && r.key === 'z');
        glyph(`tick:${r.key}:${mark.value}`, vertical ? { x: at.x - (size * 0.85 + 5 * ui), y: at.y } : { x: at.x, y: at.y + (size * 0.85 + 5 * ui) }, tickText(mark.value, r.key as 'x' | 'y' | 'z'), size);
      }
    }
  }
  for (const f of a.functions ?? []) {
    const pieces = curveGeometry(f, s.params, a);
    for (const c of pieces) for (const pt of c.pts) { const q = P({ x: pt.x, y: pt.y, z: 0 }); add(q.x, q.y); }
    if (f.showLabel && pieces.length) {
      const target = s.params.xMin + (s.params.xMax - s.params.xMin) * 0.88;
      let best = pieces[0].pts[0];
      for (const c of pieces) for (const pt of c.pts) if (Math.abs(pt.x - target) < Math.abs(best.x - target)) best = pt;
      const q = P({ x: best.x, y: best.y, z: 0 });
      glyph('axis-fn:' + f.id, { x: q.x + fs * 0.7, y: q.y - fs * 0.7 }, localizeFunctionLabel(f.label, lang, data.style), fs * 0.85);
    }
  }
  if (a.showZero ?? a.numbers) { const o = P(zero); glyph('axis:zero', { x: o.x - fs * 0.45, y: o.y + fs * 0.55 }, number(0), fs * 0.64); }
  /* Lines, vectors, planes and equations drawn on the axes are ink too. */
  for (const l of a.lines) {
    const from = a.points.find((p) => p.id === l.a)?.at, to = a.points.find((p) => p.id === l.b)?.at;
    if (!from || !to) continue;
    const ends = l.kind === 'line' ? clipAxisLine(from, to, s.params, a.dimension) : [from, to];
    if (ends) for (const e of ends) { const q = P(e); add(q.x, q.y); }
  }
  for (const plane of a.planes) {
    const coords = plane.points.map((id) => a.points.find((p) => p.id === id)?.at);
    if (coords.some((c) => !c)) continue;
    try { planeOrder(coords as AxisCoord[]); for (const c of coords as AxisCoord[]) { const q = P(c); add(q.x, q.y); } } catch { /* invalid plane is not drawn */ }
  }
  for (const eq of a.equations ?? []) {
    const g = equationGeometry(eq, s.params, a.dimension);
    if (g) for (const e of g) { const q = P(e); add(q.x, q.y); }
  }
  const rr = stroke * 2;
  for (const point of a.points) {
    const p = P(point.at);
    add(p.x - rr, p.y - rr); add(p.x + rr, p.y + rr);
    if (point.showName) glyph('axis-name:' + point.id, { x: p.x + fs * 0.58, y: p.y - fs * 0.6 }, localizeVertexName(point.name, lang, s.caseMode, data.style), fs * 0.8);
    if (point.showCoordinates) glyph('axis-coord:' + point.id, point.coordinatePosition === 'below' ? { x: p.x, y: p.y + fs * 1.05 } : { x: p.x + fs * (0.8 + coord(point.at).length * 0.72 * 0.28), y: p.y + fs * 0.2 }, coord(point.at), fs * 0.72);
  }
}

function shapeObstacles(data: SceneData): Obstacles {
  const obs: Obstacles = { segs: [], circles: [] };
  for (const s of data.shapes) {
    if ((s.axes||s.chart) || s.caption) continue;
    const pl = placeShape(s, data.viewScale, data.canvas);
    if (pl.circle) obs.circles.push({ c: pl.circle.c, r: pl.circle.r });
    const n = pl.pts.length;
    if (n > 1) {
      const last = pl.geo.open || n < 3 ? n - 1 : n;
      for (let i = 0; i < last; i++) obs.segs.push([pl.pts[i], pl.pts[(i + 1) % n]]);
    }
  }
  return obs;
}

/** Axis-aligned ink of shapes, constructions and this language's drawn letters. */
export function inkBoundsPx(rawData: SceneData, lang: Lang = 'en'): InkBox | null {
  const data = dataForLang(rawData, lang);
  if (!data.shapes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  const italic = data.style.italicLetters;
  const taken: Box[] = [];
  const obs = shapeObstacles(data);
  const deferred: (VertexRec & { nudge?: Vec })[] = [];
  const sit = (anchor: Vec, outward: Vec, text: string, size: number, nudge?: Vec, defer = false, fixed = false) => {
    const w = slotW(text, size);
    const h = size * 0.8;
    const c = fixed ? placeOutward(anchor, outward, w, h) : placeLabel(anchor, outward, w, h, obs, taken);
    taken.push({ c, w, h });
    if (defer) { deferred.push({ v: anchor, c, text, size, nudge }); return; }
    addGlyph(add, { x: c.x + (nudge?.x ?? 0), y: c.y + (nudge?.y ?? 0) }, text, size, lang, italic);
  };
  for (const s of data.shapes) {
    const pl = placeShape(s, data.viewScale, data.canvas);
    const size = labelSize(data, s, lang);
    for (const p of [...pl.pts, ...(pl.boundsPts ?? [])]) add(p.x, p.y);
    if (s.axes) addAxesInk(add, data, s, lang, italic);
    if (s.chart) addChartInk(add, data, s, lang, italic);
    if (pl.circle) {
      add(pl.circle.c.x - pl.circle.r, pl.circle.c.y - pl.circle.r);
      add(pl.circle.c.x + pl.circle.r, pl.circle.c.y + pl.circle.r);
    }
    if (pl.circle && s.center.show && s.center.name.trim()) {
      const name = lang === 'ar' && s.center.name.trim().toUpperCase() === 'O' ? 'م' : localizeVertexName(s.center.name, lang, s.caseMode, data.style);
      sit(pl.circle.c, { x: -0.7, y: 0.7 }, name, size, s.nudgeByLang?.[lang]?.c ?? s.nudge.c);
    }
    const n = pl.pts.length;
    if (n) {
      const centroid = { x: pl.pts.reduce((a, p) => a + p.x, 0) / n, y: pl.pts.reduce((a, p) => a + p.y, 0) / n };
      for (let i = 0; i < n; i++) {
        const v = pl.pts[i];
        const nudge = s.nudgeByLang?.[lang]?.[`v${i}`] ?? s.nudge[`v${i}`];
        if (s.showVertexLabels) {
          const text = vertexLabelOf(s, i, lang, data.style);
          if (text && pl.geo.solid) { const o = toPx(data, toUnits(s, { x: 0, y: 0 })); sit(v, { x: v.x - o.x, y: v.y - o.y }, text, size, nudge, false, true); }
          else if (text) sit(v, { x: v.x - centroid.x, y: v.y - centroid.y }, text, size, nudge, true);
        } else if (nudge) add(v.x + nudge.x, v.y + nudge.y);
        const sl = s.sides[i];
        if (sl?.text.trim() && (n >= 3 && !pl.geo.open || i < n - 1)) {
          const next = pl.pts[(i + 1) % n];
          const mid = { x: (v.x + next.x) / 2, y: (v.y + next.y) / 2 };
          const ex = next.x - v.x, ey = next.y - v.y;
          const el = Math.hypot(ex, ey) || 1;
          let nx = -ey / el, ny = ex / el;
          if (nx * (mid.x - centroid.x) + ny * (mid.y - centroid.y) < 0) { nx = -nx; ny = -ny; }
          const raw = localizeText(sl.text.trim(), lang, data.style);
          const text = sl.unit ? `${raw} ${unitLabel(lang)}` : raw;
          const fs = size * 0.9;
          const ext = Math.abs(nx) * slotW(text, fs) * 0.5 + Math.abs(ny) * fs * 0.45;
          const gap = ext + size / 38 * 14;
          const sn = s.nudgeByLang?.[lang]?.[`s${i}`] ?? s.nudge[`s${i}`];
          addGlyph(add, { x: mid.x + nx * gap + (sn?.x ?? 0), y: mid.y + ny * gap + (sn?.y ?? 0) }, text, fs, lang, italic);
        }
      }
    }
  }
  const world = buildWorld(data);
  for (const p of data.points) {
    const u = world.pt.get(p.id);
    if (!u) continue;
    const q = toPx(data, u);
    add(q.x, q.y);
    if (p.showLabel) {
      const own = data.shapes.find((s) => s.id === (p.def.t === 'local' || p.def.t === 'circ' ? p.def.shape : undefined));
      const text = pointLabel(p.name, p.nameAr, lang, own?.caseMode ?? 'upper', data.style).trim();
      if (text) {
        const n = p.nudgeByLang?.[lang] ?? p.nudge;
        const size = labelSize(data, own, lang);
        let at = { x: q.x, y: q.y };
        if (own) {
          const pl = placeShape(own, data.viewScale, data.canvas);
          const pts = pl.pts;
          if (pts.length) {
            const cen = { x: pts.reduce((a, pt) => a + pt.x, 0) / pts.length, y: pts.reduce((a, pt) => a + pt.y, 0) / pts.length };
            const outward = { x: q.x - cen.x, y: q.y - cen.y };
            const c = placeLabel(q, Math.hypot(outward.x, outward.y) < 1e-6 ? { x: 0, y: -1 } : outward, slotW(text, size), size * 0.8, obs, taken);
            taken.push({ c, w: slotW(text, size), h: size * 0.8 });
            at = c;
          }
        }
        addGlyph(add, { x: at.x + (n?.x ?? 0), y: at.y + (n?.y ?? 0) }, text, size, lang, italic);
      }
    }
  }
  for (const l of data.lines) {
    for (const r of [l.a, l.b, ...(l.via ?? [])]) {
      const u = world.ref(r);
      if (u) { const q = toPx(data, u); add(q.x, q.y); }
    }
    if (l.label.text.trim()) {
      const a = world.ref(l.a), b = world.ref(l.b);
      if (a && b) {
        const pa = toPx(data, a), pb = toPx(data, b);
        const raw = localizeText(l.label.text.trim(), lang, data.style);
        const text = l.label.unit ? `${raw} ${unitLabel(lang)}` : raw;
        const n = l.nudgeByLang?.[lang] ?? l.nudge;
        addGlyph(add, { x: (pa.x + pb.x) / 2 + (n?.x ?? 0), y: (pa.y + pb.y) / 2 + (n?.y ?? 0) }, text, data.style.fontSize, lang, italic);
      }
    }
  }
  const markR = data.style.markSize || data.style.stroke * MARK_TO_STROKE;
  const addRef = (r: Ref, pad = markR) => {
    const u = world.ref(r);
    if (!u) return;
    const q = toPx(data, u);
    add(q.x - pad, q.y - pad);
    add(q.x + pad, q.y + pad);
  };
  for (const m of data.marks) {
    if ('at' in m) addRef(m.at, m.kind === 'attachment' ? data.style.stroke * 12 : markR);
    if ('a' in m) addRef(m.a);
    if ('b' in m) addRef(m.b);
    if ('circle' in m) {
      const s = data.shapes.find((x) => x.id === m.circle);
      const circ = s ? geometryOf(s).circle : undefined;
      if (s && circ) {
        const a = (m.angle * Math.PI) / 180;
        const q = toPx(data, toUnits(s, { x: (circ.cx ?? 0) + circ.r * Math.cos(a), y: (circ.cy ?? 0) + circ.r * Math.sin(a) }));
        add(q.x - markR, q.y - markR);
        add(q.x + markR, q.y + markR);
      }
    }
  }
  const adj = vertexGapShifts(deferred, lang, italic);
  deferred.forEach((r, k) => addGlyph(add, { x: adj[k].x + (r.nudge?.x ?? 0), y: adj[k].y + (r.nudge?.y ?? 0) }, r.text, r.size, lang, italic));
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function cropViewBox(data: SceneData, lang: Lang): { x: number; y: number; w: number; h: number } | null {
  const box = inkBoundsPx(data, lang);
  if (!box) return null;
  const pad = ptToPx(CROP_PAD_PT);
  const w = Math.min(4000, Math.max(1, box.maxX - box.minX + 2 * pad));
  const h = Math.min(4000, Math.max(1, box.maxY - box.minY + 2 * pad));
  return { x: box.minX - pad, y: box.minY - pad, w, h };
}

function shiftScene(data: SceneData, w: number, h: number, deltaSx: number, deltaSy: number): SceneData {
  return {
    ...data,
    canvas: { w, h },
    shapes: data.shapes.map((s) => ({ ...s, offset: { x: s.offset.x + deltaSx, y: s.offset.y + deltaSy } })),
    points: data.points.map((p) => p.def.t === 'world' ? { ...p, def: { ...p.def, x: p.def.x + deltaSx, y: p.def.y + deltaSy } } : p),
  };
}

function snapCanvasToBox(data: SceneData, box: InkBox, maxW = 4000, maxH = 4000): SceneData {
  const pad = ptToPx(CROP_PAD_PT);
  const inkW = box.maxX - box.minX;
  const inkH = box.maxY - box.minY;
  const w = Math.min(maxW, Math.max(1, Math.ceil(inkW + 2 * pad)));
  const h = Math.min(maxH, Math.max(1, Math.ceil(inkH + 2 * pad)));
  const insetX = (w - inkW) / 2;
  const insetY = (h - inkH) / 2;
  const vs = data.viewScale || 1;
  const deltaSx = (data.canvas.w / 2 - w / 2 - box.minX + insetX) / vs;
  const deltaSy = (h / 2 - data.canvas.h / 2 + box.minY - insetY) / vs;
  if (w === data.canvas.w && h === data.canvas.h && Math.abs(deltaSx) < 1e-6 && Math.abs(deltaSy) < 1e-6) return data;
  return shiftScene(data, w, h, deltaSx, deltaSy);
}

export function unionInkBounds(data: SceneData): InkBox | null {
  const boxes = (['ar', 'en'] as const).map((lang) => inkBoundsPx(data, lang)).filter((b): b is InkBox => !!b);
  if (!boxes.length) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** Shrink (or grow within the frame max) so the canvas ends at the figure, labels and constructions. Does not rescale the drawing. */
export function fitCanvasToInk(data: SceneData): SceneData {
  const box = unionInkBounds(data);
  if (!box) return data;
  const frame = inferFrame(data.canvas.w, data.canvas.h);
  return snapCanvasToBox(data, box, frame.maxW, frame.maxH);
}

/** Pull the canvas in until this language's ink sits about 1.5pt from every edge. */
export function cropScene(data: SceneData, lang: Lang = 'en'): { scene: SceneData; changed: boolean } {
  const box = inkBoundsPx(data, lang);
  if (!box) return { scene: data, changed: false };
  const scene = snapCanvasToBox(data, box);
  const changed = scene.canvas.w !== data.canvas.w || scene.canvas.h !== data.canvas.h
    || scene.viewScale !== data.viewScale
    || scene.shapes.some((s, i) => s.offset.x !== data.shapes[i]?.offset.x || s.offset.y !== data.shapes[i]?.offset.y);
  return { scene, changed };
}

/** After the unit-based fit, resize/recentre so the *ink* (arrow tips, axis letters, numbers, labels) fills the image, not the bare axis range. Only for scenes with axes. */
setInkFit((data: SceneData): SceneData => {
  if (!data.shapes.some((s) => s.axes || s.chart)) return data;
  let d = data;
  for (let i = 0; i < 10; i++) {
    const box = unionInkBounds(d);
    if (!box) return d;
    const w = Math.max(box.maxX - box.minX, 1), h = Math.max(box.maxY - box.minY, 1);
    const tw = d.canvas.w * d.style.fill, th = d.canvas.h * d.style.fill;
    const k = Math.min(Math.max(Math.min(tw / w, th / h), 0.5), 2);
    const vs = d.viewScale;
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
    const dx = (d.canvas.w / 2 - cx) / vs, dy = -(d.canvas.h / 2 - cy) / vs;
    if (Math.abs(k - 1) < 0.004 && Math.hypot(dx, dy) * vs < 0.5) break;
    d = {
      ...d,
      viewScale: vs * k,
      shapes: d.shapes.map((s) => ({ ...s, offset: { x: s.offset.x + dx, y: s.offset.y + dy } })),
      points: d.points.map((p) => (p.def.t === 'world' ? { ...p, def: { ...p.def, x: p.def.x + dx, y: p.def.y + dy } } : p)),
    };
  }
  return d;
});
