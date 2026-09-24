import { notes, titleOf, type Note } from './notes.svelte';
import { groups, MAX_DEPTH } from './groups.svelte';
import { files, importAsset, pickFiles, pickFolders, listFolder, pickSavePath, savePdf, savePng } from './platform';
import { TEXT_FILE, DOC_FILE, VIDEO_FILE } from './drop';
import { commonDir, dirOf, groupFor, nameOf, stem } from './paths';
import { ui } from './ui.svelte';

/** Files this app takes in, by extension. */
const IMPORTABLE = /\.(md|markdown|mdx|txt|pdf|xlsx?|hwpx?|png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm)$/i;

/** One file on disk as a note body: text files carry their own content, everything else is attached. */
async function bodyOf(path: string): Promise<string | null> {
  const name = nameOf(path);
  if (!IMPORTABLE.test(name)) return null;
  if (TEXT_FILE.test(name)) {
    const text = await files.read(path);
    return /^\s*#\s/.test(text) ? text : `# ${stem(name)}\n\n${text}`;
  }
  const src = await importAsset(path); // copied next to the notes, so the note survives the original moving
  const link = DOC_FILE.test(name) || VIDEO_FILE.test(name) ? `[${name}](${src})` : `![](${src})`;
  return `# ${stem(name)}\n\n${link}\n`;
}

/**
 * Import files picked in Finder (or dropped as folders). One file lands as a plain new note; several
 * keep the shape they came in — the folders they sit in become groups.
 */
export async function importPaths(paths: string[], from?: string): Promise<Note | null> {
  const root = from ?? commonDir(paths);
  let first: Note | null = null;
  for (const path of paths) {
    const body = await bodyOf(path);
    if (body === null) continue;
    const group = paths.length > 1 || from ? groupFor(path, root, MAX_DEPTH) : (notes.current?.group ?? '');
    if (group) groups.remember(group);
    const note = notes.addImported(body, group);
    first ??= note;
  }
  return first;
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
