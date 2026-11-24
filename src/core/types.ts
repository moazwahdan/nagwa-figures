export type Lang = 'ar' | 'en';

export interface ProjectSettings {
  fileName: string;
  theme: 'light' | 'dark';
  lockAll: boolean;
  separateLabels: boolean;
}
export type Vec = { x: number; y: number };
export type ConstructionPlane = 'xy' | 'xz' | 'yz';

export type ShapeKind =
  | 'triangle'
  | 'square'
  | 'rectangle'
  | 'rhombus'
  | 'parallelogram'
  | 'trapezoid'
  | 'polygon'
  | 'circle'
  | 'solid'
  | 'axes'
  | 'mechanics'
  | 'caption';
export type DrawingKit = 'geometry' | 'mechanics' | 'free';

/** Particle/block sitting on a support: scale/size keep this contact while the body grows into free space. */
export type SitContact = { at: Vec; along: Vec };

export interface SideLabel {
  /** Text shown on the side. Empty string = hidden. */
  text: string;
  /** Append the unit (cm / سم). */
  unit: boolean;
}

export interface AngleLabel {
  show: boolean;
  /** Empty = auto (computed from the drawn geometry). */
  text: string;
  arc: boolean;
}

export interface SolidSettings {
  projection: 'cabinet' | 'orthographic';
  angle: number;
  depth: number;
  yaw: number;
  showHidden: boolean;
  showHeight: boolean;
  showRadius: boolean;
  showDiagonal: boolean;
  labels: Record<'height' | 'radius' | 'diagonal', SideLabel>;
}

/** Free bilingual note on the drawing. Write each language by hand. Math uses $...$: $x^2$. */
export interface FigureCaption {
  ar: string;
  en: string;
}

export interface ShapeInstance {
  id: string;
  defId: string; // key in SHAPE_DEFS
  solid?: SolidSettings;
  axes?: AxesSettings;
  caption?: FigureCaption;
  /** Extra shift (scene units) so each language's image keeps its own edge limits when dragging. */
  langShift?: { ar?: Vec; en?: Vec };
  /** Arabic letter picked per vertex (null / missing = derived from the English name). */
  namesAr?: (string | null)[];
  /** Per-shape mechanics ink multiplier. Defaults to 1. */
  mechanicsStroke?: number;
  params: Record<string, number>;
  /** Offset from the image center, in scene units (y up). */
  offset: Vec;
  /** Degrees, counter-clockwise. */
  rotation: number;
  /** User scale multiplier (uniform). */
  scale: number;
  /** Extra stretch. 1 = none. Combined with `scale`. */
  scaleX?: number;
  scaleY?: number;
  flipX: boolean;
  flipY: boolean;
  /** Canonical (English, upper-case) vertex names. */
  names: string[];
  caseMode: 'upper' | 'lower';
  showVertexLabels: boolean;
  showVertexDots: boolean;
  showRightMarks: boolean;
  /** Optional suppression when a construction crosses a right-angle corner. Defaults off. */
  hideSplitRightMarks?: boolean;
  sides: SideLabel[];
  angles: AngleLabel[];
  /** Manual label nudges in image pixels, keyed by label key (v0, s1, a2, c). */
  nudge: Record<string, Vec>;
  nudgeByLang?: Partial<Record<Lang, Record<string, Vec>>>;
  /** Circle centre or solid base centre (sphere: sphere centre). */
  center: { show: boolean; name: string };
  /** When true this shape's labels (and the constructions attached to it) cannot be dragged. */
  locked: boolean;
  sit?: SitContact;
  /** Local vertices of a free-drawn line or polygon (y up, centred). */
  path?: Vec[];
  pathClosed?: boolean;
  pathCurved?: boolean;
  pathDashed?: boolean;
}

/** A reference to a point: shape vertex, circle centre, or a construction point. */
export type Ref = { s: string; i: number } | { c: string } | { p: string };

