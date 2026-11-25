// A drawing's edits go back into its code a moment after the last one, each change written as one for the note's undo;
// its own write coming back is not read as a change from elsewhere, and a change from elsewhere (undo, sync) wins over
// a write still waiting.
import { test as plainTest, expect, vi } from 'vitest';
import { WriteBack, WRITE_BACK_MS } from './writeBack';

// the clock is faked inside each test only: the shared setup's afterEach, which runs first, waits on a real timer
const test = (name: string, body: () => void) => plainTest(name, () => {
  vi.useFakeTimers();
  try { body(); } finally { vi.useRealTimers(); }
});

function setup(code = 'A') {
  const box = { code, writes: [] as string[], starts: [] as boolean[], rereads: 0 };
  const wb = new WriteBack(code, (c, starts) => { box.writes.push(c); box.starts.push(starts); box.code = c; }, () => box.code);
  const arrive = (c: string) => { box.code = c; return wb.arrived(c, (x) => { box.rereads++; return x; }); };
  return { box, wb, arrive };
}
const field = () => document.createElement('input');

test('letters typed in a row into one field are written once, the last, a moment after, as one change', () => {
  const { box, wb } = setup();
  const f = field();
  expect(wb.drawn('A', f)).toBe(false);
  expect(wb.drawn('AB', f)).toBe(true);
  expect(wb.drawn('ABC', f)).toBe(true);
  vi.advanceTimersByTime(WRITE_BACK_MS - 1);
  expect(box.writes).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(box.writes).toEqual(['ABC']);
  expect(box.starts).toEqual([true]);
});

test('typed on in the same field after it was written, it goes on with the same change', () => {
  const { box, wb } = setup();
  const f = field();
  wb.drawn('AB', f);
  vi.advanceTimersByTime(WRITE_BACK_MS);
  wb.drawn('ABC', f);
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual(['AB', 'ABC']);
  expect(box.starts).toEqual([true, false]);
});

test('any other edit, however soon, writes the one waiting first: each is a change of its own', () => {
  const { box, wb } = setup();
  const f = field();
  wb.drawn('A+step');
  wb.drawn('A+Ship', f);
  expect(box.writes).toEqual(['A+step']);
  wb.drawn('A+Ship', f);
  wb.drawn('A+Ship+shape');
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual(['A+step', 'A+Ship', 'A+Ship+shape']);
  expect(box.starts).toEqual([true, true, true]);
});

test('typing again in a field left, or in another field, is a change of its own', () => {
  const { box, wb } = setup();
  const f = field(), g = field();
  wb.drawn('AB', f);
  wb.stopTyping();
  wb.drawn('ABC', f);
  wb.drawn('ABCD', g);
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual(['AB', 'ABC', 'ABCD']);
  expect(box.starts).toEqual([true, true, true]);
});

test('edits that come back to what is written write nothing', () => {
  const { box, wb } = setup();
  const f = field();
  wb.drawn('AB', f);
  wb.drawn('A', f);
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual([]);
});

test('the write coming back is not a change from elsewhere, nor one written before the edit waiting', () => {
  const { wb, arrive, box } = setup();
  wb.drawn('AB');
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(arrive('AB')).toBe(false);
  wb.drawn('ABC');
  wb.drawn('ABCD');
  expect(arrive('ABC')).toBe(false);
  expect(box.rereads).toBe(0);
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual(['AB', 'ABC', 'ABCD']);
});

test('a change from elsewhere drops the waiting write and the drawing is read anew', () => {
  const { wb, arrive, box } = setup();
  wb.drawn('AB');
  expect(arrive('Z')).toBe(true);
  vi.advanceTimersByTime(WRITE_BACK_MS * 2);
  expect(box.writes).toEqual([]);
  expect(box.rereads).toBe(1);
  expect(wb.drawn('Z')).toBe(false);
});

test('a write is not made over code that moved while it waited', () => {
  const { wb, box } = setup();
  wb.drawn('AB');
  box.code = 'moved';
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual([]);
});

test('flush writes what waits at once, and nothing when nothing waits', () => {
  const { wb, box } = setup();
  wb.flush('A');
  expect(box.writes).toEqual([]);
  wb.drawn('AB');
  wb.flush('AB');
  expect(box.writes).toEqual(['AB']);
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(box.writes).toEqual(['AB']);
});
