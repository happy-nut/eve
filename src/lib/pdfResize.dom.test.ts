// The document panel's right and bottom edges are resized from the keyboard as well as dragged: each is a separator
// Tab reaches, telling its size, which the arrows change, by more with ⇧, never below the smallest the panel goes.
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { ui } from './ui.svelte';
import PdfViewer from '../PdfViewer.svelte';

// jsdom has no Web Animations; the panel's opening transition asks for them
Element.prototype.getAnimations ??= () => [];
Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };

let app: ReturnType<typeof mount> | null = null;
afterEach(() => { if (app) unmount(app); app = null; ui.layers.closeAll('putAway'); document.body.innerHTML = ''; });

const key = (el: Element, k: string, shiftKey = false) => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })); flushSync(); };

test('the right and bottom edges take the arrows; the others are for the pointer only', () => {
  ui.openPdf('a.pdf', 'a.pdf');
  app = mount(PdfViewer, { target: document.body });
  flushSync();
  const panel = document.querySelector<HTMLElement>('.pdf-panel')!;
  const [e, s] = [document.querySelector<HTMLElement>('.pdf-edge.e')!, document.querySelector<HTMLElement>('.pdf-edge.s')!];
  expect([...document.querySelectorAll<HTMLElement>('.pdf-edge')].filter((x) => x.tabIndex >= 0)).toEqual([s, e]);
  const w0 = parseFloat(panel.style.width), h0 = parseFloat(panel.style.height);
  expect(Number(e.getAttribute('aria-valuenow'))).toBe(w0);
  key(e, 'ArrowLeft');
  expect(parseFloat(panel.style.width)).toBe(w0 - 16);
  key(e, 'ArrowLeft', true);
  expect(parseFloat(panel.style.width)).toBe(w0 - 80);
  expect(Number(e.getAttribute('aria-valuenow'))).toBe(w0 - 80);
  key(s, 'ArrowUp');
  expect(parseFloat(panel.style.height)).toBe(h0 - 16);
  key(s, 'ArrowLeft');
  expect(parseFloat(panel.style.height)).toBe(h0 - 16);
  for (let i = 0; i < 40; i++) key(e, 'ArrowLeft', true);
  expect(parseFloat(panel.style.width)).toBe(Number(e.getAttribute('aria-valuemin')));
});
