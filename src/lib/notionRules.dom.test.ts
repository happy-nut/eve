// What Notion's own typing rules and keys do, done the same in Eve (notion.com/help/keyboard-shortcuts).
import { test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf, type, press } from './testEditor';
import { slashItems } from './slash';

afterEach(() => { document.body.innerHTML = ''; });

/** `text` typed at the start of the line `at` (its end with `end`), the note as saved */
const typed = (note: string, at: string, text: string, end = false) => {
  const ed = editorWith(note);
  ed.commands.setTextSelection(posOf(ed, at, end));
  type(ed, text);
  return md(ed).trimEnd();
};

test('"a. " and "i. " make a numbered list, as "1. " does', () => {
  for (const mark of ['a. ', 'i. ', '1. ']) expect(typed('x\n\none', 'one', mark)).toBe('x\n\n1. one');
  // under a numbered list it carries the count on
  expect(typed('1. x\n\ntwo', 'two', 'a. ')).toBe('1. x\n2. two');
  // on a bullet's line it turns that line numbered
  expect(typed('- x\n- y', 'y', 'a. ')).toBe('- x\n\n1. y');
  // only at a line's start, and only a, i and numbers
  expect(typed('x', 'x', ' b. no', true)).toBe('x b. no');
  expect(typed('x\n\nno', 'no', 'b. ')).toBe('x\n\nb. no');
});

test('\'" \' makes a quote, as "| " does', () => {
  for (const mark of ['" ', '“ ', '| ']) expect(typed('x\n\nsaid', 'said', mark)).toBe('x\n\n> said');
  expect(typed('x', 'x', ' "quoted" ', true)).toBe('x "quoted"');
});

test('~words~ are struck through, as ~~words~~ are', () => {
  expect(typed('x', 'x', ' ~gone~ ok', true)).toBe('x ~~gone~~ ok');
  expect(typed('x', 'x', ' ~~gone~~ ok', true)).toBe('x ~~gone~~ ok');
  // a range, a wave after a word, and a tilde with a space inside stay text
  for (const plain of [' 10~20~30', ' 안녕~ 반가워~', ' ~ no~', ' ~no ~']) {
    const ed = editorWith('x');
    ed.commands.setTextSelection(posOf(ed, 'x', true));
    type(ed, plain);
    expect(md(ed)).not.toContain('~~');
    expect(ed.state.doc.textContent).toBe(`x${plain}`);
  }
});

/** `keys` pressed with the caret at the end of `at` (or `at` chosen whole, with `choose`), the note as saved */
const pressed = (note: string, at: string, key: string, init: KeyboardEventInit, choose = false) => {
  const ed = editorWith(note);
  if (choose) ed.commands.setTextSelection({ from: posOf(ed, at), to: posOf(ed, at, true) });
  else ed.commands.setTextSelection(posOf(ed, at, true));
  press(ed, key, init);
  return md(ed).trimEnd();
};
const modAlt = { ctrlKey: true, altKey: true }, modShift = { ctrlKey: true, shiftKey: true };

test('⌘⌥4…8 make a to-do, bullets, numbers, a toggle and code, as in Notion; the keys Eve had still work', () => {
  expect(pressed('# T\n\nx', 'x', '4', modAlt)).toBe('# T\n\n- [ ] x');
  expect(pressed('# T\n\nx', 'x', '5', modAlt)).toBe('# T\n\n- x');
  expect(pressed('# T\n\nx', 'x', '6', modAlt)).toBe('# T\n\n1. x');
  expect(pressed('# T\n\nx', 'x', '7', modAlt)).toContain('<details');
  expect(pressed('# T\n\nx', 'x', '8', modAlt)).toBe('# T\n\n```\nx\n```');
  expect(pressed('# T\n\nx', 'x', '8', modShift)).toBe('# T\n\n- x');
  expect(pressed('# T\n\ngone', 'gone', 's', modShift, true)).toBe('# T\n\n~~gone~~');
  expect(pressed('# T\n\ngone', 'gone', 'x', modShift, true)).toBe('# T\n\n~~gone~~');
});

test('⌘⇧↑↓ move the line, as ⌥↑↓ did (and still do)', () => {
  expect(pressed('# T\n\na\n\nb', 'a', 'ArrowDown', modShift)).toBe('# T\n\nb\n\na');
  expect(pressed('# T\n\na\n\nb', 'b', 'ArrowUp', { altKey: true })).toBe('# T\n\nb\n\na');
});

