# Sidebar

A person keeps notes in order in the sidebar: drags a page to another place or under another page, gives it an emoji,
jumps to one with ⌘1…⌘9, walks and rearranges the list from the keyboard with ⌘\, folds a page's sub-pages away, and
closes the sidebar to write. The phone has the same list as its own screen, rearranged by a long press.

## Sub-features

- `sidebar-drag-reorder`: a row dragged onto the top half of another lands before it, beside it.
- `sidebar-drag-nest`: a row dragged onto the bottom half of a page whose sub-pages show becomes its first sub-page;
  the note is saved with `parent:` and stays there after a reload.
- `sidebar-icon`: a click on a row's icon opens the `Choose an icon` picker; the emoji picked shows on the row and on
  the page's head.
- `sidebar-jump`: holding ⌘ shows 1…9 on the rows as listed; ⌘<digit> opens that note with the caret in it.
- `sidebar-keys`: ⌘\ puts the keyboard on the open note's row; ↑↓ walk, ⌥↑↓ move a row a slot, ⌥→ nests it under the
  row above, ← folds (or goes up to the parent), Space folds and unfolds, Esc goes back to the note.
- `sidebar-fold`: the chevron (`Collapse` / `Expand`) hides and shows a page's sub-pages; the fold is kept over a
  reload.
- `sidebar-toggle`: ⌘\ with the keyboard in the list, or the toolbar's `Sidebar` button, closes the sidebar; the
  button (or ⌘\ again) opens it.
- `sidebar-phone-reorder`: on a phone a row held for ~0.4 s lifts and follows the finger; let go over another row, it
  lands there.

## How to get to it (user POV)

- The Mac window's left column, under the `Search  ⌘P` box; the toolbar's first button (`Sidebar`) opens and closes
  it.
- Drag a row with the mouse; a row's icon (the page outline when it has none) with a click; the chevron right of a
  page with sub-pages; right click on a row for Open / Open in new tab / Change icon… / Move up / Move down / Nest under
  previous / Move out / Delete note.
- ⌘\ (rebindable: Settings → Shortcuts, "Sidebar: focus / close"); hold ⌘ for the numbers, ⌘1…⌘9 to jump.
- Phone: the list is the start screen (a note opens over it, ‹ `Back` returns); hold a row and drag it.

## Driving it with drive.mjs

Preconditions: the default three notes plus `d.md` with front matter (a real `updated:`, `order: 3`, `icon: 🌱`) and
`# Garden` / `Seeds.`. The list starts Plan, Groceries (under Plan), Reading list, 🌱 Garden. Read the list with
`[...document.querySelectorAll('aside [data-row]')].map((r) => getComputedStyle(r.closest('li')).getPropertyValue('--d') + '|' + r.textContent.trim())`
(`--d` is the depth). Run: `node .claude/skills/verify-eve/drives/run.mjs sidebar`.

- `sidebar-drag-reorder` **Reorder by drag.** `await t.page.dragAndDrop('aside [data-note="c"]', 'aside [data-note="a"]', { targetPosition: { x: 40, y: 3 } });`
  The list reads `0|Reading list`, `0|Plan`, `1|Groceries`, `0|🌱 Garden`.
- `sidebar-drag-nest` **Nest by drag.** `await t.page.dragAndDrop('aside [data-note="d"]', 'aside [data-note="a"]', { targetPosition: { x: 40, y: 25 } });`
  Garden is `1|` under Plan, above Groceries. After `t.page.reload()` it is still there, and
  `localStorage.getItem('eve.notes.d')` has `parent: a`.
