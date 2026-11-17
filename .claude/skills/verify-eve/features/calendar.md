# Daily notes and dates

A person turns on daily notes and gets a calendar in the sidebar: a month of days, each showing the first line written
that day, a day opened to write in, a template every new day starts from, today's note a menu away. In any note `@`
puts in a date from a small calendar, and a date chip can be made a reminder.

## Sub-features

- `daily-on`: Settings (⌘,) → General → Daily notes switches on a `🗓️ Daily notes` row at the top of the sidebar.
- `calendar-open`: a click on that row shows the month in the note's place, the keyboard on today (`.day.today.cursor`).
- `calendar-keys`: ← → a day, ↑ ↓ a week, ⌘← ⌘→ a month; the `Today` button comes back to today (its `‹` `›`
  month buttons were not clicked).
- `calendar-day`: Enter (or a click) on a day opens its note floating over the calendar (`.card-page`), titled
  `2026-11-17 화요일`; what is written there shows on the day after Esc; the note is `daily-<date>`.
- `calendar-template`: `Template` opens "every new day starts like this" with `{{date}} {{weekday}}` as its title; a
  new day starts with what was written there.
- `calendar-today`: the toolbar's `+` (`New`) → Today's daily note opens today's note in the editor itself, made from
  the template.
- `calendar-delete`: right click a day with a note → Delete, or ⌫ on it, asks `Delete the note for <date>?`; Delete
  takes the day's line away.
- `calendar-rename`: the calendar's name is its title field (`input.name`); Enter renames the sidebar row too, and it
  is kept over a reload with the days.
- `date-at`: `@tom` in a note shows a month with tomorrow chosen and `내일` under it; ← → move the day, Enter puts in
  a chip `2026.11.19`, saved `@2026-11-19`; a bare `@` and a click on `Next month` then a day picks by mouse.
- `date-chip`: a click on a chip opens `Remind me…` (and on a reminder, its time and Stop reminding).
- `calendar-phone`: on a phone the same row opens the calendar full screen, and a day opens as a sheet from below.

## How to get to it (user POV)

- Turn on: ⌘, (or the gear) → General → Daily notes. Off by default.
- The `Daily notes` row in the sidebar (it moves and is renamed like a note); `+` → Today's daily note.
- In the calendar: click a day, the arrows and Enter, right click or ⌫ on a day, `Template`, `‹ Today ›`.
- `@` in any note, then a word (`today`, `tomorrow`, `yesterday`, a date as `2026-11-20`) or the arrows; `@remind`
  for a reminder.

## Driving it with drive.mjs

Preconditions: the default three notes (and, for deleting, `daily-2026-11-10.md`: `# 2026-11-10 화요일` /
`Dentist booked.`). Each run turns daily notes on the way a person does:
`` await t.key(`${t.mod}+Comma`); await t.page.locator(':has(> .label:has-text("Daily notes")) input.switch').first().click(); await t.key('Escape'); ``
The list then reads `🗓️  Daily notes`, Plan, Groceries, Reading list. Read the days with
`[...document.querySelectorAll('.calendar .day.has')].map((d) => d.querySelector('.num').textContent + ':' + (d.querySelector('.line')?.textContent ?? ''))`.

- **Open.** `await t.click('aside [data-row]:has-text("Daily")');` The month (`.calendar .month`, `2026년 11월`) with
  today ringed and focused.
- **Keys.** `ArrowRight`, `ArrowDown` move the cursor 17 → 25; `` `${t.mod}+ArrowRight` `` shows `2026년 12월`;
  `await t.click('.calendar button.today-btn')` comes back with the cursor on today.
- **A day.** `await t.key('Enter');` → `.card-page` with the day's title; `await t.type('Walked the dog'); await t.key('Escape');`
  The card closes, today's cell reads `Walked the dog`, and `localStorage` has `eve.notes.daily-2026-11-17`.
- **Template.** `await t.click('.calendar button.tpl'); await t.type('Mood: '); await t.key('Escape');` then
  `await t.click('button[aria-label="New"]'); await t.click('.menu button[role="menuitem"]:has-text("Today\'s daily note")');`
  The editor shows `2026-11-17 화요일` / `Mood:` (the calendar's icon on its head); typing `good` there and going back
  to the calendar, the 17th reads `Mood:good`.
- **Delete a day.** `await t.page.click('.calendar .day.has:has(.num:text-is("10"))', { button: 'right' }); await t.click('.menu button[role="menuitem"]:has-text("Delete")'); await t.key('Enter');`
  The 10th has no line. With the cursor on a day with a note, `await t.key('Backspace')` asks the same question.
- **Rename.** `await t.page.fill('.calendar input.name', 'Journal'); await t.key('Enter');` The row reads `🗓️ Journal`;
  after a reload the calendar is still open, still `Journal`, the 17th still `Mood:good`.
- **@ by keys.** In Plan: `await t.click('.tiptap p'); await t.key('End'); await t.key('Enter'); await t.type('Call mum @tom');`
  `.cal .cal-day.on` is 18; `ArrowRight` → 19; `Enter` → the saved markdown has `Call mum @2026-11-19 `.
- **Chip.** `await t.click('.tiptap .datechip');` → a menu with `Remind me…`.
- **@ by mouse.** On a new line `Dentist @`, click `.cal .cal-step[aria-label="Next month"]` by its box
  (`t.page.mouse.click`; the button acts on mousedown), then `.cal .cal-day:not(.out) >> text="5"` → `@2026-12-05`.
- **Phone.** With `--phone`: `button[aria-label="Back"]:visible`, `aside button[aria-label="Settings"]`, the same
  switch, close, then `t.page.tap('aside [data-row]:has-text("Daily")')` shows the calendar with no list; tap
  `.calendar .day.today` → a `.card-page` sheet with the day's title and `Start writing…`.

Proved on Eve 0.7.147 (today 2026-11-17). Shots: `$TMPDIR/eve-verify/cal/shots/` (settings, row, calendar, day open,
day written), `shots2/` (@tom calendar, chip, chip menu, bare @, picked by click), `shots3/` (template, + menu, today
from template, day menu, delete question, ⌫ question, after reload), `pshots/` (phone settings, calendar, day sheet).

Not proved: `@remind` and the reminder ringing (a notification; the web build has none), and closing the phone's day
sheet (it has no Close button; it goes by a pull down, not driven).

## Gotchas

- With the calendar open there is no note: drive.mjs prints `(no note open)` as the saved markdown. Open a note
  (`await t.click('aside [data-note="a"]')`) when a run's proof is a note's markdown.
- A day's note opens over the calendar (`.card-page`, Esc closes it); today's note from `+` opens in the editor
  instead, and the calendar is only reached again from its row.
- The template's trailing space is not kept: `Mood: ` in the template comes out `Mood:` in the new day (markdown keeps no
  space at a line's end; two of them would be a line break).
- A right click on a day also selects the word under the pointer in the day's line (WebKit), as the day-menu shot
  shows.
- The `@` calendar's month buttons act on mousedown; `t.click` works by box, Playwright's own click may not.
- The dates read in the system's language: in this browser `2026년 11월`, `화요일`, `내일`.
