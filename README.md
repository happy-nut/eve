<p align="center"><img src="docs/banner.svg" alt="Eve" width="800"></p>

# Eve

Named after EVE from Pixar's *WALL·E* ([wiki](https://en.wikipedia.org/wiki/WALL-E)): a sleek white shell,
a black visor, and glowing blue eyes. The theme borrows exactly those four colors — shell white, soft gray,
visor black, eye blue — with the blue reserved for what matters: links, focus, and the cursor of attention.

Fast, keyboard-first markdown notes for macOS. Summon it from anywhere with a global hotkey,
type Notion-style markdown, link notes with `[[wiki links]]`, and sync through a private GitHub repo.

- **Instant** — Tauri 2 shell (native WKWebView, ~10 MB), Svelte 5 UI, TipTap editor. No Electron.
- **Global hotkey** — `⌘⇧Space` (default) shows/hides Eve over any app; focus returns to where you were. Like Raycast, Eve stays out of the Dock and ⌘Tab (toggle in Settings → Sync & app). Eve launches at login (toggle in Settings); closing the window only hides it, so the hotkey keeps working. `⌘Q` quits.
- **Live markdown** — `# `, `- `, `1. `, `[ ] `, `> `, ` ``` `, `**bold**`, `` `code` ``… render as you type.
- **Every shortcut is rebindable** live in Settings (`⌘,`): system hotkey, app actions, editor formatting.
- **Notes link to notes** — type `[[` for a picker; click a link to jump (creates the note if missing). `⌘[` / `⌘]` go back and forward through the notes you visited, restoring the cursor.
- **Link cards** — paste a URL on an empty line (or type one and press Enter) and it becomes a compact preview card: favicon, title, description, thumbnail; click opens the browser. The file keeps just the bare URL.
- **Section outline** instead of a scrollbar — when a note is taller than the window, one tick per heading sits at the left edge, dark for the sections on screen; hover to see the titles, click to jump.
- **`/` block menu** — callouts (`> [!💡]` in markdown), code blocks, dividers, images (copied into `notes/assets/`), note links, kanban boards. Headings and lists come from markdown shortcuts (`# `, `- `, `1. `, `[ ] `, `> `).
- **Kanban** — `/kanban` drops a Notion-style board into the note. Drag cards between columns, or drive it from the keyboard: ↑↓←→ move between cards, ⌥↑↓←→ move a card (⌥←→ a column), Enter opens the card as a floating page with its own markdown body, ⌫ deletes. ↓ from the line above (↑ from the line below) steps into the board; Esc steps back out. The + past the last column adds one; hovering the board shows a × under it that deletes the board (or press ⌫ at the start of the line after it). The file keeps a ```` ```kanban ```` fence holding JSON (`{ "columns": [{ "title", "cards": [{ "title", "body" }] }] }`); a fence that fails to parse is shown as a plain code block, so a bad edit never loses cards.
- **Sidebar** with search (`⌘K`), emoji icons for notes and groups (picker above the title, like Notion), hold `⌘` to number the visible notes and `⌘1`…`⌘9` to jump, collapsible **groups** (folders, nested up to 3 levels). Drag notes or whole groups to reorder or move them; `⌘\` opens and focuses the list (press again from the list to close it and return to the editor) (↑↓ move, `i` sets an emoji icon, ⌥↑↓ move notes or groups one row at a time (groups walk out of and into other groups), ⌥← ⌥→ un-nest / nest a group, Space or ← → fold, ⌫ deletes with confirmation, Esc back).
- **Opens .md files** — Eve registers as a Markdown editor, so it shows up in Finder's *Open With*. Such files are edited in place and listed under *Open files* (not synced; ⌫ closes them).
- **Plain files** — each note is a `.md` with a tiny frontmatter (id, updated, group) in `~/Library/Application Support/dev.happynut.eve/notes/`.
- **Sync without a server** — a private GitHub repository is the backend: one commit per change, last-writer-wins, images included. Edit a note on github.com and it comes back to the app.

## Install

```bash
brew install --cask happy-nut/tap/eve
```

Apple silicon only. The app is ad-hoc signed, not notarized; the cask strips the quarantine flag so it opens
without a Gatekeeper detour. New versions: `brew reinstall --cask eve`.
Releases are built by `.github/workflows/release.yml` from a `v*` tag; the cask lives in [happy-nut/homebrew-tap](https://github.com/happy-nut/homebrew-tap).

## Run from source

```bash
npm install
npm run app        # tauri dev (needs Rust: https://rustup.rs)
npm run bundle     # builds src-tauri/target/release/bundle/macos/Eve.app (~4 MB); drag it to /Applications
```

`npm run dev` runs the UI alone in a browser (notes go to localStorage) — handy for UI work.

## Android

The same app runs on Android (Tauri's Android target), syncing through the same `eve-notes` repository.
Sign in from Settings → Sync on the phone too.

- **Home-screen widget** — long-press the home screen → Widgets → Eve. It asks what to show: the newest notes,
  or one note pinned and shown whole. Markdown is drawn as in the editor (to-dos, bold, code, links,
  callouts, boards as a column count). Tap a note to open it ready to write, + for a new one, ↻ to sync now;
  long-press → the pencil changes what it shows.
- **Background sync** — every 15 minutes (Android's floor) while Eve is closed, notes changed elsewhere come
  down and the widget redraws. The app pushes when it leaves the screen.
- Back goes from a note to the list, and from the list out of the app.

```bash
npm run tauri -- android dev              # on a connected phone or emulator (needs ANDROID_HOME, NDK_HOME)
npm run tauri -- android build --apk      # src-tauri/gen/android/app/build/outputs/apk/
```

The phone has its own version (`src-tauri/tauri.android.conf.json`) and its own releases: an `android-v*` tag
builds only the signed APK (never marked Latest, so Homebrew keeps pointing at the Mac), a `v*` tag only the Mac
app. Installed phones find newer APKs by themselves and update with one tap.

Not on the phone: the global hotkey, Dock/login-item settings, PDF/image export, and Quick Look previews.

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

Settings → Appearance sets the theme (system, or pinned light / dark) and the editor typeface (system, serif, rounded, mono or any CSS font family), size, line height and text width.

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

## Claude (MCP)

Settings → Sync & app → Claude → **Connect** lets Claude read your notes. One click registers Eve's
read-only [MCP](https://modelcontextprotocol.io) server with every Claude app on the Mac: it adds `eve` to
Claude Desktop's `claude_desktop_config.json` (every other key kept, in its order; the file as it was before is
saved once as `claude_desktop_config.json.eve-backup`), and runs
`claude mcp add --scope user eve -- …/Eve.app/Contents/MacOS/eve mcp` for Claude Code. Restart Claude Desktop
after connecting.

The server is the app's own binary started as `eve mcp` (no window, no Tauri): it reads `notes/*.md` from disk,
so it works while Eve is closed. Nothing it offers writes. Tools: `list_notes` and `search_notes` (every word
must match; title hits first), both narrowed by group and by period (`from` / `to`: `2026-09` or `2026-09-05`,
local time); `read_note` (by title or id, a `[[Title#Section]]` link, or one section); and `read_period`, every
note made or changed in a month or a range, in full and oldest first, for looking back in one call. A note's
creation time comes from its id (a day's note is its day). Only a note's last change is known, so a note edited
in September and again in October counts for October. Deleted notes and the calendar's own are left out.

Every answer stays under ~9,000 tokens (Claude Code warns past 10,000 and sets anything past 25,000 aside in a
file). A longer note comes in parts, cut between lines, a code block cut open closed off, the first part listing
its sections; the answer ends with a `cursor` to pass back, refused if the note changed meanwhile. A long period
comes in parts the same way, and one very long note in it as its start and sections. Long lists name how many
were left out. A note file past 8 MB is read that far; bytes that are not UTF-8 show as `�` rather than the note
going missing; a title two notes share names the other; a missing notes folder names the path it looked in.

Two prompts start the looking back (Claude Code: `/mcp__eve__monthly_review 2026-09`; Claude Desktop: the + menu):
`monthly_review` (what you did, decided and learned, what is still open, three things to try next month) and
`retrospective` (Keep / Problem / Try over any range, optionally about one thing). By hand, from any MCP client:
command `/Applications/Eve.app/Contents/MacOS/eve`, args `["mcp"]`; `EVE_NOTES_DIR` points it at another folder.

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
  src/mcp.rs              `eve mcp`: read-only MCP server over stdio (tools + review prompts)
  src/mcp_setup.rs        Settings → Claude: register it with Claude Desktop / Claude Code
```

MIT.
