import { test, expect, afterEach } from 'vitest';
import { editorWith, md } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

const save = (s: string) => md(editorWith(s));

test.each([
  ['a ")" in its file name', '![a](<a)b.png>)'],
  ['a " in its title', '![a](x.png "say \\"hi\\"")'],
  ['parentheses that pair up', '![a](a(1).png)'],
])('a picture with %s is still a picture', (_what, note) => {
  expect(save(note)).toBe(note);
  expect(editorWith(note).state.doc.firstChild!.type.name).toBe('image');
});

test.each([
  ['an empty line at its end', '```\nx\n\n```'],
  ['two empty lines at its end', '```js\nx\n\n\n```'],
  ['no empty line at its end', '```\nx\n```'],
  ['nothing in it', '```\n```'],
  ['more after its language', '```js title="a.js" {1,3}\nx\n```'],
  ['an empty line at its end, in a quote', '> ```\n> x\n> \n> ```'],
  ['an empty line at its end, in a list', '- a\n\n  ```\n  x\n  \n  ```'],
])('code with %s is written as it was read', (_what, note) => {
  expect(save(note)).toBe(note);
});

test.each([
  ['code in a link', '[run `npm i` first](u)'],
  ['a link that is all code', '[`npm i`](u)'],
  ['code next to bold', '**a** `b` *c*'],
  ['code next to a link', '[a](u) `b`'],
])('%s is written as it was read', (_what, note) => {
  expect(save(note)).toBe(note);
});

test.each([
  ['a line starting "1) "', '1\\) Buy milk'],
  ['an item starting "2) "', '- 2\\) Buy milk'],
  ['"1)" alone', '1\\)'],
  ['a numbered list', '1. a\n2. b'],
  ['"1)" later in the line', 'a 1) b'],
])('%s is written as it was read', (_what, note) => {
  expect(save(note)).toBe(note);
});

test.each([
  ['an entity typed as text', '&lt;br&gt; and &amp;'],
  ['a number written as an entity', '&#123; and &#x41;'],
  ['an ampersand', 'Tom & Jerry, a&b'],
])('%s stays the text it was', (_what, text) => {
  const ed = editorWith('');
  ed.commands.setContent({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] }, { type: 'paragraph', content: [{ type: 'text', text }] }] });
  const back = editorWith(md(ed));
  expect(back.state.doc.child(0).textContent).toBe(text);
  expect(back.state.doc.child(1).textContent).toBe(text);
  expect(md(back)).toBe(md(ed));
});

test('an ampersand is written as it was typed', () => {
  expect(save('Tom & Jerry, a&b')).toBe('Tom & Jerry, a&b');
});

test.each([
  ['two', '![a](x.png)\n![b](y.png)', '![a](x.png)\n\n![b](y.png)'],
  ['three, in an item', '- ![a](x.png)\n  ![b](y.png)\n  ![c](z.png)', '- ![a](x.png)\n\n  ![b](y.png)\n\n  ![c](z.png)'],
  ['two with a blank line between', '![a](x.png)\n\n![b](y.png)', '![a](x.png)\n\n![b](y.png)'],
  ['a picture and text', '![a](x.png)\ntext', '![a](x.png)\n\ntext'],
])('%s pictures on lines one after the other get no empty line between them', (_what, note, saved) => {
  expect(save(note)).toBe(saved);
  expect(save(saved)).toBe(saved);
});

test.each([
  ['code', '- a\n- ```\n  code\n  ```\n- c'],
  ['a heading', '- # heading\n- b'],
  ['a quote', '- > quote\n\n- b'],
  ['a callout', '- > [!note]\n  > x'],
  ['a table', '- | A |\n  | --- |\n  | x |'],
  ['a formula', '1. $$\n   x\n   $$\n2. b'],
  ['a list', '- - a\n  - b\n- c'],
  ['code, in a loose list', '- a\n\n- ```\n  code\n  ```\n\n- c'],
])('an item starting with %s keeps it on its line, in the list', (_what, note) => {
  expect(save(note).trimEnd()).toBe(note);
});

test('an item with an empty line before its code is still written so', () => {
  const note = '- \u00a0\n\n  ```\n  code\n  ```';
  expect(save(note)).toBe(note);
});

