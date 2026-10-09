/**
 * The charts a note's diagrams are edited as (DiagramBlock.svelte) as data, and as the mermaid code a note keeps. The
 * note stores only the code: what is drawn is written out (toCode), and a diagram opened again is read back from its code
 * (fromCode). Read back is strict: a line the builder would not have written (a style, a subgraph, a comment) makes it
 * null, and the diagram is edited as code, so nothing written by hand is lost to a form that cannot show it.
 */

export type Shape = 'round' | 'box' | 'pill' | 'diamond' | 'circle' | 'db';
export type Line = 'solid' | 'dotted' | 'thick';
export interface FlowNode { id: string; label: string; shape: Shape; /** the swimlane it is in (a lane's id), if the chart has lanes */ lane?: string }
/** a swimlane: who or what does the steps in it (mermaid's subgraph) */
export interface Lane { id: string; label: string }
export interface FlowEdge { from: string; to: string; label: string; line: Line }
export interface Flowchart { kind: 'flowchart'; dir: 'LR' | 'TD'; nodes: FlowNode[]; edges: FlowEdge[]; lanes?: Lane[] }

export interface Person { id: string; name: string; actor: boolean }
export interface Message { from: string; to: string; text: string; reply: boolean }
export interface Sequence { kind: 'sequence'; people: Person[]; messages: Message[]; numbered: boolean }

export interface Slice { label: string; value: number }
export interface Pie { kind: 'pie'; title: string; slices: Slice[]; showData: boolean }

export interface Branch { text: string; depth: number } // depth 1: under the centre
export interface Mindmap { kind: 'mindmap'; root: string; items: Branch[] }

export interface Period { label: string; events: string[] }
export interface Timeline { kind: 'timeline'; title: string; periods: Period[] }

export interface Task { name: string; start: string; days: number }
export interface Phase { name: string; tasks: Task[] }
export interface Gantt { kind: 'gantt'; title: string; sections: Phase[] }

export type Diagram = Flowchart | Sequence | Pie | Mindmap | Timeline | Gantt;
export type Kind = Diagram['kind'];

export const KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: 'flowchart', label: 'Flowchart', hint: 'Steps, choices and where they lead' },
  { kind: 'sequence', label: 'Sequence', hint: 'Who says what to whom, in order' },
  { kind: 'pie', label: 'Pie chart', hint: 'Parts of a whole' },
  { kind: 'mindmap', label: 'Mind map', hint: 'Ideas branching from one' },
  { kind: 'timeline', label: 'Timeline', hint: 'What happened when' },
  { kind: 'gantt', label: 'Gantt', hint: 'Tasks on a calendar' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };

/** what a new chart of each kind starts as: a small example to change, not an empty form */
/** the / menu's swimlanes: a flowchart whose steps sit in the lane of who does them */
export function swimlaneStarter(): Flowchart {
  return {
    kind: 'flowchart', dir: 'TD', // lanes side by side down the page: a note is narrower than it is long
    lanes: [{ id: 'L1', label: 'Customer' }, { id: 'L2', label: 'Store' }, { id: 'L3', label: 'Delivery' }],
    nodes: [
      // in the order the code lists them (by lane), so the chart reads back exactly as it is
      { id: 'n1', label: 'Order', shape: 'pill', lane: 'L1' },
      { id: 'n6', label: 'Receive', shape: 'pill', lane: 'L1' },
      { id: 'n2', label: 'Check payment', shape: 'round', lane: 'L2' },
      { id: 'n3', label: 'In stock?', shape: 'diamond', lane: 'L2' },
      { id: 'n4', label: 'Pack', shape: 'round', lane: 'L2' },
      { id: 'n5', label: 'Ship', shape: 'round', lane: 'L3' },
    ],
    edges: [
      { from: 'n1', to: 'n2', label: '', line: 'solid' },
      { from: 'n2', to: 'n3', label: '', line: 'solid' },
      { from: 'n3', to: 'n4', label: 'yes', line: 'solid' },
      { from: 'n3', to: 'n1', label: 'no', line: 'dotted' },
      { from: 'n4', to: 'n5', label: '', line: 'solid' },
      { from: 'n5', to: 'n6', label: '', line: 'solid' },
    ],
  };
}

