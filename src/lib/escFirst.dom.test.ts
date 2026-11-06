import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Menu from '../Menu.svelte';
import Select from '../Select.svelte';
import { ui } from './ui.svelte';
import { claimKeys } from './keys';

// Every dropdown goes on Esc, wherever the keyboard is and whatever else hears the key. ⌘⇧H's pens opened with the
// keyboard left in the note, and Esc reached the menu only through the app's keys, the last to hear it: what heard it
// first and kept it (here, a claim that takes every Esc, as the note's and a diagram's keys can) left the menu up.
Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };
let off: (() => void)[] = [];
afterEach(() => { for (const f of off) f(); off = []; ui.layers.closeAll('putAway'); document.body.innerHTML = ''; });

function noteWithRival() {
  document.body.innerHTML = '<main><div class="tiptap" tabindex="0" contenteditable="true">words</div></main>';
  const note = document.querySelector<HTMLElement>('main .tiptap')!;
  note.focus();
  off.push(claimKeys('global', { Escape: (e) => { e.stopPropagation(); return true; } }, { capture: true }));
  return note;
}
const esc = (at: Element) => at.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

test("a menu opened from the keyboard (the highlighter's pens) goes on Esc with the keyboard still in the note", () => {
  const note = noteWithRival();
  ui.openMenu({ clientX: 10, clientY: 10 }, [{ label: 'Yellow', swatch: '#fff1a8' }, { label: 'Green', swatch: '#c9f2d4' }]);
  const m = mount(Menu, { target: document.body });
  off.push(() => unmount(m));
  flushSync();
  note.focus();
  esc(note);
  flushSync();
  expect(ui.menu).toBeNull();
});

test('a list (Select) goes on Esc with the keyboard gone from its button', () => {
  const note = noteWithRival();
  const s = mount(Select, { target: document.body, props: { value: 'a', options: [['a', 'A'], ['b', 'B']], onchange: () => {}, label: 'Pick' } });
  off.push(() => unmount(s));
  document.querySelector<HTMLButtonElement>('button.select')!.click();
  flushSync();
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  note.focus();
  esc(note);
  flushSync();
  expect(document.querySelector('button.select')!.getAttribute('aria-expanded')).toBe('false');
});
