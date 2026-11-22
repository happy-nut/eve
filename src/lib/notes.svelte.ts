import { untrack } from 'svelte';
import { storage, memMark } from './platform';
import { flushPendingEdits } from './pending';
import { appearance } from './appearance.svelte';
import { randomIcon } from './icons';
import { ui } from './ui.svelte';
import { history, undoSource } from './history.svelte';
import { legacyPlain, onlyHtml, plain, splitAlias, splitLink } from './markdown';
import { CALENDAR_NAME, CALENDAR_NOTE_ID, DAILY_TEMPLATE_ID, DEFAULT_TEMPLATE, dailyBody, dailyId, dayKey, isCalendarOwn, isDailyId, isWritten } from './daily';

export { plain };

export interface Note {
  id: string;
  body: string;
  updatedAt: number;
  deleted: boolean;
  group?: string;
  order: number;
  parent?: string;
  icon?: string;
  wide?: boolean;
  small?: boolean;
  cover?: string;
  props?: Record<string, PropValue>;
}
export type PropValue = string | string[];

export const OWN_KEYS = new Set(['id', 'updated', 'deleted', 'order', 'group', 'parent', 'icon', 'wide', 'small', 'cover']);
const stripFence = (name: string) => name.replace(/^-{3,}\s*/, '');
export const propName = (name: string) => stripFence(name.replace(/[:\n\r]/g, ' ').trim());
const propLine = (v: PropValue) => (Array.isArray(v) || /^[["]/.test(v) || v !== v.trim() ? JSON.stringify(v) : v.replace(/[\n\r]+/g, ' '));
export function readProp(v: string): PropValue {
  if (/^[["]/.test(v)) {
    try {
      const x = JSON.parse(v);
      if (typeof x === 'string') return x;
      if (Array.isArray(x)) return x.map(String);
    } catch {}
  }
  return v;
}

const autoIcon = () => (appearance.s.autoIcon ? randomIcon() : undefined);

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function serialize(n: Note): string {
  return `---\nid: ${n.id}\nupdated: ${n.updatedAt}\ndeleted: ${n.deleted}\norder: ${n.order}${n.group ? `\ngroup: ${n.group}` : ''}${n.parent ? `\nparent: ${n.parent}` : ''}${n.icon ? `\nicon: ${n.icon}` : ''}${n.wide ? '\nwide: true' : ''}${n.small ? '\nsmall: true' : ''}${n.cover ? `\ncover: ${n.cover}` : ''}${Object.entries(n.props ?? {}).map(([k, v]) => `\n${k}: ${propLine(v)}`).join('')}\n---\n${n.body}`;
}

const OLDER_THAN_ANY_SYNC = 0;

const normalizeEol = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const legacyOrder = (meta: Record<string, string>) => -(Number(meta.updated) || 0);

export function parse(text: string): Note | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalizeEol(text));
  if (!m) return null;
  const meta: Record<string, string> = {};
  const props: Record<string, PropValue> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    meta[k] = v;
    if (!OWN_KEYS.has(k) && k) props[k] = readProp(v);
  }
  if (!meta.id) return null;
  return {
    id: meta.id,
    body: m[2],
    updatedAt: Number(meta.updated) || 0,
    deleted: meta.deleted === 'true',
    ...(meta.group ? { group: meta.group } : {}),
    parent: meta.parent || undefined,
    icon: meta.icon || undefined,
    wide: meta.wide === 'true' || undefined,
    small: meta.small === 'true' || undefined,
    cover: meta.cover || undefined,
    ...(Object.keys(props).length ? { props } : {}),
    order: meta.order !== undefined && !Number.isNaN(Number(meta.order)) ? Number(meta.order) : legacyOrder(meta),
  };
}

const titleLine = (body: string) => body.split('\n').find((l) => l.trim() && !onlyHtml(l)) ?? '';
const plainTitleLine = (body: string) => plain(titleLine(body));

export function titleOf(n: Pick<Note, 'body'>): string {
  return plain(titleLine(n.body)) || 'Untitled';
}
export const legacyTitleOf = (n: Pick<Note, 'body'>): string => legacyPlain(titleLine(n.body)) || 'Untitled';

export function rankByTitle<T extends Pick<Note, 'body'>>(list: T[], q: string): T[] {
  const tier = (n: T) => {
    const t = titleOf(n).toLowerCase();
    return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
  };
  return list.map((n) => ({ n, t: tier(n) })).sort((a, b) => a.t - b.t).map((x) => x.n);
}

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

export const CALENDAR = 'calendar';

export function stepFrom<T extends { id: string }>(list: T[], current: string | null, delta: number): T | undefined {
  const i = list.findIndex((n) => n.id === (current === CALENDAR ? CALENDAR_NOTE_ID : current));
  if (i < 0) return list[delta > 0 ? 0 : list.length - 1];
  return list[(i + delta + list.length) % list.length];
}

const LAST = 'eve.lastNote';
function remember(id: string | null) { try { if (id) localStorage.setItem(LAST, id); } catch {} }
function lastSeen(): string | null { try { return localStorage.getItem(LAST); } catch { return null; } }

const noteMark = (size: number) => (size >= 50_000 ? `note ${Math.round(size / 1000)}KB` : 'note');

const isDayRow = (n: Note) => isDailyId(n.id) || (!!n.parent && isDailyId(n.parent));
const inList = (n: Note) => !n.deleted && !isDayRow(n) && n.id !== DAILY_TEMPLATE_ID && (n.id !== CALENDAR_NOTE_ID || appearance.s.dailyNotes);

const sameBody = (a: string, b: string) => a === b || a.replace(/\n+$/, '') === b.replace(/\n+$/, '');

const linkPattern = (title: string) => new RegExp(`\\[\\[${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(#[^\\]|\\\\]*)?(?=\\]\\]|\\||\\\\\\|)`, 'gi');

const fixLinksInProps = (props: Note['props'], fix: (t: string) => string) =>
  props && Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => fix(x)) : fix(v)]));

