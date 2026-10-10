// Pictures, PDFs, videos, link cards and math in a note: where they land, what they keep, how the keys treat them.
import { test, expect, afterEach } from 'vitest';
import { editorWith, posOf } from './testEditor';
import { dropBlock } from './editor';

afterEach(() => { document.body.innerHTML = ''; });

/** where a file let go on the line holding `word` would go (jsdom has no layout: always below the line) */
function dropOn(note: string, word: string) {
  const ed = editorWith(note);
  const at = posOf(ed, word);
  ed.view.posAtCoords = () => ({ pos: at + 1, inside: -1 });
  const pos = dropBlock(ed.view, { clientX: 0, clientY: 10 } as DragEvent)!;
  return ed.state.doc.resolve(pos);
}

test('a file dropped on a list item goes into that item, not under the whole list', () => {
  const $p = dropOn('# L\n\n- one\n- two\n- three', 'two');
  expect($p.parent.type.name).toBe('listItem');
  expect($p.parent.textContent).toBe('two');
});

test('a file dropped in a table cell goes into that cell', () => {
  const $p = dropOn('# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |', '2');
  expect($p.parent.type.name).toBe('tableCell');
  expect($p.parent.textContent).toBe('2');
});

test('a file dropped on a line in a callout stays in the callout', () => {
  const $p = dropOn('# C\n\n> [!note] Title\n> first\n> second', 'first');
  expect($p.parent.type.name).toBe('callout');
});

test('a file dropped on a plain line goes right under it', () => {
  const $p = dropOn('# P\n\nfirst\n\nsecond', 'first');
  expect($p.depth).toBe(0);
  expect($p.nodeBefore?.textContent).toBe('first');
});
