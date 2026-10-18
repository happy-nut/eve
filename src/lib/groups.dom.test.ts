import { test, expect } from 'vitest';
import { groups } from './groups.svelte';
import { appearance } from './appearance.svelte';
import { notes } from './notes.svelte';

// a note written in: one left just as it was made goes once another is opened (notes.untouched)
const written = (body: string, group: string, parent?: string) => { const n = notes.create(body, group, parent); notes.touched(n.id); return n; };

test('a new group gets a random icon, as a new note does, unless the setting is off', () => {
  appearance.set({ autoIcon: true });
  const a = groups.create();
  expect(groups.icon(a)).not.toBe('');
  appearance.set({ autoIcon: false });
  const b = groups.create();
  expect(groups.icon(b)).toBe('');
});

test('revealing a note opens the groups around it and unfolds the pages it sits under, and nothing else', async () => {
  const { notes } = await import('./notes.svelte');
  const outer = groups.create(), inner = groups.create(outer), other = groups.create();
  const page = written('# Page\n', inner);
  const sub = written('# Sub\n', inner, page.id);
  groups.toggle(outer); groups.toggle(inner); groups.toggle(other); groups.fold(page.id);
  groups.reveal(sub.id);
  expect([groups.isCollapsed(outer), groups.isCollapsed(inner), groups.isFolded(page.id)]).toEqual([false, false, false]);
  expect(groups.isCollapsed(other)).toBe(true);
  expect(groups.visibleOrdered().some((n) => n.id === sub.id)).toBe(true);
});

test('deleting a group keeps its notes in their order, a sub-page still under its page', async () => {
  const { notes } = await import('./notes.svelte');
  const g = groups.create();
  const one = written('# One\n', g);
  const two = written('# Two\n', g, one.id); // a sub-page of One
  const three = written('# Three\n', g);
  const before = groups.pagesIn(g).map((n) => n.id); // as the list shows them
  groups.remove(g);
  const after = groups.pagesIn('').map((n) => n.id).filter((id) => before.includes(id));
  expect(after).toEqual(before);
  expect(before).toContain(three.id);
  expect(notes.all.find((n) => n.id === two.id)?.parent).toBe(one.id);
});

test("a deleted group's Undo puts back the groups, their folds and icons, and every note where it stood", () => {
  appearance.set({ autoIcon: true });
  const top = written('# Top note\n', '');
  const g = groups.create(), inner = groups.create(g);
  groups.setIcon(inner, '🧪');
  groups.toggle(inner);
  const one = written('# One\n', g);
  const sub = written('# One sub\n', g, one.id);
  const deep = written('# Deep\n', inner);
  const names = [...groups.names], key = groups.id(inner);
  const spot = () => notes.all.filter((n) => !n.deleted).map((n) => `${n.id}:${n.group}:${n.parent ?? ''}:${n.order}`).sort();
  const before = spot();
  const undo = groups.remove(g);
  expect(groups.names.includes(g)).toBe(false);
  expect(notes.all.find((n) => n.id === deep.id)?.group).toBe('');
  undo();
  expect(groups.names).toEqual(names);
  expect([groups.icon(inner), groups.isCollapsed(inner), groups.id(inner)]).toEqual(['🧪', true, key]);
  expect(spot()).toEqual(before);
  expect(notes.all.find((n) => n.id === sub.id)?.parent).toBe(one.id);
  expect(top.group).toBe('');
});