- `sidebar-icon` **Icon.** `await t.click('aside [data-note="c"] .ico-slot'); await t.page.waitForSelector('[aria-label="Choose an icon"] emoji-picker button.emoji'); await t.click('emoji-picker button.emoji >> nth=3');`
  (the locator reaches into the picker's shadow root). The row reads `😄  Reading list`; open it and the page's head
  shows the big 😄 over `Add cover`.
- `sidebar-jump` **Jump.** `await t.click('.tiptap'); await t.page.keyboard.down('Meta'); await t.wait(800);` shot the sidebar: 1 2 3 4
  badges in list order, Groceries' included. `await t.page.keyboard.press('Digit3'); await t.page.keyboard.up('Meta');`
  Reading list is open and `document.activeElement` is the `.tiptap`.
- `sidebar-keys` **Keys.** From the note: `` await t.key(`${t.mod}+Backslash`) `` focuses the open row (`row c`); `ArrowUp` → Groceries;
  `Alt+ArrowDown` on Groceries (the last sub-page) moves it out to the top level after Plan; `Alt+ArrowRight` nests it
  back under Plan; `ArrowUp` → Plan, `ArrowLeft` folds it (Groceries gone, chevron points right); `' '` unfolds;
  `Escape` puts the keyboard back in the `.tiptap`.
- `sidebar-toggle` **Close / open.** With the keyboard in the note, ⌘\ twice (first focuses the list, second closes it): no `aside` on
  the page, the note still has the keyboard. `await t.click('button[aria-label="Sidebar"]')` brings it back.
- `sidebar-fold` **Fold by click.** `await t.click('aside button[aria-label="Collapse"]');` Groceries is hidden; reload; still hidden;
  `aside button[aria-label="Expand"]` shows it again.
- `sidebar-phone-reorder` **Phone reorder.** With `--phone` the list is up at start. WebKit has no `Touch` constructor, so the finger is a plain
  `Event('touchstart' | 'touchmove' | 'touchend', { bubbles: true, cancelable: true })` with `touches` /
  `changedTouches` set by `Object.defineProperty` to `[{ identifier: 1, clientX, clientY }]`, dispatched on the row
  (start), then on what was the target: start on Reading list's row, wait 600 ms, 8 moves up to 4 px under Plan's
  top, end. While moving, a lifted copy rides under the finger and a blue line is drawn above Plan; after, the list
  reads Reading list, Plan, Groceries, Garden.

Proved on Eve 0.7.147. Shots under `$TMPDIR/eve-verify/side/`: `shots/` (start, drag-reorder, drag-nest),
`shots2/` (icon-picker, icon-set, cmd-held, cmd-3, keys-moved, keys-folded, sidebar-closed, fold-click,
after-reload), `shots3/` (drag-kept), `shots4/` (phone-list, phone-lifted, phone-reorder).

## Gotchas

- `t.page.dragAndDrop` works on these rows in WebKit (native HTML5 drag); `targetPosition.y` picks the half: 3 px is
  above, 25 px (of a 28 px row) below.
- A drag below a page with no visible sub-pages puts it after that page, beside it, not under it; nesting a page under
  one with none is ⌥→ (or the row menu's Nest under previous).
- ⌥↓ on the last sub-page leaves its parent (it does not stop); match the list after each move, not the order you
  expect.
- While searching, drags and ⌥ moves do nothing (the results are not the list's order).
- Not driven: the row menu's Change icon…, Move up / down, Nest under previous, Move out (their keys `i`, ⌥↑↓, ⌥←→
  were); its Open in new tab and Delete note are in `tabs.md` and `history-trash.md`.
- ⌘1…⌘9 count the rows shown, sub-pages included, folded ones left out.
- On a phone a row pulled left asks to delete it (driven in `history-trash.md`); a tap on a row's icon opens the note
  rather than the picker (from `iconTap` in `Sidebar.svelte`, not driven).
- The open note's pages are unfolded on start: a page folded while one of its own sub-pages is open comes back unfolded after a reload. Open another note before folding to prove the fold is kept.
- ⌥↑ / ⌥↓ step through slots, an open page above being one: ⌥↑ under a page's sub-page first goes into it (as its last sub-page), the next ⌥↑ passes it.
- The picker's 4th emoji is not the same in every run (recently used ones come first): read the picked emoji back from the row.
