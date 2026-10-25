import type { Note, PropValue } from './notes.svelte';

/**
 * A database (Notion's): the pages under one page are its rows, each row's properties lines of its own frontmatter
 * (`Status: Doing`), and the page holds what the table is — its properties' kinds and choices, the view, its sort
 * and filter — as a ```database fence of JSON. Every part stays a plain file another app reads.
 */
export type PropType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'checkbox';
export interface PropDef { name: string; type: PropType; options?: string[] }
export interface DbSchema {
  title: string;
  props: PropDef[];
  view: 'table' | 'board';
  /** the board's columns: a select property's choices */
  groupBy?: string;
  sort?: { by: string; desc?: boolean };
  /** rows whose property `by` is `is` (one of a select's choices, a tag, "checked") */
  filter?: { by: string; is: string };
}
export const TYPES: { type: PropType; label: string }[] = [
  { type: 'text', label: 'Text' }, { type: 'number', label: 'Number' }, { type: 'select', label: 'Select' },
  { type: 'multi', label: 'Tags' }, { type: 'date', label: 'Date' }, { type: 'checkbox', label: 'Checkbox' },
];
/** the column every table has: the row's title, which is its page's */
export const NAME = 'Name';

export const defaultDb = (): DbSchema => ({
  title: 'Untitled database',
  props: [{ name: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'] }, { name: 'Due', type: 'date' }],
  view: 'table',
});

const isType = (t: unknown): t is PropType => TYPES.some((x) => x.type === t);
/** null when the text is no database (bad JSON or shape): the fence then stays code, nothing lost */
export function parseDb(text: string): DbSchema | null {
  let d: any;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.props)) return null;
  const props: PropDef[] = [];
  for (const p of d.props) {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || !isType(p.type)) return null;
    props.push({ name: p.name, type: p.type, ...(Array.isArray(p.options) ? { options: p.options.map(String) } : {}) });
  }
  return {
    title: typeof d.title === 'string' ? d.title : '',
    props,
    view: d.view === 'board' ? 'board' : 'table',
    ...(typeof d.groupBy === 'string' ? { groupBy: d.groupBy } : {}),
    ...(d.sort && typeof d.sort.by === 'string' ? { sort: { by: d.sort.by, ...(d.sort.desc ? { desc: true } : {}) } } : {}),
    ...(d.filter && typeof d.filter.by === 'string' && typeof d.filter.is === 'string' ? { filter: { by: d.filter.by, is: d.filter.is } } : {}),
  };
}
export const serializeDb = (d: DbSchema): string => JSON.stringify(d, null, 2);

/** the words a row's property reads as (a list joined, a checkbox ✓) */
export function shown(v: PropValue | undefined, type: PropType): string {
  if (v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return type === 'checkbox' ? (v === 'true' ? '✓' : '') : v;
}
const asList = (v: PropValue | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : v ? [v] : []);

/** does a row pass the filter */
export function passes(n: Pick<Note, 'props'>, f: DbSchema['filter']): boolean {
  if (!f) return true;
  const v = n.props?.[f.by];
  if (f.is === 'checked') return v === 'true';
  if (f.is === '') return asList(v).length === 0; // "is empty"
  return asList(v).includes(f.is);
}

/**
 * The rows as the view shows them: filtered, then sorted by the property (a number as a number, a date or words as
 * written, an empty one last either way), else in the order the rows were made.
 */
export function viewRows<T extends Pick<Note, 'props' | 'order'>>(rows: readonly T[], d: DbSchema, title: (r: T) => string): T[] {
  const out = rows.filter((r) => passes(r, d.filter));
  const s = d.sort;
  if (!s) return out.sort((a, b) => a.order - b.order);
  const type = s.by === NAME ? 'text' : d.props.find((p) => p.name === s.by)?.type ?? 'text';
  const key = (r: T) => (s.by === NAME ? title(r) : shown(r.props?.[s.by], type));
  return out.sort((a, b) => {
    const x = key(a), y = key(b);
    if (!x || !y) return x === y ? 0 : x ? -1 : 1; // empty last, ascending or not
    const c = type === 'number' && !isNaN(+x) && !isNaN(+y) ? +x - +y : x.localeCompare(y);
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

/** a choice the rows carry that the property does not list yet (typed on another device, or by hand): added */
export function withChoice(d: DbSchema, name: string, choice: string): DbSchema {
  return { ...d, props: d.props.map((p) => (p.name === name && !(p.options ?? []).includes(choice) ? { ...p, options: [...(p.options ?? []), choice] } : p)) };
}
