# Find, outline and text size

A person finds words in the open note and replaces them, sees the note's sections as ticks at its side and jumps to
one, and makes the text larger or smaller with ⌘+ / ⌘- without going to Settings.

## Sub-features

- `find-bar`: ⌘F (on a phone ⋯ → Find & replace…) opens the bar; typing marks every match, the current one darker, and
  shows `1/2`.
- `find-replace`: the bar's Replace button opens a second line; Replace all puts the words in everywhere; Esc closes
  the bar and the caret is back in the note.
- `find-outline`: a note taller than the window has a rail of ticks beside it, one per heading; a tick hovered shows
  the section's title and first lines; a tick clicked scrolls to that section.
- `find-size`: ⌘= one step larger (15 → 19px), ⌘- smaller, ⌘0 back to Settings' size; a `Text 19px` pill says so.

## How to get to it (user POV)

- ⌘F in a note; on a phone the note's ⋯ (top bar) → Find & replace….
- The outline: the thin ticks left of the text, only when the note does not fit the window.
- ⌘= / ⌘- / ⌘0 anywhere in the app (rebindable in Settings → Shortcuts as Larger text / Smaller text).

## Driving it with drive.mjs

Preconditions: `a.md` is `# Plan`, `The cat sat. A cat ran.`, then three `## ` headings (Morning, Lunch, Evening)
each over 14 lines of text, so the note is taller than the window; `c.md` as the default.

- **Find.** `await t.click('.tiptap p'); await t.key(`${t.mod}+f`); await t.page.waitForSelector('.find'); await t.type('cat');`
  `.find .count` reads `1/2`; both `cat`s are marked, the first darker.
- **Replace all.** `await t.click('.find button[aria-label="Replace"]'); await t.type('dog'); await t.click('.find button[aria-label="Replace all"]');`
  The line reads `The dog sat. A dog ran.` on screen and in the saved markdown; the count goes to `0/0`.
  `await t.key('Escape')`: `.find` is gone and `document.activeElement` is the `.tiptap`.
- **Outline.** `nav.outline .tick` counts 4 (Plan, Morning, Lunch, Evening).
  `await t.page.hover('nav.outline .tick >> nth=1'); await t.wait(800);` a balloon shows `Morning` and its first
  lines. `await t.click('nav.outline .tick >> nth=2')`: the page scrolls so `Lunch` is at the top.
- **Text size.** Read `getComputedStyle(document.querySelector('.tiptap p')).fontSize`: 15px.
  `await t.key(`${t.mod}+Equal`)` gives 19px and the `Text 19px` pill; two `${t.mod}+Minus` give 12px;
  `${t.mod}+0` gives 15px again.
- **Phone.** `await t.page.locator('.mhead button[aria-label="More"]').tap(); await t.page.locator('button[role="menuitem"]', { hasText: 'Find & replace' }).tap();`
  then type, tap `.find button[aria-label="Replace"]` (first) and Replace all as on the Mac, and close with
  `.find button[aria-label="Close"]` tapped. Same result: `The dog sat. A dog ran.`

Proved on 2026-11-17 (0.7.147): `mac-01-find`, `mac-02-replaced`, `mac-03-outline-peek`, `mac-04-outline-jumped`,
`mac-05-bigger`, `mac-06-smaller`, `phone-02-find`, `phone-03-replaced`.

## Gotchas

- The bar has two buttons named `Replace`: the toggle in the first line and the one-at-a-time Replace in the second.
  `t.click` takes the first, the toggle; use Replace all, or `>> nth=1` for one at a time.
- The outline shows only when the page overflows: a short seeded note has no `nav.outline .tick` at all.
- The hover balloon waits 500 ms, and stays while the mouse is over the rail: move the mouse off before a later shot.
- The size steps are proportional (125%, 150%… of Settings' size), not 1px; Settings' size itself is not changed, so
  ⌘0 returns to it.
- Both runs end with `errors: 0`. A phone run that ends with `ResizeObserver loop completed` means the bar's height is
  being fitted in the same frame again (`makeRoom` in `Find.svelte` waits a frame for it).
