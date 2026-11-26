const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (days, months = 0) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth() + months, t.getDate() + days); };
const seededDay = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() <= 14 ? 27 : 3); };

export const notes = {
  a: '# Plan\n\nFirst line.\n',
  b: `---\nid: b\nupdated: ${Date.now() - 3600_000}\ndeleted: false\norder: 1\nparent: a\n---\n# Groceries\n\nmilk\n`,
  c: '# Reading list\n\nA book.\n',
  [`daily-${key(seededDay())}`]: `# ${key(seededDay())}\n\nDentist booked.\n`,
};

const cursor = (t) => t.page.evaluate(() => document.querySelector('.calendar .day.cursor .num')?.textContent);
const monthShown = (t) => t.page.evaluate(() => document.querySelector('.calendar .month')?.textContent);
const monthOf = (t, d) => t.page.evaluate(([y, m]) => new Date(y, m, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }), [d.getFullYear(), d.getMonth()]);
const at = async (t, d) => (await cursor(t)) === String(d.getDate()) && (await monthShown(t)) === (await monthOf(t, d));
const lineOf = (t, d) => t.page.evaluate((n) => {
  const day = [...document.querySelectorAll('.calendar .day:not(.out)')].find((c) => c.querySelector('.num').textContent === n);
  return day?.querySelector('.line')?.textContent ?? '';
}, String(d.getDate()));
const dialog = (t) => t.page.evaluate(() => document.querySelector('.box[role="dialog"]')?.textContent ?? '');

