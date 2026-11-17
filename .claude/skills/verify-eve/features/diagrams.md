# Diagrams

A person puts in a flowchart (or a pie, a sequence, swimlanes…), edits its boxes where they are drawn, and the note
keeps plain mermaid code that any other tool reads.

## Sub-features

- `diagram-new`: `/flowchart` puts a starter chart in and opens it for editing (the dock: + ⋯ ⤢ ↶ ↷ 🗑).
- `diagram-edit`: a box clicked is typed into; + adds a step.
- `diagram-kept`: the note saves a ```mermaid block.
- `diagram-full`: ⤢ shows it on the whole screen.

## How to get to it (user POV)

- `/flowchart`, `/pie`, `/다이어그램` in a note; a ```mermaid block written or pasted.

## Driving it with drive.mjs

Preconditions: a fresh note (⌘N), one line typed and Enter.

- **Put in.** `await t.type('/flowchart'); await t.key('Enter'); await t.page.waitForSelector('.tiptap .mermaid-view svg'); await t.shot('flowchart');`
  Start → Ready? → Done is drawn with yes/no; the saved markdown has ```mermaid / `flowchart LR`.
- **Edit a box.** `await t.click('.tiptap .mermaid-view g.node:has-text("Start")')`, type, Esc: the box shows the new
  text and the mermaid line has it.

## Gotchas

- `npm run e2e:diagrams` wants Chromium (`CHROMIUM_PATH`); drive.mjs draws them in WebKit fine.
- Lines draw in with a motion: wait ~800 ms before a shot or heads may be missing.
- Click boxes through `t.click`/`t.spot` (mouse at the centre): Playwright's own click misplaces SVG text.
