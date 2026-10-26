// Notion's text colours, and footnotes as GitHub and Obsidian write them
import { test, expect } from 'vitest';
import { editorWith, md, posOf } from './testEditor';
import { colorText, colorAt } from './textColor';
import { insertFootnote } from './footnote';
import { slashItems } from './slash';

test('words coloured are a span with the colour, read back the same; another colour replaces it, Default takes it off', () => {
  const ed = editorWith('# T\n\nsay it loud');
  const [from, to] = [posOf(ed, 'it'), posOf(ed, 'it', true)];
  colorText(ed, from, to, 'red');
  expect(md(ed).trimEnd()).toBe('# T\n\nsay <span style="color: #c4302b">it</span> loud');
  expect(md(editorWith(md(ed)))).toBe(md(ed));
  ed.commands.setTextSelection(from + 1);
  expect(colorAt(ed)).toBe('red');
  colorText(ed, from, to, 'blue');
  expect(md(ed).trimEnd()).toBe('# T\n\nsay <span style="color: #1f6fa8">it</span> loud');
  colorText(ed, from, to, null);
  expect(md(ed).trimEnd()).toBe('# T\n\nsay it loud');
  // "/red" colours the line's words
  ed.commands.setTextSelection(posOf(ed, 'say'));
  slashItems('red').find((i) => i.label === 'Red')!.run!(ed);
  expect(md(ed).trimEnd()).toBe('# T\n\n<span style="color: #c4302b">say it loud</span>');
});

test('a footnote: the next number at the caret, its line at the end with the caret on it; a click on the mark goes there', () => {
  const ed = editorWith('# T\n\nClaim[^1] here.\n\n[^1]: Old source.\n\nMore');
  ed.commands.setTextSelection(posOf(ed, 'More', true));
  insertFootnote(ed);
  ed.commands.insertContent('New source.');
  expect(md(ed).trimEnd()).toBe('# T\n\nClaim[^1] here.\n\n[^1]: Old source.\n\nMore[^2]\n\n[^2]: New source.');
  expect(ed.view.dom.querySelectorAll('p.fndef').length).toBe(2);
  ed.commands.setTextSelection(posOf(ed, 'Claim'));
  (ed.view.dom.querySelector('sup.fnref') as HTMLElement).click();
  expect(ed.state.selection.$from.parent.textContent).toBe('[^1]: Old source.');
  // words that only look like one stay words: a mark is "[^…]" with no space in it
  const words = editorWith('a [^ b] c');
  expect(words.view.dom.querySelector('sup.fnref')).toBeNull();
  expect(md(editorWith(md(words)))).toBe(md(words));
});

test('a footnote of one word (a name, an address) is a footnote\'s line, not raw HTML, and its number leads to it', () => {
  for (const def of ['Wikipedia', 'https://example.com/a', 'More.']) {
    const ed = editorWith(`# T\n\nA claim[^1].\n\n[^1]: ${def}`);
    const kinds: string[] = [];
    ed.state.doc.forEach((n) => kinds.push(n.type.name));
    expect(kinds).not.toContain('htmlComment');
    expect(ed.state.doc.lastChild!.textContent).toBe(`[^1]: ${def}`);
    // saved and read back, the same (an address is kept as an autolink, <…>, as anywhere)
    expect(md(editorWith(md(ed)))).toBe(md(ed));
    if (!def.startsWith('http')) expect(md(ed).trimEnd()).toBe(`# T\n\nA claim[^1].\n\n[^1]: ${def}`);
  }
});

test('footnotes written one under another (GitHub, Obsidian) stay one line each after a save', () => {
  const ed = editorWith('# T\n\nsee[^1] and[^2]\n\n[^1]: First.\n[^2]: Second.');
  ed.commands.focus('end');
  ed.commands.insertContent('!');
  const saved = md(ed);
  expect(saved).toContain('[^1]: First.\n\n[^2]: Second.!');
  expect(ed.view.dom.querySelectorAll('p.fndef').length).toBe(2);
});
