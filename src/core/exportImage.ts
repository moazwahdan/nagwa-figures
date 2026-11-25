import { cropScene } from './crop';
import { zipSync, strToU8 } from 'fflate';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SceneSvg } from '../components/SceneSvg';
import { embeddedFontCss } from './fonts';
import { bakeCaptionMath } from './mathliveHost';
import { documentFor, embedProjectInSvg } from './project';
import { convertSvgTextToPaths } from './svgTextToPath';
import type { Lang, ProjectSettings, SceneData } from './types';

export async function buildSvg(data: SceneData, lang: Lang): Promise<string> {
  await Promise.all(data.shapes.filter((s) => s.caption).map((s) => bakeCaptionMath(s.caption![lang], lang)));
  /* Embed only the font families this figure actually mentions (the full set is ~8 MB of base64). */
  const css = await embeddedFontCss(renderToStaticMarkup(createElement(SceneSvg, { data, lang })));
  const markup = renderToStaticMarkup(createElement(SceneSvg, { data, lang, css }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

export async function svgToPng(svg: string, w: number, h: number, pixelRatio: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not rasterise the SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export type ExportFormat = 'png' | 'svg' | 'pdf';

/** Expand MathJax <use href="#glyph"> into real <path> copies so svg2pdf does not rasterize. */
function inlineSvgUsePaths(root: SVGSVGElement) {
  for (const use of Array.from(root.querySelectorAll('use'))) {
    const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    const id = href.startsWith('#') ? href.slice(1) : href;
    if (!id) continue;
    const src = root.querySelector(`#${CSS.escape(id)}`);
    if (!src || src.tagName.toLowerCase() !== 'path') continue;
    const path = src.cloneNode(true) as SVGPathElement;
    path.removeAttribute('id');
    const x = parseFloat(use.getAttribute('x') || '0') || 0;
    const y = parseFloat(use.getAttribute('y') || '0') || 0;
    const bits = [
      x || y ? `translate(${x} ${y})` : '',
      use.getAttribute('transform') || '',
      path.getAttribute('transform') || '',
    ].filter(Boolean);
    if (bits.length) path.setAttribute('transform', bits.join(' '));
    use.replaceWith(path);
  }
}

/** Convert SVG to PDF after turning laid-out <text> into OpenType outline paths. */
export async function svgToPdf(svgString: string, w: number, h: number): Promise<Uint8Array> {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgElement = svgDoc.documentElement as unknown as SVGSVGElement;

  svgElement.setAttribute('width', String(w));
  svgElement.setAttribute('height', String(h));

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.appendChild(svgElement);
  document.body.appendChild(container);

  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    inlineSvgUsePaths(svgElement);
    const converted = await convertSvgTextToPaths(svgElement);
    for (const st of Array.from(svgElement.querySelectorAll('style'))) st.remove();
    const leftover = svgElement.querySelectorAll('text').length;
    if (leftover || converted.missing.length) {
      throw new Error(`PDF outlines incomplete: leftover text=${leftover} missing=${converted.missing.slice(0, 12).join(' ')}`);
    }
    const orientation = w > h ? 'landscape' : 'portrait';
    /* The PDF libraries are large and only needed here, so they load on the first PDF export instead of at start-up. */
    const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [w, h],
      compress: true,
    });
    await svg2pdf(svgElement, pdf, { x: 0, y: 0, width: w, height: h });
    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    container.remove();
  }
}

/** PNG, SVG and PDF for one language. */
export async function figureFiles(data: SceneData, lang: Lang, name: string, ratio: number, settings?: ProjectSettings): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const scene = cropScene(data, lang).scene;
  const svg = await buildSvg(scene, lang);
  files[`${name}_${lang}.png`] = new Uint8Array(await (await svgToPng(svg, scene.canvas.w, scene.canvas.h, ratio)).arrayBuffer());
  files[`${name}_${lang}.pdf`] = await svgToPdf(svg, scene.canvas.w, scene.canvas.h);
  const doc = documentFor(data, settings ?? { fileName: name, theme: 'light', lockAll: true, separateLabels: false });
  files[`${name}_${lang}.svg`] = strToU8(embedProjectInSvg(svg, doc));
  return files;
}

/** Both languages plus the project JSON. */
export async function exportZip(data: SceneData, settings: ProjectSettings, name: string, ratio: number) {
  const files: Record<string, Uint8Array> = {};
  for (const lang of ['ar', 'en'] as Lang[]) Object.assign(files, await figureFiles(data, lang, name, ratio, { ...settings, fileName: name }));
  files[`${name}.figure.json`] = strToU8(JSON.stringify(documentFor(data, { ...settings, fileName: name }), null, 2));
  download(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `${name}.zip`);
}
