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

test('a link to a note whose title holds "#" opens that note, not a new one', () => {
  const cs = make('# C# notes\n\nx\n');
  make('# Elsewhere\n');
  const before = notes.all.length;
  notes.openByTitle('C# notes');
  expect(notes.currentId).toBe(cs.id);
  notes.openByTitle('c# notes#Setup');
  expect(notes.currentId).toBe(cs.id);
  expect(notes.section).toBe('Setup');
  expect(notes.all.length).toBe(before);
});

test('renaming "C" leaves a link to the note "C# notes" alone, and takes its own sections along', () => {
  make('# C# notes\n');
  const c = make('# C\n');
  const index = make('# Index 3\n\n[[C# notes]] and [[C]] and [[C#Sec]]\n');
  retitle(c.id, '# Go\n');
  expect(bodyOf(index.id)).toBe('# Index 3\n\n[[C# notes]] and [[Go]] and [[Go#Sec]]\n');
});

test('a title is read past HTML: a tag around it, a line of HTML or a comment above it', async () => {
  const { titleOf } = await import('./notes.svelte');
  expect(titleOf({ body: '# <span style="color:red">Plan</span>\n' })).toBe('Plan');
  expect(titleOf({ body: '<div align="center">\n\n# Project\n' })).toBe('Project');
  expect(titleOf({ body: '<!-- generated -->\n\n# Real title\n' })).toBe('Real title');
  expect(titleOf({ body: '# a \\<b\\> tag\n' })).toBe('a <b> tag'); // Keep's escaped text stays text
});
