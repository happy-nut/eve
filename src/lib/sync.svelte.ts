import { notes, parse, serialize, type Note } from './notes.svelte';
import { groups } from './groups.svelte';
import { assets, github, openUrl, isTauri, isMobile, widget, share, copyText } from './platform';
import { Repo, FileHashes, syncRound, deviceLogin, ensureRepo, normHost, signInError, type LocalFile, type RemoteFile } from './github';
import { seal, open, ticketLink, type Ticket } from './handoff';

/**
 * Sync through a private GitHub repository (see github.ts). Layout mirrors the local notes dir:
 * notes/<id>.md (frontmatter included) and notes/assets/*. Conflicts resolve last-writer-wins on
 * updatedAt (notes.mergeRemote); a note untouched locally since the last sync takes the remote
 * version unconditionally, so edits made on github.com come through too. The GitHub is github.com or,
 * `host` set, a GitHub Enterprise one (NAME.ghe.com, or a server of the company's own).
 */
const LS = 'eve.sync';
const ASSETS = 'notes/assets/';
const GROUPS = 'notes/groups.json';

/** `host`: '' = github.com, else the GitHub Enterprise server (see github.ts normHost) */
interface Settings { user: string; repo: string; token: string; host: string; head: string; tree: string; known: Record<string, string>; lastSynced: number }

/** Where to sign in, for GitHub Enterprise or an organization: all optional. `token` skips the browser. */
export interface SignIn { host?: string; owner?: string; clientId?: string; token?: string }

function load(): Settings {
  const d: Settings = { user: '', repo: '', token: '', host: '', head: '', tree: '', known: {}, lastSynced: 0 };
  try {
    const s = { ...d, ...JSON.parse(localStorage.getItem(LS) ?? '{}') };
    return { user: s.user, repo: s.repo, token: s.token, host: s.host ?? '', head: s.head, tree: s.tree, known: s.known, lastSynced: s.lastSynced };
  } catch { return d; }
}

