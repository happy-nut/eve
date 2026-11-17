import { test, expect } from 'vitest';
import { mount, flushSync, tick } from 'svelte';
import Editor from '../Editor.svelte';
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
import { type as typeIn } from './testEditor';
import { allowFocusLoss } from './focusWatch';
import { fakeGitHub } from './fakeGitHub.mjs';
import { Repo } from './github';
import { notes, serialize, parse, type Note } from './notes.svelte';
import { sync } from './sync.svelte';

const gh = fakeGitHub();
let duringFetch: ((url: string, init?: RequestInit) => void) | null = null;
globalThis.fetch = ((url: string, init?: RequestInit) => { duringFetch?.(String(url), init); return gh.fetch(url, init); }) as typeof fetch;
sync.save({ user: 'o', repo: 'o/r', token: 'tok' });

const otherDevice = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch);
const enc = new TextEncoder(), dec = new TextDecoder();
const path = (id: string) => `notes/${id}.md`;
async function remote(id: string): Promise<Note> {
  await otherDevice.pull();
  const r = new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch);
  const f = (await r.pull()).find((x) => x.path === path(id))!;
  return parse(dec.decode(f.data))!;
}
async function otherWrites(id: string, body: string) {
  const n = await remote(id);
  expect(await otherDevice.push([{ path: path(id), data: enc.encode(serialize({ ...n, body, updatedAt: Date.now() + 5000 })) }])).toBe(true);
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

async function findable(id: string): Promise<string> {
  return notes.all.map((n) => n.body).join('\n') + '\n' + ((await remote(id))?.body ?? '');
}

test('written here while the other device deleted the note later: what was written here is kept, as a copy beside it', async () => {
  const id = made('# Plan\n\nshared');
  expect(await sync.now()).toBe(true);
  notes.update(id, '# Plan\n\nshared\n\nwritten here');
  const r = await remote(id);
  expect(await otherDevice.push([{ path: path(id), data: enc.encode(serialize({ ...r, deleted: true, updatedAt: Date.now() + 5000 })) }])).toBe(true);
  expect(await sync.now()).toBe(true);
  expect(notes.all.find((n) => n.id === id)!.deleted).toBe(true);
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
  await otherDevice.pull();
  expect(await otherDevice.push([{ path: path(day.id), data: enc.encode(serialize({ id: day.id, body: '# Jan 2\n\nwritten there', updatedAt: Date.now() + 5000, deleted: false, order: 0 })) }])).toBe(true);
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
  const w = whileWaitingOn(b, () => notes.update(a, '# Alpha\n\none\n\ntyped meanwhile'));
  try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
  expect(w.done).toBe(true);
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
  expect(await otherDevice.push([{ path: path(id), data: enc.encode(serialize({ ...r, deleted: true, updatedAt: Date.now() + 5000 })) }])).toBe(true);
  expect(await sync.now()).toBe(true);
  const trash = notes.all.filter((n) => n.deleted).map((n) => n.body).join('\n');
  expect(trash).toContain('written before deleting');
  expect(notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n')).not.toContain('written before deleting');
});

test('a key typed into a note while sync brings in its deletion from the other device: the words are kept as a copy', async () => {
  const [a, b] = [made('# Gamma\n\none'), made('# Delta\n\none')].sort();
  expect(await sync.now()).toBe(true);
  const ra = await remote(a);
  expect(await otherDevice.push([{ path: path(a), data: enc.encode(serialize({ ...ra, deleted: true, updatedAt: Date.now() + 5000 })) }])).toBe(true);
  await otherWrites(b, '# Delta\n\none\n\nthere');
  notes.update(b, '# Delta\n\none\n\nhere too');
  const w = whileWaitingOn(b, () => notes.update(a, '# Gamma\n\none\n\ntyped as it was deleted there'));
  try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
  expect(w.done).toBe(true);
  expect(notes.all.find((n) => n.id === a)!.deleted).toBe(true);
  expect(notes.all.filter((n) => !n.deleted).map((n) => n.body).join('\n')).toContain('typed as it was deleted there');
});

const copiesOf = (title: string) => notes.all.filter((n) => n.body.startsWith(`# ${title} (conflict copy)`));
const otherPuts = async (n: Note) => { await otherDevice.pull(); expect(await otherDevice.push([{ path: path(n.id), data: enc.encode(serialize(n)) }])).toBe(true); };
function whileWaitingOn(id: string, step: () => void) {
  const base = sync.settings.known[path(id)];
  const w = { done: false };
  duringFetch = (url, init) => { if (!w.done && url.endsWith(`/git/blobs/${base}`) && (init?.method ?? 'GET') === 'GET') { w.done = true; step(); } };
  return w;
}

test('deleted on both, erased for good here: the erased words do not come back as a copy, here or on GitHub', async () => {
  const id = made('# Secret\n\nerase me');
  expect(await sync.now()).toBe(true);
  await otherPuts({ ...(await remote(id)), deleted: true, updatedAt: Date.now() - 1000 });
  notes.remove(id);
  notes.erase([id]);
  expect(await sync.now()).toBe(true);
  expect(copiesOf('Secret')).toEqual([]);
  const head = await new Repo({ repo: 'o/r', token: 'tok', head: '', tree: '', known: {} }, gh.fetch).pull();
  expect(head.map((f) => dec.decode(f.data)).filter((t) => t.includes('erase me'))).toEqual([]);
});

test('erased here, deleted on the other device later: no empty copy in the Trash', async () => {
  const id = made('# Gone\n\nwords');
  expect(await sync.now()).toBe(true);
  notes.remove(id);
  notes.erase([id]);
  await otherPuts({ ...(await remote(id)), deleted: true, updatedAt: Date.now() + 5000 });
  const before = notes.trash.length;
  expect(await sync.now()).toBe(true);
  expect(notes.trash.length).toBe(before);
});

test('written here after the other device erased the note: no wordless copy in the Trash', async () => {
  const id = made('# Kept\n\nshared');
  expect(await sync.now()).toBe(true);
  await otherPuts({ ...(await remote(id)), deleted: true, body: '', updatedAt: Date.now() - 1000 });
  notes.update(id, '# Kept\n\nshared\n\nwritten here, later');
  const before = notes.trash.length;
  expect(await sync.now()).toBe(true);
  expect(notes.all.find((n) => n.id === id)!.deleted).toBe(false);
  expect(notes.trash.length).toBe(before);
});

test('deleted here without a word changed, written on the other device later: the note comes back, no copy', async () => {
  const id = made('# Plain\n\nsame');
  expect(await sync.now()).toBe(true);
  notes.remove(id);
  await otherWrites(id, '# Plain\n\nsame\n\nwritten there');
  expect(await sync.now()).toBe(true);
  expect(bodyOf(id)).toContain('written there');
  expect(copiesOf('Plain')).toEqual([]);
});

test('a day only opened on the other device (its template), written here: no copy of the template', async () => {
  const day = notes.dayNote('2031-03-04');
  const template = day.body;
  notes.update(day.id, template + '\n\nwritten here');
  await otherPuts({ id: day.id, body: template, updatedAt: 0, deleted: false, order: 0 });
  expect(await sync.now()).toBe(true);
  expect(bodyOf(day.id)).toContain('written here');
  expect(notes.all.filter((n) => n.body.includes('(conflict copy)') && n.body.includes('2031-03-04'))).toEqual([]);
});

test('signed out and in again: a day the other device wrote on since, untouched here, comes in with no copy', async () => {
  const day = notes.dayNote('2032-05-06');
  notes.update(day.id, day.body + '\n\nmorning');
  expect(await sync.now()).toBe(true);
  await otherWrites(day.id, bodyOf(day.id) + '\n\nevening, on the other device');
  sync.logout();
  sync.save({ user: 'o', repo: 'o/r', token: 'tok' });
  expect(await sync.now()).toBe(true);
  expect(bodyOf(day.id)).toContain('evening, on the other device');
  expect(notes.all.filter((n) => n.body.includes('(conflict copy)') && n.body.includes('2032-05-06'))).toEqual([]);
});

for (const [name, there] of [['the other device a little later', 5000], ['the other device half a minute earlier', -30_000]] as const) {
  test(`one line made two things on both devices, a key typed in it while sync waits (${name}): all three kept`, async () => {
    const [a, b] = [made(`# Budget ${there}\n\ntotal: 100`), made(`# Zed ${there}\n\none`)].sort();
    expect(await sync.now()).toBe(true);
    notes.update(a, `# Budget ${there}\n\ntotal: 120`);
    await otherPuts({ ...(await remote(a)), body: `# Budget ${there}\n\ntotal: 250`, updatedAt: Date.now() + there });
    await otherWrites(b, `# Zed ${there}\n\none\n\nthere`);
    notes.update(b, `# Zed ${there}\n\nhere\n\none`);
    const w = whileWaitingOn(b, () => notes.update(a, `# Budget ${there}\n\ntotal: 120\n\none more key`));
    try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
    expect(w.done).toBe(true);
    const all = await findable(a);
    for (const words of ['total: 120', 'one more key', 'total: 250']) expect(all).toContain(words);
  });
}

test('a day written on both before either synced, a key typed in it while sync waits: all three kept', async () => {
  const later = made('# Later\n\none');
  expect(await sync.now()).toBe(true);
  const day = notes.dayNote('2031-07-08');
  notes.update(day.id, day.body + '\n\nwritten here');
  await otherPuts({ id: day.id, body: '# Jul 8\n\nwritten there', updatedAt: Date.now() - 30_000, deleted: false, order: 0 });
  await otherWrites(later, '# Later\n\none\n\nthere');
  notes.update(later, '# Later\n\nhere\n\none');
  const w = whileWaitingOn(later, () => notes.update(day.id, bodyOf(day.id) + '\n\none more key'));
  try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
  expect(w.done).toBe(true);
  const all = await findable(day.id);
  for (const words of ['written here', 'one more key', 'written there']) expect(all).toContain(words);
});

test('typed into a note and deleted it while sync waits, the other device wrote in it: both kept', async () => {
  const [a, b] = [made('# Eps\n\none'), made('# Zeta\n\none')].sort();
  expect(await sync.now()).toBe(true);
  await otherWrites(a, '# Eps\n\none\n\nthere');
  await otherWrites(b, '# Zeta\n\none\n\nthere');
  notes.update(b, '# Zeta\n\nhere\n\none');
  const w = whileWaitingOn(b, () => { notes.update(a, '# Eps\n\none\n\ntyped then deleted'); notes.remove(a); });
  try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
  expect(w.done).toBe(true);
  const all = await findable(a);
  for (const words of ['typed then deleted', 'there']) expect(all).toContain(words);
});

test('keys typed into a long open note while sync waits, still on their way from the editor: kept, with the other device\'s', async () => {
  allowFocusLoss();
  const long = '# Long\n\n' + Array.from({ length: 400 }, (_, i) => `Paragraph ${i} with some words in it.`).join('\n\n');
  const [a, b] = [made('# A long one\n\nx'), made('# B long one\n\none')].sort();
  notes.update(a, long);
  notes.flush(a);
  expect(await sync.now()).toBe(true);
  await otherWrites(a, long.replace('Paragraph 3 with', 'Paragraph 3 (changed there) with'));
  await otherWrites(b, '# B long one\n\none\n\nthere');
  notes.update(b, '# B long one\n\nhere\n\none');
  const target = document.createElement('div');
  document.body.append(target);
  mount(Editor, { target, props: { note: notes.all.find((n) => n.id === a)! } });
  flushSync();
  const ed = (window as unknown as { __editor: import('@tiptap/core').Editor }).__editor;
  ed.commands.focus('end');
  const w = whileWaitingOn(b, () => typeIn(ed, ' TYPEDMEANWHILE'));
  try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
  expect(w.done).toBe(true);
  flushSync();
  await tick();
  await new Promise((r) => setTimeout(r, 400));
  expect(await sync.now()).toBe(true);
  for (const body of [bodyOf(a), (await remote(a)).body]) {
    expect(body).toContain('TYPEDMEANWHILE');
    expect(body).toContain('(changed there)');
  }
  target.remove();
});

test('a day here still only its template, the other device\'s written day arrives, a key typed here while sync waits: both kept', async () => {
  const later = made('# After\n\none');
  expect(await sync.now()).toBe(true);
  const day = notes.dayNote('2031-09-10');
  await otherPuts({ id: day.id, body: '# Sep 10\n\nwritten there', updatedAt: Date.now() - 30_000, deleted: false, order: 0 });
  await otherWrites(later, '# After\n\none\n\nthere');
  notes.update(later, '# After\n\nhere\n\none');
  const w = whileWaitingOn(later, () => notes.update(day.id, bodyOf(day.id) + '\n\ntyped here meanwhile'));
  try { expect(await sync.now()).toBe(true); } finally { duringFetch = null; }
  expect(w.done).toBe(true);
  const all = await findable(day.id);
  for (const words of ['written there', 'typed here meanwhile']) expect(all).toContain(words);
});
