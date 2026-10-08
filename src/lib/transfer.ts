import { notes, titleOf, type Note } from './notes.svelte';
import { importTree, type Source } from './importTree';
import { files, importAsset, pickFiles, pickFolders, listFolder, pickSavePath, savePdf, savePng, isMobile, widget } from './platform';
import { commonDir, dirOf } from './paths';
import { ui } from './ui.svelte';
import { flushEdits } from './pending';

/**
 * Import files picked in Finder, or whole folders. One file lands as a plain new note in the open note's group;
 * several keep the shape they came in (importTree.ts): folders become groups, a page's folder its sub-pages.
 */
export async function importPaths(paths: string[], from?: string, into = ''): Promise<Note | null> {
  const root = from ?? commonDir(paths);
  const sources: Source[] = paths.map((p) => ({
    path: p.slice(root.length).replace(/^\//, ''),
    text: () => files.read(p),
    asset: () => importAsset(p), // copied next to the notes, so the note survives the original moving
  }));
  const one = paths.length === 1 && !from;
  const made = await importTree(sources, into, one ? (notes.current?.group ?? '') : into);
  return made[0]?.note ?? null;
}

/** Ask for files, then import them. Returns the first note made, or null (nothing picked / nothing usable). */
export async function importFromFinder(): Promise<Note | null> {
  const picked = await pickFiles();
  if (!picked?.length) return null;
  return importPaths(picked);
}

/**
 * Import whole folders: everything under them becomes notes, and the folders themselves become groups.
 * A file panel only ever hands back files from one folder, so this is the way a tree arrives intact.
 */
export async function importFromFolder(): Promise<Note | null> {
  const picked = await pickFolders();
  if (!picked?.length) return null;
  const paths: string[] = [];
  for (const root of picked) for (const rel of await listFolder(root)) paths.push(`${root}/${rel}`);
  if (!paths.length) return null;
  // measured from the folder's parent, so the folder itself becomes the top group
  return importPaths(paths, dirOf(picked[0]));
}

// ---- export ----------------------------------------------------------------

export type ExportAs = 'md' | 'pdf' | 'png';

/**
 * Save a note as a file, picked in a save panel. Markdown is the note itself; the other two are the
 * window printed to that file — paginated, its text still text, and no printer anywhere in it — with
 * the picture being that page rasterised.
 */
export async function exportNote(note: Note, as: ExportAs): Promise<string | null> {
  flushEdits(); // the export is of the note as it is on screen, the last keys included
  // a phone has no save panel: the note goes to the share sheet (Files, Drive, a chat…)
  if (isMobile) {
    if (!(await widget.export(as, titleOf(note), note.body))) throw new Error(`Could not export this note as ${as.toUpperCase()}.`);
    return titleOf(note);
  }
  const path = await pickSavePath(titleOf(note), as);
  if (!path) return null;
  if (as === 'md') await files.write(path, note.body);
  else if (as === 'pdf') await savePdf(path);
  else await savePng(path);
  return path;
}

/**
 * The open note, exported — what every menu and shortcut that offers it calls. A failure says so
 * instead of quietly doing nothing (a save panel cancelled is not a failure: it returns null).
 */
export async function exportCurrent(as: ExportAs): Promise<void> {
  const n = notes.current;
  if (!n) return;
  try {
    await exportNote(n, as);
  } catch (err) {
    await ui.ask(String(err), false);
  }
}