class NotesStore {
  all = $state<Note[]>([]);
  private _cur = $state<string | null>(null);
  private history = $state<string[]>([]);
  private hIndex = $state(-1);
  get canBack() { return this.landing(-1) >= 0; }
  get canForward() { return this.landing(1) >= 0; }
  cursor = new Map<string, number>();
  selectTitle = false;
  caretEnd = $state(false);
  section = '';

  get currentId() { return this._cur; }
  set currentId(id: string | null) {
    if (id === CALENDAR_NOTE_ID) id = CALENDAR;
    if (id === this._cur) return;
    const left = this._cur;
    flushPendingEdits();
    if (id) {
      this.history = this.history.slice(0, this.hIndex + 1).filter((h) => h !== id);
      this.history.push(id);
      this.hIndex = this.history.length - 1;
    }
    this._cur = id;
    remember(id);
    memMark(noteMark(id ? this.all.find((n) => n.id === id)?.body.length ?? 0 : 0));
    this.leave(left);
  }
  back() { this.step(-1); }
  forward() { this.step(1); }
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

  private blankSinceMade = new Set<string>();
  private leave(id: string | null) {
    flushPendingEdits();
    if (!id || !this.blankSinceMade.has(id)) return;
    this.blankSinceMade.delete(id);
    const n = this.all.find((x) => x.id === id);
    if (!n || n.deleted) return;
    n.deleted = true;
    n.updatedAt = Date.now();
    this.flush(id);
  }
  letGo() {
    const id = this._cur;
    if (!id || !this.blankSinceMade.has(id)) return;
    this.currentId = this.neighbourOf(id)?.id ?? null;
  }

  touched(id: string) { this.blankSinceMade.delete(id); }
  loaded = $state(false);
  resumed = false;
  dirty = $state(0);

