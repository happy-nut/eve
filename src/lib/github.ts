export interface RepoState { repo: string; token: string; head: string; tree: string; known: Record<string, string>; host?: string }
export interface LocalFile { path: string; data: Uint8Array; sha?: string }
export interface RemoteFile { path: string; data: Uint8Array; prev?: string }

const BRANCH = 'main';
const PREFIX = 'notes/';


export function normHost(input: string): string {
  const h = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!h || h === 'github.com' || h === 'www.github.com' || h === 'api.github.com') return '';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(h)) throw new Error(`"${input.trim()}" is not a server address`);
  return h;
}
export const webBase = (host = '') => `https://${host || 'github.com'}`;
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

export const b64 = (d: Uint8Array) => {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));

async function explain(res: Response): Promise<string> {
  let msg = '';
  try {
    const j = await res.json();
    msg = j.message ?? '';
    // GitHub says what was wrong in `errors` ("name already exists on this account"); "Validation Failed" alone tells nothing
    const why = (j.errors ?? []).map((e: { message?: string; code?: string }) => e?.message || e?.code).filter(Boolean);
    if (why.length) msg += ` (${why.join('; ')})`;
  } catch { }
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
      data: await this.blob(e.sha),
      prev: this.s.known[e.path],
    }));
    this.s.head = head;
    this.s.tree = t.sha;
    this.s.known = known;
    return out;
  }

  async blob(sha: string): Promise<Uint8Array> {
    return unb64((await this.json('GET', `/git/blobs/${sha}`)).content);
  }

  async history(path: string, max = 50): Promise<{ sha: string; at: number }[]> {
    const list = await this.json('GET', `/commits?sha=${BRANCH}&path=${encodeURIComponent(path)}&per_page=${max}`);
    return (list as { sha: string; commit: { committer: { date: string } } }[]).map((c) => ({ sha: c.sha, at: Date.parse(c.commit.committer.date) }));
  }

  async fileAt(path: string, sha: string): Promise<Uint8Array | null> {
    const res = await this.api('GET', `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await explain(res));
    const f = await res.json();
    // ponytail: the contents API hands a file past 1 MB over without its content; read its blob by sha then
    return f.content ? unb64(f.content) : f.sha ? this.blob(f.sha) : null;
  }

  /** The git data API refuses an empty repository (409); the contents API creates the first commit + branch. */
  private async init() {
    const res = await this.api('PUT', `/contents/${PREFIX}.keep`, { message: 'eve: init', content: '', branch: BRANCH });
    if (!res.ok) throw new Error(await explain(res));
  }

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

export async function syncRound(
  repo: Repo,
  local: () => LocalFile[] | Promise<LocalFile[]>,
  onPull: (files: RemoteFile[]) => void | Promise<void>,
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const before = { head: repo.s.head, tree: repo.s.tree, known: repo.s.known };
    const pulled = await repo.pull();
    try {
      if (pulled.length) await onPull(pulled);
    } catch (e) {
      Object.assign(repo.s, before);
      throw e;
    }
    if (await repo.push(await local())) return;
  }
  throw new Error('branch keeps moving; try again');
}

/** GitHub OAuth App "Eve" (device flow enabled), on github.com. Public by design; device flow needs no
 *  secret. Another server needs an OAuth App of its own (its admin registers one), or a token instead. */
export const CLIENT_ID = 'Ov23liUjviaVeQmqYvUk';
export const REPO_NAME = 'eve-notes';
export interface Login { host?: string; clientId?: string }
const loginUrl = (l: Login, path: string) => `${webBase(l.host)}/login/${path}`;
export type Post = (url: string, form: Record<string, string>) => Promise<string>;

export interface DeviceCode { device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number }

export async function requestCode(post: Post, l: Login = {}): Promise<DeviceCode> {
  const a = JSON.parse(await post(loginUrl(l, 'device/code'), { client_id: l.clientId || CLIENT_ID, scope: 'repo' }));
  if (!a.device_code) throw new Error(a.error_description ?? a.error ?? 'device code failed');
  return { device_code: a.device_code, user_code: a.user_code, verification_uri: a.verification_uri, interval: Number(a.interval) || 5, expires_in: Number(a.expires_in) || 900 };
}

const OWN_WORDS = / exists but is | is not a server address| is not a user or organization name|already exists, but this sign-in/;

export function signInError(msg: string): string | null {
  if (/cancelled/i.test(msg)) return null;
  if (OWN_WORDS.test(msg)) return msg;
  if (/denied/i.test(msg)) return 'Eve was not authorized on GitHub. Press Sign in with GitHub to try again.';
  if (/expired/i.test(msg)) return 'The sign-in code ran out. Press Sign in with GitHub for a new one.';
  if (/verif\w*.*email|email.*verif/i.test(msg)) return 'GitHub wants the account\'s email address confirmed first: open the link in the email GitHub sent, then sign in again.';
  const answered = /^\d{3}\b/.test(msg);
  if (!answered && /could not reach|lookup address|network|\bdns\b|timed? ?out|connection|offline|error sending request/i.test(msg)) return 'Could not reach GitHub. Check the internet connection (or a VPN) and try again.';
  if (/^401\b/.test(msg)) return 'GitHub did not accept this sign-in. Sign in again; a pasted token needs the repo scope.';
  return msg;
}

export function syncError(msg: string): string {
  if (OWN_WORDS.test(msg)) return msg;
  const answered = /^\d{3}\b/.test(msg);
  if (!answered && /failed to fetch|load failed|networkerror|could not reach|lookup address|network|\bdns\b|timed? ?out|connection|offline|error sending request/i.test(msg)) return 'Could not reach GitHub. Eve tries again every minute; your notes are kept here meanwhile.';
  if (/^401\b/.test(msg)) return 'GitHub no longer accepts this sign-in. Sign in again here to keep syncing.';
  if (/^403\b/.test(msg) && /rate limit|abuse|secondary/i.test(msg)) return 'GitHub asked Eve to slow down. It tries again in a few minutes by itself.';
  if (/^404\b/.test(msg)) return 'The notes repository is gone, or this sign-in can no longer see it. Sign in again to choose it.';
  if (/^5\d\d\b/.test(msg)) return 'GitHub is having trouble right now. Eve tries again every minute.';
  if (/branch keeps moving/i.test(msg)) return 'Another device was syncing at the same moment. Eve tries again in a minute.';
  return msg.replace(/^\w*Error:\s*/, '');
}

export class CodeExpired extends Error {
  constructor(msg = 'the sign-in code expired; start again') { super(msg); }
}

export async function pollToken(post: Post, deviceCode: string, interval = 5, signal?: AbortSignal, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)), expiresIn = 900, l: Login = {}): Promise<string> {
  const cancelled = new Promise<void>((r) => signal?.addEventListener('abort', () => r(), { once: true }));
  for (let waited = 0; ; waited += interval) {
    if (waited > expiresIn) throw new CodeExpired();
    if (signal?.aborted) throw new Error('sign-in cancelled');
    await Promise.race([sleep(interval * 1000), cancelled]);
    if (signal?.aborted) throw new Error('sign-in cancelled');
    let reply: string;
    try {
      reply = await post(loginUrl(l, 'oauth/access_token'), { client_id: l.clientId || CLIENT_ID, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    } catch {
      continue;
    }
    const t = JSON.parse(reply);
    if (t.access_token) return t.access_token;
    if (t.error === 'slow_down') interval += 5;
    else if (t.error === 'expired_token') throw new CodeExpired(t.error_description);
    else if (t.error !== 'authorization_pending') throw new Error(t.error_description ?? t.error ?? 'sign-in failed');
  }
}

export async function deviceLogin(post: Post, onCode: (code: string, url: string, renewed: boolean) => void, signal?: AbortSignal, sleep?: (ms: number) => Promise<unknown>, l: Login = {}, renewals = 4): Promise<string> {
  for (let n = 0; ; n++) {
    const a = await requestCode(post, l);
    onCode(a.user_code, a.verification_uri, n > 0);
    try {
      return await pollToken(post, a.device_code, a.interval, signal, sleep, a.expires_in, l);
    } catch (e) {
      if (signal?.aborted) throw new Error('sign-in cancelled');
      if (!(e instanceof CodeExpired) || n >= renewals) throw e;
    }
  }
}

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
    if (!c.ok) {
      const why = await explain(c);
      // looked for and not found, yet there: this sign-in may not see it (a token for other repositories only,
      // an organization that has not let Eve in, single sign-on not authorized)
      if (c.status === 422 && /already exists/i.test(why)) throw new Error(`${repo} already exists, but this sign-in cannot see it: give Eve (or the token) access to it on GitHub, or rename it`);
      throw new Error(why);
    }
  } else throw new Error(await explain(r));
  return { user, repo };
}
