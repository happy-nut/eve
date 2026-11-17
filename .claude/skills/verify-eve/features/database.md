# Databases and boards

A person makes a database in a page (Notion's): the pages under it are its rows, each with properties of its own
kinds, seen as a table, a board grouped by a select, a calendar by a date, or a gallery; sorted, filtered, dragged
from column to column. Apart from it, a kanban block is a board of cards that live in the note itself, each opened as
a card page over it.

## Sub-features

- `db-new`: `/database` + Enter puts in a table `Untitled database` with Name, Status (select: Not started, In
  progress, Done) and Due (date), and a `+ New`. The note saves it as a ```` ```database ```` JSON block.
- `db-row`: `+ New` adds a row (a page under this one) with the keyboard in its `Title` field; typing names it, and the
  sidebar shows it under the page.
- `db-cells`: a Status cell opens a menu of its choices; a Due cell is a date field; each value is a line of the row's
  front matter (`Status: In progress`, `Due: 2026-11-20`).
- `db-props`: `+` (`Add a property`) → a kind (Text, Number, Select, Tags, Date, Checkbox, Relation, Rollup, Formula) →
  `Property name` → a new column. Number, Checkbox (`Paid: true`), Tags (`New choice…`, `Tags: ["home"]`), Relation to
  any note (`See: ["[[Groceries]]"]`, drawn `↗ Groceries`) and Formula (`prop("Hours") * 10` → 30, never written in
  the row) proved.
- `db-sort-filter`: a column head's menu: Sort ascending / descending, `Only “<choice>”` (with `Only rows whose … ·
  show all`), Show all rows.
- `db-board`: the Board tab groups rows by the select into columns with counts; a card dragged to another column
  changes the row's Status; ⌘Z on the board takes it back.
- `db-calendar`: the Calendar tab puts each row on its Due day (`by Due`).
- `db-gallery`: the Gallery tab shows a card per row with its first line and properties, and a `+ New`.
- `db-open-row`: a row's ↗ (`Open`), or a card, opens the row's own page (crumbs `Projects / <row>`).
- `db-delete-row`: a row's ⋯ (`Row menu`) → Delete row moves it to the Trash at once (no question).
- `db-phone`: on a phone the views are the same; `+ New` on the board asks `Name` in a sheet; a tapped card opens
  the row's page.
- `kanban-new`: `/kanban` puts in a board To do / In progress / Done, saved as a ```` ```kanban ```` JSON block.
- `kanban-card`: a column's `+ New` opens a card page (`.card-page`) with the keyboard in it: first line the title,
  then the body; Esc closes it and the card shows its title and first line.
- `kanban-move`: a card dragged to another column moves there; in a card page, `→ <column>` (`Move to another
  column`) moves it from a menu of columns.
- `kanban-delete`: a card page's bin (`Delete card`) asks `Delete “<title>”?`; ⌘Z brings the card back.

## How to get to it (user POV)

- `/database` (Table, Board, Calendar, Gallery tabs over it); `/kanban` (`칸반`).
- Table: `+ New`, a cell, a column head, `+` at the end of the heads, a row's ↗ and ⋯ on hover.
- Board: drag a card, `+ New` in a column, `+ Column`.
- Kanban: `+ New`, click a card, drag a card, `+` for a column, the card page's `→ column`, bin and ×.

## Driving it with drive.mjs

Preconditions: the default three notes for making one. For views, seed `p.md` (front matter `id: p`, `# Projects`
then a ```` ```database ```` block `{ "title": "Work", "props": [{ "name": "Status", "type": "select", "options":
["Not started", "In progress", "Done"] }, { "name": "Due", "type": "date" }], "view": "table" }`) and rows `r1..r3.md`
with front matter `parent: p`, `Status: …`, `Due: 2026-11-2x` (Write spec / In progress / 11-20, Ship app / Done /
11-25, Plan launch / Not started / 11-18).

- **Make one.** `` await t.key(`${t.mod}+n`); await t.type('Projects'); await t.key('Enter'); await t.type('/database'); await t.key('Enter'); ``
  Heads read Name, Status, Due, +.
- **Rows and cells.** `await t.click('.db button.new'); await t.type('Write spec'); await t.key('Enter');` (the
  keyboard is in `Title`); `await t.click('.db tbody tr:nth-child(1) button.chips[aria-label="Status"]'); await t.click('.menu button[role="menuitem"]:has-text("In progress")');`
  `await t.page.fill('.db tbody tr:nth-child(1) input[type=date][aria-label="Due"]', '2026-11-20');` The row's
  `localStorage` file has `parent: <page>`, `Status: In progress`, `Due: 2026-11-20`.
- **A property.** `await t.click('.db button[aria-label="Add a property"]'); await t.click('.menu button[role="menuitem"]:has-text("Number")'); await t.page.keyboard.press(`${t.mod}+a`); await t.type('Hours'); await t.key('Enter');`
  For Formula the same, then click the formula field (`[role="dialog"] input:visible`) before typing
  `prop("Hours") * 10` and Enter: Cost reads 30 and 0. Checkbox: click `input[type=checkbox][aria-label="Paid"]`.
  Tags: its chips → `New choice…` → type → Enter. Relation: after the name, `Any note`, then its chips (scroll them in
  with `locator.scrollIntoViewIfNeeded()` first: the table is wider than the page) → a note's name.
- **Sort and filter.** `await t.click('.db thead button.head:has-text("Due")'); await t.click('.menu button[role="menuitem"]:has-text("Sort ascending")');`
  → Plan launch, Write spec, Ship app. Status head → `Only “Done”` → Ship app alone; `.db .note button.link`
  (`show all`) brings the rest back.
- **Board.** `await t.click('.db .views button[role="tab"]:has-text("Board")');` Columns `.db .col[role="group"]`
  labelled by choice. `await t.page.dragAndDrop('.db button.card:has-text("Plan launch")', '.db .col[aria-label="Done"]');`
  → Done has Plan launch and Ship app, `r3` has `Status: Done`; `` await t.key(`${t.mod}+z`) `` → back in Not started,
  and so after a reload.
- **Calendar, Gallery.** The tabs: Plan launch on 11-18, Write spec 11-20, Ship app 11-25 (`.db .day[aria-label]`);
  `.db .g-card` cards with `About …`, Status and Due.
- **Open, delete.** Hover the row, `button[aria-label="Open"]` → the row's page; `button[aria-label="Row menu"]` →
  `Delete row` → gone from the table and the sidebar, `deleted: true`.
- **Phone.** With `--phone` and the seeded database open: Board tab, `.db .col[aria-label="Not started"] button.new`
  → a `Name` sheet with the keyboard in it, `Write docs`, OK → a card in Not started; tap it → the row's page.
- **Kanban.** `/kanban` in a new note; `await t.click('.kb-col:nth-child(1) .kb-add'); await t.type('Buy milk'); await t.key('Enter'); await t.type('Two bottles.'); await t.key('Escape');`
  `await t.page.dragAndDrop('.kb-card:has-text("Fix tap")', '.kb-col:nth-child(2)');` moves a card. Open a card,
  `.card-page button[aria-label="Move to another column"]`, pick a column. `.card-page button[aria-label="Delete card"]`,
  Enter; `` `${t.mod}+z` `` brings it back. Read the board with
  `[...document.querySelectorAll('.kb-col')].map((c) => c.querySelector('.kb-title').textContent + ': ' + [...c.querySelectorAll('.kb-card .kb-ctitle')].map((x) => x.textContent).join(', '))`.

Proved on Eve 0.7.147. Shots: `$TMPDIR/eve-verify/db/shots/` (/database in the menu, formula prompt, table),
`shots2/` (head menu, filtered, board, board dragged, calendar, gallery, row page), `shots3/` (kanban, card page,
cards, move menu, delete question, deleted), `shots4/` (relation target, kinds, row deleted), `pshots/` (phone table,
Name sheet, board, row page).

Not proved: Rollup (needs a relation to a second database), Text and Date as added properties, `+ Column` on the
database board, a row dragged to another day in the Calendar view, the kanban template and ⌥-arrow card moves, a
kanban card page on a phone.

## Gotchas

- After `Property name` for a Formula, the `Formula — e.g. …` field has the keyboard: type straight on
  (`document.activeElement` is the dialog's `INPUT`; `src/lib/confirmChain.dom.test.ts` holds it).
- A row's page shows its body only; its properties are in its file, not drawn on the page.
- The table and the phone's board are wider than the page: scroll a cell or a column into view before clicking it.
- Delete row asks nothing (the row goes to the Trash); Delete card asks first.
- A kanban card lives in the note's JSON, not as a page: the sidebar does not list it (a database row it does).
