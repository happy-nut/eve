// @ts-nocheck — a plain-JS test helper, also imported by the node tests
// An in-memory GitHub: the handful of endpoints github.ts uses, with real git blob ids. For the sync tests.
import { createHash, randomBytes } from 'node:crypto';

const gitSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const rnd = () => randomBytes(20).toString('hex');

/** The handful of GitHub endpoints github.ts uses, with real git blob ids so local sha comparison is exercised. */
export function fakeGitHub() {
  const blobs = new Map(), trees = new Map(), commits = new Map();
  let ref = null, calls = 0;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const putBlob = (buf) => { const sha = gitSha(buf); blobs.set(sha, buf); return sha; };
  const putTree = (entries) => { const sha = rnd(); trees.set(sha, entries); return sha; };
  let clock = Date.parse('2026-10-25T09:00:00Z');
  const putCommit = (tree, parents) => { const sha = rnd(); commits.set(sha, { tree, parents, at: (clock += 60_000) }); return sha; };
  const shaIn = (commit, path) => trees.get(commits.get(commit).tree).find((e) => e.path === path)?.sha;
  const fetch = async (url, init = {}) => {
    calls++;
    const m = init.method ?? 'GET';
    const p = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : {};
    if (init.headers?.authorization !== 'Bearer tok') return json(401, { message: 'Bad credentials' });
    if (m === 'GET' && p === '/branches/main') return ref ? json(200, { commit: { sha: ref, commit: { tree: { sha: commits.get(ref).tree } } } }) : json(404, { message: 'Branch not found' });
    // a file's history: the commits on main that changed it, newest first
    if (m === 'GET' && p === '/commits') {
      const q = new URL(url).searchParams, path = q.get('path'), out = [];
      for (let c = ref; c && out.length < Number(q.get('per_page') || 30); c = commits.get(c).parents[0]) {
        const parent = commits.get(c).parents[0];
        const now = shaIn(c, path);
        if (now !== (parent ? shaIn(parent, path) : undefined)) out.push({ sha: c, commit: { committer: { date: new Date(commits.get(c).at).toISOString() } } });
      }
      return json(200, out);
    }
    if (m === 'GET' && p.startsWith('/contents/')) {
      const ref2 = new URL(url).searchParams.get('ref');
      const sha = commits.has(ref2) ? shaIn(ref2, decodeURIComponent(p.slice('/contents/'.length))) : undefined;
      return sha ? json(200, { sha, content: blobs.get(sha).toString('base64'), encoding: 'base64' }) : json(404, { message: 'Not Found' });
    }
    if (m === 'GET' && p.startsWith('/git/trees/')) {
      const t = p.slice('/git/trees/'.length);
      return json(200, { sha: t, tree: trees.get(t).map((e) => ({ ...e, type: 'blob', mode: '100644' })) });
    }
    if (m === 'GET' && p.startsWith('/git/blobs/')) {
      const b = blobs.get(p.slice('/git/blobs/'.length));
      return b ? json(200, { content: b.toString('base64').replace(/(.{60})/g, '$1\n'), encoding: 'base64' }) : json(404, {});
    }
    if (m === 'POST' && p === '/git/blobs') {
      if (!ref) return json(409, { message: 'Git Repository is empty.' });
      return json(201, { sha: putBlob(Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) });
    }
    if (m === 'POST' && p === '/git/trees') {
      const map = new Map((body.base_tree ? trees.get(body.base_tree) : []).map((e) => [e.path, e]));
      for (const e of body.tree) map.set(e.path, { path: e.path, sha: e.sha });
      return json(201, { sha: putTree([...map.values()]) });
    }
    if (m === 'POST' && p === '/git/commits') return json(201, { sha: putCommit(body.tree, body.parents) });
    if (m === 'PATCH' && p === '/git/refs/heads/main') {
      const c = commits.get(body.sha);
      if (!c || c.parents[0] !== ref) return json(422, { message: 'Update is not a fast forward' });
      ref = body.sha;
      return json(200, { object: { sha: ref } });
    }
    if (m === 'PUT' && p.startsWith('/contents/')) {
      if (ref) return json(422, { message: 'exists' });
      ref = putCommit(putTree([{ path: p.slice('/contents/'.length), sha: putBlob(Buffer.from(body.content, 'base64')) }]), []);
      return json(201, {});
    }
    return json(404, { message: `unhandled ${m} ${p}` });
  };
  return { fetch, calls: () => calls, commits: () => commits.size };
}
