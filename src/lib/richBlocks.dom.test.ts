import { test, expect, afterEach } from 'vitest';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { editorWith, md, posOf, press, type } from './testEditor';
import { insertImage } from './image';
import { commitBoard } from './kanban';
import { parseBoard } from './board';

afterEach(() => { document.body.innerHTML = ''; });

const DIAGRAM = '```mermaid\nflowchart LR\n  n1(["Start"]) --> n2(["End"])\n```';
const note = (under = 'After') => `# t\n\nHello\n\n${DIAGRAM}\n\n${under}`;
const diagramPos = (ed: ReturnType<typeof editorWith>) => {
  let at = -1;
  ed.state.doc.descendants((n, pos) => { if (at < 0 && n.type.name === 'codeBlock') at = pos; return at < 0; });
  return at;
};
/** an empty line put in at the start of the paragraph saying `word`, the caret on it */
const emptyBefore = (ed: ReturnType<typeof editorWith>, word: string) => {
  const at = posOf(ed, word) - 1;
  const tr = ed.state.tr.insert(at, ed.schema.nodes.paragraph.create());
  ed.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)));
};
const caret = (ed: ReturnType<typeof editorWith>, pos: number) => ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, pos)));

test('⌫ at the start of the line under a drawn diagram selects it; the next ⌫ deletes it; one ⌘Z brings it back', () => {
  const ed = editorWith(note());
  caret(ed, posOf(ed, 'After'));
  press(ed, 'Backspace');
  const sel = ed.state.selection as NodeSelection;
  expect(sel).toBeInstanceOf(NodeSelection);
  expect(sel.node.attrs.language).toBe('mermaid');
  expect(sel.from).toBe(diagramPos(ed));
  expect(md(ed)).toContain('n1(["Start"]) --> n2(["End"])'); // not a letter of its code gone
  press(ed, 'Backspace');
  expect(md(ed)).not.toContain('mermaid');
  expect(md(ed)).toContain('After');
  ed.commands.undo();
  expect(md(ed)).toContain('n1(["Start"]) --> n2(["End"])');
});

test('⌫ on an empty line under a drawn diagram takes the line and selects the diagram', () => {
  const ed = editorWith(`# t\n\n${DIAGRAM}\n\nend`);
  emptyBefore(ed, 'end');
  press(ed, 'Backspace');
  expect(ed.state.selection).toBeInstanceOf(NodeSelection);
  expect(md(ed)).toContain('```\n\nend');
});

test('⌦ at the end of the line over a drawn diagram selects it', () => {
  const ed = editorWith(note());
  caret(ed, posOf(ed, 'Hello', true));
  press(ed, 'Delete');
  expect(ed.state.selection).toBeInstanceOf(NodeSelection);
  expect(md(ed)).toContain('Hello\n\n```mermaid');
});

test('typing with the diagram selected writes on a line under it, the diagram kept', () => {
  const ed = editorWith(note());
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, diagramPos(ed))));
  type(ed, 'Hi');
  expect(md(ed)).toContain('n2(["End"])\n```\n\nHi\n\nAfter');
  expect(ed.state.selection.$from.parent.textContent).toBe('Hi');
});

test('typing with the diagram selected uses the empty line under it', () => {
  const ed = editorWith(`# t\n\n${DIAGRAM}\n\nend`);
  emptyBefore(ed, 'end');
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, diagramPos(ed))));
  type(ed, 'x');
  expect(md(ed)).toContain('```\n\nx\n\nend');
});

test('a plain code block keeps its ⌫: the caret to the end of its code', () => {
  const ed = editorWith('# t\n\n```js\nlet a\n```\n\nAfter');
  caret(ed, posOf(ed, 'After'));
  press(ed, 'Backspace');
  expect(ed.state.selection).toBeInstanceOf(TextSelection);
  expect(ed.state.selection.$from.parent.type.name).toBe('codeBlock');
});

test('a picture from the / menu leaves the caret on a line under it, not on the picture', () => {
  const ed = editorWith('# t\n\nHello\n\nAfter');
  emptyBefore(ed, 'After');
  insertImage(ed, 'assets/a.png');
  expect(ed.state.selection).toBeInstanceOf(TextSelection);
  type(ed, 'x');
  expect(md(ed)).toContain('assets/a.png');
  expect(md(ed)).toMatch(/assets\/a\.png\)\n\nx\n\nAfter/);
});

test('a card made and its title typed in it are one step to undo', () => {
  const ed = editorWith('# t\n\n```kanban\n{"columns":[{"title":"To do","cards":[]}]}\n```\n\nend');
  let pos = -1;
  ed.state.doc.forEach((n, p) => { if (n.type.name === 'kanban') pos = p; });
  const cols = ed.state.doc.nodeAt(pos)!.attrs.columns;
  const card = { id: 'k1', title: '', body: '' };
  const withCard = [{ ...cols[0], cards: [card] }];
  commitBoard(ed, pos, withCard, 'card-k1');
  // typed a while later, past the history's own grouping
  const tr = ed.state.tr.setNodeMarkup(pos, undefined, { ...ed.state.doc.nodeAt(pos)!.attrs, columns: [{ ...cols[0], cards: [{ ...card, title: 'Buy' }] }] });
  ed.view.dispatch(tr.setMeta('composition', 'card-k1').setTime(Date.now() + 5000));
  expect(md(ed)).toContain('"title": "Buy"');
  ed.commands.undo();
  const after = parseBoard(/```kanban\n([\s\S]*?)\n```/.exec(md(ed))![1])!;
  expect(after[0].cards).toHaveLength(0);
});
