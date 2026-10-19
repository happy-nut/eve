// The note's own menu (right-click, ⌥↩) offers what fits what is selected: words chosen get the marks, the
// highlighter among them (it was only ⌘⇧H, which nobody finds), not the whole note's export.
import { test, expect, afterEach } from 'vitest';
import { noteMenu } from './noteMenu';
import { editorWith, md, posOf } from './testEditor';
import { ui } from './ui.svelte';

afterEach(() => ui.closeMenu());
const shown = () => (ui.menu?.items ?? []).filter((i) => !i.hide).map((i) => i.label);

test('words selected: the highlighter and the other marks, no export', () => {
  const ed = editorWith('see this here');
  ed.commands.setTextSelection({ from: posOf(ed, 'this'), to: posOf(ed, 'this', true) });
  noteMenu(ed, null);
  expect(shown()).toContain('Highlight…');
  expect(shown().filter((l) => l.startsWith('Export'))).toEqual([]);
  // the pens come up in its place: the first is the plain one (==), another is written with its colour
  ui.menu!.items.find((i) => i.label === 'Highlight…')!.run!();
  expect(shown()).toEqual(['Yellow', 'Green', 'Blue', 'Pink', 'Purple']); // the pastel pens, named by their hue
  ui.menu!.items[0].run!();
  expect(md(ed)).toBe('see ==this== here');
  noteMenu(ed, null); ui.menu!.items.find((i) => i.label === 'Highlight…')!.run!();
  expect(shown()).toContain('Remove highlight');
  ui.menu!.items[1].run!();
  expect(md(ed)).toBe('see <mark style="background-color: #c9f2d4">this</mark> here');
});

test('nothing selected: the note\'s own things (paste, find, export), no marks', () => {
  const ed = editorWith('see this here');
  ed.commands.setTextSelection(posOf(ed, 'this'));
  noteMenu(ed, null);
  expect(shown()).toContain('Export as PDF…');
  expect(shown()).not.toContain('Highlight…');
});
