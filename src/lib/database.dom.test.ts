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

import { evaluate } from './formula';
import { rollup, byDay, linksIn } from './database';

test("formulas: Notion's operators and functions over a row's values; nothing is run as code; errors say where", () => {
  const row: Record<string, number | string | boolean | null> = { Price: 12, Qty: 3, Done: true, Due: '2026-11-10', Name: 'Pen', Note: null };
  const f = (src: string) => evaluate(src, (n) => row[n] ?? null);
  expect(f('prop("Price") * prop("Qty")').value).toBe('36');
  expect(f('prop("Price") / 0').value).toBe('');
  expect(f('if(prop("Done"), "✓ " + prop("Name"), "todo")').value).toBe('✓ Pen');
  expect(f('round(10 / 3, 2)').value).toBe('3.33');
  expect(f('-prop("Qty") + 1').value).toBe('-2');
  expect(f('prop("Qty") >= 3 && not(empty(prop("Name")))').value).toBe('✓');
  expect(f('concat(prop("Name"), " x", format(prop("Qty")))').value).toBe('Pen x3');
  expect(f('dateBetween(prop("Due"), "2026-11-01", "days")').value).toBe('9');
  expect(f('empty(prop("Note"))').value).toBe('✓');
  expect(f('length("한글")').value).toBe('2');
  expect(f('prop("Price" * 2').error).toBeTruthy();
  expect(f('alert(1)').error).toContain('no function');
  expect(f('constructor.constructor("x")()').error).toBeTruthy();
  expect(f('').value).toBe('');
});

test('rollups, a relation\'s links, and the calendar\'s days', () => {
  expect(rollup(['3', '4.5', ''], 'sum')).toBe('7.5');
  expect(rollup(['3', '4'], 'average')).toBe('3.5');
  expect(rollup(['a', 'b'], 'count')).toBe('2');
  expect(rollup(['true', 'false', 'true', 'true'], 'checked')).toBe('75%');
  expect(rollup(['x', 'y'], 'sum')).toBe('');
  expect(rollup(['2026-11-02', '2026-10-01'], 'min')).toBe('2026-10-01');
  expect(linksIn(['[[Eve]]', '[[Plan|the plan]]', 'Bare'])).toEqual(['Eve', 'Plan', 'Bare']);
  const rows = [note({ Due: '2026-11-01' }, 0), note({ Due: '2026-11-01 09:00' }, 1), note({ Due: 'soon' }, 2), note({}, 3)];
  const days = byDay(rows, 'Due');
  expect([...days.keys()]).toEqual(['2026-11-01']);
  expect(days.get('2026-11-01')!.length).toBe(2);
  const d = parseDb(serializeDb({ title: 'T', view: 'calendar', dateBy: 'Due', props: [{ name: 'P', type: 'relation', target: 'x' }, { name: 'R', type: 'rollup', relation: 'P', of: 'Name', fn: 'count' }, { name: 'F', type: 'formula', expr: '1+1' }] }));
  expect(d!.props.map((p) => p.type)).toEqual(['relation', 'rollup', 'formula']);
  expect(d!.view).toBe('calendar');
});
