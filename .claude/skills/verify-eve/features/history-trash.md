# Version history and Trash

A person deletes a note and takes it back (at once with Undo, or later from the Trash), deletes it for good, and goes
back to an older version of a note that sync saved. Deleting moves a note to the Trash; only the Trash deletes for
good. Versions come from the sync repository's commits, so they exist only with sync on.

## Sub-features

- `trash-delete`: a row's × (`Delete note`), ⌘⇧⌫ on the open note, or the phone's bin in the note's bar asks
  `Delete “<title>”?`; Delete (or ↩) moves the note to the Trash (`deleted: true` in its file) and a toast
  `Deleted “<title>”` offers Undo.
- `trash-undo`: the toast's Undo brings the note back, open.
- `trash-swipe`: on a phone a row pulled to the left shows a red Delete under it; let go, the same question comes up.
- `trash-open`: the sidebar's bin (`aside button[aria-label="Trash"]`), or on a phone ⋯ → Trash…, opens the `Trash` panel, the
  keyboard in its `Search the trash` box; rows newest first, each with Restore and Delete for good.
- `trash-search`: typing narrows the Trash to matching titles.
- `trash-restore`: a row (or its ↶ `Restore`) brings the note back to the list, opens it and closes the Trash.
- `trash-erase`: a row's `Delete for good` asks `Delete “<title>” for good? It can't be brought back.`; Delete leaves
  the Trash empty of it, the keyboard back in the search box. The note's file keeps only its front matter
  (`deleted: true`, no body), a tombstone for sync.
- `trash-empty`: `Empty trash` asks `Delete all N notes in the trash for good?` and erases them all.
- `history-off`: with sync off, ⋯ → Version history… opens `Version history · <title>` saying versions come from sync
  and to turn it on in Settings → Sync.
- `history-list`: with sync on, the panel lists the note's commits newest first (the first marked `latest`) and shows
  the chosen one as the note is drawn.
- `history-restore`: `Restore this version` (off for `latest`) puts the chosen version in the note, closes the panel
  and toasts `Restored the version from <when>` with Undo.

## How to get to it (user POV)

- Delete: hover a sidebar row → ×; ⌘⇧⌫; the row's right-click menu → Delete note; ⌫ on a row from ⌘\. Phone: the bin
  in the note's bar, or pull a row left in the list.
- Trash: the bin at the sidebar's bottom (Mac), or the note's ⋯ → Trash… (phone sheet only; the Mac's ⋯ leaves it to the bin).
- Version history: the note's ⋯ → Version history… (Mac and phone).

## Driving it with drive.mjs

Preconditions: the default three notes plus `e.md` `# Old idea` / `Gone soon.`. Read a note's state with
`localStorage.getItem('eve.notes.<id>')` (`deleted: true|false`).

- **Delete by ×.** The × shows only once the mouse has moved over the row (`html[data-hover]`) and the tools slid
  open: `await t.page.hover('aside [data-note="c"]', { position: { x: 20, y: 10 } }); await t.page.hover('aside [data-note="c"]', { position: { x: 60, y: 14 } }); await t.wait(400); await t.click('aside [data-note="c"] ~ .tools button[aria-label="Delete note"]'); await t.key('Enter');`
  Reading list leaves the list, `deleted: true`, the toast `Deleted “Reading list”  Undo` is at the bottom.
- **Delete by key.** Open Old idea, `` await t.key(`${t.mod}+Shift+Backspace`); await t.click('button.primary:has-text("Delete")'); ``
  The next note (Groceries) opens.
- **Delete from the list.** `await t.page.click('aside [data-note="e"]', { button: 'right' }); await t.click('.menu button[role="menuitem"]:has-text("Delete note")'); await t.key('Enter');`
  Old idea goes and the keyboard is on the next row (Reading list); `await t.key('Backspace')` there asks
  `Delete “Reading list”?`, Enter deletes it and the keyboard moves to Groceries' row.
- **Undo.** Right after a delete: `await t.click('.toast button:has-text("Undo")');` Old idea is back in the list and
  open.
