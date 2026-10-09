import { test, expect, afterEach } from 'vitest';
import { editorWith, posOf, type } from './testEditor';
import type { Editor } from '@tiptap/core';

// the / menu opens for a "/" just typed at a line's start or after a space, and never for one already in the text

afterEach(() => { document.body.innerHTML = ''; });
// the menu's own suggestion plugin: its key is 'slashMenu', which ProseMirror names 'slashMenu$', 'slashMenu$1'… per editor
const open = (ed: Editor) => !!(ed.state.plugins.find((p) => /^slashMenu\$\d*$/.test((p as unknown as { key: string }).key))?.getState(ed.state) as { active?: boolean } | undefined)?.active;

test('a "/" typed after a space opens it; typing on keeps it; a space closes it', () => {
  const ed = editorWith('# T\n\nsome text');
  ed.commands.setTextSelection(posOf(ed, 'text', true));
  type(ed, ' /');
  expect(open(ed)).toBe(true);
  type(ed, 'dia');
  expect(open(ed)).toBe(true);
  type(ed, ' ');
  expect(open(ed)).toBe(false);
});

test('the caret coming back after a "/" already in a sentence leaves it shut', () => {
  const ed = editorWith('# T\n\nthis / that and /path here');
  ed.commands.setTextSelection(posOf(ed, '/', true));
  expect(open(ed)).toBe(false);
  ed.commands.setTextSelection(posOf(ed, '/path', false) + 3);
  expect(open(ed)).toBe(false);
  type(ed, ' ');
  expect(open(ed)).toBe(false);
});

test('right after bold text a "/" is inside a word, as after any letter', () => {
  const ed = editorWith('# T\n\n**bold**');
  ed.commands.setTextSelection(posOf(ed, 'bold', true));
  type(ed, '/');
  expect(open(ed)).toBe(false);
});

test('not KRW/USD', () => {
  const ed = editorWith('# T\n\nKRW');
  ed.commands.setTextSelection(posOf(ed, 'KRW', true));
  type(ed, '/USD');
  expect(open(ed)).toBe(false);
});

// ---- found in the bug hunt ----
test('in a code block a / is code', () => {
  const ed = editorWith('# T\n\n```sh\ncd\n```');
  ed.commands.setTextSelection(posOf(ed, 'cd', true));
  type(ed, ' /');
  expect(open(ed)).toBe(false);
});

test('a / typed earlier, the menu since closed, stays shut when the caret comes back to it', () => {
  const ed = editorWith('# T\n\nstart');
  ed.commands.setTextSelection(posOf(ed, 'start', true));
  type(ed, ' x / y');
  expect(open(ed)).toBe(false);
  ed.commands.setTextSelection(posOf(ed, '/', true));
  expect(open(ed)).toBe(false);
});

test('undo putting back a / that was there does not open it', () => {
  const ed = editorWith('# T\n\nsee /etc today');
  ed.commands.setTextSelection(posOf(ed, '/', true));
  ed.commands.deleteRange({ from: posOf(ed, '/'), to: posOf(ed, '/', true) });
  ed.commands.undo();
  expect(open(ed)).toBe(false);
});
