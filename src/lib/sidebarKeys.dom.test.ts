// The list from the keyboard (⌘\), as a tree is walked in Finder or any file list: → on a page whose notes are shown
// goes down to the first of them. It went over into the open note's text instead — not even the row's own note —
// and the keyboard left the list for a note the user had not been looking at.
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from '../Sidebar.svelte';
import { notes } from './notes.svelte';
import { tree } from './tree.svelte';

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];
Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };
let app: ReturnType<typeof mount> | null = null;
afterEach(() => { if (app) unmount(app); app = null; document.body.innerHTML = ''; });

const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const on = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-note]')?.dataset.note;

test('→ on an open page goes to the first note under it; on a folded one it opens it first', async () => {
  const open = notes.addImported('# Reading\n\nnow\n');
  const team = notes.addImported('# Team\n\npeople\n');
  const bo = notes.addImported('# Bo\n\nbo\n', Date.now(), team.id);
  notes.addImported('# Cy\n\ncy\n', Date.now(), team.id);
  notes.currentId = open.id;
  app = mount(Sidebar, { target: document.body, props: { open: true, searchEl: null, cmdHeld: false, onSettings: () => {}, onNew: () => {} } });
  flushSync(); await new Promise((r) => setTimeout(r, 0));
  document.querySelector<HTMLElement>(`aside [data-note="${team.id}"]`)!.focus();
  key('ArrowRight');
  flushSync(); await new Promise((r) => setTimeout(r, 0));
  expect(on()).toBe(bo.id);
  // ← goes back up to the page, ← again folds it, → opens it and stays on it, → again goes in
  key('ArrowLeft'); flushSync(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  expect(on()).toBe(team.id);
  key('ArrowLeft'); flushSync(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  expect(tree.isFolded(team.id)).toBe(true);
  key('ArrowRight'); flushSync(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  expect(on()).toBe(team.id);
  expect(tree.isFolded(team.id)).toBe(false);
  key('ArrowRight'); flushSync(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  expect(on()).toBe(bo.id);
});
