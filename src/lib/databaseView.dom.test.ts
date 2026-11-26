// The database as it is drawn: its own ⌘Z, relations read through by rollups and formulas, the calendar and gallery
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import './testEditor';
Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })) as any;
import Database from '../Database.svelte';
import { notes } from './notes.svelte';
import { ui } from './ui.svelte';
import { isoDay } from './date';
import type { DbSchema } from './database';

let app: any = null;
afterEach(() => { ui.closeMenu(); if (app) unmount(app); app = null; document.body.innerHTML = ''; });
const settle = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); await tick(); } };
const row = (id: string) => notes.all.find((n) => n.id === id)!;

function show(schema: DbSchema, page: string) {
  const target = document.createElement('div');
  document.body.append(target);
  let now = schema;
  app = mount(Database, { target, props: { schema, commit: (d: DbSchema) => { now = d; app.set(d); }, page: () => page } });
  flushSync();
  return { target, schema: () => now };
}
const key = (el: Element, shift = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, shiftKey: shift, bubbles: true, cancelable: true }));

test("the table's ⌘Z takes back a cell, a new row, a property; ⌘⇧Z does them again", async () => {
  const page = notes.create('# Tasks\n'); notes.touched(page.id);
  const a = notes.addRow(page.id, 'A', { Status: 'Todo' }).id;
  const { target, schema } = show({ title: 'T', view: 'table', props: [{ name: 'Status', type: 'select', options: ['Todo', 'Done'] }] }, page.id);
  // a choice picked from the cell's menu
  (target.querySelector('.chips') as HTMLElement).click();
  ui.menu!.items.find((i) => i.label === 'Done')!.run!();
  await settle();
  expect(row(a).props).toEqual({ Status: 'Done' });
  const box = target.querySelector('.db')!;
  key(box);
  expect(row(a).props).toEqual({ Status: 'Todo' });
  key(box, true);
  expect(row(a).props).toEqual({ Status: 'Done' });
  // a row made, then taken back (gone), then back again
  (target.querySelector('.new') as HTMLElement).click();
  await settle();
  const made = notes.all.filter((n) => n.parent === page.id && !n.deleted);
  expect(made.length).toBe(2);
  key(box);
  expect(notes.all.filter((n) => n.parent === page.id && !n.deleted).length).toBe(1);
  key(box, true);
  expect(notes.all.filter((n) => n.parent === page.id && !n.deleted).length).toBe(2);
  // the database's own changes too: a sort
  (target.querySelector('th .head') as HTMLElement).click();
  ui.menu!.items.find((i) => i.label === 'Sort descending')!.run!();
  expect(schema().sort).toEqual({ by: 'Name', desc: true });
  key(box);
  expect(schema().sort).toBeUndefined();
});

test("in a note, the table's ⌘Z is the table's: neither the note's undo nor the app's hears it first", async () => {
  const { editorWith, type, md } = await import('./testEditor');
  const { claimKeys, handledBy, PRIORITY } = await import('./keys');
  const page = notes.create('# Tasks\n'); notes.touched(page.id);
  notes.currentId = page.id;
  const ed = editorWith('# T\n\nwords\n\n```database\n{"title": "Tasks", "props": [], "view": "table"}\n```');
  ed.commands.setTextSelection(ed.state.doc.child(1).nodeSize + ed.state.doc.child(0).nodeSize - 1);
  type(ed, '!');
  await settle();
  const appHeard: string[] = [];
  const off = claimKeys('global', { '*': (e) => void (handledBy(e) !== 'taken' && appHeard.push(e.key)) }, { priority: PRIORITY.app });
  (ed.view.dom.querySelector('.db th .head') as HTMLElement).click();
  await settle();
  ui.closeMenu(ui.menu!.items.find((i) => i.label === 'Sort descending'));
  await settle();
  const sorted = () => JSON.parse(md(ed).split('```database\n')[1].split('\n```')[0]).sort;
  expect(sorted()).toEqual({ by: 'Name', desc: true });
  key(ed.view.dom.querySelector('.db')!);
  await settle();
  off();
  expect(sorted()).toBeUndefined();
  expect(md(ed)).toContain('words!');
  expect(appHeard).toEqual([]);
  ed.commands.focus();
});

