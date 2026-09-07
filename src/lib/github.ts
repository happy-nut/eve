/**
 * File sync against a GitHub repository (branch `main`) through the REST API. No git binary.
 * Pure: no Svelte, no Tauri — `fetch` is injected so it runs in Node for tests.
 *
 * State per repo: last seen commit (`head`), its tree, and `known` = { path -> blob sha } as of that commit.
 * A local file is "changed" when its git blob sha differs from `known`, so nothing is ever re-pushed
 * and restarts are free. Pushes are one commit on top of `head`; if someone else pushed first the
 * ref update is refused (422) and the caller pulls again (see syncRound).
 */
export interface RepoState { repo: string; token: string; head: string; tree: string; known: Record<string, string> }
export interface LocalFile { path: string; data: Uint8Array }
/** `prev` = the blob sha we had for this path before the pull (undefined = new file). */
export interface RemoteFile { path: string; data: Uint8Array; prev?: string }

const API = 'https://api.github.com/repos/';
const BRANCH = 'main';
const PREFIX = 'notes/';

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

export class Repo {
  s: RepoState;
  private f: typeof fetch;
  constructor(s: RepoState, f: typeof fetch = (...a) => fetch(...a)) { this.s = s; this.f = f; }

  private api(method: string, path: string, body?: unknown) {
    return this.f(API + this.s.repo + path, {
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
      const sha = await blobSha(f.data);
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
/** GitHub OAuth App "Eve" (device flow enabled). Public by design; device flow needs no secret. */
export const CLIENT_ID = 'Ov23liUjviaVeQmqYvUk';
export const REPO_NAME = 'eve-notes';
const LOGIN = 'https://github.com/login/';
export type Post = (url: string, form: Record<string, string>) => Promise<string>;

/**
 * Device flow: ask for a code, hand it to the user (onCode), poll until they authorize in the browser.
 * `post` does the two github.com POSTs (no CORS there, so the desktop side runs them). Resolves to the token.
 */
export async function deviceLogin(post: Post, onCode: (code: string, url: string) => void, signal?: AbortSignal, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string> {
  const a = JSON.parse(await post(LOGIN + 'device/code', { client_id: CLIENT_ID, scope: 'repo' }));
  if (!a.device_code) throw new Error(a.error_description ?? a.error ?? 'device code failed');
  onCode(a.user_code, a.verification_uri);
  let interval = Number(a.interval) || 5;
  for (;;) {
    await sleep(interval * 1000);
    if (signal?.aborted) throw new Error('sign-in cancelled');
    const t = JSON.parse(await post(LOGIN + 'oauth/access_token', { client_id: CLIENT_ID, device_code: a.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }));
    if (t.access_token) return t.access_token;
    if (t.error === 'slow_down') interval += 5;
    else if (t.error !== 'authorization_pending') throw new Error(t.error_description ?? t.error ?? 'sign-in failed');
  }
}

/** Who the token belongs to, and their private notes repo (created if missing). */
export async function ensureRepo(token: string, f: typeof fetch = (...a) => fetch(...a)): Promise<{ user: string; repo: string }> {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  const me = await f('https://api.github.com/user', { headers });
  if (!me.ok) throw new Error(await explain(me));
  const user: string = (await me.json()).login;
  const repo = `${user}/${REPO_NAME}`;
  const r = await f(API + repo, { headers });
  if (r.ok) {
    if (!(await r.json()).private) throw new Error(`${repo} exists but is public — make it private or rename it`);
  } else if (r.status === 404) {
    const c = await f('https://api.github.com/user/repos', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: REPO_NAME, private: true, description: 'Eve notes (synced by the app)' }) });
    if (!c.ok) throw new Error(await explain(c));
  } else throw new Error(await explain(r));
  return { user, repo };
}
