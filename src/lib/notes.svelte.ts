import { storage } from './platform';

export interface Note {
  id: string;
  body: string; // markdown
  updatedAt: number; // ms epoch
  deleted: boolean;
  group: string; // '' = root
  order: number; // manual sort rank within its group (ascending)
}

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- (de)serialization: markdown with a tiny frontmatter -------------------
export function serialize(n: Note): string {
  return `---\nid: ${n.id}\nupdated: ${n.updatedAt}\ndeleted: ${n.deleted}\norder: ${n.order}${n.group ? `\ngroup: ${n.group}` : ''}\n---\n${n.body}`;
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
    // legacy notes without order: newest first
    order: meta.order !== undefined && !Number.isNaN(Number(meta.order)) ? Number(meta.order) : -(Number(meta.updated) || 0),
  };
}

/** Strip markdown syntax from one line for display. */
export function plain(line: string): string {
  return line
    .replace(/^[#>\-*+\s]+|^\d+\.\s+|^\[[ x]\]\s*/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\[\[(.+?)\]\]/g, '$1')
    .trim();
}

export function titleOf(n: Pick<Note, 'body'>): string {
  const first = n.body.split('\n').find((l) => l.trim()) ?? '';
  return plain(first) || 'Untitled';
}

// ---- reactive store --------------------------------------------------------
class NotesStore {
  all = $state<Note[]>([]);
  private _cur = $state<string | null>(null);
  /** visited-note history for back/forward (⌘[ / ⌘]) */
  private history: string[] = [];
  private hIndex = -1;
  /** last cursor position per note, restored when navigating back */
  cursor = new Map<string, number>();

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
    const texts = await storage.list();
    this.all = texts.map(parse).filter((n): n is Note => !!n);
    this.currentId = this.visible[0]?.id ?? null;
    if (!this.currentId) this.create();
    this.loaded = true;
  }

  create(body = '', group = this.current?.group ?? ''): Note {
    const first = this.visible.find((x) => x.group === group);
    const n: Note = { id: newId(), body, updatedAt: Date.now(), deleted: false, group, order: first ? first.order - 1 : 0 };
    this.all.push(n);
    this.currentId = n.id;
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
    void storage.write(n.id, serialize(n));
    this.dirty++;
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
    n.group = group;
    n.order = order;
    n.updatedAt = Date.now();
    this.flush(id);
  }

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
  openByTitle(title: string) {
    const hit = this.visible.find((n) => titleOf(n).toLowerCase() === title.toLowerCase());
    this.currentId = hit ? hit.id : this.create(`# ${title}\n\n`).id;
  }

  /** Apply notes coming from the sync server (last-writer-wins). Returns true if anything changed. */
  mergeRemote(remote: Note[]): boolean {
    let changed = false;
    for (const r of remote) {
      const local = this.all.find((n) => n.id === r.id);
      if (local && local.updatedAt >= r.updatedAt) continue;
      if (local) Object.assign(local, r);
      else this.all.push(r);
      void storage.write(r.id, serialize(r));
      changed = true;
    }
    return changed;
  }
}

export const notes = new NotesStore();
