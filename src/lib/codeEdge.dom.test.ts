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
  expect(caret()!.classList.contains('out')).toBe(false);
  arrow(ed, 1);
  expect(caret()!.classList.contains('out')).toBe(true);
  arrow(ed, 1); // away from the edge: the webview's own caret again
  expect(caret()).toBeNull();
});

// The caret was a node of its own beside the code (contenteditable=false): an arrow stopped on it, and at a line's
// start Hangul typed before the code went nowhere (#325). It is drawn by the code's own letter now, nothing between.
test.each([['at a line\'s start', '`ab` cd', 0], ['in a line', 'w `ab`cd', 2], ['after it', 'w `ab`cd', 4]])('%s, nothing stands at the caret beside the code', (_, text, at) => {
  const ed = editorWith(`# T\n\n${text}`);
  const p = posOf(ed, text.replace(/`/g, '').slice(0, 1)) + at;
  for (const stepIn of [false, true]) {
    ed.commands.setTextSelection(p);
    if (stepIn) press(ed, at === 4 ? 'ArrowLeft' : 'ArrowRight');
    const caret = ed.view.dom.querySelector('.code-caret');
    expect(caret?.textContent, 'the caret is drawn by a letter of the code, not an empty node of its own').toMatch(/^[ab]$/);
  }
});

// Two codes touching that stayed two (the first a link, as code copied from a web page comes in): ⌫ or ⌦ with the
// caret between them puts them together, one code, as deleting between two codes with a letter between them does.
// It deleted the letter before the seam instead (the "f" of `asdf`), and they stayed two.
test.each(['Backspace', 'Delete'])('%s between two codes touching puts them together, deleting no letter', (key) => {
  const ed = editorWith('# T\n\nx [`asdf`](https://a.b)`qwer` y');
  ed.commands.setTextSelection(posOf(ed, 'qwer'));
  expect(press(ed, key).defaultPrevented).toBe(true);
  expect(line(ed)).toBe('x [`asdfqwer`](https://a.b) y');
  expect(ed.state.selection.from).toBe(posOf(ed, 'asdf') + 4);
  type(ed, 'z');
  expect(line(ed)).toBe('x [`asdfzqwer`](https://a.b) y');
});

test('⌫ beside a code (a plain letter before it) still deletes that letter', () => {
  const ed = editorWith('# T\n\nx a`qwer` y');
  ed.commands.setTextSelection(posOf(ed, 'qwer'));
  expect(press(ed, 'Backspace').defaultPrevented).toBe(false);
});
