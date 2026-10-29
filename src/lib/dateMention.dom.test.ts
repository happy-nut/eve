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

test('the caret put right after an @ with a word on it that is no day ("ask @Tom") does not bring the calendar up', async () => {
  for (const [text, opens] of [['ask @Tom later', false], ['mail me@home.com', false], ['due @tomorrow', true], ['due @ later', true]] as const) {
    const { ed, open } = editor();
    ed.commands.setContent(`<p>${text}</p>`);
    await settle();
    let at = -1;
    ed.state.doc.descendants((n: any, pos: number) => { if (at < 0 && n.isText && n.text.includes('@')) at = pos + n.text.indexOf('@') + 1; });
    ed.commands.setTextSelection(at);
    await settle();
    expect(open(), text).toBe(opens);
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

// Notion's @remind: the day picked rings, and the chip's menu changes its time or stops it
test('"@remind" ↩ puts a reminder for today at the next hour; its chip changes time, or stops reminding', async () => {
  const { ui } = await import('./ui.svelte');
  const { md } = await import('./testEditor');
  const { remindTime } = await import('./date');
  const { ed, open } = editor();
  type(ed, 'call @remind');
  await settle();
  expect(open()).toBe(true);
  press(ed, 'Enter');
  await settle();
  const today = isoDay(new Date());
  expect(md(ed).trim()).toBe(`call @${today} ${remindTime(today)} ⏰`);

  const chip = ed.view.dom.querySelector('.datechip') as HTMLElement;
  expect(chip.textContent).toContain('⏰');
  chip.click();
  expect(ui.menu!.items.map((i) => i.label)).toEqual([`Remind at ${remindTime(today)}…`, 'Stop reminding']);
  ui.menu!.items[0].run!();
  await settle();
  ui.done('7:05'); // a single-digit hour is read as 07
  await settle();
  expect(md(ed).trim()).toBe(`call @${today} 07:05 ⏰`);
  ui.closeMenu();
  (ed.view.dom.querySelector('.datechip') as HTMLElement).click();
  ui.menu!.items[1].run!();
  ui.closeMenu();
  expect(md(ed).trim()).toBe(`call @${today}`);
  // and a plain day made a reminder from its menu; a time that is no time leaves it as it was
  (ed.view.dom.querySelector('.datechip') as HTMLElement).click();
  expect(ui.menu!.items.map((i) => i.label)).toEqual(['Remind me…']);
  ui.menu!.items[0].run!();
  await settle();
  ui.done('25:00');
  await settle();
  ui.closeMenu();
  expect(md(ed).trim()).toBe(`call @${today}`);
});

test('the reminders due since the last look ring once; a day back at most, a deleted note never', async () => {
  const { dueReminders } = await import('./reminder');
  const at = (h: number, m = 0) => new Date(2026, 9, 26, h, m).getTime();
  const notes = [
    { id: 'a', body: '# Plan\n\n- [ ] call Bo @2026-10-26 09:00 ⏰\n- send @2026-10-26 10:00 ⏰', deleted: false },
    { id: 'b', body: '# Gone\n\nx @2026-10-26 09:00 ⏰', deleted: true },
    { id: 'c', body: '# Old\n\nx @2026-10-24 09:00 ⏰', deleted: false },
  ];
  expect(dueReminders(notes, at(8), at(9, 0)).map((r) => [r.id, r.title, r.line])).toEqual([['a', 'Plan', 'call Bo']]);
  expect(dueReminders(notes, at(9, 0), at(9, 30))).toEqual([]); // rung already
  expect(dueReminders(notes, at(0) - 3 * 86_400_000, at(10)).map((r) => r.line)).toEqual(['call Bo', 'send']); // asleep for days: the last day only
});
