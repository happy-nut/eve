# Present

A person shows a note as slides: it is cut at its biggest headings, a flowchart on a slide draws itself in a box a
press, the slides are walked with keys or clicks (taps on a phone), the last one is followed by an "End of
presentation" screen, and Esc gives the note back with the keyboard in it.

## Sub-features

- `present-open`: ⋯ → Present, or ⇧⌘↩, starts on the first slide (`1 / 3`), the note's title as a cover.
- `present-here`: ⌥⌘↩ starts on the slide the caret is in.
- `present-walk`: → / Space / a click on the right two thirds go on; ← / a click on the left third go back;
  Home to the first; a flowchart's boxes come in one a press before the page turns; past the last slide, "End of
  presentation".
- `present-leave`: Esc (or ✕, `End the presentation`) closes it; the keyboard is back in the note, which is unchanged.
- `present-phone`: on a phone, ⋯ (`More`) → Present in the sheet; a tap turns the page; ✕ leaves.

## How to get to it (user POV)

- The note's ⋯ (top right) → Present; ⇧⌘↩; ⌥⌘↩ from the caret's slide (both rebindable in Settings → Shortcuts).
- In the slides: keys as above, F or the corner button for the whole screen, a click on a drawn chart to look at it
  close up (Esc back to the whole).
- Settings → Appearance → Presenting: the page turn (slide, fade, zoom, none) and lines coming in one by one.

## Driving it with drive.mjs

Preconditions: one note, `# Talk` / `What this is about.` / `## The flow` with a ```mermaid
`flowchart LR` of three boxes / `## Last part` / `The last words.`; wait for `.tiptap .mermaid-view svg g.node` and
~2.5 s for the note's own chart to draw in. Run: `node .claude/skills/verify-eve/drives/run.mjs present`.

- `present-open` **Open.** `await t.click('.note-more'); await t.click('[role="menuitem"]:has-text("Present")'); await t.page.waitForSelector('.present .slide h1');`
  `.present .count` reads `1 / 3`, the slide's heading `Talk`.
- `present-walk` **Walk.** `await t.key('ArrowRight')` (wait ~700 ms each): `2 / 3` `The flow`; → and Space: all three boxes shown
  (`[...document.querySelectorAll('.present .slide g.node')]` with opacity ≠ 0), still `2 / 3`; → `3 / 3`
  `Last part`; `t.page.mouse.click(1100, 750)` (right, below the words): `.present .end` is there, the count `End`;
  ← back to `3 / 3`; `t.page.mouse.click(100, 450)` (left third) `2 / 3`; Home `1 / 3`.
- `present-leave` **Leave.** `await t.key('Escape')`: `.present` gone, `document.activeElement` inside `.tiptap`.
- `present-open` `present-here` `present-leave` **Keys.** `await t.key(`${t.mod}+Shift+Enter`)` starts at `1 / 3`; `await t.click('button[aria-label="End the presentation"]')`
  leaves; `await t.click('.tiptap p:has-text("The last words.")'); await t.key(`${t.mod}+Alt+Enter`);` starts at
  `3 / 3` `Last part`.
- `present-phone` **Phone.** With `--phone`: `await t.page.locator('button[aria-label="More"]:visible').tap(); await t.page.locator('.sheet :text-is("Present")').tap();`
  then `t.page.touchscreen.tap(330, 500)` turns the page (a one-slide note goes to End),
  `await t.page.locator('button[aria-label="End the presentation"]').tap()` leaves.

## Gotchas

- A click on a drawn chart zooms into it instead of turning the page: click where there is no drawing (below the words
  on a text slide) to prove click-to-turn.
- The slides are copies: the note's own diagram is never left half drawn; check the note after leaving, not during.
- `e2e/present.mjs` (`npm run e2e:present`) checks sizes, scrolling a long slide and the whole screen in depth; this
  file is the person's path through it.
- `ArrowRight` on a chart slide is one box, not one slide: count presses by `.present .count`, not by key.
- A flowchart slide opens with its first box only: on three boxes it takes → twice more (or Space) before the next → turns the page.
