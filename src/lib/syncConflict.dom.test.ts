// A note changed on this device and on another before they synced. It used to come down to whichever was saved last,
// and the other device's words were gone without a trace: a line added on the phone on the train, overwritten by the
// Mac. Now both changes are kept, and when they cannot be put together, the other version is kept as a note of its own.
import { test, expect } from 'vitest';
import { fakeGitHub } from './fakeGitHub.mjs';
import { Repo } from './github';
import { notes, serialize, parse, type Note } from './notes.svelte';
import { sync } from './sync.svelte';

const gh = fakeGitHub();
/** a step taken while this device's sync waits on GitHub (a key typed then) */
let onFetch: ((url: string, init?: RequestInit) => void) | null = null;
globalThis.fetch = ((url: string, init?: RequestInit) => { onFetch?.(String(url), init); return gh.fetch(url, init); }) as typeof fetch;
sync.save({ user: 'o', repo: 'o/r', token: 'tok' });

/** the other device: its own view of the same repository */
const other = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch);
const enc = new TextEncoder(), dec = new TextDecoder();
const path = (id: string) => `notes/${id}.md`;
/** what the repository holds for a note, as the other device reads it */
async function remote(id: string): Promise<Note> {
  await other.pull();
  const r = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch);
  const f = (await r.pull()).find((x) => x.path === path(id))!;
  return parse(dec.decode(f.data))!;
}
/** the other device writes `body` into the note, a moment after this one did */
async function otherWrites(id: string, body: string) {
  const n = await remote(id);
  expect(await other.push([{ path: path(id), data: enc.encode(serialize({ ...n, body, updatedAt: Date.now() + 5000 })) }])).toBe(true);
}
function made(body: string): string {
  const n = notes.create(body);
  notes.touched(n.id);
  notes.flush(n.id);
  return n.id;
}
const bodyOf = (id: string) => notes.all.find((n) => n.id === id)!.body;

test('changes to different lines on two devices: both kept, here and in the repository', async () => {
  const base = '# Plan\n\nstep one\n\nstep two';
  const id = made(base);
  expect(await sync.now()).toBe(true);
  await otherWrites(id, base.replace('step two', 'step two, later'));
  notes.update(id, base.replace('step one', 'step one, done'));
  expect(await sync.now()).toBe(true);
  const both = '# Plan\n\nstep one, done\n\nstep two, later';
  expect(bodyOf(id)).toBe(both);
  expect((await remote(id)).body).toBe(both);
});

test('a line added at the end on each device: both lines', async () => {
  const base = '# Trip\n\npack';
  const id = made(base);
  expect(await sync.now()).toBe(true);
  await otherWrites(id, base + '\n\nadded on the phone');
  notes.update(id, base + '\n\nadded on the Mac');
  expect(await sync.now()).toBe(true);
  expect(bodyOf(id)).toBe(base + '\n\nadded on the Mac\n\nadded on the phone');
});

test('the same line made into two different things: one stays the note, the other is kept beside it', async () => {
  const base = '# Budget\n\ntotal: 100';
  const id = made(base);
  expect(await sync.now()).toBe(true);
  await otherWrites(id, '# Budget\n\ntotal: 250');
  notes.update(id, '# Budget\n\ntotal: 120');
  expect(await sync.now()).toBe(true);
  const texts = notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n---\n');
  expect(texts).toContain('total: 250');
  expect(texts).toContain('total: 120');
  // the note itself is the later one (the other device's), and the copy says what it is
  expect(bodyOf(id)).toContain('total: 250');
  const copy = notes.all.find((n) => !n.deleted && n.id !== id && n.body.includes('total: 120'))!;
  expect(copy.body.split('\n')[0]).toMatch(/Budget.*conflict/i);
});

test('a page renamed on the other device: links to it here, in notes that device has not seen, follow the new name', async () => {
  const page = made('# Recipes\n\npasta');
  expect(await sync.now()).toBe(true);
  await otherWrites(page, '# Cooking\n\npasta');
  const menu = made('# Menu\n\nsee [[Recipes]] and [[Recipes#Pasta|the pasta]]');
  expect(await sync.now()).toBe(true);
  expect(bodyOf(menu)).toBe('# Menu\n\nsee [[Cooking]] and [[Cooking#Pasta|the pasta]]');
  expect((await remote(menu)).body).toBe(bodyOf(menu));
});

test('a link renamed on the other device in the line being written here: the words typed here and the new name both', async () => {
  made('# Target\n\nx');
  const id = made('# Notes\n\nbeta line with [[Target]] in it');
  expect(await sync.now()).toBe(true);
  await otherWrites(id, '# Notes\n\nbeta line with [[Renamed]] in it');
  notes.update(id, '# Notes\n\nbeta ONE line with [[Target]] in it');
  expect(await sync.now()).toBe(true);
  expect(bodyOf(id)).toBe('# Notes\n\nbeta ONE line with [[Renamed]] in it');
  expect(notes.all.some((n) => !n.deleted && n.body.startsWith('# Notes (conflict copy)'))).toBe(false);
});

