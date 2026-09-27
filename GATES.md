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

# GATES — an image pasted onto an empty list item takes that line (2026-09-11)

- [x] G35 Type-checks, builds, tests pass
  CHECK: npm run check && npm test
  EXPECT: BOARD_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "BOARD_OK" / "SYNC_OK"
- [x] G36 A pasted image lands on the empty to-do line, not one line below it
  EVIDENCE: paste of an image file simulated on the editor (ClipboardEvent with a File), caret in an empty
  task item. Before: `<li><div><p><br></p><img></div></li>` — the empty line stayed above the picture, which
  is what the report showed. After: `<li><div><img></div></li>`. Same for an empty bullet item. Cause: list
  items are `paragraph block*` in stock TipTap, so an image could only go after the item's paragraph; they
  are `(paragraph|image) block*` here. Checked in Chromium (in-app browser) and in WebKit (offscreen
  WKWebView against the dev server), where typing into an empty last task item still behaves (G33).
- [x] G37 It survives a save and reload, tight or loose list, checked or not
  EVIDENCE: after the paste the note stored `- [ ] ![](…)` and came back with the image as the item's own
  block. A loose list (blank lines between items, which markdown-it wraps in <p>) came back the same way
  after the parse hook unwraps an item whose whole content is an image — with `- [x] ![](…)` the checkbox
  stayed checked (data-checked true) because the input is moved out of the paragraph before it is unwrapped.
  A "- [ ] plain" item still parses to a paragraph.

# GATES — paste a URL over selected text; images render on a cold start (2026-09-11)

- [x] G38 Type-checks, builds, tests pass
  CHECK: npm run check && npm test
  EXPECT: BOARD_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "BOARD_OK" / "SYNC_OK"
- [x] G39 A URL pasted over selected text links that text
  EVIDENCE: in-app browser, real ProseMirror selection (from 15 to 19, empty=false, depth 3 — inside a task
  item). Before: the whole task list was replaced by a bookmark card, because the Bookmark extension's
  markdown parse hook turns a bare-URL paragraph into a card and that hook also runs on the pasted slice.
  After: `<li …><p><a href="https://tossteam.gopay.co.kr/">메타페이</a></p></li>`, list intact. Still working:
  a URL pasted on an empty line becomes a bookmark card, and plain text over a selection just replaces it.
- [x] G40 Images render right after the app starts
  EVIDENCE: `assetUrl` maps `assets/x.png` through the notes directory, but nothing resolved that directory
  at startup — only Settings and saving an image did — so on a cold start every `<img>` kept its relative
  src and showed as a broken image (what the report showed; the file itself was on disk). `notes.load()`
  now awaits `storage.path()`, which also resolves `convertFileSrc` instead of racing a floating import.
  Checked in the app: the note that showed a broken picture renders it.

# GATES — spreadsheet and .hwp viewer (2026-09-24)

- [x] G60 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "COMPLETED 242 FILES 0 ERRORS 0 WARNINGS" / "✓ built in". The one error this
  batch started with (src/lib/video.ts:66) was on HEAD too and is fixed here: `Node` in that file is
  TipTap's, so the video player's `stopEvent` guard was false for every event and the editor was taking
  clicks meant for the player's own controls. `globalThis.Node` is the DOM one. The lone warning
  (Find.svelte:66) was the a11y lint misreading a container that only catches keys bubbling up from
  the fields inside it; it is marked svelte-ignore with that reason.
- [x] G61 Rust side compiles
  CHECK: cd src-tauri && cargo check 2>&1 | tail -1
  EXPECT: Finished
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "Finished `dev` profile ... in 3.29s"
- [x] G62 Quick Look exports an HTML preview for .xlsx — the file the floating viewer loads
  CHECK: node src/lib/ql.test.mjs
  EXPECT: QL_HTML_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "QL_HTML_OK". The test builds an .xlsx from scratch (zip written
  by hand), runs qlmanage, and asserts the preview is a <table> holding both cell values.
- [x] G63 A format Quick Look cannot preview fails fast instead of hanging the app
  CHECK: cd src-tauri && cargo test --lib 2>&1 | tail -4
  EXPECT: test result: ok
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "2 passed; 0 failed" — run_with_deadline kills a child
  that never exits and still returns a quick child's output. Measured premise: qlmanage on a .hwp with
  no Hancom Office installed ran >3 min without producing anything, which is what the deadline is for.
- [x] G64 rhwp renders a real .hwp, not just a toy one
  EVIDENCE: manual, @rhwp/core 0.8.6 in node against the 전자소송 채권신고서 sample in ~/Downloads:
  renderPageSvg(0) returned 151,228 bytes, 297 <text> and 23 <rect> nodes; rasterised through qlmanage
  the page shows the form's merged table cells, Korean labels and ₩ signs laid out correctly.
- [x] G65 The wasm is a lazy chunk, not part of the startup bundle
  CHECK: grep -c "rhwp_bg-.*\.wasm" dist/assets/rhwp-*.js
  EXPECT: 1
  EVIDENCE: zsh, ~/repos/eve, exit 0 — the reference sits in its own chunk (rhwp-DJ2wR6ju.js), and the
  installed app grew 5.4 MB → 8.4 MB (the 9.9 MB wasm compresses inside the bundle).
- [x] G66 Both file types become cards in a real note, with the right label and thumbnail
  EVIDENCE: manual, screenshot of Eve 0.6.5+ with a note holding both: the .xlsx card carries a Quick
  Look thumbnail of the sheet and reads "XLSX · click to open", the .hwp card falls back to the page
  glyph and reads "HWP · click to open".
