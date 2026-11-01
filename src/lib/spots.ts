import { freshId, isMessage, type Diagram, type Sequence, type Pie, type Mindmap, type Timeline, type Gantt, type Task, type ClassDiagram, type StateDiagram, type ErDiagram, type MindShape, type BlockKind } from './diagram';
import {
  dropStep, DIVIDERS, OPENERS, SPLITS, wellFormed, seqArrows, arrowOf, setArrow, pieValue, MIND_SHAPES, ROOT_SHAPES, movePeriod, plausible, endOf,
  startOf, startOptions, setStart, tagOptions, setTags, rename, NAME_ID, TABLE_ID, drop, options, arrowOptions, STATE_KINDS, insideOptions, renameState,
  dropState, LEFT, RIGHT,
} from './diagramOps';

/**
 * The parts of a chart that are edited where they are drawn (ChartEditor.svelte): each drawn part carries a
 * `data-spot` key ("slice:2", "task:0:1", "class:Order"), and a key gives its text, the few things beside its text it
 * has (a value, a date, an arrow), and what can be done from it (add the next one, move it, delete it). Eve's own
 * drawings (charts.ts, mindmap.ts) write the keys as they draw; mermaid's are found in its drawing and keyed after it
 * is drawn (tagSpots). An action returns the key of the part to type in next (one it added), if any. What it adds
 * has words in it ("Idea", "Task"), chosen as it opens to be typed over: one with none is not drawn, so it could
 * not be typed in where it is.
 */

export type Field =
  | { kind: 'select'; label: string; value: string; options: readonly (readonly [string, string])[]; set: (v: string) => void }
  | { kind: 'number' | 'date' | 'text'; label: string; value: string; set: (v: string) => void }
  /** one a line (a class's members: a method's own commas kept) */
  | { kind: 'lines'; label: string; value: string; set: (v: string) => void };
export type Icon = 'plus' | 'child' | 'up' | 'down' | 'left' | 'right' | 'trash' | 'note' | 'section';
export interface Act { label: string; icon: Icon; run: () => string | null | void | Promise<string | null | void>; /** what Tab does while typing */ tab?: true; off?: boolean }
export interface Spot {
  text: string; label: string;
  /** the text typed (as it is typed, unless `onDone`): a new key when it renamed what it is */
  set: (v: string) => string | void;
  /** set only once typing is done (a name that is also an id: every keystroke would rename it, and its lines) */
  onDone?: true;
  fields: Field[]; acts: Act[];
}

const at = (key: string) => key.split(':');
/** a class's or a table's name as drawn, not its id */
const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name.trim() || id;
/** where a note can be: over, left or right of each one, or over two side by side */
function noteOptions(s: Sequence, st: { note: string; who: string[] }): [string, string][] {
  const name = (id: string) => s.people.find((p) => p.id === id)?.name.trim() || id;
  const opts: [string, string][] = s.people.flatMap((p) => (['over', 'left of', 'right of'] as const).map((at) => [`${at}|${p.id}`, `${at[0].toUpperCase()}${at.slice(1)} ${name(p.id)}`] as [string, string]));
  for (let i = 1; i < s.people.length; i++) opts.push([`over|${s.people[i - 1].id},${s.people[i].id}`, `Over ${name(s.people[i - 1].id)} and ${name(s.people[i].id)}`]);
  const now = `${st.note}|${st.who.join(',')}`;
  if (!opts.some(([v]) => v === now)) opts.unshift([now, `${st.note} ${st.who.map(name).join(', ')}`]);
  return opts;
}
const move = <T>(list: T[], i: number, by: -1 | 1) => { const j = i + by; if (j < 0 || j >= list.length) return false; [list[i], list[j]] = [list[j], list[i]]; return true; };
const title = (d: { title: string }): Spot => ({ text: d.title, label: 'Title', set: (v) => { d.title = v; }, fields: [], acts: [] });

export function spotOf(d: Diagram, key: string): Spot | null {
  switch (d.kind) {
    case 'pie': return pieSpot(d, key);
    case 'timeline': return timeSpot(d, key);
    case 'gantt': return ganttSpot(d, key);
    case 'mindmap': return mindSpot(d, key);
    case 'sequence': return seqSpot(d, key);
    case 'class': return classSpot(d, key);
    case 'state': return stateSpot(d, key);
    case 'er': return erSpot(d, key);
    default: return null;
  }
}