// The three ways words were still lost, found by the TLA+ model in .claude/skills/formal-sync (EveSync.tla)
/** every note's words here, the Trash included, and the branch's copy */
async function findable(id: string): Promise<string> {
  return notes.all.map((n) => n.body).join('\n') + '\n' + ((await remote(id))?.body ?? '');
}

test('written here while the other device deleted the note later: what was written here is kept, as a copy beside it', async () => {
  const id = made('# Plan\n\nshared');
  expect(await sync.now()).toBe(true);
  notes.update(id, '# Plan\n\nshared\n\nwritten here');
  const r = await remote(id);
  expect(await other.push([{ path: path(id), data: enc.encode(serialize({ ...r, deleted: true, updatedAt: Date.now() + 5000 })) }])).toBe(true);
  expect(await sync.now()).toBe(true);
  expect(notes.all.find((n) => n.id === id)!.deleted).toBe(true); // the delete, the later step, stands
  expect(notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n')).toContain('written here');
});

test('deleted here, written on the other device later: the note comes back with the other device\'s words', async () => {
  const id = made('# Trip\n\npack');
  expect(await sync.now()).toBe(true);
  notes.remove(id);
  await otherWrites(id, '# Trip\n\npack\n\nwritten there');
  expect(await sync.now()).toBe(true);
  expect(await findable(id)).toContain('written there');
});

test('a day\'s note written on both devices before either synced: both days\' words kept', async () => {
  const key = '2030-01-02';
  const day = notes.dayNote(key);
  notes.update(day.id, day.body + '\n\nwritten here');
  await other.pull();
  expect(await other.push([{ path: path(day.id), data: enc.encode(serialize({ id: day.id, body: '# Jan 2\n\nwritten there', updatedAt: Date.now() + 5000, deleted: false, order: 0 })) }])).toBe(true);
  expect(await sync.now()).toBe(true);
  const here = notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n');
  expect(here).toContain('written there');
  expect(here).toContain('written here');
});

test('a key typed into a note while sync waits on another note\'s file: the key\'s words stay, with the other device\'s', async () => {
  const [a, b] = [made('# Alpha\n\none'), made('# Beta\n\none')].sort();
  expect(await sync.now()).toBe(true);
  await otherWrites(a, '# Alpha\n\none\n\nthere');
  await otherWrites(b, '# Beta\n\none\n\nthere');
  notes.update(b, '# Beta\n\none\n\nhere too');
  // the pull reads the changed files, then waits on Beta's last agreed version to put its two changes together: a key then
  const base = sync.settings.known[path(b)];
  let typed = false;
  onFetch = (url, init) => {
    if (!typed && url.endsWith(`/git/blobs/${base}`) && (init?.method ?? 'GET') === 'GET') { typed = true; notes.update(a, '# Alpha\n\none\n\ntyped meanwhile'); }
  };
  try { expect(await sync.now()).toBe(true); } finally { onFetch = null; }
  expect(typed).toBe(true);
  const body = notes.all.find((n) => n.id === a)!.body;
  expect(body).toContain('typed meanwhile');
  expect(body).toContain('there');
});

test('written and deleted here, deleted on the other device later: what was written stays in the Trash', async () => {
  const id = made('# Old\n\nshared');
  expect(await sync.now()).toBe(true);
  notes.update(id, '# Old\n\nshared\n\nwritten before deleting');
  notes.remove(id);
  const r = await remote(id);
  expect(await other.push([{ path: path(id), data: enc.encode(serialize({ ...r, deleted: true, updatedAt: Date.now() + 5000 })) }])).toBe(true);
  expect(await sync.now()).toBe(true);
  const trash = notes.all.filter((n) => n.deleted).map((n) => n.body).join('\n');
  expect(trash).toContain('written before deleting');
  expect(notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n')).not.toContain('written before deleting');
});

test('a key typed into a note while sync brings in its deletion from the other device: the words are kept as a copy', async () => {
  const [a, b] = [made('# Gamma\n\none'), made('# Delta\n\none')].sort();
  expect(await sync.now()).toBe(true);
  const ra = await remote(a);
  expect(await other.push([{ path: path(a), data: enc.encode(serialize({ ...ra, deleted: true, updatedAt: Date.now() + 5000 })) }])).toBe(true);
  await otherWrites(b, '# Delta\n\none\n\nthere');
  notes.update(b, '# Delta\n\none\n\nhere too');
  const base = sync.settings.known[path(b)];
  let typed = false;
  onFetch = (url, init) => {
    if (!typed && url.endsWith(`/git/blobs/${base}`) && (init?.method ?? 'GET') === 'GET') { typed = true; notes.update(a, '# Gamma\n\none\n\ntyped as it was deleted there'); }
  };
  try { expect(await sync.now()).toBe(true); } finally { onFetch = null; }
  expect(notes.all.find((n) => n.id === a)!.deleted).toBe(true);
  expect(notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n')).toContain('typed as it was deleted there');
});