- [x] G67 Clicking a card opens the floating panel with the document rendered in it
  EVIDENCE: manual, by the user, on the installed build: both cards in the test note open and render —
  the .hwp first ("한글은 확인했었는데"), the .xlsx once the note was undeleted ("엑셀도 잘 뜨네").
  This was the one gate the screen lock kept me from pressing myself.

# GATES — the [[ picker opens a page into its sections (2026-09-24)

- [x] G70 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "COMPLETED 243 FILES 0 ERRORS 0 WARNINGS" / "✓ built in 675ms"
- [x] G71 The row model survives rows appearing and vanishing under the cursor
  CHECK: node --experimental-strip-types --no-warnings src/lib/suggest.test.mjs
  EXPECT: SUGGEST_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "SUGGEST_OK" — covers the cursor holding its page on open, ←
  from a section landing on that page, and ← from a page below two open ones still finding it.
- [x] G72 Existing suggestion behaviour is untouched (flat list, typed `#`, slash menu)
  CHECK: npm test
  EXPECT: MARKDOWN_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0 — BOARD_OK SYNC_OK PATHS_OK MARKDOWN_OK QL_HTML_OK SUGGEST_OK
- [x] G73 → opens the highlighted page into its sections, ↓ walks in, ↩ writes `[[Title#Section]]`
  EVIDENCE: manual, `npm run dev` in the in-app browser against four seeded notes. `[[` listed the
  pages with a twisty; → opened Lock to exactly its two headings (2PL, 데드락 — its own title is not
  one of them) and rotated the twisty; ↓ then ↩ left the note holding "[[Lock#2PL]] ", read back out
  of localStorage; ← folded Lock away again and put the cursor back on it (list read from the DOM:
  three pages, no child rows). A `#` typed into the query still reaches the flat section list.

# GATES — @ mentions a date (2026-09-24)

- [x] G80 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "COMPLETED 244 FILES 0 ERRORS 0 WARNINGS" / "✓ built in 668ms"
- [x] G81 A stored date reads as the day it is, and the reading changes when the day does
  CHECK: node --experimental-strip-types --no-warnings src/lib/date.test.mjs
  EXPECT: DATE_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "DATE_OK" — one stored day (2026-09-24) read against four
  different "now"s gives today / yesterday / tomorrow / 2026.09.24, in en and in ko; the local-day
  conversion is checked at 23:30, where a UTC answer would be a day out.
- [x] G82 Every suite still passes, including the markdown rule
  CHECK: npm test 2>&1 | grep -c "_OK"
  EXPECT: 7
  EVIDENCE: zsh, ~/repos/eve, exit 0, "7" — BOARD SYNC PATHS MARKDOWN QL SUGGEST DATE. The markdown
  rule is driven by a real markdown-it: `@2026-09-24` becomes a chip mid-sentence, on its own line and
  in brackets; `compensation@toss.im`, `2026@2026-09-24`, `@2026-13-01` and `@2026-09-240` do not.
- [x] G83 Typing @ offers the days, picking one writes `@YYYY-MM-DD`, and the chip reads relatively
  EVIDENCE: manual, `npm run dev` in the in-app browser (navigator.language "ko"). `@` listed 오늘 /
  어제 / 내일 with 2026-09-24 / -23 / -25 beside them; ↩ on 오늘 left the file holding
  "마감 @2026-09-24 까지" (read out of localStorage) and the editor holding
  `<span class="datechip" data-date="2026-09-24" title="2026-09-24">오늘</span>`. A note written with
  four different days and reloaded cold rendered 어제 / 오늘 / 내일 / 2026.09.20, with
  compensation@toss.im left as an address.

# GATES — @ opens a calendar (2026-09-24)

- [x] G90 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "COMPLETED 245 FILES 0 ERRORS 0 WARNINGS" / "✓ built in 1.08s"
- [x] G91 The grid is a real month: six stable weeks, Sunday first, month steps that do not overflow
  CHECK: node --experimental-strip-types --no-warnings src/lib/date.test.mjs
  EXPECT: DATE_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "DATE_OK" — the grid's 42 days run consecutively with no gap or
  repeat and start on a Sunday; 31 March back one month is 28 February (29 in a leap year), not 3 March.
- [x] G92 Nothing else regressed
  CHECK: npm test 2>&1 | grep -c "_OK"
  EXPECT: 7
  EVIDENCE: zsh, ~/repos/eve, exit 0, "7"
- [x] G93 @ opens the calendar on today; arrows walk it, ↩ writes that day, and typing still jumps
  EVIDENCE: manual, `npm run dev` in the in-app browser, console watched throughout (no errors).
  Typing "마감 @" opened the month on 2026년 9월 with 24 highlighted and "오늘" under it; → moved to 25
  ("내일"); ↓ moved a week on, which carried the calendar to 2026년 10월 with 2 highlighted
  ("2026.10.02"); ↩ left the note holding "마감 @2026-10-02" and the chip reading 2026.10.02, and the
  calendar closed. A query that names no day (`@sarah`) closes it instead.

# GATES — Android build that syncs (2026-09-26)

- [x] G94 Frontend type-checks and builds
  CHECK: npm run check && npm run build
  EXPECT: built in
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in 658ms"
- [x] G95 Nothing else regressed
  CHECK: npm test 2>&1 | grep -c "_OK"
  EXPECT: 7
  EVIDENCE: zsh, ~/repos/eve, exit 0, "7"
- [x] G96 Desktop still compiles without curl/open for sign-in, with the hotkey plugins desktop-only
  CHECK: cd src-tauri && cargo check 2>&1 | tail -1
  EXPECT: Finished
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "Finished `dev` profile"; cargo test 2 passed
- [x] G97 Android APK builds (aarch64)
  CHECK: npm run tauri -- android build --apk --target aarch64 --debug 2>&1 | tail -3
  EXPECT: \.apk
  EVIDENCE: zsh, ~/repos/eve, exit 0, "Finished 1 APK at: …/app-universal-debug.apk"