/** the chart's own "+" buttons, beside Done: the first of each kind of part (or another one at the end), its title */
export function adders(d: Diagram): { label: string; run: () => string | null }[] {
  switch (d.kind) {
    case 'pie': return [
      { label: '+ Part', run: () => { d.slices.push({ label: 'Part', value: 10 }); return `slice:${d.slices.length - 1}`; } },
      ...(d.title.trim() ? [] : [{ label: '+ Title', run: () => { d.title = 'Title'; return 'title'; } }]),
    ];
    case 'timeline': return [
      { label: '+ Period', run: () => { d.periods.push({ label: 'When', events: [''] }); return `period:${d.periods.length - 1}`; } },
      ...(d.title.trim() ? [] : [{ label: '+ Title', run: () => { d.title = 'Title'; return 'title'; } }]),
    ];
    case 'gantt': return [
      { label: '+ Section', run: () => { d.sections.push({ name: 'Section', tasks: [{ name: 'Task', start: endOf(d), days: 2 }] }); return `phase:${d.sections.length - 1}`; } },
      ...(d.title.trim() ? [] : [{ label: '+ Title', run: () => { d.title = 'Title'; return 'title'; } }]),
    ];
    case 'mindmap': return [{ label: '+ Branch', run: () => { d.items.push({ text: 'Idea', depth: 1 }); return `branch:${d.items.length - 1}`; } }];
    case 'sequence': return [
      { label: '+ Person', run: () => { const id = freshId('p', d.people); d.people.push({ id, name: `Person ${d.people.length + 1}`, actor: false }); return `person:${id}`; } },
      ...(d.people.length ? [{ label: '+ Message', run: () => addMessage(d, d.messages.length) }] : []),
    ];
    case 'class': return [{ label: '+ Class', run: () => { const id = freshId('Class', d.classes); d.classes.push({ id, name: id, members: [] }); return `class:${id}`; } }];
    case 'state': return [{ label: '+ State', run: () => { const id = freshId('State', d.states); d.states.push({ id, name: id, desc: '' }); return `state:${id}`; } }];
    case 'er': return [{ label: '+ Table', run: () => { const id = freshId('TABLE', d.tables); d.tables.push({ id, name: id, columns: [{ type: 'int', name: 'id', keys: 'PK', comment: '' }] }); return `table:${id}`; } }];
    default: return [];
  }
}

/** the chart's own switches, beside its "+" buttons */
export function toggles(d: Diagram): { label: string; on: boolean; set: (on: boolean) => void }[] {
  if (d.kind === 'pie') return [{ label: 'Values', on: d.showData, set: (on) => { d.showData = on; } }];
  if (d.kind === 'sequence') return [{ label: 'Numbers', on: d.numbered, set: (on) => { d.numbered = on; } }];
  if (d.kind === 'gantt') return [
    { label: 'Skip weekends', on: !!d.skipWeekends, set: (on) => { if (on) d.skipWeekends = true; else delete d.skipWeekends; } },
    { label: 'Today line', on: !d.noToday, set: (on) => { if (on) delete d.noToday; else d.noToday = true; } },
  ];
  return [];
}

// ---- pie ----
function pieSpot(d: Pie, key: string): Spot | null {
  if (key === 'title') return title(d);
  const [k, n] = at(key), i = +n, s = d.slices[i];
  if (k !== 'slice' || !s) return null;
  return {
    text: s.label, label: 'Part name', set: (v) => { s.label = v; },
    fields: [{ kind: 'number', label: 'Value', value: String(s.value), set: (v) => { s.value = pieValue(+v); } }],
    acts: [
      { label: 'Add a part after it', icon: 'plus', tab: true, run: () => { d.slices.splice(i + 1, 0, { label: 'Part', value: 10 }); return `slice:${i + 1}`; } },
      { label: 'Move up', icon: 'up', off: i === 0, run: () => (move(d.slices, i, -1) ? `slice:${i - 1}` : null) },
      { label: 'Move down', icon: 'down', off: i === d.slices.length - 1, run: () => (move(d.slices, i, 1) ? `slice:${i + 1}` : null) },
      { label: 'Delete', icon: 'trash', run: () => { d.slices.splice(i, 1); } },
    ],
  };
}

