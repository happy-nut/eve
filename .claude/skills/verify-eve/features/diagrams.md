# Diagrams

A person puts in a flowchart (or a pie, a sequence, swimlanes…), edits its boxes and parts where they are drawn or as
rows under it, looks at it on the whole screen, and the note keeps plain mermaid code that any other tool reads.
Screens: `DiagramBlock.svelte` (the block, its dock, the whole screen), `FlowEditor.svelte` (a flowchart's boxes),
`ChartEditor.svelte` (any other chart's parts clicked where drawn), `DiagramForm.svelte` (⋯ → List: every part as a row).

## Sub-features

- `diagram-new`: `/flowchart` puts a starter chart in (Start → Ready? → Done, yes/no) and opens it for editing (the
  dock: + ⋯ ⤢ ↶ ↷ 🗑).
- `diagram-edit`: a box clicked is picked (a bar: Text, shapes, Order, Connect, Delete) and typing replaces its words;
  the blue + beside a picked box adds a step after it, joined by a line.
- `diagram-kept`: the note saves a ```mermaid block with every edit in it.
- `diagram-undo`: the dock's ↶, or ⌘Z with a box picked, takes back one change at a time (the typed words, then the added step).
  Straight after a pick from ⋯ or + the keyboard is still the drawing's: ⌘Z takes back that change, the note stays put.
- `diagram-full`: ⤢ shows it on the whole screen (a `dialog`, zoom bar `− 200% +`, ✕); Esc or ✕ puts it back in the note.
- `diagram-chart`: a chart's part clicked where drawn (`ChartEditor`): typing renames it, its Value field changes its
  size, the drawing follows.
- `diagram-list`: ⋯ → List shows every part as rows under the chart (`DiagramForm`): a pie's parts and values, a
  sequence's participants and messages (+ Add message); an edit there is drawn and saved.
- `diagram-lanes`: `/swimlanes` puts in a flowchart in three lanes (Customer, Store, Delivery), kept as `subgraph`s.

## How to get to it (user POV)

- `/flowchart`, `/swimlanes`, `/sequence`, `/pie`, `/timeline`, `/gantt` (the / menu's diagram items); a ```mermaid
  block written or pasted.
- A click on a drawn diagram opens it for editing; a click on a box or a part picks it.
- The dock over its top right: + (Box / Lane, or a chart's own parts), ⋯ (Across / Down for a flowchart; Values, List
  for a chart; Edit code), ⤢, ↶ ↷, 🗑.
- A phone: the same dock; a tapped box is picked without the keyboard, its bar's **Text** edits the words.

## Driving it with drive.mjs

Preconditions: the default notes. Each diagram goes in on a new line after the last paragraph:
`await t.click('.tiptap > p >> nth=-1'); await t.key('End'); await t.key('Enter'); await t.type('/flowchart'); await t.wait(300); await t.key('Enter'); await t.wait(900);`
(the same with `/pie`, `/sequence`, `/swimlanes`). Run: `node .claude/skills/verify-eve/drives/run.mjs diagrams`

- `diagram-new` **Put in.** After `/flowchart`: `await t.page.waitForSelector('.tiptap .mermaid-view svg')`. Start → Ready? → Done is
  drawn, `.tiptap .dblock.active` is there; the markdown has ```mermaid / `flowchart LR`.
- `diagram-edit` `diagram-kept` **Edit a box.** `await t.click('.tiptap .mermaid-view g.node:has-text("Start")'); await t.type('Begin'); await t.key('Escape');`
  The box reads Begin; the mermaid line is `n1(["Begin"])`. The first Esc lets go of the box, the diagram stays open.
- `diagram-edit` `diagram-kept` **+ a step.** `await t.click('.tiptap .mermaid-view g.node:has-text("Done")'); await t.click('.layer button.plus'); await t.type('Ship'); await t.key('Escape');`
  A box Ship after Done; the markdown adds `n4("Ship")` and `n3 --> n4`. (The dock's + → Box adds a box with no line.)
- `diagram-undo` **Undo.** `await t.click('.tiptap .dblock .dock button[aria-label="Undo"]')` twice: first `n4("New step")`, then no
  n4 and no `n3 --> n4`. With a box picked (`await t.click('.tiptap .mermaid-view g.node:has-text("Ready?")')`),
  `await t.key(`${t.mod}+z`)` takes back the next one (`n1(["Start"])` again) and `${t.mod}+Shift+z` brings it back.
- `diagram-full` **Full screen.** `await t.click('.tiptap .dblock .dock button[aria-label="Full screen"]')`: `.dblock.full[role="dialog"]`,
  the drawing at 200%, ✕ at the top right. Esc twice (the first lets go of editing, the second of the screen) or
  `await t.click('button[aria-label="Back to the note"]')`: back in the note, the keyboard in `.tiptap`.
- `diagram-chart` **A chart's part (ChartEditor).** After `/pie`: `await t.spot('slice:0'); await t.type('Rent');` the legend reads
  Rent at once; `await t.click('.layer .bar input[aria-label="Value"]'); await t.key(`${t.mod}+a`); await t.type('70'); await t.key('Enter');`
  the ring and percentages redraw (Rent 58.3%); the markdown is `"Rent" : 70`.
- `diagram-list` **List (DiagramForm).** `await t.click('.tiptap .dblock.active .dock button[aria-label="More"]'); await t.click('[role="menu"] [role="menuitem"]:has-text("List")');`
  then `.tiptap .dblock.active .form`. Pie: click `.tiptap .p-slice input.label >> nth=1`, ⌘A, `Food`; `input.num
  >> nth=1`, ⌘A, `20`: legend Rent / Food / C, markdown `"Food" : 20`. Sequence: click
  `.tiptap .form input[aria-label="Message"]`, ⌘A, `Sign in`; `await t.click('.tiptap .form .adds button.add:has-text("Message")'); await t.type('Welcome');`
  a third arrow Welcome is drawn; markdown `p1->>p2: Sign in` … `p1->>p2: Welcome`.
- `diagram-lanes` **Swimlanes.** After `/swimlanes`: `await t.page.waitForSelector('.tiptap .dblock.active svg.lanes')`: lanes Customer,
  Store, Delivery with Order … Receive; the markdown has `flowchart TD` and `subgraph L1["Customer"]` … `L3["Delivery"]`.
- `diagram-edit` `diagram-full` **Phone.** `t.page.locator('.tiptap p').last().tap()`, `/flowchart`, Enter; tap Start by its box's centre with
  `t.page.touchscreen.tap`; `await t.page.locator('.layer .bar button[aria-label="Edit the text"]').tap()` (the field
  `Step name` takes the keyboard), ⌘A, `Begin`, Enter: `n1(["Begin"])`. ⤢ tapped: whole screen at 89%; ✕ tapped: back.

Proved on 2026-11-17 (0.7.147), shots under `${TMPDIR}/eve-verify/`: `diag-flow/shots/mac-01-flowchart`,
`mac-02-edited`, `mac-03-added`, `mac-04-undone`, `mac-05-full`, `mac-06-back`; `diag-chart/shots/mac-01-pie-part`,
`mac-02-pie-list`; `diag-more/shots/mac-01-sequence-list`, `mac-02-swimlanes`; `diag-phone/shots/phone-01-flow-edit`,
`phone-02-full`.

## Gotchas

- `npm run e2e:diagrams` wants Chromium (`CHROMIUM_PATH`); drive.mjs draws them in WebKit fine.
- Lines draw in with a motion: wait ~800 ms before a shot or heads may be missing.
- Click boxes through `t.click`/`t.spot` (mouse at the centre): Playwright's own click misplaces SVG text.
- A pie part typed over and then Esc puts the old name back; Enter (or the Value field) keeps it.
- On the whole screen the keyboard is on `<body>` by design (`letGo()`); keys reach the diagram from there.
- `t.click` clicks the element's place on screen: scroll a field below the window into view first, or the click lands on nothing and the diagram closes.
- A phone's tapped box does not take the keyboard: go through **Text**. Keys typed without it go into the note under
  the diagram.
- In ⋯ → List a pie row's dot is the colour the chart draws that part in (both from `sliceHues`, `charts.ts`): compare
  `.p-slice .swatch` with `.pie-legend .dot` by `getComputedStyle(...).backgroundColor`.
