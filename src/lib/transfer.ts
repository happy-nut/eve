import { notes, titleOf, type Note } from './notes.svelte';
import { groups, MAX_DEPTH } from './groups.svelte';
import { files, importAsset, pickFiles, pickFolders, listFolder, pickSavePath, savePdf, savePng, isMobile, widget } from './platform';
import { TEXT_FILE, DOC_FILE, VIDEO_FILE } from './drop';
import { commonDir, dirOf, groupFor, nameOf, stem } from './paths';
import { attachmentCandidates, isKeepNote, keepOrder, keepToNote, type FromKeep } from './keep';
import { ui } from './ui.svelte';
import { flushEdits } from './pending';

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
  const groupOf = (path: string) => (paths.length > 1 || from ? groupFor(path, root, MAX_DEPTH) : (notes.current?.group ?? ''));
  const keep = await importKeep(paths, groupOf);
  let first: Note | null = keep.first;
  for (const path of paths) {
    if (keep.taken.has(path)) continue;
    const body = await bodyOf(path);
    if (body === null) continue;
    const group = groupOf(path);
    if (group) groups.remember(group);
    const note = notes.addImported(body, group);
    first ??= note;
  }
  return first;
}

/**
 * The Google Keep notes among the files (a Takeout export: a .json per note), each made into a note in
 * Keep's own order: pinned first, then the most recently edited, keeping when it was edited. Its label
 * becomes a group under the one the export sits in ("Keep/Work"), an archived note goes to "Keep/Archive".
 * `taken`: the files that were part of a Keep note (its .html, its pictures, Labels.txt), not notes of their own.
 */
async function importKeep(paths: string[], groupOf: (path: string) => string): Promise<{ first: Note | null; taken: Set<string> }> {
  const taken = new Set<string>();
  const made: (FromKeep & { group: string })[] = [];
  for (const path of paths.filter((p) => /\.json$/i.test(p))) {
    let json: unknown;
    try { json = JSON.parse(await files.read(path)); } catch { continue; }
    if (!isKeepNote(json)) continue;
    const dir = dirOf(path);
    taken.add(path).add(`${dir}/${stem(nameOf(path))}.html`).add(`${dir}/Labels.txt`);
    // trashed in Keep: left behind, its pictures too
    if (json.isTrashed) { for (const a of json.attachments ?? []) for (const c of attachmentCandidates(a.filePath ?? '')) taken.add(`${dir}/${c}`); continue; }
    const copied: Record<string, string> = {};
    for (const a of json.attachments ?? []) {
      if (!a.filePath) continue;
      for (const c of attachmentCandidates(a.filePath)) {
        taken.add(`${dir}/${c}`);
        if (copied[a.filePath]) continue;
        try { copied[a.filePath] = await importAsset(`${dir}/${c}`); } catch { /* not there, or a kind Eve cannot hold */ }
      }
    }
    const note = keepToNote(json, copied);
    if (note) made.push({ ...note, group: [groupOf(path), note.sub].filter(Boolean).join('/').split('/').slice(0, MAX_DEPTH).join('/') });
  }
  let first: Note | null = null;
  for (const k of made.sort(keepOrder)) {
    if (k.group) groups.remember(k.group);
    const note = notes.addImported(k.body, k.group, k.updatedAt || Date.now());
    first ??= note;
  }
  return { first, taken };
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
