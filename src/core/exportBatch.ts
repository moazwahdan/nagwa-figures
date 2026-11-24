import { zipSync, strToU8 } from 'fflate';
import { batchExportNames, useBatchStore, workspaceText } from './batch';
import { figureFiles, download } from './exportImage';
import { documentFor } from './project';
import { useStore } from './store';
import type { Lang } from './types';

export async function exportBatchZip(ratio: number, onProgress: (done: number, total: number, name: string) => void, signal: AbortSignal) {
  const b = useBatchStore.getState();
  const live = useStore.getState();
  if (b.enabled) {
    const row = b.rows[b.active];
    if (row) useBatchStore.setState({
      rows: b.rows.map((r, i) => i === b.active
        ? { ...r, project: { ...r.project, scene: { canvas: live.canvas, shapes: live.shapes, points: live.points, lines: live.lines, marks: live.marks, style: live.style, viewScale: live.viewScale } } }
        : r),
    });
  }
  const rows = batchExportNames(), workspace = workspaceText(), files: Record<string, Uint8Array> = {};
  let bytes = 0;
  const check = () => { if (signal.aborted) throw new Error('Export cancelled.'); };
  const add = (name: string, data: Uint8Array) => { bytes += data.length; if (bytes > 150_000_000) throw new Error('Export exceeds 150 MB. Split the CSV into smaller batches.'); files[name] = data; };
  for (let i = 0; i < rows.length; i++) {
    const { project, name } = rows[i];
    onProgress(i, rows.length, name);
    check();
    for (const lang of ['ar', 'en'] as Lang[]) {
      const part = await figureFiles(project.scene, lang, name, ratio, { ...project.settings, fileName: name });
      check();
      for (const [path, data] of Object.entries(part)) add(`${name}/${path}`, data);
    }
    add(`${name}/${name}.figure.json`, strToU8(JSON.stringify(documentFor(project.scene, { ...project.settings, fileName: name }), null, 2)));
    onProgress(i + 1, rows.length, name);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  add('batch.figure.json', strToU8(workspace));
  add('manifest.json', strToU8(JSON.stringify(rows.map((r, i) => ({ image: i + 1, sourceRow: r.sourceRow, id: r.name, reviewed: r.reviewed, width: r.project.scene.canvas.w, height: r.project.scene.canvas.h })), null, 2)));
  check();
  download(new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: 'application/zip' }), 'figures-batch.zip');
}
