# Working on Eve

Eve is a Tauri 2 + Svelte 5 + TipTap markdown notes app (macOS and Android). README.md says what it does;
this file says how to change it without bringing back bugs it has already had.

## Checks

```bash
npm test                                       # node tests + guards + vitest (jsdom), the same as CI
npx svelte-check --tsconfig ./tsconfig.app.json
npm run e2e:selection && npm run e2e:popups && npm run e2e:code   # WebKit, as CI runs them
CHROMIUM_PATH=/path/to/chrome node e2e/diagrams.mjs               # diagrams, math, phone take CHROMIUM_PATH
```

Do not commit `e2e/out/` screenshots that a run changed (`git checkout -- e2e/out`).

## The rules, and the guard that holds each one

Most of the ~370 fixes so far fell into a few classes. Each class now has one place it is handled and a test that
fails when something goes around it. Work through these places; if one truly can't do what you need, extend it
rather than writing a one-off beside it.

| Class of bug | Do it through | Guard |
|---|---|---|
| A note changes on save, reload, copy or paste | each node's `parseHTML`/`renderHTML`/markdown `serialize` agreeing | `src/lib/schemaGuard.dom.test.ts`: every node and mark needs a sample in `SAMPLES` (`src/lib/schemaSamples.ts`) (a new one without it fails); each sample is saved, read back, copied and pasted, alone, nested in quote/callout/toggle/list, and beside every other block |
| An editing key breaks the note or ⌘Z can't take it back | the editor's keymaps and commands in `src/lib/editor.ts`, `blocks.ts` | `src/lib/keyMatrix.*.dom.test.ts` (`keyMatrix.harness.ts`): every key in `KEYS` at both ends of every line of every block in `BLOCKS`, alone and nested — the note stays valid, saves the same twice, one ⌘Z restores it, no newline in non-code text. Add new blocks to `BLOCKS` and new editing keys to `KEYS` |
| Back / Esc / "put away" forgets a popup; focus lands nowhere after one closes | `ui.layers.push(...)` (`src/lib/ui.svelte.ts`): every popup, sheet, dialog, panel is a layer; closing it gives focus back once | `src/lib/layers.dom.test.ts` (`OPENERS satisfies Record<LayerId, …>`: a new `LayerId` without an opener fails `svelte-check`); the focus sentinel (`src/lib/focusWatch.ts`, wired in `src/lib/testSetup.ts`) fails any test that leaves focus on `<body>` — use `letGo()` for a deliberate blur, `allowFocusLoss()` in a test that means it |
| A key reaches the wrong handler; IME Enter does something | `claimKeys(...)` in `src/lib/keys.ts`, the only window/document key listener; `handledBy(e)` instead of flags on events | `src/lib/keyListeners.test.mjs` fails on any other window/document/body key listener (element listeners need an allowlist entry with a reason) |
| A picker (`/`, `[[`, `@`, `:`) takes the Enter meant for a new line | `PICKERS` and `suggestKeys(...)` in `src/lib/slash.ts` | `src/lib/pickerKeys.dom.test.ts`: every picker in `PICKERS` × typed / arrows / Esc, with the expected outcome |
| A popup or bar is clipped, off screen, or covers text | `floatAt(...)` / `placeAt(...)` and `screenInsets()` in `src/lib/popup.ts` | `src/lib/popup.dom.test.ts` (a grid of Mac and phone windows, keyboard up); `src/lib/zIndex.test.mjs` fails on a numeric `z-index` (use the `--z-*` tokens in `src/app.css`, whose order is written down there) and on `window.innerWidth/innerHeight` in components |
| The caret jumps to another cell, item or line when the open note comes in changed (sync) | `takeBody(...)` in `src/lib/takeBody.ts`, the only place a body from outside goes into an open editor; a note read back must be the same document as the one open | `src/lib/caretSync.dom.test.ts`: every sample in `src/lib/schemaSamples.ts`, alone and nested, a caret in every line, each line before it written longer and shorter — the caret stays by its text, a picture or formula chosen whole stays chosen; `schemaGuard`'s "read back, the same document" (a blank line or a board read back differently is taken for an edit) |
| Opening a note or typing slows down as the library grows | the stores' lists are `$derived` and kept (`notes.visible`, `pages`, `daily`, `byTitle`, `groups.notesIn`), typed `readonly` so nothing sorts them in place; nothing adds or removes a stylesheet when a note opens | `src/lib/speed.dom.test.ts`; `npm run e2e:perf` times a start, a key and a switch with 800 notes in WebKit (judge by a built app: `EVE_URL` on `npx vite preview`) |
| The notes/groups stores break a rule (open note deleted, back into a deleted note, a page its own ancestor) | the store methods in `src/lib/notes.svelte.ts`, `groups.svelte.ts` | `src/lib/storeFuzz.dom.test.ts`: long seeded random runs, rules checked after every step — add new operations to its `ops` and new rules to `broken()` |

A bug fix starts with a failing case in the guard for its class (or in the nearest `*.dom.test.ts`), then the fix.

## Conventions

- Comments say why, in plain words, as the code around them does.
- Commits and PRs describe user-visible behaviour.
- Versions live in `src-tauri/tauri.conf.json`, `src-tauri/tauri.android.conf.json` (the phone's own), `src-tauri/Cargo.toml`
  and the `eve` entry in `src-tauri/Cargo.lock`; releases are built by `.github/workflows/release.yml` from a `v*` or
  `android-v*` tag.
