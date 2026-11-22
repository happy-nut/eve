
export interface Branch<T> {
  sections?: T[];
}

export interface Row<T> {
  item: T;
  top: number;
  child: boolean;
  key: string;
}

export function rows<T extends Branch<T>>(items: T[], open: ReadonlySet<number>): Row<T>[] {
  return items.flatMap((item, top) =>
    open.has(top) && item.sections?.length
      ? [{ item, top, child: false, key: `${top}` }, ...item.sections.map((s, j) => ({ item: s, top, child: true, key: `${top}.${j}` }))]
      : [{ item, top, child: false, key: `${top}` }],
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
