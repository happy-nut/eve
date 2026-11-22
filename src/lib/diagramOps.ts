import {
  starter, freshId, addDays, ganttDates, replies, type Message, type Sequence, type Mindmap, type Timeline, type Gantt, type Task,
  type BlockKind, type MindShape, type StateBox, type StateDiagram, stateParent,
} from './diagram';

export function depthAt(s: Sequence, i: number) {
  let depth = 0;
  for (let j = 0; j < i; j++) {
    const st = s.steps[j];
    if ('block' in st) depth += st.block === 'end' ? -1 : DIVIDERS.has(st.block) ? 0 : 1;
  }
  const st = s.steps[i];
  return Math.max(0, depth - ('block' in st && (st.block === 'end' || DIVIDERS.has(st.block)) ? 1 : 0));
}
export const DIVIDERS = new Set<BlockKind>(['else', 'and', 'option']);
export const OPENERS: [BlockKind, string][] = [['loop', 'Loop'], ['alt', 'If / else'], ['opt', 'Optional'], ['par', 'At once'], ['critical', 'Critical'], ['break', 'Break'], ['rect', 'Highlight']];
export const SPLITS: [BlockKind, string][] = [['else', 'Else'], ['and', 'And'], ['option', 'Option']];
export function dropStep(s: Sequence, i: number) {
  const st = s.steps[i];
  if ('block' in st && !DIVIDERS.has(st.block) && st.block !== 'end') {
    let depth = 0;
    for (let j = i + 1; j < s.steps.length; j++) {
      const x = s.steps[j];
      if (!('block' in x) || DIVIDERS.has(x.block)) continue;
      if (x.block !== 'end') depth++;
      else if (depth-- === 0) { s.steps.splice(j, 1); break; }
    }
  }
  s.steps.splice(i, 1);
}
export function openerOf(s: Sequence, i: number) {
  let depth = 0;
  for (let j = i - 1; j >= 0; j--) {
    const x = s.steps[j];
    if (!('block' in x) || DIVIDERS.has(x.block)) continue;
    if (x.block === 'end') depth++;
    else if (depth-- === 0) return x.block;
  }
  return null;
}
export const SPLIT_OF: Partial<Record<BlockKind, BlockKind>> = { alt: 'else', par: 'and', critical: 'option' };
export function wellFormed(steps: Sequence['steps']) {
  const open: BlockKind[] = [];
  for (const st of steps) {
    if (!('block' in st)) continue;
    if (st.block === 'end') { if (!open.pop()) return false; }
    else if (DIVIDERS.has(st.block)) { if (SPLIT_OF[open[open.length - 1]] !== st.block) return false; }
    else open.push(st.block);
  }
  return !open.length;
}
export const ARROWS: [string, string][] = [
  ['->>', '→  Sends'], ['-->>', '⇠  Replies'], ['-)', '→  Sends, no wait'], ['--)', '⇠  Replies, no wait'], ['-x', '→  Lost'], ['--x', '⇠  Lost reply'],
];
export const arrowOf = (m: Message) => m.writtenArrow ?? (m.reply ? '-->>' : '->>');
export const seqArrows = (m: Message) => (ARROWS.some(([a]) => a === arrowOf(m)) ? ARROWS : [...ARROWS, [arrowOf(m), arrowOf(m)] as [string, string]]);
export function setArrow(m: Message, v: string) {
  m.reply = replies(v);
  if (v === '->>' || v === '-->>') delete m.writtenArrow; else m.writtenArrow = v;
}
export const BARS: [string, string][] = [['', 'No bar'], ['start', 'Bar starts'], ['end', 'Bar ends']];
export { pieValue } from './diagram';

export function dropBranch(m: Mindmap, i: number) {
  const depth = m.items[i].depth;
  m.items.splice(i, 1);
  for (let j = i; j < m.items.length && m.items[j].depth > depth; j++) m.items[j].depth -= 1;
}
export const deeper = (m: Mindmap, i: number) => i > 0 && m.items[i].depth <= m.items[i - 1].depth;
export function indent(m: Mindmap, i: number, by: number) {
  const it = m.items[i];
  if (by > 0 && !deeper(m, i)) return;
  if (by < 0 && it.depth <= 1) return;
  let j = i + 1;
  while (j < m.items.length && m.items[j].depth > it.depth) m.items[j++].depth += by;
  it.depth += by;
}
export function movePeriod(t: Timeline, i: number, by: -1 | 1) {
  const a = t.periods[i], b = t.periods[i + by];
  if (!b) return;
  [a.label, b.label] = [b.label, a.label];
  [a.events, b.events] = [b.events, a.events];
}