- [x] G98 On an Android emulator: app launches, device-flow code appears and GitHub opens, a note made on
  the phone lands in eve-notes and a note from the repo shows up on the phone
  PARTIAL: Pixel 7 emulator, Android 15 (API 35). Launched clear of the status bar; the list fills the
  screen and tapping a note opens it; typing "Hello from Android" wrote notes/<id>.md in the app's data
  dir (read back with run-as). Sign in with GitHub showed device code 337F-3D4A and opened Chrome on
  github.com/login/device, so ureq's POST and the opener plugin both work. Authorizing needs the owner's
  GitHub account, so the round trip through eve-notes is still open. Closed by G102.

# GATES — home-screen widget, back button, sync that holds on Android (2026-09-26)

- [x] G99 Pulled pictures and files can be written on Android (its IPC sends bytes as a JSON array)
  EVIDENCE: manual, emulator via the WebView devtools socket: before the fix `write_asset` threw
  "expected raw bytes" — one picture in eve-notes would have failed every sync round on the phone.
  raw_body now takes both shapes; the same page also reported isSecureContext true, crypto.subtle
  present, and a 200 from api.github.com (CORS open), which the sync engine needs.
- [x] G100 The widget lists the newest notes, + writes a new one, a row opens that note, and it redraws
  on the way back home
  EVIDENCE: manual, Pixel 7 emulator, Android 15. Added from the launcher's widget sheet ("Eve notes",
  4×3). + opened a new note with the caret in it and the keyboard up (mInputShown=true); typed
  "Groceries / milk and eggs", back, back, and the widget listed "Groceries — milk and eggs". Tapping
  that row opened it with the keyboard up; appending " and bread" and pressing Home left the widget
  reading "milk and eggs and bread". (First version used a RemoteViewsService; the launcher dropped
  notifyAppWidgetViewDataChanged while Eve was in front, so the widget now hands the system the whole
  list — RemoteCollectionItems — which it keeps until the home screen is back.)
- [x] G101 Android back: a note goes back to the list, the list leaves the app
  EVIDENCE: manual, emulator: in a note, BACK (after the keyboard's own) showed the list; BACK again
  left for the launcher (topResumedActivity = NexusLauncherActivity).
- [x] G102 Real round trip through the owner's eve-notes: a note from the Mac appears on the phone (and in
  the widget), a note written on the phone appears on the Mac
  EVIDENCE: manual, emulator signed in as happy-nut (device flow, owner entered the code). First sync
  pulled all of happy-nut/eve-notes: 45 notes + 17 assets on the phone, `known` = 63 = the repo's blob
  count. Widget + → "Eve Android sync test / written on the phone" → Home: commit "eve: 1 file" landed
  with notes/mui489734mlk09.md holding that text. That one file edited through the contents API
  ("and edited from the Mac side"); opening Eve from the widget pulled it and the widget read it, "just
  now". First sync took ~1–2 min (assets cross Android's IPC as JSON number arrays); later ones are
  incremental.

# GATES — background pull, pinned-note widget, markdown in the widget (2026-09-26)

- [x] G103 Frontend type-checks, builds, and nothing regressed; desktop Rust compiles
  CHECK: npm run check && npm run build && npm test 2>&1 | grep -c "_OK"
  EXPECT: ^7$
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS 0 WARNINGS" / "✓ built in" / "7"; cargo check "Finished"
- [x] G104 The background pull is scheduled by the app itself, and brings a remote edit down while Eve is
  not running
  EVIDENCE: manual, emulator. Job cancelled + app force-stopped → cold start → `cmd jobscheduler
  get-job-state dev.happynut.eve 1` = "waiting" (first try failed: a connectivity-constrained job needs
  ACCESS_NETWORK_STATE, and the page could run before the activity injected window.EveAndroid — the
  bridge is now looked up per call). Then Home, `am kill` (pidof empty), the test note edited through the
  contents API, `cmd jobscheduler run -f … 1`: notes/mui489734mlk09.md on the phone held the new text and
  the widget showed it, with no Eve process started by hand.
