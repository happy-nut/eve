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