  get pages(): readonly Note[] { return this.#pages; }
  get visible(): readonly Note[] { return this.#visible; }
  #visible = $derived(this.all.filter(inList).sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt));
  #pages = $derived(this.#visible.filter((n) => n.id !== CALENDAR_NOTE_ID));
  listOrder: { shown: () => readonly Note[]; all: () => readonly Note[] } = { shown: () => this.visible, all: () => this.visible };
  firstPage(): Note | undefined {
    const page = (n: Note) => n.id !== CALENDAR_NOTE_ID;
    return this.listOrder.shown().find(page) ?? this.listOrder.all().find(page);
  }
  private neighbourOf(id: string): Note | undefined {
    const page = (n: Note) => n.id !== id && n.id !== CALENDAR_NOTE_ID;
    for (const list of [this.listOrder.shown(), this.listOrder.all()]) {
      const i = list.findIndex((n) => n.id === id);
      const nb = i < 0 ? undefined : list.slice(i + 1).find(page) ?? list.slice(0, i).findLast(page);
      if (nb) return nb;
    }
    return this.listOrder.shown().find(page) ?? this.listOrder.all().find(page);
  }

  get daily(): readonly Note[] { return this.#daily; }
  #daily = $derived(this.all.filter((n) => !n.deleted && isDailyId(n.id)).sort((a, b) => (a.id < b.id ? 1 : -1)));

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
  ensureCalendar(): Note {
    let n = this.all.find((x) => x.id === CALENDAR_NOTE_ID);
    if (n && n.deleted) {
      Object.assign(n, { deleted: false, updatedAt: Date.now() });
      void storage.write(n.id, serialize(n));
      this.dirty++;
    }
    if (n) return n;
    const top = this.visible.filter((x) => !x.parent).reduce((m, x) => Math.min(m, x.order), 1);
    n = { id: CALENDAR_NOTE_ID, body: `# ${CALENDAR_NAME}\n`, updatedAt: OLDER_THAN_ANY_SYNC, deleted: false, order: top - 1, icon: '🗓️' };
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return this.all.at(-1)!;
  }

  get dailyTemplate(): string {
    const t = this.all.find((n) => n.id === DAILY_TEMPLATE_ID && !n.deleted);
    return t ? t.body : DEFAULT_TEMPLATE;
  }
  templateNote(): Note {
    let n = this.all.find((x) => x.id === DAILY_TEMPLATE_ID);
    if (!n) {
      this.all.push({ id: DAILY_TEMPLATE_ID, body: DEFAULT_TEMPLATE, updatedAt: OLDER_THAN_ANY_SYNC, deleted: false, order: 0, icon: '🗓️' });
      n = this.all.at(-1)!;
      void storage.write(n.id, serialize(n));
      this.dirty++;
    } else if (n.deleted) Object.assign(n, { deleted: false, body: DEFAULT_TEMPLATE, updatedAt: Date.now() });
    this.titles.set(n.id, titleOf(n));
    return n;
  }

  readonly madeInStep = new Set<string>();

  dayNote(key = dayKey(new Date())): Note {
    const id = dailyId(key);
    let n = this.all.find((x) => x.id === id);
    if (n && !n.deleted) return n;
    const body = dailyBody(this.dailyTemplate, key);
    if (n) {
      this.keepWrittenDayInTrash(n, body);
      Object.assign(n, { deleted: false, body, updatedAt: Date.now() });
    }
    else { this.all.push({ id, body, updatedAt: OLDER_THAN_ANY_SYNC, deleted: false, order: 0, icon: '🗓️' }); n = this.all.at(-1)!; }
    this.titles.set(id, titleOf(n));
    void storage.write(id, serialize(n));
    this.dirty++;
    return n;
  }
  private keepWrittenDayInTrash(day: Note, freshBody: string) {
    if (!day.body.trim() || day.body === freshBody) return;
    const kept: Note = { ...day, id: newId() };
    this.all.push(kept);
    this.titles.set(kept.id, titleOf(kept));
    void storage.write(kept.id, serialize(kept));
  }
  dayDraft(key: string): { body: string; write(md: string): void; readonly note: Note | null } {
    const id = dailyId(key);
    let note = this.all.find((x) => x.id === id && !x.deleted) ?? null;
    const body = note?.body ?? dailyBody(this.dailyTemplate, key);
    return {
      body,
      write: (md) => {
        if (!note && !isWritten(md, this.dailyTemplate, key)) return;
        note ??= this.dayNote(key);
        this.update(note.id, md);
      },
      get note() { return note; },
    };
  }
  openDaily(key = dayKey(new Date())): Note {
    const n = this.dayNote(key);
    this.currentId = n.id;
    return n;
  }

  get current() {
    return this.all.find((n) => n.id === this.currentId) ?? null;
  }
  exists(id: string) {
    return this.all.some((n) => n.id === id && !n.deleted);
  }

  async load() {
    await storage.path();
    const texts = await storage.list();
    this.all = texts.map(parse).filter((n): n is Note => !!n);
    for (const n of this.all) this.titles.set(n.id, titleOf(n));
    const last = lastSeen();
    this.resumed = !!last && (last === CALENDAR ? appearance.s.dailyNotes : this.exists(last));
    this.currentId = this.resumed ? last : this.firstPage()?.id ?? null;
    if (!this.currentId) history.quietly(() => this.create());
    this.loaded = true;
  }

  create(body = '', parent?: string): Note {
    const step = history.record();
    const first = this.visible.find((x) => (x.parent ?? '') === (parent ?? ''));
    const n: Note = { id: newId(), body, updatedAt: Date.now(), deleted: false, parent, order: first ? first.order - 1 : 0, icon: autoIcon() };
    if (step) this.madeInStep.add(n.id);
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    this.blankSinceMade.add(n.id);
    this.currentId = n.id;
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return n;
  }

  addImported(body: string, updatedAt = Date.now(), parent?: string, props?: Note['props']): Note {
    const step = history.record();
    const last = this.visible.filter((x) => (x.parent ?? '') === (parent ?? '')).at(-1);
    const n: Note = { id: newId(), body, updatedAt, deleted: false, ...(parent ? { parent } : {}), ...(props && Object.keys(props).length ? { props } : {}), order: last ? last.order + 1 : 0, icon: autoIcon() };
    if (step) this.madeInStep.add(n.id);
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
    return this.all.at(-1)!;
  }

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  update(id: string, body: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n || sameBody(n.body, body)) return;
    this.touched(id);
    n.body = body;
    n.updatedAt = Date.now();
    ui.typed();
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.flush(id), 300));
  }

