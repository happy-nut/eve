import { test, expect, afterEach } from 'vitest';
import { createEditor } from './editor';
import { type, press } from './testEditor';
import { isoDay } from './date';

const settle = () => new Promise((r) => setTimeout(r, 0));
const made: { destroy(): void }[] = [];
afterEach(async () => { await settle(); for (const e of made.splice(0)) e.destroy(); });

// the @ calendar, driven as DateMenu.svelte is: a day under the cursor while it is open
function editor() {
  let day = '', pick: ((iso: string) => void) | null = null;
  const noop = () => {};
  const off = { visible: () => false, show: noop, hide: noop, move: noop, select: () => false } as any;
  const calendarUI = {
    show(iso: string | null, _r: DOMRect | null, cb: (iso: string) => void) { day = iso ?? ''; pick = cb; },
    move(n: number) { const [y, m, d] = day.split('-').map(Number); day = isoDay(new Date(y, m - 1, d + n)); },
    month: noop,
    select() { if (!day) return false; pick!(day); return true; },
    hide() { day = ''; },
    visible: () => !!day,
  };
  const element = document.createElement('div');
  document.body.append(element);
  const ed = createEditor({ element, content: '', onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI: off, calendarUI, emojiUI: off });
  ed.commands.focus('end');
  made.push(ed);
  return { ed, open: () => !!day };
}
const chips = (ed: any) => { const out: string[] = []; ed.state.doc.descendants((n: any) => { if (n.type.name === 'dateMention') out.push(n.attrs.date); }); return out; };
const fromToday = (n: number) => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };

test('Enter after a name ("ask @Tom", "cc @a") is a new line, the name left as it was', async () => {
  for (const text of ['ask @Tom', 'cc @a', 'ping @Day']) {
    const { ed } = editor();
    type(ed, text);
    await settle();
    press(ed, 'Enter');
    expect(chips(ed)).toEqual([]);
    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.firstChild!.textContent).toBe(text);
  }
});

test('a day named in full, a bare @, Tab, or the arrows still pick', async () => {
  const cases: [string, string, string[], string][] = [
    ['due @tomorrow', 'Enter', [], fromToday(1)],
    ['due @2026-09-24', 'Enter', [], '2026-09-24'],
    ['due @', 'Enter', [], fromToday(0)],
    ['due @tom', 'Tab', [], fromToday(1)],
    ['due @tom', 'Enter', ['ArrowLeft'], fromToday(0)],
  ];
  for (const [text, key, before, day] of cases) {
    const { ed } = editor();
    type(ed, text);
    await settle();
    for (const k of before) press(ed, k);
    press(ed, key);
    expect(chips(ed), text).toEqual([day]);
  }
});

test('not while the [[ picker is open: "[[Meeting @to" is still the title being typed', async () => {
  const { ed, open } = editor();
  type(ed, 'see [[Meeting @to');
  await settle();
  expect(open()).toBe(false);
});

test('after a link typed out by hand ("see [[Bob]] due @to") the calendar comes up again', async () => {
  const { ed, open } = editor();
  type(ed, 'see [[Bob]] due @to');
  await settle();
  expect(open()).toBe(true);
});
