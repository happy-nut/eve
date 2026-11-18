# Links and dates

A person links one note to another as Obsidian writes it (`[[Title]]`, `[[Title|shown as]]`), opens the linked note
with a click, and the links follow when that note is renamed; `@` puts a day in the line as a chip.

## Sub-features

- `link-picker`: `[[` and a few letters list the notes that match, and `<letters> new note` last; Enter (or a tap)
  puts a link to the first in, followed by a space.
- `link-alias`: `[[Reading list|books]]` typed out whole becomes a link that reads `books` and opens Reading list.
- `link-open`: a link clicked opens its note; the opened note says `1 link here` at its head.
- `link-rename`: a linked note's title changed (`Groceries` → `Groceries 2`) changes every `[[…]]` to it, in the
  other notes' saved markdown too.
- `link-date`: `@tomorrow` opens a calendar with that day chosen; Enter (or a day tapped) leaves a chip, saved as
  `@2026-11-18`. `@` is for days only (and `@remind`): there are no people or page mentions.
- `link-video`: a video's address pasted on an empty line plays in the note. YouTube (watch, youtu.be, shorts,
  live, embed) and Vimeo (`vimeo.com/<id>[/<hash>]`, `player.vimeo.com/video/<id>`) are the site's player
  (`.bookmark.video iframe.video-frame`), its title and address under it, saved as the bare address. A video
  file's address (`.mp4`, `.mov`, `.m4v`, `.webm`) is the video block a dropped file is (`figure.vid-fig video`),
  saved as `[name](address)`. In a sentence each stays a link. On the Mac app YouTube's player is a page the app
  serves on 127.0.0.1 (`net.rs` `player_page`): YouTube refuses a `tauri://` page (error 153, no referrer). In
  the Mac app a Vimeo address stays a link card: Vimeo's player there (from `tauri://` or from the 127.0.0.1 page)
  stopped at "copyright problem: playback could not be authorized", its protected playback refused to an app Apple
  has not signed; with WebKit's protected playback turned off it drew nothing. Dailymotion is left out: its player
  answered "Forbidden" even from http.

## How to get to it (user POV)

- `[[` anywhere in a note's text; a link typed out whole with its closing `]]`.
- A click on an underlined link; the sidebar row for a rename's result.
- `@` and a day's name or date (`@tomorrow`, `@2026-09-24`, a bare `@` is today).

## Driving it with drive.mjs

Preconditions: the default notes (Groceries is under Plan, so `[[Gro` has one match).

- **Picker.** `await t.click('.tiptap p'); await t.key('End'); await t.key('Enter'); await t.type('see [[Gro'); await t.page.waitForSelector('.suggest li');`
  The rows are `Groceries` (chosen) and `Gro new note`. `await t.key('Enter')`: a `.tiptap .wikilink` reading
  `Groceries`; the markdown has `see [[Groceries]] ` (the picker adds the space).
- **Alias.** `await t.type(' and [[Reading list|books]] ')`: the second `.wikilink` reads `books`; the markdown keeps
  `[[Reading list|books]]`.
- **Date.** `await t.type('due @tomorrow'); await t.page.waitForSelector('.cal');` the month shows with tomorrow
  chosen. `await t.key('Enter')`: a `.tiptap .datechip` (its label in the host's language, `내일` here); the markdown
  ends `due @2026-11-18`.
- **Open.** `await t.click('.tiptap .wikilink >> nth=1')`: Reading list is open (`.tiptap h1`), with `1 link here`.
  Back by `await t.click('aside [data-row]:has-text("Plan")')`.
- **Rename.** Open Groceries by its link, `await t.click('.tiptap h1'); await t.key('End'); await t.type(' 2'); await t.wait(1500);`
  then back to Plan by its sidebar row: the link reads `Groceries 2` and the saved markdown has `[[Groceries 2]]`.
- **Phone.** `t.page.locator('.tiptap p').last().tap()`, type `see [[Gro`, `t.page.locator('.suggest li').first().tap()`;
  type ` due @`, then `t.page.locator('.cal .cal-day', { hasText: /^20$/ }).first().tap()`: a chip `2026.11.20`;
  `t.page.locator('.tiptap .wikilink').first().tap()` opens Groceries, with `Plan / Groceries` in the bar.

- **Video.** On an empty line, paste through the page: `const dt = new DataTransfer(); dt.setData('text/plain',
  'https://www.youtube.com/watch?v=aqz-KE-bpKQ'); window.__editor.view.dom.dispatchEvent(new ClipboardEvent('paste',
  { clipboardData: dt, bubbles: true, cancelable: true }))`; wait for `iframe.video-frame` and 6 s; the frame from
  `t.page.frames()` whose url has `/embed/` reads the video's title; a click at the frame's centre plays it
  (its `video.currentTime` above 0, `paused` false after 8 s). The same for `https://vimeo.com/76979871`. A video
  file plays in the Mac app (`https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4`), not
  in drive.mjs: Playwright's WebKit has no H.264 (`video.error.code` 4).

Proved on 2026-11-18: `mac-01-pasted`, `mac-02-playing` (Big Buck Bunny, 7.3 s in).
Proved on 2026-11-17 (0.7.147): `mac-01-picker`, `mac-02-alias`, `mac-03-calendar`, `mac-04-datechip`,
`mac-05-alias-opened`, `mac-06-renamed`, `phone-02-linked`, `phone-03-opened`.

## Gotchas

- A YouTube player in a page whose address is not http(s) (`file://`, `tauri://`) shows "error 153": the browser
  sends no referrer. WebKit through drive.mjs is http://localhost, so it plays there either way; the Mac app's own
  page is proved only by its loopback player (`cargo test player`, and a `file://` page framing it).

- Do not use `t.page.goBack()` to return: the page throws `The operation is insecure` and the run is lost. Use the
  sidebar row (Mac) or the bar's back arrow (phone).
- Wait about a second after a title is typed before leaving the note: the rename reaches the other notes when the
  edit is written.
- The picker's trailing space plus one typed makes two spaces; expect `[[Groceries]]  and` in the markdown.
- A date chip's label is in the browser's language (`내일`, `2026.11.20`); check the markdown for the day.