// ---- timeline ----
function timeSpot(d: Timeline, key: string): Spot | null {
  if (key === 'title') return title(d);
  const [k, a, b] = at(key), i = +a, p = d.periods[i];
  if (!p) return null;
  const addEvent = (j: number) => {
    // a period's lone empty event is where the first one goes ("—" in the drawing)
    if (p.events.every((e) => !e.trim())) { p.events = ['Event']; return `event:${i}:0`; }
    p.events.splice(j, 0, 'Event');
    return `event:${i}:${j}`;
  };
  if (k === 'period') return {
    text: p.label, label: 'When', set: (v) => { p.label = v; },
    fields: [],
    acts: [
      { label: 'Add an event', icon: 'child', tab: true, run: () => addEvent(p.events.length) },
      { label: 'Add a period after it', icon: 'plus', run: () => { d.periods.splice(i + 1, 0, { label: 'When', events: [''] }); return `period:${i + 1}`; } },
      { label: 'Start a section here', icon: 'section', off: p.section !== undefined, run: () => { p.section = 'Section'; return `section:${i}`; } },
      { label: 'Move up', icon: 'up', off: i === 0, run: () => { movePeriod(d, i, -1); return `period:${i - 1}`; } },
      { label: 'Move down', icon: 'down', off: i === d.periods.length - 1, run: () => { movePeriod(d, i, 1); return `period:${i + 1}`; } },
      { label: 'Delete', icon: 'trash', run: () => {
        const [gone] = d.periods.splice(i, 1);
        // its section goes on from the next period, if that one did not start a section of its own
        if (gone.section !== undefined && d.periods[i] && d.periods[i].section === undefined) d.periods[i].section = gone.section;
      } },
    ],
  };
  if (k === 'event') {
    const j = +b;
    return {
      text: p.events[j] ?? '', label: 'What happened', set: (v) => { if (j < p.events.length) p.events[j] = v; else p.events.push(v); },
      fields: [],
      acts: [
        { label: 'Add an event after it', icon: 'plus', tab: true, run: () => addEvent(j + 1) },
        { label: 'Move up', icon: 'up', off: j === 0, run: () => (move(p.events, j, -1) ? `event:${i}:${j - 1}` : null) },
        { label: 'Move down', icon: 'down', off: j >= p.events.length - 1, run: () => (move(p.events, j, 1) ? `event:${i}:${j + 1}` : null) },
        { label: 'Delete', icon: 'trash', run: () => { p.events.splice(j, 1); if (!p.events.length) p.events.push(''); } },
      ],
    };
  }
  if (k === 'section') return {
    text: p.section ?? '', label: 'Section', set: (v) => { p.section = v; },
    fields: [],
    acts: [{ label: 'Remove the section (its periods stay)', icon: 'trash', run: () => { delete p.section; } }],
  };
  return null;
}

// ---- gantt ----
function ganttSpot(d: Gantt, key: string): Spot | null {
  if (key === 'title') return title(d);
  const [k, a, b] = at(key), si = +a, s = d.sections[si];
  if (!s) return null;
  if (k === 'phase') return {
    text: s.name, label: 'Section', set: (v) => { s.name = v; },
    fields: [],
    acts: [
      // a section just added comes with a task named only "Task": typed into, not left behind another
      { label: 'Add a task', icon: 'child', tab: true, run: () => {
        if (s.tasks.length === 1 && s.tasks[0].name === 'Task') return `task:${si}:0`;
        s.tasks.push({ name: 'Task', start: endOf(d), days: 2 }); return `task:${si}:${s.tasks.length - 1}`;
      } },
      { label: 'Add a section after it', icon: 'plus', run: () => { d.sections.splice(si + 1, 0, { name: 'Section', tasks: [{ name: 'Task', start: endOf(d), days: 2 }] }); return `phase:${si + 1}`; } },
      { label: 'Move up', icon: 'up', off: si === 0, run: () => (move(d.sections, si, -1) ? `phase:${si - 1}` : null) },
      { label: 'Move down', icon: 'down', off: si === d.sections.length - 1, run: () => (move(d.sections, si, 1) ? `phase:${si + 1}` : null) },
      { label: 'Delete the section and its tasks', icon: 'trash', run: () => { d.sections.splice(si, 1); } },
    ],
  };
  const ti = +b, t = s.tasks[ti];
  if (k !== 'task' || !t) return null;
  const milestone = !!t.tags?.includes('milestone');
  const fields: Field[] = [{ kind: 'select', label: 'Starts', value: startOf(t), options: startOptions(d, t), set: (v) => setStart(d, t, v) }];
  if (startOf(t) === 'date') fields.push({ kind: 'date', label: 'Start date', value: t.start, set: (v) => { if (plausible(v)) t.start = v; } });
  if (!milestone) fields.push({ kind: 'number', label: 'Days', value: String(t.days), set: (v) => { const n = Math.round(+v); if (n >= 1 && n <= 3650) t.days = n; } });
  fields.push({ kind: 'select', label: 'Status', value: (t.tags ?? []).join(', '), options: tagOptions(t), set: (v) => setTags(t, v) });
  return {
    text: t.name, label: 'Task', set: (v) => { t.name = v; },
    fields,
    acts: [
      // the next one starts when this one ends
      // and what started after it starts after the new one, not at the same time
      { label: 'Add a task after it', icon: 'plus', tab: true, run: () => {
        const all = d.sections.flatMap((y) => y.tasks), next: Task = { name: 'Task', start: '', after: '', days: 2 };
        if (t.id) {
          const waiting = all.filter((x) => x.after?.split(' ').includes(t.id!));
          if (waiting.length) {
            // after it by name: an id and the length alone would be read as a start date
            next.id = freshId('t', all.filter((y) => y.id).map((y) => ({ id: y.id! })));
            next.after = t.id;
            for (const x of waiting) x.after = x.after!.split(' ').map((id) => (id === t.id ? next.id! : id)).join(' ');
          }
        }
        s.tasks.splice(ti + 1, 0, next); return `task:${si}:${ti + 1}`;
      } },
      { label: 'Move up', icon: 'up', off: ti === 0, run: () => (move(s.tasks, ti, -1) ? `task:${si}:${ti - 1}` : null) },
      { label: 'Move down', icon: 'down', off: ti === s.tasks.length - 1, run: () => (move(s.tasks, ti, 1) ? `task:${si}:${ti + 1}` : null) },
      { label: 'Delete', icon: 'trash', run: () => {
        const [gone] = s.tasks.splice(ti, 1);
        // what started after it starts where it did instead
        if (gone.id) for (const x of d.sections.flatMap((y) => y.tasks)) if (x.after?.split(' ').includes(gone.id)) { x.after = x.after.split(' ').filter((id) => id !== gone.id).join(' '); if (!x.after) { x.start = gone.start || endOf(d); delete x.after; } }
      } },
    ],
  };
}

