// A failure Eve shows (an export, an import, a setting that did not take) is said as the reason alone:
// it was shown as String(err), so the window read "Error: …" or "TypeError: …" before the reason.
import { test, expect } from 'vitest';
import { errorText } from './ui.svelte';

test('an error is said as its reason, without the kind of error before it', () => {
  expect(errorText(new Error('Permission denied (os error 13)'))).toBe('Permission denied (os error 13).');
  expect(errorText(new TypeError('Load failed'))).toBe('Load failed.');
  expect(errorText('Error: the disk is full')).toBe('The disk is full.');
  expect(errorText('')).toBe('Something went wrong.');
  expect(errorText(undefined)).toBe('Something went wrong.');
});

test('a reason that already ends a sentence is not given a second stop', () => {
  expect(errorText('No space left on the disk.')).toBe('No space left on the disk.');
  expect(errorText('Is the drive there?')).toBe('Is the drive there?');
});
