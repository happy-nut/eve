import type { Note, PropValue } from './notes.svelte';

/**
 * A database (Notion's): the pages under one page are its rows, each row's properties lines of its own frontmatter
 * (`Status: Doing`), and the page holds what the table is — its properties' kinds and choices, the view, its sort
 * and filter — as a ```database fence of JSON. Every part stays a plain file another app reads.
 *
 * A relation is a list of [[links]] (`Projects: ["[[Eve]]"]`, as Obsidian writes them); a rollup and a formula are
 * worked out from the rest each time they are shown and are no line of any file (Notion's are not stored either).
 */
export type PropType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'checkbox' | 'relation' | 'rollup' | 'formula';
export type RollupFn = 'count' | 'sum' | 'average' | 'min' | 'max' | 'list' | 'checked';
export interface PropDef {
  name: string; type: PropType; options?: string[];
  /** relation: the page whose database it links into ('' or none: any page) */
  target?: string;
  /** rollup: the relation it reads through, the property of the pages linked, and what it makes of them */
  relation?: string; of?: string; fn?: RollupFn;
  /** formula: Notion's, `prop("Due")`, `if(prop("Done"), "✓", "")`, `prop("Price") * 2` (formula.ts) */
  expr?: string;
}
export type ViewKind = 'table' | 'board' | 'calendar' | 'gallery';
export interface DbSchema {
  title: string;
  props: PropDef[];
  view: ViewKind;
  /** the board's columns: a select property's choices */
  groupBy?: string;
  /** the calendar's days: a date property */
  dateBy?: string;
  sort?: { by: string; desc?: boolean };
  /** rows whose property `by` is `is` (one of a select's choices, a tag, "checked") */
  filter?: { by: string; is: string };
}
export const TYPES: { type: PropType; label: string }[] = [
  { type: 'text', label: 'Text' }, { type: 'number', label: 'Number' }, { type: 'select', label: 'Select' },
  { type: 'multi', label: 'Tags' }, { type: 'date', label: 'Date' }, { type: 'checkbox', label: 'Checkbox' },
  { type: 'relation', label: 'Relation' }, { type: 'rollup', label: 'Rollup' }, { type: 'formula', label: 'Formula' },
];
export const ROLLUPS: { fn: RollupFn; label: string }[] = [
  { fn: 'count', label: 'Count' }, { fn: 'sum', label: 'Sum' }, { fn: 'average', label: 'Average' }, { fn: 'min', label: 'Min' },
  { fn: 'max', label: 'Max' }, { fn: 'list', label: 'Show the values' }, { fn: 'checked', label: 'Percent checked' },
];
export const VIEWS: { view: ViewKind; label: string }[] = [
  { view: 'table', label: 'Table' }, { view: 'board', label: 'Board' }, { view: 'calendar', label: 'Calendar' }, { view: 'gallery', label: 'Gallery' },
];
/** the column every table has: the row's title, which is its page's */
export const NAME = 'Name';
/** kinds worked out each time, never written in a row's file */
export const computed = (t: PropType) => t === 'rollup' || t === 'formula';

export const defaultDb = (): DbSchema => ({
  title: 'Untitled database',
  props: [{ name: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'] }, { name: 'Due', type: 'date' }],
  view: 'table',
});

const isType = (t: unknown): t is PropType => TYPES.some((x) => x.type === t);
const isFn = (t: unknown): t is RollupFn => ROLLUPS.some((x) => x.fn === t);
/** null when the text is no database (bad JSON or shape): the fence then stays code, nothing lost */
export function parseDb(text: string): DbSchema | null {
  let d: any;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.props)) return null;
  const props: PropDef[] = [];
  for (const p of d.props) {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || !isType(p.type)) return null;
    props.push({
      name: p.name, type: p.type,
      ...(Array.isArray(p.options) ? { options: p.options.map(String) } : {}),
      ...(typeof p.target === 'string' ? { target: p.target } : {}),
      ...(typeof p.relation === 'string' ? { relation: p.relation } : {}),
      ...(typeof p.of === 'string' ? { of: p.of } : {}),
      ...(isFn(p.fn) ? { fn: p.fn } : {}),
      ...(typeof p.expr === 'string' ? { expr: p.expr } : {}),
    });
  }
  return {
    title: typeof d.title === 'string' ? d.title : '',
    props,
    view: VIEWS.some((v) => v.view === d.view) ? d.view : 'table',
    ...(typeof d.groupBy === 'string' ? { groupBy: d.groupBy } : {}),
    ...(typeof d.dateBy === 'string' ? { dateBy: d.dateBy } : {}),
    ...(d.sort && typeof d.sort.by === 'string' ? { sort: { by: d.sort.by, ...(d.sort.desc ? { desc: true } : {}) } } : {}),
    ...(d.filter && typeof d.filter.by === 'string' && typeof d.filter.is === 'string' ? { filter: { by: d.filter.by, is: d.filter.is } } : {}),
  };
}
export const serializeDb = (d: DbSchema): string => JSON.stringify(d, null, 2);

