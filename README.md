<p align="center"><img src="docs/banner.svg" alt="Eve" width="800"></p>

# Eve

Named after EVE from Pixar's *WALL·E* ([wiki](https://en.wikipedia.org/wiki/WALL-E)): a sleek white shell,
a black visor, and glowing blue eyes. The theme borrows exactly those four colors — shell white, soft gray,
visor black, eye blue — with the blue reserved for what matters: links, focus, and the cursor of attention.

Fast, keyboard-first markdown notes for macOS. Summon it from anywhere with a global hotkey,
type Notion-style markdown, link notes with `[[wiki links]]`, and sync through a private GitHub repo.

- **Instant** — Tauri 2 shell (native WKWebView, ~10 MB), Svelte 5 UI, TipTap editor. No Electron.
- **Global hotkey** — `⌘⇧Space` (default) shows/hides Eve over any app; focus returns to where you were. Eve launches at login (toggle in Settings); closing the window only hides it, so the hotkey keeps working. `⌘Q` quits.
- **Live markdown** — `# `, `- `, `1. `, `[ ] `, `> `, ` ``` `, `**bold**`, `` `code` ``… render as you type.
- **Every shortcut is rebindable** live in Settings (`⌘,`): system hotkey, app actions, editor formatting.
- **Notes link to notes** — type `[[` for a picker; click a link to jump (creates the note if missing). `⌘[` / `⌘]` go back and forward through the notes you visited, restoring the cursor.
- **`/` block menu** — callouts (`> [!💡]` in markdown), code blocks, dividers, images (copied into `notes/assets/`), note links. Headings and lists come from markdown shortcuts (`# `, `- `, `1. `, `[ ] `, `> `).
- **Sidebar** with search (`⌘K`), emoji icons for notes and groups (picker above the title, like Notion), hold `⌘` to number the visible notes and `⌘1`…`⌘9` to jump, collapsible **groups** (folders, nested up to 3 levels). Drag notes or whole groups to reorder or move them; `⌘\` opens and focuses the list (press again from the list to close it and return to the editor) (↑↓ move, `i` sets an emoji icon, ⌥↑↓ move notes or groups one row at a time (groups walk out of and into other groups), ⌥← ⌥→ un-nest / nest a group, Space or ← → fold, ⌫ deletes with confirmation, Esc back).
- **Opens .md files** — Eve registers as a Markdown editor, so it shows up in Finder's *Open With*. Such files are edited in place and listed under *Open files* (not synced; ⌫ closes them).
- **Plain files** — each note is a `.md` with a tiny frontmatter (id, updated, group) in `~/Library/Application Support/dev.happynut.eve/notes/`.
- **Sync without a server** — a private GitHub repository is the backend: one commit per change, last-writer-wins, images included. Edit a note on github.com and it comes back to the app.

## Run

```bash
npm install
npm run app        # tauri dev (needs Rust: https://rustup.rs)
npm run bundle     # builds src-tauri/target/release/bundle/macos/Eve.app (~4 MB); drag it to /Applications
```

`npm run dev` runs the UI alone in a browser (notes go to localStorage) — handy for UI work.

## Default shortcuts

| Scope  | Action                          | Keys              |
| ------ | ------------------------------- | ----------------- |
| system | Summon / dismiss Eve            | `⌘⇧Space`         |
| app    | New (note / group menu) / Search | `⌘N` `⌘K`        |
| app    | Next / previous note / Back / Forward | `⌘⇧↓` `⌘⇧↑` `⌘[` `⌘]` |
| app    | Sidebar: open + focus / close   | `⌘\`              |
| app    | Delete note / Settings / Hide   | `⌘⇧⌫` `⌘,` `Esc`  |
| editor | Bold / Italic / Underline       | `⌘B` `⌘I` `⌘U`    |
| editor | Strike / Code / Link / `[[`     | `⌘⇧X` `⌘E` `⌘⇧K` `⌘⇧L` |
| editor | `/` menu / Callout / Image       | `⌘/` `⌘⇧C` `⌘⇧I` |
| editor | Text / H1 … H5                  | `⌘⌥0` `⌘⌥1` … `⌘⌥5` |
| editor | Bullets / Numbers / To-dos      | `⌘⇧8` `⌘⇧7` `⌘⇧9` |
| editor | Quote / Code block / Divider    | `⌘⇧.` `⌘⌥C` `⌘⇧-` |

Settings → Font sets the editor typeface (system, serif, rounded, mono or any CSS font family), size, line height and text width.

Change any of them in Settings → Shortcuts: click the key chip, press the new combo. Applies immediately; a combo already used by another action is refused and the conflict is named.

## Sync

Settings → Sync → **Sign in with GitHub**. Eve shows an 8-character code, opens github.com/login/device in your
browser, and after you authorize it creates a private `eve-notes` repository under your account (or uses the
existing one) and starts syncing. Sync runs 2 s after edits, every minute, and on focus. Sign in on every device.

The repo mirrors the local folder: `notes/<id>.md` (frontmatter included) and `notes/assets/*`. Each round is
one `main` head lookup; changed files are fetched by blob and pushed as a single commit through the git data API
(no git binary). Conflicts resolve last-writer-wins by `updatedAt`; deletes are tombstones; a note untouched
locally since the last sync takes the remote version, so edits made on github.com win.

Sign-in is the OAuth device flow of the "Eve" OAuth App (`CLIENT_ID` in `src/lib/github.ts`; running your own
fork: register an OAuth App with *Device Flow* enabled and paste its client id). The two github.com calls go
through macOS's `curl` from Rust because github.com/login has no CORS. `npm test` runs the sync engine against an
in-memory fake; `EVE_TEST_REPO=owner/name EVE_TEST_TOKEN=… npm test` runs it against a real repo.

## Layout

```
src/                Svelte UI
  lib/notes.svelte.ts     note store, .md (de)serialization
  lib/shortcuts.svelte.ts all key bindings + rebinding logic
  lib/editor.ts           TipTap setup, live keymap
  lib/wikilink.ts         [[link]] node + markdown rule + suggestion popup
  lib/sync.svelte.ts      sync client (notes + images <-> GitHub)
  lib/github.ts           GitHub REST sync engine (pure, tested in Node)
src-tauri/          Rust: file/asset storage commands, window toggle, global-shortcut plugin
```

MIT.
