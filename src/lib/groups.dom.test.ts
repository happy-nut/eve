import { test, expect } from 'vitest';
import { groups } from './groups.svelte';
import { appearance } from './appearance.svelte';

test('a new group gets a random icon, as a new note does, unless the setting is off', () => {
  appearance.set({ autoIcon: true });
  const a = groups.create();
  expect(groups.icon(a)).not.toBe('');
  appearance.set({ autoIcon: false });
  const b = groups.create();
  expect(groups.icon(b)).toBe('');
});

test('deleting a group keeps its notes in their order, a sub-page still under its page', async () => {
  const { notes } = await import('./notes.svelte');
  const g = groups.create();
  const one = notes.create('# One\n', g);
  const two = notes.create('# Two\n', g, one.id); // a sub-page of One
  const three = notes.create('# Three\n', g);
  const before = groups.pagesIn(g).map((n) => n.id); // as the list shows them
  groups.remove(g);
  const after = groups.pagesIn('').map((n) => n.id).filter((id) => before.includes(id));
  expect(after).toEqual(before);
  expect(before).toContain(three.id);
  expect(notes.all.find((n) => n.id === two.id)?.parent).toBe(one.id);
});
