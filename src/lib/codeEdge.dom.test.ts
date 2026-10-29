// The caret at an edge of inline code is on one side of it or the other, and an arrow there first takes it across the
// edge without moving it: after `ab` → once, what is typed is plain, beside the code; → again goes on to the next
// letter. (Notion's web editor has no such step: typed at the edge, the letter always went into the code.)
import { test, expect } from 'vitest';
import { editorWith, md, posOf, press, type } from './testEditor';
import type { Editor } from '@tiptap/core';

/** an arrow as the webview has it: what the editor does not take, moves the caret a letter */
function arrow(ed: Editor, dir: -1 | 1) {
  const e = press(ed, dir < 0 ? 'ArrowLeft' : 'ArrowRight');
  if (!e.defaultPrevented) ed.commands.setTextSelection(ed.state.selection.from + dir);
}
const note = () => editorWith('# T\n\nw `ab`cd');
const line = (ed: Editor) => md(ed).split('\n\n')[1];

test('after the code, → once steps out of it in place; → again goes on', () => {
  let ed = note();
  ed.commands.setTextSelection(posOf(ed, 'ab', true));
  arrow(ed, 1);
  expect(ed.state.selection.from).toBe(posOf(ed, 'ab', true));
  type(ed, 'z');
  expect(line(ed)).toBe('w `ab`zcd');
  ed = note();
  ed.commands.setTextSelection(posOf(ed, 'ab', true));
  arrow(ed, 1);
  arrow(ed, 1);
  type(ed, 'z');
  expect(line(ed)).toBe('w `ab`czd');
});

test('coming back to it with ←, the caret is outside first; ← again goes in, in place', () => {
  const ed = note();
  ed.commands.setTextSelection(posOf(ed, 'cd') + 1);
  arrow(ed, -1);
  type(ed, 'z');
  expect(line(ed)).toBe('w `ab`zcd');
  const ed2 = note();
  ed2.commands.setTextSelection(posOf(ed2, 'cd') + 1);
  arrow(ed2, -1);
  arrow(ed2, -1);
  expect(ed2.state.selection.from).toBe(posOf(ed2, 'cd'));
  type(ed2, 'z');
  expect(line(ed2)).toBe('w `abz`cd');
});

test('before the code the same: → goes in in place, ← from inside comes out in place', () => {
  const ed = note();
  ed.commands.setTextSelection(posOf(ed, 'ab'));
  arrow(ed, 1);
  type(ed, 'z');
  expect(line(ed)).toBe('w `zab`cd');
  const ed2 = note();
  ed2.commands.setTextSelection(posOf(ed2, 'ab') + 1);
  arrow(ed2, -1); // onto the edge from inside: still in it
  type(ed2, 'z');
  expect(line(ed2)).toBe('w `zab`cd');
  const ed3 = note();
  ed3.commands.setTextSelection(posOf(ed3, 'ab') + 1);
  arrow(ed3, -1);
  arrow(ed3, -1);
  type(ed3, 'z');
  expect(line(ed3)).toBe('w z`ab`cd');
});

test('the caret is drawn on its side of the edge: inside the code, or outside it', () => {
  const ed = note();
  ed.commands.setTextSelection(posOf(ed, 'ab', true));
  const caret = () => ed.view.dom.querySelector('.code-caret');
  expect(caret()?.closest('code')).not.toBeNull();
  arrow(ed, 1);
  expect(caret()).not.toBeNull();
  expect(caret()!.closest('code')).toBeNull();
  arrow(ed, 1); // away from the edge: the webview's own caret again
  expect(caret()).toBeNull();
});
