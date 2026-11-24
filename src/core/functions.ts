import type { AxesSettings, AxisFunction, ShapeInstance, Vec } from './types';
function tickOf(a: AxesSettings | undefined, key: 'x' | 'y') {
  const t = a?.axisTicks?.[key];
  const spacing = t?.spacing && t.spacing > 0 ? t.spacing : a?.step && a.step > 0 ? a.step : 1;
  const steps = t?.steps && t.steps > 0 ? t.steps : a?.numberStep && a.numberStep > 0 ? a.numberStep : spacing;
  return { spacing, steps };
}
function unitX(a: AxesSettings | undefined) {
  if (!a || !(a.tickUnit ?? '').trim()) return 1;
  if (a.tickUnitOn !== undefined && !a.tickUnitOn.includes('x')) return 1;
  const raw = (a.tickUnit ?? '').trim().toLowerCase().replace(/^\\/, '');
  return raw === 'pi' || raw === 'π' ? Math.PI : 1;
}

/**
 * Safe math-expression engine for y = f(x). No eval / Function: a tokenizer and a
 * recursive-descent parser build a closure tree from a fixed list of operators and functions.
 */
type F = (x: number) => number;
export interface Compiled { fn: F; usesX: boolean }

const MAX_LENGTH = 200, MAX_TOKENS = 240, MAX_DEPTH = 40;
const HINT = 'Use x, e, pi, + - * / ^, parentheses and functions such as sin(x), ln(x), log(x), log_2(x), sqrt(x).';

const FUNCTIONS: Record<string, F> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  cot: x => 1 / Math.tan(x), sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10,
};
const FUNCTION_NAMES = [...Object.keys(FUNCTIONS)].sort((a, b) => b.length - a.length);
const CONSTANTS: Record<string, number> = { e: Math.E, pi: Math.PI };

