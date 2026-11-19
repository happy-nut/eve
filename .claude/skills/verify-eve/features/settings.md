# Settings

A person opens Settings, gives an action a key of their own and uses it at once, is told when a key is taken, and
picks a light or dark look that stays after the app is opened again.

## Sub-features

- `settings-open`: ⌘, (or the sidebar's gear) opens the Settings dialog on General; tabs General, Appearance, Sync,
  Shortcuts (a phone has no Shortcuts tab).
- `settings-rebind`: a key chip clicked, a new combo pressed: the chip shows it, the new key does the action, the old
  one no longer does, and both hold after a reload.
- `settings-conflict`: a combo already bound is refused with "⌘N is already used by “New note”", and the chip keeps
  waiting.
- `settings-theme`: Appearance → Theme → Dark darkens the whole window at once; ⌘⇧L flips dark / light; the choice is
  kept over a reload.
- `settings-slider`: Appearance → Text's sliders (`Slider.svelte`: Size 12–28 px, Line height 1.2–2.2, Width
  520–1400 px) move by a click on the track, a drag, or ← → once the slider has the keyboard; the value beside the label
  and the open note change at once, and stay after a reload. A phone has Size and Line height only. (Size and Line
  height driven; Width not. General → Window's Opening width / height size the Mac window through Tauri: not proved
  here.)

## How to get to it (user POV)

- ⌘, anywhere; the gear (`Settings`) at the foot of the sidebar; on a phone the gear at the top of the list.
- Shortcuts tab: click a chip, press the combo; Esc cancels, ⌫ puts that action's own key back; "Reset all to
  defaults" under the list.
- Appearance tab: Theme (System / Light / Dark), Editor font, code colours, text size, line height, width, Presenting.
- ⌘⇧L (Dark / light theme) without opening Settings.

## Driving it with drive.mjs

Preconditions: the default three notes. Run: `node .claude/skills/verify-eve/drives/run.mjs settings`.

- `settings-open` **Open.** `await t.key(`${t.mod}+Comma`); await t.page.waitForSelector('[role="dialog"][aria-label="Settings"]');`
  The General tab is up over a dimmed app. The gear: `await t.click('aside button[aria-label="Settings"]');`. Phone
  (`--phone`): `await t.click('button[aria-label="Back"]:visible'); await t.page.locator('button[aria-label="Settings"]:visible').tap();`
  shows General, Appearance, Sync full screen, no Shortcuts.
- `settings-conflict` `settings-rebind` **Conflict, then rebind.**
  ```js
  await t.click('[role="dialog"] button[role="tab"]:has-text("Shortcuts")');
  const row = '[role="dialog"] .row:has(.label:text-is("Search notes"))';
  await t.click(`${row} .chip`);
  await t.key(`${t.mod}+n`);                       // refused: '[role="dialog"] .alert' names “New note”
  await t.key(`${t.mod}+j`);                       // taken: the chip reads ⌘J
  await t.key('Escape');                           // Settings closes
  ```
  Then `await t.click('.tiptap'); await t.key(`${t.mod}+j`);` puts the keyboard in the sidebar box, whose placeholder
  now reads `Search  ⌘J`; ⌘P leaves it in the note. After `t.page.reload()` ⌘J still opens search.
- `settings-theme` **Theme.**
  ```js
  await t.click('[role="dialog"] button[role="tab"]:has-text("Appearance")');
  await t.click('button[aria-label="Theme"]');
  await t.click('[role="listbox"] [role="option"]:has-text("Dark")');
  ```
  `document.documentElement.dataset.theme` is `dark`, `body` is `rgb(11, 12, 16)`. Esc, then ⌘⇧L: `light`,
  `rgb(255, 255, 255)`; after a reload still `light`.

- `settings-slider` **Slider.**
  ```js
  await t.click('[role="dialog"] button[role="tab"]:has-text("Appearance")');
  const s = t.page.locator('input[aria-label="Size"]');
  await s.scrollIntoViewIfNeeded();
  const b = await s.boundingBox();
  await t.page.mouse.click(b.x + b.width - 4, b.y + b.height / 2);
  await t.page.mouse.move(b.x + b.width - 4, b.y + b.height / 2); await t.page.mouse.down();
  await t.page.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2, { steps: 6 }); await t.page.mouse.up();
  ```
  The click at the right end makes it 28 (`28px`), the drag to the middle 20. The sub-label and `getComputedStyle(document.querySelector('.tiptap p')).fontSize` follow (15 → 28 → 20 px). Keys:
  Tab until `document.activeElement` is the slider (`Line height`), ArrowRight twice: 1.6 → 1.7, the note's line 34 px
  at 20 px. After Esc and `t.page.reload()` the note is still at its new size (`eve.appearance` has `"size"`). Phone
  (`--phone`): Back, the gear tapped, Appearance tapped; sliders `Size=17`, `Line height=1.65`; a tap near the track's
  right end: `28px`.

Proved on 2026-11-17 (0.7.147) for `settings-slider`, shots under `${TMPDIR}/eve-verify/`: `slider/shots/mac-01-size-mouse`
(Size 20px by click and drag), `mac-02-lineheight-keys` (Line height 1.7 by Tab and →), `mac-03-after-reload` (the note
still 20px / 34px); `slider-phone/shots/phone-01-size` (28px by a tap).

## Gotchas

- The chip is under `.row` beside a `.label`; match the label with `:text-is(...)` (`Search notes` also appears inside
  longer labels' words).
- While a chip records, every key goes to it, ⌘, and Esc included: Esc then cancels the recording, not Settings.
- A key with no ⌘ / ⌃ / ⌥ is refused ("alone would type in the note"), so a bare letter cannot be bound.
- Theme `System` follows the host's appearance; Playwright's WebKit reports light, so prove Dark by picking it.
- What General's rows do (launch at login, Dock, Hotkey, opening `.md` from Finder, Claude) needs the Tauri shell: the
  rows show, their effect does not happen here.
- A slider clicked or dragged with the mouse does not take the keyboard in Playwright's WebKit: ← → then do
  nothing. Tab to it first.
- Text's sliders sit below the fold in Appearance: `scrollIntoViewIfNeeded()` before reading the slider's box.
- Width's value shows as the note column itself: two ← on Width (20 px a step) make `.tiptap` 40 px narrower, also after a reload.