export function starter(kind: Kind, today = iso(new Date())): Diagram {
  switch (kind) {
    case 'flowchart': return {
      kind, dir: 'LR',
      nodes: [{ id: 'n1', label: 'Start', shape: 'pill' }, { id: 'n2', label: 'Ready?', shape: 'diamond' }, { id: 'n3', label: 'Done', shape: 'pill' }],
      edges: [{ from: 'n1', to: 'n2', label: '', line: 'solid' }, { from: 'n2', to: 'n3', label: 'yes', line: 'solid' }, { from: 'n2', to: 'n1', label: 'no', line: 'dotted' }],
    };
    case 'sequence': return {
      kind, numbered: false,
      people: [{ id: 'p1', name: 'Me', actor: true }, { id: 'p2', name: 'App', actor: false }],
      messages: [{ from: 'p1', to: 'p2', text: 'Ask', reply: false }, { from: 'p2', to: 'p1', text: 'Answer', reply: true }],
    };
    case 'pie': return { kind, title: '', showData: false, slices: [{ label: 'A', value: 50 }, { label: 'B', value: 30 }, { label: 'C', value: 20 }] };
    case 'mindmap': return { kind, root: 'Idea', items: [{ text: 'One', depth: 1 }, { text: 'Detail', depth: 2 }, { text: 'Two', depth: 1 }, { text: 'Three', depth: 1 }] };
    case 'timeline': return { kind, title: '', periods: [{ label: 'Spring', events: ['Plan'] }, { label: 'Summer', events: ['Build', 'Test'] }, { label: 'Fall', events: ['Launch'] }] };
    case 'gantt': return {
      kind, title: '',
      sections: [{ name: 'Plan', tasks: [{ name: 'Research', start: today, days: 3 }] }, { name: 'Build', tasks: [{ name: 'Make it', start: addDays(today, 3), days: 5 }] }],
    };
  }
}