test.each([
  ['numbered to-dos', '1. [ ] task\n2. [x] done'],
  ['a numbered to-do of two paragraphs', '1. [X] task\n\n   more'],
])('%s keep their words and their numbers', (_what, note) => {
  expect(save(note)).toBe(note);
});

test('the item a block starts is still an item whose first line is text', () => {
  const item = editorWith('- ```\n  code\n  ```').state.doc.firstChild!.firstChild!;
  expect(item.type.name).toBe('listItem');
  expect(item.firstChild!.type.name).toBe('paragraph');
  expect(item.child(1).type.name).toBe('codeBlock');
});

test('a quote starting with "[!note]" as text stays a quote', () => {
  const note = '> \\[!note\\] x';
  expect(editorWith(note).state.doc.firstChild!.type.name).toBe('blockquote');
  expect(save(note)).toBe(note);
  expect(editorWith('> [!note] x').state.doc.firstChild!.type.name).toBe('callout');
});

test('a typed "1) Buy milk" stays text', () => {
  const ed = editorWith('');
  ed.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1) Buy milk' }] }] });
  const back = editorWith(md(ed));
  expect(back.state.doc.firstChild!.type.name).toBe('paragraph');
  expect(back.state.doc.firstChild!.textContent).toBe('1) Buy milk');
});

test.each([
  ['bold', 'Meeting with **Alice**\nand Bob', 'Meeting with **Alice** and Bob'],
  ['code', 'run `npm i`\nfirst', 'run `npm i` first'],
  ['a link', 'see [docs](u)\nfor more', 'see [docs](u) for more'],
  ['a [[link]]', 'see [[Page]]\nfor more', 'see [[Page]] for more'],
  ['a date', 'due @2026-01-02\nor later', 'due @2026-01-02 or later'],
  ['a formula', 'so $x$\nholds', 'so $x$ holds'],
  ['a highlight', 'a ==hi==\nthere', 'a ==hi== there'],
  ['underline', 'a <u>u</u>\nthere', 'a <u>u</u> there'],
  ['bold, in a to-do', '- [ ] call **Alice**\n  and Bob', '- [ ] call **Alice** and Bob'],
])('a line break right after %s keeps the words apart', (_what, note, saved) => {
  expect(save(note)).toBe(saved);
  expect(save(saved)).toBe(saved);
});

test.each([
  ['bold, in a quote', '> a\n>\n> **b** c'],
  ['italic, in a quote', '> a\n>\n> *b* c'],
  ['a highlight, in a quote', '> a\n>\n> ==b== c'],
  ['strike, in a callout', '> [!note] t\n> x\n>\n> ~~b~~ c\n\nafter'],
  ['bold, in a list in a quote', '> - a\n>\n>   ~~b~~'],
  ['bold, in both paragraphs of a quote', '> **a**\n>\n> **b**'],
])('a paragraph starting with %s stays where it was', (_what, note) => {
  expect(save(note)).toBe(note);
  expect(save(save(note))).toBe(note);
});

test.each([
  ['a type in angle brackets', 'a list of Array<string> here'],
  ['a key in angle brackets', 'press <Enter> now'],
  ['a type with words in it', 'x <T extends Foo> y'],
  ['a video', '<video src="a.mp4"></video>'],
  ['a video of more lines, in a quote', '> <video src="a">\n> </video>'],
  ['an iframe', '<iframe src="https://x.com"></iframe>'],
  ['an iframe, in a list', '- <iframe src="x"></iframe>\n- b'],
  ['audio in a line', 'a <audio src="x.mp3" controls></audio> b'],
  ['an anchor', 'a <a name="x"></a> b'],
  ['an svg', '<svg width="10">\n<circle r="4"/>\n</svg>'],
  ['a checkbox', '<input type="checkbox"> x'],
])('%s is kept', (_what, note) => {
  expect(save(note)).toBe(note);
  expect(save(save(note))).toBe(note);
});

test('words in angle brackets are text, and a line of them does not take the lines under it', () => {
  expect(editorWith('Array<string> and <Enter>').state.doc.firstChild!.textContent).toBe('Array<string> and <Enter>');
  expect(editorWith('<Enter>\n- item').state.doc.child(1).type.name).toBe('bulletList');
});
