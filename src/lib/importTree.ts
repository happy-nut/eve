import { notes, titleOf, type Note } from './notes.svelte';
import { groups, MAX_DEPTH } from './groups.svelte';
import { TEXT_FILE, DOC_FILE, VIDEO_FILE } from './drop';
import { dirOf, nameOf, stem, resolveLink } from './paths';
import { attachmentCandidates, isKeepNote, keepOrder, keepToNote, type FromKeep } from './keep';

/**
 * One file of an import, wherever it came from (a folder picked in Finder, one dropped on the window): its place
 * in the import, `Folder/Sub/Note.md`, and how to read it.
 */
export interface Source {
  path: string;
  text(): Promise<string>;
  /** copied next to the notes; its address in a note (assets/…) */
  asset(): Promise<string>;
}

export interface Made {
  note: Note;
  source: Source;
  /** an attachment's own line (`![](assets/…)`), for a file dropped on its own into the open note */
  embed?: string;
}

/** Files this app takes in, by extension. */
export const IMPORTABLE = /\.(md|markdown|mdx|txt|pdf|xlsx?|hwpx?|png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm)$/i;
const embedOf = (name: string, src: string) => (DOC_FILE.test(name) || VIDEO_FILE.test(name) ? `[${name.replace(/[[\]]/g, '')}](${src})` : `![](${src})`);
const byName = (a: Source, b: Source) => a.path.localeCompare(b.path, undefined, { numeric: true });

/**
 * A tree of files as notes, the shape it came in:
 *
 * - its folders become groups, under `into` (a group, '' = the top), as deep as groups go;
 * - a folder beside a note of its name (`Trip.md` and `Trip/`, as Notion and Obsidian export pages) is that
 *   note's sub-pages, not a group of its own;
 * - a link or a picture a file reaches by a relative path (`![](img/a.png)`, Obsidian's `![[a.png]]`) comes with
 *   it, into the note rather than as a note of its own; a link to another file of the import becomes a [[link]];
 * - Google Keep's notes (a Takeout export: a .json per note) are read as Keep notes, in Keep's order.
 *
 * Files outside any folder go to `looseInto`.
 */
