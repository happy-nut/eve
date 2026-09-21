import { storage } from './platform';
import { appearance } from './appearance.svelte';
import { randomIcon } from './icons';
import { plain, splitLink } from './markdown';

export { plain };

export interface Note {
  id: string;
  body: string; // markdown
  updatedAt: number; // ms epoch
  deleted: boolean;
  group: string; // '' = root
  order: number; // manual sort rank within its group (ascending)
  parent?: string; // id of the page this one was created inside (sub-page; sits under it in the sidebar)
  icon?: string; // emoji shown in the sidebar (Notion-style)
}

/** An icon for a note that was just made, unless the setting is off. */
const autoIcon = () => (appearance.s.autoIcon ? randomIcon() : undefined);

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- (de)serialization: markdown with a tiny frontmatter -------------------
export function serialize(n: Note): string {
  return `---\nid: ${n.id}\nupdated: ${n.updatedAt}\ndeleted: ${n.deleted}\norder: ${n.order}${n.group ? `\ngroup: ${n.group}` : ''}${n.parent ? `\nparent: ${n.parent}` : ''}${n.icon ? `\nicon: ${n.icon}` : ''}\n---\n${n.body}`;
}

export function parse(text: string): Note | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.id) return null;
  return {
    id: meta.id,
    body: m[2],
    updatedAt: Number(meta.updated) || 0,
    deleted: meta.deleted === 'true',
    group: meta.group ?? '',
    parent: meta.parent || undefined,
    icon: meta.icon || undefined,
    // legacy notes without order: newest first
    order: meta.order !== undefined && !Number.isNaN(Number(meta.order)) ? Number(meta.order) : -(Number(meta.updated) || 0),
  };
}



export function titleOf(n: Pick<Note, 'body'>): string {
  const first = n.body.split('\n').find((l) => l.trim()) ?? '';
  return plain(first) || 'Untitled';
}

/** `list` depth-first: every page is followed by its sub-pages (`folded` hides a page's sub-pages,
 *  it still reports `kids`). A sub-page whose parent is not in `list` (deleted, or dragged into
 *  another group) shows up at the top level. */
