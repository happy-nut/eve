import { test, expect } from 'vitest';
import { tree, pageIdOf } from './tree.svelte';
import { notes, titleOf } from './notes.svelte';

const written = (body: string, parent?: string) => { const n = notes.create(body, parent); notes.touched(n.id); return n; };
const at = (id: string) => notes.all.find((n) => n.id === id)!;
// a note as an older version wrote it: in a group (a folder)
const old = (body: string, group: string, parent?: string) => { const n = written(body, parent); at(n.id).group = group; return n; };
const shown = () => tree.ordered().map((n) => titleOf(n)).filter((t) => t !== 'Untitled');

test('revealing a note unfolds the pages it sits under, and nothing else', () => {
  const page = written('# Page\n'), sub = written('# Sub\n', page.id), deep = written('# Deep\n', sub.id), other = written('# Other\n');
  written('# Other sub\n', other.id);
  tree.fold(page.id); tree.fold(sub.id); tree.fold(other.id);
  tree.reveal(deep.id);
  expect([tree.isFolded(page.id), tree.isFolded(sub.id), tree.isFolded(other.id)]).toEqual([false, false, true]);
  expect(tree.visibleOrdered().some((n) => n.id === deep.id)).toBe(true);
});

// Notion has no folders, only pages in pages: an older version's groups become pages where they stood
test("an older version's groups become pages where they stood, their notes and groups under them, icons and folds kept; once, and the same id everywhere", () => {
  localStorage.setItem('eve.groups', JSON.stringify({ order: ['Work', 'Work/Projects', 'Home'], collapsed: ['Home'], icons: { Work: '💼' } }));
  const loose = written('# Loose\n');
  const plan = old('# Plan\n', 'Work');
  const sub = old('# Plan details\n', 'Work', plan.id); // a sub-page of a page in the group
  const alpha = old('# Alpha\n', 'Work/Projects');
  const milk = old('# Milk\n', 'Home');

  expect(tree.toPages()).toBe(true);

  expect(tree.groups).toEqual([]);
  expect(notes.all.some((n) => n.group)).toBe(false);
  const W = pageIdOf('Work'), P = pageIdOf('Work/Projects'), H = pageIdOf('Home');
  expect([titleOf(at(W)), at(W).icon, at(W).parent]).toEqual(['Work', '💼', undefined]);
  expect([titleOf(at(P)), at(P).parent]).toEqual(['Projects', W]);
  expect([at(plan.id).parent, at(sub.id).parent, at(alpha.id).parent, at(milk.id).parent]).toEqual([W, plan.id, P, H]);
  expect(at(loose.id).parent).toBeUndefined();
  expect(tree.isFolded(H)).toBe(true);
  // the list reads as it did: the top's pages, then each group in turn, a group's groups before its own notes
  expect(shown().filter((t) => t !== 'Page' && !t.includes('Sub') && !t.includes('Deep') && !t.startsWith('Other'))).toEqual(['Loose', 'Work', 'Projects', 'Alpha', 'Plan', 'Plan details', 'Home', 'Milk']);
  expect(localStorage.getItem('eve.groups')).toBeNull();

  // nothing left to do the second time, and the same group on another device makes the same page
  expect(tree.toPages()).toBe(false);
  expect(pageIdOf('Work')).toBe(W);
  expect(pageIdOf('Work/Projects')).not.toBe(W);
});

test('a group come in again (an older device, a note restored from the Trash) goes into the page it made before', () => {
  const a = old('# A\n', 'Trip');
  tree.toPages();
  const page = pageIdOf('Trip');
  notes.remove(page);
  const b = old('# B\n', 'Trip');
  expect(tree.toPages()).toBe(true);
  expect([at(page).deleted, at(a.id).parent, at(b.id).parent]).toEqual([false, page, page]);
  expect(notes.all.filter((n) => !n.deleted && titleOf(n) === 'Trip')).toHaveLength(1);
});

test("a group's page moved since stays where it was put; a note never goes under itself or its own sub-page", () => {
  const plan = old('# Plan\n', 'Desk');
  tree.toPages();
  const page = pageIdOf('Desk');
  notes.setParent(plan.id, null);
  notes.setParent(page, plan.id); // the user puts Desk under Plan
  at(plan.id).group = 'Desk'; // an older device puts Plan back in the group Desk
  at(page).group = 'Desk'; // and the page itself
  tree.toPages();
  expect([at(page).parent, at(plan.id).parent, at(plan.id).group, at(page).group]).toEqual([plan.id, undefined, undefined, undefined]);
});
