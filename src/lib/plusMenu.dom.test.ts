// The + (the window's toolbar, ⌘N in the list): what can be made, and where. From the note being read, a page under it is
// one of the choices — it was only offered with that note's row focused in the list, so + from the note never had it.
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from '../Sidebar.svelte';
import { notes, titleOf } from './notes.svelte';
import { ui, hooks } from './ui.svelte';

let app: ReturnType<typeof mount> | null = null;
afterEach(() => { ui.closeMenu(); if (app) unmount(app); app = null; document.body.innerHTML = ''; });

test('+ from the open note offers a new page inside it, and that page goes under it', () => {
  const page = notes.create('# Reading\n');
  notes.touched(page.id);
  notes.currentId = page.id;
  app = mount(Sidebar, { target: document.body, props: { open: false, searchEl: null, cmdHeld: false, onSettings: () => {}, onNew: () => {} } });
  flushSync();
  hooks.openPlus!();
  flushSync();
  const item = ui.menu!.items.find((i) => i.label === `New page in “${titleOf(page)}”`);
  expect(item).toBeTruthy();
  item!.run!();
  flushSync();
  expect(notes.current!.parent).toBe(page.id);
});