- [x] G105 The widget renders markdown and uses smaller type
  EVIDENCE: manual, widget screenshot: `- [x]` as ☑ struck through and dimmed, `- [ ]` as a blue ☐,
  **bold** bold, `code` monospace on a grey chip, ~~strike~~ struck, [[links]] in the accent blue, a
  `> [!💡]` callout as its emoji, a ```kanban fence as "📋 To do 2 · Done 1". Card title 13sp, preview
  12sp, time 11sp (were 15/13/12); in the list's previews a heading is bold, not bigger.
- [x] G106 A widget can be pinned to one note, chosen when added and changed from a long-press
  EVIDENCE: manual, emulator: long-press → the launcher's pencil ("Tap to change widget settings") opened
  "Show in this widget" with Newest notes checked and every note below; picking "Eve Android sync test"
  turned the widget into that note — its icon and title in the header, the body line by line under it.
  Tapping a line with Eve killed opened that note with the keyboard up (cold start). The ↻ button
  scheduled the one-off pull (job 2: active, then gone).

# GATES — one QR from the Mac: install to signed in; signed release APK (2026-09-26)

- [x] G107 Device flow split so a phone can finish a sign-in the Mac started; QR link and app link agree
  CHECK: node --experimental-strip-types --no-warnings src/lib/github.test.mjs
  EXPECT: SYNC_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "SYNC_OK" — pollToken rejects expired_token instead of hanging,
  phoneLink → parseConnect round-trips the codes, `../../x` and a non-eve:// URL are refused.
- [x] G108 The QR the Mac draws decodes to the phone-setup link
  EVIDENCE: jsQR 1.4.0 on uqr's matrix for a phoneLink(...) → "QR_OK" (decoded string === link). The
  panel itself seen in `npm run dev` (Settings → Sync & app → Android phone): QR, the user code, two steps.
- [x] G109 Signed release APK
  EVIDENCE: `tauri android build --apk --target aarch64` → app-universal-release.apk, 13.3 MB;
  apksigner: "Signer #1 certificate DN: CN=Eve, O=happynut", SHA-256 a8f3b476…e0be7d2; versionCode 6006.
  Key: ~/.eve-android/eve-release.jks (PKCS12, RSA 4096), password in the login Keychain
  (service eve-android-keystore); gradle reads src-tauri/gen/android/keystore.properties (gitignored).
- [x] G110 The setup page opens the installed app with the code, and the app waits for the Mac
  EVIDENCE: manual, emulator with the release APK freshly installed (no data): docs/ served locally, the
  page showed both steps and the code 4449-8E26; "Open Eve and connect" → intent:// → Eve came to the
  front on Settings → Sync showing "Waiting for your Mac…" and 4449-8E26 (read with uiautomator). This is
  the minified build, so the ProGuard keep rule for window.EveAndroid holds.
- [x] G111 Authorizing that code on the Mac signs the phone in and syncs, with no typing on the phone
  EVIDENCE: manual, emulator (release APK): the owner authorized 4449-8E26 on github.com; the app, still on
  the waiting screen, turned to @happy-nut / "Syncing…" and then "Synced at 08:28 PM" (uiautomator).
- [ ] G112 A tagged release carries Eve-android.apk, and the published page serves at
  https://happy-nut.github.io/eve/android/
  PARTIAL: Pages on (main /docs), the page answers 200 with the APK link. v0.7.0 tag pushed before the
  owner asked to test first: the macOS job published, the Android job failed (`${{ env.ANDROID_NDK_LATEST_HOME }}`
  is empty — runner variables are not in the env context; fixed locally, not pushed). The release was
  turned back into a draft (latest = v0.6.6 again). Local Eve.app replaced with the 0.7.0 build for the
  owner's test; 0.6.6 kept at ~/.eve-android/backup/Eve-0.6.6.app.

# GATES — one QR, scanned twice, no page in between (2026-09-26)

- [x] G113 Without Eve, the QR link goes straight to the APK download
  EVIDENCE: manual, emulator with Eve uninstalled: the link opened Chrome, which followed the intent's
  browser_fallback_url to .../releases/download/v0.7.0/Eve-android.apk ("Download Eve-android.apk
  anyway?" — Chrome's own warning for any APK). v0.7.0 is a prerelease carrying the signed APK
  (latest stays v0.6.6, so Homebrew is unchanged); the page picks the newest published release with it.
- [x] G114 With Eve installed, the same link opens Eve waiting on the Mac's code
  EVIDENCE: manual, emulator: after installing the signed APK, the same link (local, then the published
  https://happy-nut.github.io/eve/android/#c=…) brought Eve to the front showing "Waiting for your Mac…"
  and 6A1B-DFEF; no Shortcuts tab on the phone. Mac app rebuilt and reinstalled with the new QR text.

# GATES — phone setup without GitHub: the Mac hands its sign-in over the LAN (2026-09-26)

- [x] G115 Sealed hand-off: only the QR's key opens it, tampering is refused, links point only at a LAN
  CHECK: node --experimental-strip-types --no-warnings src/lib/handoff.test.mjs
  EXPECT: HANDOFF_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "HANDOFF_OK"; npm test now 8 × _OK.
- [x] G116 The Mac's server answers the right path once, 404s others, and is gone after
  CHECK: cd src-tauri && cargo test serve_once 2>&1 | tail -3
  EXPECT: 1 passed
  EVIDENCE: zsh, ~/repos/eve/src-tauri, exit 0, "test tests::serve_once_answers_the_right_path_once ... ok"
- [x] G117 Scanning signs the phone in with no GitHub step
  EVIDENCE: manual, emulator (release APK, signed out): a stand-in for share_start sealed a TEST account
  (fake token) and served it on the Mac's LAN address 172.30.1.15; the ticket link, opened like a QR
  scan, brought Eve up, which fetched it ("SERVED to 172.30.1.15"), opened it and showed @handoff-test /
  happy-nut/eve-sync-test, then "401 bad token" — the fake token, as expected. The real Mac button was
  not clicked through (the screen-control approval timed out); the owner tests that.

# GATES — phone sign-in: see the code first, survive a network blip (2026-09-26)

- [x] G118 A failed poll is retried; only GitHub's answer or expiry ends the sign-in
  CHECK: node --experimental-strip-types --no-warnings src/lib/github.test.mjs
  EXPECT: SYNC_OK
  EVIDENCE: zsh, ~/repos/eve, exit 0, "SYNC_OK" — two "io: failed to lookup address information"
  throws then a token → the token; a post that always throws → "expired" after expiresIn. (The owner's
  phone showed that DNS error: Android can cut a background app off the network while the user is in
  the browser authorizing, and the first failed poll used to end the whole sign-in.)
- [x] G119 On the phone, Sign in shows and copies the code before any browser opens
  EVIDENCE: manual, emulator (release APK): after "Sign in with GitHub" Eve stayed in front
  (topResumed = dev.happynut.eve), the system clipboard chip read CD15-79B7, the text says to
  long-press the first box → Paste on GitHub, and "Copy code & open GitHub" is the primary button.

# GATES — the widget lands as the newest notes; pinning is a choice made later (2026-09-26)

- [x] G120 Adding the widget asks nothing (Android 12+), and the picker applies only on OK
  EVIDENCE: manual, emulator (Android 15, release APK): Widgets → Eve → Add put the widget straight on
  the home screen in newest-notes mode, no picker. Long-press → the pencil opened "Show in this widget"
  with Newest notes checked and CANCEL / OK buttons (a tap on a row now only selects). Before Android 12
  there is no configure step at all (xml/ vs xml-v31/), since nothing could reopen it there.

# GATES — a phone layout, not a shrunken desktop (2026-09-27)

- [x] G121 The real Mac's Show QR signs a phone in end to end, and pinning applies only on OK
  EVIDENCE: manual. Mac Eve (0.7.0 build) → Show QR (no browser opened); the QR, captured with
  screencapture and decoded (jsQR), opened on the emulator like a scan: Eve came up signed in as
  @happy-nut, "Synced at 07:41 AM", and the Mac turned to "✓ The phone is signed in." The widget then
  filled with the notes; long-press → pencil → tapping "Personal TODO" only selected it, OK pinned it.
- [x] G122 Phone layout: list, note, bar, settings, menu
  EVIDENCE: manual, emulator (release APK): the list has a large "Eve" title, "Search" (no Ctrl+K),
  44px rows, a + button; a note opens under a solid "‹ Notes  +" bar with no keyboard
  (mInputShown=false) and no outline ticks; tapping the text brings the keyboard with the formatting bar
  on top of it and the page no longer scrolls up under the status bar (MainActivity shrinks the content by
  the IME inset); settings fill the screen; the long-press menu has finger-sized rows. The bar's buttons
  checked in `npm run dev` (Android UA, 375 wide): To-do made a task list, Indent nested it (2 lists),
  Outdent undid it (1), and the caret stayed in the note throughout.
- [x] G123 Nothing else regressed
  CHECK: npm run check && npm test 2>&1 | grep -c "_OK"
  EXPECT: ^8$
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS" / "8"; cargo check "Finished".

# GATES — phone polish: swipes, own controls, export, pin to home, sheets (2026-09-27)

- [x] G124 Swipe right on a note opens the list; swipe left on the list closes it
  EVIDENCE: manual, emulator (release APK): `input swipe 250→850` on Kafka showed the list; `850→150` on
  the list slid it away back to Kafka.
- [x] G125 No platform controls in Settings: Select (popover / bottom sheet) and Slider
  EVIDENCE: manual. Phone: the Theme select opened a sheet (System ✓ / Light / Dark); Dark applied at
  once, System restored it. Desktop (`npm run dev`, 1104×832): the popover lands under the button
  (portalled to <body>: the transformed settings panel had swallowed it), Dark → data-theme="dark",
  System → "system".
- [x] G126 Phone export: Markdown, PDF, image, through the share sheet
  EVIDENCE: manual, emulator: Export → PDF → the chooser offered "Kafka.pdf"; its print preview showed the
  whole note over 2 pages. Export → Image → the chooser; the preview showed page one with icon and title
  and no phone bar (the bar and phone-only margins are now screen-only).
- [x] G127 Pin to home screen from a note
  EVIDENCE: manual, emulator: the pin button raised the launcher's "Add to home screen"; adding it put a
  widget on the home screen pinned to Kafka (the placed-callback stored the new widget id).
- [x] G128 Dialogs as sheets, bigger type, no shortcut hints, settings/sync up top, new gear
  EVIDENCE: manual, emulator: delete asks in a bottom sheet (Delete / Cancel, full width; cancelled);
  the long-press and export menus are sheets; list header reads "Eve · synced · ⚙" with no footer;
  body text 17px, settings rows 16px; no kbd/shortcut chips anywhere. The widget's picker has Eve's own
  check mark, row highlight and rounded Cancel / OK. Desktop footer shows the new gear.
- [x] G129 Nothing else regressed
  CHECK: npm run check && npm test 2>&1 | grep -c "_OK"
  EXPECT: ^8$
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS" / "8"; cargo check "Finished".

# GATES — group icons sync, touch reorder, tighter list, compact widget (2026-09-27)

- [x] G130 Group icons and order reach the phone
  EVIDENCE: the rebuilt Mac app pushed notes/groups.json to happy-nut/eve-notes (5 icons — Turtle 🐢,
  개발 💻, 금융경제학 💸, Zoobox 🦄, 진리 — and the group order); the phone, opened after, drew every group
  with its icon in that order. (Group icons used to live only in each device's localStorage.) A device
  that never set an icon dates its copy 0, so it can't overwrite the Mac's.
- [x] G131 Long-press lifts a row and moving it reorders; a lift without moving opens the row's menu
  EVIDENCE: manual, emulator (motionevent DOWN, 0.7 s, MOVE…, UP): Lock lifted with a shadow, a blue line
  showed the slot above OLAP, and on release Lock sat above OLAP; OLAP dragged back restored the order.
- [x] G132 Widget: + floats at the bottom right; cards tighter (3dp apart, 2 preview lines)
  EVIDENCE: manual, emulator: pinned Kafka and newest-notes modes both show the + at the bottom right;
  the list mode fits ~4.5 cards in the 4×3 widget. Widget set back to Kafka afterwards.

# GATES — image selection, one link menu, shortcut tips from what you did (2026-09-27)

- [x] G133 A selection across a picture and its caption is one clean block
  EVIDENCE: manual, `npm run dev` (1104×832): a real mouse drag from "Before" to "After" over an image
  with a caption: the figure is marked in-sel (one rounded --sel block), the caption has no background of
  its own and joins no text selection (user-select: none until it is being edited); no patchy blue.
- [x] G134 Hover, ⌥↩ and right-click on a link show the same menu; plain text keeps Export
  EVIDENCE: hover on a link → Open link / Remove link / Copy link; ⌥↩ with the caret on a mailto link →
  Send mail / Remove link / Copy link; ⌥↩ on plain text → Cut … Export as Markdown / PDF / image.
- [x] G135 Shortcut tips from actions
  EVIDENCE: picking Bold from the ⌥↩ menu with the mouse → toast "Bold has a shortcut ⌘B"; cutting a line
  and pasting the same text elsewhere → "Move lines without cut and paste ⌥↑ / ⌥↓". Also wired: toolbar
  buttons with a shortcut (sidebar, back, forward, pin, new, settings), menu items with keys, "/" Callout /
  Image / Link to note, clicking the next / previous note, deleting the open note with ×, dragging in the
  list, clicking Search. Each tip at most 3 times, 25 s apart; off on a phone; Settings → Shortcuts → Tips.
- [x] G136 Nothing else regressed
  CHECK: npm run check && npm test 2>&1 | grep -c "_OK"
  EXPECT: ^8$
  EVIDENCE: zsh, ~/repos/eve, exit 0, "0 ERRORS" / "8"; cargo check "Finished".

# GATES — v0.7.1 released; one-tap phone updates; a widget that is only notes (2026-09-27)

- [x] G137 v0.7.1 is the latest release, with the Mac zip and the signed APK
  CHECK: gh release view v0.7.1 -R happy-nut/eve --json assets --jq '[.assets[].name]|sort|join(",")'
  EXPECT: Eve-android.apk,Eve-macos-arm64.zip
  EVIDENCE: release run 36294223239: build=success, android=success (the NDK fix held); latest = v0.7.1;
  the CI APK's signer is a8f3b476…e0be7d2, the same key — it installed over a local build keeping notes,
  groups and sign-in.
- [x] G138 A newer release is offered in the phone's list, and Update starts the install
  CHECK: node --experimental-strip-types --no-warnings src/lib/update.test.mjs
  EXPECT: UPDATE_OK
  EVIDENCE: "UPDATE_OK" (version order, newest APK wins, drafts and foreign hosts refused). Manual: a build
  labelled 0.7.0 showed "Eve 0.7.1 · A new version is ready · Update"; Update opened Android's "Install
  unknown apps" page for Eve (first time). That toggle is a device security setting, so it was not
  flipped here; the download → installer step waits for the owner's phone.
- [x] G139 The widget has no title bar; a pinned note starts with its icon and title; empty lines skipped
  EVIDENCE: manual, emulator: the pinned widget shows "🧬 Personal TODO" then the to-dos directly, + at the
  bottom right, no header. Notes store an empty line as U+00A0 (seen in happy-nut/eve-notes); those lines
  no longer render in the widget.

# GATES — the phone versions and releases on its own (2026-09-27)

- [x] G140 The phone build takes its version from tauri.android.conf.json, the Mac keeps tauri.conf.json
  EVIDENCE: `tauri android build` → aapt2: versionCode='7002' versionName='0.7.2' while tauri.conf.json
  stays "0.7.1".
- [x] G141 Separate release tags; the updater reads android-v tags
  CHECK: node --experimental-strip-types --no-warnings src/lib/update.test.mjs
  EXPECT: UPDATE_OK
  EVIDENCE: "UPDATE_OK" incl. android-v0.7.2 > 0.7.1 and an android-v release found. release.yml: `v*` runs
  only the Mac job (release = Latest), `android-v*` only the Android job (its own release, --latest=false).

# GATES — android-v0.7.2 released on its own (2026-09-27)

- [x] G142 The android-v tag builds only the APK into its own, non-Latest release
  CHECK: gh api repos/happy-nut/eve/releases/latest --jq .tag_name
  EXPECT: ^v0\.7\.1$
  EVIDENCE: run 36298111314: android=success, build=skipped. Release "Eve for Android 0.7.2" holds only
  Eve-android.apk (signer a8f3b476…e0be7d2, versionCode 7002, versionName 0.7.2); Latest stays v0.7.1.
- [x] G143 Updates are found by version, not by list order
  EVIDENCE: the API lists the Latest (Mac) release first, and the first-APK rule picked v0.7.1. findUpdate
  and the setup page now take the highest version (test added; against the live API: 0.7.1 → 0.7.2).
  v0.7.1's copy of the APK was detached (Mac zip kept; the file is kept locally) so the 0.7.2 already
  released, which still reads the first APK, lands on android-v0.7.2 and its successors.

# GATES — lighter start, lighter APK, cheaper sync (2026-09-27)

- [x] G144 The app's start script no longer carries the code grammars, Settings, emoji picker, card page or PDF viewer
  CHECK: npm run build
  EXPECT: grammars-.*\.js
  EVIDENCE: index-*.js 1,060 KB → 785 KB (gzip 357 → 260). Browser preview: a code block highlights after a
  reload with no edit (1 .hljs-keyword); Settings and the emoji picker open from their own chunks; on the
  emulator Settings opens.
- [x] G145 A phone build leaves the Hangul reader out
  CHECK: TAURI_ENV_PLATFORM=android npm run build && ls dist/assets
  EVIDENCE: no .wasm in the android build, rhwp_bg-*.wasm (9.9 MB) still in the desktop build. Release APK
  13,383,572 → 10,361,156 bytes; installed on the emulator, it starts, lists notes and syncs.
- [x] G146 A sync round hashes only the notes whose text changed since the last round
  CHECK: npm test
  EXPECT: SYNC_OK
  EVIDENCE: FileHashes test (same text reuses the sha, changed text re-hashes, per path); emulator synced
  against the real repo afterwards.

# GATES — the same app in smaller pieces (2026-09-27)

- [x] G147 lib.rs is split by concern (files / mac / net / window), with no warnings on either target
  CHECK: cd src-tauri && cargo build 2>&1 && cargo test 2>&1
  EXPECT: test result: ok\. 3 passed
  EVIDENCE: lib.rs 844 → 141 lines (run + pending files + tests); the Android release build compiles with
  no warnings, installs, opens a note.
- [x] G148 editor.ts keeps the editor; the typed popups and the note's own menus live beside it
  CHECK: npm run check
  EXPECT: 0 ERRORS 0 WARNINGS
  EVIDENCE: editor.ts 782 → 567 (+ slash.ts 141, noteMenu.ts 91). Browser: "/" lists the blocks, "@" opens
  the calendar, right-click shows Paste / Select all / Export. (Esc, then Backspace, leaves the "@"
  calendar up: the same on main, so not from this change.)
- [x] G149 Sidebar moves notes and groups through lib/moves.ts
  EVIDENCE: Sidebar.svelte 802 → 722. Browser: row menu "Move down" and ⌥↑ reorder, focus stays on the row.

# GATES — Hangul after ⌘Tab; v0.7.2 (Mac) (2026-09-27)

- [x] G150 Coming back to the window does not split the first Hangul syllable, and leaves no IME underline
  EVIDENCE: manual, on the user's Mac with the 2-set Korean input (the automated IME harness could not
  send keys through the input method: no Accessibility grant). Before: "ㅈㅣ정가". After the blur-on-leave
  fix: whole syllables, but a stale marked-text underline under the syllable left mid-composition; after
  redrawing the caret's line on return: none. Browser: caret position and further typing survive the
  window blur/focus round trip, and the line's text node is rebuilt.
- [x] G151 android-v0.7.3 ships the lighter APK (lazy chunks, no Hangul reader, cached sync hashes) as its own release
  CHECK: gh release view android-v0.7.3 --json assets --jq '.assets[].name'
  EXPECT: Eve-android\.apk
  EVIDENCE: run 36307128337: android=success; release android-v0.7.3 holds Eve-android.apk, Latest stays v0.7.2.
- [x] G152 Swiping the phone's list away slides it out in one motion (no snap back, no sudden vanish)
  EVIDENCE: the hand-set closing transform was wiped by the style binding's next update (pull = 0 →
  style undefined), so the drawer sprang back and was then removed without animation. Now the closing
  state is part of the binding. Browser: after touchend the style stays translateX(-100%) until removal;
  a short pull springs back; reopening starts clean. Emulator screen recording: follows the finger, then
  slides out monotonically, then the note.
- [x] G153 The pin button uses the widget already on the home screen; the back button is an icon
  EVIDENCE: emulator with one Eve widget: pin → toast "Widget now shows this note", no system dialog, the
  widget shows the note; pin again → "Widget shows the newest notes again", the list is back. With no
  widget, the launcher is asked to add one, as before. The note header's back is a chevron only.
- [x] G154 The phone's list and settings read like Notion: one white page, grey captions, hairlines, no boxes
  EVIDENCE: emulator screenshots (list, Sync & app, Appearance): white list with no counts or scrollbar,
  dark round compose button; settings with underlined tabs, grey sentence-case captions, rows on hairlines,
  outline buttons, plain selects, no grey band over the status bar. Every rule is under html.mobile, so the
  Mac is untouched.
- [x] G155 The note screen and the widget match; the phone's list rows are tighter
  EVIDENCE: emulator screenshots: list rows ~32px (were ~38 + padding); note bar flat with grey icons,
  44px page icon, smaller headings; widget rows on white with inset hairlines (no grey cards), medium
  titles, a dark round + button. All app CSS under html.mobile; the widget is Android-only.
- [x] G156 android-v0.7.4 ships the swipe fix, pin-to-existing-widget, the icon back button and the Notion-style phone UI
  CHECK: gh release view android-v0.7.4 --json assets --jq '.assets[].name'
  EXPECT: Eve-android\.apk
  EVIDENCE: run 36309168835: android=success; android-v0.7.4 holds Eve-android.apk; Latest stays v0.7.2.
- [x] G157 A pinned note sits at the top of the widget's list; the pin button shows and toggles it
  EVIDENCE: emulator: pin on DB → toast, the bar's pin filled, the widget lists DB first with "📌" before
  its time and the rest in date order; pin again → unpinned (outline icon); pin again → back on top, the
  note stays open. With no widget, the launcher is asked for a list widget. Pins live on the phone.

# GATES — leaner start, one highlighter, one set of phone rules (2026-09-27)

- [x] G158 highlight.js and lowlight are out of the start bundle (one copy, loaded with the first code block)
  CHECK: npm run build
  EXPECT: grammars-.*\.js
  EVIDENCE: index-*.js 785.8 → 740.9 KB (gzip 260.0 → 249.5); the source map lists no highlight.js or
  lowlight in the main chunk (there were two highlight.js cores, 11.12.0 via the tiptap extension and
  11.11.2 via lowlight). The extension is replaced by the plain code block + a 40-line decoration plugin.
  Browser: after a reload a block highlights with no edit; typing re-highlights; switching the language
  to python re-colours it.
- [x] G159 The phone's CSS has one rule per selector, with no visible change
  EVIDENCE: 24 repeated html.mobile selectors merged into their last occurrence (122 → 94 rules). Computed
  styles of every element (41 properties) on list / note / settings×2 at 375×812: 0 differences out of 469
  elements; the same comparison flags a deliberate 20px change (positive control). Emulator screenshots
  before/after, pixel diff: list, note, appearance identical; sync differs only in the "Synced at" time.
  Print CSS named .table-tools, the toolbar is .tbl-tools: fixed.
- [x] G160 v0.7.3 (Mac, Latest) and android-v0.7.5 (APK) are released
  CHECK: gh api repos/happy-nut/eve/releases/latest --jq .tag_name
  EXPECT: ^v0\.7\.3$
  EVIDENCE: runs 36315218854 (build=success) and 36315219350 (android=success); v0.7.3 holds
  Eve-macos-arm64.zip and is Latest; android-v0.7.5 holds Eve-android.apk.
- [x] G161 The Mac shows the newest phone version and a QR that installs or updates Eve even over an older one
  EVIDENCE: with Eve installed the setup page opens the app (sign-in only), so a phone on 0.7.1 never
  updated from the QR. Now: Settings → Android phone shows "newest phone app 0.7.5"; the QR has a
  Sign in | Install or update 0.7.5 switch; the install QR is the setup page with #install, which goes
  straight to the newest APK. Emulator Chrome with Eve installed, #install: download of the 9.88 MB APK
  starts, the app is not opened. Mac screenshot of both QR tabs.
- [x] G162 One QR again: it installs, or opens and signs in; an installed Eve offers its own update
  EVIDENCE: the split (Sign in | Install or update) was inconvenient. The Mac keeps one sign-in QR and
  shows the newest phone version; its steps say an installed Eve (0.7.2+) offers that version at the top
  of the list when the scan opens it. The setup page still honours #install for a one-off link to move a
  phone older than the updater (≤ 0.7.1).
- [x] G163 The phone's newest version sits in the middle of the Mac's QR, and the code still scans
  EVIDENCE: a white "Eve 0.7.5" badge over the centre, the code rendered at ecc H (184px box). Decoded
  with OpenCV: a same-length hand-off link with the badge-sized patch over the centre reads back exactly
  at ecc H, and does not read at the default ecc (negative control). Not screenshotted in the Mac app
  (the screen-takeover prompt went unanswered).
- [x] G164 One QR installs, updates or signs in, whatever Eve the phone has; the APK carries its version
  EVIDENCE: the page opens eve://signin, which only this Eve and later answer; an older one (connect only)
  cannot take it, so Chrome follows the fallback, the newest APK (emulator, 0.7.2 installed: an eve://signin
  intent fell back to its fallback URL). Opened by the QR, Eve checks for a newer version and asks
  "Eve 0.7.5 is ready. Update now?" (emulator build tagged 0.7.4). Releases carry Eve-android-<v>.apk plus
  the same file as Eve-android.apk for the updaters in 0.7.2 - 0.7.6; the page and the updater hand out
  the versioned one (tests). Also: non-delete confirms no longer show a bin and "Delete" (info mark, OK or
  a given label); the white phone backdrop meant for Settings had covered every dialog's backdrop
  (released in 0.7.5), now Settings only; a hand-off timeout says to check the Wi-Fi.
- [x] G165 v0.7.4 (Mac, Latest) and android-v0.7.6 (both APK names) are released
  CHECK: gh release view android-v0.7.6 --json assets --jq '[.assets[].name] | sort | join(",")'
  EXPECT: ^Eve-android-0\.7\.6\.apk,Eve-android\.apk$
  EVIDENCE: runs 36318282051 / 36318282112 succeeded; v0.7.4 is Latest with the Mac zip. Live page on the
  emulator with the old 0.7.2 installed: the QR link went to the download of Eve-android-0.7.6.apk.
- [x] G166 When Eve does not open, the setup page shows one big "Download Eve <version>" button
  EVIDENCE: from 0.7.0 on the emulator, the live QR link downloaded Eve-android-0.7.6.apk and installing it
  over 0.7.0 gave versionName 0.7.6 (signatures of 0.7.0, 0.7.1 and 0.7.6 match: a8f3b476…e0be7d2). The page
  now shows the next step and a big versioned download button whenever the app did not open (a browser
  that ignores Chrome's fallback still has an obvious way on). Emulator screenshot.
- [x] G167 Every QR fetches a fresh setup page, not one GitHub Pages cached from before a change
  CHECK: node --experimental-strip-types --no-warnings src/lib/handoff.test.mjs
  EXPECT: HANDOFF_OK
  EVIDENCE: the page is served with max-age=600; a phone that scanned within ten minutes of a page change
  got the old page, which hands out the plain Eve-android.apk. The link now carries a per-QR value in the
  query (nothing from the ticket: tested), so each scan loads the page anew.
- [x] G168 The QR carries the newest phone version; the page downloads exactly that APK
  CHECK: node --experimental-strip-types --no-warnings src/lib/handoff.test.mjs
  EXPECT: HANDOFF_OK
  EVIDENCE: a phone showed "Download Eve 0.7.0": its browser answered the releases API from a day-old copy.
  The Mac now puts the version it found (the QR badge's) in the link, ?v=0.7.6 (plain versions only:
  tested), and the page builds the android-v<v>/Eve-android-<v>.apk URL from it without calling GitHub;
  without v it asks with cache: no-store. Emulator: ?v=0.7.6 → "Download Eve 0.7.6" and the fallback
  downloads Eve-android-0.7.6.apk.
- [x] G169 Reopening the phone's list slides in; Check shows it is checking; random/remove are icon buttons
  EVIDENCE: after a swipe-close the "leaving" flag was cleared by an $effect that ran after the drawer's
  intro had been created (duration 0); $effect.pre clears it first. Emulator recording: the list slides in
  over several frames. Check: spinner and "Checking…" for at least 600 ms, then "✓ Up to date" (or "Could
  not check — offline?"), recording. Emoji picker: shuffle and bin icons, 28px on the Mac, 44px on the
  phone (screenshots of both).
