import { test, expect, afterEach } from 'vitest';
import { createEditor } from './editor';
import { type } from './testEditor';
import type { SuggestItem } from './slash';

const settle = () => new Promise((r) => setTimeout(r, 0));
const made: { destroy(): void }[] = [];
afterEach(async () => { await settle(); for (const e of made.splice(0)) e.destroy(); document.body.innerHTML = ''; });

function editor() {
  let shown: SuggestItem[] = [];
  const noop = () => {};
  const off = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false, month: noop } as any;
  const suggestionUI = {
    show(items: SuggestItem[]) { shown = items; },
    move: noop, expand: () => false, collapse: () => false, select: () => false,
    hide() { shown = []; },
    visible: () => shown.length > 0,
  };
  const element = document.createElement('div');
  document.body.append(element);
  const ed = createEditor({ element, content: '# T\n\nsome', onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI, calendarUI: off, emojiUI: off });
  made.push(ed);
  return { ed, open: () => shown.length > 0 };
}

// the note has the keyboard now, not a frame later as commands.focus() gives it: a blur needs a focus to end
const focusEnd = (ed: ReturnType<typeof createEditor>) => { ed.commands.setTextSelection(ed.state.doc.content.size - 1); ed.view.focus(); };

test('the / menu goes away when the note loses the keyboard (a click in the list), and comes back on the next key', async () => {
  const { ed, open } = editor();
  focusEnd(ed);
  type(ed, ' /');
  await settle();
  expect(open()).toBe(true);
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  await settle();
  expect(open()).toBe(false);
  ed.view.focus();
  type(ed, 't');
  await settle();
  expect(open()).toBe(true);
});

test('a press inside the menu itself does not take it away', async () => {
  const { ed, open } = editor();
  focusEnd(ed);
  type(ed, ' /');
  await settle();
  const menu = document.createElement('ul');
  menu.className = 'suggest';
  const row = document.createElement('button');
  menu.append(row);
  document.body.append(menu);
  expect(open()).toBe(true);
  row.focus(); // a phone's tap can move the focus before the pick runs
  await settle();
  expect(open()).toBe(true);
});
