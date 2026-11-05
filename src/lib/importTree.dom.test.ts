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

test('a file’s name is its note’s title, a heading of another name kept under it', async () => {
  await importTree(tree({
    'Drop/회의록.md': '# 3월 회의\n\n안건',
    'Drop/Same.md': '# Same\n\nbody',
    'Drop/plain.txt': 'just text',
    // Notion's export puts the page's id after its name: the name alone is the title
    'Drop/Trip 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.md': '# Trip',
    'Drop/Trip 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d/Plan.md': '# Plan',
  }));
  const minutes = byTitle('회의록');
  expect(minutes.body).toBe('# 회의록\n\n# 3월 회의\n\n안건');
  expect(byTitle('Same').body).toBe('# Same\n\nbody'); // not said twice
  expect(byTitle('plain').body).toBe('# plain\n\njust text');
  expect(byTitle('Plan').parent).toBe(byTitle('Trip').id);
});

test('two files of one name (README in two folders, or a page here already called so): each its own title, the links each to its own', async () => {
  notes.create('# Meeting\n\nold');
  await importTree(tree({
    'Index.md': '[w](Work/README.md) and [h](Home/README.md)',
    'Work/README.md': '# Work stuff',
    'Home/README.md': '# Home stuff',
    'Meeting.md': '# Standup',
  }));
  const index = byTitle('Index');
  const linked = [...index.body.matchAll(/\[\[([^|\]]+)/g)].map((m) => m[1]);
  expect(new Set(linked).size).toBe(2); // not both to one README
  expect(linked.map((t) => byTitle(t).body)).toEqual([expect.stringContaining('Work stuff'), expect.stringContaining('Home stuff')]);
  expect(notes.visible.filter((n) => titleOf(n) === 'Meeting')).toHaveLength(1); // the new one is Meeting 2, as Finder names a copy
  expect(byTitle('Meeting 2').body).toContain('Standup');
});

test('a file name with what markdown reads as markup is the title as it is in Finder', async () => {
  const names = ['_old_', '- todo', '2*3*4', '1. first', '[draft] Plan', 'A <b> B'];
  await importTree(tree(Object.fromEntries(names.map((n) => [`Odd/${n}.md`, 'x']))));
  for (const n of names) expect(byTitle(n), n).toBeTruthy();
});

test("a file's front matter is its page's properties, not lines in it; a link to a section keeps its section", async () => {
  await importTree(tree({
    'Fm/Trip notes.md': '---\ntags:\n  - trip\n  - 2024\nstatus: done\nid: x1\n---\n\nBody',
    'Fm/From.md': '[goals](Trip%20notes.md#Goals)',
  }));
  const trip = byTitle('Trip notes');
  expect(trip.body).toBe('# Trip notes\n\nBody');
  expect(trip.props).toEqual({ tags: ['trip', '2024'], status: 'done' }); // Eve's own keys (id) are not taken
  expect(byTitle('From').body).toContain('[[Trip notes#Goals|goals]]');
});
