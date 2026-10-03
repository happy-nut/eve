import { test, expect } from 'vitest';
import { editorWith, posOf } from './testEditor';

/** what a copy of the selection puts on the clipboard as plain text */
function copied(md: string, from: string, to: string, opts: { all?: boolean } = {}) {
  const ed = editorWith(md);
  if (opts.all) ed.commands.selectAll();
  else ed.commands.setTextSelection({ from: posOf(ed, from), to: posOf(ed, to, true) });
  const slice = ed.state.selection.content();
  return ed.view.someProp('clipboardTextSerializer', (f) => f(slice, ed.view)) as string;
}

test.each([
  ['bold and links', 'a **bold** and [a link](https://x.com) b', 'bold', 'link', '**bold** and [a link](https://x.com)'],
  ['a list', '- one\n- two\n  - three', 'one', 'three', '- one\n- two\n  - three'],
  ['to-dos', '- [ ] open\n- [x] done', 'open', 'done', '- [ ] open\n- [x] done'],
  ['a heading and a paragraph', '# Title\n\ntext', 'Title', 'text', '# Title\n\ntext'],
])('%s is copied as markdown', (_, md, from, to, want) => {
  expect(copied(md, from, to).trim()).toBe(want);
});

test('a table is copied as a markdown table', () => {
  const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
  expect(copied(md, '', '', { all: true }).trim()).toBe(md);
});

test('a toggle and a callout keep their markdown', () => {
  const md = '<details open>\n<summary>T</summary>\n\nbody\n\n</details>\n\n> [!💡]\n> tip';
  expect(copied(md, '', '', { all: true }).trim()).toBe(md);
});

test('a whole code block keeps its fence and language; a few words inside it are just the code', () => {
  expect(copied('```js\nlet a = 1\n```', '', '', { all: true }).trim()).toBe('```js\nlet a = 1\n```');
  expect(copied('```js\nlet a = 1\n```', 'a', '1')).toBe('a = 1');
});

test('words inside one line are copied as they are, no block markup around them', () => {
  expect(copied('- [ ] buy milk today', 'milk', 'milk')).toBe('milk');
});
