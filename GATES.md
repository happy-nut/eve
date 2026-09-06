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
