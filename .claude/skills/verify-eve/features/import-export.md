# Import and export

A person brings notes in from another app by dropping files or a whole folder (an Obsidian vault, a Notion export)
on the sidebar, and takes a note out as Markdown, PDF or a picture. Dropping works in the web build; the pickers and
the save panel are the Tauri shell's, so here they do nothing.

## Sub-features

- `import-files`: `.md` files dropped on the list become notes at its end ("Import into the list" while over it);
  Obsidian's `[[link]]`, `==highlight==` and `> [!warning]` callouts are read as such.
- `import-folder`: a folder dropped on the list becomes a page of its name, its files pages under it, `Trip.md` beside
  `Trip/` that note's sub-pages; Notion's ` 0123…cdef` id is left off a name; a relative link to another file becomes
  a `[[link]]` (to `Plan 2` when a `Plan` is already there).
- `import-pick`: the `+` menu's Import files… / Import folder… open Finder's pickers (not proved here: `pickFiles` /
  `pickFolders` return nothing without Tauri; clicking them does nothing; `src/lib/importTree.dom.test.ts` covers what
  they hand on).
- `export-note`: ⋯ → Export as Markdown… / PDF… / image…, ⌘⇧M / ⌘⇧P / ⌘⌥P save the open note (not proved here: the save
  panel and the PDF / image printing are Tauri commands, `pickSavePath` returns null in a browser, so nothing happens and
  no error shows; on a phone the file goes to Android's share sheet, also Tauri; no test covers it).

## How to get to it (user POV)

- Drag files or a folder from Finder onto the sidebar list (onto a row: into that page); onto the note: a picture or
  PDF is attached, a text file opens as a new note.
- The top bar's `+` (`New`) → Import files… / Import folder….
- The note's ⋯ → Export as Markdown… / PDF… / image…; ⌘⇧M, ⌘⇧P, ⌘⌥P.

## Driving it with drive.mjs

Preconditions: the default three notes.

A drop is a `DataTransfer` of real `File`s dispatched as `dragover` then `drop` on `aside .tree` (as Finder hands it
over). A folder needs directory entries, which a page cannot make, so `DataTransferItem.prototype.webkitGetAsEntry`
is stood in for during that one drop; the app's own walk (`droppedFiles`) and `importTree` run as they are.

```js
const dropOn = (t, sel, files, folders) => t.page.evaluate(async ({ sel, files, folders }) => {
  const dt = new DataTransfer();
  for (const [name, text] of files) dt.items.add(new File([text], name, { type: 'text/markdown' }));
  const restore = DataTransferItem.prototype.webkitGetAsEntry;
  if (folders) {
    const fileEntry = (name, text) => ({ isFile: true, isDirectory: false, name, file: (ok) => ok(new File([text], name, { type: 'text/markdown' })) });
    const dirEntry = (name, tree) => ({ isFile: false, isDirectory: true, name, createReader: () => { let done = false; return { readEntries: (ok) => { ok(done ? [] : Object.entries(tree).map(([n, v]) => typeof v === 'string' ? fileEntry(n, v) : dirEntry(n, v))); done = true; } }; } });
    const roots = Object.entries(folders).map(([n, v]) => dirEntry(n, v));
    dt.items.add(new File([''], Object.keys(folders)[0], { type: '' }));
    let i = 0;
    DataTransferItem.prototype.webkitGetAsEntry = function () { return roots[i++] ?? null; };
  }
  const el = document.querySelector(sel), r = el.getBoundingClientRect();
  const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 40, clientY: r.bottom - 20 };
  el.dispatchEvent(new DragEvent('dragenter', at));
  el.dispatchEvent(new DragEvent('dragover', at));
  await new Promise((r) => setTimeout(r, 50));
  const hint = document.body.innerText.match(/Import [^\n]*/)?.[0];
  el.dispatchEvent(new DragEvent('drop', at));
  await new Promise((r) => setTimeout(r, 800));
  DataTransferItem.prototype.webkitGetAsEntry = restore;
  return hint;
}, { sel, files, folders });
```

- **Files.** `await dropOn(t, 'aside .tree', [['Ideas.md', '# Ideas\n\nSee [[Reading list]] and ==this==.\n\n> [!warning] Careful\n> it is a callout\n'], ['Loose thought.md', 'no heading here\n']]);`
  returns `Import into the list`; the rows end `Ideas`, `Loose thought` (each with an icon); opened, Ideas shows a
  link, a highlight and a warning callout, and its markdown is as dropped.
- **Folder.** `await dropOn(t, 'aside .tree', [], { Vault: { 'Trip.md': '# Trip\n\nSee [the plan](Trip/Plan.md).\n', Trip: { 'Plan.md': '# Plan for the trip\n\nday one\n', 'Packing 0123456789abcdef0123456789abcdef.md': 'socks\n' } } });`
  The sidebar shows Vault › Trip › Packing, Plan 2, indented; Trip's markdown is `See [[Plan 2|the plan]].`
- **Pickers and export (web).** `await t.click('button[aria-label="New"]')` lists `Import files…`, `Import folder…`;
  clicking one, ⌘⇧M, or ⋯ → `Export as Markdown…` leaves no dialog and no new note.

## Gotchas

- Drop on `aside .tree` near its bottom (`r.bottom - 20`): on a row it imports into that page instead.
- A file's name is its note's title; a heading of another name stays as its first line (`Plan.md` with
  `# Plan for the trip` is the page `Plan`, or `Plan 2` if a Plan exists).
- Google Keep Takeout (`.json` per note) goes the same way; `src/lib/keepImport.dom.test.ts` covers its reading.
- New imported notes get a random icon (Settings → General); match rows with `includes`.
