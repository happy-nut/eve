// Coming back to the window: the caret goes back where it was, but not over a click that brought the window back.
import { test, expect, vi } from 'vitest';
import { cameBack, WAIT } from './comeBack';

/** run with the clock in hand (put back before the shared after-test checks, which wait on real time) */
const clocked = (f: () => void) => () => { vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] }); try { f(); } finally { vi.useRealTimers(); } };
const press = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

test('back by ⌘Tab or the Dock: the caret is put back', clocked(() => {
  vi.advanceTimersByTime(1000);
  const restore = vi.fn();
  cameBack(restore);
  vi.advanceTimersByTime(WAIT);
  expect(restore).toHaveBeenCalledOnce();
}));

test('back by a click that lands just after the window\'s focus: the click keeps the caret it put', clocked(() => {
  vi.advanceTimersByTime(1000);
  const restore = vi.fn();
  cameBack(restore);
  vi.advanceTimersByTime(10);
  press();
  vi.advanceTimersByTime(WAIT);
  expect(restore).not.toHaveBeenCalled();
}));

test('back by a click that lands just before the window\'s focus: nothing is put back over it', clocked(() => {
  vi.advanceTimersByTime(1000);
  press();
  vi.advanceTimersByTime(30);
  const restore = vi.fn();
  cameBack(restore);
  vi.advanceTimersByTime(WAIT);
  expect(restore).not.toHaveBeenCalled();
}));
