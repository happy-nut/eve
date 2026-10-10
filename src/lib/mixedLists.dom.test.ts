import { test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf } from './testEditor';
import type { Editor } from '@tiptap/core';

// numbered lists, bullets and to-dos nested in one another: what the keys do to them, and that what they leave is
// read back the same

afterEach(() => { document.body.innerHTML = ''; });

function key(ed: Editor, k: string) {
  const parts = k.split('-'), name = parts.pop()!;
  const ev = new KeyboardEvent('keydown', { key: name, shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt'), ctrlKey: parts.includes('Mod'), bubbles: true, cancelable: true });
  ed.view.someProp('handleKeyDown', (f) => f(ed.view, ev));
}
function type(ed: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = ed.state.selection;
    if (!ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, ch, () => ed.state.tr.insertText(ch, from, to)))) ed.view.dispatch(ed.state.tr.insertText(ch, from, to));
  }
}
const at = (ed: Editor, word: string, end = true) => ed.commands.setTextSelection(posOf(ed, word, end));
/** what the keys left, after checking it reads back as itself */
function after(note: string, steps: (ed: Editor) => void): string {
  const ed = editorWith(note);
  steps(ed);
  const out = md(ed).trim();
  expect(md(editorWith(out)).trim()).toBe(out);
  return out;
}

test('Tab on a numbered item leaves the bullets under it bullets', () => {
  expect(after('1. a\n2. b\n   - x\n3. c', (ed) => { at(ed, 'b'); key(ed, 'Tab'); })).toBe('1. a\n   1. b\n   - x\n2. c');
});

test('⇧Tab undoes Tab on an item whose sub-items are of another kind', () => {
  for (const [note, word] of [
    ['1. one\n2. two\n   - x\n3. three', 'two'],
    ['- [ ] one\n- [ ] two\n  - x\n- [ ] three', 'two'],
    ['- one\n- two\n  1. x\n- three', 'two'],
  ]) {
    const ed = editorWith(note);
    at(ed, word);
    key(ed, 'Tab');
    expect(md(ed).trim()).not.toBe(note);
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    ed.view.dom.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(md(ed).trim()).toBe(note);
  }
});

test('⌘⇧9 / ⌘⇧7 / ⌘⇧8 on a nested item change that item where it is', () => {
  expect(after('1. a\n   - x\n2. b', (ed) => { at(ed, 'x'); key(ed, 'Mod-Shift-9'); })).toBe('1. a\n   - [ ] x\n2. b');
  expect(after('1. a\n   - x\n   - y\n   - z\n2. b', (ed) => { at(ed, 'y'); key(ed, 'Mod-Shift-7'); })).toBe('1. a\n   - x\n   1. y\n   - z\n2. b');
  expect(after('- a\n  1. x\n- b', (ed) => { at(ed, 'x'); key(ed, 'Mod-Shift-8'); })).toBe('- a\n  - x\n- b');
});

test('a numbered list split in two goes on counting', () => {
  expect(after('1. a\n2. b\n3. c', (ed) => { at(ed, 'b', false); type(ed, '- '); })).toBe('1. a\n\n- b\n\n3. c');
  expect(after('1. a\n2. b\n3. c', (ed) => { at(ed, 'b'); key(ed, 'Mod-Shift-8'); })).toBe('1. a\n\n- b\n\n3. c');
  expect(after('1. a\n   - x\n2. b', (ed) => { at(ed, 'x'); key(ed, 'Alt-ArrowDown'); })).toBe('1. a\n\n- x\n\n2. b');
  expect(after('1. a\n2. b\n\n- c\n- d', (ed) => { at(ed, 'b'); key(ed, 'Alt-ArrowDown'); })).toBe('1. a\n\n- c\n\n2. b\n\n- d');
  expect(after('1. a\n   - [ ] t\n2. b', (ed) => { at(ed, 't'); key(ed, 'Enter'); key(ed, 'Enter'); type(ed, 'out'); })).toBe('1. a\n   - [ ] t\n\n- [ ] out\n\n2. b');
});

test('a numbered list inside an item counts from 1, so it is still a list when read back', () => {
  // markdown lets only a list starting at 1 begin under a line of text: "5." there was read as more of that line
  expect(after('1. a\n   - x\n2. b', (ed) => { at(ed, 'x', false); type(ed, '5. '); })).toBe('1. a\n   1. x\n2. b');
  expect(md(editorWith('1. a\n\n   5. x\n   6. y')).trim()).toMatch(/^1\. a\n\n?\s+1\. x\n\s+2\. y$/);
});

test('an item of two paragraphs makes its list loose, so it reads back the same', () => {
  after('1. a\n\n   more\n2. b', (ed) => { at(ed, 'more'); key(ed, 'Mod-Shift-8'); });
});

test('empty lines at the very end of a note are not written', () => {
  expect(after('1. a\n2. b', (ed) => { at(ed, 'b'); key(ed, 'Enter'); key(ed, 'Enter'); type(ed, 'para'); })).toBe('1. a\n2. b\n\npara');
});

test('⌫ at the start of a nested item steps it out a level, still its own kind', () => {
  expect(after('1. a\n   - b\n2. c', (ed) => { at(ed, 'b', false); key(ed, 'Backspace'); })).toBe('1. a\n\n- b\n\n2. c');
  // the items below it stay at their level, under it (as ⇧Tab leaves them)
  expect(after('- a\n  1. b\n  2. c\n- d', (ed) => { at(ed, 'b', false); key(ed, 'Backspace'); })).toBe('- a\n\n1. b\n   1. c\n\n- d');
  expect(after('1. a\n   1. b\n2. c', (ed) => { at(ed, 'b', false); key(ed, 'Backspace'); })).toBe('1. a\n2. b\n3. c');
  // at the top level the line becomes plain text, as before
  expect(after('1. a\n2. b', (ed) => { at(ed, 'b', false); key(ed, 'Backspace'); })).toBe('1. a\n\nb');
});
