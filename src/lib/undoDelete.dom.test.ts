// A note deleted from the list comes back with ⌘Z, pressed there (or anywhere outside text); ⌘Z in a note stays the
// note's own undo. And the system's spelling help (corrections, a capital first letter) is off in a note unless asked.
import { test, expect } from 'vitest';
import { notes } from './notes.svelte';
import { ui } from './ui.svelte';
import { appearance } from './appearance.svelte';
import { editorWith } from './testEditor';

const cmdZ = (target: Element, shift = false) => {
  const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: shift, bubbles: true });
  Object.defineProperty(e, 'target', { value: target });
  return e;
};

test('a note deleted from the list: ⌘Z there brings it back, open; ⇧⌘Z or ⌘Z in a note does not', () => {
  const a = notes.create('# Keep\n\nx'), b = notes.create('# Gone\n\ny');
  notes.currentId = b.id;
  notes.remove(b.id);
  ui.undoable('Deleted “Gone”', () => notes.restore(b.id));
  const row = document.createElement('div');
  const text = document.createElement('div'); text.className = 'tiptap';
  document.body.append(row, text);
  expect(ui.undoKey(cmdZ(text))).toBe(false); // the note's own undo
  expect(ui.undoKey(cmdZ(row, true))).toBe(false); // ⇧⌘Z is no undo
  expect(notes.all.find((n) => n.id === b.id)?.deleted).toBe(true);
  expect(ui.undoKey(cmdZ(row))).toBe(true);
  expect(notes.all.find((n) => n.id === b.id)?.deleted).toBe(false);
  expect(notes.currentId).toBe(b.id);
  // taken back once: the toast's Undo and a second ⌘Z have nothing left of it
  expect(ui.toastMsg).toBe(null);
  expect(ui.undoKey(cmdZ(row))).toBe(false);
  notes.currentId = a.id;
  row.focus(); text.remove(); row.remove();
});

test('two deletes: ⌘Z takes back the newest first, then the one before', () => {
  const a = notes.create('# A\n\nx'), b = notes.create('# B\n\ny');
  for (const n of [a, b]) { notes.remove(n.id); ui.undoable(`Deleted ${n.id}`, () => notes.restore(n.id)); }
  const row = document.createElement('div');
  expect(ui.undoKey(cmdZ(row))).toBe(true);
  expect([a, b].map((n) => notes.all.find((x) => x.id === n.id)?.deleted)).toEqual([true, false]);
  expect(ui.undoKey(cmdZ(row))).toBe(true);
  expect([a, b].map((n) => notes.all.find((x) => x.id === n.id)?.deleted)).toEqual([false, false]);
});

test('spelling help: off in a note by default, on when Settings has it, without opening the note again', () => {
  appearance.set({ autoCorrect: false });
  const ed = editorWith('hello');
  const attrs = () => ['spellcheck', 'autocorrect', 'autocapitalize'].map((k) => ed.view.dom.getAttribute(k));
  expect(attrs()).toEqual(['false', 'off', 'off']);
  appearance.set({ autoCorrect: true });
  ed.view.setProps({}); // what Editor.svelte does on the change
  expect(attrs()).toEqual(['true', 'on', 'sentences']);
  appearance.set({ autoCorrect: false });
  ed.destroy();
});
