# Tooltips and tips

A person resting the mouse on a button is told its name and its key, and after doing something the long way (a `/`
item, a button, a menu) a 💡 tip at the foot of the window names the key that does it, a few times at most.
Screens: `Tooltip.svelte` (any element with `data-tip`, and `data-keys`), `Hint.svelte` (the 💡 tip,
`src/lib/hints.svelte.ts`). Both are mounted once in `App.svelte`.

## Sub-features

- `tooltip-show`: the mouse still on a button with `data-tip` for ~0.4 s shows a dark-on-light tip with its name and
  key chips (`New ⌘ N` under the top bar's +; `Settings ⌘ ,` above the sidebar's gear, kept inside the window).
- `tooltip-hide`: any key, a press, a scroll or the mouse leaving puts the tip away.
- `hint-show`: a `/` item that has a key (Callout, Code block, Divider, Image, Link to note) shows
  `💡 Callout has a shortcut ⌘ ⇧ C ×` centred over the note's foot; it goes by itself after 5 s.
- `hint-dismiss`: × puts it away at once; the keyboard stays in the note (typing goes on in the callout).
- `hint-limits`: × does not stop a tip for good. Any two tips are at least 25 s apart; one tip shows 3 times at most,
  then never again (`eve.hints` in localStorage counts them: `{"seen":{"callout":3}}`).
- `hint-off`: Settings → General → Show tips off: no tip at all.
- `hint-phone`: a phone window shows no tips (no keys there) and has no hover tooltips.

## How to get to it (user POV)

- Tooltips: rest the mouse on the top bar's buttons (Sidebar, Back, Forward, New), the sidebar's gear and trash, a
  diagram's dock, a row's buttons.
- Tips: `/callout` (or another `/` item with a key), a button with a key clicked with the mouse, a menu item with a key,
  cut and paste of whole lines, a sidebar row moved by drag.
- Settings (⌘,) → General → App → Show tips.

## Driving it with drive.mjs

Preconditions: the default notes. Run: `node .claude/skills/verify-eve/drives/run.mjs hints`.

- `tooltip-show` `tooltip-hide` **Tooltip.** `const b = await t.page.locator('button[aria-label="New"]').boundingBox(); await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await t.wait(700);`
  `.tip` reads `New⌘N`. `await t.key('Shift')`: no `.tip`. The gear (`aside button[aria-label="Settings"]`): `.tip`
  `Settings⌘,` sits above it, inside the window. The mouse moved off: gone.
- `hint-show` **Tip.** `await t.click('.tiptap > p >> nth=-1'); await t.key('End'); await t.key('Enter'); await t.type('/callout'); await t.wait(300); await t.key('Enter'); await t.wait(500); await t.type('x');`
  `.hint[role="status"]` reads `💡 Callout has a shortcut ⌘ ⇧ C ×`.
- `hint-dismiss` **Dismiss.** `await t.click('.hint button[aria-label="Dismiss"]')`: no `.hint`; `await t.type('zz')` lands in the callout
  (`> xzz` in the markdown).
- `hint-limits` **Limits.** `/callout` again at once: no tip (25 s gap). After `t.wait(26000)`: the tip again (2nd); gone 5.5 s later
  by itself. After another 25 s: 3rd. After another 26 s: none, and `localStorage['eve.hints']` has `"callout":3`.
- `hint-off` **Off.** `await t.key(`${t.mod}+Comma`)`, then `const sw = t.page.locator('input[aria-label="Show tips"]'); await sw.scrollIntoViewIfNeeded(); await t.click('input[aria-label="Show tips"]');`
  `eve.hints` has `"off":true`; Esc, `/callout`: no `.hint`.
- `hint-phone` **Phone.** `--phone`: `/callout` typed in the note, then `.hint` count is 0.

Proved on 2026-11-17 (0.7.147), shots under `${TMPDIR}/eve-verify/`: `hints/shots/mac-01-tip-new`, `mac-02-tip-gear`,
`mac-03-hint-callout`, `mac-04-hint-gone` (the 4th time, none); `hints3/shots/mac-01-tip-hidden-by-key`,
`mac-02-hint-dismissed`, `phone-01-no-hint`; `hints2/shots/mac-01-tips-off`, `mac-02-no-hint`.

## Gotchas

- A tip waits 400 ms: move the mouse there with `t.page.mouse.move`, then wait ~700 ms. `t.click` would press, and a
  press puts the tip away.
- Tips are 25 s apart across all kinds, and each kind stops after 3: a run that tests two tips waits, and a run that
  needs a tip again starts fresh (each drive.mjs run clears localStorage).
- A tip is hidden under anything modal (Settings, a picker): check it with the note in front.
- After × the keyboard is on `<body>` for a moment, yet the next letters still reach the note; judge by the markdown,
  not by `document.activeElement`.
- Show tips sits below the window's fold in Settings: scroll it into view before `t.click`, or the click lands
  elsewhere and nothing changes.
- The drive does not wait out the 25 s gaps: `t.page.clock.install()` and a reload at the start, then `t.page.clock.fastForward(26_000)` before each tip; the 5 s that put a tip away still pass as real time.
- A phone has no `.tip` even for a tap on a button with `data-tip` (the list's fold chevron).
