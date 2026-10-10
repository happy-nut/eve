// Switching notes (⌘1–9, ⌘N, back/forward, deleting the open one) and what it does to what was open.
import { test, expect } from 'vitest';
import { notes } from './notes.svelte';
import { holdEdit, dropEdit } from './pending';

test('keys still on their way from an editor are handed over before the note switches', () => {
  const a = notes.create('# A\n');
  const b = notes.create('# B\n');
  notes.currentId = a.id;
  let seenOn: string | null = null;
  const flush = () => { seenOn = notes.currentId; dropEdit(flush); };
  holdEdit(flush); // a board's card (or a long note) with its last keys not yet written
  notes.currentId = b.id;
  expect(seenOn).toBe(a.id); // handed over while the board was still the open note
});
