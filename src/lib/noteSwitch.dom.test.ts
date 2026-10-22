// Switching notes (⌘1–9, ⌘N, back/forward, deleting the open one) and what it does to what was open.
import { test, expect } from 'vitest';
import { flushSync } from 'svelte';
import { notes, rankByTitle } from './notes.svelte';
import { holdEdit, dropEdit } from './pending';
import { groups } from './groups.svelte';

// a note written in: one left just as it was made goes once another is opened (notes.untouched)
const written = (body: string, group?: string) => { const n = notes.create(body, group); notes.touched(n.id); return n; };

test('keys still on their way from an editor are handed over before the note switches', () => {
  const a = notes.create('# A\n');
  const b = notes.create('# B\n');
  notes.currentId = a.id;
  let seenOn: string | null = null;
  const flush = () => { seenOn = notes.currentId; dropEdit(flush); };
  holdEdit(flush); // a board's card (or a long note) with its last keys not yet written
  notes.currentId = b.id;
  expect(seenOn).toBe(a.id); // handed over while the board was still the open note
});

test('deleting the open note opens the one next to it in the list, not one in a folded group', () => {
  for (const n of notes.all) n.deleted = true; // a list of just these
  const g = groups.create();
  const [a, b, c] = ['Alpha', 'Bravo', 'Charlie'].map((t, i) => Object.assign(written(`# ${t}\n`, ''), { order: 10 + i }));
  const w = Object.assign(written('# Work\n', g), { order: -5 }); // lowest rank of all, tucked away in a folded group
  groups.toggle(g);
  notes.currentId = b.id;
  notes.remove(b.id);
  expect(notes.currentId).toBe(c.id); // the row below
  notes.remove(c.id);
  expect(notes.currentId).toBe(a.id); // the last one: the row above
  notes.remove(a.id);
  expect(notes.currentId).toBe(w.id); // nothing else left but what the folded group holds
});

test("the first note is the list's first as it shows it, not the lowest rank", () => {
  for (const n of notes.all) n.deleted = true;
  const g = groups.create();
  const a = Object.assign(written('# Alpha\n', ''), { order: 10 });
  Object.assign(written('# Work\n', g), { order: -5 });
  groups.toggle(g);
  expect(notes.firstPage()?.id).toBe(a.id);
});

test('a [[link]] written with a title as it read before (my_func was "myfunc") opens that page, not a new one', () => {
  for (const [body, old] of [['# my_func\n\nx\n', 'myfunc'], ['# Energy $E=mc^2$\n\nx\n', 'Energy $E=mc^2$']]) {
    const { id } = notes.create(body);
    const count = notes.all.length;
    notes.openByTitle(old);
    expect(notes.currentId).toBe(id);
    expect(notes.all.length).toBe(count);
  }
});

test('a new note left as it was made goes once another opens; one written in, or brought by sync, stays', () => {
  const kept = written('# Kept\n');
  const blank = notes.create(); // ⌘N
  const linked = notes.create('# Someday\n\n'); // a [[Someday]] clicked with no page by that name
  expect(notes.all.find((n) => n.id === blank.id)?.deleted).toBe(true); // ⌘N again: the first one is not kept
  expect(notes.currentId).toBe(linked.id);
  notes.currentId = kept.id;
  expect(notes.all.find((n) => n.id === linked.id)?.deleted).toBe(true);
  const typed = notes.create();
  notes.update(typed.id, 'Groceries');
  notes.currentId = kept.id;
  expect(notes.all.find((n) => n.id === typed.id)?.deleted).toBe(false);
  // back over a note gone like that is not a place to go
  const fresh = notes.create();
  notes.back();
  expect(notes.all.find((n) => n.id === fresh.id)?.deleted).toBe(true);
  expect(notes.currentId).not.toBe(fresh.id);
  // the same id coming in from another device is that device's note, not this session's blank one
  const synced = notes.create();
  notes.mergeRemote([{ ...notes.all.find((n) => n.id === synced.id)!, body: '', updatedAt: Date.now() + 1000 }]);
  notes.currentId = kept.id;
  expect(notes.all.find((n) => n.id === synced.id)?.deleted).toBe(false);
});

test('deleting the last note makes a new one, and its Undo brings the note back over that one without a loop', async () => {
  const { ui } = await import('./ui.svelte');
  for (const n of notes.all) n.deleted = true;
  const only = written('# Only\n');
  notes.currentId = only.id;
  notes.remove(only.id);
  const made = notes.current!;
  expect(made.id).not.toBe(only.id); // none left: a new one, open
  expect(made.deleted).toBe(false);
  expect(ui.toastMsg?.message).toBe('Deleted “Only”');
  expect(ui.toastMsg?.action?.label).toBe('Undo');
  ui.toastAction();
  expect(ui.toastMsg).toBe(null);
  const back = notes.all.find((n) => n.id === only.id)!;
  expect(back.deleted).toBe(false);
  expect(notes.currentId).toBe(only.id);
  expect(notes.all.find((n) => n.id === made.id)?.deleted).toBe(true); // the stand-in, never written in, went
  expect(notes.visible.map((n) => n.id)).toEqual([only.id]);
});

test('back and forward are lit only when there is a note left to go to', () => {
  const a = written('# A back\n'), b = written('# B back\n'), c = written('# C back\n');
  notes.currentId = a.id; notes.currentId = b.id; notes.currentId = c.id;
  expect(notes.canBack).toBe(true);
  for (const n of notes.all) if (n.id !== c.id) n.deleted = true;
  expect(notes.canBack).toBe(false); // everything behind it deleted: the button did nothing
  notes.back();
  expect(notes.currentId).toBe(c.id);
  notes.all.find((n) => n.id === a.id)!.deleted = false;
  expect(notes.canBack).toBe(true);
  notes.back();
  expect(notes.currentId).toBe(a.id);
  expect(notes.canForward).toBe(true);
});

test('search matches: the title as typed, then titles starting with it, then titles holding it, then the rest', () => {
  const list = ['# Reading list\n\nplan', '# Plan\n', '# My plan B\n', '# Plans\n', '# Notes\n\nthe plan', '# Plan\n\ncopy'].map((body) => ({ body }));
  expect(rankByTitle(list, 'plan').map((n) => n.body.split('\n')[0])).toEqual(['# Plan', '# Plan', '# Plans', '# My plan B', '# Reading list', '# Notes']);
});

test('a [[link]] watching the titles hears of a page made, renamed and deleted, and not of other edits', () => {
  let runs = 0;
  const stop = notes.onTitles(() => runs++);
  expect(runs).toBe(1);
  const p = written('# Watched page\n');
  flushSync();
  expect(runs).toBe(2);
  notes.update(p.id, '# Watched page\n\nbody text');
  flushSync();
  expect(runs).toBe(2);
  notes.update(p.id, '# Watched, renamed\n\nbody text');
  flushSync();
  expect(runs).toBe(3);
  notes.remove(p.id);
  flushSync();
  expect(runs).toBe(4);
  stop();
  written('# After stop\n');
  flushSync();
  expect(runs).toBe(4);
});

test("a phone's back from a new note left unwritten takes it out of the list; from a written one, nothing changes", () => {
  const a = written('# Phone A\n');
  notes.currentId = a.id;
  const blank = notes.create(); // the phone's +
  notes.letGo(); // …then back to the list
  expect(notes.all.find((n) => n.id === blank.id)?.deleted).toBe(true);
  expect(notes.current?.deleted).toBe(false);
  const was = notes.currentId;
  notes.letGo();
  expect(notes.currentId).toBe(was);
});