  addWithId(n: Note) {
    this.all.push(n);
    this.titles.set(n.id, titleOf(n));
    void storage.write(n.id, serialize(n));
    this.dirty++;
  }

  flushAll() { flushPendingEdits(); for (const id of [...this.timers.keys()]) this.flush(id); }

  flush(id: string) {
    flushPendingEdits();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.followRename(n);
    void storage.write(n.id, serialize(n));
    this.dirty++;
  }

  private titles = new Map<string, string>();
  private isTitleOfAnother(n: Note, title: string) {
    return this.all.some((o) => !o.deleted && o.id !== n.id && titleOf(o).toLowerCase() === title.toLowerCase());
  }
  private isSettledTitle(n: Note, title: string) {
    return /\S/.test(plainTitleLine(n.body)) && !this.isTitleOfAnother(n, title);
  }
  private followRename(n: Note) {
    const now = titleOf(n);
    const was = this.titles.get(n.id);
    if (was === undefined || was === now) { this.titles.set(n.id, now); return; }
    if (!this.isSettledTitle(n, now)) return;
    this.titles.set(n.id, now);
    const link = linkPattern(was);
    const isTitle = (t: string) => t.toLowerCase() === was.toLowerCase() || this.isTitleOfAnother(n, t);
    const ours = (section: string | undefined) => !section || splitLink(was + section, isTitle)[0].toLowerCase() === was.toLowerCase();
    const fix = (t: string) => t.replace(link, (m: string, section?: string) => (ours(section) ? `[[${now}${section ?? ''}` : m));
    for (const other of this.all) {
      if (other.deleted || other.id === n.id) continue;
      const body = fix(other.body);
      const props = fixLinksInProps(other.props, fix);
      const propsMoved = !!props && JSON.stringify(props) !== JSON.stringify(other.props);
      if (body === other.body && !propsMoved) continue;
      other.body = body;
      if (propsMoved) other.props = props as Note['props'];
      other.updatedAt = Date.now();
      this.flush(other.id);
    }
  }

