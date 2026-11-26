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

test('a row\'s icon is a button of its own beside the row, and clicking it picks an icon without opening the note', async () => {
  const { ui } = await import('./ui.svelte');
  const open = notes.addImported('# Here\n\nnow\n');
  const other = notes.addImported('# There\n\nthen\n');
  notes.currentId = open.id;
  app = mount(Sidebar, { target: document.body, props: { open: true, searchEl: null, cmdHeld: false, onSettings: () => {}, onNew: () => {} } });
  flushSync(); await new Promise((r) => setTimeout(r, 0));
  expect(document.querySelectorAll('aside button button')).toHaveLength(0);
  const icon = document.querySelector(`aside .note-row:has([data-note="${other.id}"]) .ico-slot`)!;
  expect(icon.tagName).toBe('BUTTON');
  (icon as HTMLElement).click();
  expect(ui.emoji).not.toBeNull();
  expect(notes.currentId).toBe(open.id);
  expect(document.activeElement).toBe(document.querySelector(`aside [data-note="${other.id}"]`));
  ui.emojiDone(null);
});

test('Esc in the search is the layers\' Esc: what was typed goes, the keyboard goes to the note, and nothing under it hears it', async () => {
  const { ui } = await import('./ui.svelte');
  const main = document.body.appendChild(document.createElement('main'));
  main.innerHTML = '<div class="tiptap" tabindex="0" contenteditable="true"></div>';
  app = mount(Sidebar, { target: document.body, props: { open: true, searchEl: null, cmdHeld: false, onSettings: () => {}, onNew: () => {} } });
  flushSync();
  const field = document.querySelector<HTMLInputElement>('aside .search input')!;
  field.focus();
  ui.search = 'pla';
  flushSync();
  expect(ui.layers.top?.id).toBe('search');
  expect(key('Escape')).toBe(true);
  expect(ui.layers.escape()).toBe(true);
  flushSync();
  expect(ui.search).toBe('');
  expect(document.activeElement).toBe(main.querySelector('.tiptap'));
  expect(ui.layers.has('search')).toBe(false);
});

test('a row clicked with the mouse opens its note and keeps the keyboard on the row; Enter on it goes into the note; a click on the list\'s blank puts the keyboard on the open row', async () => {
  const { ui } = await import('./ui.svelte');
  const open = notes.addImported('# Here\n\nnow\n');
  const other = notes.addImported('# There\n\nthen\n');
  notes.currentId = open.id;
  const main = document.body.appendChild(document.createElement('main'));
  main.innerHTML = '<div class="tiptap" tabindex="0"></div>';
  app = mount(Sidebar, { target: document.body, props: { open: true, searchEl: null, cmdHeld: false, onSettings: () => {}, onNew: () => {} } });
  flushSync(); await new Promise((r) => setTimeout(r, 0));
  const row = (id: string) => document.querySelector<HTMLElement>(`aside [data-note="${id}"]`)!;
  const text = main.querySelector<HTMLElement>('.tiptap')!;
  text.focus();

  row(other.id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  flushSync(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  expect(notes.currentId).toBe(other.id);
  expect(document.activeElement).toBe(row(other.id));
  expect(ui.focusOwner).toBe('sidebar');

  row(open.id).focus();
  row(open.id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  flushSync(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  expect(notes.currentId).toBe(open.id);
  expect(document.activeElement).toBe(text);

  const blank = document.querySelector<HTMLElement>('aside ul.tree')!;
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 });
  blank.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(row(open.id));
});
