# Notes and pages

A person makes a note, writes a title on its first line, finds it in the sidebar, puts pages under other pages, and
gets all of it back after the app is opened again.

## Sub-features

- `note-new`: ⌘N opens a new, empty note with the caret on its title line.
- `note-title`: the first written line is the note's name in the sidebar.
- `note-tree`: a page made under another sits indented under it, foldable.
- `note-kept`: what was written is there after a reload.

## How to get to it (user POV)

- ⌘N anywhere (Mac).
- Phone: a note opens over the list; ‹ (`Back`) to the list, the round `+` (`New note`), then New note in the sheet it
  opens.
- The top bar's `+` menu: New note, or New note in "<current>" (a page under the open one).
- A sidebar row click opens that note.

## Driving it with drive.mjs

Preconditions: the default three notes. Run: `node .claude/skills/verify-eve/drives/run.mjs notes` (`drives/notes.mjs`).

- `note-new` `note-title` **New note.** `await t.key(`${t.mod}+n`); await t.wait(500); await t.type('Trip');` The sidebar's first row reads
  `Trip`: `t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].map((r) => r.textContent.trim()))`.
- `note-tree` **Sub-page.** Groceries (seeded with `parent: a`) is indented under Plan with a fold arrow by Plan; shot the sidebar.
- `note-kept` **Kept.** `await t.page.reload(); await t.page.waitForSelector('.tiptap'); await t.wait(800);` Trip is still listed
  and the saved markdown printed at the end still has its lines.
- **Phone.** With `--phone`: `await t.click('button[aria-label="Back"]:visible'); await t.click('button[aria-label="New note"]:visible'); await t.click('button:visible:has-text("New note")'); await t.click('.tiptap'); await t.type('From the phone'); await t.click('button[aria-label="Back"]:visible');`
  The list shows `From the phone` on top, dated 지금.

## Gotchas

- On a phone a new note does not take the keyboard (on purpose: it stays down until the note is tapped); typing
  before the tap goes nowhere.
- A new note may come with an icon: the row's text then starts with the emoji (`🗂️  Trip`). Match with `includes`.
- The top bar's `+` is a menu, not a new note; click it and you only see the menu.
- The title line is saved as plain text (`Trip`), not `# Trip`: it is the title by being first.
