# Phone

What only the phone window has: Eve opens on the note left open, the list is made for a thumb (title, when, two lines),
a row swiped left is deleted, menus and choices come up as sheets from the bottom, a formatting bar sits over the
keyboard, and the chevron at the top goes back from a note to the list.

## Sub-features

- `phone-open`: the app opens on the note that was open, full screen, with ‹ (`Back`), ⋯ (`More`), the pin and the bin.
- `phone-list`: ‹ shows the list: `Eve`, the sync state and the gear, a Search box, each row a title, when it was edited
  (`지금`, `2025년 11월 17일`) and up to two lines of the note; a page under another is indented; the round `+`.
- `phone-swipe`: a row pulled left past a third of its width asks `Delete “Reading list”?`; Delete removes it, with an
  Undo toast.
- `phone-sheet`: ⋯ and `+` open bottom sheets; a tap on the dim page above, or a pull down, puts them away.
- `phone-bar`: with the keyboard up in the note, the bar over it (undo, redo, to-do, bold, highlight, outdent, indent,
  ⌄ `Done`) acts on the line; `Done` puts the keyboard and the bar away.
- `phone-back`: ‹ goes from a note to the list; a new note left with words stays in it, on top.
- `phone-reorder`: a long press (420 ms) lifts a row, a copy rides over the finger with a blue line where it will land,
  and let go it moves there (no test covers this gesture: this drive is its only proof).
- `phone-hardware-back`: Android's back closes the newest sheet first, then goes to the list, then leaves (not proved
  here: it is Tauri's `onBackButtonPress`; the on-screen ‹ runs the same `phoneBack`, but a sheet's dim page covers it).

## How to get to it (user POV)

- Open the app: the last note. ‹ to the list; tap a row to open it.
- Swipe a row left to delete it; long-press it to move it.
- ⋯ in a note: Small text, Present, Find & replace…, Select all, Export…, Version history…, Trash….
- `+` (`New note`) in the list: a sheet with New note.
- Tap a line in the note: the keyboard and the bar come up.

## Driving it with drive.mjs

Run with `--phone`. Preconditions: Plan with three lines (`First line.`, `Second line of the plan.`,
`Third line, not shown in the list.`), Groceries (`parent: a`, `milk` / `eggs`), Reading list (`A book.` /
`Another book.`).

A swipe is touch events on the row: WebKit's `Touch` constructor is refused ("Illegal constructor"), so the steps
build a `TouchEvent` and give it `touches` by hand; the app's own `swipeRow` and drawer listeners take them as they are.

```js
const touchHelper = (t) => t.page.evaluate(() => {
  window.__touch = (type, target, x, y) => {
    const ev = new TouchEvent(type, { bubbles: true, cancelable: true });
    const p = [{ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y }];
    for (const k of ['touches', 'targetTouches']) Object.defineProperty(ev, k, { value: type === 'touchend' ? [] : p });
    Object.defineProperty(ev, 'changedTouches', { value: p });
    return ev;
  };
});
const swipe = (t, sel, dx) => t.page.evaluate(async ({ sel, dx }) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect();
  const y = r.top + r.height / 2, x0 = r.left + r.width * 0.7;
  const fire = (type, x) => el.dispatchEvent(window.__touch(type, el, x, y));
  fire('touchstart', x0);
  for (let i = 1; i <= 10; i++) { fire('touchmove', x0 + (dx * i) / 10); await new Promise((r) => setTimeout(r, 16)); }
  fire('touchend', x0 + dx);
}, { sel, dx });
```

- **Opens on the note.** At start `.tiptap` shows Plan and there is no `aside`.
- **Bar.** `await t.page.locator('.tiptap p:has-text("Second line")').tap(); await t.page.setViewportSize({ width: 390, height: 470 });`
  `.mbar` is there; `await t.page.locator('.mbar button[aria-label="To-do"]').tap()` makes the saved line
  `- [ ] Second line of the plan.`; `.mbar button[aria-label="Done"]` tapped (and the size put back): no `.mbar`.
- **Sheet.** `await t.page.locator('button[aria-label="More"]:visible').tap()` brings `.sheet` with the items above;
  `await t.page.touchscreen.tap(195, 80)` (the dim page): no `.sheet`.
- **List.** `await t.page.locator('button[aria-label="Back"]:visible').tap()`; each `aside [data-row]` has `.t`,
  `.when` and `.preview` (Plan's preview holds all three lines' text, cut to two lines on screen).
- **Swipe.** `await touchHelper(t); await swipe(t, 'aside [data-row][data-note="c"]', -220);` brings
  `[role="dialog"].box` `Delete “Reading list”?`; `await t.page.locator('[role="dialog"].box button:text-is("Delete")').tap()`:
  the row is gone, `localStorage['eve.notes.c']` has `deleted: true`, a toast says `Deleted “Reading list”` / Undo.
- **Long press, move.** With the helper: `touchstart` on `aside [data-row][data-note="c"]`, wait 600 ms, 12
  `touchmove`s ~30 ms apart up to 6 px under the top of Plan's row: `.lifted` is on the page; `touchend`: the rows
  read Reading list, Plan, Groceries.
- **New, pull down, back.** `await t.page.locator('button[aria-label="New note"]:visible').tap()` brings a sheet with
  `New note`; a `touchstart` / `touchmove` 250 px down / `touchend` on `.sheet` (the helper, y instead of x) closes it;
  tap `+` again, `.sheet button:has-text("New note")`, tap `.tiptap`, type `From the phone`, ‹: the list starts
  `From the phone 지금`.

## Gotchas

- The phone keeps hidden Mac copies of buttons: use `:visible` with `Back`, `More`, `New note`, `Settings`.
- `t.page.locator(...).tap()` for taps; `t.click` is a mouse click, which the swipe and sheet code ignore.
- A sheet's dim page (`.scrim`) is over the ‹: a tap on ‹ with a sheet up times out. Close the sheet first.
- The delete confirm is `Confirm.svelte` (`[role="dialog"].box`), not a `.sheet`.
- The swipe must be quick (moves ~16 ms apart) and mostly sideways, or it is taken for a scroll or a long press.