  setParent(id: string, parent: string | null) {
    history.record();
    if (id === CALENDAR_NOTE_ID || parent === CALENDAR_NOTE_ID) return;
    const n = this.all.find((x) => x.id === id);
    if (!n || (parent && (parent === id || this.isAncestor(id, parent)))) return;
    this.touched(id);
    n.parent = parent ?? undefined;
    n.updatedAt = Date.now();
    this.flush(id);
  }

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

  setWide(id: string, wide: boolean) { this.setLook(id, { wide: wide || undefined }); }

  setLook(id: string, look: Partial<Pick<Note, 'wide' | 'small' | 'cover'>>) {
    history.record();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    this.touched(id);
    Object.assign(n, look);
    n.updatedAt = Date.now();
    this.flush(id);
  }

  shownParent(n: Note): string {
    return n.parent && this.visible.some((p) => p.id === n.parent) ? n.parent : '';
  }
  place(id: string, parent: string, before: string | null) {
    history.record();
    if (id === CALENDAR_NOTE_ID && parent) return;
    if (parent === CALENDAR_NOTE_ID) return;
    const n = this.all.find((x) => x.id === id);
    if (!n || id === before) return;
    if (parent && (parent === id || this.isAncestor(id, parent))) return;
    this.touched(id);
    const sibs = this.visible.filter((x) => this.shownParent(x) === parent && x.id !== id);
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
    if ((n.parent ?? '') === parent && n.order === order) return;
    n.parent = parent || undefined;
    n.order = order;
    n.updatedAt = Date.now();
    this.flush(id);
  }

  private between(list: Note[], i: number): number {
    if (list[i - 1].order >= list[i].order) {
      list.forEach((x, j) => { if (x.order !== j) { x.order = j; x.updatedAt = Date.now(); this.flush(x.id); } });
    }
    return (list[i - 1].order + list[i].order) / 2;
  }

  remove(id: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    const step = history.record();
    this.blankSinceMade.delete(id);
    const neighbour = this.currentId === id ? this.neighbourOf(id) : undefined;
    n.deleted = true;
    n.updatedAt = Date.now();
    this.flush(id);
    if (this.currentId === id) this.currentId = neighbour?.id ?? null;
    if (!this.currentId) this.create();
    ui.toast(`Deleted “${titleOf(n)}”`, { label: 'Undo', byKey: true, run: () => { if (!history.undo(step)) this.restore(id); } });
  }
  restore(id: string) {
    history.record();
    const n = this.all.find((x) => x.id === id);
    if (!n) return;
    n.deleted = false;
    n.updatedAt = Date.now();
    this.flush(id);
    this.currentId = id;
  }