export function nested(list: Note[], folded?: (id: string) => boolean): { n: Note; depth: number; kids: boolean }[] {
  const ids = new Set(list.map((n) => n.id));
  const kids = new Map<string, Note[]>();
  for (const n of list) {
    const p = n.parent && ids.has(n.parent) ? n.parent : '';
    (kids.get(p) ?? kids.set(p, []).get(p)!).push(n);
  }
  const out: { n: Note; depth: number; kids: boolean }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const n of kids.get(parent) ?? []) {
      out.push({ n, depth, kids: kids.has(n.id) });
      if (!folded?.(n.id)) walk(n.id, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

// ---- reactive store --------------------------------------------------------
class NotesStore {
  all = $state<Note[]>([]);
  private _cur = $state<string | null>(null);
  /** visited-note history for back/forward (⌘[ / ⌘]) */
  private history = $state<string[]>([]);
  private hIndex = $state(-1);
  get canBack() { return this.hIndex > 0; }
  get canForward() { return this.hIndex < this.history.length - 1; }
  /** last cursor position per note, restored when navigating back */
  cursor = new Map<string, number>();
  /** set just before creating a page whose title is a placeholder: the editor selects it on open */
  selectTitle = false;
  /** the heading a `[[Title#Section]]` link just aimed at; the editor scrolls there as the page opens */
  section = '';

  get currentId() { return this._cur; }
  set currentId(id: string | null) {
    if (id === this._cur) return;
    if (id) {
      this.history = this.history.slice(0, this.hIndex + 1).filter((h) => h !== id);
      this.history.push(id);
      this.hIndex = this.history.length - 1;
    }
    this._cur = id;
  }
  back() { this.step(-1); }
  forward() { this.step(1); }
  private step(d: number) {
    let i = this.hIndex + d;
    while (i >= 0 && i < this.history.length) {
      const n = this.all.find((x) => x.id === this.history[i]);
      if (n && !n.deleted) { this.hIndex = i; this._cur = n.id; return; }
      i += d;
    }
  }
  loaded = $state(false);
  /** bumps whenever a note changes locally; sync listens to it */
  dirty = $state(0);

  get visible() {
    return this.all.filter((n) => !n.deleted).sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt);
  }
  get current() {
    return this.all.find((n) => n.id === this.currentId) ?? null;
  }

  async load() {
    await storage.path(); // image srcs are resolved against it: an editor must not render before it is known
    const texts = await storage.list();
    this.all = texts.map(parse).filter((n): n is Note => !!n);
    for (const n of this.all) this.titles.set(n.id, titleOf(n));
    this.currentId = this.visible[0]?.id ?? null;
    if (!this.currentId) this.create();
    this.loaded = true;
  }

  create(body = '', group = this.current?.group ?? '', parent?: string): Note {
    const first = this.visible.find((x) => x.group === group);
    const n: Note = { id: newId(), body, updatedAt: Date.now(), deleted: false, group, parent, order: first ? first.order - 1 : 0, icon: autoIcon() };
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    this.currentId = n.id;
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return n;
  }

  /**
   * A note made by importing a file. It joins the end of its group (an import reads top to bottom)
   * and leaves the open note alone — the file usually links itself into the page being written.
   */
  addImported(body: string, group = this.current?.group ?? ''): Note {
    const last = this.visible.filter((x) => x.group === group).at(-1);
    const n: Note = { id: newId(), body, updatedAt: Date.now(), deleted: false, group, order: last ? last.order + 1 : 0, icon: autoIcon() };
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return n;
  }

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  update(id: string, body: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n || n.body === body) return;
    n.body = body;
    n.updatedAt = Date.now();
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.flush(id), 300));
  }

  flush(id: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.followRename(n);
    void storage.write(n.id, serialize(n));
    this.dirty++;
  }

  /** title as of the last flush, so a retitled page can take its [[links]] with it */
  private titles = new Map<string, string>();
  private followRename(n: Note) {
    const now = titleOf(n);
    const was = this.titles.get(n.id);
    this.titles.set(n.id, now);
    if (was === undefined || was === now) return;
    // ponytail: scans every body on a rename; fine for local notes, index the links if it ever bites
    for (const other of this.all) {
      if (other.deleted || other.id === n.id) continue;
      // both shapes of the link: the page itself, and one of its sections
      const body = other.body.split(`[[${was}]]`).join(`[[${now}]]`).split(`[[${was}#`).join(`[[${now}#`);
      if (body === other.body) continue;
      other.body = body;
      other.updatedAt = Date.now();
      this.flush(other.id);
    }
  }


  /** Make a note a sub-page of `parent` (null = a page of its own). Refuses a loop. */
  setParent(id: string, parent: string | null) {
    const n = this.all.find((x) => x.id === id);
    if (!n || (parent && (parent === id || this.isAncestor(id, parent)))) return;
    n.parent = parent ?? undefined;
    n.updatedAt = Date.now();
    this.flush(id);
  }

  /** Is `id` somewhere above `other` in the sub-page chain? (a page cannot be tucked under its own child) */
  isAncestor(id: string, other: string): boolean {
    let cur = this.all.find((n) => n.id === other);
    while (cur?.parent) {
      if (cur.parent === id) return true;
      cur = this.all.find((n) => n.id === cur!.parent);
    }
    return false;
  }

  setIcon(id: string, icon: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    n.icon = icon.trim() || undefined;
    n.updatedAt = Date.now();
    this.flush(id);
  }

  /** Change a note's group path without touching its rank (used when a group is moved/renamed). */
  relabel(id: string, group: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n || n.group === group) return;
    n.group = group;
    n.updatedAt = Date.now();
    this.flush(id);
  }

  /** Move a note into a group ('' = root), appended at the end. */
  setGroup(id: string, group: string) {
    this.move(id, group, null);
  }

  /**
   * Place a note in `group` right before `beforeId` (null = at the end).
   * Ranks are floats; midpoints are used so only the moved note is rewritten.
   * ponytail: ranks can get arbitrarily close after thousands of moves; renormalize then.
   */
  move(id: string, group: string, beforeId: string | null) {
    const n = this.all.find((x) => x.id === id);
    if (!n || id === beforeId) return;
    const list = this.visible.filter((x) => x.group === group && x.id !== id);
    let order: number;
    if (beforeId) {
      const i = list.findIndex((x) => x.id === beforeId);
      if (i < 0) return;
      const prev = list[i - 1], next = list[i];
      order = prev ? (prev.order + next.order) / 2 : next.order - 1;
    } else {
      const last = list.at(-1);
      order = last ? last.order + 1 : 0;
    }
    if (n.group === group && n.order === order) return;
    const from = n.group;
    n.group = group;
    n.order = order;
    n.parent = undefined; // dropped by hand: it is a page of its own now, wherever it landed
    n.updatedAt = Date.now();
    this.flush(id);
    // its own sub-pages follow it into the new group (they keep their rank and their parent)
    if (from !== group) for (const kid of this.all) if (!kid.deleted && kid.parent === id) this.relabel(kid.id, group);
  }

  /**
   * Put a note at an exact spot: a group, the page it belongs under ('' = top level of the group) and
   * the sibling it goes in front of (null = last). This is what the sidebar's ⌥-arrow walk moves with,
   * so a page can slide into another page as a sub-page instead of only stepping past it.
   */
  place(id: string, group: string, parent: string, before: string | null) {
    const n = this.all.find((x) => x.id === id);
    if (!n || id === before) return;
    if (parent && (parent === id || this.isAncestor(id, parent))) return; // never under its own sub-page
    const sibs = this.visible.filter((x) => x.group === group && (x.parent ?? '') === parent && x.id !== id);
    let order: number;
    if (before) {
      const i = sibs.findIndex((x) => x.id === before);
      if (i < 0) return;
      const prev = sibs[i - 1], next = sibs[i];
      order = prev ? (prev.order + next.order) / 2 : next.order - 1;
    } else {
      const last = sibs.at(-1);
      order = last ? last.order + 1 : 0;
    }
    const from = n.group;
    n.group = group;
    n.parent = parent || undefined;
    n.order = order;
    n.updatedAt = Date.now();
    this.flush(id);
    if (from !== group) this.followIntoGroup(id, group); // its own sub-pages come along
  }

  private followIntoGroup(id: string, group: string) {
    for (const kid of this.all) {
      if (kid.deleted || kid.parent !== id) continue;
      this.relabel(kid.id, group);
      this.followIntoGroup(kid.id, group);
    }
  }

  /** Delete a note (tombstone). */
  remove(id: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    n.deleted = true;
    n.updatedAt = Date.now();
    this.flush(id);
    if (this.currentId === id) this.currentId = this.visible[0]?.id ?? null;
    if (!this.currentId) this.create();
  }

  /** Open note by title, creating it if missing (used by [[wiki links]]). */
  /** Follow a `[[link]]`. `Title#Section` opens the page at that heading (Editor reads `section`). */
  openByTitle(link: string) {
    const [title, section] = splitLink(link);
    const hit = this.visible.find((n) => titleOf(n).toLowerCase() === title.toLowerCase());
    this.section = hit ? section : '';
    this.currentId = hit ? hit.id : this.create(`# ${title}\n\n`).id;
  }

  /** Apply notes coming from sync (last-writer-wins, or unconditionally with `force`). Returns true if anything changed. */
  mergeRemote(remote: Note[], force = false): boolean {
    let changed = false;
    for (const r of remote) {
      const local = this.all.find((n) => n.id === r.id);
      if (!force && local && local.updatedAt >= r.updatedAt) continue;
      if (local) Object.assign(local, { icon: undefined, parent: undefined }, r); // a removed icon/parent must come through too
      else this.all.push(r);
      this.titles.set(r.id, titleOf(r)); // a remote edit is not this note being renamed here
      void storage.write(r.id, serialize(r));
      changed = true;
    }
    return changed;
  }
}

export const notes = new NotesStore();
