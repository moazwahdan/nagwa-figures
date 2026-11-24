import { arabicLetterMacros } from './arabicLetters';

/** Option B: arabic-math.sty operators + Nagwa aliases, plus \alef.
 * Operator letters use Arabic Mathematical Alphabetic Symbols (U+1EE00+)
 * because NagwaArabicMath has those glyphs, not BMP U+0600 letters.
 * Dotless operator forms are not wired (dotlessop stays off). */
const cp = (...us: number[]) => us.map((u) => String.fromCodePoint(u)).join('');
const ALEF = 0x1ee00;
const JEEM = 0x1ee02;
const ZAIN = 0x1ee06;
const LAM = 0x1ee0b;
const NOON = 0x1ee0d;
const QAF = 0x1ee12;
const TEH = 0x1ee15;
const ZAH = 0x1ee1a;
const HEH = 0x1ee24;
const alt = (...us: number[]) => `\\alt{${cp(...us)}}`;

export const NAGWA_MATH_MACROS: Record<string, string> = {
  // Every letter on the Arabic letter sheet: \alef \beh \behi \sadt ...
  ...arabicLetterMacros(),
  alef: alt(ALEF),
  ga: alt(JEEM, ALEF),
  gata: alt(JEEM, TEH, ALEF),
  za: alt(ZAH, ALEF),
  zata: alt(ZAH, TEH, ALEF),
  qa: alt(QAF, ALEF),
  qata: alt(QAF, TEH, ALEF),
  arsin: alt(JEEM, ALEF),
  arcos: alt(JEEM, TEH, ALEF),
  artan: alt(ZAH, ALEF),
  arcot: alt(ZAH, TEH, ALEF),
  arsec: alt(QAF, ALEF),
  arcsc: alt(QAF, TEH, ALEF),
  arlog: alt(LAM, 0x1ee05),
  arln: `\\log_{${cp(HEH)}}`,
  gaz: alt(JEEM, ALEF, ZAIN),
  gataz: alt(JEEM, TEH, ALEF, ZAIN),
  zaz: alt(ZAH, ALEF, ZAIN),
  zataz: alt(ZAH, TEH, ALEF, ZAIN),
  qaz: alt(QAF, ALEF, ZAIN),
  qataz: alt(QAF, TEH, ALEF, ZAIN),
  arsinh: alt(JEEM, ALEF, ZAIN),
  arcosh: alt(JEEM, TEH, ALEF, ZAIN),
  artanh: alt(ZAH, ALEF, ZAIN),
  arcoth: alt(ZAH, TEH, ALEF, ZAIN),
  arsech: alt(QAF, ALEF, ZAIN),
  arcsch: alt(QAF, TEH, ALEF, ZAIN),
  arlim: alt(NOON, HEH, ALEF),
  rad: '؆',
};
