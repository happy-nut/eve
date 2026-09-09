# GATES — eve v0.1

- [x] G1 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in 149ms"
- [x] G2 Rust side compiles (cargo check)
  CHECK: cd src-tauri && cargo check 2>&1 | tail -1
  EXPECT: Finished
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "Finished `dev` profile"
- [x] G3 Sync server round-trips a note (push, pull, LWW, tombstone, 401)
  CHECK: node server/test.mjs
  EXPECT: SYNC_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "SYNC_OK"
- [x] G4 Markdown <-> editor round-trip incl. wiki links
  ABANDON: G4 needs a DOM; no jsdom dep wanted. Verified instead in the in-app browser against the Vite dev
  server: setContent(md) then getMarkdown() preserved `[[Project Alpha]]`, `- [x]`, fenced code; input rules
  turned `# `, `- `, `[ ] `, `> `, `**x**` into nodes; wikilink click opened/created the target note.
- [x] G5 App runs in browser dev mode: create note, sidebar updates, settings rebind applies live
  EVIDENCE: manual, in-app browser at http://127.0.0.1:5173 — rebound Bold to ⌘⇧B via Settings, localStorage
  stored {"bold":"Mod-Shift-b"}, ⌘⇧B then toggled bold in the editor; Esc closed the dialog.
- [x] G6 Public GitHub repo exists with code pushed
  CHECK: gh repo view happy-nut/eve --json visibility -q .visibility
  EXPECT: PUBLIC
  EVIDENCE: zsh, ~/repos/eve, exit 0, "PUBLIC https://github.com/happy-nut/eve"

# GATES — groups / slash menu / navigation batch (2026-09-06)

- [x] G7 Frontend type-checks; server test passes with group + order columns
  CHECK: npm run check && node server/test.mjs
  EXPECT: SYNC_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "SYNC_OK"
- [x] G8 Rust compiles with dialog plugin, import_asset, protocol-asset feature
  CHECK: cd src-tauri && cargo check 2>&1 | tail -1
  EXPECT: Finished
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "Finished `dev` profile"
- [x] G9 Browser dev-mode checks (manual, in-app browser): drag note between groups and to a position
  (insertion marker shown, frontmatter gets group/order), ⌘[ / ⌘] back/forward, ⌘⇧E focuses sidebar row,
  ⌫ opens confirm dialog and Enter deletes (deleted: true in storage), "/" opens block menu, "call" filters
  to Callout, Enter wraps block, markdown "> [!🚀]" round-trips to a callout, H5 renders.

# GATES — GitHub private repo sync, replaces server/ (2026-09-07)

- [x] G10 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in 221ms"
- [x] G11 Sync engine against an in-memory fake GitHub: init, push, pull, no-op round, concurrent push -> 422 -> retry, binary asset, utf-8, 401
  CHECK: npm test
  EXPECT: SYNC_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "SYNC_OK" (fake returns 409 on an empty repo like the real API)
- [x] G12 Same scenario against a real private repo (happy-nut/eve-sync-test) over the real API
  CHECK: EVE_TEST_REPO=happy-nut/eve-sync-test EVE_TEST_TOKEN=$(gh auth token) npm test
  EXPECT: SYNC_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "SYNC_OK" on the freshly created empty repo (first run: 409 -> contents PUT init; race -> 422 -> retry; 256-byte png round-trips)
- [x] G13 Rust compiles with list_assets / read_asset / write_asset
  CHECK: cd src-tauri && cargo check 2>&1 | tail -1
  EXPECT: Finished
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "Finished `dev` profile"
- [x] G14 server/ is gone and nothing references it
  CHECK: node -e "const fs=require('fs');const hit=['README.md','package.json',...fs.readdirSync('src').map(f=>'src/'+f),...fs.readdirSync('src/lib').map(f=>'src/lib/'+f)].filter(f=>fs.statSync(f).isFile()&&/server\//.test(fs.readFileSync(f,'utf8')));console.log(fs.existsSync('server')||hit.length?'FAIL '+hit:'NO_SERVER_REFS')"
  EXPECT: NO_SERVER_REFS
  EVIDENCE: zsh, ~/repos/eve, exit 0, "NO_SERVER_REFS" (after dropping the `server` npm script)
