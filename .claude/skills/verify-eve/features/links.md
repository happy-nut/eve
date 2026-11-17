# Links and dates

A person links one note to another as Obsidian writes it (`[[Title]]`, `[[Title|shown as]]`), opens the linked note
with a click, and the links follow when that note is renamed; `@` puts a day in the line as a chip.

## Sub-features

- `link-picker`: `[[` and a few letters list the notes that match, and `<letters> new note` last; Enter (or a tap)
  puts a link to the first in, followed by a space.
- `link-alias`: `[[Reading list|books]]` typed out whole becomes a link that reads `books` and opens Reading list.
- `link-open`: a link clicked opens its note; the opened note says `1 link here` at its head.
- `link-rename`: a linked note's title changed (`Groceries` → `Groceries 2`) changes every `[[…]]` to it, in the
  other notes' saved markdown too.
- `link-date`: `@tomorrow` opens a calendar with that day chosen; Enter (or a day tapped) leaves a chip, saved as
  `@2026-11-18`. `@` is for days only (and `@remind`): there are no people or page mentions.

## How to get to it (user POV)

- `[[` anywhere in a note's text; a link typed out whole with its closing `]]`.
- A click on an underlined link; the sidebar row for a rename's result.
- `@` and a day's name or date (`@tomorrow`, `@2026-09-24`, a bare `@` is today).

## Driving it with drive.mjs

Preconditions: the default notes (Groceries is under Plan, so `[[Gro` has one match).

- **Picker.** `await t.click('.tiptap p'); await t.key('End'); await t.key('Enter'); await t.type('see [[Gro'); await t.page.waitForSelector('.suggest li');`
  The rows are `Groceries` (chosen) and `Gro new note`. `await t.key('Enter')`: a `.tiptap .wikilink` reading
  `Groceries`; the markdown has `see [[Groceries]] ` (the picker adds the space).
- **Alias.** `await t.type(' and [[Reading list|books]] ')`: the second `.wikilink` reads `books`; the markdown keeps
  `[[Reading list|books]]`.
- **Date.** `await t.type('due @tomorrow'); await t.page.waitForSelector('.cal');` the month shows with tomorrow
  chosen. `await t.key('Enter')`: a `.tiptap .datechip` (its label in the host's language, `내일` here); the markdown
  ends `due @2026-11-18`.
- **Open.** `await t.click('.tiptap .wikilink >> nth=1')`: Reading list is open (`.tiptap h1`), with `1 link here`.
  Back by `await t.click('aside [data-row]:has-text("Plan")')`.
- **Rename.** Open Groceries by its link, `await t.click('.tiptap h1'); await t.key('End'); await t.type(' 2'); await t.wait(1500);`
  then back to Plan by its sidebar row: the link reads `Groceries 2` and the saved markdown has `[[Groceries 2]]`.
- **Phone.** `t.page.locator('.tiptap p').last().tap()`, type `see [[Gro`, `t.page.locator('.suggest li').first().tap()`;
  type ` due @`, then `t.page.locator('.cal .cal-day', { hasText: /^20$/ }).first().tap()`: a chip `2026.11.20`;
  `t.page.locator('.tiptap .wikilink').first().tap()` opens Groceries, with `Plan / Groceries` in the bar.

Proved on 2026-11-17 (0.7.147): `mac-01-picker`, `mac-02-alias`, `mac-03-calendar`, `mac-04-datechip`,
`mac-05-alias-opened`, `mac-06-renamed`, `phone-02-linked`, `phone-03-opened`.

## Gotchas

- Do not use `t.page.goBack()` to return: the page throws `The operation is insecure` and the run is lost. Use the
  sidebar row (Mac) or the bar's back arrow (phone).
- Wait about a second after a title is typed before leaving the note: the rename reaches the other notes when the
  edit is written.
- The picker's trailing space plus one typed makes two spaces; expect `[[Groceries]]  and` in the markdown.
- A date chip's label is in the browser's language (`내일`, `2026.11.20`); check the markdown for the day.
