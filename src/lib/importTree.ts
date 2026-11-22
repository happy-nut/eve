import { notes, titleOf, readProp, propName, OWN_KEYS, type Note, type PropValue } from './notes.svelte';
import { escapeTitle } from './markdown';
import { TEXT_FILE, DOC_FILE, VIDEO_FILE } from './drop';
import { dirOf, nameOf, stem, resolveLink } from './paths';
import { attachmentCandidates, isKeepNote, keepOrder, keepToNote, type FromKeep } from './keep';

export interface Source {
  path: string;
  text(): Promise<string>;
  asset(): Promise<string>;
}

export interface Made {
  note: Note;
  source: Source;
  embed?: string;
}

export const IMPORTABLE = /\.(md|markdown|mdx|txt|pdf|xlsx?|hwpx?|png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm)$/i;
const embedOf = (name: string, src: string) => (DOC_FILE.test(name) || VIDEO_FILE.test(name) ? `[${name.replace(/[[\]]/g, '')}](${src})` : `![](${src})`);
const byName = (a: Source, b: Source) => a.path.localeCompare(b.path, undefined, { numeric: true });
/** a file's or a folder's name as a title: Notion's export puts the page's id after it (`Trip 1a2b…`), left off */
const titled = (name: string) => name.replace(/ [0-9a-f]{32}$/, '').trim();
const escapeLineStart = (t: string) => t.replace(/^([-+>])/, '\\$1').replace(/^(\d+)([.)])/, '$1\\$2');
const heading = (t: string) => `# ${escapeLineStart(escapeTitle(t))}`;
const MD_LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(\s+"[^"]*")?\s*\)/g;

