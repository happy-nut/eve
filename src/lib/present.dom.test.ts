// A note presented: a slide at each of its biggest headings, a diagram that draws itself walked a step at a time by →
// before the page turns, ← the same way back, Esc out with the keyboard back in the note
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })) as any; // jsdom has no Web Animations
(SVGElement.prototype as any).getTotalLength ??= () => 100;
import Present from '../Present.svelte';
import { ui } from './ui.svelte';

const settle = async () => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); await tick(); } };
let app: ReturnType<typeof mount> | null = null;
afterEach(() => { ui.closePresent(); if (app) unmount(app); app = null; document.body.innerHTML = ''; });

// mermaid's flowchart as it draws one: A → B → C, three steps
const CHART = `<div class="dblock"><svg id="m" aria-roledescription="flowchart-v2">
  <g class="node" id="m-flowchart-A-0"></g><g class="node" id="m-flowchart-B-1"></g><g class="node" id="m-flowchart-C-2"></g>
  <path class="flowchart-link" data-id="L_A_B_0"></path><path class="flowchart-link" data-id="L_B_C_0"></path></svg></div>`;

test('→ walks the diagram a step at a time, then turns the page; ← goes back the same way; Esc leaves', async () => {
  document.body.innerHTML = `<main><div class="tiptap" tabindex="0" contenteditable="true">
    <h1>Talk</h1><p>intro</p>${CHART}<h2>Next</h2><p>more</p></div></main>`;
  const page = document.querySelector<HTMLElement>('.tiptap')!;
  page.focus();
  ui.openPresent(page);
  app = mount(Present, { target: document.body });
  await settle();
  const box = document.querySelector<HTMLElement>('.present')!;
  const slide = () => box.querySelector('.slide')!;
  const press = async (key: string) => { box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); await settle(); };
  const shown = () => [...slide().querySelectorAll<SVGElement>('g.node')].filter((g) => g.style.opacity !== '0').map((g) => g.id.split('-')[2]);

  expect(document.activeElement).toBe(box);
  expect(slide().querySelector('h1')?.textContent).toBe('Talk');
  expect(box.querySelector('.count')?.textContent).toBe('1 / 2');
  expect(shown()).toEqual(['A']);
  // the page itself is left as it was: the slide is a copy, nothing in it to edit
  expect(page.querySelectorAll('svg').length).toBe(1);
  expect(slide().querySelector('[contenteditable]')).toBeNull();

  await press('ArrowRight');
  expect(shown()).toEqual(['A', 'B']);
  await press(' ');
  expect(shown()).toEqual(['A', 'B', 'C']);
  // the line into C came with it
  expect([...slide().querySelectorAll<SVGElement>('path')].map((p) => p.style.opacity)).toEqual(['', '']);
  await press('ArrowRight');
  expect(slide().querySelector('h2')?.textContent).toBe('Next');
  expect(box.querySelector('.count')?.textContent).toBe('2 / 2');
  await press('ArrowRight'); // the last slide: nothing after it
  expect(box.querySelector('.count')?.textContent).toBe('2 / 2');

  await press('ArrowLeft');
  expect(slide().querySelector('h1')?.textContent).toBe('Talk');
  expect(shown()).toEqual(['A', 'B', 'C']); // come back to, it is whole
  await press('ArrowLeft');
  expect(shown()).toEqual(['A', 'B']);

  await press('Escape');
  expect(ui.present).toBeNull();
  expect(ui.layers.count).toBe(0);
  await settle();
  expect(document.activeElement).toBe(page);
});