export const MIND_SHAPES: [MindShape, string][] = [['plain', 'Plain'], ['square', '▢ Square'], ['rounded', '▢ Rounded'], ['circle', '○ Circle'], ['bang', '✸ Bang'], ['cloud', '☁ Cloud'], ['hexagon', '⬡ Hexagon']];
export const ROOT_SHAPES = MIND_SHAPES.filter(([k]) => k !== 'plain');

/** a start the note keeps: a whole date in a year people plan in. Typed with the keys, a date field reports every
 *  half-typed year (0002, 0020, 0202…), each written into the note, the drawing switching over and back with it */
export const plausible = (v: string) => /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const endOf = (g: Gantt) => {
  const all = [...ganttDates(g).values()].filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.start));
  const last = all[all.length - 1];
  return last ? addDays(last.start, last.days) : (starter('gantt') as Gantt).sections[0].tasks[0].start;
};
export const startOf = (t: Task) => (!t.after ? 'date' : 'prev' in t.after ? 'prev' : `after ${t.after.ids.join(' ')}`);
export const afterIds = (t: Task) => (t.after && 'ids' in t.after ? t.after.ids : []);
function dependsOn(all: Task[], x: Task, t: Task, seen = new Set<Task>()): boolean {
  if (x === t) return true;
  if (seen.has(x) || !x.after) return false;
  seen.add(x);
  const before = 'prev' in x.after ? [all[all.indexOf(x) - 1]] : x.after.ids.map((id) => all.find((y) => y.id === id));
  return before.some((y) => !!y && dependsOn(all, y, t, seen));
}
export function startOptions(g: Gantt, t: Task) {
  const all = g.sections.flatMap((s) => s.tasks);
  const others = all.map((x, k) => [x, k] as const).filter(([x]) => x !== t && !dependsOn(all, x, t));
  const opts: [string, string][] = [['date', 'On a date'], ...(all[0] === t ? [] : [['prev', 'After the one before'] as [string, string]]),
    ...others.map(([x, k]) => [x.id ? `after ${x.id}` : `task ${k}`, `After “${x.name.trim() || 'Task'}”`] as [string, string])];
  if (!opts.some(([v]) => v === startOf(t))) opts.push([startOf(t), `After ${afterIds(t).map((id) => `“${taskName(g, id)}”`).join(' and ')}`]);
  return opts;
}
export function setStart(g: Gantt, t: Task, v: string) {
  const all = g.sections.flatMap((s) => s.tasks);
  if (v === 'date') { t.start = ganttDates(g).get(t)!.start; delete t.after; return; }
  if (v === 'prev') { t.after = { prev: true }; t.start = ''; return; }
  const k = /^task (\d+)$/.exec(v);
  if (k) { const x = all[+k[1]]; x.id ??= freshId('t', all.filter((y) => y.id).map((y) => ({ id: y.id! }))); v = `after ${x.id}`; }
  t.after = { ids: v.replace(/^after /, '').split(' ') };
  t.start = '';
}
export const taskName = (g: Gantt, id: string) => g.sections.flatMap((s) => s.tasks).find((x) => x.id === id)?.name.trim() || id;
export function andAfterOptions(g: Gantt, t: Task) {
  const has = new Set(afterIds(t));
  const others = g.sections.flatMap((s) => s.tasks).map((x, k) => [x, k] as const).filter(([x]) => x !== t && !(x.id && has.has(x.id)));
  return [['', '+ And after…'] as [string, string], ...others.map(([x, k]) => [x.id ?? `task ${k}`, `And “${x.name.trim() || 'Task'}”`] as [string, string])];
}
export function addAfter(g: Gantt, t: Task, v: string) {
  if (!v) return;
  const all = g.sections.flatMap((s) => s.tasks);
  const k = /^task (\d+)$/.exec(v);
  if (k) { const x = all[+k[1]]; x.id ??= freshId('t', all.filter((y) => y.id).map((y) => ({ id: y.id! }))); v = x.id; }
  t.after = { ids: [...afterIds(t), v] };
}
export const TAG_OPTIONS: [string, string][] = [
  ['', '—'], ['done', 'Done'], ['active', 'Active'], ['crit', 'Critical'], ['milestone', 'Milestone'],
  ['active, crit', 'Active, critical'], ['done, crit', 'Done, critical'], ['crit, milestone', 'Critical milestone'],
];
export function setTags(t: Task, v: string) {
  const was = t.tags?.includes('milestone');
  if (v) t.tags = v.split(', '); else delete t.tags;
  const is = !!t.tags?.includes('milestone');
  if (is && !was) t.days = 0;
  if (!is && t.days < 1) t.days = 1;
}
export const tagOptions = (t: Task) => (TAG_OPTIONS.some(([v]) => v === (t.tags ?? []).join(', ')) ? TAG_OPTIONS : [...TAG_OPTIONS, [(t.tags ?? []).join(', '), (t.tags ?? []).join(', ')] as [string, string]]);

