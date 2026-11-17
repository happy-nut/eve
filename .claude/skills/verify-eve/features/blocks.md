# Blocks

A person shapes a note with Notion's blocks while the file stays Obsidian's markdown: callouts, toggles, lists that
nest as a document numbers them, code, highlighted and coloured words.

## Sub-features

- `block-callout-read`: a note holding `> [!warning] Careful` / `> mind the step` shows an orange box with ⚠️, the
  title `Careful` in bold and the body under it; the file keeps the word `warning`.
- `block-callout-new`: `/callout` Enter puts a 💡 box with the caret in it; saved as `> [!💡]` / `> boxed words`.
- `block-toggle`: `> ` at a line's start is a toggle (not a quote); its first line is the title, Enter goes into
  its body; the ▸ button folds it and the note saves `<details>` without `open`.
- `block-list-nest`: `1. one`, Enter, Tab, Enter, Tab numbers the levels `1.` → `a.` → `i.`; saved as nested `1.`
  lists. On a phone the bar's Indent button does what Tab does.
- `block-code`: ```` ``` ```` Enter opens a code block; ↓ twice leaves it; saved as a fenced block.
- `block-highlight`: `==bright==` typed becomes highlighted (yellow) at the second `==`; saved as `==bright==`. On a
  phone the bar's Highlight button turns it on for what is typed next.
- `block-color`: words, then `/red` Enter at the line's end colour the line's words red; saved as
  `<span style="color: #c4302b">…</span>`.

## How to get to it (user POV)

- The `/` menu (`/callout`, `/toggle`, `/code`, `/red`, `/color`); Notion's typing rules (`> `, `1. `,
  ```` ``` ````, `==…==`); Tab / ⇧Tab in a list.
- A phone: the bar above the keyboard (To-do, Bold, Highlight, Outdent, Indent, Insert block `/`).
- A callout of Obsidian's kind (`> [!note]`, `[!tip]`, `[!warning]`, `[!danger]`…) arrives in a file, a paste or a
  sync; it is not typed as text.

## Driving it with drive.mjs

Preconditions: `a.md` is `# Plan`, `First line.`, then `> [!warning] Careful` / `> mind the step`; `c.md` as the
default. The typed blocks go in a fresh note (⌘N, `Blocks`, Enter).

- **Callout read.** `.tiptap .callout` has `data-color="orange"`, `.callout-emoji` is ⚠️; `t.shot('callout-read', '.tiptap')`.
- **All typed blocks, one after another.**
  `await t.type('/callout'); await t.page.waitForSelector('.suggest li'); await t.key('Enter'); await t.type('boxed words'); await t.key('Enter'); await t.key('Enter');`
  `await t.type('> '); await t.type('Fold me'); await t.key('Enter'); await t.type('hidden body'); await t.key('Enter'); await t.key('Enter');`
  `await t.type('1. one'); await t.key('Enter'); await t.key('Tab'); await t.type('two'); await t.key('Enter'); await t.key('Tab'); await t.type('three');`
  four Enters to leave the lists, then ```` await t.type('```'); await t.key('Enter'); await t.type('const x = 1;'); ````
  `await t.key('ArrowDown'); await t.key('ArrowDown'); await t.type('a ==bright== word and red');`
  The saved markdown is `> [!💡]` / `> boxed words`, `<details open>` / `<summary>Fold me</summary>` /
  `hidden body`, `1. one` / `   1. two` / `      1. three`, a ```` ``` ```` block, `a ==bright== word and red`.
- **Colour.** `await t.key('Enter'); await t.type('now in red /red'); await t.page.waitForSelector('.suggest li');`
  the first row is `Red` (hint `text color`); `await t.key('Enter')`: the words are `rgb(196, 48, 43)` and saved in a
  `<span style="color: #c4302b">`.
- **Fold.** `await t.click('.tiptap [data-type="details"] > button')`: the body hides, the node loses `is-open`,
  the markdown says `<details>`.
- **Phone.** Tap the last `.tiptap p`, mimic the keyboard (`setViewportSize 390×470`), type `1. one` Enter, tap
  `.mbar button[aria-label="Indent"]`, `two` Enter, Indent, `three`; then four Enters, tap
  `.mbar button[aria-label="Highlight"]` and type `glow`: `1.`/`a.`/`i.` and a yellow `glow`, saved `==glow==`.

Proved on 2026-11-17 (0.7.147): `mac-01-callout-read`, `mac-02-blocks` (every typed block open),
`mac-03-red-menu`, `mac-05-folded` (toggle shut, list levels, code, highlight, red), `phone-01-phone-blocks`,
`phone-02-insert-block` (the bar's `/` opens the block menu as a sheet).

## Gotchas

- In a Mac window ⇧Home selects to the top of the note, not the line's start (WebKit on a Mac host): an Enter then
  replaced the whole note. Click where the caret should go instead of Home/End.
- `.tiptap .callout p` matches the callout's title first: use `.last()` for its body.
- The toggle is a `div[data-type="details"]` with a `<button>` (`aria-label` Collapse / Expand), not a `<details>`.
- `getComputedStyle(ol).listStyleType` is `none` at every level: the `1.` / `a.` / `i.` are drawn by the app. Check
  them in the shot, and the nesting in the markdown.
- `/red` on an empty line colours what is typed next on it, until the caret moves (as Notion colours an empty block):
  the saved line is `<span style="color: #c4302b">typed after</span>`.
- The bar's Insert block types `/` at the caret, inside a mark if one is on: after Highlight it saved `==glow /==`.
