// What kept opening a note slow with a big library, held off: each of these once cost a third of a second per note
// opened with 800 notes (e2e/perf.mjs measures the whole of it in WebKit).
import { test, expect } from 'vitest';
import { editorWith } from './testEditor';
import { notes } from './notes.svelte';
import { groups } from './groups.svelte';

test("switching notes leaves the page's stylesheets alone", () => {
  // a stylesheet taken out or put in makes the engine work out the style of the whole page again, list and all
  editorWith('# first').destroy(); // the first editor puts TipTap's stylesheet in, once
  const watch = new MutationObserver(() => {});
  watch.observe(document.head, { childList: true });
  for (let i = 0; i < 3; i++) editorWith(`# note ${i}`).destroy();
  editorWith('# last');
  const changed = watch.takeRecords().flatMap((m) => [...m.addedNodes, ...m.removedNodes].map((n) => n.nodeName));
  watch.disconnect();
  expect(changed).toEqual([]);
  expect(document.head.querySelectorAll('style[data-tiptap-style]').length).toBe(1);
});

test('the lists are kept between reads, not filtered and sorted again at each', () => {
  notes.create('# Kept\n');
  expect(notes.visible).toBe(notes.visible);
  expect(notes.pages).toBe(notes.pages);
  expect(notes.daily).toBe(notes.daily);
  expect(groups.notesIn('')).toBe(groups.notesIn(''));
  expect(notes.byTitle('kept')?.id).toBe(notes.visible.find((n) => n.body === '# Kept\n')?.id);
  // …and still follow a change
  const before = notes.visible;
  notes.create('# Another\n');
  expect(notes.visible).not.toBe(before);
  expect(notes.byTitle('Another')).toBeTruthy();
});