- **Trash.** `await t.click('aside button[aria-label="Trash"]');` lists Old idea and Reading list; `await t.type('read')`
  leaves Reading list; clear the box, then `await t.click('[aria-label="Trash"][role="dialog"] li:has-text("Reading list") button[aria-label="Restore"]');`
  The panel is gone, Reading list is back and open, `deleted: false`.
- **For good.** `await t.click('aside button[aria-label="Trash"]'); await t.click('[aria-label="Trash"][role="dialog"] li:has-text("Old idea") button[aria-label="Delete for good"]'); await t.key('Enter');`
  The panel says `Nothing in the trash. …`; after a reload Old idea is still gone, its file `---\nid: e\n…deleted: true\norder: 3\n---\n`.
- **Empty.** With two in the Trash, `button:has-text("Empty trash")`, then `button.primary:has-text("Delete")`: both
  files are tombstones, the list keeps the rest.
- **History, sync off.** ⋯ (`button[aria-label="More"]`) → `Version history…`: the panel's text is the "Versions come
  from sync…" line.
- **History, sync on (a GitHub stand-in).** The web build has no real sync here, so GitHub is answered by Playwright:
  `t.page.route('https://api.github.com/**', …)` returns two commits for `GET …/commits?sha=main&path=notes%2Fa.md`
  (`[{ sha: 'c2', commit: { committer: { date } } }, { sha: 'c1', … }]`), `{ content: base64(<whole note file>) }` for
  `GET …/contents/notes/a.md?ref=<sha>`, and 503 for everything else. Then
  `localStorage.setItem('eve.sync', JSON.stringify({ user: 'tester', repo: 'tester/eve-notes', token: 'test-token-not-real', host: '' }))`,
  reload, ⋯ → Version history…: two rows (`latest`, `어제`), the latest drawn. Click
  `ul[aria-label="Versions"] li:nth-child(2) button`: the older text is drawn. `Restore this version`: the panel
  closes, the note reads the older text, the toast says `Restored the version from …`, and `eve.notes.a` holds it.
  The sidebar says `sync error` (the other calls got 503) and one console error for it is expected.
- **Phone.** With `--phone` (a note open at start): `button[aria-label="Delete note"]:visible` then
  `button.primary:has-text("Delete")` deletes it and shows the list. A pull to the left is plain
  `Event('touchstart' | 'touchmove' | 'touchend')` with `touches` set by `Object.defineProperty` (WebKit has no
  `Touch` constructor): start at the row's right, 10 moves of 25 px left, end, wait 1.2 s; the row shows the red
  Delete while moving, then the question sheet. The ⋯ menu is a sheet there:
  `button[role="menuitem"]:visible:has-text("Trash…")`.

Proved on Eve 0.7.147. Shots: `$TMPDIR/eve-verify/trash/shots/` (confirm, toast, Trash, restored, erase question,
erased), `shots2/` (undo, Empty trash question, emptied, ⋯ menu, history with sync off), `pshots/` (phone question,
swiping, the sheet over the toast, phone Trash, restored), `shots3/` (⌫ on a row), `$TMPDIR/eve-verify/history/shots/` (latest, older,
restored).

Not proved: history against real GitHub (the commits list and the file at a commit are a stand-in here; what they
return is shaped from `Repo.history` / `Repo.fileAt` in `src/lib/github.ts`); the panel on a phone (its entry is in
the ⋯ sheet, the panel itself was not opened there).

## Gotchas

- On a phone, the `Deleted “…”  Undo` toast sits over the middle of a bottom sheet for its first seconds: over the
  question sheet's Delete button and over the Trash sheet's first row. A tap at their centre lands on the toast (seen
  with `document.elementFromPoint`); tap the button's left part, or the row's ↶, or wait the toast out.
- After a delete from the list the keyboard stays in the list: a ⌘\ then closes the sidebar instead of focusing it.
- `t.click` on the × before the hover has opened `.tools` clicks a 0-wide box and hits nothing.
- The phone's question comes up 120 ms after the finger lifts, sliding: wait about a second before tapping it.
- Restoring opens the note; a toast from the delete may still be up after it.
- Erasing never removes the file: sync needs the tombstone to delete the note on other devices.
