import { notes, titleOf, type Note } from './notes.svelte';
import { importTree, type Source } from './importTree';
import { files, importAsset, pickFiles, pickFolders, listFolder, pickSavePath, savePdf, savePng, isMobile, widget } from './platform';
import { commonDir, dirOf } from './paths';
import { ui, errorText } from './ui.svelte';
import { assetIfTaken } from './drop';
import { flushPendingEdits } from './pending';

export async function importPaths(paths: string[], from?: string, into = ''): Promise<Note | null> {
  const root = from ?? commonDir(paths);
  const sources: Source[] = paths.map((p) => ({
    path: p.slice(root.length).replace(/^\//, ''),
    text: () => files.read(p),
    asset: () => assetIfTaken(p, () => importAsset(p)),
  }));
  const one = paths.length === 1 && !from;
  const made = await importTree(sources, into, one ? (notes.current?.parent ?? '') : into);
  return made[0]?.note ?? null;
}

export async function importFromFinder(): Promise<Note | null> {
  const picked = await pickFiles();
  if (!picked?.length) return null;
  return importPaths(picked);
}

export async function importFromFolder(): Promise<Note | null> {
  const picked = await pickFolders();
  if (!picked?.length) return null;
  const paths: string[] = [];
  for (const root of picked) for (const rel of await listFolder(root)) paths.push(`${root}/${rel}`);
  if (!paths.length) return null;
  return importPaths(paths, dirOf(picked[0]));
}


export type ExportAs = 'md' | 'pdf' | 'png';

export async function exportNote(note: Note, as: ExportAs): Promise<string | null> {
  flushPendingEdits();
  if (isMobile) {
    if (!(await widget.export(as, titleOf(note), note.body))) throw new Error(`The phone did not take the ${as.toUpperCase()}.`);
    return titleOf(note);
  }
  const path = await pickSavePath(titleOf(note), as);
  if (!path) return null;
  if (as === 'md') await files.write(path, note.body);
  else if (as === 'pdf') await savePdf(path);
  else await savePng(path);
  return path;
}

export async function exportCurrent(as: ExportAs): Promise<void> {
  const n = notes.current;
  if (!n) return;
  try {
    await exportNote(n, as);
  } catch (err) {
    await ui.ask(`Could not export “${titleOf(n)}”. ${errorText(err)}`, false);
  }
}