/** the words a row's property reads as (a list joined, a checkbox ✓, a relation its pages' titles) */
export function shown(v: PropValue | undefined, type: PropType): string {
  if (v === undefined) return '';
  if (type === 'relation') return linksIn(v).join(', ');
  if (Array.isArray(v)) return v.join(', ');
  return type === 'checkbox' ? (v === 'true' ? '✓' : '') : v;
}
export const asList = (v: PropValue | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : v ? [v] : []);
/** a relation's pages, by title: `[[Eve]]` (and a bare title written by hand) */
export const linksIn = (v: PropValue | undefined): string[] => asList(v).map((x) => /^\[\[(.*?)(\|.*)?\]\]$/.exec(x.trim())?.[1] ?? x.trim()).filter(Boolean);
export const asLink = (title: string) => `[[${title}]]`;

/** does a row pass the filter (`value` reads a computed property) */
export function passes(n: Pick<Note, 'props'>, f: DbSchema['filter'], value?: (by: string) => string): boolean {
  if (!f) return true;
  const v = n.props?.[f.by];
  if (f.is === 'checked') return v === 'true';
  if (value && v === undefined) { const x = value(f.by); return f.is === '' ? !x : x === f.is; }
  if (f.is === '') return asList(v).length === 0; // "is empty"
  return asList(v).includes(f.is);
}

/**
 * The rows as the view shows them: filtered, then sorted by the property (a number as a number, a date or words as
 * written, an empty one last either way), else in the order the rows were made. `key` reads a property as its words
 * (a rollup's or a formula's worked out).
 */
export function viewRows<T extends Pick<Note, 'props' | 'order'>>(rows: readonly T[], d: DbSchema, title: (r: T) => string, key?: (r: T, by: string) => string): T[] {
  const out = rows.filter((r) => passes(r, d.filter, key ? (by) => key(r, by) : undefined));
  const s = d.sort;
  if (!s) return out.sort((a, b) => a.order - b.order);
  const def = d.props.find((p) => p.name === s.by);
  const read = (r: T) => (s.by === NAME ? title(r) : key ? key(r, s.by) : shown(r.props?.[s.by], def?.type ?? 'text'));
  const numeric = def?.type === 'number' || def?.type === 'rollup' || def?.type === 'formula';
  return out.sort((a, b) => {
    const x = read(a), y = read(b);
    if (!x || !y) return x === y ? 0 : x ? -1 : 1; // empty last, ascending or not
    const c = numeric && !isNaN(+x) && !isNaN(+y) ? +x - +y : x.localeCompare(y);
    return s.desc ? -c : c;
  });
}

/** the board's columns: each choice of the property it is grouped by, and the rows with none (first) */
export function columnsOf<T extends Pick<Note, 'props'>>(rows: readonly T[], prop: PropDef | undefined): { value: string; rows: T[] }[] {
  if (!prop) return [{ value: '', rows: [...rows] }];
  const choices = prop.options ?? [];
  const cols = [{ value: '', rows: [] as T[] }, ...choices.map((value) => ({ value, rows: [] as T[] }))];
  for (const r of rows) {
    const v = asList(r.props?.[prop.name])[0] ?? '';
    (cols.find((c) => c.value === v) ?? cols[0]).rows.push(r);
  }
  return cols;
}

/** the calendar's days: each row on the day its date property says (a date and time: the day), by day */
export function byDay<T extends Pick<Note, 'props'>>(rows: readonly T[], prop: string | undefined): Map<string, T[]> {
  const days = new Map<string, T[]>();
  if (!prop) return days;
  for (const r of rows) {
    const v = r.props?.[prop];
    const day = typeof v === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] : undefined;
    if (day) (days.get(day) ?? days.set(day, []).get(day)!).push(r);
  }
  return days;
}

/** a choice the rows carry that the property does not list yet (typed on another device, or by hand): added */
export function withChoice(d: DbSchema, name: string, choice: string): DbSchema {
  return { ...d, props: d.props.map((p) => (p.name === name && !(p.options ?? []).includes(choice) ? { ...p, options: [...(p.options ?? []), choice] } : p)) };
}

/**
 * A rollup: what the pages a relation links to say in one property (or their titles), made into one value. Numbers
 * read as numbers; a value no page has is left out. '' when there is nothing to make it of.
 */
export function rollup(values: string[], fn: RollupFn = 'count'): string {
  // numbers when every value written is one (an empty one is no 0)
  const written = values.filter((v) => v.trim() !== '');
  const nums = written.length && written.every((v) => !isNaN(Number(v))) ? written.map(Number) : [];
  const fmt = (x: number) => String(Math.round(x * 100) / 100);
  switch (fn) {
    case 'count': return String(values.length);
    case 'list': return values.filter(Boolean).join(', ');
    case 'checked': return values.length ? `${Math.round((values.filter((v) => v === 'true').length / values.length) * 100)}%` : '';
    case 'sum': return nums.length ? fmt(nums.reduce((a, b) => a + b, 0)) : '';
    case 'average': return nums.length ? fmt(nums.reduce((a, b) => a + b, 0) / nums.length) : '';
    case 'min': return nums.length ? fmt(Math.min(...nums)) : values.filter(Boolean).sort()[0] ?? '';
    case 'max': return nums.length ? fmt(Math.max(...nums)) : values.filter(Boolean).sort().at(-1) ?? '';
  }
}