class Sync {
  settings = $state<Settings>(load());
  status = $state<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  error = $state('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hashes = new FileHashes();

  save(patch: Partial<Settings>) {
    // a different repository (or the same name on another server) = start over
    const moved = (patch.repo !== undefined && patch.repo !== this.settings.repo) || (patch.host !== undefined && patch.host !== this.settings.host);
    if (moved) Object.assign(patch, { head: '', tree: '', known: {}, lastSynced: 0 });
    Object.assign(this.settings, patch);
    localStorage.setItem(LS, JSON.stringify(this.settings));
    widget.account(this.settings.repo, this.settings.token, this.settings.host);
  }

  get enabled() { return /^[\w.-]+\/[\w.-]+$/.test(this.settings.repo) && !!this.settings.token; }

  /** device-flow code the user has to enter on GitHub, while a sign-in is in progress; `renewed`: the one
   *  before it ran out (an account still being made), and this one is not on the clipboard yet */
  pending = $state<{ code: string; url: string; renewed?: boolean } | null>(null);
  private abort: AbortController | undefined;

  /**
   * Sign in with GitHub, then create/find the private notes repo and sync. By default the browser's
   * device flow on github.com; `a` points it at a GitHub Enterprise server (whose own OAuth App,
   * `clientId`, the device flow then needs) or an organization, or hands a token so no browser is needed.
   */
  async login(a: SignIn = {}) {
    if (!isTauri || this.abort) return; // one sign-in at a time
    this.abort = new AbortController();
    this.error = '';
    try {
      const host = normHost(a.host ?? '');
      const clientId = a.clientId?.trim();
      let token = a.token?.trim();
      if (!token && host && !clientId) throw new Error('For this server, paste a token, or the Client ID of an OAuth App its admin set up for Eve.');
      // the code goes on the clipboard first; a phone waits for the button, so the code is seen before
      // the browser covers it
      // a renewed code is only shown: the clipboard may hold what they are pasting on GitHub's sign-up
      // pages meanwhile, and a new browser tab every 15 minutes would be in the way
      token ||= await deviceLogin(github.post, (code, url, renewed) => {
        this.pending = { code, url, renewed };
        if (renewed) return;
        void copyText(code);
        if (!isMobile) void openUrl(url);
      }, this.abort.signal, undefined, { host, clientId });
      const { user, repo } = await ensureRepo(token, undefined, { host, owner: a.owner });
      this.save({ token, user, repo, host });
      this.pending = null;
      await this.now();
    } catch (e) {
      this.pending = null;
      const said = signInError(e instanceof Error ? e.message : String(e));
      this.status = said === null ? 'idle' : 'error';
      this.error = said ?? '';
    } finally {
      this.abort = undefined;
    }
  }
  cancelLogin() { this.abort?.abort(); }
  /** copy the code and open the device page (again: the browser tab may have been closed) */
  openLogin() { if (this.pending) { void copyText(this.pending.code); void openUrl(this.pending.url); this.pending.renewed = false; } }
  /**
   * Mac: set up a phone. This Mac's sign-in, sealed with a one-time key, is served once on the local
   * network; the QR carries the address and the key (handoff.ts). No GitHub step: the phone simply
   * gets what this Mac already has. Closed after the phone takes it, or ten minutes.
   */
  phone = $state<{ link: string; until: number; done: boolean } | null>(null);
  private phoneTimer: ReturnType<typeof setTimeout> | undefined;
  private phoneOff: (() => void) | undefined;
  /** `version`: the newest phone release, which the QR's page then downloads directly */
  async phoneSetup(version?: string) {
    this.error = '';
    try {
      const { user, repo, token, host } = this.settings;
      const s = await seal({ user, repo, token, host });
      const lan = await share.start(s.path, s.body); // this Mac's address on the local network
      this.phone = { link: ticketLink({ host: lan, path: s.path, key: s.key }, version), until: Date.now() + 600_000, done: false };
      this.phoneOff?.();
      this.phoneOff = await share.onDone(() => { if (this.phone) this.phone.done = true; });
      clearTimeout(this.phoneTimer);
      this.phoneTimer = setTimeout(() => this.phoneDone(), 600_000);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
  phoneDone() {
    clearTimeout(this.phoneTimer);
    this.phoneOff?.();
    this.phoneOff = undefined;
    this.phone = null;
    void share.stop();
  }

  /** Phone: taking the sign-in from the Mac whose QR was scanned. */
  claiming = $state(false);
  async claim(t: Ticket) {
    this.claiming = true;
    this.error = '';
    try {
      const { user, repo, token, host } = await open(await share.fetch(t.host, t.path), t.key);
      this.save({ token, user, repo, host });
      this.claiming = false;
      await this.now();
    } catch (e) {
      this.claiming = false;
      this.status = 'error';
      const msg = e instanceof Error ? e.message : String(e);
      this.error = /timed? ?out|refused|unreachable|connect|404|not found/i.test(msg)
        ? 'Could not reach the Mac. Both on the same Wi-Fi? Show a new QR there and scan it again.'
        : msg;
    }
  }

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
        const out: LocalFile[] = await Promise.all(notes.all.map((n) => this.hashes.file(`notes/${n.id}.md`, serialize(n))));
        // the groups' icons and order (not a .md: older versions of the app leave it alone)
        out.push({ path: GROUPS, data: enc.encode(JSON.stringify(groups.shared(), null, 1)) });
        // images never change once written, so only unknown names need reading
        for (const name of await assets.list()) if (!(ASSETS + name in repo.s.known)) out.push({ path: ASSETS + name, data: await assets.read(name) });
        return out;
      }, async (files: RemoteFile[]) => {
        const lww: Note[] = [], force: Note[] = [];
        for (const f of files) {
          if (f.path.startsWith(ASSETS)) {
            // one this device cannot keep (a name with a space or a leading dot, put there on github.com) is
            // left on GitHub and asked for again next time; the notes after it still come in
            try { await assets.write(f.path.slice(ASSETS.length), f.data); } catch { delete repo.s.known[f.path]; }
            continue;
          }
          if (f.path === GROUPS) { try { groups.takeRemote(JSON.parse(dec.decode(f.data))); } catch { /* a hand-edited file that no longer parses */ } continue; }
          if (!f.path.endsWith('.md')) continue;
          const r = parse(dec.decode(f.data));
          if (!r) continue;
          const local = notes.all.find((n) => n.id === r.id);
          const untouched = local && f.prev && (await this.hashes.file(f.path, serialize(local))).sha === f.prev;
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
    widget.account(this.settings.repo, this.settings.token, this.settings.host); // a sign-in from before the widget existed
    $effect(() => { notes.dirty; this.schedule(); });
    const iv = setInterval(() => this.now(), 60_000);
    window.addEventListener('focus', () => this.now());
    // a phone: back from the background pulls, and leaving pushes before the OS may kill the app
    document.addEventListener('visibilitychange', () => { if (document.hidden) notes.flushAll(); void this.now(); });
    return () => clearInterval(iv);
  }
}

export const sync = new Sync();
