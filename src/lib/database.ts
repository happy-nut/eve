import type { Note, PropValue } from './notes.svelte';

export type PropType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'checkbox' | 'relation' | 'rollup' | 'formula';
export type RollupFn = 'count' | 'sum' | 'average' | 'min' | 'max' | 'list' | 'checked';
export interface PropDef {
  name: string; type: PropType; options?: string[];
  target?: string;
  relation?: string; of?: string; fn?: RollupFn;
  expr?: string;
}
export type ViewKind = 'table' | 'board' | 'calendar' | 'gallery';
export interface DbSchema {
  title: string;
  props: PropDef[];
  view: ViewKind;
  groupBy?: string;
  dateBy?: string;
  sort?: { by: string; desc?: boolean };
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
export const NAME = 'Name';
export const computed = (t: PropType) => t === 'rollup' || t === 'formula';

export const defaultDb = (): DbSchema => ({
  title: 'Untitled database',
  props: [{ name: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'] }, { name: 'Due', type: 'date' }],
  view: 'table',
});

const isType = (t: unknown): t is PropType => TYPES.some((x) => x.type === t);
const isFn = (t: unknown): t is RollupFn => ROLLUPS.some((x) => x.fn === t);
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

export function shown(v: PropValue | undefined, type: PropType): string {
  if (v === undefined) return '';
  if (type === 'relation') return linksIn(v).join(', ');
  if (Array.isArray(v)) return v.join(', ');
  return type === 'checkbox' ? (v === 'true' ? '✓' : '') : v;
}
export const asList = (v: PropValue | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : v ? [v] : []);
export const linksIn = (v: PropValue | undefined): string[] => asList(v).map((x) => /^\[\[(.*?)(\|.*)?\]\]$/.exec(x.trim())?.[1] ?? x.trim()).filter(Boolean);
export const asLink = (title: string) => `[[${title}]]`;

export const IS_EMPTY = '';

export function passes(n: Pick<Note, 'props'>, f: DbSchema['filter'], value?: (by: string) => string): boolean {
  if (!f) return true;
  const v = n.props?.[f.by];
  if (f.is === 'checked') return v === 'true';
  if (value && v === undefined) { const x = value(f.by); return f.is === IS_EMPTY ? !x : x === f.is; }
  if (f.is === IS_EMPTY) return asList(v).length === 0;
  return asList(v).includes(f.is);
}

export function viewRows<T extends Pick<Note, 'props' | 'order'>>(rows: readonly T[], d: DbSchema, title: (r: T) => string, key?: (r: T, by: string) => string): T[] {
  const out = rows.filter((r) => passes(r, d.filter, key ? (by) => key(r, by) : undefined));
  const s = d.sort;
  if (!s) return out.sort((a, b) => a.order - b.order);
  const def = d.props.find((p) => p.name === s.by);
  const read = (r: T) => (s.by === NAME ? title(r) : key ? key(r, s.by) : shown(r.props?.[s.by], def?.type ?? 'text'));
  const numeric = def?.type === 'number' || def?.type === 'rollup' || def?.type === 'formula';
  const rank = def?.type === 'select' && def.options?.length ? (v: string) => def.options!.indexOf(v) : null;
  return out.sort((a, b) => {
    const x = read(a), y = read(b);
    if (!x || !y) return x === y ? 0 : x ? -1 : 1;
    const c = rank && rank(x) >= 0 && rank(y) >= 0 ? rank(x) - rank(y) : numeric && !isNaN(+x) && !isNaN(+y) ? +x - +y : x.localeCompare(y);
    return s.desc ? -c : c;
  });
}

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

const TAGS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export function tagColor(choice: string): (typeof TAGS)[number] {
  let h = 0;
  for (const ch of choice.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TAGS[h % TAGS.length];
}

export function withChoice(d: DbSchema, name: string, choice: string): DbSchema {
  return { ...d, props: d.props.map((p) => (p.name === name && !(p.options ?? []).includes(choice) ? { ...p, options: [...(p.options ?? []), choice] } : p)) };
}

export function rollup(values: string[], fn: RollupFn = 'count'): string {
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