// ---- text inside the code ----
// mermaid reads entity codes (#quot; #58;) in labels: what would end a label is written as one
const ent = (s: string, chars: string) => [...s].map((c) => (chars.includes(c) ? `#${c.charCodeAt(0)};` : c)).join('');
// mermaid reads #name; as the HTML entity &name;: the common ones are read back as their characters (a name not in this
// list makes the code one the forms leave alone, fromCode, so its meaning is never changed by being written anew)
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const unent = (s: string) => s.replace(/#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/#([a-zA-Z]+);/g, (m, n) => NAMED[n] ?? m);
/** a line beginning with one of these is a setting, not a task or a period (mermaid reads them so, in any case):
 *  a name that begins with one has its first letter written as an entity code */
const KEYWORD = /^(title|section|excludes|includes|dateformat|axisformat|tickinterval|todaymarker|weekday|weekend|acctitle|accdescr)\b/i;
const unkeyword = (s: string) => (KEYWORD.test(s) ? `#${s.charCodeAt(0)};${s.slice(1)}` : s);
const one = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim(); // a label is one line
const quoted = (s: string) => `"${ent(one(s), '"#|')}"`;
const unquote = (s: string) => unent(s.trim().replace(/^"(.*)"$/, '$1'));

// ---- flowchart ----
const SHAPES: Record<Shape, [string, string]> = {
  round: ['(', ')'], box: ['[', ']'], pill: ['([', '])'], diamond: ['{', '}'], circle: ['((', '))'], db: ['[(', ')]'],
};
const ARROWS: Record<Line, string> = { solid: '-->', dotted: '-.->', thick: '==>' };

function flowCode(d: Flowchart) {
  const lines = [`flowchart ${d.dir}`];
  const nodeLine = (n: FlowNode, pad: string) => { const [a, b] = SHAPES[n.shape]; return `${pad}${n.id}${a}${quoted(n.label)}${b}`; };
  // swimlanes are subgraphs: each lane's boxes inside its own (any other app draws them as groups); boxes in no lane after
  const lanes = d.lanes ?? [];
  for (const l of lanes) {
    lines.push(`  subgraph ${l.id}[${quoted(l.label)}]`, `    direction ${d.dir}`);
    for (const n of d.nodes) if (n.lane === l.id) lines.push(nodeLine(n, '    '));
    lines.push('  end');
  }
  for (const n of d.nodes) if (!lanes.some((l) => l.id === n.lane)) lines.push(nodeLine(n, '  '));
  const ids = new Set(d.nodes.map((n) => n.id));
  for (const e of d.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    lines.push(`  ${e.from} ${ARROWS[e.line]}${one(e.label) ? `|${quoted(e.label)}|` : ''} ${e.to}`);
  }
  return lines.join('\n');
}

// a node as written: an id, and its shape and label if given here (A, A[Text], A{"Text"}, …). Longer brackets first.
const OPENS = ['([', '[(', '((', '[', '(', '{'];
function readNode(s: string): { id: string; label?: string; shape?: Shape; rest: string } | null {
  const m = /^([A-Za-z0-9_]+)/.exec(s);
  if (!m) return null;
  const id = m[1];
  let rest = s.slice(id.length);
  for (const open of OPENS) {
    if (!rest.startsWith(open)) continue;
    const shape = (Object.keys(SHAPES) as Shape[]).find((k) => SHAPES[k][0] === open)!;
    const close = SHAPES[shape][1];
    // a quoted label ends at its closing quote: the bracket after it closes the shape
    const q = rest[open.length] === '"' ? rest.indexOf('"', open.length + 1) : open.length - 1;
    if (q < 0) return null;
    const end = rest.indexOf(close, q + 1);
    if (end < 0) return null;
    const inner = rest.slice(open.length, end);
    // [/…/], [\…\] and their mixes are parallelograms and trapezoids, shapes the chart cannot keep
    if (open === '[' && !inner.startsWith('"') && /^[/\\]/.test(inner)) return null;
    const label = unquote(inner);
    return { id, label, shape, rest: rest.slice(end + close.length) };
  }
  return { id, rest };
}

function flowRead(lines: string[], head: string): Flowchart | null {
  const dir = /^(?:flowchart|graph)\s+(LR|TD|TB)\s*;?$/.exec(head);
  if (!dir) return null;
  const d: Flowchart = { kind: 'flowchart', dir: dir[1] === 'LR' ? 'LR' : 'TD', nodes: [], edges: [] };
  const seen = new Map<string, FlowNode>();
  let lane: Lane | null = null; // the subgraph being read
  const node = (n: { id: string; label?: string; shape?: Shape }) => {
    let have = seen.get(n.id);
    if (!have) { have = { id: n.id, label: n.label ?? n.id, shape: n.shape ?? 'box' }; seen.set(n.id, have); d.nodes.push(have); }
    else if (n.label !== undefined) { have.label = n.label; have.shape = n.shape!; }
    // in a lane: the lane it is first named in (mermaid's own rule: a box mentioned in a subgraph is in it)
    if (lane && !have.lane) have.lane = lane.id;
    return have;
  };
  for (const raw of lines) {
    const line = raw.trim().replace(/;$/, '');
    // a swimlane: `subgraph id["Label"]` (or id[Label], or a bare id) … `end`; one inside another is more than lanes
    const sub = /^subgraph\s+([A-Za-z0-9_]+)\s*(?:\[(.*)\])?$/.exec(line);
    if (sub) {
      if (lane || (d.lanes ?? []).some((l) => l.id === sub[1]) || seen.has(sub[1])) return null;
      lane = { id: sub[1], label: sub[2] === undefined ? sub[1] : unquote(sub[2]) };
      (d.lanes ??= []).push(lane);
      continue;
    }
    if (line === 'end') { if (!lane) return null; lane = null; continue; }
    if (/^direction\s+(LR|RL|TB|TD|BT)$/.test(line)) { if (!lane) return null; continue; } // written anew with the chart's
    if (/^subgraph\b/.test(line)) return null; // a title with spaces, no id: kept as code
    const a = readNode(line);
    if (!a) return null;
    node(a);
    let rest = a.rest.trim();
    if (!rest) continue;
    const arrow = /^(-->|-\.->|==>)\s*(?:\|([^|]*)\|)?\s*/.exec(rest);
    if (!arrow) return null;
    const b = readNode(rest.slice(arrow[0].length));
    if (!b || b.rest.trim()) return null;
    node(b);
    d.edges.push({ from: a.id, to: b.id, label: arrow[2] === undefined ? '' : unquote(arrow[2]), line: arrow[1] === '-->' ? 'solid' : arrow[1] === '==>' ? 'thick' : 'dotted' });
  }
  if (lane) return null; // a lane never closed
  return d;
}

// ---- sequence ----
// a name can hold what a participant line could not (`as`, spaces): it is written with an id and an alias
function seqCode(d: Sequence) {
  const lines = ['sequenceDiagram'];
  if (d.numbered) lines.push('  autonumber');
  for (const p of d.people) lines.push(`  ${p.actor ? 'actor' : 'participant'} ${p.id} as ${ent(one(p.name) || p.id, ';#')}`);
  const ids = new Set(d.people.map((p) => p.id));
  for (const m of d.messages) {
    if (!ids.has(m.from) || !ids.has(m.to)) continue;
    lines.push(`  ${m.from}${m.reply ? '-->>' : '->>'}${m.to}: ${ent(one(m.text), ';#')}`);
  }
  return lines.join('\n');
}
function seqRead(lines: string[]): Sequence | null {
  const d: Sequence = { kind: 'sequence', people: [], messages: [], numbered: false };
  const person = (id: string) => { if (!d.people.some((p) => p.id === id)) d.people.push({ id, name: id, actor: false }); };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'autonumber') { d.numbered = true; continue; }
    const p = /^(participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/.exec(line);
    if (p) {
      if (d.people.some((x) => x.id === p[2])) return null;
      d.people.push({ id: p[2], name: unent(p[3]?.trim() ?? p[2]), actor: p[1] === 'actor' });
      continue;
    }
    const m = /^([A-Za-z0-9_]+)\s*(-->>|->>)\s*([A-Za-z0-9_]+)\s*:\s?(.*)$/.exec(line);
    if (!m) return null;
    person(m[1]); person(m[3]);
    d.messages.push({ from: m[1], to: m[3], text: unent(m[4].trim()), reply: m[2] === '-->>' });
  }
  return d;
}

