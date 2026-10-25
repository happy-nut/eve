// Databases (Notion's): rows are the pages under a page, their properties frontmatter lines of their own
import { test, expect } from 'vitest';
import { notes, parse, serialize, type Note } from './notes.svelte';
import { parseDb, serializeDb, viewRows, columnsOf, passes, withChoice, defaultDb, type DbSchema } from './database';

const note = (props?: Note['props'], order = 0): Note => ({ id: 'x' + order, body: `# R${order}\n`, updatedAt: 1, deleted: false, group: '', order, props });

test('properties are frontmatter lines a note reads back the same, lists and odd words too; Eve\'s own keys are not one', () => {
  const n = note({ Status: 'Doing', Tags: ['a', 'b, c'], Note: '[not a list]', Spaced: ' x ', 마감: '2026-11-01' });
  const text = serialize(n);
  expect(text).toContain('\nStatus: Doing\n');
  expect(text).toContain('\nTags: ["a","b, c"]\n');
  expect(text).toContain('\n마감: 2026-11-01\n');
  expect(parse(text)!.props).toEqual(n.props);
  expect(serialize(parse(text)!)).toBe(text);
  // a note with none writes none, and reads back with none
  expect(parse(serialize(note()))!.props).toBeUndefined();
  // written by hand in another app: a list as YAML writes it, a value with a colon
  expect(parse('---\nid: h\nupdated: 1\ntags: ["x", "y"]\nlink: https://a.b/c\n---\nbody')!.props).toEqual({ tags: ['x', 'y'], link: 'https://a.b/c' });
});

test("a database's schema reads back as written; one that is no database stays code", () => {
  const d: DbSchema = { ...defaultDb(), sort: { by: 'Due', desc: true }, filter: { by: 'Status', is: 'Done' }, view: 'board', groupBy: 'Status' };
  expect(parseDb(serializeDb(d))).toEqual(d);
  expect(parseDb('{"props": [{"name": "X", "type": "rainbow"}]}')).toBeNull();
  expect(parseDb('not json')).toBeNull();
});

test('a view filters, then sorts (numbers as numbers, empty last); a board groups by a select, the empty first', () => {
  const d: DbSchema = { title: 'T', view: 'table', props: [{ name: 'N', type: 'number' }, { name: 'S', type: 'select', options: ['a', 'b'] }, { name: 'Tags', type: 'multi' }] };
  const rows = [note({ N: '10', S: 'b' }, 0), note({ N: '9', S: 'a', Tags: ['x'] }, 1), note({ S: 'a' }, 2), note({ N: '100' }, 3)];
  const titles = (rs: Note[]) => rs.map((r) => r.body.slice(2, 4));
  expect(titles(viewRows(rows, d, (r) => r.body))).toEqual(['R0', 'R1', 'R2', 'R3']);
  expect(titles(viewRows(rows, { ...d, sort: { by: 'N' } }, (r) => r.body))).toEqual(['R1', 'R0', 'R3', 'R2']);
  expect(titles(viewRows(rows, { ...d, sort: { by: 'N', desc: true } }, (r) => r.body))).toEqual(['R3', 'R0', 'R1', 'R2']);
  expect(titles(viewRows(rows, { ...d, filter: { by: 'S', is: 'a' } }, (r) => r.body))).toEqual(['R1', 'R2']);
  expect(passes(rows[1], { by: 'Tags', is: 'x' })).toBe(true);
  expect(columnsOf(rows, d.props[1]).map((c) => [c.value, c.rows.length])).toEqual([['', 1], ['a', 2], ['b', 1]]);
  expect(withChoice(d, 'S', 'c').props[1].options).toEqual(['a', 'b', 'c']);
});

test('rows are made under the page, not opened; a property set, renamed, taken off; Eve\'s own keys refused', () => {
  const page = notes.create('# Tasks\n');
  notes.touched(page.id);
  const r0 = notes.addRow(page.id, 'Write', { Status: 'Doing', Empty: '' });
  const r = notes.all.find((n) => n.id === r0.id)!;
  expect(notes.currentId).toBe(page.id);
  expect(r).toMatchObject({ parent: page.id, props: { Status: 'Doing' } });
  notes.setProp(r.id, 'Due', '2026-11-01');
  notes.setProp(r.id, 'group', 'hacked');
  expect(r.group).toBe('');
  notes.renameProp([r.id], 'Status', 'State');
  expect(Object.keys(r.props!)).toEqual(['State', 'Due']);
  notes.setProp(r.id, 'State', null);
  notes.setProp(r.id, 'Due', []);
  expect(r.props).toBeUndefined();
  expect(serialize(r)).not.toMatch(/State|Due/);
});