export async function importTree(sources: Source[], into = '', looseInto = into): Promise<Made[]> {
  const all = [...sources].sort(byName);
  const at = new Map(all.map((s) => [s.path, s]));
  const named = new Map<string, Source>(); // by file name, for an Obsidian embed that names no folder
  for (const s of all) if (!named.has(nameOf(s.path).toLowerCase())) named.set(nameOf(s.path).toLowerCase(), s);
  const made: Made[] = [];

  const groupFor = (dirs: string[], loose: boolean) => {
    if (loose && !dirs.length) return looseInto;
    return [...(into ? into.split('/') : []), ...dirs].slice(0, MAX_DEPTH).join('/');
  };

  // ---- Google Keep ----
  const taken = new Set<string>();
  const keep: (FromKeep & { group: string; source: Source })[] = [];
  for (const s of all.filter((x) => /\.json$/i.test(x.path))) {
    let json: unknown;
    try { json = JSON.parse(await s.text()); } catch { continue; }
    if (!isKeepNote(json)) continue;
    const dir = dirOf(s.path), inDir = (n: string) => (dir ? `${dir}/${n}` : n);
    taken.add(s.path).add(inDir(`${stem(nameOf(s.path))}.html`)).add(inDir('Labels.txt'));
    const copied: Record<string, string> = {};
    for (const a of json.attachments ?? []) {
      if (!a.filePath) continue;
      for (const c of attachmentCandidates(a.filePath)) {
        const file = at.get(inDir(c));
        if (!file) continue;
        taken.add(file.path);
        // trashed in Keep: left behind, its pictures too
        if (json.isTrashed || copied[a.filePath]) continue;
        try { copied[a.filePath] = await file.asset(); } catch { /* a kind Eve cannot hold */ }
      }
    }
    const note = keepToNote(json, copied);
    const base = groupFor(dir ? dir.split('/') : [], true);
    if (note) keep.push({ ...note, source: s, group: [base, note.sub].filter(Boolean).join('/').split('/').slice(0, MAX_DEPTH).join('/') });
  }
  for (const k of keep.sort(keepOrder)) {
    if (k.group) groups.remember(k.group);
    made.push({ note: notes.addImported(k.body, k.group, k.updatedAt || Date.now()), source: k.source });
  }

  // ---- the rest: text files read first, so links between them know their titles ----
  const texts = all.filter((s) => !taken.has(s.path) && TEXT_FILE.test(s.path));
  const bodies = new Map<string, string>();
  for (const s of texts) {
    const text = (await s.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    bodies.set(s.path, /^\s*#\s/.test(text) ? text : `# ${stem(nameOf(s.path))}\n\n${text}`);
  }
  const title = (path: string) => titleOf({ body: bodies.get(path)! });

  // a folder that is a page's: `Trip/` beside `Trip.md`
  const pageOf = new Map<string, string>();
  for (const s of texts) pageOf.set(s.path.replace(/\.[^./]+$/, ''), s.path);

  // a picture or a file a note reaches is copied once and goes into that note
  const copies = new Map<string, Promise<string>>();
  const copy = (s: Source) => { let c = copies.get(s.path); if (!c) copies.set(s.path, (c = s.asset())); return c; };
  const inside = new Set<string>();
  async function relink(body: string, dir: string): Promise<string> {
    const jobs: Promise<[string, string]>[] = [];
    // [label](path) and ![alt](path), the path maybe in <…> and followed by a "title"
    for (const m of body.matchAll(/(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(\s+"[^"]*")?\s*\)/g)) {
      const [whole, bang, label, target] = m;
      const path = resolveLink(dir, target);
      const file = path && (at.get(path) ?? [...at.values()].find((s) => s.path.toLowerCase() === path.toLowerCase()));
      if (!file || taken.has(file.path)) continue;
      if (bodies.has(file.path)) {
        const t = title(file.path);
        jobs.push(Promise.resolve([whole, label && label !== t ? `[[${t}|${label}]]` : `[[${t}]]`]));
      } else if (IMPORTABLE.test(file.path)) {
        inside.add(file.path);
        jobs.push(copy(file).then((src) => [whole, `${bang}[${label}](${src})`]));
      }
    }
    // Obsidian's ![[a.png]]: a file found by its name alone
    for (const m of body.matchAll(/!\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const file = named.get(m[1].trim().toLowerCase());
      if (!file || bodies.has(file.path) || taken.has(file.path) || !IMPORTABLE.test(file.path)) continue;
      inside.add(file.path);
      jobs.push(copy(file).then((src) => [m[0], embedOf(nameOf(file.path), src)]));
    }
    let out = body;
    for (const [from, to] of await Promise.all(jobs)) out = out.split(from).join(to);
    return out;
  }
  for (const s of texts) bodies.set(s.path, await relink(bodies.get(s.path)!, dirOf(s.path)));

  // shallowest first, so a page is made before what goes under it
  const rest = all.filter((s) => !taken.has(s.path) && !inside.has(s.path) && (bodies.has(s.path) || IMPORTABLE.test(s.path)));
  const depth = (s: Source) => s.path.split('/').length;
  const ids = new Map<string, string>();
  for (const s of rest.sort((a, b) => depth(a) - depth(b) || byName(a, b))) {
    const dirs = s.path.includes('/') ? dirOf(s.path).split('/') : [];
    const prefix = (i: number) => dirs.slice(0, i + 1).join('/');
    // the folders up to the first that is a page's are groups; the page it sits deepest in is its parent
    let j = dirs.findIndex((_, i) => pageOf.has(prefix(i)));
    if (j < 0) j = dirs.length;
    let parent: string | undefined;
    for (let i = dirs.length - 1; i >= j && !parent; i--) parent = ids.get(pageOf.get(prefix(i)) ?? '');
    const group = groupFor(dirs.slice(0, j), true);
    let body = bodies.get(s.path), embed: string | undefined;
    if (body === undefined) {
      embed = embedOf(nameOf(s.path), await copy(s));
      body = `# ${stem(nameOf(s.path))}\n\n${embed}\n`;
    }
    if (group) groups.remember(group);
    const note = notes.addImported(body, group, Date.now(), parent);
    ids.set(s.path, note.id);
    made.push({ note, source: s, embed });
  }
  return made;
}
