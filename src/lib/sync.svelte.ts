import { notes, parse, serialize, type Note } from './notes.svelte';
import { takeEditorKeys } from './pending';
import { assets, github, openUrl, isTauri, isMobile, widget, share, copyText, memMark } from './platform';
import { Repo, FileHashes, syncRound, deviceLogin, ensureRepo, normHost, signInError, syncError, type LocalFile, type RemoteFile } from './github';
import { seal, open, ticketLink, type Ticket } from './handoff';
import { merge3 } from './merge3';
import { isCalendarOwn, isDailyId } from './daily';
import { saved, save } from './stored';

const LS = 'eve.sync';
const ASSETS = 'notes/assets/';
const PHONE_OFFER_MS = 600_000;

const madeOnEveryDevice = (id: string) => isDailyId(id) || isCalendarOwn(id);

function wordsOnlyIn(body: string, kept: string, agreed: string): boolean {
  const known = new Set([...kept.split('\n'), ...agreed.split('\n')].map((l) => l.trim()));
  return body.split('\n').some((l) => l.trim() && !known.has(l.trim()));
}

const writtenOnBoth = (a: Note, b: Note) => a.body !== b.body && !!a.updatedAt && !!b.updatedAt;

function whichStands(here: Note, there: Note) {
  const erasedForGood = here.deleted && there.deleted && (!here.body || !there.body) ? (here.body ? there : here) : undefined;
  const later = erasedForGood ?? (there.updatedAt > here.updatedAt ? there : here);
  return { later, earlier: later === there ? here : there, erasedForGood: !!erasedForGood };
}

const UNREADABLE = null;

interface Pulled { r: Note; seen?: string; untouched: boolean; agreed?: string | typeof UNREADABLE; sameIdNoneAgreed: boolean }

async function takeAssetOrAskAgain(repo: Repo, f: RemoteFile) {
  try { await assets.write(f.path.slice(ASSETS.length), f.data); } catch { delete repo.s.known[f.path]; }
}

async function gather(files: RemoteFile[], repo: Repo, hashes: FileHashes): Promise<Pulled[]> {
  const dec = new TextDecoder();
  const pulled: Pulled[] = [];
  for (const f of files) {
    if (f.path.startsWith(ASSETS)) { await takeAssetOrAskAgain(repo, f); continue; }
    if (!f.path.endsWith('.md')) continue;
    const r = parse(dec.decode(f.data));
    if (!r) continue;
    takeEditorKeys();
    const local = notes.all.find((n) => n.id === r.id);
    const seen = local?.body;
    const untouched = !!(local && f.prev && (await hashes.file(f.path, serialize(local))).sha === f.prev);
    const sameIdNoneAgreed = !f.prev && madeOnEveryDevice(r.id);
    if (untouched) pulled.push({ r, seen, untouched, agreed: seen, sameIdNoneAgreed });
    else if (local && local.body !== r.body && f.prev) {
      const agreed = await repo.blob(f.prev).then((d) => parse(dec.decode(d))?.body ?? '', () => UNREADABLE);
      pulled.push({ r, seen, untouched, agreed, sameIdNoneAgreed });
    } else pulled.push({ r, seen, untouched, sameIdNoneAgreed });
  }
  return pulled;
}

function decide(pulled: Pulled[]) {
  takeEditorKeys();
  const lww: Note[] = [], force: Note[] = [], copies: Note[] = [];
  for (const p of pulled) {
    const { r } = p;
    const here = notes.all.find((n) => n.id === r.id);
    if (p.untouched && here?.body === p.seen) { force.push(r); continue; }
    const readable = typeof p.agreed === 'string';
    const agreed = p.agreed === undefined ? (p.sameIdNoneAgreed && here && writtenOnBoth(here, r) ? '' : undefined) : p.agreed ?? '';
    if (!here || agreed === undefined) { lww.push(r); continue; }
    const both = readable && !here.deleted && !r.deleted ? merge3(agreed, here.body, r.body) : null;
    if (both !== null) { force.push({ ...(r.updatedAt > here.updatedAt ? r : here), body: both, updatedAt: Date.now() }); continue; }
    const { later, earlier, erasedForGood } = whichStands(here, r);
    if (wordsOnlyIn(earlier.body, later.body, agreed)) copies.push({ ...earlier });
    if (later === r) (erasedForGood ? force : lww).push(r);
  }
  notes.mergeRemote(lww);
  notes.mergeRemote(force, true);
  for (const c of copies) notes.keepConflictCopy(c);
}

interface Settings { user: string; repo: string; token: string; host: string; head: string; tree: string; known: Record<string, string>; lastSynced: number }

export interface SignIn { host?: string; owner?: string; clientId?: string; token?: string }

function load(): Settings {
  const d: Settings = { user: '', repo: '', token: '', host: '', head: '', tree: '', known: {}, lastSynced: 0 };
  const s = { ...d, ...saved<Partial<Settings>>(LS, {}) };
  return { user: s.user, repo: s.repo, token: s.token, host: s.host ?? '', head: s.head, tree: s.tree, known: s.known, lastSynced: s.lastSynced };
}

