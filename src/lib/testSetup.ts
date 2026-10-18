import { afterEach, beforeEach } from 'vitest';
import { watchFocus, resetFocusWatch, allowFocusLoss, focusLossAllowed, probeFocus } from './focusWatch';

// Every DOM test is also a test that the keyboard is never left on <body> by accident (focusWatch.ts): a loss in a
// test fails it, unless the test says it means to (allowFocusLoss). Only focusWatch is imported here: a module
// loaded by the setup is shared with the test file, and a test that mocks './platform' (a phone) must still be
// the first to load ui.svelte.
let lost: string[] = [];
watchFocus((what) => lost.push(what));

beforeEach(() => {
  lost = [];
  resetFocusWatch();
});

// first of the afterEach hooks (vitest.config: sequence.hooks 'list'): what the test file's own afterEach does next
// (document.body.innerHTML = '', an editor destroyed) takes its page down, keyboard and all, and is no loss
afterEach(async () => {
  probeFocus();
  await new Promise((r) => setTimeout(r, 0)); // the watch looks a moment after a blur, or a removal
  const found = focusLossAllowed() ? [] : lost;
  lost = [];
  resetFocusWatch();
  allowFocusLoss();
  if (found.length) throw new Error(`the keyboard was left on <body>:\n  ${found.join('\n  ')}\n(allowFocusLoss() if the test means to)`);
});
