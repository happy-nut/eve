import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from '../Sidebar.svelte';
import { sync } from './sync.svelte';

let app: ReturnType<typeof mount> | null = null;
const before = { ...sync.settings };
afterEach(() => { if (app) unmount(app); app = null; document.body.innerHTML = ''; Object.assign(sync.settings, before); sync.status = 'idle'; });

const label = () => {
  app = mount(Sidebar, { target: document.body, props: { open: true, searchEl: null, cmdHeld: false, onSettings: () => {}, onNew: () => {} } });
  flushSync();
  return document.body.textContent ?? '';
};

test('sync just turned on, before its first round, does not say synced', () => {
  Object.assign(sync.settings, { repo: 'o/r', token: 't', lastSynced: 0 });
  expect(label()).toContain('not synced yet');
});

test('a sync that went through says synced, also once the app is opened again', () => {
  Object.assign(sync.settings, { repo: 'o/r', token: 't', lastSynced: 1_700_000_000_000 });
  const text = label();
  expect(text).toMatch(/\bsynced\b/);
  expect(text).not.toContain('not synced yet');
});
