// Switching notes (⌘1–9, ⌘N, back/forward, deleting the open one) and what it does to what was open.
import { test, expect } from 'vitest';
import { notes } from './notes.svelte';
import { holdEdit, dropEdit } from './pending';
import { groups } from './groups.svelte';

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
  const [a, b, c] = ['Alpha', 'Bravo', 'Charlie'].map((t, i) => Object.assign(notes.create(`# ${t}\n`, ''), { order: 10 + i }));
  const w = Object.assign(notes.create('# Work\n', g), { order: -5 }); // lowest rank of all, tucked away in a folded group
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
  const a = Object.assign(notes.create('# Alpha\n', ''), { order: 10 });
  Object.assign(notes.create('# Work\n', g), { order: -5 });
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
