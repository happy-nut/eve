import { test, expect, vi } from 'vitest';
import { watchFocus, allowFocusLoss } from './focusWatch';

const blurAway = () => {
  const input = document.body.appendChild(document.createElement('input'));
  input.focus();
  input.blur();
  input.remove();
};
const aMoment = () => new Promise((r) => setTimeout(r, 10));

test('a loss is reported a moment after the blur', async () => {
  allowFocusLoss();
  const report = vi.fn();
  const stop = watchFocus(report);
  blurAway();
  await aMoment();
  stop();
  expect(report).toHaveBeenCalled();
});

test('once stopped, a look still pending never runs: the page it would look at may be gone (a test file ended)', async () => {
  allowFocusLoss();
  const report = vi.fn();
  const stop = watchFocus(report);
  blurAway();
  stop();
  await aMoment();
  expect(report).not.toHaveBeenCalled();
});