// ---- pie ----
// a value as mermaid reads it: no exponent (1e+29 is not a number to it), so kept under a quadrillion
const num = (v: number) => (Number.isFinite(v) && v > 0 ? +Math.min(v, 1e15).toFixed(4) : 0);
function pieCode(d: Pie) {
  const lines = [`pie${d.showData ? ' showData' : ''}`];
  if (one(d.title)) lines.push(`  title ${ent(one(d.title), '#;')}`);
  for (const s of d.slices) lines.push(`  ${quoted(s.label)} : ${num(s.value)}`);
  return lines.join('\n');
}
function pieRead(lines: string[], head: string): Pie | null {
  const h = /^pie(\s+showData)?(?:\s+title\s+(.*))?$/.exec(head);
  if (!h) return null;
  const d: Pie = { kind: 'pie', title: unent(h[2]?.trim() ?? ''), slices: [], showData: !!h[1] };
  for (const raw of lines) {
    const line = raw.trim();
    const t = /^title\s+(.*)$/.exec(line);
    if (t) { d.title = unent(t[1].trim()); continue; }
    const s = /^"((?:[^"]|\\")*)"\s*:\s*(\d+(?:\.\d+)?|\.\d+)$/.exec(line);
    if (!s) return null;
    d.slices.push({ label: unent(s[1]), value: +s[2] });
  }
  return d;
}

// ---- mind map ----
// brackets in a branch's text ((, [, {) would give it a shape: written as entity codes
const branch = (s: string) => ent(s, '()[]{}#');
function mindCode(d: Mindmap) {
  const lines = ['mindmap', `  root((${ent(one(d.root) || 'Idea', '()[]{}#')}))`];
  let depth = 0;
  for (const b of d.items) {
    const text = one(b.text);
    if (!text) continue;
    depth = Math.max(1, Math.min(b.depth, depth + 1)); // one step deeper than the branch above it, at most
    lines.push(`${'  '.repeat(depth + 1)}${branch(text)}`);
  }
  return lines.join('\n');
}
function mindRead(lines: string[]): Mindmap | null {
  const [first, ...rest] = lines;
  const r = first && /^(\s*)root\(\((.*)\)\)$/.exec(first);
  if (!r) return null;
  const base = r[1].length;
  const d: Mindmap = { kind: 'mindmap', root: unent(r[2]), items: [] };
  const indents: number[] = [base];
  for (const raw of rest) {
    const ind = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (ind <= base || /[()[\]{}]/.test(text) || text.startsWith('::')) return null; // a shape, a second root, a class or an icon
    while (indents.length > 1 && ind <= indents[indents.length - 1]) indents.pop();
    indents.push(ind);
    d.items.push({ text: unent(text), depth: indents.length - 1 });
  }
  return d;
}

// ---- timeline ----
function timeCode(d: Timeline) {
  const lines = ['timeline'];
  if (one(d.title)) lines.push(`  title ${ent(one(d.title), ':#')}`);
  for (const p of d.periods) {
    const events = p.events.map(one).filter(Boolean).map((e) => ent(e, ':#'));
    lines.push(`  ${unkeyword(ent(one(p.label) || '…', ':#'))}${events.map((e) => ` : ${e}`).join('')}`);
  }
  return lines.join('\n');
}
function timeRead(lines: string[]): Timeline | null {
  const d: Timeline = { kind: 'timeline', title: '', periods: [] };
  for (const raw of lines) {
    const line = raw.trim();
    const t = /^title\s+(.*)$/i.exec(line);
    if (t) { d.title = unent(t[1].trim()); continue; }
    if (/^section\s/i.test(line)) return null;
    // events part at a colon with a space after it (or the line's end): "10:30" and a URL's "https:" stay whole
    const [label, ...events] = line.split(/\s*:(?:\s+|$)/).map((s) => unent(s.trim()));
    if (!label) { const last = d.periods[d.periods.length - 1]; if (!last) return null; last.events.push(...events); continue; }
    d.periods.push({ label, events });
  }
  return d;
}

