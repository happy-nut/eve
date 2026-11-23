// A drawing in a note is one stop for the keyboard, as a picture is: Tab lands on the drawing itself, not on each of
// its hidden tools, and Enter there opens it as a click on it does.
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import './testEditor';

// jsdom draws nothing, so an opened drawing's editor finds no place on screen for its lines
(SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM ??= () => null;

let app: ReturnType<typeof mount> | null = null;
afterEach(() => { if (app) unmount(app); app = null; document.body.innerHTML = ''; });

test('a drawing is one Tab stop, and Enter on it opens it', async () => {
  const { default: DiagramBlock } = await import('../DiagramBlock.svelte');
  const target = document.createElement('div');
  document.body.append(target);
  const none = () => {};
  app = mount(DiagramBlock, { target, props: { code: 'flowchart LR\n  A --> B', start: false, codeShown: false, onCode: none, onCodeEdit: none, onCodeLeave: none, onError: none, onHistory: none, onLeave: none, onDelete: none } });
  await new Promise<void>((done) => {
    const seen = () => target.querySelector('.dock') && (done(), true);
    if (!seen()) new MutationObserver((_, mo) => { if (seen()) mo.disconnect(); }).observe(target, { childList: true, subtree: true });
  });
  const canvas = target.querySelector<HTMLElement>('.mermaid-view')!;
  const stops = [...target.querySelectorAll<HTMLElement>('button, [tabindex]')].filter((el) => el.tabIndex >= 0);
  expect(stops[0]).toBe(canvas);
  expect(stops.map((el) => el.getAttribute('aria-label'))).toContain('Full screen');
  canvas.focus();
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flushSync();
  expect(target.querySelector('.dblock')!.classList.contains('active')).toBe(true);
  expect(canvas.tabIndex).toBe(-1);
});

test('a click on a box of a closed drawing opens it with that box picked, its bar up', async () => {
  const { default: DiagramBlock } = await import('../DiagramBlock.svelte');
  const target = document.createElement('div');
  document.body.append(target);
  const none = () => {};
  app = mount(DiagramBlock, { target, props: { code: 'flowchart LR\n  A[Start] --> B[Write]', start: false, codeShown: false, onCode: none, onCodeEdit: none, onCodeLeave: none, onError: none, onHistory: none, onLeave: none, onDelete: none } });
  const seen = (sel: string) => new Promise<Element>((done) => {
    const found = () => { const el = target.querySelector(sel); if (el) done(el); return !!el; };
    if (!found()) new MutationObserver((_, mo) => { if (found()) mo.disconnect(); }).observe(target, { childList: true, subtree: true, attributes: true });
  });
  const box = [...target.querySelectorAll('g.node')].find((g) => g.textContent?.includes('Write')) ?? await seen('g.node[id*="-flowchart-B-"]');
  box.querySelector('text, tspan')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  flushSync();
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  expect(target.querySelector('.dblock')!.classList.contains('active')).toBe(true);
  expect(target.querySelector('.bar button[aria-label="Edit the text"]')).not.toBeNull();
});
