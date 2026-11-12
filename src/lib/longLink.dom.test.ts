// A bare address is cut short (…) only when it would not fit on one line of the note. It was cut at about 42
// letters wherever it was, so an address with room to spare across a wide note still ended in "…" — and on a
// phone, one shorter than 48 letters was never cut and ran on over two or three lines.
import { test, expect } from 'vitest';
import { editorWith } from './testEditor';

test('every bare address may be cut, however short: whether it is, is the line\'s width to say', () => {
  const U = 'https://example.com/a/b/c'; // 25 letters: two lines on a narrow phone
  const ed = editorWith(`# T\n\nsee ${U}`);
  ed.commands.setTextSelection(1);
  expect(ed.view.dom.querySelectorAll('.long-link').length).toBe(1);
});

// (the width the cut is at: app.css, held by zIndex.test.mjs)
