// Notion's trash and page history: what was deleted comes back from the trash or goes for good; a note goes back to a
// version of it as one step to undo
import { test, expect } from 'vitest';
import { notes } from './notes.svelte';

const make = (body: string) => { const n = notes.create(body); notes.touched(n.id); return n; };
const titles = () => notes.trash.map((n) => n.body.split('\n')[0]);

test('the trash lists deleted notes newest first; one restored is back and open, one deleted for good is gone', async () => {
  for (const n of notes.all) if (!n.deleted) notes.remove(n.id);
  notes.erase(notes.trash.map((n) => n.id));
  const a = make('# Alpha\n\nkeep me'), b = make('# Beta\n'), c = make('# Gamma\n');
  notes.remove(a.id);
  await new Promise((r) => setTimeout(r, 2));
  notes.remove(b.id);
  expect(titles()).toEqual(['# Beta', '# Alpha']);
  notes.restore(a.id);
  expect(notes.currentId).toBe(a.id);
  expect(notes.all.find((n) => n.id === a.id)!.body).toBe('# Alpha\n\nkeep me');
  expect(titles()).toEqual(['# Beta']);
  notes.erase([b.id]);
  expect(titles()).toEqual([]);
  // deleted for good keeps the tombstone sync needs, and nothing of what it said
  expect(notes.all.find((n) => n.id === b.id)).toMatchObject({ deleted: true, body: '' });
  // a live note is never deleted for good by mistake
  notes.erase([c.id]);
  expect(notes.all.find((n) => n.id === c.id)!.body).toBe('# Gamma\n');
});

test("a version restored replaces the note's words; the toast's Undo gives back what it said", async () => {
  const { ui } = await import('./ui.svelte');
  const n = make('# Plan\n\nnow\n');
  notes.restoreVersion(n.id, '# Plan\n\nthen\n', 'Oct 25, 09:00');
  expect(notes.all.find((x) => x.id === n.id)!.body).toBe('# Plan\n\nthen\n');
  expect(ui.toastMsg?.message).toBe('Restored the version from Oct 25, 09:00');
  ui.toastAction();
  expect(notes.all.find((x) => x.id === n.id)!.body).toBe('# Plan\n\nnow\n');
});
