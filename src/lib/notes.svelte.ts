import { storage } from './platform';
import { flushEdits } from './pending';
import { appearance } from './appearance.svelte';
import { randomIcon } from './icons';
import { onlyHtml, plain, splitLink } from './markdown';
import { CALENDAR_NAME, CALENDAR_NOTE_ID, DAILY_TEMPLATE_ID, DEFAULT_TEMPLATE, dailyBody, dailyId, dayKey, isDailyId } from './daily';

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

/**
 * When a note with a fixed id (a day, the daily template, the calendar's row) was only just made here and not
 * written in yet. Another device may have made and written the same note already; this blank copy must not be
 * newer than that one, or the first sync kept the blank and pushed it over what was written there. Typing in
 * it dates it as any edit does.
 */
const UNWRITTEN = 0;

export function parse(text: string): Note | null {
  // a note saved on Windows (CRLF), or with a byte-order mark, is the same note: unread, it was skipped by the
  // pull and the older copy here pushed back over it
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
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



/** the line a note's title is read from: its first written line that is more than HTML tags or a comment */
const titleLine = (body: string) => body.split('\n').find((l) => l.trim() && !onlyHtml(l)) ?? '';
/** the first written line of a body, as it is (an empty title reads "Untitled" through titleOf) */
const plainTitleLine = (body: string) => plain(titleLine(body));

export function titleOf(n: Pick<Note, 'body'>): string {
  return plain(titleLine(n.body)) || 'Untitled';
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

/** Not a note: the daily notes' calendar, opened in the editor's place and kept in back/forward history. */
export const CALENDAR = 'calendar';

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
  /** set just before opening a note to write in it (today's daily note): the editor puts the caret at its end */
  caretEnd = $state(false); // reactive: an editor already showing the note acts on it too (Editor.svelte)
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
      const id = this.history[i];
      const n = this.all.find((x) => x.id === id);
      if ((n && !n.deleted) || (id === CALENDAR && appearance.s.dailyNotes)) { this.hIndex = i; this._cur = id; return; }
      i += d;
    }
  }
  loaded = $state(false);
  /** bumps whenever a note changes locally; sync listens to it */
  dirty = $state(0);

  /** the list's notes: everything but deleted ones and daily notes (those live in the calendar) */
  /** the list's notes that are notes: the calendar's row is in `visible` (it moves like one) but opens the calendar */
  get pages() { return this.visible.filter((n) => n.id !== CALENDAR_NOTE_ID); }
  get visible() {
    return this.all.filter((n) => !n.deleted && !isDailyId(n.id) && n.id !== DAILY_TEMPLATE_ID && (n.id !== CALENDAR_NOTE_ID || appearance.s.dailyNotes)).sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt);
  }
  /** daily notes, newest day first */
  get daily() {
    return this.all.filter((n) => !n.deleted && isDailyId(n.id)).sort((a, b) => (a.id < b.id ? 1 : -1));
  }

  /** the calendar's name and icon (its own little note, made on the first rename or icon change) */
  get calendar() {
    const n = this.all.find((x) => x.id === CALENDAR_NOTE_ID && !x.deleted);
    return { name: n ? titleOf(n) : CALENDAR_NAME, icon: n?.icon ?? '🗓️' };
  }
  setCalendar(patch: { name?: string; icon?: string }) {
    const cur = this.calendar;
    const name = (patch.name ?? cur.name).trim() || CALENDAR_NAME, icon = patch.icon ?? cur.icon;
    const n = this.ensureCalendar();
    Object.assign(n, { body: `# ${name}\n`, icon: icon || undefined, deleted: false, updatedAt: Date.now() });
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
  }
  /** The calendar's row: made the first time daily notes are on, at the top of Notes (it moves like a note, groups included). */
  ensureCalendar(): Note {
    let n = this.all.find((x) => x.id === CALENDAR_NOTE_ID);
    if (n) return n;
    const top = this.visible.filter((x) => x.group === '').reduce((m, x) => Math.min(m, x.order), 1);
    n = { id: CALENDAR_NOTE_ID, body: `# ${CALENDAR_NAME}\n`, updatedAt: UNWRITTEN, deleted: false, group: '', order: top - 1, icon: '🗓️' };
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return this.all.at(-1)!;
  }

  /** what a new day starts as: the template note, or the default until there is one */
  get dailyTemplate(): string {
    const t = this.all.find((n) => n.id === DAILY_TEMPLATE_ID && !n.deleted);
    return t ? t.body : DEFAULT_TEMPLATE;
  }
  /** The daily template's note, made from the default the first time. */
  templateNote(): Note {
    let n = this.all.find((x) => x.id === DAILY_TEMPLATE_ID);
    if (!n) {
      this.all.push({ id: DAILY_TEMPLATE_ID, body: DEFAULT_TEMPLATE, updatedAt: UNWRITTEN, deleted: false, group: '', order: 0, icon: '🗓️' });
      n = this.all.at(-1)!;
      void storage.write(n.id, serialize(n));
      this.dirty++;
    } else if (n.deleted) Object.assign(n, { deleted: false, body: DEFAULT_TEMPLATE, updatedAt: Date.now() });
    this.titles.set(n.id, titleOf(n));
    return n;
  }

  /** A day's note (today by default), started from the template when there is none yet. */
  dayNote(key = dayKey(new Date())): Note {
    const id = dailyId(key);
    let n = this.all.find((x) => x.id === id);
    if (n && !n.deleted) return n;
    const body = dailyBody(this.dailyTemplate, key);
    if (n) Object.assign(n, { deleted: false, body, updatedAt: Date.now() }); // a deleted day, begun again
    else { this.all.push({ id, body, updatedAt: UNWRITTEN, deleted: false, group: '', order: 0, icon: '🗓️' }); n = this.all.at(-1)!; }
    this.titles.set(id, titleOf(n));
    void storage.write(id, serialize(n));
    this.dirty++;
    return n;
  }
  /** Open a day's note in the editor (to write today's, from the reminder or the phone's +). */
  openDaily(key = dayKey(new Date())): Note {
    const n = this.dayNote(key);
    this.currentId = n.id;
    return n;
  }

  get current() {
    return this.all.find((n) => n.id === this.currentId) ?? null;
  }

  async load() {
    await storage.path(); // image srcs are resolved against it: an editor must not render before it is known
    const texts = await storage.list();
    this.all = texts.map(parse).filter((n): n is Note => !!n);
    for (const n of this.all) this.titles.set(n.id, titleOf(n));
    this.currentId = this.pages[0]?.id ?? null;
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
  addImported(body: string, group = this.current?.group ?? '', updatedAt = Date.now()): Note {
    const last = this.visible.filter((x) => x.group === group).at(-1);
    const n: Note = { id: newId(), body, updatedAt, deleted: false, group, order: last ? last.order + 1 : 0, icon: autoIcon() };
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

  /** write every edit still waiting on its debounce (the app is going to the background) */
  flushAll() { flushEdits(); for (const id of [...this.timers.keys()]) this.flush(id); }

  flush(id: string) {
    flushEdits(); // a long note's last keys may still be on their way from the editor
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
    if (was === undefined || was === now) { this.titles.set(n.id, now); return; }
    // A title on its way to another (each pause in typing flushes) is no rename yet while it is empty or is
    // another note's: "Ideas 2" → "Ideas" (on the way to "Ideas 3") made [[Ideas 2]] into [[Ideas]], and the
    // next step then took the other note's [[Ideas]] along. The links wait for a title of this note's own.
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    if (!/\S/.test(plainTitleLine(n.body))) return; // emptied, on the way to a new title
    if (this.all.some((o) => !o.deleted && o.id !== n.id && same(titleOf(o), now))) return;
    this.titles.set(n.id, now);
    // ponytail: scans every body on a rename; fine for local notes, index the links if it ever bites
    // every shape of the link: the page itself, one of its sections, and either under an alias
    // (`[[Title|shown as]]`, its bar escaped inside a table); in any case, as links are followed
    const link = new RegExp(`\\[\\[${was.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(#[^\\]|\\\\]*)?(?=\\]\\]|\\||\\\\\\|)`, 'gi');
    // "[[C# notes]]" is the note "C# notes", not "C" with a section, when there is such a note (splitLink)
    const isTitle = (t: string) => same(t, was) || this.all.some((o) => !o.deleted && o.id !== n.id && same(titleOf(o), t));
    const ours = (section: string | undefined) => !section || same(splitLink(was + section, isTitle)[0], was);
    for (const other of this.all) {
      if (other.deleted || other.id === n.id) continue;
      // a "$" in a title is just a "$"
      const body = other.body.replace(link, (m: string, section?: string) => (ours(section) ? `[[${now}${section ?? ''}` : m));
      if (body === other.body) continue;
      other.body = body;
      other.updatedAt = Date.now();
      this.flush(other.id);
    }
  }


  /** Make a note a sub-page of `parent` (null = a page of its own). Refuses a loop. */
  setParent(id: string, parent: string | null) {
    if (id === CALENDAR_NOTE_ID || parent === CALENDAR_NOTE_ID) return; // the calendar's row takes no sub-pages, is none
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
      order = prev ? this.between(list, i) : next.order - 1;
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
  /**
   * A rank between list[i - 1] and list[i]. Two notes can share a rank (imported, or older files): the
   * midpoint would share it too and the move would not show, so the list is ranked 0, 1, 2… first.
   */
  private between(list: Note[], i: number): number {
    if (list[i - 1].order >= list[i].order) {
      list.forEach((x, j) => { if (x.order !== j) { x.order = j; x.updatedAt = Date.now(); this.flush(x.id); } });
    }
    return (list[i - 1].order + list[i].order) / 2;
  }

  place(id: string, group: string, parent: string, before: string | null) {
    if (id === CALENDAR_NOTE_ID && parent) return; // the calendar's row is never a sub-page
    if (parent === CALENDAR_NOTE_ID) return;
    const n = this.all.find((x) => x.id === id);
    if (!n || id === before) return;
    if (parent && (parent === id || this.isAncestor(id, parent))) return; // never under its own sub-page
    const sibs = this.visible.filter((x) => x.group === group && (x.parent ?? '') === parent && x.id !== id);
    let order: number;
    if (before) {
      const i = sibs.findIndex((x) => x.id === before);
      if (i < 0) return;
      const prev = sibs[i - 1], next = sibs[i];
      order = prev ? this.between(sibs, i) : next.order - 1;
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
    if (this.currentId === id) this.currentId = this.pages[0]?.id ?? null;
    if (!this.currentId) this.create();
  }

  /** Open note by title, creating it if missing (used by [[wiki links]]). */
  /** Follow a `[[link]]`. `Title#Section` opens the page at that heading (Editor reads `section`). */
  openByTitle(link: string) {
    const find = (t: string) => this.visible.find((n) => titleOf(n).toLowerCase() === t.toLowerCase());
    const [title, section] = splitLink(link, (t) => !!find(t));
    const hit = find(title);
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
