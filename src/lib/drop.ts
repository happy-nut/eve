import { saveAsset } from './platform';
export { stem } from './paths';

/** Text files that are a note's worth of content: they land as markdown, not as an attachment. */
export const TEXT_FILE = /\.(md|markdown|mdx|txt)$/i;
export const PDF_FILE = /\.pdf$/i;
export const VIDEO_FILE = /\.(mp4|mov|m4v|webm)$/i;

const isPdf = (f: File) => f.type === 'application/pdf' || PDF_FILE.test(f.name);
const isVideo = (f: File) => f.type.startsWith('video/') || VIDEO_FILE.test(f.name);
/** a file that belongs *inside* a note, as an attachment. A text file is a note of its own instead. */
export const isAsset = (f: File) => isPdf(f) || isVideo(f) || f.type.startsWith('image/');

/**
 * One dropped file as markdown, ready to be parsed into a note. Images and PDFs are copied next to the
 * notes first (a blob: URL would die on restart); a PDF is an ordinary link, so the file stays portable
 * and only this app's editor draws it as a card. Null = a file we don't take.
 */
export async function fileMarkdown(f: File): Promise<string | null> {
  if (TEXT_FILE.test(f.name)) return await f.text();
  if (isPdf(f) || isVideo(f)) return `[${f.name.replace(/[[\]]/g, '')}](${await saveAsset(f)})`;
  if (f.type.startsWith('image/')) return `![](${await saveAsset(f)})`;
  return null;
}

/** One folder's files, deep, each tagged with the folders it sits in. */
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

export interface Dropped { file: File; dir: string } // dir '' = dropped on its own, not inside a folder

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
