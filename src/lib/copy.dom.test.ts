import { test, expect } from 'vitest';
import { NodeSelection } from '@tiptap/pm/state';
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

// every kind of block the editor has, in one note: a copy of all of it is the note's markdown, to the character
const KITCHEN = [
  '# Kitchen sink',
  'Text with **bold**, *italic*, ~~strike~~, `code`, ==marked==, [a link](https://x.com), [[Other note|alias]] and @2026-10-08.',
  '> [!warning] Careful\n> inside a callout\n> - with a list',
  '<details open>\n<summary>Toggle</summary>\n\n```js\nlet a = 1\n```\n\n</details>',
  '```mermaid\nflowchart LR\n  A --> B\n```',
  '```mermaid\nerDiagram\n  USER ||--o{ NOTE : writes\n  USER {\n    uuid id PK\n  }\n```',
  '```kanban\n{"columns":[{"title":"To do","cards":[{"title":"Write","body":""}]},{"title":"Done","cards":[]}]}\n```',
  '| A | B |\n| :-- | --: |\n| 1 | 2 |',
  '1. one\n   1. one a\n      1. one a i\n2. two\n   - bullet under\n     - [ ] task under',
  '- [x] done\n- [ ] open',
  '![a picture](assets/p.png)',
  '[notes.pdf](assets/notes.pdf)',
  '[clip.mp4](assets/clip.mp4)',
  'https://example.com/a-card',
  '> a quote',
  '---',
  'Last line.',
].join('\n\n');

test('everything at once: a copy of the whole note is its markdown', async () => {
  const { md } = await import('./testEditor');
  const ed = editorWith(KITCHEN);
  ed.commands.selectAll();
  const slice = ed.state.selection.content();
  const text = ed.view.someProp('clipboardTextSerializer', (f) => f(slice, ed.view)) as string;
  expect(text.trim()).toBe(md(ed).trim());
  // and what it copies is the note: nothing of any block lost on the way
  for (const part of KITCHEN.split('\n\n')) expect(text).toContain(part.split('\n')[0].replace(/^- \[x\]/, '- [x]'));
});

test('a selection across blocks takes the blocks inside it whole, as their markdown', () => {
  // from the middle of the first line to the middle of the last: everything between, a diagram and a board included
  const text = copied(KITCHEN, 'bold', 'Last', {});
  expect(text).toContain('```mermaid\nflowchart LR\n  A --> B\n```');
  expect(text).toContain('```mermaid\nerDiagram');
  expect(text).toMatch(/```kanban\n\{\n {2}"columns"[\s\S]*"Write"[\s\S]*\n```/);
  expect(text).toContain('| A | B |');
  expect(text).toContain('<details open>');
  expect(text).toContain('> [!warning] Careful');
  expect(text).toContain('![a picture](assets/p.png)');
  expect(text.trimEnd().endsWith('Last')).toBe(true);
});

test('from inside a diagram block to the text after it: the fence is not left open', () => {
  const md = '```mermaid\nflowchart LR\n  A --> B\n```\n\nafter it';
  const text = copied(md, 'A -->', 'after');
  expect(text).toMatch(/```[\s\S]*```/);
});

test('a picture or a board selected on its own copies as its markdown', () => {
  for (const [md, want] of [
    ['before\n\n![a picture](assets/p.png)\n\nafter', '![a picture](assets/p.png)'],
    ['before\n\n```kanban\n{"columns":[{"title":"A","cards":[]}]}\n```\n\nafter', '```kanban'],
    ['before\n\n```mermaid\npie\n  "A" : 1\n```\n\nafter', '```mermaid\npie\n  "A" : 1\n```'],
  ]) {
    const ed = editorWith(md);
    let at = -1;
    ed.state.doc.forEach((n, pos) => { if (at < 0 && n.type.name !== 'paragraph') at = pos; });
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, at)));
    const slice = ed.state.selection.content();
    const text = ed.view.someProp('clipboardTextSerializer', (f) => f(slice, ed.view)) as string;
    expect(text.trim().startsWith(want)).toBe(true);
  }
});

test('part of a toggle body copies as that body, not as a toggle titled with its first line', () => {
  const text = copied('<details open>\n<summary>T</summary>\n\nbody one\n\nbody two\n\n</details>', 'one', 'two');
  expect(text).not.toContain('<summary>');
  expect(text).toContain('one\n\nbody two');
  expect(text.match(/one/g)?.length).toBe(1);
});

test('a callout copied from below its title has no title', () => {
  const text = copied('> [!warning] Title here\n> body one\n>\n> body two', 'one', 'two');
  expect(text).not.toMatch(/\[!warning\] one/);
  expect(text).toContain('one');
  // from its title on, it keeps it
  expect(copied('> [!warning] Title here\n> body one', 'Title', 'one')).toMatch(/\[!warning\] Title here/);
});
