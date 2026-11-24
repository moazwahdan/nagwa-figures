import type { Lang } from './types';

/** Split caption text into text and math segments.
 * Uses $...$ for inline math. $$...$$ is left as plain text (display math not inline).
 * Backticks are NOT parsed at render time - they must be migrated on project load. */
export function splitQmsMath(src: string): Array<{ kind: 'text' | 'math'; value: string }> {
  const out: Array<{ kind: 'text' | 'math'; value: string }> = [];
  
  const hasDoubleDollar = /\$\$/.test(src);
  const hasSingleDollar = /(?<!\$)\$(?!\$)/.test(src);
  
  if (hasDoubleDollar && !hasSingleDollar) {
    return [{ kind: 'text', value: src }];
  }
  
  const re = /(?<!\$)\$([^$]+)\$(?!\$)/g;
  
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ kind: 'text', value: src.slice(last, m.index) });
    out.push({ kind: 'math', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', value: src.slice(last) });
  return out.filter((s) => s.value.length);
}

/** Migrate legacy backtick math to $ delimiters on project load only.
 * Leaves the string unchanged if any single `$` is already present, so mixed/ambiguous text is not rewritten. */
export function migrateMathDelimiters(src: string): string {
  if (/(?<!\$)\$(?!\$)/.test(src)) return src;
  if (!/`[^`]+`/.test(src)) return src;
  return src.replace(/`([^`]+)`/g, (_match, content) => `$${content}$`);
}

export function mathLocale(tex: string): Lang {
  return /[\u0600-\u06FF\u0660-\u0669]/.test(tex) ? 'ar' : 'en';
}
