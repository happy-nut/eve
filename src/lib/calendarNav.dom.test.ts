// The calendar's row in the list: opened like a note (⌘1–9, next/previous, back), but never deleted.
import { test, expect } from 'vitest';
import { notes, stepFrom, CALENDAR } from './notes.svelte';
import { appearance } from './appearance.svelte';
import { CALENDAR_NOTE_ID } from './daily';

test('back from the calendar opened by its row goes to the note before it', () => {
  appearance.set({ dailyNotes: true });
  notes.ensureCalendar();
  const a = notes.create('# A\n');
  notes.currentId = CALENDAR_NOTE_ID; // ⌘1 on the calendar's row
  expect(notes.currentId).toBe(CALENDAR);
  notes.back();
  expect(notes.currentId).toBe(a.id);
});

test('next and previous note from the calendar or a daily note', () => {
  const list = [{ id: CALENDAR_NOTE_ID }, { id: 'a' }, { id: 'b' }];
  expect(stepFrom(list, CALENDAR, 1)?.id).toBe('a');
  expect(stepFrom(list, CALENDAR, -1)?.id).toBe('b');
  expect(stepFrom(list, 'a', 1)?.id).toBe('b');
  expect(stepFrom(list, 'b', 1)?.id).toBe(CALENDAR_NOTE_ID);
  // a daily note is not in the list: next is the first, previous the last
  expect(stepFrom(list, 'daily-2026-10-10', 1)?.id).toBe(CALENDAR_NOTE_ID);
  expect(stepFrom(list, 'daily-2026-10-10', -1)?.id).toBe('b');
});

test('a deleted calendar row comes back', () => {
  appearance.set({ dailyNotes: true });
  notes.ensureCalendar();
  notes.remove(CALENDAR_NOTE_ID);
  appearance.set({ dailyNotes: false });
  appearance.set({ dailyNotes: true });
  const dirty = notes.dirty;
  notes.ensureCalendar();
  expect(notes.visible.some((n) => n.id === CALENDAR_NOTE_ID)).toBe(true);
  expect(notes.dirty).toBeGreaterThan(dirty); // and sync hears of it
});

test('looking at a day in the calendar makes no note; writing in it does', () => {
  const id = 'daily-2026-03-04';
  const look = notes.dayDraft('2026-03-04');
  expect(look.body).toContain('2026-03-04');
  look.write(look.body); // the editor handing back what it was given
  look.write(look.body + '\n \n'); // an empty line
  expect(look.note).toBeNull();
  expect(notes.all.some((n) => n.id === id)).toBe(false);
  look.write(look.body + 'went hiking\n');
  expect(look.note?.id).toBe(id);
  expect(notes.all.find((n) => n.id === id)?.body).toContain('went hiking');
  // a day already written: its page shows it, and edits go to it
  const again = notes.dayDraft('2026-03-04');
  expect(again.body).toContain('went hiking');
  again.write('# 2026-03-04\n');
  expect(notes.all.find((n) => n.id === id)?.body).toBe('# 2026-03-04\n');
});
