import { test, expect } from 'vitest';
import { createEditor, runEditorCommand } from './editor';
import { posOf } from './testEditor';

function editor(content: string, onNoteMove: (dir: -1 | 1, onTitle: boolean) => boolean) {
  const noop = () => {};
  const popup = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false } as any;
  const element = document.createElement('div');
  document.body.append(element);
  return createEditor({ element, content, onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI: popup, calendarUI: popup, emojiUI: popup, onNoteMove });
}

test('⌥↓ on the title line asks to move the note; taken, no line moves', () => {
  const asked: [number, boolean][] = [];
  const ed = editor('# Personal\n\none\n\ntwo', (dir, onTitle) => (asked.push([dir, onTitle]), true));
  ed.commands.setTextSelection(posOf(ed, 'Personal', true));
  runEditorCommand(ed, 'moveBlockDown');
  expect(asked).toEqual([[1, true]]);
  expect(ed.getText()).toBe('Personal\n\none\n\ntwo');
});

test('in the body the note is asked too (it may have just been opened from the list); declined, the line moves', () => {
  const asked: [number, boolean][] = [];
  const ed = editor('# Personal\n\none\n\ntwo', (dir, onTitle) => (asked.push([dir, onTitle]), false));
  ed.commands.setTextSelection(posOf(ed, 'one', true));
  runEditorCommand(ed, 'moveBlockDown');
  expect(asked).toEqual([[1, false]]);
  expect(ed.getText()).toBe('Personal\n\ntwo\n\none');
});
