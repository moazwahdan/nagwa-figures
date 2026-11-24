/** Arabic mathematical letters (the "arabic letter" sheet).
 *
 * Every letter is a macro named like the sheet: \alef, \beh, \behi, \sadt, \dotlessfehs ...
 * Suffix: i = initial, t = tailed, s = stretched, l = looped, d = double-struck.
 * The glyphs live in the Arabic Mathematical Alphabetic Symbols block (U+1EE00+),
 * which NagwaArabicMath has. The macros expand to \alt{<glyph>} exactly like \alef,
 * so MathLive and MathJax treat them the same way as the existing Arabic operators.
 */
const BASES = [
  'alef', 'beh', 'jeem', 'dal', 'heh', 'waw', 'zain', 'hah', 'tah', 'yeh',
  'kaf', 'lam', 'meem', 'noon', 'seen', 'ain', 'feh', 'sad', 'qaf', 'reh',
  'sheen', 'teh', 'theh', 'khah', 'thal', 'dad', 'zah', 'ghain',
  'dotlessbeh', 'dotlessnoon', 'dotlessfeh', 'dotlessqaf',
] as const;

type Suffix = '' | 'i' | 't' | 's' | 'l' | 'd';

const RANGE_START: Record<Suffix, number> = {
  '': 0x1ee00,
  i: 0x1ee20,
  t: 0x1ee40,
  s: 0x1ee60,
  l: 0x1ee80,
  d: 0x1eea0,
};

/** Names exactly as they appear on the sheet (141 forms), in sheet order. */
const SHEET_NAMES = `
alef beh behi jeem jeemi jeemt dal hehi waw zain hah hahi haht tah yeh yehi yeht kaf kafi lam lami lamt meem meemi noon nooni noont seen seeni seent ain
aini aint feh fehi sad sadi sadt qaf qafi qaft reh sheen sheeni sheent teh tehi theh thehi khah khahi khaht thal dad dadi dadt zah ghain ghaini ghaint dotlessbeh dotlessnoon
dotlessnoont dotlessfeh dotlessqaf dotlessqaft alefl behl behs behd jeeml jeems jeemd dall dald hehl hehs wawl wawd zainl zaind hahl hahs hahd tahl tahs tahd yehl yehs yehd kafs laml lamd
meeml meems meemd noonl noons noond seenl seens seend ainl ains aind fehl fehs fehd sadl sads sadd qafl qafs qafd rehl rehd sheenl sheens sheend tehl tehs tehd thehl thehs
thehd khahl khahs khahd thall thald dadl dads dotlessfehs zahs zahd ghainl ghains ghaind dotlessbehs dadd zahl
`.trim().split(/\s+/);

export type ArabicLetter = { name: string; char: string };

const BASES_LONGEST_FIRST = [...BASES].sort((a, b) => b.length - a.length);

function parse(name: string): { base: (typeof BASES)[number]; suffix: Suffix } | null {
  for (const base of BASES_LONGEST_FIRST) {
    if (!name.startsWith(base)) continue;
    const suffix = name.slice(base.length);
    if (suffix === '' || suffix === 'i' || suffix === 't' || suffix === 's' || suffix === 'l' || suffix === 'd') {
      return { base, suffix };
    }
  }
  return null;
}

const ALL_LETTERS: Array<ArabicLetter & { suffix: Suffix }> = SHEET_NAMES.flatMap((name) => {
  const p = parse(name);
  if (!p) return [];
  return [{ name, suffix: p.suffix, char: String.fromCodePoint(RANGE_START[p.suffix] + BASES.indexOf(p.base)) }];
});

export const ARABIC_LETTER_GROUPS: Array<{ id: string; label: string; items: ArabicLetter[] }> = (
  [
    ['', 'أساسي'],
    ['i', 'بادئ (i)'],
    ['t', 'ذيل (t)'],
    ['s', 'ممدود (s)'],
    ['l', 'ملفوف (l)'],
    ['d', 'مزدوج (d)'],
  ] as Array<[Suffix, string]>
).map(([suffix, label]) => ({
  id: suffix || 'base',
  label,
  items: ALL_LETTERS.filter((l) => l.suffix === suffix).map(({ name, char }) => ({ name, char })),
}));

/** Arabic function names. The macros already exist in mathliveMacros.ts. */
export const ARABIC_FUNCTION_BUTTONS: Array<{ name: string; label: string }> = [
  { name: 'arsin', label: 'جا' },
  { name: 'arcos', label: 'جتا' },
  { name: 'artan', label: 'ظا' },
  { name: 'arcot', label: 'ظتا' },
  { name: 'arsec', label: 'قا' },
  { name: 'arcsc', label: 'قتا' },
  { name: 'arlog', label: 'لو' },
  { name: 'arln', label: 'لوهـ' },
  { name: 'arlim', label: 'نهـا' },
];

/** \behi -> \alt{<glyph>} ... for MathLive's macro table. */
export function arabicLetterMacros(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of ALL_LETTERS) out[l.name] = `\\alt{${l.char}}`;
  return out;
}

/** Glyph of a keyboard letter by its sheet name (jeems, hahs ...). */
export function arabicLetterChar(name: string): string {
  return ALL_LETTERS.find((l) => l.name === name)?.char ?? '';
}
