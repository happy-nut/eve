// Notion's desktop tabs: the front tab follows the open note; new, close, reopen, step, pin; a deleted note's tab goes
import { test, expect, beforeEach } from 'vitest';
import { notes } from './notes.svelte';
import { tabs } from './tabs.svelte';

const make = (title: string) => { const n = notes.create(`# ${title}\n\nx`); notes.touched(n.id); return n.id; };
// as App's effect does: every change of the open note is followed
const go = (id: string) => { const prev = notes.currentId; notes.currentId = id; tabs.follow(prev); };
const row = () => tabs.list.map((t) => notes.all.find((n) => n.id === t.id)!.body.split('\n')[0].slice(2) + (t.pinned ? '*' : ''));

beforeEach(() => { tabs.list = []; });

test('the front tab follows the note opened; a note opened in a new tab is beside it, and both stay', () => {
  const a = make('A'), b = make('B'), c = make('C');
  go(a);
  expect(row()).toEqual(['A']);
  go(b); // the list, a link: the same tab shows B
  expect(row()).toEqual(['B']);
  tabs.open(c); tabs.follow(b);
  expect(row()).toEqual(['B', 'C']);
  expect(notes.currentId).toBe(c);
  go(a); // from C's tab: that tab now shows A
  expect(row()).toEqual(['B', 'A']);
  tabs.open(b); tabs.follow(a); // already in a tab: it comes to front, no second tab
  expect(row()).toEqual(['B', 'A']);
  expect(notes.currentId).toBe(b);
});

test('⌘W closes the front tab and the one beside it comes up; ⌘⇧T brings it back; the last tab is not closed', () => {
  const a = make('A2'), b = make('B2'), c = make('C2');
  go(a); tabs.open(b); tabs.open(c); tabs.follow(b);
  expect(tabs.close()).toBe(true);
  expect(row()).toEqual(['A2', 'B2']);
  expect(notes.currentId).toBe(b);
  expect(tabs.reopen()).toBe(true);
  expect(row()).toEqual(['A2', 'B2', 'C2']);
  expect(notes.currentId).toBe(c);
  tabs.closeOthers(2);
  expect(row()).toEqual(['C2']);
  expect(tabs.close()).toBe(false);
});

test('⌃Tab steps round the row; a pinned tab moves to the front and ⌘W leaves it', () => {
  const a = make('A3'), b = make('B3'), c = make('C3');
  go(a); tabs.open(b); tabs.open(c);
  tabs.step(1);
  expect(notes.currentId).toBe(a);
  tabs.step(-1);
  expect(notes.currentId).toBe(c);
  tabs.pin(2, true);
  expect(row()).toEqual(['C3*', 'A3', 'B3']);
  expect(tabs.close(0)).toBe(false);
  const d = make('D3');
  go(d); // a note opened from the pinned tab opens in a tab of its own: the pinned one keeps its note
  expect(row()).toEqual(['C3*', 'A3', 'B3', 'D3']);
  tabs.pin(0, false);
  expect(row()).toEqual(['C3', 'A3', 'B3', 'D3']);
});

test("a tab whose note is deleted goes; the open note's own tab follows it to the note opened instead", () => {
  const a = make('A4'), b = make('B4');
  go(a); tabs.open(b); tabs.follow(a);
  notes.remove(a);
  tabs.follow(b);
  expect(row()).toEqual(['B4']);
  const c = make('C4');
  go(c);
  notes.remove(c); // the open note deleted: the next one opens, in its tab
  tabs.follow(c);
  expect(tabs.list.map((t) => t.id)).toEqual([notes.currentId]);
});
