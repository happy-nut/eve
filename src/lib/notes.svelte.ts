import { untrack } from 'svelte';
import { storage } from './platform';
import { flushEdits } from './pending';
import { appearance } from './appearance.svelte';
import { randomIcon } from './icons';
import { ui } from './ui.svelte';
import { history, undoSource } from './history.svelte';
import { legacyPlain, onlyHtml, plain, splitAlias, splitLink } from './markdown';
import { CALENDAR_NAME, CALENDAR_NOTE_ID, DAILY_TEMPLATE_ID, DEFAULT_TEMPLATE, dailyBody, dailyId, dayKey, isDailyId, isWritten } from './daily';

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
  wide?: boolean; // laid out across the whole pane instead of the reading width
}

/** An icon for a note that was just made, unless the setting is off. */
const autoIcon = () => (appearance.s.autoIcon ? randomIcon() : undefined);

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- (de)serialization: markdown with a tiny frontmatter -------------------
export function serialize(n: Note): string {
  return `---\nid: ${n.id}\nupdated: ${n.updatedAt}\ndeleted: ${n.deleted}\norder: ${n.order}${n.group ? `\ngroup: ${n.group}` : ''}${n.parent ? `\nparent: ${n.parent}` : ''}${n.icon ? `\nicon: ${n.icon}` : ''}${n.wide ? '\nwide: true' : ''}\n---\n${n.body}`;
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
    wide: meta.wide === 'true' || undefined,
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
/** the title as it was read before 0.7.35, which the [[links]] written then still say (see legacyPlain) */
export const legacyTitleOf = (n: Pick<Note, 'body'>): string => legacyPlain(titleLine(n.body)) || 'Untitled';

/** A search's matches, the note called what was typed first, then the ones whose title starts with it, then the ones
 *  whose title has it anywhere, then the ones that only say it somewhere: ↩ opens the first, and it used to be whichever
 *  came first in the list. Each tier keeps the list's order. `q` is lower case. */
export function rankByTitle<T extends Pick<Note, 'body'>>(list: T[], q: string): T[] {
  const tier = (n: T) => {
    const t = titleOf(n).toLowerCase();
    return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
  };
  return list.map((n) => ({ n, t: tier(n) })).sort((a, b) => a.t - b.t).map((x) => x.n); // a stable sort
}

/** `list` depth-first: every page is followed by its sub-pages (`folded` hides a page's sub-pages,
 *  it still reports `kids`). A sub-page whose parent is not in `list` (deleted, or dragged into
 *  another group) shows up at the top level. */
export function nested(list: readonly Note[], folded?: (id: string) => boolean): { n: Note; depth: number; kids: boolean }[] {
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

/**
 * The note next to `current` in the list (⌘↓ / ⌘↑), round the end. The calendar is its row; a page not in
 * the list (a daily note) steps to the list's first note, or back to its last.
 */
export function stepFrom<T extends { id: string }>(list: T[], current: string | null, delta: number): T | undefined {
  const i = list.findIndex((n) => n.id === (current === CALENDAR ? CALENDAR_NOTE_ID : current));
  if (i < 0) return list[delta > 0 ? 0 : list.length - 1];
  return list[(i + delta + list.length) % list.length];
}

/** the note last looked at, kept on this device for the next start */
const LAST = 'eve.lastNote';
function remember(id: string | null) { try { if (id) localStorage.setItem(LAST, id); } catch { /* private mode: no memory, no harm */ } }
function lastSeen(): string | null { try { return localStorage.getItem(LAST); } catch { return null; } }

// ---- reactive store --------------------------------------------------------
class NotesStore {
  all = $state<Note[]>([]);
  private _cur = $state<string | null>(null);
  /** visited-note history for back/forward (⌘[ / ⌘]) */
  private history = $state<string[]>([]);
  private hIndex = $state(-1);
  // only where back/forward would actually go: a deleted note in the history is stepped over (step), so a
  // history of nothing else left the button lit and doing nothing
  get canBack() { return this.landing(-1) >= 0; }
  get canForward() { return this.landing(1) >= 0; }
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
    if (id === CALENDAR_NOTE_ID) id = CALENDAR; // its row opens the calendar: history keeps the calendar, or Back opened it again
    if (id === this._cur) return;
    const left = this._cur;
    // a long note's (or a board card's) last keys, handed over while what they were typed into is still on
    // screen: after the switch the board they belong to is gone, and they went nowhere
    flushEdits();
    if (id) {
      this.history = this.history.slice(0, this.hIndex + 1).filter((h) => h !== id);
      this.history.push(id);
      this.hIndex = this.history.length - 1;
    }
    this._cur = id;
    remember(id);
    this.leave(left);
  }
  back() { this.step(-1); }
  forward() { this.step(1); }
  /** the history entry back/forward lands on (deleted notes skipped), -1 for none */
  private landing(d: number): number {
    for (let i = this.hIndex + d; i >= 0 && i < this.history.length; i += d) {
      const id = this.history[i];
      const n = this.all.find((x) => x.id === id);
      if ((n && !n.deleted) || (id === CALENDAR && appearance.s.dailyNotes)) return i;
    }
    return -1;
  }
  private step(d: number) {
    const i = this.landing(d);
    if (i < 0) return;
    const left = this._cur;
    this.hIndex = i;
    this._cur = this.history[i];
    remember(this._cur);
    this.leave(left);
  }

  /**
   * Notes made here this session (⌘N, the +, a [[link]] to a page not there yet) that nothing has been written in
   * since: the body still as it was made. Left like that, one goes again — every ⌘N used to leave an "Untitled"
   * behind for good. Not a day's note or the calendar's (they are not made by create), nor anything sync or an
   * import brought: those were written somewhere. In memory only: after a restart a note is just a note.
   */
  private untouched = new Set<string>();
  /** the open note moved on from `id`: gone quietly if it was never written in (nothing to undo: it was empty) */
  private leave(id: string | null) {
    if (!id || !this.untouched.has(id)) return;
    this.untouched.delete(id);
    const n = this.all.find((x) => x.id === id);
    if (!n || n.deleted) return;
    n.deleted = true;
    n.updatedAt = Date.now();
    this.flush(id);
  }
  /**
   * The open note put away without another taking its place (a phone's back to the list): if it was never written
   * in, it goes as it would have on the next note opened, and the note next to it in the list is the open one. Nothing
   * is made in its place: the list is what is on screen.
   */
  letGo() {
    const id = this._cur;
    if (!id || !this.untouched.has(id)) return;
    this.currentId = this.neighbourOf(id)?.id ?? null; // moving on from it takes it away (leave); none left: nothing open
  }

  /** something done to the note itself (written in, an icon picked, moved by hand), or a link to it written
   *  elsewhere (a sub-page made with /page): it is kept */
  touched(id: string) { this.untouched.delete(id); }
  loaded = $state(false);
  /** the app opened on the note last looked at */
  resumed = false;
  /** bumps whenever a note changes locally; sync listens to it */
  dirty = $state(0);

  /** the list's notes: everything but deleted ones and daily notes (those live in the calendar) */
  /** the list's notes that are notes: the calendar's row is in `visible` (it moves like one) but opens the calendar */
  // Kept, not worked out at every read: the list, a link drawn, a row of the sidebar each read them, and with 800
  // notes filtering and sorting them at each read made opening a note take a third of a second. They are shared:
  // nothing may sort or splice them in place.
  get pages(): readonly Note[] { return this.#pages; }
  get visible(): readonly Note[] { return this.#visible; }
  #visible = $derived(this.all.filter((n) => !n.deleted && !isDailyId(n.id) && n.id !== DAILY_TEMPLATE_ID && (n.id !== CALENDAR_NOTE_ID || appearance.s.dailyNotes)).sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt));
  #pages = $derived(this.#visible.filter((n) => n.id !== CALENDAR_NOTE_ID));
  /**
   * The list as the sidebar stacks it: `shown` without what folded groups and pages hide, `all` with it.
   * groups.svelte.ts fills this in (it reads the notes, so they cannot import it back); until then, rank order.
   */
  sidebar: { shown: () => readonly Note[]; all: () => readonly Note[] } = { shown: () => this.visible, all: () => this.visible };
  /** the list's first note, as the sidebar shows it (not one tucked away in a folded group, when there is another) */
  firstPage(): Note | undefined {
    const page = (n: Note) => n.id !== CALENDAR_NOTE_ID;
    return this.sidebar.shown().find(page) ?? this.sidebar.all().find(page);
  }
  /** The note to open in place of `id` going away: the row below it in the list, else the one above, else the first. */
  private neighbourOf(id: string): Note | undefined {
    const page = (n: Note) => n.id !== id && n.id !== CALENDAR_NOTE_ID;
    for (const list of [this.sidebar.shown(), this.sidebar.all()]) {
      const i = list.findIndex((n) => n.id === id);
      const nb = i < 0 ? undefined : list.slice(i + 1).find(page) ?? list.slice(0, i).findLast(page);
      if (nb) return nb;
    }
    return this.sidebar.shown().find(page) ?? this.sidebar.all().find(page); // not in the list (a day's note): the list's first
  }

  /** daily notes, newest day first */
  get daily(): readonly Note[] { return this.#daily; }
  #daily = $derived(this.all.filter((n) => !n.deleted && isDailyId(n.id)).sort((a, b) => (a.id < b.id ? 1 : -1)));

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
    if (n && n.deleted) { // deleted (from an older Eve, or another device): the row comes back, on every device
      Object.assign(n, { deleted: false, updatedAt: Date.now() });
      void storage.write(n.id, serialize(n));
      this.dirty++;
    }
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
  /**
   * A day picked in the calendar, to look at: what its page shows, and where what is typed there goes. A day
   * with no note yet gets one only once something is written in it. Looking used to be enough to make the
   * note, save it and sync it, and the calendar then marked every day merely looked at.
   */
  dayDraft(key: string): { body: string; write(md: string): void; readonly note: Note | null } {
    const id = dailyId(key);
    let note = this.all.find((x) => x.id === id && !x.deleted) ?? null;
    const body = note?.body ?? dailyBody(this.dailyTemplate, key);
    return {
      body,
      write: (md) => {
        if (!note && !isWritten(md, this.dailyTemplate, key)) return; // still only the template (or less)
        note ??= this.dayNote(key);
        this.update(note.id, md);
      },
      get note() { return note; },
    };
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
    // the note last looked at, as it was left (a phone opens on it, not on the list); else the list's first
    const last = lastSeen();
    this.resumed = !!last && (last === CALENDAR ? appearance.s.dailyNotes : this.all.some((n) => n.id === last && !n.deleted));
    this.currentId = this.resumed ? last : this.firstPage()?.id ?? null;
    if (!this.currentId) history.quietly(() => this.create());
    this.loaded = true;
  }

  create(body = '', group = this.current?.group ?? '', parent?: string): Note {
    history.record();
    const first = this.visible.find((x) => x.group === group);
    const n: Note = { id: newId(), body, updatedAt: Date.now(), deleted: false, group, parent, order: first ? first.order - 1 : 0, icon: autoIcon() };
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    this.untouched.add(n.id);
    this.currentId = n.id;
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return n;
  }

  /**
   * A note made by importing a file. It joins the end of its group (an import reads top to bottom)
   * and leaves the open note alone — the file usually links itself into the page being written.
   */
  addImported(body: string, group = this.current?.group ?? '', updatedAt = Date.now(), parent?: string): Note {
    history.record();
    const last = this.visible.filter((x) => x.group === group).at(-1);
    const n: Note = { id: newId(), body, updatedAt, deleted: false, group, ...(parent ? { parent } : {}), order: last ? last.order + 1 : 0, icon: autoIcon() };
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return n;
  }

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  update(id: string, body: string) {
    const n = this.all.find((x) => x.id === id);
    // the editor writes no final newline where the file has one: the same note, not an edit
    if (!n || n.body === body || n.body.replace(/\n+$/, '') === body.replace(/\n+$/, '')) return;
    this.touched(id);
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
    history.record();
    if (id === CALENDAR_NOTE_ID || parent === CALENDAR_NOTE_ID) return; // the calendar's row takes no sub-pages, is none
    const n = this.all.find((x) => x.id === id);
    if (!n || (parent && (parent === id || this.isAncestor(id, parent)))) return;
    this.touched(id);
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
    history.record();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    this.touched(id);
    n.icon = icon.trim() || undefined;
    n.updatedAt = Date.now();
    this.flush(id);
  }

  setWide(id: string, wide: boolean) {
    history.record();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    this.touched(id);
    n.wide = wide || undefined;
    n.updatedAt = Date.now();
    this.flush(id);
  }

  /** A note back where it stood, exactly (a deleted group's Undo): no rank of its own worked out, no sub-pages moved. */
  putBack(id: string, at: Pick<Note, 'group' | 'parent' | 'order'>) {
    history.record();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    Object.assign(n, { group: at.group, parent: at.parent, order: at.order, updatedAt: Date.now() });
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
    history.record();
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
    this.touched(id);
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
    history.record();
    if (id === CALENDAR_NOTE_ID && parent) return; // the calendar's row is never a sub-page
    if (parent === CALENDAR_NOTE_ID) return;
    const n = this.all.find((x) => x.id === id);
    if (!n || id === before) return;
    if (parent && (parent === id || this.isAncestor(id, parent))) return; // never under its own sub-page
    this.touched(id);
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

  /** Delete a note (tombstone). A toast offers it back for a few seconds: the dialog before it is easy to say yes to. */
  remove(id: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    const step = history.record();
    this.untouched.delete(id); // deleted by hand: it goes the way any note does, and can come back
    // the open note deleted: the one next to it in the list comes up. The list's first by rank was opened
    // before, often a note deep in a folded group, nowhere near where the user was.
    const next = this.currentId === id ? this.neighbourOf(id) : undefined;
    n.deleted = true;
    n.updatedAt = Date.now();
    this.flush(id);
    // (a note made here because there was none left is untouched: Undo moving on from it takes it away again)
    if (this.currentId === id) this.currentId = next?.id ?? null;
    if (!this.currentId) this.create();
    // its Undo is this step taken back (the next note it opened, the one made because none was left, all of it);
    // with something done since, the note alone
    ui.toast(`Deleted “${titleOf(n)}”`, { label: 'Undo', run: () => { if (!history.undo(step)) this.restore(id); } });
  }
  /** A deleted note back as it was, and open. Dated now: the tombstone has synced, and must not win over it. */
  restore(id: string) {
    history.record();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    n.deleted = false;
    n.updatedAt = Date.now();
    this.flush(id);
    this.currentId = id;
  }

  /** Open note by title, creating it if missing (used by [[wiki links]]). */
  /** Follow a `[[link]]`. `Title#Section` opens the page at that heading (Editor reads `section`). */
  /**
   * Every title a [[link]] can find a page by, in one string: it changes when a page is made, renamed or deleted, not
   * at every key typed into one, so what watches it (a link drawn as missing, onTitles) is not run at every key either.
   * Each note's titles are read once per version of it.
   */
  private titleKey = $derived(this.visible.map((n) => this.titlesOf(n)).join('\n'));
  private titleCache = new Map<string, { body: string; key: string }>();
  private titlesOf(n: Note): string {
    const had = this.titleCache.get(n.id);
    if (had?.body === n.body) return had.key;
    const key = titleOf(n) + '\u0000' + legacyTitleOf(n);
    this.titleCache.set(n.id, { body: n.body, key });
    return key;
  }
  /** `run` now and whenever the pages' titles change (made, renamed, deleted); the returned function stops it */
  onTitles(run: () => void): () => void {
    run();
    let seen = this.titleKey; // the effect's first run comes a moment later: only a change since then counts
    return $effect.root(() => {
      $effect(() => {
        const key = this.titleKey;
        if (key === seen) return;
        seen = key;
        untrack(run);
      });
    });
  }

  /** the page a [[link]] names: by its title, else by the title it had when the link was written */
  byTitle(t: string): Note | undefined {
    const want = t.toLowerCase();
    return this.#byTitle.now.get(want) ?? this.#byTitle.was.get(want);
  }
  /** every page by its title and by its old one, lower case, the first in the list winning (each link drawn asks) */
  #byTitle = $derived.by(() => {
    const now = new Map<string, Note>(), was = new Map<string, Note>();
    for (const n of this.visible) {
      const [t, legacy] = this.titlesOf(n).toLowerCase().split('\u0000');
      if (!now.has(t)) now.set(t, n);
      if (!was.has(legacy)) was.set(legacy, n);
    }
    return { now, was };
  });
  /**
   * The notes whose [[links]] lead to `id` (Notion's backlinks): the page, a section of it, under an alias or a title it
   * had, from any note or day but itself; each with the first line that links there, as words. A link in code is code.
   */
  linksTo(id: string): { note: Note; line: string }[] {
    const out: { note: Note; line: string }[] = [];
    const find = (t: string) => this.byTitle(t);
    for (const n of this.all) {
      if (n.deleted || n.id === id || n.id === DAILY_TEMPLATE_ID || n.id === CALENDAR_NOTE_ID || !n.body.includes('[[')) continue;
      const hit = this.linksOf(n).find((l) => find(splitLink(l.link, (t) => !!find(t))[0])?.id === id);
      if (hit) out.push({ note: n, line: hit.line });
    }
    return out;
  }
  /** a note's [[links]] with the line each is on, read once per version of the note (every page asks of every note) */
  private linkCache = new Map<string, { body: string; links: { link: string; line: string }[] }>();
  private linksOf(n: Note) {
    const had = this.linkCache.get(n.id);
    if (had?.body === n.body) return had.links;
    const links: { link: string; line: string }[] = [];
    let fenced = false;
    for (const raw of n.body.split('\n')) {
      if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
      if (fenced || !raw.includes('[[')) continue;
      // a to-do's box is no part of what the line says (plain takes the list's mark, not the box after it)
      const line = plain(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/, ''));
      for (const m of raw.matchAll(/\[\[([^\]\n]+?)\]\]/g)) links.push({ link: splitAlias(m[1])[0], line });
    }
    this.linkCache.set(n.id, { body: n.body, links });
    return links;
  }

  openByTitle(link: string) {
    const find = (t: string) => this.byTitle(t);
    const [title, section] = splitLink(link, (t) => !!find(t));
    const hit = find(title);
    this.section = hit ? section : '';
    this.currentId = hit ? hit.id : this.create(`# ${title}\n\n`).id;
  }

  /**
   * A note's version that sync could not put together with this device's (both changed the same lines): kept as a
   * note of its own beside it, its title saying so, and said in a toast. No one's step to undo.
   */
  keepConflictCopy(n: Note) {
    const [first, ...rest] = n.body.split('\n');
    const body = [`${first.trim() ? first : '# ' + titleOf(n)} (conflict copy)`, ...rest].join('\n');
    const copy = history.quietly(() => this.addImported(body, n.group, Date.now(), n.parent));
    if (n.icon) { copy.icon = n.icon; void storage.write(copy.id, serialize(copy)); } // recognisable as the same note
    ui.toast(`“${titleOf(n)}” was changed on two devices at once: the other version is kept as “${titleOf(copy)}”`);
    return copy;
  }

  /** Apply notes coming from sync (last-writer-wins, or unconditionally with `force`). Returns true if anything changed. */
  /** another device's notes: no one's step to undo here */
  mergeRemote(remote: Note[], force = false): boolean { return history.quietly(() => this.mergeRemoteNow(remote, force)); }
  private mergeRemoteNow(remote: Note[], force: boolean): boolean {
    let changed = false;
    // the open note deleted on another device: the one next to it in the list comes up, as when it is deleted here.
    // It stayed open, deleted, and back/forward led into it
    let instead: Note | undefined, gone = false;
    const renamed: Note[] = [];
    for (const r of remote) {
      const local = this.all.find((n) => n.id === r.id);
      if (!force && local && local.updatedAt >= r.updatedAt) continue;
      if (r.deleted && r.id === this.currentId && !local?.deleted) { instead = this.neighbourOf(r.id); gone = true; }
      if (local) Object.assign(local, { icon: undefined, parent: undefined }, r); // a removed icon/parent must come through too
      else this.all.push(r);
      this.untouched.delete(r.id); // what another device says it is: not this session's to take away
      renamed.push(local ?? r);
      void storage.write(r.id, serialize(r));
      changed = true;
    }
    // A page renamed on another device took its [[links]] along there, but only in the notes that device had: one
    // written here meanwhile kept the old name, and its link led to a new empty page. Followed here too, once every
    // note of this pull is in (followed earlier, a link put right here was dated now, and the other device's own
    // newer edit to that note, later in the same pull, lost to it).
    for (const n of renamed) if (!n.deleted) this.followRename(n);
    if (gone) { this.currentId = instead?.id ?? null; if (!this.currentId) this.create(); }
    return changed;
  }
}

export const notes = new NotesStore();

// What the app's undo puts back of the notes: where each sits, whether it is there, its icon, and which is open. A note
// made since goes again; a note's text is the note's own undo, not this.
type Spot = [id: string, deleted: boolean, group: string, parent: string, order: number, icon: string, wide: boolean];
undoSource<{ open: string | null; spots: Spot[] }>({
  take: () => ({ open: notes.currentId, spots: notes.all.map((n) => [n.id, n.deleted, n.group ?? '', n.parent ?? '', n.order, n.icon ?? '', !!n.wide] as Spot) }),
  put: ({ open, spots }) => {
    const was = new Map(spots.map((s) => [s[0], s]));
    for (const n of notes.all) {
      const s = was.get(n.id);
      const [deleted, group, parent, order, icon, wide] = s ? [s[1], s[2], s[3] || undefined, s[4], s[5] || undefined, s[6] || undefined] : [true, n.group, n.parent, n.order, n.icon, n.wide];
      if (n.deleted === deleted && (n.group ?? '') === (group ?? '') && n.parent === parent && n.order === order && n.icon === icon && n.wide === wide) continue;
      Object.assign(n, { deleted, group, parent, order, icon, wide, updatedAt: Date.now() });
      notes.flush(n.id);
    }
    const back = open && notes.all.find((n) => n.id === open && !n.deleted);
    if (back) notes.currentId = back.id;
    else if (notes.current?.deleted) notes.currentId = notes.firstPage()?.id ?? null;
  },
});
