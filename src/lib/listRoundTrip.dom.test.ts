import { test, expect, afterEach } from 'vitest';
import { editorWith, md } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

test.each([
  ['a toggle', '- [ ] task\n\n  <details open>\n  <summary>sum</summary>\n\n  body\n\n  </details>'],
  ['a board', '- [ ] plan\n\n  ```kanban\n  {"columns":[{"title":"A","cards":[]}]}\n  ```'],
])('%s inside a to-do is still there after the note is read again', (_what, note) => {
  const once = md(editorWith(note));
  const twice = md(editorWith(once));
  expect(twice).toBe(once);
  expect(twice).toMatch(/^- \[ \] (task|plan)\n/);
  expect(twice).toMatch(/<summary>sum<\/summary>|```kanban/);
});

test.each([
  ['a ``` line', 'x\n```\ny'],
  ['a ~~~ fence around ```', '```'],
  ['four backticks', 'a ```` b'],
])('code holding %s comes back as the same code', (_what, code) => {
  const ed = editorWith('');
  ed.commands.setContent({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: code }] }] });
  const once = md(ed);
  const back = editorWith(once);
  // one code block, and nothing after it but the empty line the editor keeps at the end
  back.state.doc.forEach((n, _p, i) => { if (i > 0) expect(`${n.type.name}:${n.textContent}`).toBe('paragraph:'); });
  expect(back.state.doc.firstChild!.type.name).toBe('codeBlock');
  expect(back.state.doc.firstChild!.textContent).toBe(code);
  expect(md(back)).toBe(once);
});

test('plain code keeps its usual ``` fence', () => {
  expect(md(editorWith('```js\nlet a = 1\n```'))).toBe('```js\nlet a = 1\n```');
});

test.each([
  ['to-dos then a bullet', '- [ ] a\n  - [ ] b\n\n- c'],
  ['a bullet then to-dos', '- c\n\n- [ ] a\n- [x] b'],
])('%s, written tight, read back tight', (_what, note) => {
  const once = md(editorWith(note));
  expect(md(editorWith(once))).toBe(once);
  expect(once).toBe(note);
});

test('a run written loose stays loose', () => {
  const note = '- [ ] a\n\n- [ ] b\n\n- c';
  const once = md(editorWith(note));
  expect(md(editorWith(once))).toBe(once);
});

test('a table keeps its columns\' alignment', () => {
  const note = '| Name | Qty | Note |\n| :--- | ---: | :---: |\n| a | 1 | x |';
  const once = md(editorWith(note));
  expect(once.trim()).toBe(note);
  expect(md(editorWith(once))).toBe(once);
  expect(md(editorWith('| A | B |\n| --- | --- |\n| 1 | 2 |')).trim()).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
});

test.each([
  ['in a quote', '> - [ ] t\n> - b\n>\n>   para'],
  ['in a callout', '> [!note]\n> - [ ] t\n> - b\n>\n>   second paragraph'],
  ['a loose run in a quote', '> - [ ] t\n>\n> - [ ] u\n>\n> - b'],
])('to-dos and bullets %s keep their paragraphs apart', (_what, note) => {
  const once = md(editorWith(note));
  expect(md(editorWith(once))).toBe(once);
  for (const word of ['para', 'second paragraph']) if (note.includes(word)) expect(once).not.toMatch(new RegExp(`\\S${word}`));
  const words = (t: string) => t.replace(/^>\s*$/gm, '').replace(/\s/g, ''); // the runs' own blank ">" line aside
  expect(words(once)).toBe(words(note));
});
