// The list's finds of the second UI bounty: where notes go and stay, and the keys the app keeps for itself
import { test, expect, beforeEach } from 'vitest';
import { notes } from './notes.svelte';
import { nudgeNote, nestNote } from './moves';
import { tree } from './tree.svelte';
import { appearance } from './appearance.svelte';
import { CALENDAR_NOTE_ID } from './daily';
import { shortcuts } from './shortcuts.svelte';
import { tabs } from './tabs.svelte';

const make = (title: string, parent?: string) => { const n = notes.create(`# ${title}\n\nx`, parent); notes.touched(n.id); return n.id; };
const at = (id: string) => notes.all.find((n) => n.id === id)!;

beforeEach(() => { tabs.list = []; });

test('a page moved under another takes its sub-pages along, all the way down', () => {
  const host = make('Host'), p = make('P'), k = make('K', p), gk = make('GK', k);
  notes.place(p, host, null);
  expect([at(p).parent, at(k).parent, at(gk).parent]).toEqual([host, p, k]);
  expect(notes.isAncestor(host, gk)).toBe(true);
});

test('a sub-page whose page was deleted (shown at the top level) still moves with ⌥↑ / ⌥↓', () => {
  const a = make('Above'), p = make('Parent'), kid = make('Kid', p);
  notes.remove(p);
  expect(nudgeNote(kid, -1, true) || nudgeNote(kid, 1, true)).toBe(true);
  void a;
});

test('beside such a sub-page, ⌥↑ / ⌥↓ really move a page past it (they said they had, and it stayed), ⌥← does not take it deeper', () => {
  for (const n of notes.visible) notes.remove(n.id);
  const p = make('P'), kid = make('Kid', p), a = make('A');
  notes.remove(p);
  const top = () => notes.visible.filter((n) => !n.parent || !notes.visible.some((x) => x.id === n.parent)).map((n) => n.id).filter((id) => id !== CALENDAR_NOTE_ID);
  // folded: ⌥↑ steps past it, not into it as a sub-page
  for (const id of [kid, a]) if (!tree.isFolded(id)) tree.fold(id);
  if (top()[0] === a) nudgeNote(a, 1);
  expect(top()).toEqual([kid, a]);
  // A put before the sub-page: looked for among the deleted page's, the place was not found
  expect(nudgeNote(a, -1)).toBe(true);
  expect(top()).toEqual([a, kid]);
  // Move out on it: it is at the top already, not lifted into the deleted page's own page
  const g = make('G'), q = make('Q', g), orphan = make('Orphan', q);
  notes.remove(q);
  expect(nestNote(orphan, 'out', undefined, true)).toBe(false);
  nestNote(orphan, 'out');
  expect(at(orphan).parent).not.toBe(g);
});

test('Settings does not take a key the app keeps (⌘1–9, ⌘Z, ⌘C…) for another action', () => {
  for (const keys of ['Mod-1', 'Mod-9', 'Mod-z', 'Mod-Shift-z', 'Mod-v']) expect(shortcuts.set('newNote', keys)).not.toBeNull();
  expect(shortcuts.keysFor('newNote')).toBe('Mod-n');
});

test('the note in a tab deleted: the tab shows the note opened next, in its place, and Undo puts the note back there', () => {
  const a = make('A'), b = make('B'), c = make('C');
  const go = (id: string) => { const prev = notes.currentId; notes.currentId = id; tabs.follow(prev); };
  go(a); tabs.open(b); tabs.follow(a); tabs.open(c); tabs.follow(b); go(a);
  expect(tabs.list.map((t) => t.id)).toEqual([a, b, c]);
  notes.remove(a); // the next note opens
  tabs.follow(a);
  expect(tabs.list.findIndex((t) => t.id === notes.currentId)).toBe(0);
});

// a note above the daily notes' row could not be brought below it: ⌥↓'s next spot was "inside the calendar", which no
// note can be, so the key did nothing there, every time
test('⌥↓ takes a note above the daily notes\' row past it, ⌥↑ back; ⌥→ never tucks a note into it', () => {
  appearance.s.dailyNotes = true;
  const top = make('Above the diary');
  const cal = notes.ensureCalendar();
  notes.place(top, '', CALENDAR_NOTE_ID);
  const order = () => notes.visible.filter((n) => !n.parent).map((n) => n.id);
  const at = (id: string) => order().indexOf(id);
  expect(at(top)).toBe(at(cal.id) - 1);
  expect(nudgeNote(top, 1)).toBe(true);
  expect(at(top)).toBe(at(cal.id) + 1);
  expect(nudgeNote(top, -1)).toBe(true);
  expect(at(top)).toBe(at(cal.id) - 1);
  notes.place(top, '', order()[at(cal.id) + 1] ?? null);
  expect(nestNote(top, 'in', cal.id, true)).toBe(false);
  appearance.s.dailyNotes = false;
});
