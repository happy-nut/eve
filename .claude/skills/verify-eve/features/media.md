# Pictures, link cards and documents

A person puts a picture in a note (from the `/` menu, a paste or a drop), looks at it full size, turns a web address
into a card, and drops a PDF in to read it beside the note.

## Sub-features

- `media-image-menu`: `/image` Enter opens the system's file picker; the picture chosen is in the note at once.
- `media-image-paste`: a picture pasted (a file on the clipboard) goes in at the caret.
- `media-image-viewer`: a double-click (a double tap) shows the picture full size over a dark ground, its alt text
  as a caption; Esc closes it. A single click (tap) opens the picture's menu instead: Copy image, Align left /
  center / right, Delete.
- `media-card`: an address on its own line, the caret in it, ⌥↩ → Show as card makes it a card (title, site);
  the note keeps the bare address, which reads back as a card after a reload.
- `media-pdf`: a PDF dropped on the note is a card (`report.pdf`, `PDF · click to open`), saved as
  `[report.pdf](…)`; a click opens a floating panel titled with its name, with Open outside and Close.
- `media-pdf-page`: **Unchecked:** no drive, no test. The panel's page and the card's first-page picture come from Quick Look in the
  Tauri shell; in WebKit the panel is blank and the card shows a page glyph.
- `media-image-drop`: a picture file dropped on the note goes in where it was dropped, as a PDF does (`handleDrop` →
  `insertFiles`).

## How to get to it (user POV)

- `/image` (⌘⇧I), a paste, or a file dragged from Finder onto the note.
- A double-click on a picture; a single click for its menu.
- ⌥↩ on a link for its menu (Show as card, Open link, Remove link, Copy link).
- A dropped document's card, clicked.

## Driving it with drive.mjs

Preconditions: the default `a.md` and `c.md`; a small `blue.png`, `green.png` and a one-page `report.pdf` made in the
run directory (outside the repository). The file picker is Playwright's `filechooser`, which a person sees as the
system dialog; a paste and a drop are the browser's own `paste` / `dragenter`+`dragover`+`drop` events carrying a
`DataTransfer` with the file, dispatched on the last `.tiptap > p` (WebKit's clipboard takes no image from a test). Run: `node .claude/skills/verify-eve/drives/run.mjs media`

- `media-image-menu` **Picked.** `await t.click('.tiptap > p:last-of-type'); await t.key('Enter'); await t.type('/image'); await t.page.waitForSelector('.suggest li');`
  `const chooser = t.page.waitForEvent('filechooser'); await t.key('Enter'); await (await chooser).setFiles(png);`
  One `.tiptap img`; the markdown has `![](data:image/png;base64,…)` (the web build keeps a picture inside the note).
- `media-image-viewer` **Viewer.** `await t.page.locator('.tiptap img').first().dblclick(); await t.page.waitForSelector('.viewer');`
  the picture fills the window over a dark ground. `await t.key('Escape')`: `.viewer` is gone.
- `media-image-paste` **Pasted.** `p.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))`
  with `green.png` in `dt`: two `.tiptap img`, two `![](data:…)` lines.
- `media-image-drop` **Dropped.** The same `dragenter`, `dragover`, `drop` with `red.png`: three `.tiptap img`, three `![](data:…)` lines.
- `media-pdf` **PDF.** On a new line, dispatch `dragenter`, `dragover`, `drop` with `report.pdf` in the `dataTransfer`: one
  `.tiptap .pdf-card`; the markdown has `[report.pdf](blob:…)`. `await t.click('.tiptap .pdf-card')`: `.pdf-panel`
  shows `report.pdf` in its bar.
- `media-card` **Card.** `await t.type('https://example.com '); await t.key('Backspace'); await t.key('ArrowLeft'); await t.key('Alt+Enter');`
  the menu lists `Show as card`, `Open link ⌘↩`, `Remove link`, `Copy link`;
  `await t.click('button[role="menuitem"]:has-text("Show as card")')`: an `a.bookmark` card reading `example.com`;
  the markdown line stays `https://example.com`; after `t.page.reload()` it is still a card.
- `media-image-viewer` **Phone.** Seed `![a blue box](data:image/png;base64,…)`. `t.page.locator('.tiptap img').tap()` opens the picture's
  menu as a bottom sheet; a tap on the dimmed note above it (`t.page.touchscreen.tap(195, 450)`) closes it;
  `t.page.locator('.tiptap img').dblclick()` shows the viewer with `a blue box` under the picture.

Proved on 2026-11-17 (0.7.147): `mac-01-image-picked`, `mac-02-viewer`, `mac-03-pasted`, `mac-04-pdf-card`,
`mac-05-pdf-panel`, `mac-01-menu` and `mac-02-card` / `mac-03-card-reloaded` (the card run),
`phone-01-image-menu`, `phone-02-viewer`.

## Gotchas

- The first time a run opens a PDF, Vite may optimise the viewer's code and reload the page, losing the click: the
  first run showed no panel, the next ones did. Run again before calling the panel broken.
- Several dev servers at once can each find the PDF viewer's code new and reload the page mid-run; `drives/media.mjs` loads `/src/PdfViewer.svelte` once before its steps so that reload comes first.
- A web build stores a dropped PDF as a `blob:` address, which is gone after a reload; the Mac app copies it into
  `assets/`. Do not check a PDF across a reload here.
- The card's title is only the host in WebKit: the page's metadata is fetched by the browser and refused by CORS
  (the run ends with `errors: 9`, the CORS lines for example.com). The Mac app fetches it through Tauri and shows
  the page's title, description and picture: not proved here.
- Two touchscreen taps in a row did not make a double tap in WebKit, and the sheet stays until something is tapped
  outside it; use `dblclick()` for the phone's double tap.
- A click on a picture waits 260 ms to see whether a second click follows before its menu opens.
- The picture's menu is still up for a moment after Esc; a click on the note before it is gone only closes it. Wait for `[role="menuitem"]` to be detached first.
