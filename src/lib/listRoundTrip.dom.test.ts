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
