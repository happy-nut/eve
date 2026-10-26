import { test, expect, describe, afterEach } from 'vitest';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { CellSelection } from '@tiptap/pm/tables';
import { editorWith, md, paste, posOf, press } from './testEditor';
import { appearance } from './appearance.svelte';

/** what a copy of the selection puts on the clipboard as plain text */
function copied(md: string, from: string, to: string, opts: { all?: boolean } = {}) {
  const ed = editorWith(md);
  if (opts.all) ed.commands.selectAll();
  else ed.commands.setTextSelection({ from: posOf(ed, from), to: posOf(ed, to, true) });
  const slice = ed.state.selection.content();
  return ed.view.someProp('clipboardTextSerializer', (f) => f(slice, ed.view)) as string;
}

test('spaces opening a line are copied as spaces, not as the `&#32;` the note keeps them as', () => {
  expect(copied('&#32;&#32;indented\n\n- &#9;item', 'indented', 'item').trim()).toBe('indented\n\n- \titem');
  expect(copied('&#32;&#32;indented\n\nx', '', '', { all: true }).trimEnd()).toBe('  indented\n\nx');
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

test('part of a nested list, from below an item\'s line: just that part, as a list', () => {
  expect(copied('- one\n  - two\n    - three\n- four', 'two', 'three').trim()).toBe('- two\n  - three');
});

describe('pasted', () => {
  // jsdom has none; ProseMirror's pasteHTML makes one to hand the paste handlers
  (globalThis as any).ClipboardEvent ??= class extends Event { clipboardData = null; };
  const after = (word: string) => (ed: Editor) => { ed.commands.setTextSelection(posOf(ed, word, true)); };
  const newLine = (word: string) => (ed: Editor) => { after(word)(ed); press(ed, 'Enter'); };
  /** the note after `clip` is pasted as plain text where `at` puts the caret; an undo gives back the note before it */
  function pasted(note: string, at: (ed: Editor) => void, clip: string) {
    const ed = editorWith(note);
    at(ed);
    const before = md(ed);
    ed.view.dispatch(closeHistory(ed.state.tr));
    paste(ed, clip);
    const out = md(ed);
    expect(md(editorWith(out))).toBe(out); // read back the same
    ed.commands.undo();
    expect(md(ed)).toBe(before);
    return out;
  }

  test('a list into a list, on a new item: its items, in a tight list', () => {
    expect(pasted('- one\n- three', newLine('one'), '- a\n- b')).toBe('- one\n- a\n- b\n- three');
    expect(pasted('- [ ] one\n- [ ] three', newLine('one'), '- [ ] a\n- [x] b')).toBe('- [ ] one\n- [ ] a\n- [x] b\n- [ ] three');
    expect(pasted('1. one\n2. three', newLine('one'), '1. a\n2. b')).toBe('1. one\n2. a\n3. b\n4. three');
    expect(pasted('- one\n- two\n- three', (ed) => { ed.commands.setTextSelection({ from: posOf(ed, 'two'), to: posOf(ed, 'two', true) }); }, '- a\n- b'))
      .toBe('- one\n- a\n- b\n- three');
  });

  test('a list at the end or the start of an item\'s text: items after it or before it, its sublist kept', () => {
    expect(pasted('- one\n- three', after('one'), '- a\n  - b')).toBe('- one\n- a\n  - b\n- three');
    expect(pasted('- one\n- two', (ed) => { ed.commands.setTextSelection(posOf(ed, 'two')); }, '- a\n- b')).toBe('- one\n- a\n- b\n- two');
    expect(pasted('- [x] one\n- [x] two', after('one'), '- [ ] a')).toBe('- [x] one\n- [ ] a\n- [x] two');
    expect(pasted('x', after('x'), '- a\n- b')).toBe('x\n\n- a\n- b');
  });

  test('a heading into a heading stays in it; after a line, it is a heading of its own', () => {
    expect(pasted('# Title', (ed) => { ed.commands.setTextSelection(posOf(ed, 'Title') + 2); }, '# H')).toBe('# TiHtle');
    expect(pasted('para', after('para'), '# H')).toBe('para\n\n# H');
  });

  test('to-dos come in without a space before their text', () => {
    expect(pasted('x', newLine('x'), '- [ ] t\n- [x] u')).toBe('x\n\n- [ ] t\n- [x] u');
  });

  test('lines of plain text are lines: to-dos in a to-do list, paragraphs elsewhere', () => {
    expect(pasted('- [ ] one', newLine('one'), 'milk\neggs\nbread')).toBe('- [ ] one\n- [ ] milk\n- [ ] eggs\n- [ ] bread');
    expect(pasted('x', newLine('x'), 'milk\neggs\nbread')).toBe('x\n\nmilk\n\neggs\n\nbread');
    expect(pasted('ab', (ed) => { ed.commands.setTextSelection(posOf(ed, 'ab') + 1); }, 'milk')).toBe('amilkb');
  });

  test('in code, a cell or a toggle\'s title they stay in the one line', () => {
    expect(pasted('```\ncode\n```', after('code'), 'milk\neggs')).toBe('```\ncodemilk\neggs\n```');
    expect(pasted('| a | b |\n| --- | --- |\n| 1 | 2 |', after('1'), 'milk')).toContain('| 1milk | 2 |');
    const toggle = '<details open>\n<summary>Title</summary>\n\nbody\n\n</details>';
    expect(pasted(toggle, after('Title'), 'milk\neggs')).toBe(toggle.replace('Title', 'Titlemilk eggs'));
  });

  test('markdown pasted in the middle of a line: both halves keep their own text, no letter added or lost', () => {
    const mid = (ed: Editor) => { ed.commands.setTextSelection(posOf(ed, 'hello', true)); };
    expect(pasted('hello world', mid, '- item')).toBe('helloitem world');
    expect(pasted('hello world', mid, '- a\n- b')).toBe('helloa\n\n- b world');
    expect(pasted('hello world', (ed) => { ed.commands.setTextSelection(posOf(ed, 'world')); }, '- a\n- b')).toBe('hello a\n\n- bworld');
  });

  test('stars with spaces around them are not italics', () => {
    expect(pasted('x', newLine('x'), 'x * y * z')).toBe('x\n\nx \\* y \\* z');
  });

  /** copy from one note (the HTML ProseMirror puts on the clipboard), paste on an empty line of another */
  function copyPaste(note: string, from: string, to: string) {
    const src = editorWith(note);
    src.commands.setTextSelection({ from: posOf(src, from), to: posOf(src, to, true) });
    const { dom } = src.view.serializeForClipboard(src.state.selection.content());
    const ed = editorWith('x');
    newLine('x')(ed);
    ed.view.pasteHTML(dom.innerHTML);
    return md(ed);
  }

  test('words of one line, pasted on an empty line: just the words, not that line\'s block', () => {
    expect(copyPaste('- [x] it is done', 'is', 'done')).toBe('x\n\nis done');
    expect(copyPaste('# Head line', 'Head', 'Head')).toBe('x\n\nHead');
    expect(copyPaste('> [!info] T\n> body **line**', 'body', 'line')).toBe('x\n\nbody **line**');
    // across lines: the lines, blocks and all
    expect(copyPaste('- [ ] open\n- [x] done', 'open', 'done')).toBe('x\n\n- [ ] open\n- [x] done');
  });

  /** copy from one note, paste at the end of a word in another */
  function pasteAt(note: string, from: string, to: string, into: string, at: string) {
    const src = editorWith(note);
    src.commands.setTextSelection({ from: posOf(src, from), to: posOf(src, to, true) });
    const { dom } = src.view.serializeForClipboard(src.state.selection.content());
    const ed = editorWith(into);
    ed.commands.setTextSelection(posOf(ed, at, true));
    ed.view.pasteHTML(dom.innerHTML);
    return md(ed);
  }

  test('lines pasted at the end of a list\'s line are lines of that list, beside it, not under it', () => {
    // bullets into a to-do list: to-dos (they went under the to-do, a list of their own)
    expect(pasteAt('- x1\n- x2', 'x1', 'x2', '- [ ] item\n- [ ] next', 'item')).toBe('- [ ] itemx1\n- [ ] x2\n- [ ] next');
    expect(pasteAt('- [ ] x1\n- [ ] x2', 'x1', 'x2', '- item\n- next', 'item')).toBe('- itemx1\n- x2\n- next');
    // two paragraphs into a bullet: two bullets (the second was a paragraph inside the first, the list made loose)
    expect(pasteAt('x1\n\nx2', 'x1', 'x2', '- item\n- next', 'item')).toBe('- itemx1\n- x2\n- next');
    expect(pasteAt('x1\n\nx2\n\nx3', 'x1', 'x3', '1. item\n2. next', 'item')).toBe('1. itemx1\n2. x2\n3. x3\n4. next');
    // the same as markdown text (from a chat): items after the line, of its kind
    const typed = (into: string, text: string) => { const ed = editorWith(into); ed.commands.setTextSelection(posOf(ed, 'item', true)); paste(ed, text); return md(ed); };
    expect(typed('- [ ] item\n- [ ] next', '- x1\n- x2')).toBe('- [ ] item\n- [ ] x1\n- [ ] x2\n- [ ] next');
    expect(typed('- item\n- next', '- [ ] x1\n- [ ] x2')).toBe('- item\n- x1\n- x2\n- next');
  });

  test('a table row, pasted on an empty line: a table in its place, no empty line left above it', () => {
    const src = editorWith('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |');
    const cell = (word: string) => { const $p = src.state.doc.resolve(posOf(src, word)); return $p.before($p.depth - 1); };
    src.view.dispatch(src.state.tr.setSelection(CellSelection.create(src.state.doc, cell('1'), cell('2'))));
    const { dom } = src.view.serializeForClipboard(src.state.selection.content());
    const ed = editorWith('x');
    newLine('x')(ed);
    ed.view.pasteHTML(dom.innerHTML);
    expect(md(ed).trim()).toBe('x\n\n| 1 | 2 |\n| --- | --- |');
  });
});

describe('cells chosen in a table and copied, as text', () => {
  const note = '# T\n\n| Name | Qty |\n| --- | --- |\n| apple | 2 |\n| pear | 3 |';
  function cells(from: string, to: string) {
    const ed = editorWith(note);
    const cell = (w: string) => { const $p = ed.state.doc.resolve(posOf(ed, w)); return $p.before($p.depth - 1); };
    ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, cell(from), cell(to))));
    const slice = ed.state.selection.content();
    return ed.view.someProp('clipboardTextSerializer', (f) => f(slice, ed.view)) as string;
  }
  afterEach(() => appearance.set({ tableCopyMarkdown: true }));
  test('the header row among them: a markdown table of just those cells', () => {
    expect(cells('Name', '3').trim()).toBe('| Name | Qty |\n| --- | --- |\n| apple | 2 |\n| pear | 3 |');
    expect(cells('Qty', '2').trim()).toBe('| Qty |\n| --- |\n| 2 |');
    expect(cells('Name', 'pear').trim()).toBe('| Name |\n| --- |\n| apple |\n| pear |');
  });
  test('without the header row: the cells a tab apart, a row a line, as a spreadsheet takes them', () => {
    expect(cells('apple', '3')).toBe('apple\t2\npear\t3');
  });
  test('with the setting off (Settings → General), the header row is cells like any other', () => {
    appearance.set({ tableCopyMarkdown: false });
    expect(cells('Name', '3')).toBe('Name\tQty\napple\t2\npear\t3');
  });
});