function normalize(text: string): string {
  const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
  return String(text).toLowerCase()
    .replace(/[٠-٩]/g, c => String(AR.indexOf(c))).replace(/[۰-۹]/g, c => String(FA.indexOf(c)))
    .replace(/٫/g, '.').replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/')
    .replace(/\*\*/g, '^').replace(/س/g, 'x').replace(/π/g, 'pi').replace(/،/g, ',')
    .replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/, '');
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };
function tokenize(src: string): Tok[] {
  const toks: Tok[] = [], re = /\s*(?:(\d+\.?\d*|\.\d+)|([a-z]+(?:_[a-z0-9.]+)?)|([-+*/^(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected character "${src.slice(pos).trim()[0]}". ${HINT}`);
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) toks.push({ t: 'id', v: m[2] });
    else toks.push({ t: 'op', v: m[3] });
    if (toks.length > MAX_TOKENS) throw new Error('This expression is too long.');
  }
  return toks;
}

function power(base: number, exp: number): number {
  if (base >= 0 || Number.isInteger(exp)) return Math.pow(base, exp);
  // negative base with a fractional exponent: real result only for odd denominators, e.g. x^(1/3)
  for (let q = 3; q <= 99; q += 2) {
    const k = exp * q;
    if (Math.abs(k - Math.round(k)) < 1e-9) return (Math.round(k) % 2 === 0 ? 1 : -1) * Math.pow(-base, exp);
  }
  return NaN;
}
const logBase = (b: number): F => b === 2 ? Math.log2 : b === 10 ? Math.log10 : x => Math.log(x) / Math.log(b);
function checkBase(b: number) { if (!(b > 0) || b === 1 || !Number.isFinite(b)) throw new Error('The logarithm base must be a positive number other than 1.'); }

class Parser {
  i = 0; usesX = false; depth = 0;
  constructor(readonly toks: Tok[]) {}
  peek() { return this.toks[this.i]; }
  isOp(v: string) { const t = this.peek(); return t?.t === 'op' && t.v === v; }
  expect(v: string) { if (!this.isOp(v)) throw new Error(this.peek() ? `Expected "${v}" but found "${(this.peek() as { v: unknown }).v}".` : `Expression is incomplete: missing "${v}".`); this.i++; }
  parseAll(): F {
    if (!this.toks.length) throw new Error('Enter an expression, for example x^2 - 3x + 1.');
    const f = this.expr();
    if (this.peek()) throw new Error(`Unexpected "${(this.peek() as { v: unknown }).v}". Use * between factors (2*x) or ^ for powers (x^3). ${HINT}`);
    return f;
  }
  expr(): F {
    let l = this.term();
    while (this.isOp('+') || this.isOp('-')) { const plus = (this.toks[this.i++] as { v: string }).v === '+', r = this.term(), a = l; l = plus ? x => a(x) + r(x) : x => a(x) - r(x); }
    return l;
  }
  startsPrimary() { const t = this.peek(); return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(')); }
  term(): F {
    let l = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) { const mul = (this.toks[this.i++] as { v: string }).v === '*', r = this.unary(), a = l; l = mul ? x => a(x) * r(x) : x => a(x) / r(x); }
      else if (this.startsPrimary() && this.peek().t !== 'num') { const r = this.pow(), a = l; l = x => a(x) * r(x); } // implicit multiplication: 2x, 3(x+1), x sin(x)
      else return l;
    }
  }
  unary(): F {
    if (this.isOp('-')) { this.i++; const f = this.unary(); return x => -f(x); }
    if (this.isOp('+')) { this.i++; return this.unary(); }
    return this.pow();
  }
  pow(): F {
    const base = this.primary();
    if (this.isOp('^')) { this.i++; const exp = this.unary(); return x => power(base(x), exp(x)); }
    return base;
  }
  primary(): F {
    const t = this.peek();
    if (!t) throw new Error('Expression is incomplete.');
    this.i++;
    if (t.t === 'num') { const v = t.v; return () => v; }
    if (t.t === 'op') {
      if (t.v !== '(') throw new Error(`Unexpected "${t.v}". ${HINT}`);
      if (++this.depth > MAX_DEPTH) throw new Error('Too many nested parentheses.');
      const f = this.expr(); this.expect(')'); this.depth--; return f;
    }
    return this.identifier(t.v);
  }
  args(): F[] {
    this.expect('(');
    if (++this.depth > MAX_DEPTH) throw new Error('Too many nested parentheses.');
    const out = [this.expr()];
    while (this.isOp(',')) { this.i++; out.push(this.expr()); }
    this.expect(')'); this.depth--; return out;
  }
  identifier(name: string): F {
    const call = this.isOp('(');
    const logUnder = /^log_(.+)$/.exec(name);
    if (logUnder) {
      if (!call) throw new Error(`Write ${name}(x) with parentheses.`);
      const raw = logUnder[1], base = raw in CONSTANTS ? CONSTANTS[raw] : /^(\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isFinite(base)) throw new Error(`"${name}": the base after log_ must be a number, e or pi, for example log_2(x).`);
      checkBase(base);
      const [arg, ...rest] = this.args(); if (rest.length) throw new Error(`${name} takes one argument.`);
      const g = logBase(base); return x => g(arg(x));
    }
    // possibly several glued factors, e.g. xe, 2xpi, xsin(x)
    const items: F[] = [];
    let i = 0;
    while (i < name.length) {
      const fn = call ? FUNCTION_NAMES.find(n => name.startsWith(n, i) && i + n.length === name.length) : undefined;
      if (fn) {
        if (fn === 'log' && this.argsLookTwo()) {
          this.expect('('); if (++this.depth > MAX_DEPTH) throw new Error('Too many nested parentheses.');
          const arg = this.expr(); this.expect(',');
          const before = this.usesX; this.usesX = false;
          const b = this.expr(), baseUsesX = this.usesX; this.usesX = before || baseUsesX;
          if (this.isOp(',')) throw new Error('log takes at most two arguments: log(x) or log(x, base).');
          this.expect(')'); this.depth--;
          if (!baseUsesX) checkBase(b(0));
          items.push(x => { const bv = b(x); return bv > 0 && bv !== 1 ? logBase(bv)(arg(x)) : NaN; });
        } else {
          const [arg, ...rest] = this.args(); if (rest.length) throw new Error(`${fn} takes one argument.`);
          const g = FUNCTIONS[fn]; items.push(x => g(arg(x)));
        }
        i = name.length;
      } else if (name.startsWith('pi', i)) { items.push(() => Math.PI); i += 2; }
      else if (name[i] === 'x') { this.usesX = true; items.push(x => x); i++; }
      else if (name[i] === 'e') { items.push(() => Math.E); i++; }
      else {
        const word = name.slice(i);
        if (FUNCTION_NAMES.includes(word) || word in FUNCTIONS) throw new Error(`Write ${word}(…) with parentheses, for example ${word}(x).`);
        throw new Error(`Unknown name "${name}". ${HINT}`);
      }
    }
    return items.length === 1 ? items[0] : x => items.reduce((p, f) => p * f(x), 1);
  }
  /** true when the upcoming parenthesis group has a top-level comma */
  argsLookTwo(): boolean {
    let d = 0;
    for (let j = this.i; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.t !== 'op') continue;
      if (t.v === '(') d++; else if (t.v === ')') { d--; if (d === 0) return false; } else if (t.v === ',' && d === 1) return true;
    }
    return false;
  }
}

export function compileFunction(text: string): Compiled {
  if (typeof text !== 'string' || text.length > MAX_LENGTH) throw new Error(`Expressions can be at most ${MAX_LENGTH} characters.`);
  const p = new Parser(tokenize(normalize(text)));
  const fn = p.parseAll();
  return { fn, usesX: p.usesX };
}

/** A constant expression such as -pi, 2*pi or 3.5 (used for domain ends). */
export function evalConstant(text: string, label = 'Value'): number {
  const c = compileFunction(text);
  if (c.usesX) throw new Error(`${label} cannot contain x.`);
  const v = c.fn(0);
  if (!Number.isFinite(v)) throw new Error(`${label} must be a finite number.`);
  return v;
}

/* ---------- sampling ---------- */
export interface Rect { xMin: number; xMax: number; yMin: number; yMax: number }
export interface CurvePiece { pts: Vec[]; startClipped: boolean; endClipped: boolean }
const SAMPLES = 1600, MAX_DEPTH_SPLIT = 16, EVAL_BUDGET = 150000;

/** Sample f over [x0,x1]; breaks the path at undefined values, poles and jumps. */
export function sampleCurve(f: F, x0: number, x1: number, yMin: number, yMax: number): Vec[][] {
  const yr = yMax - yMin, out: Vec[][] = [];
  let cur: Vec[] = [], budget = EVAL_BUDGET;
  const val = (x: number) => { const y = f(x); return Number.isFinite(y) ? y : NaN; };
  const ok = (y: number) => y === y;
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  const link = (xa: number, ya: number, xb: number, yb: number, depth: number): void => {
    const oka = ok(ya), okb = ok(yb);
    if (oka && okb) {
      const farSame = (ya > yMax + yr && yb > yMax + yr) || (ya < yMin - yr && yb < yMin - yr);
      if (Math.abs(yb - ya) <= 0.15 * yr || farSame) { cur.push({ x: xb, y: yb }); return; }
      if (depth >= MAX_DEPTH_SPLIT || budget-- <= 0) { flush(); cur.push({ x: xb, y: yb }); return; } // jump or pole
      const xm = (xa + xb) / 2, ym = val(xm);
      link(xa, ya, xm, ym, depth + 1); link(xm, ym, xb, yb, depth + 1);
      return;
    }
    if (!oka && !okb) { flush(); return; }
    // one end defined: locate the edge of the domain by bisection
    let lo = oka ? xa : xb, hi = oka ? xb : xa, ylo = oka ? ya : yb;
    for (let k = 0; k < 44; k++) { const m = (lo + hi) / 2, ym = val(m); if (ok(ym)) { lo = m; ylo = ym; } else hi = m; }
    if (oka) { cur.push({ x: lo, y: ylo }); flush(); } else { flush(); cur = [{ x: lo, y: ylo }, { x: xb, y: yb }]; }
  };
  let px = x0, py = val(x0);
  if (ok(py)) cur = [{ x: px, y: py }];
  for (let i = 1; i <= SAMPLES; i++) {
    const x = i === SAMPLES ? x1 : x0 + (x1 - x0) * i / SAMPLES, y = val(x);
    link(px, py, x, y, 0); px = x; py = y;
  }
  flush();
  // join pieces separated only by a removable point (e.g. sin(x)/x at 0): negligible gap in x and in y
  const merged: Vec[][] = [];
  for (const piece of out) {
    const prev = merged[merged.length - 1];
    if (prev) { const a = prev[prev.length - 1], b = piece[0]; if (b.x - a.x < (x1 - x0) * 1e-6 && Math.abs(b.y - a.y) < 1e-3 * yr) { prev.push(...piece); continue; } }
    merged.push(piece);
  }
  return merged;
}

function clipSegment(a: Vec, b: Vec, r: Rect, tol: number) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y, p = [-dx, dx, -dy, dy], q = [a.x - r.xMin + tol, r.xMax + tol - a.x, a.y - r.yMin, r.yMax - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return { a: t0 > 0 ? { x: a.x + dx * t0, y: a.y + dy * t0 } : a, b: t1 < 1 ? { x: a.x + dx * t1, y: a.y + dy * t1 } : b, ca: t0 > 0, cb: t1 < 1 };
}

/** Clip polylines to the visible axes rectangle; remembers which ends were cut by the frame. */
export function clipPolylines(lines: Vec[][], r: Rect): CurvePiece[] {
  const out: CurvePiece[] = [], tol = (r.xMax - r.xMin) * 1e-9;
  for (const line of lines) {
    let cur: CurvePiece | null = null;
    const close = (endClipped: boolean) => { if (cur && cur.pts.length > 1) { cur.endClipped = endClipped; out.push(cur); } cur = null; };
    for (let i = 1; i < line.length; i++) {
      const c = clipSegment(line[i - 1], line[i], r, tol);
      if (!c) { close(false); continue; }
      if (!cur || c.ca) { close(false); cur = { pts: [c.a], startClipped: c.ca, endClipped: false }; if (i === 1 && !c.ca) cur.startClipped = false; }
      cur.pts.push(c.b);
      if (c.cb) close(true);
    }
    close(false);
  }
  return out;
}

const cache = new Map<string, CurvePiece[]>();
const compiledCache = new Map<string, Compiled>();
export function compiled(expr: string): Compiled {
  let c = compiledCache.get(expr);
  if (!c) { c = compileFunction(expr); if (compiledCache.size > 200) compiledCache.clear(); compiledCache.set(expr, c); }
  return c;
}

/** Visible pieces of the curve in axis coordinates (geometry). Domain `from`/`to` are tick values. */
export function curveGeometry(fnDef: AxisFunction, params: Record<string, number>, axes?: AxesSettings): CurvePiece[] {
  const tx = tickOf(axes, 'x'), ty = tickOf(axes, 'y'), ux = unitX(axes);
  const r: Rect = { xMin: params.xMin, xMax: params.xMax, yMin: params.yMin, yMax: params.yMax };
  const toGeo = (tick: number) => tick * tx.spacing / tx.steps;
  const x0 = Math.max(r.xMin, fnDef.from !== undefined ? toGeo(fnDef.from) : -Infinity);
  const x1 = Math.min(r.xMax, fnDef.to !== undefined ? toGeo(fnDef.to) : Infinity);
  if (!(x1 > x0)) return [];
  const key = [fnDef.expr, x0, x1, r.yMin, r.yMax, tx.spacing, tx.steps, ty.spacing, ty.steps, ux].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = compiled(fnDef.expr).fn;
  const fn = (geoX: number) => raw(geoX * tx.steps / tx.spacing * ux) * ty.spacing / ty.steps;
  const pieces = clipPolylines(sampleCurve(fn, x0, x1, r.yMin, r.yMax), r);
  // a curve running on to the left/right edge of the axes (not cut short by its own domain) also leaves the axes
  for (const c of pieces) {
    if (x0 === r.xMin && c.pts[0].x === x0) c.startClipped = true;
    if (x1 === r.xMax && c.pts[c.pts.length - 1].x === x1) c.endClipped = true;
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, pieces);
  return pieces;
}

export function validateFunctions(s: Pick<ShapeInstance, 'axes'>) {
  const a = s.axes!, items = a.functions ?? [];
  if (!Array.isArray(items) || items.length > 20) throw new Error('Maximum 20 functions per axes system.');
  if (items.length && a.dimension !== 2) throw new Error('Function curves are available only on 2D axes.');
  const ids = new Set([...a.points ?? [], ...a.lines ?? [], ...a.planes ?? [], ...a.equations ?? []].map(p => p.id));
  for (const f of items) {
    if (!f || typeof f.id !== 'string' || !f.id || ids.has(f.id)) throw new Error('Function IDs must be unique.');
    ids.add(f.id);
    if (typeof f.expr !== 'string' || typeof f.dashed !== 'boolean' || typeof f.arrows !== 'boolean' || typeof f.showLabel !== 'boolean' || typeof f.label !== 'string' || f.label.length > 24) throw new Error('Invalid function settings.');
    compileFunction(f.expr);
    for (const k of ['from', 'to'] as const) if (f[k] !== undefined && (typeof f[k] !== 'number' || !Number.isFinite(f[k]) || Math.abs(f[k]!) > 1e6)) throw new Error('Invalid function domain.');
    if (f.from !== undefined && f.to !== undefined && !(f.from < f.to)) throw new Error('The domain start must be smaller than its end.');
  }
}
