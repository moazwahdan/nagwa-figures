import stix400 from '@fontsource/stix-two-text/files/stix-two-text-latin-400-normal.woff2?url';
import stix400i from '@fontsource/stix-two-text/files/stix-two-text-latin-400-italic.woff2?url';
import katexSize1 from '@nagwa-limited/mathlive/dist/fonts/KaTeX_Size1-Regular.woff2?url';
import katexNaskh from '@nagwa-limited/mathlive/dist/fonts/KaTeX_NotoNaskhArabic-Regular.woff2?url';
import notoNaskh from '@nagwa-limited/mathlive/dist/fonts/NotoNaskhArabic-Regular.woff2?url';
import stix2 from '@nagwa-limited/mathlive/dist/fonts/STIX2Text-Regular.woff2?url';

import nagwaArabicMathUrl from '../assets/fonts/NagwaArabicMath-12-25.otf?url';
import nagwaMathUrl from '../assets/fonts/NagwaMath.otf?url';
import notoRegularUrl from '../assets/fonts/Noto-Regular.ttf?url';
import notoBoldUrl from '../assets/fonts/Noto-Bold.ttf?url';
import stix2RegularUrl from '../assets/fonts/STIX2Text-Regular.otf?url';
import stix2BoldUrl from '../assets/fonts/STIX2Text-Bold.otf?url';
import stix2ItalicUrl from '../assets/fonts/STIX2Text-Italic.otf?url';

/** Fonts used inside the figures. Everything is bundled: no CDN, no external requests.
 * Arabic math uses NagwaArabicMath-12-25; ordinary Arabic text uses Noto. */
export const FONT_AR_NAME = 'Noto';
export const FONT_AR_MATH_NAME = 'NagwaArabicMath';
export const FONT_EN_NAME = 'STIX Two Text';

const FACES = [
  { family: 'NagwaArabicMath', url: nagwaArabicMathUrl, style: 'normal' },
  { family: 'NagwaMath', url: nagwaMathUrl, style: 'normal' },
  { family: 'Noto', url: notoRegularUrl, style: 'normal' },
  { family: 'Noto', url: notoBoldUrl, style: 'normal', weight: '700' },
  { family: 'FigArabic', url: notoRegularUrl, style: 'normal' },
  { family: 'Droid Arabic Naskh', url: notoNaskh, style: 'normal' },
  { family: 'FigSerif', url: stix400, style: 'normal' },
  { family: 'STIX Two Text', url: stix2RegularUrl, style: 'normal' },
  { family: 'STIX Two Text', url: stix2BoldUrl, style: 'normal', weight: '700' },
  { family: 'STIX Two Text', url: stix2ItalicUrl, style: 'italic' },
  { family: 'FigSerif', url: stix400i, style: 'italic' },
  { family: 'KaTeX_Main', url: nagwaMathUrl, style: 'normal' },
  { family: 'KaTeX_Math', url: nagwaMathUrl, style: 'italic' },
  { family: 'KaTeX_Size1', url: katexSize1, style: 'normal' },
  { family: 'KaTeX_NotoNaskhArabic', url: katexNaskh, style: 'normal' },
  { family: 'KaTeX_AltArabicMath', url: nagwaArabicMathUrl, style: 'normal' },
  { family: 'KaTeX_Looped', url: nagwaArabicMathUrl, style: 'normal' },
  { family: 'NotoNaskhArabic', url: notoNaskh, style: 'normal' },
  { family: 'STIX2Text', url: stix2, style: 'normal' },
];

export const FONT_AR = "'Noto','NagwaArabicMath','FigArabic',sans-serif";
export const FONT_AR_MATH = "'NagwaArabicMath','NagwaMath',serif";
export const FONT_EN = "'STIX Two Text','FigSerif',serif";
/** The exam-figure alif is the math-keyboard alef (U+1EE00) from NagwaArabicMath. */
export const FONT_ALEF = FONT_AR_MATH;
export const ALEF_GLYPH = '\u{1EE00}';

type FontFace = { family: string; url: string; style: string; weight?: string };

export function appFontCss(): string {
  return (FACES as FontFace[]).map(
    (f) => {
      const weight = f.weight ?? '400';
      const format = f.url.endsWith('.otf') || f.url.includes('.otf?') ? 'opentype' : f.url.endsWith('.ttf') || f.url.includes('.ttf?') ? 'truetype' : 'woff2';
      return `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${weight};font-display:block;src:url(${f.url}) format('${format}');}`;
    },
  ).join('\n');
}

let cached: string | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** @font-face rules with the font data inlined, so exported SVG/PNG look identical anywhere. */
export async function embeddedFontCss(): Promise<string> {
  if (cached) return cached;
  const rules = await Promise.all(
    (FACES as FontFace[]).map(async (f) => {
      const res = await fetch(f.url);
      const b64 = toBase64(await res.arrayBuffer());
      const format = f.url.endsWith('.otf') || f.url.includes('.otf?') ? 'opentype' : f.url.endsWith('.ttf') || f.url.includes('.ttf?') ? 'truetype' : 'woff2';
      const weight = f.weight ?? '400';
      return `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${weight};src:url(data:font/${format};base64,${b64}) format('${format}');}`;
    }),
  );
  cached = rules.join('\n');
  return cached;
}
