import { describe, test, expect, afterEach } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { editorWith, md, posOf, press, type } from './testEditor';

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

test('Enter in a cell is a line break in it, saved as <br> the way ⇧Enter saves one', () => {
  const ed = editorWith('# t\n\n| h |\n| --- |\n| a1 |');
  const before = md(ed);
  ed.commands.setTextSelection(posOf(ed, 'a1', true));
  press(ed, 'Enter');
  type(ed, 'next');
  expect(md(ed)).toBe('# t\n\n| h |\n| --- |\n| a1<br>next |\n');
  expect(md(editorWith(md(ed)))).toBe(md(ed));
  ed.commands.undo();
  expect(md(ed)).toBe(before);
});

describe('a selection from text into a cell, cleared: the text out of the table goes, the cells it covers are emptied', () => {
  const grid = '| h1 | h2 |\n| --- | --- |\n| a1 | a2 |\n| b1 | b2 |';
  const cleared = (note: string, from: [string, boolean?], to: [string, boolean?], act: (ed: ReturnType<typeof editorWith>) => void) => {
    const ed = editorWith(note);
    const before = md(ed);
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, posOf(ed, ...from), posOf(ed, ...to))));
    act(ed);
    const after = md(ed);
    expect(md(editorWith(after))).toBe(after);
    ed.commands.undo();
    expect(md(ed)).toBe(before);
    return { ed, after };
  };

  test.each(['Backspace', 'Delete'])('from the line above, %s: every row and column kept', (key) => {
    const { after } = cleared(`above\n\n${grid}`, ['bove'], ['a1', true], (ed) => press(ed, key));
    expect(after).toBe('a\n\n|  |  |\n| --- | --- |\n|  | a2 |\n| b1 | b2 |\n');
  });

  test('from the line above, typing: the letter where the selection began', () => {
    const { after } = cleared(`above\n\n${grid}`, ['bove'], ['a1', true], (ed) => type(ed, 'X'));
    expect(after).toBe('aX\n\n|  |  |\n| --- | --- |\n|  | a2 |\n| b1 | b2 |\n');
  });

  test('from a cell to the line below', () => {
    let left = '';
    const { after } = cleared(`${grid}\n\nbelow`, ['b1', true], ['elow'], (ed) => {
      press(ed, 'Backspace');
      left = ed.state.doc.resolve(ed.state.selection.from).parent.textContent;
    });
    expect(after).toBe('| h1 | h2 |\n| --- | --- |\n| a1 | a2 |\n| b1 |  |\n\nelow');
    expect(left).toBe('b1');
  });

  /** a clipboard event as the webview fires it, its data kept in `data` */
  const clip = (type: 'cut' | 'paste', data: Record<string, string> = {}) => {
    const clipboardData = { getData: (t: string) => data[t] ?? '', setData: (t: string, v: string) => { data[t] = v; }, clearData: () => {}, files: [], types: Object.keys(data) };
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clipboardData', { value: clipboardData });
    return { e, data };
  };

  test('cut: copied whole, then cleared as ⌫ clears it', () => {
    let data: Record<string, string> = {};
    const { after } = cleared(`above\n\n${grid}`, ['bove'], ['a1', true], (ed) => {
      const cut = clip('cut');
      ed.view.dom.dispatchEvent(cut.e);
      data = cut.data;
    });
    expect(after).toBe('a\n\n|  |  |\n| --- | --- |\n|  | a2 |\n| b1 | b2 |\n');
    expect(data['text/plain']).toContain('bove');
    expect(data['text/plain']).toContain('a1');
    const { after: below } = cleared(`${grid}\n\nbelow`, ['b1', true], ['elow'], (ed) => { ed.view.dom.dispatchEvent(clip('cut').e); });
    expect(below).toBe('| h1 | h2 |\n| --- | --- |\n| a1 | a2 |\n| b1 |  |\n\nelow');
  });

  test.each([
    ['a word', 'X', 'aX', 'Xelow'],
    ['lines', 'X\nY', 'aX\n\nY', 'X\n\nYelow'],
    ['a list', '- X\n- Y', 'a\n\n- X\n- Y', '- X\n- Y\n\nelow'],
  ])('paste of %s: cleared, then put in out of the table, as at the end (the start) of a line', (_what, text, top, bottom) => {
    const { after } = cleared(`above\n\n${grid}`, ['bove'], ['a1', true], (ed) => { ed.view.dom.dispatchEvent(clip('paste', { 'text/plain': text }).e); });
    expect(after).toBe(`${top}\n\n|  |  |\n| --- | --- |\n|  | a2 |\n| b1 | b2 |\n`);
    const { after: below } = cleared(`${grid}\n\nbelow`, ['b1', true], ['elow'], (ed) => { ed.view.dom.dispatchEvent(clip('paste', { 'text/plain': text }).e); });
    expect(below).toBe(`| h1 | h2 |\n| --- | --- |\n| a1 | a2 |\n| b1 |  |\n\n${bottom}`);
  });
});

describe('a table opening the note: a line can be made above it', () => {
  test.each([
    ['↑ in its first row', 'h2', 'ArrowUp'],
    ['Enter at the very start of its first cell', 'h1', 'Enter'],
  ])('%s', (_what, word, key) => {
    const ed = editorWith('| h1 | h2 |\n| --- | --- |\n| a1 | a2 |');
    const before = md(ed);
    ed.commands.setTextSelection(posOf(ed, word));
    press(ed, key);
    type(ed, 'new');
    expect(md(ed)).toBe('new\n\n| h1 | h2 |\n| --- | --- |\n| a1 | a2 |\n');
    ed.commands.undo();
    expect(md(ed)).toBe(before);
  });

  test('↑ in a table with a line above it moves as it did, nothing made', () => {
    const ed = editorWith('above\n\n| h1 | h2 |\n| --- | --- |\n| a1 | a2 |');
    ed.commands.setTextSelection(posOf(ed, 'h1'));
    press(ed, 'ArrowUp');
    expect(md(ed)).toBe('above\n\n| h1 | h2 |\n| --- | --- |\n| a1 | a2 |\n');
  });
});