// ---- mind map ----
/** where the branches under the one at `i` end */
const subtreeEnd = (m: Mindmap, i: number) => { let e = i + 1; while (e < m.items.length && m.items[e].depth > m.items[i].depth) e++; return e; };
function mindSpot(m: Mindmap, key: string): Spot | null {
  const shape = (get: MindShape, put: (v: MindShape) => void, list: [MindShape, string][]): Field => ({ kind: 'select', label: 'Shape', value: get, options: list, set: (v) => put(v as MindShape) });
  if (key === 'root') return {
    text: m.root, label: 'Centre', set: (v) => { m.root = v; },
    fields: [shape(m.rootShape ?? 'circle', (v) => { if (v === 'circle') delete m.rootShape; else m.rootShape = v; }, ROOT_SHAPES)],
    acts: [{ label: 'Add a branch', icon: 'child', tab: true, run: () => { m.items.push({ text: 'Idea', depth: 1 }); return `branch:${m.items.length - 1}`; } }],
  };
  const [k, n] = at(key), i = +n, b = m.items[i];
  if (k !== 'branch' || !b) return null;
  // the branches beside it: those after it at its depth before one less deep
  const sibling = (by: -1 | 1) => {
    for (let j = i + by; j >= 0 && j < m.items.length; j += by) { if (m.items[j].depth < b.depth) return -1; if (m.items[j].depth === b.depth) return j; }
    return -1;
  };
  const swap = (j: number) => {
    // it and its own branches change places with the one beside it and its own
    const [x, y] = j < i ? [j, i] : [i, j], xe = subtreeEnd(m, x), ye = subtreeEnd(m, y);
    const first = m.items.slice(x, xe), second = m.items.slice(y, ye);
    m.items.splice(x, ye - x, ...second, ...m.items.slice(xe, y), ...first);
    return j < i ? x : x + second.length + (y - xe);
  };
  return {
    text: b.text, label: 'Idea', set: (v) => { b.text = v; },
    fields: [shape(b.shape ?? 'plain', (v) => { if (v === 'plain') delete b.shape; else b.shape = v; }, MIND_SHAPES)],
    acts: [
      { label: 'Add an idea under it', icon: 'child', tab: true, run: () => { const e = subtreeEnd(m, i); m.items.splice(e, 0, { text: 'Idea', depth: b.depth + 1 }); return `branch:${e}`; } },
      { label: 'Add an idea beside it', icon: 'plus', run: () => { const e = subtreeEnd(m, i); m.items.splice(e, 0, { text: 'Idea', depth: b.depth }); return `branch:${e}`; } },
      { label: 'Move up', icon: 'up', off: sibling(-1) < 0, run: () => { const j = sibling(-1); return j < 0 ? null : `branch:${swap(j)}`; } },
      { label: 'Move down', icon: 'down', off: sibling(1) < 0, run: () => { const j = sibling(1); return j < 0 ? null : `branch:${swap(j)}`; } },
      { label: 'Delete it and the ideas under it', icon: 'trash', run: () => { m.items.splice(i, subtreeEnd(m, i) - i); } },
    ],
  };
}

