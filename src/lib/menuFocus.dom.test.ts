import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Menu from '../Menu.svelte';
import { ui } from './ui.svelte';

// A menu opened from another menu's item (right click → Text color…, Highlight…) took the keyboard nowhere: the first
// menu closing gave it back to the note, and the second, drawn by the same Menu, never took it — ↓ moved the caret in
// the note under the open menu instead of through its items.
Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };
let off: (() => void)[] = [];
afterEach(() => { for (const f of off) f(); off = []; ui.layers.closeAll('putAway'); document.body.innerHTML = ''; });

const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const inMenu = () => !!document.activeElement?.closest('.menu');

test('a menu opened from a menu item has the keyboard, as the first one did', () => {
  document.body.innerHTML = '<main><div class="tiptap" tabindex="0" contenteditable="true">words</div></main>';
  document.querySelector<HTMLElement>('.tiptap')!.focus();
  const colours = () => ui.openMenu({ clientX: 20, clientY: 20 }, [{ label: 'Gray', run: () => {} }, { label: 'Brown', run: () => {} }]);
  ui.openMenu({ clientX: 10, clientY: 10 }, [{ label: 'Bold', run: () => {} }, { label: 'Text color…', run: colours }]);
  const m = mount(Menu, { target: document.body });
  off.push(() => unmount(m));
  flushSync();
  expect(inMenu()).toBe(true);
  [...document.querySelectorAll<HTMLButtonElement>('.menu button')].find((b) => b.textContent?.includes('Text color'))!.click();
  flushSync();
  expect(ui.menu?.items.map((i) => i.label)).toEqual(['Gray', 'Brown']);
  expect(inMenu()).toBe(true);
  key('ArrowDown');
  expect(document.activeElement?.textContent).toContain('Gray');
  // and closed, the keyboard goes back to the note it came from
  key('Escape');
  flushSync();
  expect(document.activeElement?.classList.contains('tiptap')).toBe(true);
});
