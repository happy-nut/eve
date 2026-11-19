# Equations

A person puts a formula in a line or on a line of its own without writing TeX: picked from a row of parts or typed as
it looks, drawn where it sits, edited by a click on it. The note keeps `$…$` and `$$…$$`, as Obsidian and GitHub read.

## Sub-features

- `math-block-new`: `/equation` Enter opens an empty block with a row of parts (Basic, Symbols, Calculus, Greek,
  Matrix, TeX, Done); parts clicked and keys typed build it (Fraction, `1`, Tab, `2`, Tab, `+`, Greek → π);
  Done draws it; saved as `$$` / `\dfrac{1}{2}+\pi` / `$$`.
- `math-inline-typed`: `$a+b$` typed in a line becomes a drawn formula at the closing `$`; saved as `$a+b$`.
- `math-edit`: a click on a drawn formula opens it again with the row of parts beside it; typing goes in where it
  was clicked; Esc (or Done, or a click elsewhere) closes it and the note has the change.
- `math-tex`: the row's TeX button shows the formula as TeX in a text box; what is typed there replaces it
  (`\sqrt{x}`), drawn when closed.
- `math-kept`: the formulas are the same after a reload.

## How to get to it (user POV)

- `/equation` (block) or `/inline` (in a line); `$…$` typed in a line, `$$` and a space at a line's start.
- A click (a tap) on any drawn formula.
- A phone: the same, with MathLive's own keyboard over the system one, and the row's tabs shown as icons
  (x², ±≤, ∑∫, αβ, [ ]).

## Driving it with drive.mjs

Preconditions: `a.md` is `# Sums` / `Half:`; `c.md` as the default. The field is open when
`.tiptap math-field` exists; closed when it is gone (`waitForFunction(() => !document.querySelector('.tiptap math-field'))`). Run: `node .claude/skills/verify-eve/drives/run.mjs math`

- `math-block-new` **Block.** `await t.click('.tiptap > p:last-of-type'); await t.key('Enter'); await t.type('/equation'); await t.page.waitForSelector('.suggest li'); await t.key('Enter');`
  wait for `.tiptap math-field`, then `await t.click('.tiptap .math-edit .part[aria-label="Fraction"]'); await t.type('1'); await t.key('Tab'); await t.type('2'); await t.key('Tab'); await t.type('+');`
  `await t.click('.tiptap .math-edit button[role="tab"]:has-text("Greek")'); await t.click('.tiptap .math-edit .part[aria-label="pi"]');`
  The block shows ½ + π with the Greek tab open; `await t.click('.tiptap .math-edit .done')`: drawn, and the markdown
  has `$$\n\dfrac{1}{2}+\pi\n$$`.
- `math-inline-typed` **Inline.** `await t.key('Enter'); await t.type('Area is $a+b$ here');` one `.tiptap .math-inline`, drawn in
  italic maths type; the markdown line is `Area is $a+b$ here`.
- `math-edit` **Edit.** `await t.click('.tiptap .math-inline')`, wait for the field, `await t.type('+c'); await t.key('Escape');`
  the line is `Area is $a+c+b$ here` (the click put the caret mid-formula).
- `math-tex` **TeX.** `await t.click('.tiptap .math-block')`, wait, `await t.click('.tiptap .math-edit .texb'); await t.page.locator('.tiptap .math-edit .texin').fill('\\sqrt{x}');`
  Esc: the block draws √x and saves `$$\n\sqrt{x}\n$$`.
- `math-kept` **Kept.** `await t.page.reload(); await t.page.waitForSelector('.tiptap .math-block .ML__latex')`: the markdown is
  unchanged.
- `math-block-new` `math-edit` **Phone.** Seed `$$\nx\n$$` and `Area is $a$ here`; `t.page.locator('.tiptap .math-block').tap()`, mimic the
  keyboard (390×470), tap `.math-edit .part[aria-label="Fraction"]`, type `1` Tab `2`, tap `.math-edit .done`:
  saved `x\dfrac{1}{2}`. A tap on `.math-inline` opens it with the row above the line and MathLive's keyboard below.

Proved on 2026-11-17 (0.7.147): `mac-01-block-editing`, `mac-02-drawn`, `mac-03-inline-editing`, `mac-04-tex`,
`mac-05-edited` (and the reload's markdown), `phone-01-block-editing`, `phone-02-inline-editing`, `phone-03-done`.

## Gotchas

- `e2e/math.mjs` runs in Chromium; drive.mjs proves the same steps in WebKit.
- MathLive takes a key a moment after it is pressed: wait ~250 ms before reading the markdown.
- A tap or click on a formula puts the caret where it landed, not at its end; `e2e/math.mjs` presses `End` in the
  field first to add at the end (not tried in this drive).
- Done after `/equation` and one Enter leave an empty line between the block and the next text, saved as a line
  holding a single space.
- On a phone the row of parts for an inline formula sits above its line, over the lines before it (there `Half:` and
  the block), because MathLive's keyboard takes the space below.
