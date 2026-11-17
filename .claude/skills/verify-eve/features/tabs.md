# Tabs

On the Mac a person keeps several notes open side by side in tabs over the note, as in Notion's desktop app: opens a
note in a new tab, switches between them, closes one and brings it back, pins one to the front. The bar shows only with
two or more tabs; the phone has no tabs.

## Sub-features

- `tabs-new`: ⌘T makes a new note in a new tab, in front, with the caret in it; the tab bar (`role="tablist"`,
  `aria-label="Open notes"`) appears with the note that was open as the first tab.
- `tabs-open-row`: ⌘-click on a sidebar row, or the row's right-click menu → Open in new tab, opens that note in a new
  tab in front.
- `tabs-switch`: a click on a tab brings its note to front; ⌃Tab steps to the next tab (⌃⇧Tab the one before).
- `tabs-close`: a tab's × (`button[aria-label="Close tab"]`) or ⌘W closes it; the tab beside it comes to front.
- `tabs-reopen`: ⌘⇧T brings back the last tab closed, in front.
- `tabs-pin`: right click on a tab → Pin tab: it shrinks to its icon or initial at the row's front and loses its ×.
- `tabs-kept`: the tabs, pinned ones and the front one, are the same after a reload.
- `tabs-phone`: the phone has none: ⌘T there makes no tab and no note.

## How to get to it (user POV)

- ⌘T, ⌘W, ⌘⇧T, ⌃Tab / ⌃⇧Tab (rebindable in Settings → Shortcuts).
- ⌘-click a row in the sidebar; right click a row → Open in new tab.
- The bar under the window's top row: click a tab, its ×, the middle button closes, right click for Pin tab / Unpin
  tab, Close tab, Close other tabs.

## Driving it with drive.mjs

Preconditions: the default three notes, Plan open. Read the bar with
`[...document.querySelectorAll('.tabbar .tab')].map((x) => (x.classList.contains('on') ? '*' : '') + (x.classList.contains('pinned') ? '[pin]' : '') + x.querySelector('.pick').title)`.

- **New.** `await t.click('.tiptap'); await t.key(`${t.mod}+t`); await t.wait(600); await t.type('Trip');` The bar reads
  `Plan`, `*Trip`; before it there was no `.tabbar`.
- **From a row.** `await t.page.keyboard.down('Meta'); await t.click('aside [data-note="c"]'); await t.page.keyboard.up('Meta');`
  adds `*Reading list`. `await t.page.click('aside [data-note="b"]', { button: 'right' }); await t.click('.menu button[role="menuitem"]:has-text("Open in new tab")');`
  adds `*Groceries`; the crumbs read `Plan / Groceries`.
- **Switch.** `await t.click('.tabbar .tab:nth-child(1) .pick');` → `*Plan`, the sidebar's active row is Plan.
  `await t.key('Control+Tab');` → `*Trip`.
- **Close.** `await t.page.hover('.tabbar .tab:nth-child(3)'); await t.click('.tabbar .tab:nth-child(3) button[aria-label="Close tab"]');`
  Reading list goes. `` await t.key(`${t.mod}+w`) `` closes the front Trip; Groceries comes to front.
- **Reopen.** `` await t.key(`${t.mod}+Shift+t`) `` → `Plan`, `Groceries`, `*Trip`.
- **Pin.** `await t.page.click('.tabbar .tab:nth-child(1)', { button: 'right' }); await t.click('.menu button[role="menuitem"]:has-text("Pin tab")');`
  → `[pin]Plan`; the shot shows a narrow `P` tab with no ×.
- **Kept.** `await t.page.reload(); await t.page.waitForSelector('.tiptap');` → still `[pin]Plan`, `Groceries`, `*Trip`.
- **The rest** (a second run, Groceries and Reading list ⌘-clicked open): `await t.key('Control+Shift+Tab');` steps
  back to `*Groceries`; `await t.page.mouse.click(box.x + 30, box.y + box.height / 2, { button: 'middle' })` on the
  first tab's box closes Plan; after a ⌘T, right click the first tab → `Close other tabs` leaves Groceries alone, in
  front, and the bar is gone.
- **Phone.** With `--phone` (a note is open at start): `await t.click('.tiptap'); await t.key(`${t.mod}+t`);` No
  `.tabbar`, still 3 `eve.notes.*` in `localStorage`.

Proved on Eve 0.7.147, shots in `$TMPDIR/eve-verify/tabs/shots/` (`mac-01-new-tab` … `mac-06-reload`,
`phone-01-phone-no-tabs`) and `shots2/` (`mac-01-tab-menu`, `mac-02-others-closed`).

## Gotchas

- The bar is not in the DOM with one tab: wait for `.tabbar` after the second tab, don't expect it at start.
- A tab's × shows only on hover or on the front tab; `t.click` goes by its box, so hover the tab first to be like a
  person.
- Opening a note any other way (a row click, a link, back) changes what the front tab shows; only ⌘T, ⌘-click and
  Open in new tab add a tab.
- An empty note made by ⌘T and left (its tab closed) is dropped: it is not in the sidebar afterwards.
- Not driven: ⌘W on the last tab (the code hides the window, which the web build cannot show) and ⌘W on a pinned
  tab (the code leaves it).
- ⌘T's note goes beside the open one: with a sub-page open (Groceries) it is made under the same parent (Plan), not
  at the top level.
- A new note may come with an icon (`📌 Trip`); the `.pick` title has the name alone.