test('a relation links pages; a rollup sums what they say; a formula works over the row; errors show as such', async () => {
  const projects = notes.create('# Projects\n'); notes.touched(projects.id);
  notes.addRow(projects.id, 'Alpha', { Hours: '3' });
  notes.addRow(projects.id, 'Beta', { Hours: '4.5' });
  const people = notes.create('# People\n'); notes.touched(people.id);
  const bo = notes.addRow(people.id, 'Bo', { Projects: ['[[Alpha]]', '[[Beta]]'], Rate: '10' }).id;
  const { target } = show({ title: 'P', view: 'table', props: [
    { name: 'Projects', type: 'relation', target: projects.id },
    { name: 'Hours', type: 'rollup', relation: 'Projects', of: 'Hours', fn: 'sum' },
    { name: 'Rate', type: 'number' },
    { name: 'Pay', type: 'formula', expr: 'prop("Hours") * prop("Rate")' },
    { name: 'Bad', type: 'formula', expr: 'prop("Rate" +' },
  ] }, people.id);
  await settle();
  const cells = [...target.querySelectorAll('tbody tr td')].map((td) => td.textContent!.trim());
  expect(cells.slice(1, 6)).toEqual(['↗ Alpha↗ Beta', '7.5', '', '75', expect.stringContaining('⚠')]);
  // the relation's menu offers that database's rows, and a pick unlinks one
  (target.querySelectorAll('.chips')[0] as HTMLElement).click();
  await settle();
  expect(ui.menu!.items.map((i) => i.label)).toEqual(['Alpha', 'Beta']);
  ui.menu!.items[0].run!();
  await settle();
  expect(row(bo).props!.Projects).toEqual(['[[Beta]]']);
  expect([...target.querySelectorAll('tbody tr td')].map((td) => td.textContent!.trim())[4]).toBe('45');
});

test('the calendar puts rows on their days, + makes one on a day; the gallery shows each page with its words', async () => {
  const page = notes.create('# Plan\n'); notes.touched(page.id);
  const today = isoDay(new Date());
  notes.addRow(page.id, 'Dentist', { When: today });
  const g = notes.addRow(page.id, 'Notes', {}).id;
  notes.update(g, '# Notes\n\nBring the forms.\n');
  const { target, schema } = show({ title: 'P', view: 'calendar', props: [{ name: 'When', type: 'date' }] }, page.id);
  await settle();
  expect(barDays(target, 'Dentist')).toEqual([today]);
  const day = target.querySelector(`.day[aria-label="${today}"]`)!;
  (day.querySelector('.day-add') as HTMLElement).click();
  await settle();
  // named first: a calendar shows no field to name it in
  expect(ui.pending?.input).toBe('');
  ui.done('Haircut');
  await settle();
  expect(notes.all.filter((n) => n.parent === page.id && n.props?.When === today).map((n) => n.body.split('\n')[0])).toEqual(['# Dentist', '# Haircut']);
  // to the gallery
  ([...target.querySelectorAll('.views button')].find((b) => b.textContent === 'Gallery') as HTMLElement).click();
  await settle();
  expect(schema().view).toBe('gallery');
  const card = [...target.querySelectorAll('.g-card')].find((c) => c.textContent!.includes('Notes'))!;
  expect(card.textContent).toContain('Bring the forms.');
});

/** the days a row's bar covers, as the calendar lays it over its week's days (grid columns) */
function barDays(target: Element, title: string): string[] {
  return [...target.querySelectorAll<HTMLElement>('.cal .week:not(.wds)')].flatMap((week) => {
    const days = [...week.querySelectorAll('.day')].map((d) => d.getAttribute('aria-label')!);
    return [...week.querySelectorAll<HTMLElement>('.bar')].filter((b) => b.querySelector('.bar-title')!.textContent === title).flatMap((b) => {
      const [from, to] = b.style.gridColumn.split('/').map((x) => Number(x.trim()) - 1);
      return days.slice(from, to);
    });
  });
}
/** a mouse pressed on `on` over one day, moved over others, let go: jsdom lays nothing out, so the day under the
 *  pointer is the one its x names */
