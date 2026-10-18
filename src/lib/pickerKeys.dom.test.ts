// What ↩, ⇥, the arrows and Esc do with each popup at the caret up, as one table: the rules were three copies once
// and drifted apart (↩ after "a /" in a sentence made a new page; "items :ok" ↩ put 🆗 in place of the words). Every
// popup in PICKERS (slash.ts) has its rows here: a new one fails the first test until it is given them.
import { test, expect, vi, afterEach } from 'vitest';

// the emoji list from disk (jsdom has no server to fetch it from)
vi.mock('./emoji', async (original) => {
  const real = await original<typeof import('./emoji')>();
  const data = (await import('emoji-picker-element-data/en/emojibase/data.json')).default;
  return { ...real, loadEmoji: async () => data };
});

const { createEditor } = await import('./editor');
const { type, press, posOf } = await import('./testEditor');
const { PICKERS } = await import('./slash');
import type { PickerId, SuggestItem } from './slash';
import type { EmojiEntry } from './emoji';
import type { Note } from './notes.svelte';

const settle = () => new Promise((r) => setTimeout(r, 0));
const made: { destroy(): void }[] = [];
afterEach(async () => { await settle(); for (const e of made.splice(0)) e.destroy(); document.body.innerHTML = ''; });

/** an editor with every popup drawn by a stand-in that says what it picked (and what the pointer did) */
function editor(content: string) {
  const picked: string[] = [];
  let list: SuggestItem[] = [], sel = 0, pickItem: (i: SuggestItem) => void = () => {};
  let row: EmojiEntry[] = [], at = 0, pickEmoji: (e: EmojiEntry) => void = () => {};
  let day = '', pickDay: (iso: string) => void = () => {};
  const suggestionUI = {
    show(items: SuggestItem[], _r: DOMRect | null, cb: (i: SuggestItem) => void) { list = items; sel = 0; pickItem = cb; },
    move(d: number) { sel = (sel + d + list.length) % list.length; },
    expand: () => false, collapse: () => false,
    // a new page would go to it: only said, not made
    select() { if (!list.length) return false; picked.push(list[sel].label); if (list[sel].label !== 'New page') pickItem(list[sel]); return true; },
    hide() { list = []; },
    visible: () => list.length > 0,
    chosen: () => false,
  };
  const emojiUI = {
    show(items: EmojiEntry[], _r: DOMRect | null, cb: (e: EmojiEntry) => void) { row = items; at = 0; pickEmoji = cb; },
    move(d: number) { at = (at + d + row.length) % row.length; },
    select() { if (!row.length) return false; picked.push(row[at].emoji); pickEmoji(row[at]); return true; },
    hide() { row = []; },
    visible: () => row.length > 0,
    chosen: () => false,
  };
  const calendarUI = {
    show(iso: string | null, _r: DOMRect | null, cb: (iso: string) => void) { day = iso ?? ''; pickDay = cb; },
    move() {}, month() {},
    select() { if (!day) return false; picked.push(day); pickDay(day); return true; },
    hide() { day = ''; },
    visible: () => !!day,
  };
  const element = document.createElement('div');
  document.body.append(element);
  const targets = () => [{ id: 'm', body: '# Meeting notes\n' } as Note];
  const ed = createEditor({ element, content, onUpdate: () => {}, onOpenNote: () => {}, targets, suggestionUI, calendarUI, emojiUI });
  made.push(ed);
  return { ed, picked, open: () => suggestionUI.visible() || emojiUI.visible() || calendarUI.visible() };
}

type Outcome = 'picked' | 'new line' | 'nothing';
type Action = 'letters, ↩' | 'letters, ⇥' | 'arrows, ↩' | 'Esc, ↩';
const ACTIONS: Action[] = ['letters, ↩', 'letters, ⇥', 'arrows, ↩', 'Esc, ↩'];

