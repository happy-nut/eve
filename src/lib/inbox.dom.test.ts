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

// Claude copies a passage from read_note and writes it back a little differently: the escapes the note keeps (2 \* 3,
// \[x\], a line ending in \), a table's | --- | as |---|, spaces at a line's end gone, Windows line ends. Each was
// "not in the note as written", and an edit was tried again and again. The same passage is found, as written, once
test('a passage copied a little differently is still found, and changed as written in the note', () => {
  const open = fresh();
  const body = '# Open\n\n| 이름 | 값 |\n| --- | --- |\n| a | 1 |\n| 긴 이름 | 22 |\n\n2 \\* 3 = 6, \\[x\\] here\n\nline\\\nnext\n\n```js\nlet a = 1   \n```\n\nuse `` b`c `` there\n';
  for (const [old, now, after] of [
    ['|---|---|\n|a|1|', '| --- | --- |\n| a | 2 |', '| --- | --- |\n| a | 2 |\n| 긴 이름'],
    ['| a | 1 |  ', '| a | 3 |', '| a | 3 |\n'],
    ['2 * 3 = 6, [x] here', '2 \\* 3 = 7', '2 \\* 3 = 7\n'],
    ['line\nnext', 'line\\\nafter', 'line\\\nafter\n'],
    ['let a = 1\n```', 'let a = 2\n```', 'let a = 2\n```'],
    ['| 이름 | 값 |\r\n| --- | --- |', '| Name | Value |\n| --- | --- |', '| Name | Value |'],
    ['use ` b`c ` there', 'use `x` there', 'use `x` there'],
  ]) {
    notes.update(open.id, body);
    const r = apply({ ask: '1', op: 'edit', id: open.id, old, new: now });
    expect([old, r.ok, get(open.id).body.includes(after)]).toEqual([old, true, true]);
  }
  // still one place only, and still refused where it is not
  notes.update(open.id, '# Open\n\n| a | 1 |\n\n|a|1|\n');
  expect(apply({ ask: '2', op: 'edit', id: open.id, old: '| a |1|', new: 'x' }).text).toContain('more than once');
  const none = apply({ ask: '3', op: 'edit', id: open.id, old: '| a | 9 |', new: 'x' });
  expect([none.ok, none.text]).toEqual([false, expect.stringContaining('| a | 1 |')]); // the nearest line, to copy from
});

test('a note deleted goes to the trash, and comes back from there', () => {
  const open = fresh();
  const other = notes.addImported('# Other\n\nwords\n', '');
  expect(apply({ ask: '1', op: 'delete', id: other.id })).toEqual({ ok: true, text: 'Deleted "Other" (it is in Eve\'s trash, where the user can bring it back).' });
  expect([get(other.id).deleted, notes.trash.some((n) => n.id === other.id), notes.currentId]).toEqual([true, true, open.id]);
  expect(apply({ ask: '2', op: 'delete', id: other.id }).ok).toBe(false); // gone already
  notes.restore(other.id);
  expect(get(other.id).body).toBe('# Other\n\nwords\n');
});

test('every change is answered, a broken one too', () => {
  const open = fresh();
  const answers: [string, Answer][] = [];
  applyAll(['not json', JSON.stringify({ ask: '7', op: 'append', id: open.id, text: 'x' }), JSON.stringify({ ask: '8', op: 'shred', id: open.id })], (a, r) => answers.push([a, r]));
  expect(answers.map(([a, r]) => [a, r.ok])).toEqual([['7', true], ['8', false]]);
});
