// A callout copied and pasted in the editor: it comes back as it was, its icon not read as a line of it.
import { test, expect } from 'vitest';
import { editorWith, md } from './testEditor';

/** copy all of `note` as the editor puts it on the clipboard, and paste it into an empty note. A line in bold after
 *  it: with formatting on the clipboard the paste reads its HTML, not the markdown (as a whole note copied does) */
function roundTrip(note: string) {
  const from = editorWith(`${note}\n\n**bold**`);
  from.commands.selectAll();
  const { dom, text } = from.view.serializeForClipboard(from.state.selection.content());
  const to = editorWith('');
  const clipboardData = { getData: (t: string) => (t === 'text/html' ? dom.innerHTML : t === 'text/plain' ? text : ''), files: [], types: ['text/html', 'text/plain'] };
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: clipboardData });
  to.view.dom.dispatchEvent(e);
  return md(to).trim();
}

test.each([
  ['folded', '> [!warning]- Careful\n> inside'],
  ['an icon of its own', '> [!💡]\n> tip'],
  ['a line after it', '> [!note] Title\n> body\n\nafter'],
])('a %s callout copied and pasted is the same callout', (_, note) => {
  expect(roundTrip(note)).toBe(`${note}\n\n**bold**`);
});
