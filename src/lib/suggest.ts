
export interface Branch<T> {
  sections?: T[];
}

export interface Row<T> {
  item: T;
  top: number;
  child: boolean;
}

export function rows<T extends Branch<T>>(items: T[], open: ReadonlySet<number>): Row<T>[] {
  return items.flatMap((item, top) =>
    open.has(top) && item.sections?.length
      ? [{ item, top, child: false }, ...item.sections.map((s) => ({ item: s, top, child: true }))]
      : [{ item, top, child: false }],
  );
}

export function expand<T extends Branch<T>>(items: T[], open: ReadonlySet<number>, sel: number) {
  const row = rows(items, open)[sel];
  if (!row || row.child || !row.item.sections?.length || open.has(row.top)) return null;
  return { open: new Set(open).add(row.top), sel };
}

export function collapse<T extends Branch<T>>(items: T[], open: ReadonlySet<number>, sel: number) {
  const row = rows(items, open)[sel];
  if (!row || !open.has(row.top)) return null;
  const next = new Set(open);
  next.delete(row.top);
  return { open: next, sel: rows(items, next).findIndex((r) => r.top === row.top) };
}