// ---- gantt ----
function ganttCode(d: Gantt) {
  const lines = ['gantt', '  dateFormat YYYY-MM-DD'];
  // a tick a day for a fortnight, a week for a season, else a month: mermaid's own choice put hours under days
  const tasks = d.sections.flatMap((s) => s.tasks);
  if (tasks.length) {
    const from = tasks.map((t) => t.start).sort()[0], to = tasks.map((t) => addDays(t.start, t.days)).sort().pop()!;
    const span = (Date.parse(to) - Date.parse(from)) / 864e5;
    lines.push(span <= 16 ? '  tickInterval 1day' : span <= 120 ? '  tickInterval 1week' : '  tickInterval 1month');
    if (span > 120) lines.push('  axisFormat %Y-%m');
  }
  if (one(d.title)) lines.push(`  title ${ent(one(d.title), '#;')}`);
  for (const s of d.sections) {
    lines.push(`  section ${ent(one(s.name) || 'Tasks', '#;')}`);
    for (const t of s.tasks) lines.push(`    ${unkeyword(ent(one(t.name) || 'Task', ':#;'))} : ${t.start}, ${Math.max(1, Math.round(t.days) || 1)}d`);
  }
  return lines.join('\n');
}
const realDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
function ganttRead(lines: string[]): Gantt | null {
  const d: Gantt = { kind: 'gantt', title: '', sections: [] };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'dateFormat YYYY-MM-DD' || /^tickInterval 1(day|week|month)$/.test(line) || line === 'axisFormat %Y-%m') continue; // written anew
    const t = /^title\s+(.*)$/i.exec(line);
    if (t) { d.title = unent(t[1].trim()); continue; }
    const s = /^section\s+(.*)$/i.exec(line);
    if (s) { d.sections.push({ name: unent(s[1].trim()), tasks: [] }); continue; }
    const k = /^(.+?)\s*:\s*(\d{4}-\d{2}-\d{2}),\s*(\d+)d$/.exec(line);
    // a real day (2024-13-01 and 2024-02-30 are not), and a length under a century
    if (!k || !realDay(k[2]) || +k[3] > 36500) return null;
    if (!d.sections.length) d.sections.push({ name: 'Tasks', tasks: [] });
    d.sections[d.sections.length - 1].tasks.push({ name: unent(k[1]), start: k[2], days: +k[3] });
  }
  return d;
}

export function toCode(d: Diagram): string {
  switch (d.kind) {
    case 'flowchart': return flowCode(d);
    case 'sequence': return seqCode(d);
    case 'pie': return pieCode(d);
    case 'mindmap': return mindCode(d);
    case 'timeline': return timeCode(d);
    case 'gantt': return ganttCode(d);
  }
}

/** a diagram's code as the builder's chart, or null: not a kind it makes, or written beyond what it can show */
export function fromCode(code: string): Diagram | null {
  // an entity the forms would not read back (#copy;): written anew it would change, so the code is left as it is
  for (const m of code.matchAll(/#([a-zA-Z]+);/g)) if (!(m[1] in NAMED)) return null;
  const lines = code.split('\n').filter((l) => l.trim() && !/^\s*%%/.test(l) === true);
  if (lines.length !== code.split('\n').filter((l) => l.trim()).length) return null; // a %% comment would be lost
  const head = lines.shift()?.trim() ?? '';
  const word = head.split(/\s+/)[0];
  if (word === 'flowchart' || word === 'graph') return flowRead(lines, head);
  if (head === 'sequenceDiagram') return seqRead(lines);
  if (word === 'pie') return pieRead(lines, head);
  if (head === 'mindmap') return mindRead(lines);
  if (head === 'timeline') return timeRead(lines);
  if (head === 'gantt') return ganttRead(lines);
  return null;
}

/** a fresh id for a node or a person, not one the chart has */
export function freshId(prefix: string, taken: { id: string }[]) {
  for (let i = taken.length + 1; ; i++) if (!taken.some((t) => t.id === `${prefix}${i}`)) return `${prefix}${i}`;
}