function frontMatter(yaml: string): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  let list: string | null = null;
  for (const line of yaml.split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list) { (out[list] as string[]).push(item[1].trim().replace(/^(["'])(.*)\1$/, '$2')); continue; }
    const kv = /^([^:#\s][^:]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const k = propName(kv[1]), v = kv[2].trim();
    list = null;
    if (!k || OWN_KEYS.has(k)) continue;
    if (!v) { out[k] = []; list = k; }
    else if (/^\[.*\]$/.test(v) && !Array.isArray(readProp(v))) out[k] = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean);
    else out[k] = readProp(v.replace(/^'(.*)'$/, '$1'));
  }
  return out;
}

interface ImportRun {
  all: Source[];
  at: Map<string, Source>;
  made: Made[];
  taken: Set<string>;
  pageFor: (dirs: string[], loose?: boolean) => string | undefined;
}

const assetOrNone = (file: Source): Promise<string | undefined> => new Promise<string>((ok) => ok(file.asset())).catch(() => undefined);

async function importKeep({ all, at, made, taken, pageFor }: ImportRun): Promise<void> {
  const keep: (FromKeep & { dirs: string[]; source: Source })[] = [];
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
        if (json.isTrashed || copied[a.filePath]) continue;
        const src = await assetOrNone(file);
        if (src !== undefined) copied[a.filePath] = src;
      }
    }
    const note = keepToNote(json, copied);
    if (note) keep.push({ ...note, source: s, dirs: [...(dir ? dir.split('/') : []), ...(note.sub ? note.sub.split('/') : [])] });
  }
  for (const k of keep.sort(keepOrder)) made.push({ note: notes.addImported(k.body, k.updatedAt || Date.now(), pageFor(k.dirs)), source: k.source });
}

async function importFiles({ all, at, made, taken, pageFor }: ImportRun): Promise<void> {
  const byFileName = new Map<string, Source>();
  for (const s of all) if (!byFileName.has(nameOf(s.path).toLowerCase())) byFileName.set(nameOf(s.path).toLowerCase(), s);
  const texts = all.filter((s) => !taken.has(s.path) && TEXT_FILE.test(s.path));
  const bodies = new Map<string, string>(), props = new Map<string, Record<string, PropValue>>();
  const used = new Set<string>();
  const free = (t: string) => {
    let out = t;
    for (let k = 2; used.has(out.toLowerCase()) || notes.byTitle(out); k++) out = `${t} ${k}`;
    used.add(out.toLowerCase());
    return out;
  };
  for (const s of texts) {
    let text = (await s.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
    if (fm) { props.set(s.path, frontMatter(fm[1])); text = text.slice(fm[0].length).replace(/^\n+/, ''); }
    const name = free(titled(stem(nameOf(s.path))));
    bodies.set(s.path, titleOf({ body: text }) === name ? text : `${heading(name)}\n\n${text}`);
  }
  const title = (path: string) => titleOf({ body: bodies.get(path)! });

  const pageFileOfFolder = new Map<string, string>();
  for (const s of texts) pageFileOfFolder.set(s.path.replace(/\.[^./]+$/, ''), s.path);

  const copies = new Map<string, Promise<string>>();
  const copy = (s: Source) => { let c = copies.get(s.path); if (!c) copies.set(s.path, (c = s.asset())); return c; };
  const inside = new Set<string>();
  async function relink(body: string, dir: string): Promise<string> {
    const jobs: Promise<[string, string]>[] = [];
    for (const m of body.matchAll(MD_LINK)) {
      const [whole, bang, label, target] = m;
      const path = resolveLink(dir, target);
      const file = path && (at.get(path) ?? [...at.values()].find((s) => s.path.toLowerCase() === path.toLowerCase()));
      if (!file || taken.has(file.path)) continue;
      if (bodies.has(file.path)) {
        // to a section of it (`Plan.md#goals`): to that section still
        let sec = /#(.+)$/.exec(target)?.[1] ?? '';
        try { sec = decodeURIComponent(sec); } catch { /* as written */ }
        const t = title(file.path) + (sec ? `#${sec}` : '');
        jobs.push(Promise.resolve([whole, label && label !== t ? `[[${t}|${label}]]` : `[[${t}]]`]));
      } else if (IMPORTABLE.test(file.path)) {
        inside.add(file.path);
        jobs.push(copy(file).then((src) => [whole, `${bang}[${label}](${src})`]));
      }
    }
    // Obsidian's ![[a.png]]: a file found by its name alone
    for (const m of body.matchAll(/!\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\]/g)) {
      const file = byFileName.get(m[1].trim().toLowerCase());
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
    // the folders up to the first that is a page's are pages of their own; the page it sits deepest in is its parent
    let j = dirs.findIndex((_, i) => pageFileOfFolder.has(prefix(i)));
    if (j < 0) j = dirs.length;
    let parent: string | undefined;
    for (let i = dirs.length - 1; i >= j && !parent; i--) parent = ids.get(pageFileOfFolder.get(prefix(i)) ?? '');

    let body = bodies.get(s.path), embed: string | undefined;
    if (body === undefined) {
      embed = embedOf(nameOf(s.path), await copy(s));
      body = `${heading(titled(stem(nameOf(s.path))))}\n\n${embed}\n`;
    }
    const note = notes.addImported(body, Date.now(), parent ?? pageFor(dirs.slice(0, j)), props.get(s.path));
    ids.set(s.path, note.id);
    made.push({ note, source: s, embed });
  }
}

/**
 * A tree of files as notes, the shape it came in:
 *
 * - its folders become pages of their names, under `into` (a page's id, '' = the top), what is in them pages under
 *   them, as Notion has a folder;
 * - a folder beside a note of its name (`Trip.md` and `Trip/`, as Notion and Obsidian export pages) is that
 *   note's sub-pages, not a page of its own;
 * - a link or a picture a file reaches by a relative path (`![](img/a.png)`, Obsidian's `![[a.png]]`) comes with
 *   it, into the note rather than as a note of its own; a link to another file of the import becomes a [[link]];
 * - Google Keep's notes (a Takeout export: a .json per note) are read as Keep notes, in Keep's order.
 *
 * Files outside any folder go to `looseInto`.
 */
export async function importTree(sources: Source[], into = '', looseInto = into): Promise<Made[]> {
  const all = [...sources].sort(byName);
  const at = new Map(all.map((s) => [s.path, s]));
  const made: Made[] = [];

  const folders = new Map<string, string>();
  const pageFor = (dirs: string[], loose = true): string | undefined => {
    let up = (loose && !dirs.length ? looseInto : into) || undefined;
    dirs.forEach((d, i) => {
      const key = dirs.slice(0, i + 1).join('/');
      let id = folders.get(key);
      if (!id) folders.set(key, (id = notes.addImported(`${heading(titled(d))}\n`, Date.now(), up).id));
      up = id;
    });
    return up;
  };

  const run: ImportRun = { all, at, made, taken: new Set<string>(), pageFor };
  await importKeep(run);
  await importFiles(run);
  return made;
}
