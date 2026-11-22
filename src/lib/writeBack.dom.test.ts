// A drawing's edits go back into its code a moment after the last one; its own write coming back is not read as a
// change from elsewhere, and a change from elsewhere (undo, sync) wins over a write still waiting.
import { test as plainTest, expect, vi } from 'vitest';
import { WriteBack, WRITE_BACK_MS } from './writeBack';

// the clock is faked inside each test only: the shared setup's afterEach, which runs first, waits on a real timer
const test = (name: string, body: () => void) => plainTest(name, () => {
  vi.useFakeTimers();
  try { body(); } finally { vi.useRealTimers(); }
});

function setup(code = 'A') {
  const box = { code, writes: [] as string[], rereads: 0 };
  const wb = new WriteBack(code, (c) => { box.writes.push(c); box.code = c; }, () => box.code);
  const arrive = (c: string) => { box.code = c; return wb.arrived(c, (x) => { box.rereads++; return x; }); };
  return { box, wb, arrive };
}

test('edits in a row are written once, the last one, a moment after', () => {
  const { box, wb } = setup();
  expect(wb.drawn('A')).toBe(false);
  expect(wb.drawn('AB')).toBe(true);
  expect(wb.drawn('ABC')).toBe(true);
  vi.advanceTimersByTime(WRITE_BACK_MS - 1);
  expect(box.writes).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(box.writes).toEqual(['ABC']);
});

test('the write coming back is not a change from elsewhere', () => {
  const { wb, arrive, box } = setup();
  wb.drawn('AB');
  vi.advanceTimersByTime(WRITE_BACK_MS);
  expect(arrive('AB')).toBe(false);
  expect(box.rereads).toBe(0);
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
