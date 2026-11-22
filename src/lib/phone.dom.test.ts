import { test, expect, vi } from 'vitest';

// a phone (the editor reads isMobile once, when it loads)
vi.mock('./platform', async (original) => ({ ...(await original<typeof import('./platform')>()), isMobile: true }));

const { ui } = await import('./ui.svelte');
const { editorWith } = await import('./testEditor');

test('a long press in a note is the system\'s (select, drag the handles): no menu of the app\'s own', () => {
  const ed = editorWith('본문 글자');
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  ed.view.dom.querySelector('p')!.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(false);
  expect(ui.menu).toBeNull();
});

test("the formatting bar follows the keyboard Android reports, not a guess from the window's height", async () => {
  const { mount, unmount, flushSync } = await import('svelte');
  const MobileBar = (await import('../MobileBar.svelte')).default;
  let inset = 0;
  (globalThis as { EveAndroid?: unknown }).EveAndroid = { keyboardInset: () => inset };
  const page = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'page' }));
  const text = page.appendChild(Object.assign(document.createElement('div'), { className: 'tiptap', tabIndex: 0 }));
  const bar = mount(MobileBar, { target: document.body });
  text.focus();
  flushSync();
  expect(document.querySelector('.mbar')).toBeNull();
  window.dispatchEvent(new CustomEvent('eve-keyboard', { detail: (inset = 820) }));
  flushSync();
  expect(document.querySelector('.mbar')).not.toBeNull();
  window.dispatchEvent(new Event('resize'));
  flushSync();
  expect(document.querySelector('.mbar')).not.toBeNull();
  window.dispatchEvent(new CustomEvent('eve-keyboard', { detail: (inset = 0) }));
  flushSync();
  expect(document.querySelector('.mbar')).toBeNull();
  (await import('./focusWatch')).letGo(text);
  unmount(bar);
  page.remove();
  delete (globalThis as { EveAndroid?: unknown }).EveAndroid;
});
