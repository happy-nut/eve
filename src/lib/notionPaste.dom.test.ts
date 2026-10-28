// Blocks copied in Notion and pasted here come in as they were in Notion. Notion's copy (read from its web app's
// clipboard code with REA: the block-to-markdown table of its export module, and the copy that writes it) puts on the
// clipboard its blocks as markdown (text/plain) and that markdown drawn by markdown-it, breaks on, HTML off, ending in
// `<!-- notionvc: … -->` (text/html). Read as HTML, a to-do came in as a bullet reading "[x]", a callout as the words
// "<aside>", a formula as "$$". The markdown is read instead, Notion's own ways of writing turned into this note's.
import { test, expect, afterEach, describe } from 'vitest';
import MarkdownIt from 'markdown-it';
import { editorWith, md, paste, posOf } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

/** the clipboard as Notion leaves it for `markdown` */
const notion = (markdown: string) => ({
  text: markdown,
  html: new MarkdownIt({ linkify: true, breaks: true }).disable('escape').render(markdown) + '<!-- notionvc: 0b35e6e6-7f00-4000-8000-000000000001 -->',
});
const saved = (s: string) => md(editorWith(s)).trimEnd();
/** the note, its second line chosen: what is pasted takes its place */
function ready() {
  const ed = editorWith('# T\n\nzz');
  ed.commands.setTextSelection({ from: posOf(ed, 'zz'), to: posOf(ed, 'zz', true) });
  return ed;
}
function pasted(markdown: string): string {
  const ed = ready();
  const c = notion(markdown);
  paste(ed, c.text, c.html);
  return md(ed).trimEnd();
}

describe('blocks copied in Notion', () => {
  // each as Notion's export module writes it (its `L` table): a to-do `- [x] ` and the text after a space more, a
  // callout in <aside> with its icon first, children four spaces in, a formula between $$ lines
  for (const [name, from, to] of [
    ['to-dos', '- [ ]  buy milk\n- [x]  call mom', '- [ ] buy milk\n- [x] call mom'],
    ['a to-do with one under it', '- [ ]  plan\n    - [x]  book', '- [ ] plan\n  - [x] book'],
    ['a callout', '<aside>\n💡 Remember this\n\n</aside>', '> [!💡]\n> Remember this'],
    ['a callout with a line under it', '<aside>\n⚠️ Careful\n\nthe second line\n\n</aside>', '> [!⚠️]\n> Careful\n>\n> the second line'],
    ['a callout with no icon', '<aside>\nplain words\n\n</aside>', '> [!note]\n> plain words'],
    ['a formula', '$$\nE=mc^2\n$$', '$$\nE=mc^2\n$$'],
    ['bullets, one in another', '- parent\n    - child', '- parent\n  - child'],
    ['numbers', '1. one\n2. two', '1. one\n2. two'],
    ['a quote', '> said', '> said'],
    ['a table', '| a | b |\n| --- | --- |\n| 1 | 2 |', '| a | b |\n| --- | --- |\n| 1 | 2 |'],
    ['code', '```js\nlet a = 1\n```', '```js\nlet a = 1\n```'],
    ['headings', '# One\n\n## Two\n\n### Three', '# One\n\n## Two\n\n### Three'],
    ['a line written on Windows', '- [ ]  a\r\n- [x]  b', '- [ ] a\n- [x] b'],
  ]) {
    test(name, () => {
      expect(pasted(from)).toBe(saved(`# T\n\n${to}`));
    });
  }
  test('words: bold, italic, code, strike, a link', () => {
    expect(pasted('**bold** *it* `code` ~~gone~~ [site](https://example.com)')).toBe(saved('# T\n\n**bold** *it* `code` ~~gone~~ [site](https://example.com)'));
  });
});

describe('not from Notion', () => {
  test('HTML from elsewhere is read as HTML, as before', () => {
    const ed = ready();
    paste(ed, 'aside text', '<p><strong>aside</strong> text</p>');
    expect(md(ed).trimEnd()).toBe('# T\n\n**aside** text');
  });
});
