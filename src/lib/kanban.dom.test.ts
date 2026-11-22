// A board's column heads and cards are real buttons, none inside another, and a card opened by the pointer gets the
// keyboard back when it closes (WebKit, like jsdom, gives a clicked button no focus of its own).
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, tick, flushSync } from 'svelte';
import { ui } from './ui.svelte';
import Kanban from '../Kanban.svelte';

// jsdom draws nothing, so it has no scrollIntoView; focusing a board's part scrolls to it
Element.prototype.scrollIntoView ??= () => {};

let app: ReturnType<typeof mount> | null = null;
afterEach(() => { ui.layers.closeAll('putAway'); if (app) unmount(app); app = null; document.body.innerHTML = ''; });

function board() {
  document.body.innerHTML = '<div class="tiptap" tabindex="0" contenteditable="true"></div><div id="t"></div>';
  (document.querySelector('.tiptap') as HTMLElement).focus();
  const none = () => {};
  app = mount(Kanban, {
    target: document.getElementById('t')!,
    props: {
      columns: [{ id: 'c1', title: 'To do', cards: [{ id: 'k1', title: 'One', body: '' }] }],
      commit: none, template: () => null, saveTemplate: none, exit: none, remove: none, undo: none, redo: none,
    },
  });
  flushSync();
}

test('column heads and cards are buttons, and no button sits inside another', () => {
  board();
  expect(document.querySelector('.kb-head')!.tagName).toBe('BUTTON');
  expect(document.querySelector('.kb-card')!.tagName).toBe('BUTTON');
  expect(document.querySelectorAll('button button')).toHaveLength(0);
  expect(document.querySelectorAll('[role="button"]')).toHaveLength(0);
});

test('a card clicked open gets the keyboard back when it closes', async () => {
  board();
  const card = document.querySelector<HTMLElement>('.kb-card')!;
  card.click();
  await tick();
  expect(ui.card?.title).toBe('One');
  ui.closeCard();
  await tick();
  await new Promise((r) => setTimeout(r, 0));
  expect(document.activeElement).toBe(card);
});

test('the × beside a column head deletes that column', async () => {
  const commits: unknown[] = [];
  document.body.innerHTML = '<div id="t"></div>';
  app = mount(Kanban, {
    target: document.getElementById('t')!,
    props: {
      columns: [{ id: 'c1', title: 'To do', cards: [] }, { id: 'c2', title: 'Done', cards: [] }],
      commit: (c) => commits.push(c), template: () => null, saveTemplate: () => {}, exit: () => {}, remove: () => {}, undo: () => {}, redo: () => {},
    },
  });
  flushSync();
  document.querySelector<HTMLElement>('.kb-del')!.click();
  await tick();
  expect(commits).toEqual([[{ id: 'c2', title: 'Done', cards: [] }]]);
  expect(document.activeElement?.classList.contains('kb-head')).toBe(true);
});