// ---- sequence ----
function addMessage(s: Sequence, at: number, from?: string): string | null {
  // the answer to the message before it, or from the one given to the next person
  const before = s.messages.slice(0, at).filter(isMessage).pop();
  const pi = from ? s.people.findIndex((p) => p.id === from) : -1;
  const [a, b] = from ? [from, s.people[(pi + 1) % s.people.length]?.id ?? from] : before ? [before.to, before.from] : [s.people[0]?.id, s.people[1]?.id ?? s.people[0]?.id];
  if (!a || !b) return null;
  s.messages.splice(at, 0, { from: a, to: b, text: 'Message', reply: !from && !!before && !before.reply });
  return `step:${at}`;
}
function seqSpot(s: Sequence, key: string): Spot | null {
  const [k, n] = at(key);
  if (k === 'person') {
    const i = s.people.findIndex((p) => p.id === n), p = s.people[i];
    if (!p) return null;
    return {
      text: p.name, label: 'Participant', set: (v) => { p.name = v; },
      fields: [{ kind: 'select', label: 'Drawn as', value: p.actor ? 'actor' : 'box', options: [['box', 'System'], ['actor', 'Person']], set: (v) => { p.actor = v === 'actor'; } }],
      acts: [
        { label: 'Add a message from them', icon: 'child', run: () => addMessage(s, s.messages.length, p.id) },
        { label: 'Add a participant after them', icon: 'plus', tab: true, run: () => { const id = freshId('p', s.people); s.people.splice(i + 1, 0, { id, name: `Person ${s.people.length + 1}`, actor: false }); return `person:${id}`; } },
        { label: 'Move left', icon: 'left', off: i === 0, run: () => { move(s.people, i, -1); return key; } },
        { label: 'Move right', icon: 'right', off: i === s.people.length - 1, run: () => { move(s.people, i, 1); return key; } },
        { label: 'Delete them and their messages', icon: 'trash', run: () => {
          const theirs = (st: Sequence['messages'][number]) => (isMessage(st) ? st.from === p.id || st.to === p.id : 'note' in st && st.who.includes(p.id));
          s.people.splice(i, 1);
          s.messages = s.messages.filter((m) => !theirs(m));
        } },
      ],
    };
  }
  const i = +n, st = s.messages[i];
  if (k !== 'step' || !st) return null;
  const moves: Act[] = [-1, 1].map((by) => ({
    label: by < 0 ? 'Move up' : 'Move down', icon: by < 0 ? 'up' : 'down', off: by < 0 ? i === 0 : i === s.messages.length - 1,
    run: () => {
      // past the step beside it: into a group or out of one, but never where the groups would no longer close
      const next = [...s.messages];
      if (!move(next, i, by as -1 | 1) || (wellFormed(s.messages) && !wellFormed(next))) return null;
      s.messages = next;
      return `step:${i + by}`;
    },
  }));
  const del: Act = { label: 'Delete', icon: 'trash', run: () => { dropStep(s, i); } };
  const people = s.people.map((p) => [p.id, p.name.trim() || '(no name)'] as const);
  if (isMessage(st)) return {
    text: st.text, label: 'Message', set: (v) => { st.text = v; },
    fields: [
      { kind: 'select', label: 'From', value: st.from, options: people, set: (v) => { st.from = v; } },
      { kind: 'select', label: 'How', value: arrowOf(st), options: seqArrows(st), set: (v) => setArrow(st, v) },
      { kind: 'select', label: 'To', value: st.to, options: people, set: (v) => { st.to = v; } },
    ],
    acts: [
      { label: 'Add a message after it', icon: 'plus', tab: true, run: () => addMessage(s, i + 1) },
      { label: 'Add a note after it', icon: 'note', run: () => { s.messages.splice(i + 1, 0, { note: 'over', who: st.from === st.to ? [st.from] : [st.from, st.to], text: 'Note' }); return `step:${i + 1}`; } },
      ...moves, del,
    ],
  };
  if ('note' in st) return {
    text: st.text, label: 'Note', set: (v) => { st.text = v; },
    fields: [{ kind: 'select', label: 'Where', value: `${st.note}|${st.who.join(',')}`, options: noteOptions(s, st), set: (v) => {
      const [at, who] = v.split('|'); st.note = at as typeof st.note; st.who = who.split(',');
    } }],
    acts: [{ label: 'Add a message after it', icon: 'plus', tab: true, run: () => addMessage(s, i + 1) }, ...moves, del],
  };
  if ('block' in st && st.block !== 'end') {
    const divider = DIVIDERS.has(st.block);
    return {
      text: st.text, label: divider ? 'Otherwise' : 'Condition', set: (v) => { st.text = v; },
      fields: [{ kind: 'select', label: 'Group', value: st.block, options: divider ? SPLITS : OPENERS, set: (v) => { st.block = v as BlockKind; } }],
      acts: [{ label: 'Add a message in it', icon: 'child', tab: true, run: () => addMessage(s, i + 1) }, del],
    };
  }
  return null;
}

