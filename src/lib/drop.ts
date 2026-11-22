import { saveAsset } from './platform';

export const TEXT_FILE = /\.(md|markdown|mdx|txt)$/i;
export const PDF_FILE = /\.pdf$/i;
export const DOC_FILE = /\.(pdf|xlsx|xls|hwp|hwpx)$/i;
export const HWP_FILE = /\.hwpx?$/i;
export const VIDEO_FILE = /\.(mp4|mov|m4v|webm)$/i;
export const ASSET_FILE = /\.(pdf|xlsx?|hwpx?|png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm)$/i;
export const assetIfTaken = (name: string, copy: () => Promise<string>): Promise<string | null> => (ASSET_FILE.test(name) ? copy() : Promise.resolve(null));

const isDoc = (f: File) => f.type === 'application/pdf' || DOC_FILE.test(f.name);
const isVideo = (f: File) => f.type.startsWith('video/') || VIDEO_FILE.test(f.name);
export const isAsset = (f: File) => isDoc(f) || isVideo(f) || f.type.startsWith('image/');

export async function fileMarkdown(f: File): Promise<string | null> {
  if (TEXT_FILE.test(f.name)) return await f.text();
  if (isDoc(f) || isVideo(f)) return `[${f.name.replace(/[[\]]/g, '')}](${await saveAsset(f)})`;
  if (f.type.startsWith('image/')) return `![](${await saveAsset(f)})`;
  return null;
}

async function walk(dir: any, path: string): Promise<Dropped[]> {
  const reader = dir.createReader();
  const out: Dropped[] = [];
  for (;;) {
    const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break; // readEntries pages, and answers empty when it is done
    for (const e of batch) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory) out.push(...(await walk(e, `${path}/${e.name}`)));
      else out.push({ file: await new Promise<File>((res, rej) => e.file(res, rej)), dir: path });
    }
  }
  return out;
}

export interface Dropped { file: File; dir: string }

/**
 * Everything a drop carried. A folder is walked through, so what it held arrives with the folders it
 * came in; plain files arrive as themselves. Call it with the event still live — a DataTransfer is
 * emptied the moment the handler returns, so the entries are taken first and read afterwards.
 */
export async function droppedFiles(dt: DataTransfer): Promise<Dropped[]> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  const plain = [...dt.files];
  if (!entries.some((e) => e?.isDirectory)) return plain.map((file) => ({ file, dir: '' }));
  const out: Dropped[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as any;
    if (e?.isDirectory) out.push(...(await walk(e, e.name)));
    else if (plain[i]) out.push({ file: plain[i], dir: '' });
  }
  return out;
}