test('⌘D duplicates the line: a list\'s line as an item, a toggle\'s title as the toggle, never the title', () => {
  expect(pressed('# T\n\na\n\nb', 'a', 'd', { ctrlKey: true })).toBe('# T\n\na\n\na\n\nb');
  expect(pressed('# T\n\n- a\n- b', 'a', 'd', { ctrlKey: true })).toBe('# T\n\n- a\n- a\n- b');
  expect(pressed('# T\n\nx', 'T', 'd', { ctrlKey: true })).toBe('# T\n\nx');
  const toggle = '<details open>\n<summary>Title</summary>\n\nbody\n\n</details>';
  expect(pressed(`# T\n\n${toggle}`, 'Title', 'd', { ctrlKey: true }).split('<details').length - 1).toBe(2);
  // the copy is what is chosen after it, as in Notion
  const ed = editorWith('# T\n\na\n\nb');
  ed.commands.setTextSelection(posOf(ed, 'a', true));
  press(ed, 'd', { ctrlKey: true });
  type(ed, '2');
  expect(md(ed).trimEnd()).toBe('# T\n\na\n\na2\n\nb');
});

test('⌘⌥T opens every toggle, and closes them all once all are open', () => {
  const t = (open: boolean, n: number) => `<details${open ? ' open' : ''}>\n<summary>T${n}</summary>\n\nbody${n}\n\n</details>`;
  const ed = editorWith(`# T\n\n${t(false, 1)}\n\n${t(true, 2)}`);
  const opens = () => { const o: boolean[] = []; ed.state.doc.descendants((n) => { if (n.type.name === 'details') o.push(n.attrs.open); }); return o; };
  ed.commands.setTextSelection(posOf(ed, 'body2', true));
  press(ed, 't', modAlt);
  expect(opens()).toEqual([true, true]);
  press(ed, 't', modAlt);
  expect(opens()).toEqual([false, false]);
  // the caret that was in a toggle now closed is on its title, where it can be seen
  expect(ed.state.selection.$from.parent.textContent).toBe('T2');
});

test('⌘A chooses the line first, then (pressed again) the note', () => {
  const ed = editorWith('# T\n\nfirst line\n\nsecond');
  ed.commands.setTextSelection(posOf(ed, 'first', true));
  const e1 = press(ed, 'a', { ctrlKey: true });
  expect(e1.defaultPrevented).toBe(true);
  expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('first line');
  press(ed, 'a', { ctrlKey: true });
  expect(ed.state.selection.from).toBeLessThan(posOf(ed, 'T', true));
  expect(ed.state.selection.to).toBeGreaterThanOrEqual(posOf(ed, 'second', true));
});

test('⌘K with no words chosen is left to the app (search); with words chosen it links them', () => {
  const ed = editorWith('# T\n\nwords');
  ed.commands.setTextSelection(posOf(ed, 'words', true));
  expect(press(ed, 'k', { ctrlKey: true }).defaultPrevented).toBe(false);
  ed.commands.setTextSelection({ from: posOf(ed, 'words'), to: posOf(ed, 'words', true) });
  expect(press(ed, 'k', { ctrlKey: true }).defaultPrevented).toBe(true);
});

test('"/turn" offers what the line can become, plain text too; "/color" colours the line', () => {
  const labels = (q: string) => slashItems(q).map((i) => i.label);
  expect(labels('turn')).toContain('Text');
  expect(labels('turn')).not.toContain('Kanban');
  expect(labels('turnh2')).toEqual(['Heading 2']);
  expect(labels('turnbullet')).toEqual(['Bulleted list']);
  const ed = editorWith('# T\n\npaint me');
  ed.commands.setTextSelection(posOf(ed, 'paint', true));
  const pens = slashItems('color');
  expect(pens.at(-1)!.label).toBe('Default');
  pens.find((i) => i.label.endsWith('background'))!.run!(ed); // the first pen: the plain one
  expect(md(ed).trimEnd()).toBe('# T\n\n==paint me==');
  pens.at(-1)!.run!(ed);
  expect(md(ed).trimEnd()).toBe('# T\n\npaint me');
});