export type PointDef =
  /** Free point in a shape's local coordinates (follows the shape). */
  | { t: 'local'; shape: string; x: number; y: number; z?: number; plane?: ConstructionPlane }
  /** Free point in scene units (y up). Does not follow a shape. */
  | { t: 'world'; x: number; y: number }
  /** a + k (b - a). k in [0,1] is on the segment, outside is on the extension. */
  | { t: 'ratio'; a: Ref; b: Ref; k: number }
  /** from + dist * (cos angle, sin angle), angle in degrees CCW from +x (scene frame). */
  | { t: 'offset'; from: Ref; angle: number; dist: number; plane?: ConstructionPlane }
  /** First boundary hit of the ray from `from` at `angle` (scene frame). */
  | { t: 'rayHit'; from: Ref; angle: number; shape: string; plane?: ConstructionPlane }
  /** Hit of the angle bisector at vertex v (between a and b) with the shape boundary. */
  | { t: 'bisectHit'; v: Ref; a: Ref; b: Ref; shape: string }
  /** Hit with the boundary of the parallel / perpendicular to a-b through `from`. */
  | { t: 'dirHit'; from: Ref; a: Ref; b: Ref; mode: 'par' | 'perp'; sign: 1 | -1; shape: string; plane?: ConstructionPlane }
  /** Foot of the perpendicular from `from` on line a-b. */
  | { t: 'foot'; from: Ref; a: Ref; b: Ref }
  /** at + dist * rot90(unit(toward - at)) */
  | { t: 'perpAt'; at: Ref; toward: Ref; dist: number; plane?: ConstructionPlane }
  /** Crossing of the line a-b with the line c-d (2D figures only). Follows both lines when the figure changes. */
  | { t: 'cross'; a: Ref; b: Ref; c: Ref; d: Ref }
  /** Crossing of the infinite line a-b with a circle. `which` picks the intersection ordered along a→b. */
  | { t: 'lineCircle'; a: Ref; b: Ref; shape: string; which: 0 | 1 }
  /** Crossing of two circles. `which` is the angle order around `shape`. */
  | { t: 'circs'; shape: string; other: string; which: 0 | 1 }
  /** Point on a circle at a local angle (degrees, rotates with the shape). */
  | { t: 'circ'; shape: string; angle: number };

export type AnchorKey = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export interface ConPoint {
  id: string;
  /** Canonical English name; '' for helper points that have no label. */
  name: string;
  /** Arabic glyph for this point. Missing means the Arabic letter is derived from `name`. */
  nameAr?: string;
  showLabel: boolean;
  dot: boolean;
  def: PointDef;
  /** When set, this point is one of the nine bbox/centre anchors of its shape. */
  anchor?: AnchorKey;
  nudge?: Vec;
  nudgeByLang?: Partial<Record<Lang, Vec>>;
}

export interface ConLine {
  id: string;
  a: Ref;
  b: Ref;
  dashed: boolean;
  /** Optional circular arc joining a→b, or a smooth polyline through `via`. Missing means a straight segment. */
  curve?: 'arc' | 'spline';
  arcFraction?: 0.25 | 0.5 | 0.75;
  arcSide?: 1 | -1;
  /** Intermediate vertices of a free polyline (between `a` and `b`). */
  via?: Ref[];
  /** Arrow position(s) on this line. */
  arrow?: 'none' | 'start' | 'end' | 'both' | 'middle';
  /** Line width relative to the global stroke. */
  weight?: number;
  /** Smart force arrow: labelled F / ق, numbered when several exist. */
  kind?: 'force';
  label: SideLabel;
  nudge?: Vec;
  nudgeByLang?: Partial<Record<Lang, Vec>>;
}

/** Marks drawn on the figure: right-angle squares, equal-side ticks, parallel arrows. */
export type ConMark =
  | { id: string; kind: 'right'; at: Ref; a: Ref; b: Ref }
  | { id: string; kind: 'tick' | 'arrow'; a: Ref; b: Ref; n: number }
  /** Tick or arrow on a circle. `angle` is local degrees, the same frame as a point on the circle. */
  | { id: string; kind: 'tick' | 'arrow'; circle: string; angle: number; n: number }
  | { id: string; kind: 'attachment'; item: 'wall' | 'hinge' | 'particle' | 'block'; at: Ref; a: Ref; b: Ref; side: 1 | -1; size?: number };

