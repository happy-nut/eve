# Search

A person finds a note by a few letters of its name (or of what it says) and opens it with Enter, without the mouse.

## Sub-features

- `search-open`: ⌘P puts the keyboard in the sidebar's Search box.
- `search-narrow`: typing narrows the sidebar to matching notes, the first marked as Enter's.
- `search-enter`: Enter opens the first match.
- `search-clear`: Esc or the × (`button[aria-label="Clear search"]`) brings the whole list back.

## How to get to it (user POV)

- ⌘P (Mac), shown in the box as `Search  ⌘P`.
- A click or tap in the Search box at the sidebar's top.

## Driving it with drive.mjs

Preconditions: the default three notes, Plan open. Run: `node .claude/skills/verify-eve/drives/run.mjs search`

- `search-open` `search-narrow` **Narrow.** `await t.key(`${t.mod}+p`); await t.type('groc'); await t.shot('search');` Only Groceries is listed and
  highlighted; `document.activeElement` is the `Search  ⌘P` input.
- `search-enter` **Open.** `await t.key('Enter'); await t.wait(500);` The note shows `Groceries` / `milk`, and the saved markdown
  printed at the end is Groceries'.
- `search-narrow` **Click entry.** `await t.click('aside .search input'); await t.type('read');` Reading list alone is listed.

## Gotchas

- Results come back by title first, then by text: a word only in a body ranks after every title match.
- Enter empties the box: once the note opens, the whole list is back.
- On the phone the box says `Search` with no keys, and there is no ⌘P.
