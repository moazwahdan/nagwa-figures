/** Figure colours: the team palette plus the exact colours used by the reference charts. */
export interface PaletteColor { hex: string; name: string }
export const PALETTE: PaletteColor[] = [
  { hex: '#1483C2', name: 'Blue2' }, { hex: '#62AADF', name: 'Blue1' },
  { hex: '#109E24', name: 'Green' }, { hex: '#69BA6C', name: 'Green1' },
  { hex: '#E132A2', name: 'Fushia' }, { hex: '#ED61AE', name: 'Fushia1' },
  { hex: '#FBC04F', name: 'Orange1' }, { hex: '#F3A203', name: 'Orange' },
  { hex: '#7C24E7', name: 'Purple' }, { hex: '#A072EB', name: 'Purple1' },
  { hex: '#E14B3B', name: 'Red' }, { hex: '#EC6258', name: 'Red1' },
  { hex: '#4C4C4E', name: 'Gray' }, { hex: '#828283', name: 'Gray1' },
  /* Seen in the reference chart PDFs. */
  { hex: '#8FC3EA', name: 'Chart blue' }, { hex: '#61BF6E', name: 'Chart green' },
  { hex: '#ABEBC6', name: 'Chart mint' }, { hex: '#B1947D', name: 'Chart brown' },
  { hex: '#EC7063', name: 'Chart red' }, { hex: '#89898A', name: 'Chart grey' },
  { hex: '#A5A5A6', name: 'Grid grey' }, { hex: '#333333', name: 'Ink' },
];
export const GRID_COLOR = '#A5A5A6';
export const INK_COLOR = '#333333';
export function isHexColor(v: unknown): v is string { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v); }