  get trash(): readonly Note[] {
    return this.all.filter((n) => n.deleted && n.body !== '' && !isCalendarOwn(n.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  erase(ids: readonly string[]) {
    for (const id of ids) {
      const n = this.all.find((x) => x.id === id);
      if (!n?.deleted) continue;
      n.body = '';
      n.updatedAt = Date.now();
      this.flush(id);
    }
  }
  restoreVersion(id: string, body: string, when: string) {
    const n = this.all.find((x) => x.id === id);
    if (!n || n.deleted || n.body === body) return;
    const was = n.body;
    const put = (text: string) => { n.body = text; n.updatedAt = Date.now(); this.flush(id); };
    put(body);
    ui.toast(`Restored the version from ${when}`, { label: 'Undo', run: () => put(was) });
  }

  setProp(id: string, name: string, value: PropValue | null) {
    const n = this.all.find((x) => x.id === id);
    const key = propName(name);
    if (!n || !key || OWN_KEYS.has(key)) return;
    const empty = value === null || value === '' || (Array.isArray(value) && !value.length);
    const props = { ...(n.props ?? {}) };
    if (empty) delete props[key]; else props[key] = value;
    if (JSON.stringify(props) === JSON.stringify(n.props ?? {})) return;
    n.props = Object.keys(props).length ? props : undefined;
    n.updatedAt = Date.now();
    this.flush(id);
  }
  renameProp(ids: readonly string[], from: string, to: string) {
    const key = propName(to);
    if (!key || OWN_KEYS.has(key) || key === from) return;
    for (const id of ids) {
      const n = this.all.find((x) => x.id === id);
      if (!n?.props || !(from in n.props)) continue;
      n.props = Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k === from ? key : k, v]));
      n.updatedAt = Date.now();
      this.flush(id);
    }
  }
  setGone(id: string, gone: boolean) {
    const n = this.all.find((x) => x.id === id);
    if (!n || n.deleted === gone) return;
    n.deleted = gone;
    n.updatedAt = Date.now();
    this.flush(id);
    if (gone && this.currentId === id) this.currentId = n.parent ?? this.firstPage()?.id ?? null;
  }
  addRow(parent: string, title: string, props: Record<string, PropValue> = {}): Note {
    const clean = Object.fromEntries(Object.entries(props).filter(([k, v]) => propName(k) && !OWN_KEYS.has(propName(k)) && v !== '' && !(Array.isArray(v) && !v.length)));
    return this.addImported(`# ${title}\n\n`, Date.now(), parent, clean);
  }

  private titleKey = $derived(this.visible.map((n) => this.titlesOf(n)).join('\n'));
  private titleCache = new Map<string, { body: string; key: string }>();
  private titlesOf(n: Note): string {
    const had = this.titleCache.get(n.id);
    if (had?.body === n.body) return had.key;
    const key = titleOf(n) + '\u0000' + legacyTitleOf(n);
    this.titleCache.set(n.id, { body: n.body, key });
    return key;
  }
  onTitles(run: () => void): () => void {
    run();
    let seen = this.titleKey;
    return $effect.root(() => {
      $effect(() => {
        const key = this.titleKey;
        if (key === seen) return;
        seen = key;
        untrack(run);
      });
    });
  }

