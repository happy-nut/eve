// A note deleted from the list comes back with ⌘Z, pressed there (or anywhere outside text); ⌘Z in a note stays the
// note's own undo.
import { test, expect } from 'vitest';
import { notes } from './notes.svelte';
import { ui } from './ui.svelte';

const cmdZ = (target: Element, shift = false) => {
  const e = new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: shift, bubbles: true });
  Object.defineProperty(e, 'target', { value: target });
  return e;
};

import { groups } from './groups.svelte';
import { history } from './history.svelte';

/** one action done, as the app does it: its step closes a moment after (history.svelte.ts) */
const done = () => new Promise((r) => setTimeout(r, 0));
/** a note made and written in (one left as made goes by itself as another opens: notes.svelte.ts, untouched) */
const made = (body: string, group?: string) => { const n = notes.create(body, group); notes.touched(n.id); return n; };
const row = () => document.body.appendChild(document.createElement('div'));
const where = (id: string) => { const n = notes.all.find((x) => x.id === id)!; return { deleted: n.deleted, group: n.group ?? '', parent: n.parent ?? '', icon: n.icon ?? '', wide: n.wide }; };

test('a note deleted from the list: ⌘Z there brings it back, open; ⇧⌘Z or ⌘Z in a note does not', async () => {
  history.clear();
  const a = made('# Keep\n\nx'), b = made('# Gone\n\ny');
  await done();
  notes.currentId = b.id;
  notes.remove(b.id);
  await done();
  const r = row();
  const text = document.createElement('div'); text.className = 'tiptap'; document.body.append(text);
  expect(ui.undoKey(cmdZ(text))).toBe(false); // the note's own undo
  expect(ui.undoKey(cmdZ(r, true))).toBe(false); // ⇧⌘Z is no undo
  expect(where(b.id).deleted).toBe(true);
  expect(ui.undoKey(cmdZ(r))).toBe(true);
  expect(where(b.id).deleted).toBe(false);
  expect(notes.currentId).toBe(b.id);
  notes.currentId = a.id;
  text.remove(); r.remove();
});

test('the toast\'s Undo and ⌘Z take a delete back once, not twice', async () => {
  history.clear();
  const a = made('# A\n\nx'); await done();
  notes.remove(a.id); await done();
  ui.toastAction();
  expect(where(a.id).deleted).toBe(false);
  expect(history.size).toBe(1); // the note's making, still there to undo; not the delete again
});

test('every change to the list is undoable, newest first: made, moved, nested, an icon, full width, deleted', async () => {
  history.clear();
  const a = made('# A\n\nx', ''); await done();
  const b = made('# B\n\ny', ''); await done();
  const before = { a: where(a.id), b: where(b.id) };
  notes.setGroup(b.id, 'Work'); await done();
  notes.setParent(a.id, b.id); await done();
  notes.setIcon(b.id, '🐢'); await done();
  notes.setWide(b.id, true); await done();
  notes.remove(a.id); await done();
  const r = row();
  ui.undoKey(cmdZ(r)); expect(where(a.id).deleted).toBe(false);
  ui.undoKey(cmdZ(r)); expect(where(b.id).wide).toBeUndefined();
  ui.undoKey(cmdZ(r)); expect(where(b.id).icon).toBe(before.b.icon);
  ui.undoKey(cmdZ(r)); expect(where(a.id).parent).toBe('');
  ui.undoKey(cmdZ(r)); expect(where(b.id).group).toBe('');
  ui.undoKey(cmdZ(r)); expect(where(b.id).deleted).toBe(true); // B's making taken back: it goes again
  ui.undoKey(cmdZ(r)); expect(where(a.id).deleted).toBe(true);
  expect(ui.undoKey(cmdZ(r))).toBe(false); // nothing left
  r.remove();
});

test('groups too: made, renamed, moved, deleted (its notes back in it)', async () => {
  history.clear();
  const g = groups.create(''); await done();
  const named = groups.rename(g, 'Ideas'); await done();
  const n = made('# In it\n\nx', named); await done();
  const inner = groups.create(''); await done();
  const moved = groups.move(inner, named, null)!; await done();
  const step = history.record(); const undo = groups.remove(named); await done();
  expect(groups.names).not.toContain(named);
  expect(where(n.id).group).toBe('');
  const r = row();
  ui.undoKey(cmdZ(r)); // the delete
  expect(groups.names).toContain(named);
  expect(where(n.id).group).toBe(named);
  ui.undoKey(cmdZ(r)); // the move
  expect(groups.names).not.toContain(moved);
  ui.undoKey(cmdZ(r)); ui.undoKey(cmdZ(r)); // the group made at the top, the note made in Ideas
  expect(where(n.id).deleted).toBe(true);
  ui.undoKey(cmdZ(r)); // the rename
  expect(groups.names).toContain(g);
  ui.undoKey(cmdZ(r)); // the group's making
  expect(groups.names).not.toContain(g);
  void step; void undo; r.remove();
});
