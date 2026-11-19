# Tables

A person puts in a table, writes in its cells without the columns jumping, and drags a column's edge to size it.

## Sub-features

- `table-new`: `/table` puts a 3×3 table with a header row, the caret in its first cell.
- `table-write`: a cell's words wrap in it; every column keeps its width while typing.
- `table-resize`: dragging a column's edge moves that edge alone.
- `table-handles`: hovering shows a row's ⋮⋮ on the left, a column's ⋯ on top, + below and right.

## How to get to it (user POV)

- `/table` (or `/표`) in a note; markdown `| a | b |` pasted.
- The mouse on a column's right edge (the cursor turns to ↔).

## Driving it with drive.mjs

Preconditions: a fresh note (⌘N). Run: `node .claude/skills/verify-eve/drives/run.mjs tables`

- `table-new` **Put in.** `await t.type('/table'); await t.key('Enter'); await t.type('x'); await t.shot('table');` A 3×3 grid,
  `x` in the header's first cell; the saved markdown is a `| x |  |  |` table.
- `table-write` **Write.** Click the second row's first cell and type a long sentence: it wraps to more lines in that cell, and every column of the first row is within 1 px of its width before.
- `table-resize` **Resize.** Read the first row's cell widths, move the mouse to cell 1's `right - 1`, down, move +60 px in 5 steps,
  up (as `e2e/table.mjs` does). Column 1 is ~60 px wider; the others are within 1 px of before.
- `table-handles` **Handles.** Move the mouse to a body cell: `.tbl-grip.row.on` sits on the table's left edge by that row, `.tbl-grip.col.on` on its top edge over that column, `.tbl-add.row.on` below and `.tbl-add.col.on` right of it.

## Gotchas

- The edge is 1–3 px wide: hover there first (move from 3 px left) or the drag selects cells instead.
- A drag is on screen only until it is written into the note's `<!-- eve:widths -->` line; check widths after release.