export function rename<T extends { id: string; name: string }>(all: T[], links: { from: string; to: string }[], it: T, name: string, idOk: RegExp) {
  it.name = name;
  const id = name.trim();
  if (!idOk.test(id) || all.some((x) => x !== it && x.id === id)) return;
  for (const l of links) { if (l.from === it.id) l.from = id; if (l.to === it.id) l.to = id; }
  it.id = id;
}
export const NAME_ID = /^[\p{L}\p{N}_]+$/u, TABLE_ID = /^[\p{L}\p{N}_-]+$/u;
export const drop = <T extends { id: string }>(all: T[], links: { from: string; to: string }[], i: number) => {
  const id = all[i].id;
  all.splice(i, 1);
  for (let j = links.length - 1; j >= 0; j--) if (links[j].from === id || links[j].to === id) links.splice(j, 1);
};
export const options = (all: { id: string; name: string }[]) => all.map((x) => [x.id, x.name.trim() || x.id] as [string, string]);
export const CLASS_ARROWS: [string, string][] = [
  ['<|--', '◁── Inheritance'], ['*--', '◆── Composition'], ['o--', '◇── Aggregation'], ['-->', '──▶ Association'],
  ['--', '─── Link'], ['..>', '┄┄▶ Dependency'], ['..|>', '┄┄▷ Realization'], ['..', '┄┄┄ Dashed link'],
];
export const arrowOptions = (a: string) => (CLASS_ARROWS.some(([v]) => v === a) ? CLASS_ARROWS : [...CLASS_ARROWS, [a, a] as [string, string]]);
export const stateDepth = (s: StateDiagram, st: StateBox) => { let n = 0; for (let p = stateParent(s, st); p; p = stateParent(s, s.states.find((x) => x.id === p)!)) n++; return n; };
export const STATE_KINDS: [string, string][] = [['state', 'State'], ['choice', '◇ Choice'], ['fork', '▬ Fork'], ['join', '▬ Join']];
export function insideOptions(s: StateDiagram, st: StateBox) {
  const under = (x: StateBox): boolean => { for (let p = stateParent(s, x); p; p = stateParent(s, s.states.find((y) => y.id === p)!)) if (p === st.id) return true; return false; };
  // not one it has a line with (mermaid fails on a line between a state and the one around it), nor one with a
  // description (a state of states draws none: it was lost)
  const joined = (x: StateBox) => s.links.some((l) => (l.from === x.id && l.to === st.id) || (l.to === x.id && l.from === st.id));
  return [['', 'Not inside one'] as [string, string], ...s.states.filter((x) => x !== st && !x.kind && !under(x) && (x.id === st.parent || (!joined(x) && !x.desc.trim()))).map((x) => [x.id, `In “${x.name.trim() || x.id}”`] as [string, string])];
}
export function renameState(s: StateDiagram, st: StateBox, name: string) {
  const was = st.id;
  rename(s.states, s.links, st, name, NAME_ID);
  if (st.id !== was) for (const x of s.states) if (x.parent === was) x.parent = st.id;
}
export function dropState(s: StateDiagram, i: number) {
  const st = s.states[i];
  for (const x of s.states) if (x.parent === st.id) { if (st.parent) x.parent = st.parent; else delete x.parent; }
  drop(s.states, s.links, i);
}
export const LEFT: [string, string][] = [['||', 'Exactly one'], ['|o', 'Zero or one'], ['}|', 'One or more'], ['}o', 'Zero or more']];
export const RIGHT: [string, string][] = [['||', 'Exactly one'], ['o|', 'Zero or one'], ['|{', 'One or more'], ['o{', 'Zero or more']];
