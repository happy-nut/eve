import { describe, test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf, type, press } from './testEditor';
import { runEditorCommand } from './editor';

afterEach(() => { document.body.innerHTML = ''; });

const blockAt = (ed: ReturnType<typeof editorWith>, word: string) => ed.state.doc.resolve(posOf(ed, word)).parent.type.name;

describe('code block: ⌫ makes it plain where it is', () => {
  test('an emptied block in a list: the line stays in the list, the list in one piece', () => {
    const ed = editorWith('# T\n\n- item\n\n  ```\n  x\n  ```\n- next');
    const at = posOf(ed, 'x');
    ed.commands.setTextSelection({ from: at, to: at + 1 });
    press(ed, 'Backspace');
    press(ed, 'Backspace');
    type(ed, 'new');
    expect(md(ed)).toBe('# T\n\n- item\n\n  new\n\n- next'); // one list, the line in its first item
  });

  test('an emptied block in a callout: one callout still', () => {
    const ed = editorWith('> [!💡]\n> hi\n>\n> ```\n> x\n> ```\n>\n> more');
    const at = posOf(ed, 'x');
    ed.commands.setTextSelection({ from: at, to: at + 1 });
    press(ed, 'Backspace');
    press(ed, 'Backspace');
    type(ed, 'new');
    expect(md(ed)).toBe('> [!💡]\n> hi\n>\n> new\n>\n> more');
  });

  test("at the start of the note's first block: its lines stay lines on save", () => {
    const ed = editorWith('```\nline1\nline2\n```\n\nafter');
    ed.commands.setTextSelection(1);
    press(ed, 'Backspace');
    expect(md(ed)).toBe('line1\\\nline2\n\nafter');
  });
});

test('↑ at the start of a code block heading the note: a line above it', () => {
  const ed = editorWith('```\nline1\n```\n\nafter');
  ed.commands.setTextSelection(1);
  press(ed, 'ArrowUp');
  type(ed, 'new');
  expect(md(ed)).toBe('new\n\n```\nline1\n```\n\nafter');
});

describe('```lang typed', () => {
  for (const [lang, saved] of [['c++', 'c++'], ['TypeScript', 'typescript'], ['C#', 'c#'], ['python3', 'python3']])
    test(`${lang}: a code block in it`, () => {
      const ed = editorWith('# T\n\nz');
      ed.commands.setTextSelection({ from: posOf(ed, 'z'), to: posOf(ed, 'z', true) });
      type(ed, '```' + lang + ' ');
      type(ed, 'x');
      expect(md(ed)).toBe('# T\n\n```' + saved + '\nx\n```');
    });

  test('not in a table cell (a table keeps no code block)', () => {
    const ed = editorWith('| a | b |\n| - | - |\n| c | d |');
    ed.commands.setTextSelection(posOf(ed, 'c', true));
    type(ed, ' ```');
    type(ed, ' ');
    expect(ed.state.doc.resolve(posOf(ed, 'c')).parent.type.name).not.toBe('codeBlock');
  });
});

describe('⌘⌥C', () => {
  test('not in a table cell', () => {
    const ed = editorWith('| a | b |\n| - | - |\n| c | d |');
    ed.commands.setTextSelection(posOf(ed, 'c', true));
    runEditorCommand(ed, 'codeBlock');
    expect(blockAt(ed, 'c')).toBe('paragraph');
  });

  test('several lines: one code block of them all', () => {
    const ed = editorWith('# T\n\none\n\ntwo\n\nthree');
    ed.commands.setTextSelection({ from: posOf(ed, 'one'), to: posOf(ed, 'three', true) });
    runEditorCommand(ed, 'codeBlock');
    expect(md(ed)).toBe('# T\n\n```\none\ntwo\nthree\n```');
  });

  test('a whole list: one code block where the list was', () => {
    const ed = editorWith('# T\n\n- one\n- two\n\nafter');
    ed.commands.setTextSelection({ from: posOf(ed, 'one'), to: posOf(ed, 'two', true) });
    runEditorCommand(ed, 'codeBlock');
    expect(md(ed)).toBe('# T\n\n```\none\ntwo\n```\n\nafter');
  });

  test('one line: the stock toggle, both ways', () => {
    const ed = editorWith('# T\n\none');
    ed.commands.setTextSelection(posOf(ed, 'one'));
    runEditorCommand(ed, 'codeBlock');
    expect(md(ed)).toBe('# T\n\n```\none\n```');
    runEditorCommand(ed, 'codeBlock');
    expect(md(ed)).toBe('# T\n\none');
  });
});
