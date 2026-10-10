import { test, expect, afterEach } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { editorWith, md, posOf } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

const note = ['above', '', '| a1 | b1 |', '| --- | --- |', '| a2 | b2 |', '', 'below'].join('\n');

/** what is left selected after a text selection from `from` to `to`, once the table plugins have had their say */
function selected(from: [string, boolean?], to: [string, boolean?]) {
  const ed = editorWith(note);
  const anchor = posOf(ed, from[0], from[1]), head = posOf(ed, to[0], to[1]);
  ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, anchor, head)));
  const s = ed.state.selection;
  return '$anchorCell' in s ? 'cells' : ed.state.doc.textBetween(s.from, s.to, '|');
}

test('a selection from a cell out of the table stays a text selection past the table', () => {
  expect(selected(['a2', true], ['low'])).toBe('|b2|be');
  expect(selected(['1'], ['ove'])).toBe('ove|a');
});

test('ending at the very start of a line below the table, or of the table, it is not folded into one cell', () => {
  expect(selected(['a2'], ['below'])).toBe('a2|b2|');
  expect(selected(['b1', true], ['above'])).toBe('above|a1|b1');
});

test('one that stays in the table still folds the way prosemirror-tables does it', () => {
  expect(selected(['a1'], ['b1'])).toBe('a1');
});

const save = (s: string) => md(editorWith(s));

test.each([
  ['in a callout', '> [!note]\n> | A |\n> | --- |\n> | x |'],
  ['in a quote', '> | A |\n> | --- |\n> | x |'],
  ['marks at the end of a cell', '| A |\n| --- |\n| ***b*** |'],
  ['two marks in a cell', '| A |\n| --- |\n| ~~s~~ ==h== |'],
  ['a mark after text', '| A | B |\n| --- | --- |\n| c**q** | d |'],
  ['with a picture', '| A |\n| --- |\n| ![i](a.png) |'],
  ['with a sized picture and text', '| A |\n| --- |\n| a ![i\\|240](a.png) b |'],
  ['with a line break', '| A |\n| --- |\n| a<br>b |'],
])('a table %s is written as it was read', (_what, note) => {
  expect(save(note).trimEnd()).toBe(note);
  expect(save(save(note))).toBe(save(note));
});