class Sync {
  settings = $state<Settings>(load());
  status = $state<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  error = $state('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hashes = new FileHashes();

  save(patch: Partial<Settings>) {
    const moved = (patch.repo !== undefined && patch.repo !== this.settings.repo) || (patch.host !== undefined && patch.host !== this.settings.host);
    if (moved) Object.assign(patch, { head: '', tree: '', known: {}, lastSynced: 0 });
    Object.assign(this.settings, patch);
    this.persist();
  }

  private persist() {
    save(LS, this.settings);
    widget.account(this.settings.repo, this.settings.token, this.settings.host);
  }

  get enabled() { return /^[\w.-]+\/[\w.-]+$/.test(this.settings.repo) && !!this.settings.token; }

  pending = $state<{ code: string; url: string; renewed?: boolean } | null>(null);
  private signingIn: AbortController | undefined;

  private offerCode(code: string, url: string, renewed: boolean) {
    this.pending = { code, url, renewed };
    if (renewed) return;
    void copyText(code);
    if (!isMobile) void openUrl(url);
  }

  async login(a: SignIn = {}) {
    if (!isTauri || this.signingIn) return;
    this.signingIn = new AbortController();
    this.error = '';
    try {
      const host = normHost(a.host ?? '');
      const clientId = a.clientId?.trim();
      let token = a.token?.trim();
      if (!token && host && !clientId) throw new Error('For this server, paste a token, or the Client ID of an OAuth App its admin set up for Eve.');
      token ||= await deviceLogin(github.post, (code, url, renewed) => this.offerCode(code, url, !!renewed), this.signingIn.signal, undefined, { host, clientId });
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
      this.signingIn = undefined;
    }
  }
  cancelLogin() { this.signingIn?.abort(); }
  openLogin() { if (this.pending) { void copyText(this.pending.code); void openUrl(this.pending.url); this.pending.renewed = false; } }

  phone = $state<{ link: string; until: number; done: boolean } | null>(null);
  private phoneTimer: ReturnType<typeof setTimeout> | undefined;
  private phoneOff: (() => void) | undefined;
  async phoneSetup(version?: string) {
    this.error = '';
    try {
      const { user, repo, token, host } = this.settings;
      const s = await seal({ user, repo, token, host });
      const macLanAddress = await share.start(s.path, s.body);
      this.phone = { link: ticketLink({ host: macLanAddress, path: s.path, key: s.key }, version), until: Date.now() + PHONE_OFFER_MS, done: false };
      this.phoneOff?.();
      this.phoneOff = await share.onDone(() => { if (this.phone) this.phone.done = true; });
      clearTimeout(this.phoneTimer);
      this.phoneTimer = setTimeout(() => this.phoneDone(), PHONE_OFFER_MS);
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

  logout() {
    this.save({ token: '', user: '', repo: '' });
    this.status = 'idle';
    this.error = '';
  }

  syncSoon(ms = 2000) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.now(), ms);
  }

  async versions(id: string): Promise<{ sha: string; at: number }[]> {
    if (!this.enabled) return [];
    return new Repo({ ...this.settings }).history(`notes/${id}.md`);
  }
  async versionAt(id: string, sha: string): Promise<string> {
    const data = await new Repo({ ...this.settings }).fileAt(`notes/${id}.md`, sha);
    return data ? parse(new TextDecoder().decode(data))?.body ?? '' : '';
  }

  async now(): Promise<boolean> {
    if (!this.enabled || this.status === 'syncing') return false;
    this.status = 'syncing';
    memMark('sync');
    const repo = new Repo(this.settings);
    try {
      await syncRound(repo, async () => {
        const out: LocalFile[] = await Promise.all(notes.all.map((n) => this.hashes.file(`notes/${n.id}.md`, serialize(n))));
        const unsynced = (await assets.list()).filter((name) => !(ASSETS + name in repo.s.known));
        for (const name of unsynced) out.push({ path: ASSETS + name, data: await assets.read(name) });
        return out;
      }, async (files: RemoteFile[]) => decide(await gather(files, repo, this.hashes)));
      this.save({ lastSynced: Date.now() });
      this.status = 'ok';
      this.error = '';
      return true;
    } catch (e) {
      this.persist();
      this.status = 'error';
      this.error = syncError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  start() {
    this.persist();
    $effect(() => { notes.dirty; this.syncSoon(); });
    const iv = setInterval(() => this.now(), 60_000);
    window.addEventListener('focus', () => this.now());
    // a phone: back from the background pulls, and leaving pushes before the OS may kill the app
    document.addEventListener('visibilitychange', () => { if (document.hidden) notes.flushAll(); void this.now(); });
    return () => clearInterval(iv);
  }
}

export const sync = new Sync();
