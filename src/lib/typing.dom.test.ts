import { test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf, type, press } from './testEditor';
import { runEditorCommand } from './editor';

afterEach(() => { document.body.innerHTML = ''; });

// leaving a callout with Enter on its empty last line
test('Enter on a callout\'s empty last line does not touch the block after it', () => {
  for (const [after, want] of [
    ['## Head', '> [!💡]\n> one\n\nX\n\n## Head'],
    ['next', '> [!💡]\n> one\n\nX\n\nnext'],
    ['- item', '> [!💡]\n> one\n\nX\n\n- item'],
  ]) {
    const ed = editorWith(`> [!💡]\n> one\n\n${after}`);
    ed.commands.setTextSelection(posOf(ed, 'one', true));
    press(ed, 'Enter');
    press(ed, 'Enter');
    type(ed, 'X');
    expect(md(ed).trimEnd()).toBe(want);
  }
});

// a list / quote / toggle marker typed at the start of a table cell
test('"- " typed at the start of a table cell keeps the cell\'s text in the note', () => {
  for (const marker of ['- ', '1. ', '[] ', '| ', '> ']) {
    const ed = editorWith('| a | b |\n| --- | --- |\n| cell | d |');
    ed.commands.setTextSelection(posOf(ed, 'cell'));
    type(ed, marker);
    expect(ed.state.doc.textContent).toContain('cell'); // still on screen…
    expect(md(ed)).toContain('cell'); // …but not in the saved markdown
  }
});

// ⌥↓ / ⌥↑ inside a toggle
test('⌥↓ on a toggle\'s title (or ⌥↑ on its first body line) keeps the toggle whole', () => {
  const note = 'before\n\n<details open>\n<summary>Title</summary>\n\nbody\n\n</details>\n\nafter';
  for (const [word, cmd] of [['Title', 'moveBlockDown'], ['body', 'moveBlockUp']]) {
    const ed = editorWith(note);
    ed.commands.setTextSelection(posOf(ed, word, true));
    runEditorCommand(ed, cmd);
    const out = md(ed);
    // the title stays with its body: never a toggle with an empty <summary>
    expect(out).not.toContain('<summary></summary>');
    expect(out.match(/<details/g)!.length).toBe(1);
  }
});

// ⌥↑ / ⌥↓ inside a table cell
test('⌥↓ in a middle table cell does not swap two cells of the row', () => {
  const ed = editorWith('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |');
  ed.commands.setTextSelection(posOf(ed, '2', true));
  runEditorCommand(ed, 'moveBlockDown');
  expect(md(ed)).not.toContain('| 1 | 3 | 2 |');
});

// ⇧↩ (line break) in a table cell
test('a line break in a table cell reads back without a stray backslash', () => {
  const ed = editorWith('| a | b |\n| --- | --- |\n| c | d |');
  ed.commands.setTextSelection(posOf(ed, 'c', true));
  press(ed, 'Enter', { shiftKey: true });
  type(ed, 'e');
  const back = editorWith(md(ed));
  expect(back.state.doc.textContent).not.toContain('\\');
  // also: a note from elsewhere holding "c<br>e" in a cell is rewritten "c\ e" on its first save
  expect(md(editorWith('| a | b |\n| --- | --- |\n| c<br>e | d |'))).not.toContain('\\');
});

// ⇧↩ (line break) in a heading
test('a line break in a heading reads back as the same heading', () => {
  const ed = editorWith('# a');
  ed.commands.setTextSelection(posOf(ed, 'a', true));
  press(ed, 'Enter', { shiftKey: true });
  type(ed, 'b');
  const back = editorWith(md(ed));
  expect(back.state.doc.childCount === 1 || back.state.doc.child(1).content.size === 0).toBe(true);
  expect(back.state.doc.firstChild!.textContent).not.toContain('\\');
});

// ↩↩ on an empty numbered item under a bullet
test('↩ on an empty number under a bullet steps out still a number, as ⇧Tab and ⌫ do', () => {
  const ed = editorWith('- a\n  1. b\n- c');
  ed.commands.setTextSelection(posOf(ed, 'b', true));
  press(ed, 'Enter');
  press(ed, 'Enter');
  type(ed, 'x');
  expect(md(ed)).not.toBe('- a\n  1. b\n- x\n- c');
  expect(md(ed)).toMatch(/^1\. x$/m);
});

// "> " in front of a line holding a [[link]]
test('"> " in front of a line keeps its [[link]]', () => {
  const ed = editorWith('see [[Note]] today');
  ed.commands.setTextSelection(1);
  type(ed, '> ');
  expect(md(ed)).toContain('Note');
});

// a lone "-" / "1." / ">" then Enter
test('"-" then Enter is a new line, not a bullet', () => {
  for (const [typed, kind] of [['-', 'bulletList'], ['1.', 'orderedList'], ['>', 'details'], ['#', 'heading'], ['[]', 'taskList'], ['|', 'blockquote']]) {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, typed);
    press(ed, 'Enter');
    expect(ed.state.doc.firstChild!.type.name).not.toBe(kind);
  }
});

test('the same marks then a space still make the list, heading, to-do or toggle', () => {
  for (const [typed, kind] of [['- ', 'bulletList'], ['1. ', 'orderedList'], ['> ', 'details'], ['# ', 'heading'], ['[] ', 'taskList'], ['| ', 'blockquote']]) {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, typed);
    expect(ed.state.doc.firstChild!.type.name).toBe(kind);
  }
});

test('Tab in a table inside a list item goes to the next cell', () => {
  const ed = editorWith('- item\n\n  | a | b |\n  | --- | --- |\n  | one | two |');
  ed.commands.setTextSelection(posOf(ed, 'one', true));
  press(ed, 'Tab');
  expect(ed.state.selection.$from.parent.textContent).toBe('two');
});

test('"Q&A;" and "AT&T;" are saved as typed, "&lt;" typed as text still comes back as text', () => {
  for (const text of ['# Q&A; prep', 'AT&T; and R&D;']) expect(md(editorWith(text))).toBe(text);
  const ed = editorWith('');
  ed.commands.insertContent({ type: 'paragraph', content: [{ type: 'text', text: 'a &lt; b' }] });
  expect(editorWith(md(ed)).state.doc.textContent).toBe('a &lt; b');
});
