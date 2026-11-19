# Writing

A person writes as in Notion: markdown typed becomes blocks at once, and `/` offers every block by name, in English
or Korean.

## Sub-features

- `write-md`: `[] `, `- `, `# `, `| ` at a line's start become a to-do, a list, a heading, a quote (`> ` is a toggle: `block-toggle`).
- `write-slash`: `/` opens the block menu; typing narrows it; Enter puts the block in; Esc leaves the `/` as typed.
- `write-korean`: `/표`, `/ㅌ` find Table.
- `write-undo`: one ⌘Z takes back the last change.

## How to get to it (user POV)

- Typing in any note. `/` at any caret.

## Driving it with drive.mjs

Preconditions: the default notes; make a fresh one with ⌘N so lines start empty. Run: `node .claude/skills/verify-eve/drives/run.mjs writing`

- `write-md` **Markdown.** `await t.key('Enter'); await t.type('[] pack bags');` A checkbox line `pack bags`; the saved
  markdown has `- [ ] pack bags`.
- `write-slash` **Menu.** `await t.key('Enter'); await t.type('/table'); await t.shot('slash');` The menu (`.suggest li:not(.group)`)
  lists `Table` first. Bare `/` shows four groups (`.suggest li.group`: Basic blocks, Media, Notes and boards,
  Advanced), Text first, each row its own icon and on its right the key that also makes it (`#`, `-`, `[[`, `$$`);
  Duplicate, Move to and Delete are found by typing only.
- `write-korean` **Korean.** Type `/표` instead: Table is first.
- `write-undo` **Undo.** After `/table` Enter, one `${t.mod}+z`: the table is gone and the line reads `/table` again, as typed.

## Gotchas

- Color is not in the bare `/` menu; it is found by `/red`, `/color`, `/형광펜`.
- The menu takes Enter only while it is open: wait for `.suggest` before pressing it.
- `> ` at a line's start makes a toggle, not a quote (as in Notion; see blocks.md): a quote is `| `, saved `> said once`.
- One ⌘Z after a / item takes back the item and the `/table` it was picked by comes back, when that was typed over half a second before Enter: changes closer together are one ⌘Z (ProseMirror's `newGroupDelay`, 500 ms), and the line goes empty instead.
