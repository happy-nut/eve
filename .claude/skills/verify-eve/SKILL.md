---
name: verify-eve
description: Launch Eve (the Svelte/TipTap notes app) in WebKit as a Mac or a phone window, drive it the way a person does, and keep a screenshot per feature as proof. Use to see a change working in the real app rather than in tests alone, for "run the app", "show it", "check it works", and before reporting any visible fix as done.
---

# Verify Eve

Eve's page is the same Svelte app in every shell: the Mac app is it inside Tauri's WebKit, the phone app inside
Android's WebView. So the app is proved in Playwright's WebKit on a Vite dev server, with notes seeded into
`localStorage` (what the web build stores them in). What this does not reach: the Tauri side (`src-tauri/`: the
global ⌘⇧E, the files on disk, the MCP server, `memory.log`) and real GitHub sync. Say so when a change lives there.

The one driver is `.claude/skills/ui-audit/drive.mjs`, shared with the `ui-audit` skill. Each run starts its own
Vite server on a free port and its own browser, and closes both: runs never share an instance, and two may run at once
(more than two compile slowly).

## Doctor

```bash
node .claude/skills/verify-eve/doctor.mjs
```

Read-only. Says whether `node_modules`, Playwright's WebKit, vite and drive.mjs are there, and which Eve version and
commit it would serve (and whether `src/` has uncommitted changes, which the run includes). Run it first, and again
after a run that stopped strangely. Fixes it names: `npm ci`, `npx playwright-core install webkit`.

## Launch and drive

There is no server to keep up: launching is one drive.mjs run.

```bash
RUN=${TMPDIR:-/tmp}/eve-verify/$(date +%Y%m%d-%H%M%S)-<feature>
mkdir -p $RUN/notes
# the notes to start with: one file per note, named <id>.md; the first by name is open at start
printf '# Plan\n\nFirst line.\n' > $RUN/notes/a.md
# steps.mjs: export default async (t) => { ... }   (see the feature files for real ones)
node .claude/skills/ui-audit/drive.mjs $RUN/notes $RUN/steps.mjs $RUN/shots          # a Mac window, 1200×900
node .claude/skills/ui-audit/drive.mjs $RUN/notes $RUN/steps.mjs $RUN/shots --phone  # a phone, 390×844, touch
```

Ready means `.tiptap` is on the page, which drive.mjs waits for (up to 60 s on a cold compile) before the steps run.
A note file is a body, or a whole saved note with its own front matter when it needs a `parent:` (a page under
another) or an `icon:`:

```
---
id: b
updated: 1763337600000
deleted: false
order: 1
parent: a
---
# Groceries
```

In the steps, `t` gives: `t.key('Meta+n')` (use `` `${t.mod}+n` ``: ⌘ on a Mac host), `t.type(text)`,
`t.click(selector)` (the mouse at the element's centre), `t.spot(key)` (a diagram part by `data-spot`),
`t.shot(label, selector?)`, `t.wait(ms)`, `t.markdown()` (the open note as it would be saved), and `t.page`
(Playwright) for anything else, such as `t.page.reload()`, which keeps the seeded and typed notes.

Handles that hold: keys first (`⌘N` new note, `⌘P` search, `/` menu, `⌘F` find, `⌘,` settings), then
`aria-label`s (`button[aria-label="Settings"]`, `[aria-label="Trash"]`), then the app's own classes (`.tiptap` the
note, `aside [data-row]` a sidebar row, `.suggest li` a picker row, `.find` the find bar, `.mermaid-view` a drawn
diagram). The top bar's `+` opens a menu, not a note: make notes with ⌘N.

## Evidence

- One screenshot per feature, of the state that proves it, after the action that made it. Open each one with Read
  and look at it: a run that threw nothing proves nothing.
- The action goes through what a person uses (keys, clicks, typing), never `window.__editor.commands` or a store
  method: those skip the keymaps, pickers and menus where bugs live. Seeding notes before the run is the exception.
- Check the effect as well as the look: drive.mjs prints the open note's saved markdown and every page or console
  error at the end. A change that should outlast a reload is checked after `t.page.reload()`.
- The shots stay in `$RUN/shots`, outside the repository. Send the ones that prove the change with SendUserFile.

## Cleanup

drive.mjs closes its own browser and server, also when a step throws (it shoots `*-99-stopped.png` first). Kill
nothing by name: if a run was cut off, find its leftovers by its own parent's PID and stop only those. Delete
`$RUN/notes` and `steps.mjs` if you like; keep `$RUN/shots`. Never leave `e2e/out/` changed (`git checkout -- e2e/out`).

## Features

`features/README.md` lists what a person does in Eve and how to prove each one. Drive every entry point a feature
lists, not just the handiest.

## Going further

- Two devices writing one note before they sync is a state machine (`src/lib/sync.svelte.ts`, `merge3`): if its
  bugs come back, a TLA+ model (no words dropped, a conflict kept) fits better than more drives.
- Clicking through the app at random against rules like "no popup off screen, focus never on `<body>`"
  (Bombadil-style property tests) would reach orders of keys no one writes by hand.

Both only when a bug class shows the need: `/devkit:formal-setup` sets one up.
