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
