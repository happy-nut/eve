import { notes, type Note } from './notes.svelte';

/**
 * Self-hosted sync (see server/). Protocol: one POST /sync per round.
 *   -> { cursor, notes: [changed local notes] }
 *   <- { cursor, notes: [notes changed on server since cursor] }
 * Conflicts resolve last-writer-wins on updatedAt, on both ends.
 */
const LS = 'eve.sync';

interface Settings { url: string; token: string; cursor: number; lastSynced: number }

function load(): Settings {
  try { return { url: '', token: '', cursor: 0, lastSynced: 0, ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; }
  catch { return { url: '', token: '', cursor: 0, lastSynced: 0 }; }
}

class Sync {
  settings = $state<Settings>(load());
  status = $state<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  error = $state('');
  private pushedAt = new Map<string, number>(); // id -> updatedAt last pushed
  private timer: ReturnType<typeof setTimeout> | undefined;

  save(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    localStorage.setItem(LS, JSON.stringify(this.settings));
  }

  get enabled() { return !!this.settings.url; }

  /** debounce after local edits */
  schedule(ms = 2000) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.now(), ms);
  }

  async now(): Promise<boolean> {
    if (!this.enabled || this.status === 'syncing') return false;
    this.status = 'syncing';
    try {
      const changed = notes.all.filter((n) => (this.pushedAt.get(n.id) ?? -1) < n.updatedAt);
      const res = await fetch(this.settings.url.replace(/\/$/, '') + '/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.settings.token}` },
        body: JSON.stringify({ cursor: this.settings.cursor, notes: changed }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const data = (await res.json()) as { cursor: number; notes: Note[] };
      for (const n of changed) this.pushedAt.set(n.id, n.updatedAt);
      notes.mergeRemote(data.notes);
      for (const n of data.notes) this.pushedAt.set(n.id, Math.max(this.pushedAt.get(n.id) ?? 0, n.updatedAt));
      this.save({ cursor: data.cursor, lastSynced: Date.now() });
      this.status = 'ok';
      this.error = '';
      return true;
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  start() {
    $effect(() => { notes.dirty; this.schedule(); });
    const iv = setInterval(() => this.now(), 60_000);
    window.addEventListener('focus', () => this.now());
    return () => clearInterval(iv);
  }
}

export const sync = new Sync();
