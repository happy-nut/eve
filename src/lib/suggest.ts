/**
 * The `[[` picker as a tree. A page in the list can be opened to show the sections inside it, so a
 * link to `Title#Section` is → ↓ ↩ rather than a `#` typed from memory — the headings of a note you
 * have not opened in a month are exactly the ones you cannot recall.
 *
 * The arithmetic lives here rather than in the component because it is the part that can be wrong:
 * the cursor has to keep its place while rows appear and vanish underneath it.
 */

/** Anything the picker can open: an item carrying the items nested under it. */
export interface Branch<T> {
  sections?: T[];
}

/** One visible line. `top` is the index of the page it belongs to, open or not. */
export interface Row<T> {
  item: T;
  top: number;
  child: boolean;
}

/** Every visible row, in order: each page, followed by its sections while it is open. */
export function rows<T extends Branch<T>>(items: T[], open: ReadonlySet<number>): Row<T>[] {
  return items.flatMap((item, top) =>
    open.has(top) && item.sections?.length
      ? [{ item, top, child: false }, ...item.sections.map((s) => ({ item: s, top, child: true }))]
      : [{ item, top, child: false }],
  );
}

/**
 * Opening the page under the cursor. It keeps its place — the sections appear below it — so the
 * cursor does not move. Null means there was nothing to open and the key belongs to the editor.
 */
export function expand<T extends Branch<T>>(items: T[], open: ReadonlySet<number>, sel: number) {
  const row = rows(items, open)[sel];
  if (!row || row.child || !row.item.sections?.length || open.has(row.top)) return null;
  return { open: new Set(open).add(row.top), sel };
}

/**
 * Closing the page under the cursor — or, from a section, the page that section belongs to, which is
 * where the cursor then lands. Null means nothing was open.
 */
export function collapse<T extends Branch<T>>(items: T[], open: ReadonlySet<number>, sel: number) {
  const row = rows(items, open)[sel];
  if (!row || !open.has(row.top)) return null;
  const next = new Set(open);
  next.delete(row.top);
  // the list just shrank: find the page again rather than assuming the index held
  return { open: next, sel: rows(items, next).findIndex((r) => r.top === row.top) };
}