function dragOver(target: Element, on: Element, days: string[]) {
  const at = (i: number) => ({ clientX: i, clientY: 0, button: 0, pointerType: 'mouse', bubbles: true, pointerId: 1 });
  document.elementsFromPoint = (x: number) => [target.querySelector(`.day[aria-label="${days[x]}"]`)!];
  (on as HTMLElement).setPointerCapture = () => {}; // jsdom has no pointer capture
  on.dispatchEvent(new PointerEvent('pointerdown', at(0)));
  days.slice(1).forEach((_, i) => window.dispatchEvent(new PointerEvent('pointermove', at(i + 1))));
  window.dispatchEvent(new PointerEvent('pointerup', at(days.length - 1)));
}

test('a date can run from one day to another: the table gives it an end, the calendar draws it across the days, dragged whole or by either end, and a new one dragged across empty days', async () => {
  const page = notes.create('# Projects\n'); notes.touched(page.id);
  const month = isoDay(new Date()).slice(0, 7);
  const on = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const launch = notes.addRow(page.id, 'Launch', { When: on(10) }).id;
  const { target } = show({ title: 'P', view: 'table', props: [{ name: 'When', type: 'date' }] }, page.id);
  await settle();
  // the table: → gives the day an end, a span written start/end
  (target.querySelector('button[aria-label="Add an end date"]') as HTMLElement).click();
  await settle();
  const end = target.querySelector<HTMLInputElement>('input[aria-label="When end"]')!;
  expect(document.activeElement).toBe(end);
  end.value = on(13);
  end.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(row(launch).props!.When).toBe(`${on(10)}/${on(13)}`);
  // the calendar: across the four days
  ([...target.querySelectorAll('.views button')].find((b) => b.textContent === 'Calendar') as HTMLElement).click();
  await settle();
  expect(barDays(target, 'Launch')).toEqual([on(10), on(11), on(12), on(13)]);
  // a span over a week's end is drawn as a piece in each week: its start grip on the first, its end grip on the last
  const pieces = () => [...target.querySelectorAll('.bar')].filter((b) => b.textContent!.includes('Launch'));
  const bar = () => pieces()[0];
  // dragged whole two days on, it keeps its length; the click that ends the drag opens nothing
  const was = notes.currentId;
  dragOver(target, bar(), [on(11), on(12), on(13)]);
  bar().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
  expect(row(launch).props!.When).toBe(`${on(12)}/${on(15)}`);
  expect(notes.currentId).toBe(was);
  // its end pulled back a day, its start pulled past the end stops on it
  dragOver(target, pieces().at(-1)!.querySelector('.grip.end')!, [on(15), on(14)]);
  await settle();
  expect(row(launch).props!.When).toBe(`${on(12)}/${on(14)}`);
  dragOver(target, bar().querySelector('.grip.start')!, [on(12), on(16)]);
  await settle();
  expect(row(launch).props!.When).toBe(on(14));
  // ⌘Z takes back the last drag alone
  key(target.querySelector('.db')!);
  expect(row(launch).props!.When).toBe(`${on(12)}/${on(14)}`);
  // empty days dragged across make a row over them, named first
  dragOver(target, target.querySelector(`.day[aria-label="${on(20)}"]`)!, [on(20), on(21), on(22)]);
  await settle();
  expect(ui.pending?.input).toBe('');
  ui.done('Review');
  await settle();
  expect(barDays(target, 'Review')).toEqual([on(20), on(21), on(22)]);
});

// as Menu.svelte picks: the menu closes first, then the item runs
const pick = (label: string) => { const it = ui.menu!.items.find((i) => i.label === label)!; ui.closeMenu(it); };

test('a property is added as the menus ask for it: its kind, its name, then what it needs (a formula)', async () => {
  const page = notes.create('# Shop\n'); notes.touched(page.id);
  notes.addRow(page.id, 'Pen', { Price: '3' });
  const { target, schema } = show({ title: 'S', view: 'table', props: [{ name: 'Price', type: 'number' }] }, page.id);
  (target.querySelector('.add-col .head') as HTMLElement).click();
  pick('Formula');
  await settle();
  ui.done('Double');
  await settle();
  ui.done('prop("Price") * 2');
  await settle();
  expect(schema().props.at(-1)).toEqual({ name: 'Double', type: 'formula', expr: 'prop("Price") * 2' });
  expect([...target.querySelectorAll('tbody td')].map((td) => td.textContent!.trim())).toContain('6');
  // closed without a pick: nothing is added
  (target.querySelector('.add-col .head') as HTMLElement).click();
  ui.closeMenu();
  await settle();
  expect(schema().props.length).toBe(2);
});
