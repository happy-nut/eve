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