- [x] G15 Manual: Tauri app syncs notes + an image to the repo and a second client gets them
  EVIDENCE: installed Eve.app signed in via device flow, pushed 18 notes to happy-nut/eve-notes (commits "eve: init", "eve: 18 files"), sidebar shows "synced" after the cache fix (fetch cache:'no-store'; WebKit served GitHub's max-age=60 branch reply after our own push -> 422 loop). No image in the notes yet, so the asset path is covered by G11/G12 only. Earlier note — needs the user's token in the app (not typed by Claude). Verified instead in the browser dev build: Settings -> Sync, repo o/r + dummy token, Sync now -> "401 bad token" shown in dialog + sidebar. Assumption to confirm in the bundled app: crypto.subtle exists on tauri://localhost (WebKit treats scheme-handler origins as secure).
  ABANDON: G3 (server/test.mjs) — server/ removed; G11/G12 cover sync now.

# GATES — kanban block (2026-09-08)

- [x] G16 Board JSON <-> data round-trips (bodies with lists/headings/fences, broken JSON -> null, sloppy shapes tolerated, move ops)
  CHECK: node --experimental-strip-types --no-warnings src/lib/board.test.mjs
  EXPECT: BOARD_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "BOARD_OK" (also part of `npm test`, with SYNC_OK)
- [x] G17 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in"
- [x] G18 Manual, in-app browser: "/" -> Kanban inserts a board; arrows move between cards/headers; ⌥arrows move a card (up/down/left/right, animated) and a column (left/right); Enter on a card opens the floating page, edits show on the card, Esc closes; mouse drag moves a card between columns; Esc from the board selects the block; markdown of the note contains a ```kanban fence.
  EVIDENCE (round 2, JSON form + polish): in-app browser — a ```kanban JSON fence rendered as a board and a broken one stayed a `language-kanban` code block that round-trips; ↓ from the line above / ↑ from the line below entered the board (first header), ↑ on a header left to "above", Esc left to "below"; Backspace at the start of "below" opened "Delete the board and its 1 card?", Enter deleted it, undo restored it; Tab/⇧Tab in the confirm dialog cycled Cancel ↔ Delete only; Tab in the card page cycled title ↔ body; ←→ across five columns scrolled the board (scrollLeft 2 → 1002); the block no longer draws a selection outline (selectable: false). Installed to /Applications/Eve.app via `npm run bundle` + ditto.
  EVIDENCE (round 1): in-app browser at http://localhost:5173 — "/kan" + Enter inserted the board and focused the first header; ↓ → "+ New", Enter created a card and opened the floating page (title input focused), typed title + body, Esc closed it and the card showed the title with a dim body line; markdown became "```kanban\n## To do\n- Write the spec\n  Some **details** here…". With Alpha/Beta/Gamma | Delta: ↓ → Beta, → Delta, ← Alpha; ⌥→ moved Alpha into "In progress" at row 0 (crossfade fly-over seen mid-flight), ⌥↓ reordered it below Delta (flip); on a header ⌥← swapped the columns; ⌘Z inside the board undid it and focus stayed on the header; Esc gave the editor a NodeSelection on the block (ProseMirror-selectednode), Enter re-entered. Mouse DnD: the CDP mouse drag cannot start a native drag, so dragstart/dragover/drop were dispatched as DragEvents: dragover previewed Beta as a ghost in "Done", drop committed it (file updated), a drop of the same payload on an editor paragraph inserted nothing. Dark theme checked by screenshot.

# GATES — theme setting (2026-09-08)

- [x] G19 Type-checks and builds after the light-dark() palette
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in"
- [x] G20 Manual, in-app browser with the OS in dark: Settings -> Appearance -> Theme = Light paints the page light, Dark paints it dark, System follows the OS; the choice survives a reload.
  EVIDENCE: in-app browser at http://localhost:5173 with prefers-color-scheme emulated dark: #app background rgb(255,255,255) after Theme = Light, rgb(11,12,16) after Dark, rgb(11,12,16) after System; localStorage eve.appearance holds theme:"light" and the page came back light on reload; screenshot of the light UI under the dark OS.

# GATES — kanban × highlight + list numbering (2026-09-08)

- [x] G21 Type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in"
- [x] G22 Manual, in-app browser: two numbered lists that touch become one list (count carries on)
  EVIDENCE: list(5 items) + empty paragraph + list(2) -> Backspace on the empty paragraph -> one orderedList of 7, markers 1…7.
- [x] G23 Manual, in-app browser: keyboard → + → × → + → header: the +/× highlight follows the focused control and clears (class `on`, not :focus)
  EVIDENCE: × focused: on=true bg accent-soft opacity 1; ↑: × on=false bg transparent opacity 0, + on=true; ←: header focused, neither on. Not reproduced in Chromium (the stale highlight is WebKit-only; the dev app could not be driven — full-screen control was not approved), so the WebKit fix is unverified in the app.

# GATES — hide from Dock / ⌘Tab (2026-09-08)

- [x] G24 Rust + frontend compile
  CHECK: npm run check
  EXPECT: 0 ERRORS
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS"; `cargo check` after `cargo clean -p eve`: Finished (set_dock_hidden registered).
- [x] G25 Manual, in-app browser: Settings → Sync & app shows "Hide from Dock and ⌘Tab", on by default, and eve.dock is written on startup
  EVIDENCE: rows ["Launch at login…", "Hide from Dock and ⌘Tab like Raycast…"], switch checked=true (disabled outside Tauri), localStorage eve.dock = "hidden". The activation-policy switch itself (Accessory ↔ Regular) runs only in the app — not exercised here; confirm in the release build.

# GATES — card preview skips a leading divider (2026-09-08)

- [x] G26 Manual, in-app browser: a card whose body starts with a divider still shows its first text line on the card
  EVIDENCE: card body "---\n\nhello" (hr + paragraph in the card page) -> .kb-cbody "hello"; before the fix plain('---') === '' left the card without a preview.

# GATES — text selection: opaque highlight, no WebKit gap bars (2026-09-08)

- [x] G27 Type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in 129ms"
- [x] G28 A drag across blocks paints no full-width bars in WebKit, and code chips / wikilink pills stop
  showing through the highlight
  EVIDENCE: WKWebView (offscreen snapshot of the editor markup + src/app.css, selection set over heading →
  list → callout → task list, macOS WebKit). Gap strip between blocks and beside a shrink-wrapped block:
  rgb(26,63,83) = the old selection tint before, page background rgb(11,12,16) after. Code chip vs plain
  selected text on the same line: Δ12/255 before, Δ4 after; wikilink pill: Δ(11,36,48) before, Δ(3,11,14)
  after (that remainder is the snapshot's inactive-window selection alpha; a focused window paints opaque).
  Callout: the old --sel equalled accent-soft over the page, so a selection inside a callout was invisible —
  --sel is a step away from it now. Chromium (in-app browser at http://localhost:5173) unchanged: it paints
  no selection gaps at all.

# GATES — card page: title in the document, outline rail shared (2026-09-09)

- [x] G29 Type-checks, builds, and the card ↔ document split is covered
  CHECK: npm run check && npm test
  EXPECT: BOARD_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "BOARD_OK" / "SYNC_OK"; splitCard asserts cover
  a title-only card (body stays empty — the bug the browser caught), a deleted heading, marks and escapes.
- [x] G30 Manual, in-app browser: a drag that starts in the card title runs on into the body
  EVIDENCE: card "1517 이슈처리" opened, drag from the h1 down through the list into "원인" — one selection
  across title, list and heading (the old `<input>` title could not extend past itself).
- [x] G31 Manual, in-app browser: the board still gets the title, and the outline rail shows on a long card
  EVIDENCE: typing " 수정" in the title wrote {"title":"1517 이슈처리 수정"} into the kanban block; a title-only
  card saved {"title":"제목만 있는 카드 편집","body":""}; the long card shows the heading ticks at its left edge,
  the short one none. Card open/close transitions could not be watched in the preview (the pane's tab reports
  document.hidden, so Svelte's intro/outro never advance) — the close path was verified by state instead:
  Escape ran close(), ui.card became null.

# GATES — typing in an empty last task item (2026-09-09)

- [x] G32 Type-checks, builds, tests pass
  CHECK: npm run check && npm test
  EXPECT: BOARD_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "BOARD_OK" / "SYNC_OK"
- [x] G33 Typing into an empty last task item keeps the text in that item (WebKit)
  EVIDENCE: real WKWebView driven against the dev server (offscreen WKWebView, seeded note, caret in the item,
  `document.execCommand('insertText')`). Before: "AAA | abcplain paragraph here" — the item was gone and the
  text had moved into the block below; after: "AAA | Task item checkbox for abc | abc | plain paragraph here".
  Chromium never reproduced it (same script in the in-app browser kept the text in the item both times), which
  is why the browser preview looked fine.
  Cause: `user-select: none` on the task item's `<label>`. With no selectable content left in the item, WebKit
  resolved the insertion point to the next block. Narrowed by toggling one rule at a time in the live page:
  `display: block` on the item did not help, `-webkit-user-select: auto` on the label did.
  Cases covered after the fix: empty last item followed by a paragraph / bullet list / ordered list / nothing,
  empty item in the middle, single-item list, and callouts (1 and 2 paragraphs) — text stays put in all of them.
  Selection still paints only on text (WebKit snapshot of the same document unchanged: checkboxes not lit).
- [x] G34 An empty checkbox survives a save and reload
  CHECK: npm run check && npm test
  EXPECT: BOARD_OK
  EVIDENCE: in-app browser, note "- [ ] AAA / - [ ] / - [x] / - [x] DONE": all four items came back as task
  items with data-checked false/false/true/true and empty text (before the fix the empty ones parsed as
  bullets with the literal text "[ ]"), and re-serializing gave byte-identical markdown. Guards: a paragraph
  that is only "[ ]" stays a paragraph, "- 그냥 불릿" stays a bullet, "- [ ]" becomes an empty task item (GFM).
  WebKit re-check after the change: typing into an empty last task item still keeps the text in the item.