// ---- class, state, table ----
/** a line from `from` to a new one of the same kind, made and named, to be typed in */
function classSpot(c: ClassDiagram, key: string): Spot | null {
  const [k, n] = at(key);
  if (k === 'clink') {
    const i = +n, l = c.links[i];
    if (!l) return null;
    return {
      text: l.label, label: 'Line label', set: (v) => { l.label = v; },
      fields: [
        { kind: 'select', label: 'Kind', value: l.arrow, options: arrowOptions(l.arrow), set: (v) => { l.arrow = v; } },
        { kind: 'text', label: `How many “${nameOf(c.classes, l.from)}”`, value: l.fromCard, set: (v) => { l.fromCard = v; } },
        { kind: 'text', label: `How many “${nameOf(c.classes, l.to)}”`, value: l.toCard, set: (v) => { l.toCard = v; } },
      ],
      acts: [{ label: 'Delete the line', icon: 'trash', run: () => { c.links.splice(i, 1); } }],
    };
  }
  const i = c.classes.findIndex((x) => x.id === n), cl = c.classes[i];
  if (k !== 'class' || !cl) return null;
  return {
    text: cl.name, label: 'Class', onDone: true, set: (v) => { rename(c.classes, c.links, cl, v, NAME_ID); return `class:${cl.id}`; },
    fields: [
      { kind: 'lines', label: 'Members', value: cl.members.join('\n'), set: (v) => { cl.members = v.split('\n').map((x) => x.trim()).filter(Boolean); } },
      linkTo(c.classes, cl.id, (to) => c.links.push({ from: cl.id, to, arrow: '-->', label: '', fromCard: '', toCard: '' })),
    ],
    acts: [
      { label: 'Add a class linked to it', icon: 'plus', tab: true, run: () => { const id = freshId('Class', c.classes); c.classes.push({ id, name: id, members: [] }); c.links.push({ from: cl.id, to: id, arrow: '-->', label: '', fromCard: '', toCard: '' }); return `class:${id}`; } },
      { label: 'Delete it and its lines', icon: 'trash', run: () => drop(c.classes, c.links, i) },
    ],
  };
}
const linkTo = (all: { id: string; name: string }[], self: string, add: (to: string) => void): Field => ({
  kind: 'select', label: 'Draw a line to', value: '', options: [['', '→ Line to…'], ...options(all.filter((x) => x.id !== self))], set: (v) => { if (v) add(v); },
});

function stateSpot(s: StateDiagram, key: string): Spot | null {
  const [k, n] = at(key);
  if (k === 'slink') {
    const i = +n, l = s.links[i];
    if (!l) return null;
    return { text: l.label, label: 'Line label', set: (v) => { l.label = v; }, fields: [], acts: [{ label: 'Delete the line', icon: 'trash', run: () => { s.links.splice(i, 1); } }] };
  }
  const i = s.states.findIndex((x) => x.id === n), st = s.states[i];
  if (k !== 'state' || !st) return null;
  const fields: Field[] = [];
  if (!st.kind) fields.push({ kind: 'text', label: 'Description', value: st.desc, set: (v) => { st.desc = v; } });
  fields.push({ kind: 'select', label: 'Kind', value: st.kind ?? 'state', options: STATE_KINDS, set: (v) => { if (v === 'state') delete st.kind; else st.kind = v as 'choice'; } });
  fields.push({ kind: 'select', label: 'Inside', value: st.parent ?? '', options: insideOptions(s, st), set: (v) => { if (v) st.parent = v; else delete st.parent; } });
  fields.push(linkTo(s.states, st.id, (to) => s.links.push({ from: st.id, to, label: '' })));
  return {
    text: st.name, label: 'State', onDone: true, set: (v) => { renameState(s, st, v); return `state:${st.id}`; },
    fields,
    acts: [
      { label: 'Add a state it goes to', icon: 'plus', tab: true, run: () => { const id = freshId('State', s.states); s.states.push(st.parent ? { id, name: id, desc: '', parent: st.parent } : { id, name: id, desc: '' }); s.links.push({ from: st.id, to: id, label: '' }); return `state:${id}`; } },
      { label: 'Add an end after it', icon: 'child', off: s.links.some((l) => l.from === st.id && l.to === '[*]'), run: () => { s.links.push({ from: st.id, to: '[*]', label: '' }); } },
      { label: 'Delete it and its lines', icon: 'trash', run: () => dropState(s, i) },
    ],
  };
}

