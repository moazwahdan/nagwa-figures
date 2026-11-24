/** Isolated/initial/medial/final presentation forms (Arabic Presentation Forms-B). */
const FORMS: Record<string, [string, string, string, string]> = {
  ا: ['\uFE8D', '\uFE8E', '\uFE8D', '\uFE8E'],
  أ: ['\uFE83', '\uFE84', '\uFE83', '\uFE84'],
  إ: ['\uFE87', '\uFE88', '\uFE87', '\uFE88'],
  آ: ['\uFE81', '\uFE82', '\uFE81', '\uFE82'],
  ب: ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'],
  ت: ['\uFE95', '\uFE96', '\uFE97', '\uFE98'],
  ث: ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'],
  ج: ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'],
  ح: ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'],
  خ: ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'],
  د: ['\uFEA9', '\uFEAA', '\uFEA9', '\uFEAA'],
  ذ: ['\uFEAB', '\uFEAC', '\uFEAB', '\uFEAC'],
  ر: ['\uFEAD', '\uFEAE', '\uFEAD', '\uFEAE'],
  ز: ['\uFEAF', '\uFEB0', '\uFEAF', '\uFEB0'],
  س: ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'],
  ش: ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'],
  ص: ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'],
  ض: ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'],
  ط: ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'],
  ظ: ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'],
  ع: ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'],
  غ: ['\uFECD', '\uFECE', '\uFECF', '\uFED0'],
  ف: ['\uFED1', '\uFED2', '\uFED3', '\uFED4'],
  ق: ['\uFED5', '\uFED6', '\uFED7', '\uFED8'],
  ك: ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'],
  ل: ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'],
  م: ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'],
  ن: ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'],
  ه: ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'],
  و: ['\uFEED', '\uFEEE', '\uFEED', '\uFEEE'],
  ى: ['\uFEEF', '\uFEF0', '\uFEEF', '\uFEF0'],
  ي: ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'],
  ة: ['\uFE93', '\uFE94', '\uFE93', '\uFE94'],
  ء: ['\uFE80', '\uFE80', '\uFE80', '\uFE80'],
};

const DUAL = new Set('بتثجحخسشصضطظعغفقكلمنهىي');
const RIGHT = new Set('اأإآدذرزوة');

function joinsAsPrev(ch: string): boolean {
  return DUAL.has(ch) || RIGHT.has(ch);
}
function joinsAsNext(ch: string): boolean {
  return DUAL.has(ch);
}

/** Map a logical Arabic run to presentation-form code points for isolated OpenType lookup. */
export function shapeArabicRun(raw: string): string[] {
  const chars = [...raw];
  return chars.map((ch, i) => {
    const forms = FORMS[ch];
    if (!forms) return ch;
    let prev = '';
    for (let j = i - 1; j >= 0; j--) {
      if (chars[j] === '\u200d') continue;
      if (chars[j] === '\u200c') { prev = ''; break; }
      prev = chars[j];
      break;
    }
    let next = '';
    for (let j = i + 1; j < chars.length; j++) {
      if (chars[j] === '\u200d') continue;
      if (chars[j] === '\u200c') { next = ''; break; }
      next = chars[j];
      break;
    }
    const joinPrev = prev !== '' && joinsAsNext(prev) && joinsAsPrev(ch);
    const joinNext = next !== '' && joinsAsNext(ch) && joinsAsPrev(next);
    if (joinPrev && joinNext) return forms[3];
    if (joinPrev) return forms[1];
    if (joinNext) return forms[2];
    return forms[0];
  });
}
