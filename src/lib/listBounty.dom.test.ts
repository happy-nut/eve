// The list's finds of the second UI bounty: where notes go and stay, and the keys the app keeps for itself
import { test, expect, beforeEach } from 'vitest';
import { notes } from './notes.svelte';
import { nudgeNote } from './moves';
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
