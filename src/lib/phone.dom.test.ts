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
