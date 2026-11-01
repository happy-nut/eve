import { test, expect } from 'vitest';
import { importTree, type Source } from './importTree';
import { notes, titleOf } from './notes.svelte';

const tree = (files: Record<string, string>): Source[] =>
  Object.entries(files).map(([path, text]) => ({ path, text: async () => text, asset: async () => `assets/${path.split('/').pop()}` }));
const byTitle = (t: string) => notes.all.find((n) => !n.deleted && titleOf(n) === t)!;
/** the titles of the pages it is under, outermost first */
const pathOf = (id: string): string => { const n = notes.all.find((x) => x.id === id)!; return n.parent ? [pathOf(n.parent), titleOf(notes.all.find((x) => x.id === n.parent)!)].filter(Boolean).join('/') : ''; };

test('folders become pages of their names, a page’s folder its sub-pages, relative pictures come along', async () => {
  const made = await importTree(tree({
    'Notes/Trip.md': '# Trip\n\n![map](img/map%20one.png)\n\nSee [the plan](Trip/Plan.md) and [site](https://x.y).',
    'Notes/Trip/Plan.md': '# Plan\n\n![[photo.jpg]]',
    'Notes/Trip/Day 1.md': 'day one', // no heading: its file name is its title
    'Notes/img/map one.png': '',
    'Notes/media/photo.jpg': '',
    'Notes/Work/A/B/Deep.md': '# Deep',
    'Notes/alone.png': '',
  }));
  const trip = byTitle('Trip'), plan = byTitle('Plan'), day = byTitle('Day 1');
  expect(pathOf(trip.id)).toBe('Notes');
  expect([plan.parent, day.parent]).toEqual([trip.id, trip.id]);
  expect(notes.visible.filter((n) => titleOf(n) === 'Notes')).toHaveLength(1); // one page for the folder, not one a file
  expect(trip.body).toContain('![map](assets/map one.png)');
  expect(trip.body).toContain('[[Plan|the plan]]');
  expect(trip.body).toContain('[site](https://x.y)');
  expect(plan.body).toContain('![](assets/photo.jpg)');
  // as deep as the folders go
  expect(pathOf(byTitle('Deep').id)).toBe('Notes/Work/A/B');
  // pictures a note took are not notes of their own; one no note reached is
  const titles = made.map((m) => titleOf(m.note));
  expect(titles).not.toContain('map one');
  expect(titles).not.toContain('photo');
  expect(byTitle('alone').body).toContain('![](assets/alone.png)');
});

test('into a page: the tree under it, loose files beside it', async () => {
  const home = notes.create('# Home\n');
  await importTree(tree({ 'Box/In.md': '# In', 'Loose.md': '# Loose' }), home.id, home.id);
  expect(pathOf(byTitle('In').id)).toBe('Home/Box');
  expect(pathOf(byTitle('Loose').id)).toBe('Home');
});
