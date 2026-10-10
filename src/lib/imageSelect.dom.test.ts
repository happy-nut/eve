import { test, expect, afterEach } from 'vitest';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { editorWith, md, press } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

/** a drag from the end of the title to the start of "end" */
function dragAcross(note: string) {
  const ed = editorWith(note);
  const doc = ed.state.doc;
  const from = doc.firstChild!.nodeSize - 1;
  let to = 0;
  doc.forEach((n, pos) => { if (n.textContent === 'end') to = pos + 1; });
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(doc, from, to)).setMeta('pointer', true)); // as ProseMirror marks a mouse's
  return ed;
}

test('a drag that holds nothing but the picture becomes the picture', () => {
  const ed = dragAcross('# t\n\n![](assets/a.png)\n\nend');
  expect(ed.state.selection).toBeInstanceOf(NodeSelection);
});

test('⇧ + an arrow across the picture keeps the end the selection grew from', () => {
  const ed = editorWith('# t\n\n![](assets/a.png)\n\nend');
  const doc = ed.state.doc, from = doc.firstChild!.nodeSize - 1;
  let to = 0;
  doc.forEach((n, pos) => { if (n.textContent === 'end') to = pos + 1; });
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(doc, from, to))); // no pointer: the keyboard
  expect(ed.state.selection).toBeInstanceOf(TextSelection);
  expect(ed.state.selection.anchor).toBe(from);
});

test.each([
  ['a divider', '# t\n\n![](assets/a.png)\n\n---\n\nend'],
  ['empty lines', '# t\n\n![](assets/a.png)\n\n \n\n \n\nend'],
])('a drag across the picture and %s takes them all, and ⌫ removes them all', (_what, note) => {
  const ed = dragAcross(note);
  expect(ed.state.selection).not.toBeInstanceOf(NodeSelection);
  press(ed, 'Backspace');
  expect(md(ed).trim()).toBe('# tend');
});
