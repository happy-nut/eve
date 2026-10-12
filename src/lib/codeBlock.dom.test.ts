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

describe('highlighting', () => {
  const grammars = async (ed: ReturnType<typeof editorWith>) => {
    for (let i = 0; i < 100 && !ed.view.dom.querySelector('[class*="hljs-"]'); i++) await new Promise((r) => setTimeout(r, 20));
  };
  const keywords = (ed: ReturnType<typeof editorWith>, i: number) =>
    [...ed.view.dom.querySelectorAll('pre')[i].querySelectorAll('.hljs-keyword')].map((e) => e.textContent);

  test('typing in one block: it is highlighted again, the others keep theirs', async () => {
    const ed = editorWith('# T\n\n```js\nlet a = 1\n```\n\n```js\nconst b = 2\n```');
    await grammars(ed);
    expect(keywords(ed, 0)).toEqual(['let']);
    expect(keywords(ed, 1)).toEqual(['const']);
    ed.commands.setTextSelection(posOf(ed, '1', true));
    type(ed, '; return');
    expect(keywords(ed, 0)).toEqual(['let', 'return']);
    expect(keywords(ed, 1)).toEqual(['const']);
    ed.commands.setTextSelection(posOf(ed, 'const'));
    type(ed, 'var x; ');
    expect(keywords(ed, 0)).toEqual(['let', 'return']);
    expect(keywords(ed, 1)).toEqual(['var', 'const']);
  });

  test('a long block with no language: drawn plain, its language not guessed', async () => {
    const ed = editorWith('# T\n\n```js\nlet a\n```\n\n```\n' + 'let x = 1;\n'.repeat(300) + '```');
    await grammars(ed);
    expect(keywords(ed, 0)).toEqual(['let']);
    expect(ed.view.dom.querySelectorAll('pre')[1].querySelector('[class*="hljs-"]')).toBeNull();
  });
});

describe('inline code keeps its spaces', () => {
  for (const code of ['a  b', '  ', ' ', 'x ', ' x ', '  x', 'a`b', '`a`'])
    test(JSON.stringify(code), () => {
      const ed = editorWith('# T');
      ed.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'p ' }, { type: 'text', text: code, marks: [{ type: 'code' }] }, { type: 'text', text: '.' }] }] });
      const saved = md(ed);
      const back = editorWith(saved);
      let got = '';
      back.state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'code')) got += n.text; });
      expect(got).toBe(code);
      expect(md(back)).toBe(saved);
    });
});

describe('a line after a line break (⇧↵) stays a line of the paragraph', () => {
  for (const line of ['# y', '- y', '+ y', '1. y', '1) y', '> y', '---', '===', '## y *z*'])
    test(JSON.stringify(line), () => {
      const ed = editorWith('# T');
      ed.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'line' }, { type: 'hardBreak' }, { type: 'text', text: line }] }] });
      const back = editorWith(md(ed));
      expect(back.state.doc.childCount).toBe(1);
      expect(back.state.doc.firstChild!.type.name).toBe('paragraph');
      expect(back.state.doc.firstChild!.textBetween(0, back.state.doc.firstChild!.content.size, '', '\n')).toBe('line\n' + line);
    });
});
