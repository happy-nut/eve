import { test, expect } from 'vitest';
import { editorWith, md } from './testEditor';

// the empty line the editor keeps after a note ending in a block is the editor's: written down, merely opening the
// note changed it, and it grew a blank line each time
test.each([
  ['a code block', '# T\n\n```js\nconst x = 1;\n```'],
  ['a table', '# T\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'],
])('a note ending in %s reads back as it was, once the editor has added its last line', (_, text) => {
  const ed = editorWith(text);
  ed.view.dispatch(ed.state.tr); // what opening the note does
  expect(ed.state.doc.lastChild!.type.name).toBe('paragraph');
  expect(md(ed).trim()).toBe(text);
});

test('an empty line between lines is kept; empty lines at the very end are not written', () => {
  expect(md(editorWith('# T\n\nline\n\n\u00a0\n\nmore'))).toContain('\u00a0');
  expect(md(editorWith('# T\n\nline\n\n\u00a0\n\n\u00a0')).trim()).toBe('# T\n\nline');
});
