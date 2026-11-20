import { test, expect, vi, afterEach } from 'vitest';
import { appearance } from './appearance.svelte';
import { shortcuts } from './shortcuts.svelte';
import { hints } from './hints.svelte';
import { sync } from './sync.svelte';
import { tree } from './tree.svelte';
import { saved } from './stored';

afterEach(() => vi.restoreAllMocks());

const storageFull = () => vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });

test.each([
  ['a setting turned', () => appearance.set({ weight: 500 })],
  ['a key rebound', () => shortcuts.set('bold', 'Mod-Shift-b')],
  ['keys put back', () => shortcuts.reset()],
  ['tips turned off', () => hints.setOn(false)],
  ['a sync setting', () => sync.save({ lastSynced: 1 })],
  ['a page folded', () => tree.fold('a')],
])('storage full: %s still happens, with no error', (_what, change) => {
  storageFull();
  expect(change).not.toThrow();
});

test('what was saved comes back; nothing saved, unreadable or storage shut gives the fallback', () => {
  localStorage.setItem('eve.test', JSON.stringify({ a: 1 }));
  expect(saved('eve.test', {})).toEqual({ a: 1 });
  expect(saved('eve.none', [])).toEqual([]);
  localStorage.setItem('eve.test', '{broken');
  expect(saved('eve.test', 7)).toBe(7);
  localStorage.setItem('eve.test', 'null');
  expect(saved('eve.test', 'x')).toBe('x');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('shut'); });
  expect(saved('eve.test', 3)).toBe(3);
});