const KEYS: [string, string][] = [['', 'No key'], ['PK', 'PK'], ['FK', 'FK'], ['UK', 'UK'], ['PK, FK', 'PK, FK']];
function erSpot(e: ErDiagram, key: string): Spot | null {
  const [k, n, c] = at(key);
  if (k === 'rel') {
    const i = +n, l = e.links[i];
    if (!l) return null;
    return {
      text: l.label, label: 'Line label', set: (v) => { l.label = v; },
      fields: [
        { kind: 'select', label: `How many “${nameOf(e.tables, l.from)}”`, value: l.left, options: LEFT, set: (v) => { l.left = v; } },
        { kind: 'select', label: `How many “${nameOf(e.tables, l.to)}”`, value: l.right, options: RIGHT, set: (v) => { l.right = v; } },
      ],
      acts: [{ label: 'Delete the line', icon: 'trash', run: () => { e.links.splice(i, 1); } }],
    };
  }
  const i = e.tables.findIndex((x) => x.id === n), t = e.tables[i];
  if (!t) return null;
  if (k === 'table') return {
    text: t.name, label: 'Table', onDone: true, set: (v) => { rename(e.tables, e.links, t, v, TABLE_ID); return `table:${t.id}`; },
    fields: [linkTo(e.tables, t.id, (to) => e.links.push({ from: t.id, to, left: '||', right: 'o{', dashed: false, label: '' }))],
    acts: [
      { label: 'Add a column', icon: 'child', tab: true, run: () => { t.columns.push({ type: 'string', name: 'column', keys: '', comment: '' }); return `col:${t.id}:${t.columns.length - 1}`; } },
      { label: 'Add a table linked to it', icon: 'plus', run: () => { const id = freshId('TABLE', e.tables); e.tables.push({ id, name: id, columns: [{ type: 'int', name: 'id', keys: 'PK', comment: '' }] }); e.links.push({ from: t.id, to: id, left: '||', right: 'o{', dashed: false, label: '' }); return `table:${id}`; } },
      { label: 'Delete it and its lines', icon: 'trash', run: () => drop(e.tables, e.links, i) },
    ],
  };
  const j = +c, col = t.columns[j];
  if (k !== 'col' || !col) return null;
  return {
    text: col.name, label: 'Column', set: (v) => { col.name = v; },
    fields: [
      { kind: 'text', label: 'Type', value: col.type, set: (v) => { col.type = v.trim().replace(/\s+/g, '_') || 'string'; } },
      { kind: 'select', label: 'Key', value: col.keys, options: KEYS.some(([x]) => x === col.keys) ? KEYS : [...KEYS, [col.keys, col.keys]], set: (v) => { col.keys = v; } },
      { kind: 'text', label: 'Comment', value: col.comment, set: (v) => { col.comment = v; } },
    ],
    acts: [
      { label: 'Add a column after it', icon: 'plus', tab: true, run: () => { t.columns.splice(j + 1, 0, { type: 'string', name: 'column', keys: '', comment: '' }); return `col:${t.id}:${j + 1}`; } },
      { label: 'Move up', icon: 'up', off: j === 0, run: () => (move(t.columns, j, -1) ? `col:${t.id}:${j - 1}` : null) },
      { label: 'Move down', icon: 'down', off: j === t.columns.length - 1, run: () => (move(t.columns, j, 1) ? `col:${t.id}:${j + 1}` : null) },
      { label: 'Delete', icon: 'trash', run: () => { t.columns.splice(j, 1); } },
    ],
  };
}

/**
 * Keys put on mermaid's drawing of a chart (Eve's own drawings have theirs): its parts found in the order the chart
 * writes them. A part whose drawing cannot be matched (a folded sequence, labels drawn some other way) is left
 * without one, and is not clicked.
 */