  byTitle(t: string): Note | undefined {
    const want = t.toLowerCase();
    return this.#byTitle.now.get(want) ?? this.#byTitle.was.get(want);
  }
  #byTitle = $derived.by(() => {
    const now = new Map<string, Note>(), was = new Map<string, Note>();
    for (const n of this.visible) {
      const [t, legacy] = this.titlesOf(n).toLowerCase().split('\u0000');
      if (!now.has(t)) now.set(t, n);
      if (!was.has(legacy)) was.set(legacy, n);
    }
    return { now, was };
  });
  linksTo(id: string): { note: Note; line: string }[] {
    const out: { note: Note; line: string }[] = [];
    const find = (t: string) => this.byTitle(t);
    for (const n of this.all) {
      if (n.deleted || n.id === id || isCalendarOwn(n.id) || !n.body.includes('[[')) continue;
      const hit = this.linksOf(n).find((l) => find(splitLink(l.link, (t) => !!find(t))[0])?.id === id);
      if (hit) out.push({ note: n, line: hit.line });
    }
    return out;
  }
  private linkCache = new Map<string, { body: string; links: { link: string; line: string }[] }>();
  private linksOf(n: Note) {
    const had = this.linkCache.get(n.id);
    if (had?.body === n.body) return had.links;
    const links: { link: string; line: string }[] = [];
    let fenced = false;
    for (const raw of n.body.split('\n')) {
      if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
      if (fenced || !raw.includes('[[')) continue;
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

  keepConflictCopy(n: Note) {
    const [first, ...rest] = n.body.split('\n');
    const body = [`${first.trim() ? first : '# ' + titleOf(n)} (conflict copy)`, ...rest].join('\n');
    const copy = history.quietly(() => this.addImported(body, Date.now(), n.parent));
    if (n.icon) copy.icon = n.icon;
    if (n.deleted) copy.deleted = true;
    if (n.icon || n.deleted) void storage.write(copy.id, serialize(copy));
    if (n.deleted) return copy;
    ui.toast(`“${titleOf(n)}” was changed on two devices at once: the other version is kept as “${titleOf(copy)}”`);
    return copy;
  }

  mergeRemote(remote: Note[], force = false): boolean { return history.quietly(() => this.mergeRemoteNow(remote, force)); }
  private mergeRemoteNow(remote: Note[], force: boolean): boolean {
    let changed = false;
    let instead: Note | undefined, gone = false;
    const renamed: Note[] = [];
    for (const r of remote) {
      const local = this.all.find((n) => n.id === r.id);
      if (!force && local && local.updatedAt >= r.updatedAt) continue;
      if (r.deleted && r.id === this.currentId && !local?.deleted) { instead = this.neighbourOf(r.id); gone = true; }
      if (local) Object.assign(local, { icon: undefined, parent: undefined, wide: undefined, small: undefined, cover: undefined }, r);
      else this.all.push(r);
      this.blankSinceMade.delete(r.id);
      renamed.push(local ?? r);
      void storage.write(r.id, serialize(r));
      changed = true;
    }
    for (const n of renamed) if (!n.deleted) this.followRename(n);
    if (gone) { this.currentId = instead?.id ?? null; if (!this.currentId) this.create(); }
    return changed;
  }
}

export const notes = new NotesStore();

type Spot = [id: string, deleted: boolean, parent: string, order: number, icon: string, wide: boolean, small: boolean, cover: string];
undoSource<{ open: string | null; spots: Spot[] }>({
  take: () => ({ open: notes.currentId, spots: notes.all.map((n) => [n.id, n.deleted, n.parent ?? '', n.order, n.icon ?? '', !!n.wide, !!n.small, n.cover ?? ''] as Spot) }),
  put: ({ open, spots }) => {
    const was = new Map(spots.map((s) => [s[0], s]));
    for (const n of notes.all) {
      const s = was.get(n.id);
      if (n.deleted && n.body === '') continue;
      if (!s && !notes.madeInStep.has(n.id)) continue;
      const [deleted, parent, order, icon, wide, small, cover] = s ? [s[1], s[2] || undefined, s[3], s[4] || undefined, s[5] || undefined, s[6] || undefined, s[7] || undefined] : [true, n.parent, n.order, n.icon, n.wide, n.small, n.cover];
      if (n.deleted === deleted && n.parent === parent && n.order === order && n.icon === icon && n.wide === wide && n.small === small && n.cover === cover) continue;
      Object.assign(n, { deleted, parent, order, icon, wide, small, cover, updatedAt: Date.now() });
      notes.flush(n.id);
    }
    const back = open && notes.all.find((n) => n.id === open && !n.deleted);
    if (back) notes.currentId = back.id;
    else if (notes.current?.deleted) notes.currentId = notes.firstPage()?.id ?? null;
  },
});