interface Trigger {
  picker: PickerId;
  /** the note, and what is typed at the end of its last line to bring the popup up (`empty`: the line emptied first) */
  note: string; opens: string; empty?: boolean;
  /** two letters that find something */
  letters: string;
  /** the arrow that walks it */
  arrow: string;
  expect: Record<Action, Outcome>;
}

/** today's rules, one row per way a popup comes up */
const TABLE: Record<string, Trigger> = {
  // a "/" opening its line is a block asked for: ↩ takes the first, whatever came before it
  '"/" at a line\'s start': {
    picker: 'slash', note: '# T\n\nx', empty: true, opens: '/', letters: 'he', arrow: 'ArrowDown',
    expect: { 'letters, ↩': 'picked', 'letters, ⇥': 'picked', 'arrows, ↩': 'picked', 'Esc, ↩': 'new line' },
  },
  // a "/" after words: it picks once a letter after it found something, or the arrows chose a row
  '"/" in a sentence': {
    picker: 'slash', note: '# T\n\nsee', opens: ' /', letters: 'he', arrow: 'ArrowDown',
    expect: { 'letters, ↩': 'picked', 'letters, ⇥': 'picked', 'arrows, ↩': 'picked', 'Esc, ↩': 'new line' },
  },
  // a title being typed: ↩ links what it found
  '"[["': {
    picker: 'wiki', note: '# T\n\nsee', opens: ' [[', letters: 'Me', arrow: 'ArrowDown',
    expect: { 'letters, ↩': 'picked', 'letters, ⇥': 'picked', 'arrows, ↩': 'picked', 'Esc, ↩': 'new line' },
  },
  // the start of a name ("@to", tomorrow so far) is not a day asked for: ↩ is a new line, ⇥ or the arrows pick
  '"@"': {
    picker: 'date', note: '# T\n\ndue', opens: ' @', letters: 'to', arrow: 'ArrowLeft',
    expect: { 'letters, ↩': 'new line', 'letters, ⇥': 'picked', 'arrows, ↩': 'picked', 'Esc, ↩': 'new line' },
  },
  // the row comes up after any colon and two letters: it picks once ←→ chose one
  '":"': {
    picker: 'emoji', note: '# T\n\nitems', opens: ' :sm', letters: 'il', arrow: 'ArrowRight',
    expect: { 'letters, ↩': 'new line', 'letters, ⇥': 'nothing', 'arrows, ↩': 'picked', 'Esc, ↩': 'new line' },
  },
};

test('every popup in PICKERS has its rows in the table', () => {
  const covered = new Set(Object.values(TABLE).map((t) => t.picker));
  expect(Object.keys(PICKERS).filter((id) => !covered.has(id as PickerId))).toEqual([]);
});

const cases = Object.entries(TABLE).flatMap(([name, t]) => ACTIONS.map((a) => [name, a, t.expect[a]] as const));
test.each(cases)('%s, %s: %s', async (name, action, want) => {
  const t = TABLE[name];
  const { ed, picked, open } = editor(t.note);
  const last = t.note.split('\n').at(-1)!;
  ed.commands.focus();
  ed.commands.setTextSelection(posOf(ed, last, true));
  if (t.empty) ed.commands.deleteRange({ from: posOf(ed, last), to: posOf(ed, last, true) });
  type(ed, t.opens);
  await settle();
  if (action.startsWith('letters')) { type(ed, t.letters); await settle(); }
  expect(open(), 'the popup is up').toBe(true);
  if (action === 'arrows, ↩') press(ed, t.arrow);
  if (action === 'Esc, ↩') press(ed, 'Escape');
  const lines = ed.state.doc.childCount;
  press(ed, action === 'letters, ⇥' ? 'Tab' : 'Enter');
  await settle();
  const got: Outcome = picked.length ? 'picked' : ed.state.doc.childCount > lines ? 'new line' : 'nothing';
  expect(got).toBe(want);
});
