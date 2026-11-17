# Eve verification map

What a person does in Eve, and how to prove each in the running app. Read this, then the feature file that fits.

## Defaults

- Every run is one `node .claude/skills/ui-audit/drive.mjs <notes> <steps.mjs> <shots> [--phone]` (see the skill's
  Launch). Its instance is its own and gone when it ends.
- Unless a file says otherwise, seed three notes: `a.md` `# Plan` / `First line.`, `b.md` `# Groceries` / `milk` with
  front matter `parent: a` (a note with its own front matter keeps its `updated:`: give it a real time,
  or it is listed as 1970), `c.md` `# Reading list` / `A book.` Plan is open at start.
- Run `doctor.mjs` before the first drive.

## Driving

- Keys before clicks, `aria-label`s before classes, never `window.__editor.commands` for the action itself.
- `t.click` takes the first match, hidden or not: add `:visible` where a window keeps a hidden copy (the phone's
  `Back`, `New note`).
- `t.mod` for ⌘ (the host's key), a phone window included.
- A phone window has no hover and no Esc key on screen; a keyboard coming up is mimicked with
  `t.page.setViewportSize({ width: 390, height: 470 })` after a tap.

## Proof

- One shot per feature after the action, looked at with Read; the saved markdown and the error list printed at the
  end; what must outlast a reload checked after `t.page.reload()`.
- Report a step that could not be driven as not proved, with what was tried. Never prove one entry point in place of
  another.

## Feature files

Each starts with a title and a paragraph, then exactly: `Sub-features`, `How to get to it (user POV)`,
`Driving it with drive.mjs`, `Gotchas`. A sub-feature the web build cannot reach says `not proved`, why, and which
test holds it instead.

Notes and finding them:
- [Notes and pages](./notes.md): a new note, its title, a page under another, kept over a reload.
- [Sidebar](./sidebar.md): drag to reorder and to nest, emoji icons, ⌘1…⌘9, ⌘\ keys, folds, the sidebar shut.
- [Tabs](./tabs.md): notes side by side in tabs: open, switch, close, reopen, pin.
- [Search](./search.md): ⌘P and the sidebar box, Enter opens the first hit.
- [Calendar](./calendar.md): daily notes, the calendar page, its template, `@` days.
- [Trash and history](./history-trash.md): delete, Undo, the Trash (restore, delete for good), a note's versions.

Writing in a note:
- [Writing](./writing.md): markdown as typed, the `/` menu, a to-do.
- [Blocks](./blocks.md): callouts, toggles, nested lists, code, highlight, text colour.
- [Links](./links.md): `[[` links and aliases, opening them, a rename followed, `@` dates.
- [Tables](./tables.md): `/table`, typing in cells, a column's edge dragged.
- [Databases](./database.md): table and board views, properties, sort and filter, a row's page, kanban.
- [Diagrams](./diagrams.md): flowcharts, charts and the other kinds, edited where drawn, kept as mermaid.
- [Math](./math.md): formulas in a line and on their own, edited, kept as TeX.
- [Pictures and files](./media.md): pictures, the viewer, link cards, PDFs.
- [Find](./find.md): ⌘F find & replace, the outline, text size.

The app around them:
- [Settings](./settings.md): ⌘, , a key of one's own, a key already taken, the theme.
- [Hints](./hints.md): a button's tip on hover, the 💡 tips at the bottom.
- [Present](./present.md): a note as slides.
- [Import and export](./import-export.md): files and folders dropped in; export (Mac app only).
- [Sync](./sync.md): GitHub sync against a fake GitHub: status, a pull, a merge, a conflict copy, an error.
- [Phone](./phone.md): what only the phone window has: the list, swipes, sheets, the formatting bar.

## Screens

Every `.svelte` file in `src/` and the feature file that drives it (`src/lib/featureMap.test.mjs` fails on a screen
missing here). A new screen gets a feature file, or a sub-feature in one, proved with drive.mjs before it is listed.

- `App.svelte`: [notes](./notes.md)
- `Editor.svelte`: [writing](./writing.md), [blocks](./blocks.md)
- `Icon.svelte`: [notes](./notes.md)
- `Menu.svelte`: [notes](./notes.md), [database](./database.md)
- `Sidebar.svelte`: [sidebar](./sidebar.md), [notes](./notes.md)
- `EmojiPicker.svelte`: [sidebar](./sidebar.md)
- `EmojiRow.svelte`: [sidebar](./sidebar.md)
- `TabBar.svelte`: [tabs](./tabs.md)
- `CalendarPage.svelte`: [calendar](./calendar.md)
- `DateMenu.svelte`: [calendar](./calendar.md), [links](./links.md)
- `TrashPanel.svelte`: [history-trash](./history-trash.md)
- `HistoryPanel.svelte`: [history-trash](./history-trash.md)
- `Confirm.svelte`: [history-trash](./history-trash.md), [database](./database.md)
- `Toast.svelte`: [history-trash](./history-trash.md), [sync](./sync.md)
- `Suggest.svelte`: [writing](./writing.md), [links](./links.md)
- `TableTools.svelte`: [tables](./tables.md)
- `Database.svelte`: [database](./database.md)
- `Kanban.svelte`: [database](./database.md)
- `CardPage.svelte`: [database](./database.md), [calendar](./calendar.md)
- `DiagramBlock.svelte`: [diagrams](./diagrams.md)
- `FlowEditor.svelte`: [diagrams](./diagrams.md)
- `ChartEditor.svelte`: [diagrams](./diagrams.md)
- `DiagramForm.svelte`: [diagrams](./diagrams.md)
- `MathEdit.svelte`: [math](./math.md)
- `ImageViewer.svelte`: [media](./media.md)
- `PdfViewer.svelte`: [media](./media.md)
- `Find.svelte`: [find](./find.md)
- `Outline.svelte`: [find](./find.md)
- `Settings.svelte`: [settings](./settings.md)
- `Keys.svelte`: [settings](./settings.md)
- `Select.svelte`: [settings](./settings.md), [diagrams](./diagrams.md)
- `Slider.svelte`: [settings](./settings.md)
- `Tooltip.svelte`: [hints](./hints.md)
- `Hint.svelte`: [hints](./hints.md)
- `Present.svelte`: [present](./present.md)
- `MobileBar.svelte`: [phone](./phone.md)
- `BottomSheet.svelte`: [phone](./phone.md)

## Not reachable here

Only the Tauri shell has these; drive.mjs (a Vite page in WebKit) cannot, so say a change there is not proved in the
app: ⌘⇧E to summon and hide Eve, Finder's Open With, the `eve` command line, the MCP server for Claude, GitHub sign-in
(device flow) and the phone's QR set-up, the file pickers (Import files…/folder…), export's save dialog and PDF/image
files, open at login and the Dock icon, updates installed in the app, reminder notifications, `memory.log`, and on
Android the home-screen widget, background sync and the hardware back key. `e2e/summon.mjs` drives ⌘⇧E's page side.
