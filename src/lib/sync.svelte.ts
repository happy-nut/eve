import { notes, parse, serialize, type Note } from './notes.svelte';
import { assets, github, openUrl, isTauri } from './platform';
import { Repo, syncRound, blobSha, deviceLogin, ensureRepo, type LocalFile, type RemoteFile } from './github';

/**
 * Sync through a private GitHub repository (see github.ts). Layout mirrors the local notes dir:
 * notes/<id>.md (frontmatter included) and notes/assets/*. Conflicts resolve last-writer-wins on
 * updatedAt (notes.mergeRemote); a note untouched locally since the last sync takes the remote
 * version unconditionally, so edits made on github.com come through too.
 */
const LS = 'eve.sync';
const ASSETS = 'notes/assets/';

interface Settings { user: string; repo: string; token: string; head: string; tree: string; known: Record<string, string>; lastSynced: number }

function load(): Settings {
  const d: Settings = { user: '', repo: '', token: '', head: '', tree: '', known: {}, lastSynced: 0 };
  try {
    const s = { ...d, ...JSON.parse(localStorage.getItem(LS) ?? '{}') };
    return { user: s.user, repo: s.repo, token: s.token, head: s.head, tree: s.tree, known: s.known, lastSynced: s.lastSynced };
  } catch { return d; }
}

class Sync {
  settings = $state<Settings>(load());
  status = $state<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  error = $state('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  save(patch: Partial<Settings>) {
    // a different repository = start over
    if (patch.repo !== undefined && patch.repo !== this.settings.repo) Object.assign(patch, { head: '', tree: '', known: {}, lastSynced: 0 });
    Object.assign(this.settings, patch);
    localStorage.setItem(LS, JSON.stringify(this.settings));
  }

  get enabled() { return /^[\w.-]+\/[\w.-]+$/.test(this.settings.repo) && !!this.settings.token; }

  /** device-flow code the user has to enter on GitHub, while a sign-in is in progress */
  pending = $state<{ code: string; url: string } | null>(null);
  private abort: AbortController | undefined;

  /** Sign in with GitHub (device flow), then create/find the private notes repo and sync. */
  async login() {
    if (!isTauri || this.abort) return; // one sign-in at a time
    this.abort = new AbortController();
    this.error = '';
    try {
      const token = await deviceLogin(github.post, (code, url) => { this.pending = { code, url }; void openUrl(url); }, this.abort.signal);
      const { user, repo } = await ensureRepo(token);
      this.save({ token, user, repo });
      this.pending = null;
      await this.now();
    } catch (e) {
      this.pending = null;
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.abort = undefined;
    }
  }
  cancelLogin() { this.abort?.abort(); }
  /** re-open the device page (the browser tab may have been closed) */
  openLogin() { if (this.pending) void openUrl(this.pending.url); }
  /** Forget the token (it stays valid on GitHub until revoked at github.com/settings/applications). */
  logout() {
    this.save({ token: '', user: '', repo: '' });
    this.status = 'idle';
    this.error = '';
  }

  /** debounce after local edits */
  schedule(ms = 2000) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.now(), ms);
  }

  async now(): Promise<boolean> {
    if (!this.enabled || this.status === 'syncing') return false;
    this.status = 'syncing';
    const enc = new TextEncoder(), dec = new TextDecoder();
    const repo = new Repo(this.settings);
    try {
      await syncRound(repo, async () => {
        const out: LocalFile[] = notes.all.filter((n) => !n.path).map((n) => ({ path: `notes/${n.id}.md`, data: enc.encode(serialize(n)) }));
        // images never change once written, so only unknown names need reading
        for (const name of await assets.list()) if (!(ASSETS + name in repo.s.known)) out.push({ path: ASSETS + name, data: await assets.read(name) });
        return out;
      }, async (files: RemoteFile[]) => {
        const lww: Note[] = [], force: Note[] = [];
        for (const f of files) {
          if (f.path.startsWith(ASSETS)) { await assets.write(f.path.slice(ASSETS.length), f.data); continue; }
          if (!f.path.endsWith('.md')) continue;
          const r = parse(dec.decode(f.data));
          if (!r) continue;
          const local = notes.all.find((n) => n.id === r.id);
          const untouched = local && f.prev && (await blobSha(enc.encode(serialize(local)))) === f.prev;
          (untouched ? force : lww).push(r);
        }
        notes.mergeRemote(lww);
        notes.mergeRemote(force, true);
      });
      this.save({ lastSynced: Date.now() });
      this.status = 'ok';
      this.error = '';
      return true;
    } catch (e) {
      this.save({}); // keep whatever head/known advanced before the failure
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
