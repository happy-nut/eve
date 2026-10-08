import { test, expect } from 'vitest';
import { editorWith, md, posOf, type, press } from './testEditor';

// a list around a loose list is loose too, as markdown reads it back: the note is the same when opened again
test('Enter twice inside a nested list leaves markdown that reads back as itself', () => {
  const ed = editorWith('# T\n\n- a\n  - b\n    - c\n    - d');
  ed.commands.setTextSelection(posOf(ed, 'c', true));
  press(ed, 'Enter');
  press(ed, 'Enter');
  type(ed, 'x');
  const once = md(ed);
  expect(once).toContain('x');
  expect(md(editorWith(once))).toBe(once);
});
