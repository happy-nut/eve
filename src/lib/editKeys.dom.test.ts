// The link dialog, the quote key on a list, and ↩ right after a --- divider.
import { test, expect } from 'vitest';
import { runEditorCommand } from './editor';
import { editorWith, md, posOf, press, type } from './testEditor';
import { ui } from './ui.svelte';

const settle = () => new Promise((r) => setTimeout(r, 0));

/** ⌘⇧K, answered with `answer` (null: cancelled); returns what the dialog was opened with */
async function link(ed: ReturnType<typeof editorWith>, answer: string | null) {
  runEditorCommand(ed, 'link');
  const shown = ui.pending?.input;
  ui.done(answer);
  await settle();
  return shown;
}

test('a link: the address typed after the https:// it opens with is one address', async () => {
  const ed = editorWith('see this');
  ed.commands.setTextSelection({ from: posOf(ed, 'this'), to: posOf(ed, 'this', true) });
  expect(await link(ed, 'https://https://a.com/x')).toBe('https://');
  expect(md(ed)).toBe('see [this](https://a.com/x)');
  ed.commands.setTextSelection({ from: posOf(ed, 'see'), to: posOf(ed, 'see', true) });
  await link(ed, 'http://https://b.com');
  expect(md(ed)).toContain('[see](https://b.com)');
});

test('OK with only the scheme (or nothing) links nothing, and takes a link off', async () => {
  const ed = editorWith('see this');
  ed.commands.setTextSelection({ from: posOf(ed, 'this'), to: posOf(ed, 'this', true) });
  await link(ed, 'https://');
  expect(md(ed)).toBe('see this');
  const linked = editorWith('see [this](https://a.com)');
  linked.commands.setTextSelection(posOf(linked, 'this') + 1);
  expect(await link(linked, 'https://')).toBe('https://a.com');
  expect(md(linked)).toBe('see this');
  await link(ed, '');
  expect(md(ed)).toBe('see this');
});

test('no words chosen: the address goes in at the caret as a link of itself, and what is typed next is not', async () => {
  const ed = editorWith('see');
  ed.commands.setTextSelection(posOf(ed, 'see', true));
  type(ed, ' ');
  await link(ed, 'https://a.com');
  type(ed, ' ok');
  expect(md(ed)).toBe('see <https://a.com> ok');
  expect(ed.state.doc.firstChild!.lastChild!.marks).toEqual([]);
});

test('the quote key on a list line quotes the list, and again takes the quote off', () => {
  const ed = editorWith('- one\n- two\n\nafter');
  ed.commands.setTextSelection(posOf(ed, 'two', true));
  expect(runEditorCommand(ed, 'blockquote')).toBe(true);
  expect(md(ed)).toBe('> - one\n> - two\n\nafter');
  expect(runEditorCommand(ed, 'blockquote')).toBe(true);
  expect(md(ed)).toBe('- one\n- two\n\nafter');
  // to-dos too, and a plain line is as before
  const todo = editorWith('- [ ] a');
  todo.commands.setTextSelection(posOf(todo, 'a', true));
  runEditorCommand(todo, 'blockquote');
  expect(md(todo)).toBe('> - [ ] a');
  const line = editorWith('plain');
  line.commands.setTextSelection(posOf(line, 'plain', true));
  runEditorCommand(line, 'blockquote');
  expect(md(line)).toBe('> plain');
});

test('↩ right after --- made a divider adds no second empty line; the next ↩ does', () => {
  const ed = editorWith('above\n\nx');
  ed.commands.setTextSelection({ from: posOf(ed, 'x'), to: posOf(ed, 'x', true) });
  type(ed, '---');
  const count = ed.state.doc.childCount;
  press(ed, 'Enter');
  expect(ed.state.doc.childCount).toBe(count);
  type(ed, 'below');
  expect(md(ed)).toBe('above\n\n---\n\nbelow');
  press(ed, 'Enter');
  expect(ed.state.doc.childCount).toBe(count + 1);
});

test('after the divider, any other key first and ↩ is a new line again', () => {
  const ed = editorWith('above\n\nx');
  ed.commands.setTextSelection({ from: posOf(ed, 'x'), to: posOf(ed, 'x', true) });
  type(ed, '---');
  const count = ed.state.doc.childCount;
  press(ed, 'Shift');
  press(ed, 'Enter');
  expect(ed.state.doc.childCount).toBe(count + 1);
});
