import { test, expect, vi, afterEach } from 'vitest';

// the emoji list from disk (jsdom has no server to fetch it from); the search itself is the real one
vi.mock('./emoji', async (original) => {
  const real = await original<typeof import('./emoji')>();
  const data = (await import('emoji-picker-element-data/en/emojibase/data.json')).default;
  return { ...real, loadEmoji: async () => data };
});

const { createEditor } = await import('./editor');
const { type, press, posOf } = await import('./testEditor');
import type { EmojiEntry } from './emoji';

// every editor a test makes is destroyed after it: one left running took the emoji list's late answer after the
// file's jsdom was gone ("document is not defined", an unhandled error that failed CI now and then)
const settle = () => new Promise((r) => setTimeout(r, 0));
const made: { destroy(): void }[] = [];
afterEach(async () => { await settle(); for (const e of made.splice(0)) e.destroy(); });

function editor() {
  let shown: EmojiEntry[] = [], pick: ((e: EmojiEntry) => void) | null = null, sel = 0;
  const noop = () => {};
  const popup = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false } as any;
  const emojiUI = {
    show(items: EmojiEntry[], _r: DOMRect | null, cb: (e: EmojiEntry) => void) { shown = items; pick = cb; sel = 0; },
    move(d: number) { sel = (sel + d + shown.length) % shown.length; },
    select() { if (!shown.length) return false; pick!(shown[sel]); return true; },
    hide() { shown = []; },
    visible: () => shown.length > 0,
  };
  const element = document.createElement('div');
  document.body.append(element);
  const ed = createEditor({ element, content: '', onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI: popup, calendarUI: popup, emojiUI });
  ed.commands.focus('end');
  made.push(ed);
  return { ed, row: () => shown.map((e) => e.emoji.replace(/️/g, '')) };
}

test(':fir shows up to five in a row, → chooses, ↩ puts it in place of what was typed', async () => {
  const { ed, row } = editor();
  type(ed, '좋아요 :fir');
  await settle();
  expect(row()[0]).toBe('🔥');
  expect(row().length).toBe(5);
  press(ed, 'ArrowRight');
  press(ed, 'Enter');
  expect(ed.getText()).toBe('좋아요 🎆');
});

test('Tab picks too, and is not taken for indenting while the row is up', async () => {
  const { ed } = editor();
  ed.commands.setContent('- [ ] a\n- [ ] b');
  ed.commands.setTextSelection(posOf(ed, 'b', true));
  type(ed, ' :tada');
  await settle();
  press(ed, 'Tab');
  expect(ed.getText()).toContain('b 🎉');
  expect(ed.state.doc.firstChild!.childCount).toBe(2); // b is still an item of its own, not under a
});

test('not after a digit, inside a word, or in code', async () => {
  const { ed, row } = editor();
  for (const text of ['12:30', 'http://x', 'a:b']) {
    ed.commands.setContent('');
    ed.commands.focus('end');
    type(ed, text);
    await settle();
    expect(row()).toEqual([]);
  }
  ed.commands.setContent('```\n\n```');
  ed.commands.focus('start');
  type(ed, ':fire');
  await settle();
  expect(row()).toEqual([]);
});
