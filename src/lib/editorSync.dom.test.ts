// The open note's editor while sync, or just opening it, touches its body.
import { test, expect } from 'vitest';
import { mount, flushSync, tick } from 'svelte';
import './testEditor';
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
import Editor from '../Editor.svelte';
import { notes } from './notes.svelte';
import { ui } from './ui.svelte';
import { type } from './testEditor';

function open(note: any) {
  const target = document.createElement('div');
  document.body.append(target);
  mount(Editor, { target, props: { note } });
  flushSync();
  return (window as any).__editor;
}

test('an edit from the phone merged while the note is focused survives the next keystroke', async () => {
  const { id } = notes.create('# Shopping\n\nmilk\n');
  const n = notes.all.find((x) => x.id === id)!; // the store's own, as App hands it over
  const ed = open(n);
  ed.view.dom.setAttribute('tabindex', '0');
  ed.view.focus();
  notes.mergeRemote([{ ...n, body: '# Shopping\n\nmilk\n\neggs (added on phone)\n', updatedAt: Date.now() + 1000 }], true);
  flushSync();
  await tick();
  ed.commands.focus('end');
  type(ed, '!');
  const body = notes.all.find((x) => x.id === n.id)!.body;
  expect(body).toContain('eggs');
  expect(body).toContain('!');
});

test('opening a note does not rewrite it or date it now', async () => {
  const old = Date.UTC(2025, 0, 1);
  const body = '# Plan\n\nfirst line\nsecond line\n\n* a\n* b\n';
  notes.mergeRemote([{ id: 'remote1', body, updatedAt: old, deleted: false, group: '', order: 0 } as any]);
  ui.focusOwner = 'sidebar';
  const n = notes.all.find((x) => x.id === 'remote1')!;
  const ed = open(n);
  await tick();
  let got = notes.all.find((x) => x.id === 'remote1')!;
  expect(got.updatedAt).toBe(old);
  expect(got.body).toBe(body);
  // writing in it still saves
  ed.commands.focus('end');
  type(ed, 'c');
  got = notes.all.find((x) => x.id === 'remote1')!;
  expect(got.body).toContain('c');
  expect(got.updatedAt).toBeGreaterThan(old);
});
