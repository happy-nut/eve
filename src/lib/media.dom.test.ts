// Pictures, PDFs, videos, link cards and math in a note: where they land, what they keep, how the keys treat them.
import { test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf, press } from './testEditor';
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

/** a card put into a note, saved, and the note opened again — twice */
function cardTwice(href: string) {
  const ed = editorWith('# t\n\nx');
  ed.commands.insertContentAt(ed.state.doc.content.size, { type: 'bookmark', attrs: { href } });
  const once = md(ed);
  const back = editorWith(once);
  return { once, back, twice: md(back) };
}

test.each([
  'https://ko.wikipedia.org/wiki/서울',
  'https://ko.wikipedia.org/wiki/%EC%84%9C%EC%9A%B8',
  'https://example.com/[x]',
])('a card for %s is still a card when the note is opened again', (href) => {
  const { back, twice } = cardTwice(href);
  expect(back.state.doc.lastChild!.type.name).toBe('bookmark');
  // the address may come back encoded (%EC…), the same page; from then on the file stays as it is
  const again = editorWith(twice);
  expect(again.state.doc.lastChild!.type.name).toBe('bookmark');
  expect(md(again)).toBe(twice);
});

test.each([
  'https://example.com/*star*',
  'https://example.com/a)b',
  'https://example.com/path.',
])('a card markdown cannot write bare (%s) stays one whole link', (href) => {
  const { back, once, twice } = cardTwice(href);
  expect(once).toBe(`# t\n\nx\n\n<${href}>`);
  const line = back.state.doc.lastChild!;
  expect(line.textContent).toBe(href);
  expect(line.firstChild!.marks[0]?.attrs.href).toBe(href);
  expect(twice).toBe(once);
});

test('↩ after such an address leaves it a link instead of making a card that would not come back', () => {
  const ed = editorWith('# t\n\nhttps://example.com/*star*');
  ed.commands.setTextSelection(ed.state.doc.content.size - 1);
  press(ed, 'Enter');
  ed.state.doc.forEach((n) => expect(n.type.name).not.toBe('bookmark'));
});
