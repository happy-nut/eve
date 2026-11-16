// Two inline codes with a letter between them (`ab`/`cd`), the letter deleted: they stay two codes side by side, as
// they were, not one `abcd`. ProseMirror runs text with the same marks into one, and markdown has no way to write
// two code spans touching (`ab``cd` reads back as one), so the second is a code "joined" to the first, written
// with an empty comment between them: `ab`<!---->`cd`.
import { test, expect } from 'vitest';
import { editorWith, md, posOf, type } from './testEditor';
import type { Editor } from '@tiptap/core';

const line = (ed: Editor) => md(ed).trimEnd().split('\n\n')[1];
/** the line's runs of text, each with its marks */
const runs = (ed: Editor) => {
  const out: string[] = [];
  ed.state.doc.child(1).forEach((n) => out.push(`${n.marks.some((m) => m.type.name === 'code') ? 'code' : 'text'}:${n.text}`));
  return out;
};
/** the letter after `at` deleted, as the webview deletes it (a transaction of its own, no key the editor takes) */
const cut = (ed: Editor, at: number) => ed.view.dispatch(ed.state.tr.delete(at, at + 1));

test.each(['backspace', 'delete'])('the letter between two codes deleted (%s): two codes, saved as two', (how) => {
  const ed = editorWith('# T\n\nx `ab`/`cd` y');
  const slash = posOf(ed, 'ab', true);
  ed.commands.setTextSelection(how === 'backspace' ? slash + 1 : slash);
  cut(ed, slash);
  expect(runs(ed)).toEqual(['text:x ', 'code:ab', 'code:cd', 'text: y']);
  expect(line(ed)).toBe('x `ab`<!---->`cd` y');
});

test('read back, two codes touching are the same two codes, and save the same', () => {
  const ed = editorWith('# T\n\nx `ab`<!---->`cd` y');
  expect(runs(ed)).toEqual(['text:x ', 'code:ab', 'code:cd', 'text: y']);
  expect(line(ed)).toBe('x `ab`<!---->`cd` y');
});

test('typed at the seam, a letter goes into the first code; one put between them parts them again', () => {
  const ed = editorWith('# T\n\nx `ab`<!---->`cd` y');
  ed.commands.setTextSelection(posOf(ed, 'ab', true));
  type(ed, 'z');
  expect(line(ed)).toBe('x `abz`<!---->`cd` y');
  // a plain letter between them: two codes apart, no comment left
  const at = posOf(ed, 'abz', true);
  ed.view.dispatch(ed.state.tr.insertText('/', at).removeMark(at, at + 1, ed.state.schema.marks.code));
  expect(line(ed)).toBe('x `abz`/`cd` y');
});

test('code typed straight after code is still one code (nothing was between them)', () => {
  const ed = editorWith('# T\n\nx `ab` y');
  ed.view.dispatch(ed.state.tr.insertText('cd', posOf(ed, 'ab', true)));
  expect(line(ed)).toBe('x `abcd` y');
});
