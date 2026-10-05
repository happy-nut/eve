import { test, expect } from 'vitest';

const { createEditor } = await import('./editor');
const { type } = await import('./testEditor');
const { flushEdits } = await import('./pending');

function editor(content: string) {
  const sent: string[] = [];
  const noop = () => {};
  const popup = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false } as any;
  const element = document.createElement('div');
  document.body.append(element);
  const ed = createEditor({ element, content, onUpdate: (md) => sent.push(md), onOpenNote: noop, targets: () => [], suggestionUI: popup, calendarUI: popup, emojiUI: popup });
  ed.commands.focus('end');
  return { ed, sent };
}
const long = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} with some words in it.`).join('\n\n');

test('a short note is handed over on every key', () => {
  const { ed, sent } = editor('# Short');
  type(ed, '!');
  expect(sent.at(-1)).toContain('# Short!');
  ed.destroy();
});

test('a long note waits for a pause, and anything that reads it first gets the last keys', () => {
  const { ed, sent } = editor(long);
  type(ed, 'XYZ');
  expect(sent).toEqual([]); // not on every key
  flushEdits(); // what notes.flush, flushAll and an export run first
  expect(sent.length).toBe(1);
  expect(sent[0].trimEnd().endsWith('XYZ')).toBe(true);
  flushEdits();
  expect(sent.length).toBe(1); // nothing left to hand over
  ed.destroy();
});

test('a long note closing hands over what is still waiting', () => {
  const { ed, sent } = editor(long);
  type(ed, 'Q');
  ed.destroy();
  expect(sent.length).toBe(1);
  expect(sent[0].trimEnd().endsWith('Q')).toBe(true);
});
