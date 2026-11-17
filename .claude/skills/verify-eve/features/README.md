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
`Driving it with drive.mjs`, `Gotchas`.

- [Notes and pages](./notes.md): a new note, its title, a page under another, kept over a reload.
- [Search](./search.md): ⌘P and the sidebar box, Enter opens the first hit.
- [Writing](./writing.md): markdown as typed, the `/` menu, a to-do.
- [Tables](./tables.md): `/table`, typing in cells, a column's edge dragged.
- [Diagrams](./diagrams.md): `/flowchart`, drawn and kept as mermaid.
