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
- **Lists that nest like a document** — an indented numbered list counts `1.` → `a.` → `i.` and on (nine levels, then round again), in the editor and on the phone's widget. Bullets, numbers and to-dos mix freely: Tab under a numbered item makes a bullet stay a bullet, `⌘⇧7/8/9` switch only the lines you picked, and ⌫ / ⇧Tab at the start of an indented item bring it out a level as what it was. Numbering carries on across a list split around it.
- **Every shortcut is rebindable** live in Settings (`⌘,`): system hotkey, app actions, editor formatting.
- **Notes link to notes** — type `[[` for a picker; click a link to jump (creates the note if missing). `[[Note|shown as]]` links under another name, as in Obsidian. `⌘[` / `⌘]` go back and forward through the notes you visited, restoring the cursor.
- **Link cards** — paste a URL on an empty line (or type one and press Enter) and it becomes a compact preview card: favicon, title, description, thumbnail; click opens the browser. The file keeps just the bare URL.
- **Find & replace in a note** — `⌘F` (or the note's right-click menu; on a phone, the note's ⋯) opens a bar over the note: ↩ / ⇧↩ walk the matches, the replace field replaces one at a time (↩) or all at once.
- **Section outline** instead of a scrollbar — when a note is taller than the window, one tick per heading sits at the left edge, dark for the sections on screen; hover to see the titles, click to jump.
- **Obsidian's syntax** — `[[Note|alias]]` links, `==highlights==` (`⌘⇧H`), and callouts by type: `> [!warning] Title` shows the type's icon and colour, the text on its line as the title; the fold mark (`-`/`+`) is kept. A vault's notes read and save back unchanged.
- **`/` block menu** (a `/` typed at the start of a line or after a space; one already in the text never opens it) — callouts (`> [!💡]` in markdown), code blocks, dividers, images (copied into `notes/assets/`), note links, kanban boards, diagrams, equations. Headings and lists come from markdown shortcuts (`# `, `- `, `1. `, `[ ] `, `> `).
- **Kanban** — `/kanban` drops a Notion-style board into the note. Drag cards between columns, or drive it from the keyboard: ↑↓←→ move between cards, ⌥↑↓←→ move a card (⌥←→ a column), Enter opens the card as a floating page with its own markdown body, ⌫ deletes. ↓ from the line above (↑ from the line below) steps into the board; Esc steps back out. The + past the last column adds one; hovering the board shows a × under it that deletes the board (or press ⌫ at the start of the line after it). The file keeps a ```` ```kanban ```` fence holding JSON (`{ "columns": [{ "title", "cards": [{ "title", "body" }] }] }`); a fence that fails to parse is shown as a plain code block, so a bad edit never loses cards.
- **Diagrams** — a ```` ```mermaid ```` block ([Mermaid](https://mermaid.js.org)) is drawn as its picture: white cards and quiet lines on a soft grey card, one strong blue, light or dark. Every kind mermaid 11 draws is drawn (flowchart, sequence, class, state, ER, user journey, Gantt, pie, quadrant, requirement, git graph, C4, mind map, timeline, sankey, XY chart, block, packet, kanban, architecture, radar, treemap); ZenUML, a separate mermaid plug-in, is not included. Pie charts, timelines and Gantt charts Eve draws itself — a donut with its parts listed beside it, a column of dates, a tidy schedule with each task's dates — since mermaid's own drawings of those stretch and crowd; the note still keeps mermaid's code, so other apps draw it their way. Diagrams are made and changed right in the note, with no mermaid to know: the `/` menu has **Flowchart, Sequence diagram, Pie chart, Mind map, Timeline and Gantt chart**, each putting a small example in the note, open for editing; click any of them later to edit it again (Done, or a click elsewhere, is done). A flowchart is drawn on its picture: click a box and type in it, the drawing following the text; its **+** adds the next step, or, dragged onto another box, joins the two (or **Connect** in its bar, then a tap on the other box — the easy way on a phone); a bar over a box sets its shape or deletes it; click a line to make it dotted or bold, label it, turn it round or delete it; "+ Box" or a double-click on empty space adds one on its own; Tab adds the next step, ⌫ deletes. The other kinds show their parts as rows under the drawing (participants and messages, slices, branches, periods, tasks with dates). Every change is in the note at once, and ⌘Z undoes it. A wide diagram shrinks to the note's width only so far (80%, where its text stays readable) and then scrolls sideways; its ⤢ button opens it full screen, to zoom (wheel, pinch, + / −) and drag around. The note keeps plain mermaid code, readable anywhere; a diagram written by hand with more than these show (styles, subgraphs, notes) opens in its code instead, so nothing is lost; "Code" shows any diagram's code; a diagram that does not parse shows the error under its code. Mermaid loads only with the first diagram that needs it, and draws with `securityLevel: strict` (labels stay text). The phone widget shows such a block as "📊 Diagram".
- **Equations** — formulas as Obsidian, GitHub and pandoc write them: `$E = mc^2$` in a line, `$$ … $$` on lines of their own. They are drawn as math in the note ([MathLive](https://mathlive.io), loaded with the first formula) and made and changed with no TeX to know: the `/` menu's **Equation** (a block) and **Inline equation** (in the line, also `⌘⌥E`; selected text becomes its TeX), or typing `$x^2$` or `$$` and a space. Click a formula and it becomes the box it is typed in, showing it exactly as the note does: `x^2` puts the 2 up, `/` makes a fraction, ⇥ moves through the empty slots and out of a part. Under it a row of the parts a formula is built from, put in by a click — **Basic** (fraction, power, subscript, roots, brackets, absolute value, bar, vector, text), **Symbols** (± × ÷ ≤ ≥ ≠ ≈ ∞ → ⇒ ∈ ⊂ ∪ ∩ ∀ ∃ …), **Calculus** (sum, product, integrals, limit, derivatives, log, trig), **Greek**, **Matrix** (2×2, 3×3, brackets, determinant, column vector, cases) — under a block, and in a small panel under a formula in a line. **TeX** shows the formula's TeX to edit as text. Enter, Esc, Done or a click elsewhere finish; ⌫ in an empty formula removes it. On a phone, MathLive's math keyboard comes up in place of the system one. Every change is in the note at once, ⌘Z undoes it, and a copy is the formula's markdown. Dollars that are money stay text: a `$` opens a formula only with no space after it and closes one only with no space before it and no digit after (pandoc's rule), so "$5 and $10" is never a formula; text that would read as one is saved with its dollars escaped (`\$`). The phone widget shows a block's TeX on one line, after "∑".
- **Text size** — `⌘+` / `⌘-` step the note's text between 12 and 28 px, `⌘0` goes back to 15; a pill shows the size. Settings → Appearance has the same as a slider.
- **Import a folder** — drop Markdown files or whole folders (an Obsidian vault, a Notion export, a Google Keep Takeout) onto the sidebar, or onto a group to import into it. Folders become groups (three levels deep), a page's folder of the same name becomes its sub-pages, and pictures a note reaches by a relative path or an Obsidian `![[embed]]` come along; links between the files become `[[links]]`.
- **Sidebar** with search (`⌘K`; ↓ walks into the matches, ↑ from the first comes back), emoji icons for notes and groups (picker above the title, like Notion), hold `⌘` to number the visible notes and `⌘1`…`⌘9` to jump, collapsible **groups** (folders, nested up to 3 levels). Drag notes or whole groups to reorder or move them; `⌘\` opens and focuses the list (press again from the list to close it and return to the editor) (↑↓ move, `i` sets an emoji icon, ⌥↑↓ move notes or groups one row at a time (groups walk out of and into other groups), ⌥← ⌥→ un-nest / nest a group, Space or ← → fold — ← on a note with sub-pages folds it and ← again goes to its parent, as in Finder; → on a note or an open group (or Esc) back to the editor, ⌫ deletes with confirmation). The list stays open while you write; Settings → Appearance → *Close sidebar when you start writing* folds it away at the first keystroke instead.
- **Opens .md files** — Eve registers as a Markdown editor, so it shows up in Finder's *Open With*. Such files are edited in place and listed under *Open files* (not synced; ⌫ closes them).
- **Plain files** — each note is a `.md` with a tiny frontmatter (id, updated, group) in `~/Library/Application Support/dev.happynut.eve/notes/`.
- **Sync without a server** — a private GitHub repository is the backend: one commit per change, last-writer-wins, images included. Edit a note on github.com and it comes back to the app.
- **Claude reads your notes** — Settings → Claude → Connect registers Eve's MCP server with Claude Desktop and Claude Code in one click; Claude can then list, search and read your notes, and open one in Eve for you, never change them (see [Claude (MCP)](#claude-mcp)). The same commands work in a terminal: `eve help` (see [Command line](#command-line)).

## Install

```bash
brew install --cask happy-nut/tap/eve
```

Apple silicon only. The app is ad-hoc signed, not notarized; the cask strips the quarantine flag so it opens
without a Gatekeeper detour. New versions arrive in the app, as on the phone: when one is out, the sidebar and
Settings → Version offer **Update**, which downloads the release's zip, checks it against the SHA-256 GitHub lists
for it, puts the new Eve.app in place of the old one and restarts (`brew reinstall --cask happy-nut/tap/eve` does the same by hand;
0.7.12 and older need it once).
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
- **Opens where you left off** — the note you had open, not the list.
- **A list made for a thumb** — each row shows the note's title, when it was edited and two lines of it. Swipe a
  row left to delete it, right to move it to another group; long-press for its menu (icon, move to a group, reorder, export, delete).
  *Reorder* gives every row a handle to drag it by.
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
| app    | Larger / smaller / default text | `⌘+` `⌘-` `⌘0`    |
| editor | Bold / Italic / Underline       | `⌘B` `⌘I` `⌘U`    |
| editor | Strike / Code / Link / `[[`     | `⌘⇧X` `⌘E` `⌘⇧K` `⌘⇧L` |
| editor | Highlight (`==`)                | `⌘⇧H`             |
| editor | `/` menu / Callout / Image       | `⌘/` `⌘⇧C` `⌘⇧I` |
| editor | Equation in the line (`$`)      | `⌘⌥E`             |
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

**GitHub Enterprise, an organization, or a token**: under the Sign in button, *GitHub Enterprise, an
organization, or a token…* takes a server (`acme.ghe.com` for Enterprise Cloud with data residency, or a
company's own GitHub Enterprise Server such as `github.acme.com`; blank for github.com, Enterprise Cloud
included), an owner (blank for your account, or an organization, where a company may want the notes kept),
and either a token (a classic one with the `repo` scope; *create one* opens that server's page for it) or,
for browser sign-in on another server, the Client ID of an OAuth App its admin registered for Eve with
Device Flow on. The repository must be private: an existing `internal` or public one is refused. The phone
set up from the Mac, and its background sync, use the same server. A server inside a company network needs
that network (VPN) on the phone too.

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
so it works while Eve is closed. It only hands over the notes, exactly as written; what to do with them is up to
Claude and you. Nothing it offers writes. Tools: `list_notes` and `search_notes` (every word must match; title
hits first) find notes, narrowed by group and by the dates a note was made or last changed (`from` / `to`:
`2026-09` or `2026-09-05`, local time); `read_note` returns one (by title or id, a `[[Title#Section]]` link, or
one section) and `read_notes` several, by id, in the order given. `open_note` shows one in Eve — the running
app comes to the front with that note open, at a section if one is named (Eve starts if it was not running):
"find last week's meeting notes and open them". It hands macOS an `eve://open?id=…&section=…` link, which Eve
registers; such a link only ever shows a note, an unknown id is ignored, and nothing is created or changed.
Being the one tool that is not read-only, Claude asks before its first use. A note's creation time comes from its id (a
day's note is its day); only its last change is known, so a note edited in September and again in October is
found under October. Deleted notes and the calendar's own are left out.

Every answer stays under ~9,000 tokens (Claude Code warns past 10,000 and sets anything past 25,000 aside in a
file). What does not fit continues in the next answer, never shortened: a note is cut between lines (a code block
cut open is closed off), the first part of a long note lists its sections, and the answer ends with a `cursor` to
pass back, refused if the note changed meanwhile. Long lists name how many were left out. A note file past 8 MB
is read that far; bytes that are not UTF-8 show as `�` rather than the note going missing; a title two notes
share names the other; a missing notes folder names the path it looked in. By hand, from any MCP client: command
`/Applications/Eve.app/Contents/MacOS/eve`, args `["mcp"]`; `EVE_NOTES_DIR` points it at another folder.

## Command line

Every tool is also a command, the same code with the same answers (`src-tauri/src/core.rs` holds them once;
the MCP server and the command line only translate):

```bash
eve help                       # the commands; eve help <command> for one in full
eve list --group Work --from 2026-09
eve search 회의 결정 --limit 5
eve read "Weekly plan" --section Goals
eve read-many <id> <id>        # several, whole, in order
eve open "Weekly plan"         # show it in the running Eve
```

Homebrew links `eve` onto the PATH (the cask's `binary`); otherwise it is `/Applications/Eve.app/Contents/MacOS/eve`.
Bare words go to the command's main argument (the query, the title, the ids); the rest are `--name value`. Long
answers end with a cursor, passed back as `--cursor`. `eve` with no command starts the app, as before.

## Layout

```
src/                Svelte UI
  lib/notes.svelte.ts     note store, .md (de)serialization
  lib/shortcuts.svelte.ts all key bindings + rebinding logic
  lib/editor.ts           TipTap setup, live keymap
  lib/wikilink.ts         [[link]] node + markdown rule + suggestion popup
  lib/code.ts             code blocks: highlighting, the language chip, a mermaid block's drawing
  lib/mermaid.ts          mermaid, loaded on first use, in the app's colours
  lib/charts.ts           the pie, timeline and Gantt charts Eve draws itself
  lib/diagram.ts          a diagram's parts <-> mermaid code (DiagramBlock.svelte draws and edits it in the note,
                          FlowEditor.svelte a flowchart on its picture, DiagramViewer.svelte the full-screen view)
  lib/math.ts             $…$ and $$…$$ formulas: their nodes and markdown (MathEdit.svelte edits one in place,
                          lib/mathParts.ts the row of parts, lib/mathRender.ts MathLive loaded on first use)
  lib/importTree.ts       files and folders dropped on the list, as notes and groups
  lib/sync.svelte.ts      sync client (notes + images <-> GitHub)
  lib/github.ts           GitHub REST sync engine (pure, tested in Node)
src-tauri/          Rust: file/asset storage commands, window toggle, global-shortcut plugin
  src/core.rs             the notes' commands (list, search, read, open) and their help, read from disk
  src/mcp.rs              `eve mcp`: those commands as an MCP server over stdio
  src/cli.rs              `eve <command>`: the same commands in a terminal
  src/mcp_setup.rs        Settings → Claude: register it with Claude Desktop / Claude Code
  src/update.rs           the Mac updating itself from a release
```

MIT.
