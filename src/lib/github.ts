/**
 * File sync against a GitHub repository (branch `main`) through the REST API. No git binary.
 * Pure: no Svelte, no Tauri — `fetch` is injected so it runs in Node for tests.
 *
 * State per repo: last seen commit (`head`), its tree, and `known` = { path -> blob sha } as of that commit.
 * A local file is "changed" when its git blob sha differs from `known`, so nothing is ever re-pushed
 * and restarts are free. Pushes are one commit on top of `head`; if someone else pushed first the
 * ref update is refused (422) and the caller pulls again (see syncRound).
 */
/** `host`: the GitHub server ('' = github.com; see apiBase) */
export interface RepoState { repo: string; token: string; head: string; tree: string; known: Record<string, string>; host?: string }
/** `sha`, when given, is the blob sha of `data` (see FileHashes), so push need not hash it again. */
export interface LocalFile { path: string; data: Uint8Array; sha?: string }
/** `prev` = the blob sha we had for this path before the pull (undefined = new file). */
export interface RemoteFile { path: string; data: Uint8Array; prev?: string }

const BRANCH = 'main';
const PREFIX = 'notes/';

// ---- which GitHub: github.com, GitHub Enterprise Cloud with data residency (NAME.ghe.com), or a
// GitHub Enterprise Server of one's own (github.example.com). GitHub Enterprise Cloud on github.com
// itself is github.com: an organization there is only a different owner (see ensureRepo).

/** What the user typed as their GitHub (a URL or a bare host, maybe with a port) as a host; '' = github.com. */
export function normHost(input: string): string {
  const h = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!h || h === 'github.com' || h === 'www.github.com' || h === 'api.github.com') return '';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(h)) throw new Error(`"${input.trim()}" is not a server address`);
  return h;
}
/** The server's web pages (sign-in, settings): https://github.com or https://HOST */
export const webBase = (host = '') => `https://${host || 'github.com'}`;
/** Its REST API: api.github.com, api.NAME.ghe.com, or HOST/api/v3 on a server of one's own */
export function apiBase(host = ''): string {
  if (!host) return 'https://api.github.com';
  return host.endsWith('.ghe.com') ? `https://api.${host}` : `https://${host}/api/v3`;
}

/** git's blob id: sha1("blob <len>\0" + data). Same as what the tree listing reports. */
export async function blobSha(data: Uint8Array): Promise<string> {
  const head = new TextEncoder().encode(`blob ${data.byteLength}\0`);
  const buf = new Uint8Array(head.length + data.length);
  buf.set(head);
  buf.set(data, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64 = (d: Uint8Array) => {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));

async function explain(res: Response): Promise<string> {
  let msg = '';
  try { msg = (await res.json()).message ?? ''; } catch { /* not json */ }
  if (res.status === 401) msg = 'bad token';
  if (res.status === 404) msg = 'repository not found (check owner/name and the token\'s access)';
  return `${res.status} ${msg}`.trim();
}

/** Promise.all in chunks — GitHub throttles at ~100 concurrent requests. */
async function chunked<T, R>(xs: T[], fn: (x: T) => Promise<R>, n = 20): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(fn))));
  return out;
}

/**
 * Every sync round offers every note; most have not changed since the last one. Remember each path's
 * last text and its blob sha, and hash again only when the text differs.
 */
export class FileHashes {
  private last = new Map<string, { text: string; sha: string }>();
  private enc = new TextEncoder();
  async file(path: string, text: string): Promise<LocalFile> {
    const data = this.enc.encode(text);
    let h = this.last.get(path);
    if (h?.text !== text) this.last.set(path, (h = { text, sha: await blobSha(data) }));
    return { path, data, sha: h.sha };
  }
}

export class Repo {
  s: RepoState;
  private f: typeof fetch;
  constructor(s: RepoState, f: typeof fetch = (...a) => fetch(...a)) { this.s = s; this.f = f; }

