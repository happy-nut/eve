import { test, expect } from 'vitest';
import { notes } from './notes.svelte';

const make = (body: string) => notes.create(body);
const retitle = (id: string, body: string) => { notes.update(id, body); notes.flush(id); };
const bodyOf = (id: string) => notes.all.find((n) => n.id === id)!.body;

test("a title passing through another note's on its way takes none of that note's links", () => {
  make('# Ideas\n');
  const two = make('# Ideas 2\n');
  const index = make('# Index\n\n[[Ideas]] and [[Ideas 2]] and [[ideas 2]] and [[Ideas 2#Plan]] and [[Ideas 2|shown]]\n');
  retitle(two.id, '# Ideas\n'); // backspaced the "2": for a moment the other note's title
  retitle(two.id, '# Ideas 3\n');
  expect(bodyOf(index.id)).toBe('# Index\n\n[[Ideas]] and [[Ideas 3]] and [[Ideas 3]] and [[Ideas 3#Plan]] and [[Ideas 3|shown]]\n');
});

test('a title emptied on the way to a new one takes its links along once it has one', () => {
  const a = make('# Draft\n');
  const index = make('# Index 2\n\n[[Draft]] and [[Untitled]]\n');
  retitle(a.id, '# \n');
  retitle(a.id, '# Final $1\n');
  expect(bodyOf(index.id)).toBe('# Index 2\n\n[[Final $1]] and [[Untitled]]\n');
});
