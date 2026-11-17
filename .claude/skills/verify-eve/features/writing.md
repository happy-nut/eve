# Writing

A person writes as in Notion: markdown typed becomes blocks at once, and `/` offers every block by name, in English
or Korean.

## Sub-features

- `write-md`: `[] `, `- `, `# `, `> ` at a line's start become a to-do, a list, a heading, a quote.
- `write-slash`: `/` opens the block menu; typing narrows it; Enter puts the block in; Esc leaves the `/` as typed.
- `write-korean`: `/표`, `/ㅌ` find Table.
- `write-undo`: one ⌘Z takes back the last change.

## How to get to it (user POV)

- Typing in any note. `/` at any caret.

## Driving it with drive.mjs

Preconditions: the default notes; make a fresh one with ⌘N so lines start empty.

- **Markdown.** `await t.key('Enter'); await t.type('[] pack bags');` A checkbox line `pack bags`; the saved
  markdown has `- [ ] pack bags`.
- **Menu.** `await t.key('Enter'); await t.type('/table'); await t.shot('slash');` The menu (`.suggest li`) lists
  `Table 3×3, with a header row` first.
- **Korean.** Type `/표` instead: Table is first.

## Gotchas

- Color is not in the bare `/` menu; it is found by `/red`, `/color`, `/형광펜`.
- The menu takes Enter only while it is open: wait for `.suggest` before pressing it.
