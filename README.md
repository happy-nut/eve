# Eve

Fast, keyboard-first markdown notes for macOS. Summon it from anywhere with a global hotkey,
type Notion-style markdown, link notes with `[[wiki links]]`, and sync through your own server.

- **Instant** — Tauri 2 shell (native WKWebView, ~10 MB), Svelte 5 UI, TipTap editor. No Electron.
- **Global hotkey** — `⌘⇧Space` (default) shows/hides Eve over any app; focus returns to where you were.
- **Live markdown** — `# `, `- `, `1. `, `[ ] `, `> `, ` ``` `, `**bold**`, `` `code` ``… render as you type.
- **Every shortcut is rebindable** live in Settings (`⌘,`): system hotkey, app actions, editor formatting.
- **Notes link to notes** — type `[[` for a picker; click a link to jump (creates the note if missing).
- **Sidebar** with search (`⌘K`), FLIP-animated list, smooth transitions everywhere.
- **Plain files** — each note is a `.md` with a 3-line frontmatter in `~/Library/Application Support/dev.happynut.eve/notes/`.
- **Self-hosted sync** — a zero-dependency Node server (`server/`), one Docker command, last-writer-wins.

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
| app    | New note / Search / Sidebar     | `⌘N` `⌘K` `⌘\`    |
| app    | Next / previous note            | `⌘⇧↓` `⌘⇧↑`       |
| app    | Delete note / Settings / Hide   | `⌘⇧⌫` `⌘,` `Esc`  |
| editor | Bold / Italic / Underline       | `⌘B` `⌘I` `⌘U`    |
| editor | Strike / Code / Link / `[[`     | `⌘⇧X` `⌘E` `⌘⇧K` `⌘[` |
| editor | Text / H1 / H2 / H3             | `⌘⌥0` `⌘⌥1` `⌘⌥2` `⌘⌥3` |
| editor | Bullets / Numbers / To-dos      | `⌘⇧8` `⌘⇧7` `⌘⇧9` |
| editor | Quote / Code block / Divider    | `⌘⇧.` `⌘⌥C` `⌘⇧-` |

Change any of them in Settings → Shortcuts: click the key chip, press the new combo. Applies immediately.

## Sync server

```bash
cd server
EVE_TOKEN=$(openssl rand -hex 24) docker compose up -d      # or: EVE_TOKEN=... node index.mjs
```

Then in Eve → Settings → Sync, enter the URL (e.g. `https://notes.example.com`) and the token.
Sync runs 2 s after edits, every minute, and on focus. Put it behind HTTPS (Caddy, Tailscale, …).

Protocol is one endpoint: `POST /sync {cursor, notes[]} → {cursor, notes[]}`. Conflicts resolve
last-writer-wins by `updatedAt`; deletes are tombstones. `node server/test.mjs` exercises it.

## Layout

```
src/                Svelte UI
  lib/notes.svelte.ts     note store, .md (de)serialization
  lib/shortcuts.svelte.ts all key bindings + rebinding logic
  lib/editor.ts           TipTap setup, live keymap
  lib/wikilink.ts         [[link]] node + markdown rule + suggestion popup
  lib/sync.svelte.ts      sync client
src-tauri/          Rust: file storage commands, window toggle, global-shortcut plugin
server/             sync server (Node ≥ 22, node:sqlite), Dockerfile, compose.yaml
```

MIT.
