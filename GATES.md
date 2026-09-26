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