  private api(method: string, path: string, body?: unknown) {
    return this.f(`${apiBase(this.s.host)}/repos/${this.s.repo}${path}`, {
      method,
      cache: 'no-store', // WebKit would happily serve GitHub's max-age=60 replies after our own push
      headers: {
        authorization: `Bearer ${this.s.token}`,
        accept: 'application/vnd.github+json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  private async json(method: string, path: string, body?: unknown) {
    const res = await this.api(method, path, body);
    if (!res.ok) throw new Error(await explain(res));
    return res.json();
  }

  /** Files under notes/ that changed on the remote since the last pull. Updates head/tree/known. */
  async pull(): Promise<RemoteFile[]> {
    const br = await this.api('GET', `/branches/${BRANCH}`);
    if (br.status === 404 || br.status === 409) { // no branch yet (empty repo) — or no such repo, which init() reports
      await this.init();
      return this.pull();
    }
    if (!br.ok) throw new Error(await explain(br));
    const { commit } = await br.json();
    const head: string = commit.sha;
    if (head === this.s.head) return [];
    const t = await this.json('GET', `/git/trees/${commit.commit.tree.sha}?recursive=1`);
    const known: Record<string, string> = {};
    const entries: { path: string; sha: string }[] = [];
    for (const e of t.tree as { path: string; type: string; sha: string }[]) {
      if (e.type !== 'blob' || !e.path.startsWith(PREFIX)) continue;
      known[e.path] = e.sha;
      if (this.s.known[e.path] !== e.sha) entries.push(e);
    }
    const out = await chunked(entries, async (e) => ({
      path: e.path,
      data: unb64((await this.json('GET', `/git/blobs/${e.sha}`)).content),
      prev: this.s.known[e.path],
    }));
    this.s.head = head;
    this.s.tree = t.sha;
    this.s.known = known;
    return out;
  }

  /** The git data API refuses an empty repository (409); the contents API creates the first commit + branch. */
  private async init() {
    const res = await this.api('PUT', `/contents/${PREFIX}.keep`, { message: 'eve: init', content: '', branch: BRANCH });
    if (!res.ok) throw new Error(await explain(res));
  }

  /** One commit with every file whose content differs from the remote. False = branch moved; pull and retry. */
  async push(files: LocalFile[]): Promise<boolean> {
    const changed: (LocalFile & { sha: string })[] = [];
    for (const f of files) {
      const sha = f.sha ?? await blobSha(f.data);
      if (sha !== this.s.known[f.path]) changed.push({ ...f, sha });
    }
    if (!changed.length) return true;
    const tree = await chunked(changed, async (f) => {
      const { sha } = await this.json('POST', '/git/blobs', { content: b64(f.data), encoding: 'base64' });
      if (sha !== f.sha) throw new Error(`blob sha mismatch for ${f.path}`);
      return { path: f.path, mode: '100644', type: 'blob', sha };
    });
    const t = await this.json('POST', '/git/trees', { base_tree: this.s.tree, tree });
    const c = await this.json('POST', '/git/commits', {
      message: `eve: ${changed.length} file${changed.length === 1 ? '' : 's'}`,
      tree: t.sha,
      parents: [this.s.head],
    });
    const r = await this.api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: c.sha });
    if (r.status === 422) return false;
    if (!r.ok) throw new Error(await explain(r));
    this.s.head = c.sha;
    this.s.tree = t.sha;
    for (const e of tree) this.s.known[e.path] = e.sha;
    return true;
  }
}

/**
 * pull -> merge (onPull) -> push, retried while the branch keeps moving underneath us.
 * `local` is called after the merge so it reflects what won.
 */
export async function syncRound(
  repo: Repo,
  local: () => LocalFile[] | Promise<LocalFile[]>,
  onPull: (files: RemoteFile[]) => void | Promise<void>,
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const pulled = await repo.pull();
    if (pulled.length) await onPull(pulled);
    if (await repo.push(await local())) return;
  }
  throw new Error('branch keeps moving; try again');
}

// ---- sign-in: OAuth device flow + the notes repo ------------------------------
/** GitHub OAuth App "Eve" (device flow enabled), on github.com. Public by design; device flow needs no
 *  secret. Another server needs an OAuth App of its own (its admin registers one), or a token instead. */
export const CLIENT_ID = 'Ov23liUjviaVeQmqYvUk';
export const REPO_NAME = 'eve-notes';
/** which OAuth App on which server a device-flow sign-in goes through */
export interface Login { host?: string; clientId?: string }
const loginUrl = (l: Login, path: string) => `${webBase(l.host)}/login/${path}`;
export type Post = (url: string, form: Record<string, string>) => Promise<string>;