export interface StyleSettings {
  stroke: number; // px at canvas scale
  fontSize: number;
  markSize: number;
  arcRadius: number;
  dotRadius: number;
  fill: number; // 0..1 portion of the canvas the figure group may occupy
  /** Arabic letter for D: false = د, true = ء */
  dAsHamza: boolean;
  /** Use italic for English letters (as in Nagwa samples). */
  italicLetters: boolean;
  /** Stretch ج ح خ ه with a tatweel (جـ حـ خـ هـ). */
  arabicTatweel: boolean;
  /** Arabic A: hamza أ, or the looped alif used in some exam figures. */
  alefForm: 'hamza' | 'loop';
}

export interface CanvasSize {
  w: number;
  h: number;
}

export interface SceneData {
  canvas: CanvasSize;
  shapes: ShapeInstance[];
  points: ConPoint[];
  lines: ConLine[];
  marks: ConMark[];
  style: StyleSettings;
  /** px per scene unit. Recomputed on discrete edits, frozen while dragging. */
  viewScale: number;
}

export type AxisCoord = {x:number;y:number;z:number};
export interface AxisPoint {id:string;name:string;at:AxisCoord;showName:boolean;showCoordinates:boolean;coordinatePosition:'beside'|'below'}
export interface AxisLine {id:string;kind:'line'|'vector';a:string;b:string;dashed:boolean}
export interface AxisPlane {id:string;points:[string,string,string,string]}
export type AxisRay = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-';
export type AxisKey = 'x' | 'y' | 'z';
/** Geometric gap between ticks (`spacing`) and the number written on each tick (`steps`). */
export interface AxisTickScale { spacing: number; steps: number }
export interface AxesSettings {
  dimension:2|3; grid:boolean; numbers:boolean; step:number; showZero?:boolean;
  /** Arabic image only: write negative numbers with the sign after the digits (٥−) instead of before (−٥). Defaults on. */
  minusRight?:boolean;
  /** Optional unit drawn after each tick number. `pi` / `\pi` render as π; other LaTeX names render as their symbol. Empty = plain numbers. */
  tickUnit?:string;
  /** Axes that show `tickUnit`. Omitted = every axis (older files). */
  tickUnitOn?:AxisKey[];
  /** Per-axis tick geometry and labels. Missing keys fall back to `step` / `numberStep`. */
  axisTicks?:Partial<Record<AxisKey, AxisTickScale>>;
  /** @deprecated Use `axisTicks[].steps`. Kept so older projects still load. */
  numberStep?:number;
  /** @deprecated First-after-zero is always one step. Kept so older projects still load. */
  numberStart?:number;
  /** Scale of axis numbers relative to the figure labels. 1 = default. */
  numberSize?:number;
  /** Hide numbered labels on individual signed rays. */
  hideRays?:AxisRay[];
  equations?:AxisEquation[];
  functions?:AxisFunction[];
  front:ConstructionPlane; depthDirection:'down-left'|'down-right'|'up-left'|'up-right';
  points:AxisPoint[];lines:AxisLine[];planes:AxisPlane[];
}
/** y = f(x) curve on 2D axes. `from`/`to` are optional domain limits (omitted = whole axis range). */
export interface AxisFunction {id:string;expr:string;from?:number;to?:number;dashed:boolean;arrows:boolean;showLabel:boolean;label:string}
export interface AxesTool {kind:'point'|'line'|'vector'|'plane';shape:string;picks:AxisCoord[];plane:ConstructionPlane;level:number;showCoordinates:boolean;coordinatePosition:'beside'|'below'}

export type AxisEquation = {id:string;kind:'line'|'vector';origin:AxisCoord;direction:AxisCoord;dashed:boolean} | {id:string;kind:'plane';normal:AxisCoord;constant:number};
