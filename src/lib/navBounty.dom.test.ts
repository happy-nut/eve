// The list's and tabs' finds of the third UI bounty
import { test, expect, beforeEach } from 'vitest';
import { notes, CALENDAR } from './notes.svelte';
import { appearance } from './appearance.svelte';
import { tabs } from './tabs.svelte';
import { holdEdit, dropEdit } from './pending';

beforeEach(() => { tabs.list = []; });

test('Back right after a long edit in a new note keeps the note and what was written (it went, empty)', () => {
  const old = notes.create('# Old\n\nx'); notes.touched(old.id);
  notes.currentId = old.id;
  const n = notes.create('');
  notes.currentId = n.id;
  // a long note's last keys, still waiting in the editor to be handed over
  const flush = () => { dropEdit(flush); notes.update(n.id, '# Long\n\nwritten'); };
  holdEdit(flush);
  notes.back();
  const after = notes.all.find((x) => x.id === n.id)!;
  expect(after.deleted).toBe(false);
  expect(after.body).toContain('written');
});

test('the note in front deleted with another tab beside it, then Undo: both tabs, as they were', () => {
  const a = notes.create('# A\n\nx'), b = notes.create('# B\n\nx'); notes.touched(a.id); notes.touched(b.id);
  const go = (id: string) => { const prev = notes.currentId; notes.currentId = id; tabs.follow(prev); };
  go(a.id); tabs.open(b.id); tabs.follow(a.id); go(a.id);
  expect(tabs.list.map((t) => t.id)).toEqual([a.id, b.id]);
  notes.remove(a.id); tabs.follow(a.id);
  const undo = () => { const prev = notes.currentId; notes.restore(a.id); notes.currentId = a.id; tabs.follow(prev); };
  undo();
  expect(tabs.list.map((t) => t.id)).toEqual([a.id, b.id]);
});

test('Daily notes turned off: the calendar\'s tab closes (it stayed, and opened nothing)', () => {
  appearance.set({ dailyNotes: true });
  const a = notes.create('# A\n\nx'); notes.touched(a.id);
  const go = (id: string) => { const prev = notes.currentId; notes.currentId = id; tabs.follow(prev); };
  go(a.id); tabs.open(CALENDAR); tabs.follow(a.id); go(a.id);
  expect(tabs.list.map((t) => t.id)).toContain(CALENDAR);
  appearance.set({ dailyNotes: false });
  tabs.follow(a.id);
  expect(tabs.list.map((t) => t.id)).not.toContain(CALENDAR);
});

test('a group renamed or deleted, then taken back: the same row (its identity), so the keyboard stays on it', async () => {
  const { groups } = await import('./groups.svelte');
  const { history } = await import('./history.svelte');
  const g = groups.create('');
  const id = groups.id(g);
  history.clear();
  groups.rename(g, 'Renamed');
  await Promise.resolve();
  expect(history.undo()).toBe(true);
  expect(groups.id(g)).toBe(id);
  // deleted, and its Undo
  groups.remove(g);
  await Promise.resolve();
  expect(history.undo()).toBe(true);
  expect(groups.id(g)).toBe(id);
});