export function tagSpots(d: Diagram, root: Element) {
  const tag = (els: Element[], keys: string[]) => { if (els.length === keys.length) els.forEach((el, i) => el.setAttribute('data-spot', keys[i])); };
  const byId = (kind: string, prefix: string) => {
    for (const g of root.querySelectorAll('g.node')) {
      const id = new RegExp(`-${kind}-(.+)-\\d+$`).exec(g.id)?.[1];
      if (id && !/^root_(start|end)$/.test(id) && !id.endsWith('_start') && !id.endsWith('_end')) g.setAttribute('data-spot', `${prefix}:${id}`);
    }
  };
  // a line's label found by its words; lines that say the same, in the order they are written and drawn
  const labels = (keyOf: (i: number) => string, said: string[]) => {
    const seen = new Map<string, number>();
    for (const g of root.querySelectorAll('g.edgeLabel')) {
      const t = g.textContent?.trim();
      if (!t) continue;
      const hits = said.flatMap((x, i) => (x.trim() === t ? [i] : [])), k = seen.get(t) ?? 0;
      seen.set(t, k + 1);
      if (hits[k] !== undefined) g.setAttribute('data-spot', keyOf(hits[k]));
    }
  };
  /** drawn words matched to parts by what they say; parts that say the same, by where they are drawn (left to right,
   *  top to bottom), as many as there are of them */
  const byWords = (els: Element[], parts: { key: string; says: string }[], mark: (el: Element) => Element = (el) => el) => {
    const where = (el: Element) => { const r = el.getBoundingClientRect(); return r.left * 1e-3 + r.top; };
    const groups = new Map<string, Element[]>();
    for (const el of els) { const t = el.textContent?.trim() ?? ''; groups.set(t, [...(groups.get(t) ?? []), el]); }
    for (const [t, all] of groups) {
      const same = parts.filter((p) => p.says === t);
      if (!same.length) continue;
      // each drawn as often (a person at the head and the foot): the n-th of each row the n-th of them
      if (all.length % same.length) continue;
      const sorted = same.length > 1 ? [...all].sort((a, b) => where(a) - where(b)) : all;
      sorted.forEach((el, i) => mark(el).setAttribute('data-spot', same[i % same.length].key));
    }
  };
  if (d.kind === 'sequence') {
    // by the name each says, not by order: mermaid draws them last to first (and again along the foot)
    byWords([...root.querySelectorAll('text.actor')], d.people.map((p) => ({ key: `person:${p.id}`, says: p.name.trim() || p.id })), (t) => t.parentElement!);
    const steps = d.messages.map((st, i) => [st, i] as const);
    tag([...root.querySelectorAll('text.messageText')], steps.filter(([st]) => isMessage(st)).map(([, i]) => `step:${i}`));
    tag([...root.querySelectorAll('text.noteText')].map((t) => t.parentElement!), steps.filter(([st]) => 'note' in st).map(([, i]) => `step:${i}`));
    // a group's words (an alt's "[cached]", its else's, an opt's): by what they say, as some are drawn apart
    const groups = steps.filter(([st]) => 'block' in st && st.block !== 'end').map(([st, i]) => ({ key: `step:${i}`, says: `[${('text' in st ? String(st.text) : '').trim()}]` }));
    byWords([...root.querySelectorAll('text')].filter((t) => /^\[.*\]$/.test(t.textContent?.trim() ?? '')), groups);
  } else if (d.kind === 'class') {
    byId('classId', 'class');
    labels((i) => `clink:${i}`, d.links.map((l) => l.label));
  } else if (d.kind === 'state') {
    byId('state', 'state');
    labels((i) => `slink:${i}`, d.links.map((l) => l.label));
  } else if (d.kind === 'er') {
    byId('entity', 'table');
    for (const g of root.querySelectorAll('g.node[data-spot^="table:"]')) {
      const id = g.getAttribute('data-spot')!.slice(6), t = d.tables.find((x) => x.id === id);
      if (t) tag([...g.querySelectorAll('g.label.attribute-name')], t.columns.map((_, j) => `col:${id}:${j}`));
    }
    labels((i) => `rel:${i}`, d.links.map((l) => l.label));
  } else if (d.kind === 'gantt' && !root.querySelector('[data-spot]')) {
    // mermaid's own Gantt (weekends skipped, settings kept as written): its tasks, in order
    const keys = d.sections.flatMap((s, si) => s.tasks.map((_, ti) => `task:${si}:${ti}`));
    // a task's name drawn on its bar, or beside it when the bar is short (taskTextOutsideRight), as well as the bar
    tag([...root.querySelectorAll('text[class*="taskText"]')], keys);
    tag([...root.querySelectorAll('rect.task')], keys);
    tag([...root.querySelectorAll('text.titleText')], d.title.trim() ? ['title'] : []);
    tag([...root.querySelectorAll('text.sectionTitle')], d.sections.filter((x) => x.tasks.length).map((x) => `phase:${d.sections.indexOf(x)}`));
  }
}
