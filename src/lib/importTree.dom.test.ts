import { test, expect } from 'vitest';
import { importTree, type Source } from './importTree';
import { notes, titleOf } from './notes.svelte';

const tree = (files: Record<string, string>): Source[] =>
  Object.entries(files).map(([path, text]) => ({ path, text: async () => text, asset: async () => `assets/${path.split('/').pop()}` }));
const byTitle = (t: string) => notes.all.find((n) => !n.deleted && titleOf(n) === t)!;

test('folders become groups, a page’s folder its sub-pages, relative pictures come along', async () => {
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
  expect(trip.group).toBe('Notes');
  expect([plan.group, plan.parent, day.parent]).toEqual(['Notes', trip.id, trip.id]);
  expect(trip.body).toContain('![map](assets/map one.png)');
  expect(trip.body).toContain('[[Plan|the plan]]');
  expect(trip.body).toContain('[site](https://x.y)');
  expect(plan.body).toContain('![](assets/photo.jpg)');
  // groups go three deep; deeper folders land in the third
  expect(byTitle('Deep').group).toBe('Notes/Work/A');
  // pictures a note took are not notes of their own; one no note reached is
  const titles = made.map((m) => titleOf(m.note));
  expect(titles).not.toContain('map one');
  expect(titles).not.toContain('photo');
  expect(byTitle('alone').body).toContain('![](assets/alone.png)');
});

test('into a group: the tree under it, loose files beside it', async () => {
  await importTree(tree({ 'Box/In.md': '# In', 'Loose.md': '# Loose' }), 'Home', 'Home');
  expect(byTitle('In').group).toBe('Home/Box');
  expect(byTitle('Loose').group).toBe('Home');
});