export interface DeviceCode { device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number }

/** Device flow, first half: a code for the user to enter on GitHub, and the secret half to poll with. */
export async function requestCode(post: Post, l: Login = {}): Promise<DeviceCode> {
  const a = JSON.parse(await post(loginUrl(l, 'device/code'), { client_id: l.clientId || CLIENT_ID, scope: 'repo' }));
  if (!a.device_code) throw new Error(a.error_description ?? a.error ?? 'device code failed');
  return { device_code: a.device_code, user_code: a.user_code, verification_uri: a.verification_uri, interval: Number(a.interval) || 5, expires_in: Number(a.expires_in) || 900 };
}

/** Device flow, second half: poll until the code is authorized; resolves to the token. A failed request
 *  is not the end: the user is in the browser meanwhile, and a phone may cut a background app off the
 *  network for a while (DNS then fails). Only GitHub's own answer — denied, expired — or `expiresIn`
 *  running out ends it. */
export async function pollToken(post: Post, deviceCode: string, interval = 5, signal?: AbortSignal, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)), expiresIn = 900, l: Login = {}): Promise<string> {
  for (let waited = 0; ; waited += interval) {
    if (waited > expiresIn) throw new Error('the sign-in code expired; start again');
    await sleep(interval * 1000);
    if (signal?.aborted) throw new Error('sign-in cancelled');
    let reply: string;
    try {
      reply = await post(loginUrl(l, 'oauth/access_token'), { client_id: l.clientId || CLIENT_ID, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    } catch {
      continue; // offline for a moment: ask again next round
    }
    const t = JSON.parse(reply);
    if (t.access_token) return t.access_token;
    if (t.error === 'slow_down') interval += 5;
    else if (t.error !== 'authorization_pending') throw new Error(t.error_description ?? t.error ?? 'sign-in failed');
  }
}

/**
 * Device flow: ask for a code, hand it to the user (onCode), poll until they authorize in the browser.
 * `post` does the two github.com POSTs (no CORS there, so the desktop side runs them). Resolves to the token.
 */
export async function deviceLogin(post: Post, onCode: (code: string, url: string) => void, signal?: AbortSignal, sleep?: (ms: number) => Promise<unknown>, l: Login = {}): Promise<string> {
  const a = await requestCode(post, l);
  onCode(a.user_code, a.verification_uri);
  return pollToken(post, a.device_code, a.interval, signal, sleep, a.expires_in, l);
}

/**
 * Who the token belongs to, and the private notes repo (created if missing): `owner/eve-notes`, where
 * owner is the signed-in user or, given, an organization they belong to (a company's rules may want the
 * notes kept inside it). On `host` when not github.com.
 */
export async function ensureRepo(token: string, f: typeof fetch = (...a) => fetch(...a), opts: { host?: string; owner?: string } = {}): Promise<{ user: string; repo: string }> {
  const api = apiBase(opts.host);
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  let me: Response;
  try {
    me = await f(`${api}/user`, { headers });
  } catch {
    throw new Error(`Could not reach ${webBase(opts.host)}. On a company network or VPN?`);
  }
  if (!me.ok) throw new Error(await explain(me));
  const user: string = (await me.json()).login;
  const owner = opts.owner?.trim() || user;
  if (!/^[\w.-]+$/.test(owner)) throw new Error(`"${owner}" is not a user or organization name`);
  const repo = `${owner}/${REPO_NAME}`;
  const r = await f(`${api}/repos/${repo}`, { headers });
  if (r.ok) {
    // private only: "internal" (a GitHub Enterprise visibility) shows the notes to everyone in the company
    const j = await r.json();
    const seen: string = j.visibility ?? (j.private ? 'private' : 'public');
    if (seen !== 'private') throw new Error(`${repo} exists but is ${seen} — make it private or rename it`);
  } else if (r.status === 404) {
    const into = owner.toLowerCase() === user.toLowerCase() ? `${api}/user/repos` : `${api}/orgs/${owner}/repos`;
    const c = await f(into, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: REPO_NAME, private: true, description: 'Eve notes (synced by the app)' }) });
    if (!c.ok) throw new Error(await explain(c));
  } else throw new Error(await explain(r));
  return { user, repo };
}
