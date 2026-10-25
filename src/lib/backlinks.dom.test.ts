// Notion's backlinks: the notes whose [[links]] lead to a page, in every way a link can be written
import { test, expect } from 'vitest';
import { notes } from './notes.svelte';

const make = (body: string) => { const n = notes.create(body); notes.touched(n.id); return n; };
const from = (id: string) => notes.linksTo(id).map((l) => [notes.all.find((n) => n.id === l.note.id)!.body.split('\n')[0], l.line]);

test('a page is linked from every note that links it, by title, section, alias or any case; not from itself or code', () => {
  const plan = make('# Trip plan\n\nsee [[Trip plan]] here\n');
  make('# A\n\n- [ ] book [[Trip plan]] soon\n');
  make('# B\n\n> [[trip plan#Hotels|the hotels]] are ready\n');
  make('# C\n\n```\n[[Trip plan]]\n```\n');
  make('# D\n\nnothing [[Elsewhere]]\n');
  const gone = make('# E\n\n[[Trip plan]]\n');
  notes.remove(gone.id);
  expect(from(plan.id)).toEqual([['# A', 'book Trip plan soon'], ['# B', 'the hotels are ready']]);
});

test('a link written to the title a page had still counts, and a new link is seen as soon as it is written', () => {
  const p = make('# Old name\n');
  const a = make('# Notes\n\n[[Old name]]\n');
  expect(from(p.id).length).toBe(1);
  notes.update(p.id, '# New name\n');
  notes.flush(p.id); // the rename carries the link along
  expect(from(p.id)).toEqual([['# Notes', 'New name']]);
  notes.update(a.id, '# Notes\n\n[[New name]]\n\nand [[Elsewhere]]\n');
  const b = make('# Later\n\nabout [[New name]]\n');
  expect(from(p.id).map((x) => x[0])).toEqual(['# Notes', '# Later']);
  expect(notes.linksTo(b.id)).toEqual([]);
});
