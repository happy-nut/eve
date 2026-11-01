import { test, expect } from 'vitest';
import { groups, pageIdOf } from './groups.svelte';
import { notes, titleOf } from './notes.svelte';

// Notion has no groups, only pages in pages: every group becomes a page where it stood, its notes pages under it
const written = (body: string, group: string, parent?: string) => { const n = notes.create(body, group, parent); notes.touched(n.id); return n; };
const at = (id: string) => notes.all.find((n) => n.id === id)!;
const shown = () => groups.ordered().map((n) => titleOf(n)).filter((t) => t !== 'Untitled');

test('every group a page where it stood, its notes and groups under it, its icon and fold kept; once, and the same id everywhere', () => {
  const loose = written('# Loose\n', '');
  groups.rename(groups.create(), 'Work');
  groups.rename(groups.create('Work'), 'Projects');
  groups.rename(groups.create(), 'Home');
  groups.setIcon('Work', '💼');
  groups.toggle('Home'); // folded
  const plan = written('# Plan\n', 'Work');
  const sub = written('# Plan details\n', 'Work', plan.id); // a sub-page of a page in the group
  const alpha = written('# Alpha\n', 'Work/Projects');
  const milk = written('# Milk\n', 'Home');
  const before = shown();

  expect(groups.toPages()).toBe(true);

  expect(groups.names).toEqual([]);
  expect(notes.visible.every((n) => n.group === '')).toBe(true);
  const W = pageIdOf('Work'), P = pageIdOf('Work/Projects'), H = pageIdOf('Home');
  expect([titleOf(at(W)), at(W).icon, at(W).parent]).toEqual(['Work', '💼', undefined]);
  expect([titleOf(at(P)), at(P).parent]).toEqual(['Projects', W]);
  expect([at(plan.id).parent, at(sub.id).parent, at(alpha.id).parent, at(milk.id).parent]).toEqual([W, plan.id, P, H]);
  expect(at(loose.id).parent).toBeUndefined();
  expect(groups.isFolded(H)).toBe(true);
  // the list reads as it did, each group's name now its page's
  expect(before).toEqual(['Loose', 'Alpha', 'Plan', 'Plan details', 'Milk']);
  expect(shown()).toEqual(['Loose', 'Work', 'Projects', 'Alpha', 'Plan', 'Plan details', 'Home', 'Milk']);

  // nothing left to do the second time, and the same group on another device makes the same page
  expect(groups.toPages()).toBe(false);
  expect(pageIdOf('Work')).toBe(W);
  expect(pageIdOf('Work/Projects')).not.toBe(W);
});

test('a group made again (an older device, a note restored from the Trash) goes into the page it made before', () => {
  const a = written('# A\n', 'Trip');
  groups.toPages();
  const page = pageIdOf('Trip');
  notes.remove(page);
  const b = written('# B\n', 'Trip'); // the group back, as an older version on another device writes it
  expect(groups.toPages()).toBe(true);
  expect([at(page).deleted, at(a.id).parent, at(b.id).parent]).toEqual([false, page, page]);
  expect(notes.all.filter((n) => !n.deleted && titleOf(n) === 'Trip')).toHaveLength(1);
});
