// Sync engine self-check. Default: in-memory fake GitHub. Real API: EVE_TEST_REPO=owner/name EVE_TEST_TOKEN=... npm test
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Repo, syncRound, blobSha, deviceLogin } from './github.ts';

const gitSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const rnd = () => randomBytes(20).toString('hex');

/** The handful of GitHub endpoints github.ts uses, with real git blob ids so local sha comparison is exercised. */
function fakeGitHub() {
  const blobs = new Map(), trees = new Map(), commits = new Map();
  let ref = null, calls = 0;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const putBlob = (buf) => { const sha = gitSha(buf); blobs.set(sha, buf); return sha; };
  const putTree = (entries) => { const sha = rnd(); trees.set(sha, entries); return sha; };
  const putCommit = (tree, parents) => { const sha = rnd(); commits.set(sha, { tree, parents }); return sha; };
  const fetch = async (url, init = {}) => {
    calls++;
    const m = init.method ?? 'GET';
    const p = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : {};
    if (init.headers?.authorization !== 'Bearer tok') return json(401, { message: 'Bad credentials' });
    if (m === 'GET' && p === '/branches/main') return ref ? json(200, { commit: { sha: ref, commit: { tree: { sha: commits.get(ref).tree } } } }) : json(404, { message: 'Branch not found' });
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

const real = process.env.EVE_TEST_REPO;
const fake = real ? null : fakeGitHub();
const repo = real ?? 'o/r', token = real ? process.env.EVE_TEST_TOKEN : 'tok';
const f = fake ? fake.fetch : (...a) => fetch(...a);
const fresh = (t = token) => new Repo({ repo, token: t, head: '', tree: '', known: {} }, f);

const enc = new TextEncoder(), dec = new TextDecoder();
const uid = Date.now().toString(36); // unique per run so a real repo can be reused
const N = (id) => `notes/${uid}-${id}.md`;
const ASSET = `notes/assets/${uid}.png`;
const v1 = enc.encode(`---\nid: ${uid}-n1\nupdated: 100\n---\n안녕 v1`);
const v2 = enc.encode(`---\nid: ${uid}-n1\nupdated: 200\n---\n안녕 v2 ✓`);
const n2 = enc.encode(`---\nid: ${uid}-n2\n---\nsecond`);
const png = Uint8Array.from({ length: 256 }, (_, i) => i);
const entries = (m) => Object.entries(m).map(([path, data]) => ({ path, data }));
const merge = (m, files) => { for (const x of files) m[x.path] = x.data; };
const bytes = (m, path) => Buffer.from(m[path] ?? []);

// blobSha matches git
assert.equal(await blobSha(v1), gitSha(Buffer.from(v1)));

// A starts on a fresh (possibly empty) repo and pushes n1 (fake: exercises the empty-repo init path)
const A = fresh(), aFiles = { [N('n1')]: v1 };
await syncRound(A, () => entries(aFiles), (p) => merge(aFiles, p));
assert.equal(A.s.known[N('n1')], await blobSha(v1));
if (fake) assert.equal(A.s.known['notes/.keep'], gitSha(Buffer.alloc(0)));

// B starts fresh and pulls it
const B = fresh(), bFiles = {};
let pulled = [];
await syncRound(B, () => entries(bFiles), (p) => { pulled = p; merge(bFiles, p); });
assert.equal(dec.decode(bytes(bFiles, N('n1'))), dec.decode(v1));
assert.equal(pulled.find((x) => x.path === N('n1')).prev, undefined);

// nothing changed: only the ref lookup, no commit
const calls0 = fake?.calls(), commits0 = fake?.commits();
await syncRound(B, () => entries(bFiles), () => assert.fail('nothing to pull'));
if (fake) { assert.equal(fake.calls() - calls0, 1); assert.equal(fake.commits(), commits0); }

// race: while B is between pull and push, A pushes n1 v2 + an image; B's ref update is refused, B re-pulls and retries
bFiles[N('n2')] = n2;
let raced = false;
pulled = [];
await syncRound(B, async () => {
  if (!raced) { raced = true; await syncRound(A, () => entries({ ...aFiles, [N('n1')]: v2, [ASSET]: png }), () => {}); }
  return entries(bFiles);
}, (p) => { pulled.push(...p); merge(bFiles, p); });
assert.equal(pulled.find((x) => x.path === N('n1')).prev, await blobSha(v1)); // B knew v1 -> "untouched locally" signal
assert.equal(dec.decode(bytes(bFiles, N('n1'))), dec.decode(v2));
assert.deepEqual([...bytes(bFiles, ASSET)], [...png]);
assert.equal(B.s.known[N('n2')], await blobSha(n2));

// a third client sees everything
const C = fresh(), cFiles = {};
await syncRound(C, () => [], (p) => merge(cFiles, p));
assert.equal(dec.decode(bytes(cFiles, N('n1'))), dec.decode(v2));
assert.equal(dec.decode(bytes(cFiles, N('n2'))), dec.decode(n2));
assert.deepEqual([...bytes(cFiles, ASSET)], [...png]);
assert.equal(C.s.head, B.s.head);

// bad token
await assert.rejects(syncRound(fresh('nope'), () => [], () => {}), /401/);

// device flow: code shown once, pending / slow_down tolerated, token returned; cancel rejects
const replies = ['{"error":"authorization_pending"}', '{"error":"slow_down"}', '{"access_token":"gho_x"}'];
const posts = [];
const post = async (url, form) => { posts.push(url); return url.endsWith('device/code') ? '{"device_code":"d","user_code":"AB12-CD34","verification_uri":"https://github.com/login/device","interval":1}' : replies.shift(); };
let shown;
assert.equal(await deviceLogin(post, (code, url) => (shown = [code, url]), undefined, async () => {}), 'gho_x');
assert.deepEqual(shown, ['AB12-CD34', 'https://github.com/login/device']);
assert.equal(posts.length, 4);
const ac = new AbortController(); ac.abort();
await assert.rejects(deviceLogin(post, () => {}, ac.signal, async () => {}), /cancelled/);

console.log('SYNC_OK');
