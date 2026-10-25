// A note changed on this device and on another before they synced. It used to come down to whichever was saved last,
// and the other device's words were gone without a trace: a line added on the phone on the train, overwritten by the
// Mac. Now both changes are kept, and when they cannot be put together, the other version is kept as a note of its own.
import { test, expect } from 'vitest';
import { fakeGitHub } from './fakeGitHub.mjs';
import { Repo } from './github';
import { notes, serialize, parse, type Note } from './notes.svelte';
import { sync } from './sync.svelte';

const gh = fakeGitHub();
globalThis.fetch = gh.fetch;
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