export default async (t) => {
  const today = plus(0), tomorrow = plus(1);

  await t.key(`${t.mod}+Comma`);
  await t.page.locator(':has(> .label:has-text("Daily notes")) input.switch').first().click();
  await t.shot('settings-switch');
  await t.key('Escape');
  await t.ok('daily-on', () => t.page.evaluate(() => (() => { const r = document.querySelector('aside [data-row]'); return r && ((r) => ((r.querySelector('.ico-slot') ? '' : r.closest('.note-row')?.querySelector('.ico-slot')?.textContent ?? '') + r.textContent).replace(/\s+/g, ' ').trim())(r); })() === '🗓️ Daily notes'),
    'the sidebar list starts with a 🗓️ Daily notes row');
  await t.shot('daily-row', 'aside');

  await t.click('aside [data-row]:has-text("Daily")');
  await t.ok('calendar-open', () => t.page.evaluate(() => !!document.querySelector('.calendar .day.today.cursor')
    && document.activeElement?.matches('aside [data-row].active') && !document.querySelector('.tiptap')),
  "a click on the row shows the month in the note's place with today ringed, the keyboard staying on the row");
  await t.key('Enter');
  await t.ok('calendar-open', async () => (await t.page.evaluate(() => {
    const c = document.querySelector('.calendar .day.today.cursor');
    return !!c && document.activeElement === c;
  })) && at(t, today), 'Enter on the row puts the keyboard on today');
  await t.shot('calendar-open');

  await t.key('ArrowRight');
  await t.ok('calendar-keys', () => at(t, plus(1)), '→ moves the cursor one day on');
  await t.key('ArrowDown');
  await t.ok('calendar-keys', () => at(t, plus(8)), '↓ moves the cursor a week on');
  await t.key('ArrowLeft');
  await t.ok('calendar-keys', () => at(t, plus(7)), '← moves the cursor one day back');
  await t.key('ArrowUp');
  await t.ok('calendar-keys', () => at(t, plus(0)), '↑ moves the cursor a week back');
  await t.key(`${t.mod}+ArrowRight`);
  await t.ok('calendar-keys', async () => (await monthShown(t)) === (await monthOf(t, plus(0, 1))), '⌘→ shows the next month');
  await t.shot('next-month');
  await t.click('.calendar button.today-btn');
  await t.ok('calendar-keys', async () => (await at(t, today)) && t.page.evaluate(() => document.activeElement?.matches('.day.today.cursor')),
    'Today comes back to this month with the keyboard on today');

  await t.key('ArrowRight');
  await t.key('Enter');
  await t.ok('calendar-day', () => t.page.evaluate((k) => document.querySelector('.card-page .tiptap')?.textContent.startsWith(k), key(tomorrow)),
    "Enter on a day opens its note over the calendar, titled with that day's date");
  await t.type('Walked the dog');
  await t.shot('day-open');
  await t.key('Escape');
  await t.ok('calendar-day', async () => !(await t.page.$('.card-page')) && (await t.page.evaluate(() => document.querySelector('.calendar .day.cursor .line')?.textContent)) === 'Walked the dog'
    && (await t.page.evaluate((k) => localStorage.getItem(`eve.notes.daily-${k}`) ?? '', key(tomorrow))).includes('Walked the dog'),
  "after Esc the day's cell reads what was written, saved as that day's daily note");
  await t.shot('day-written');

  await t.click('.calendar button.tpl');
  await t.ok('calendar-template', () => t.page.evaluate(() => document.querySelector('.card-page')?.textContent.includes('{{date}} {{weekday}}')),
    'Template opens a page titled {{date}} {{weekday}}');
  await t.type('Mood: ');
  await t.shot('template');
  await t.key('Escape');

  await t.click('button[aria-label="New"]');
  await t.click('.menu button[role="menuitem"]:has-text("Today\'s daily note")');
  await t.ok('calendar-today', async () => !(await t.page.$('.calendar')) && !(await t.page.$('.card-page')) && (await t.markdown()).split('\n')[0] === `# ${key(today)} ${await t.page.evaluate(() => new Date().toLocaleDateString(undefined, { weekday: 'long' }))}`,
    "Today's daily note from the + menu opens today's note in the editor itself");
  await t.ok('calendar-template', async () => /\nMood:/.test(await t.markdown()), "today's new note starts with the template's line Mood:");
  await t.type('good');
  await t.shot('today-from-template');
  await t.wait(800);
  await t.click('aside [data-row]:has-text("Daily")');
  await t.ok('calendar-today', async () => (await lineOf(t, today)) === 'Mood:good', "back on the calendar, today's cell reads Mood:good");

  await t.page.click(`.calendar .day:not(.out):has(.num:text-is("${seededDay().getDate()}"))`, { button: 'right' });
  await t.click('.menu button[role="menuitem"]:has-text("Delete")');
  const when = await t.page.evaluate(([y, m, d]) => new Date(y, m, d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    [seededDay().getFullYear(), seededDay().getMonth(), seededDay().getDate()]);
  await t.ok('calendar-delete', async () => (await dialog(t)).includes(`Delete the note for ${when}?`), `a day's Delete asks "Delete the note for ${when}?"`);
  await t.shot('delete-question');
  await t.key('Enter');
  await t.ok('calendar-delete', async () => !(await t.page.$('.box[role="dialog"]')) && (await lineOf(t, seededDay())) === '', 'Delete takes the day\'s line away');
  await t.click('.calendar button.today-btn');
  await t.key('Backspace');
  const todayWhen = await t.page.evaluate(() => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
  await t.ok('calendar-delete', async () => (await dialog(t)).includes(`Delete the note for ${todayWhen}?`), '⌫ on a day with a note asks the same question');
  await t.shot('backspace-question');
  await t.key('Escape');
  await t.ok('calendar-delete', async () => !(await t.page.$('.box[role="dialog"]')) && (await lineOf(t, today)) === 'Mood:good', 'Esc on the question keeps the day');

  await t.page.fill('.calendar input.name', 'Journal');
  await t.key('Enter');
  await t.ok('calendar-rename', () => t.page.evaluate(() => (() => { const r = document.querySelector('aside [data-row]'); return r && ((r) => ((r.querySelector('.ico-slot') ? '' : r.closest('.note-row')?.querySelector('.ico-slot')?.textContent ?? '') + r.textContent).replace(/\s+/g, ' ').trim())(r); })() === '🗓️ Journal'),
    'the name typed in the calendar head renames its sidebar row to 🗓️ Journal');
  await t.wait(800);
  await t.page.reload();
  await t.page.waitForSelector('.calendar', { timeout: 20000 });
  await t.ok('calendar-rename', async () => (await t.page.inputValue('.calendar input.name')) === 'Journal' && (await lineOf(t, today)) === 'Mood:good',
    'after a reload the calendar is still Journal, today still reads Mood:good');
  await t.shot('after-reload');

  await t.click('aside [data-row]:has-text("Plan")');
  await t.click('.tiptap p');
  await t.key('End');
  await t.key('Enter');
  await t.type('Call mum @tom');
  await t.ok('date-at', () => t.page.evaluate(([n, k]) => {
    const on = document.querySelector('.cal .cal-day.on');
    return on?.textContent.trim() === n && document.querySelector('.cal .cal-foot')?.textContent.includes(k);
  }, [String(tomorrow.getDate()), '내일']), '@tom shows a month with tomorrow chosen and 내일 under it');
  await t.shot('at-tomorrow');
  await t.key('ArrowRight');
  await t.ok('date-at', () => t.page.evaluate((n) => document.querySelector('.cal .cal-day.on')?.textContent.trim() === n, String(plus(2).getDate())), '→ chooses the day after');
  await t.key('Enter');
  const chipText = await t.page.evaluate(([y, m, d]) => `${y}.${m}.${d}`, [plus(2).getFullYear(), pad(plus(2).getMonth() + 1), pad(plus(2).getDate())]);
  await t.ok('date-at', async () => (await t.markdown()).includes(`Call mum @${key(plus(2))} `)
    && t.page.evaluate((c) => [...document.querySelectorAll('.tiptap .datechip')].some((e) => e.textContent.includes(c)), chipText),
  `Enter puts in a chip ${chipText}, saved as @${key(plus(2))}`);
  await t.shot('chip');

  await t.type('then Dentist @');
  await t.page.waitForSelector('.cal');
  const next = await t.page.locator('.cal .cal-step[aria-label="Next month"]').boundingBox();
  await t.page.mouse.click(next.x + next.width / 2, next.y + next.height / 2);
  await t.wait(300);
  await t.click('.cal .cal-day:not(.out) >> text="5"');
  const fifth = new Date(today.getFullYear(), today.getMonth() + 1, 5);
  await t.ok('date-at', async () => (await t.markdown()).includes(`Dentist @${key(fifth)}`), `a bare @, Next month and a click on 5 put in @${key(fifth)}`);
  await t.shot('picked-by-mouse');

  await t.click('.tiptap .datechip');
  await t.ok('date-chip', () => t.page.evaluate(() => [...document.querySelectorAll('.menu button[role="menuitem"]')].map((b) => b.textContent.trim()).includes('Remind me…')),
    'a click on a date chip opens a menu with Remind me…');
  await t.shot('chip-menu');
  await t.click('.menu button[role="menuitem"]:has-text("Remind me")');
  await t.page.waitForSelector('.box[role="dialog"] input');
  await t.page.fill('.box[role="dialog"] input', '09:30');
  await t.key('Enter');
  await t.ok('date-chip', async () => (await t.markdown()).includes(`@${key(plus(2))} 09:30 ⏰`), 'a time given to Remind me… makes the chip a reminder, saved with 09:30 ⏰');
  await t.click('.tiptap .datechip');
  await t.ok('date-chip', () => t.page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu button[role="menuitem"]')].map((b) => b.textContent.trim());
    return items.includes('Remind at 09:30…') && items.includes('Stop reminding');
  }), "a reminder's chip offers its time, Remind at 09:30…, and Stop reminding");
  await t.shot('reminder-menu');
  await t.click('.menu button[role="menuitem"]:has-text("Stop reminding")');
  await t.ok('date-chip', async () => { const md = await t.markdown(); return md.includes(`@${key(plus(2))}`) && !md.includes('⏰'); }, 'Stop reminding leaves a plain date');
};
