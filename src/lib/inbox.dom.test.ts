// What Claude writes through the MCP server (create_note, append_note, edit_note) done through the notes store
// (inbox.ts): the note the user has open stays open, a passage is changed only where it is exactly once, and every
// change gets an answer the server can pass on.
import { test, expect } from 'vitest';
import { notes, titleOf } from './notes.svelte';
import { apply, applyAll, type Answer } from './inbox';

const fresh = () => {
  for (const n of notes.all) n.deleted = true;
  const open = notes.create('# Open\n\nbeing written');
  notes.currentId = open.id;
  return open;
};
const get = (id: string) => notes.all.find((n) => n.id === id)!;

test('a note is made where asked, the open note left open', () => {
  const open = fresh();
  const made = apply({ ask: '1', op: 'create', body: '# Plan\n\n- [ ] ship\n', group: 'Work' });
  expect(made.ok).toBe(true);
  const plan = notes.visible.find((n) => titleOf(n) === 'Plan')!;
  expect(made.text).toContain(plan.id);
  expect([plan.body, plan.group, notes.currentId]).toEqual(['# Plan\n\n- [ ] ship\n', 'Work', open.id]);
  // under a page: in that page's folder, whatever folder was asked
  const sub = apply({ ask: '2', op: 'create', body: '# Step\n', group: 'Elsewhere', parent: plan.id });
  const step = notes.visible.find((n) => titleOf(n) === 'Step')!;
  expect([sub.ok, step.parent, step.group]).toEqual([true, plan.id, 'Work']);
  expect(apply({ ask: '3', op: 'create', body: '# Deep\n', group: 'a/b/c/d' }).ok).toBe(false);
  expect(apply({ ask: '4', op: 'create', body: '# Orphan\n', parent: 'nope' }).ok).toBe(false);
});

test('text added at the end, after a blank line', () => {
  const open = fresh();
  expect(apply({ ask: '1', op: 'append', id: open.id, text: '\n- more\n' })).toEqual({ ok: true, text: 'Added to "Open".' });
  expect(get(open.id).body).toBe('# Open\n\nbeing written\n\n- more\n');
  expect(apply({ ask: '2', op: 'append', id: open.id, text: '\n' }).ok).toBe(false);
});

test('a passage is changed only where it is, exactly once', () => {
  const open = fresh();
  notes.update(open.id, '# Open\n\na b a\n');
  expect(apply({ ask: '1', op: 'edit', id: open.id, old: 'b', new: 'B' })).toEqual({ ok: true, text: 'Changed "Open".' });
  expect(get(open.id).body).toBe('# Open\n\na B a\n');
  const twice = apply({ ask: '2', op: 'edit', id: open.id, old: 'a', new: 'x' });
  expect([twice.ok, twice.text]).toEqual([false, expect.stringContaining('more than once')]);
  expect(apply({ ask: '3', op: 'edit', id: open.id, old: 'zzz', new: 'x' }).ok).toBe(false);
  expect(get(open.id).body).toBe('# Open\n\na B a\n'); // refused: left as it was
  // "$&" is text, not a pattern
  expect(apply({ ask: '4', op: 'edit', id: open.id, old: 'B', new: '$&$1' }).ok).toBe(true);
  expect(get(open.id).body).toBe('# Open\n\na $&$1 a\n');
  // the title is the first line: edited, it is renamed
  expect(apply({ ask: '5', op: 'edit', id: open.id, old: '# Open', new: '# Renamed' })).toEqual({ ok: true, text: 'Changed "Renamed".' });
  // gone meanwhile
  notes.remove(open.id);
  expect(apply({ ask: '6', op: 'append', id: open.id, text: 'x' }).ok).toBe(false);
});

test('every change is answered, a broken one too', () => {
  const open = fresh();
  const answers: [string, Answer][] = [];
  applyAll(['not json', JSON.stringify({ ask: '7', op: 'append', id: open.id, text: 'x' }), JSON.stringify({ ask: '8', op: 'shred', id: open.id })], (a, r) => answers.push([a, r]));
  expect(answers.map(([a, r]) => [a, r.ok])).toEqual([['7', true], ['8', false]]);
});
