import { storage } from './platform';

export interface Note {
  id: string;
  body: string; // markdown
  updatedAt: number; // ms epoch
  deleted: boolean;
}

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- (de)serialization: markdown with a tiny frontmatter -------------------
export function serialize(n: Note): string {
  return `---\nid: ${n.id}\nupdated: ${n.updatedAt}\ndeleted: ${n.deleted}\n---\n${n.body}`;
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
  currentId = $state<string | null>(null);
  loaded = $state(false);
  /** bumps whenever a note changes locally; sync listens to it */
  dirty = $state(0);

  get visible() {
    return this.all.filter((n) => !n.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
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

  create(body = ''): Note {
    const n: Note = { id: newId(), body, updatedAt: Date.now(), deleted: false };
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
