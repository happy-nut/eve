/**
 * The charts a note's diagrams are edited as (DiagramBlock.svelte) as data, and as the mermaid code a note keeps. The
 * note stores only the code: what is drawn is written out (toCode), and a diagram opened again is read back from its code
 * (fromCode). Read back is strict: a line the builder would not have written (a style, a subgraph, a comment) makes it
 * null, and the diagram is edited as code, so nothing written by hand is lost to a form that cannot show it.
 */

export type Shape = 'round' | 'box' | 'pill' | 'diamond' | 'circle' | 'db';
export type Line = 'solid' | 'dotted' | 'thick';
export interface FlowNode {
  id: string; label: string; shape: Shape; /** the swimlane it is in (a lane's id), if the chart has lanes */ lane?: string;
  /** a shape as written that the forms have no button for ([/…/], {{…}}, [[…]], >…]): kept while its shape is left alone */
  raw?: { open: string; close: string; as: Shape };
  /** mermaid's `:::class` on it, kept */
  cls?: string;
}
/** a swimlane: who or what does the steps in it (mermaid's subgraph) */
export interface Lane { id: string; label: string }
export interface FlowEdge {
  from: string; to: string; label: string; line: Line;
  /** the arrow as written when it is not one the forms make (---, --o, --x, <-->, --->): kept while its line is left alone */
  arrow?: string;
}
export interface Flowchart {
  kind: 'flowchart'; dir: 'LR' | 'TD' | 'RL' | 'BT'; nodes: FlowNode[]; edges: FlowEdge[]; lanes?: Lane[];
  /** what a chart pasted in says that the forms do not show (style, classDef, class, linkStyle, click, %% comments): kept
   *  as written, after the chart; `pre`: what came before its first line (a %%{init}%% setting) */
  extra?: string[]; pre?: string[];
}
/** the chart goes across (left to right, or right to left), not down */
export const across = (d: Pick<Flowchart, 'dir'>) => d.dir === 'LR' || d.dir === 'RL';

export interface Person { id: string; name: string; actor: boolean }
export interface Message {
  from: string; to: string; text: string; reply: boolean;
  /** the arrow as written when it is not one the forms make (->, -x, -), <<->>): kept while it sends or replies as it did */
  arrow?: string;
  /** `+`: the receiver's activation bar starts; `-`: the sender's ends */
  act?: '+' | '-';
}
export type NoteAt = 'over' | 'left of' | 'right of';
export interface SeqNote { note: NoteAt; who: string[]; text: string }
/** a group of messages (a loop, alternatives…) opened, divided (else, and, option) or closed (end) */
export type BlockKind = 'loop' | 'alt' | 'else' | 'opt' | 'par' | 'and' | 'critical' | 'option' | 'break' | 'rect' | 'end';
export interface SeqBlock { block: BlockKind; text: string }
/** a line the forms do not show (activate, a title, a link, a comment…), kept where it is, as written */
export interface Raw { raw: string }
export type Step = Message | SeqNote | SeqBlock | Raw;
export const isMessage = (s: Step): s is Message => 'from' in s;
/** `messages`: its steps in order, the messages and what stands between them */
export interface Sequence { kind: 'sequence'; people: Person[]; messages: Step[]; numbered: boolean }

export interface Slice { label: string; value: number }
export interface Pie { kind: 'pie'; title: string; slices: Slice[]; showData: boolean }

export interface Branch { text: string; depth: number } // depth 1: under the centre
export interface Mindmap { kind: 'mindmap'; root: string; items: Branch[] }

export interface Period { label: string; events: string[] }
export interface Timeline { kind: 'timeline'; title: string; periods: Period[] }

export interface Task {
  name: string; start: string; days: number;
  /** its id (other tasks start after it) and its tags (done, active, crit, milestone) */
  id?: string; tags?: string[];
  /** it starts when the tasks with these ids end (spaces between), or, '', when the one before it ends: not on `start` */
  after?: string;
}
export interface Phase { name: string; tasks: Task[] }
/** `extra`: settings the forms do not show (excludes, todayMarker, an axis format…), kept as written */
export interface Gantt { kind: 'gantt'; title: string; sections: Phase[]; extra?: string[] }

export type Dir = 'TB' | 'BT' | 'LR' | 'RL';
/** a class diagram: `members` as written ("+String name", "+run() bool", "<<interface>>") */
export interface ClassBox { id: string; name: string; members: string[]; /** written on a line of its own */ decl?: true }
/** `arrow`: <|--, *--, o--, -->, --, ..>, ..|>, .. (or as written); the cards: how many at each end ("1", "*") */
export interface ClassLink { from: string; to: string; arrow: string; label: string; fromCard: string; toCard: string }
/** `extra`: what the forms do not show (notes, styles, namespaces, comments), kept as written, after the rest */
export interface ClassDiagram { kind: 'class'; dir?: Dir; classes: ClassBox[]; links: ClassLink[]; extra?: string[] }

/** a state diagram: `[*]` is where it starts (as a from) and ends (as a to) */
export interface StateBox { id: string; name: string; desc: string; decl?: true }
export interface StateLink { from: string; to: string; label: string }
export interface StateDiagram { kind: 'state'; v2: boolean; dir?: Dir; states: StateBox[]; links: StateLink[]; extra?: string[] }

/** database tables (erDiagram): a column's `keys` as written ("PK", "PK, FK") */
export interface Column { type: string; name: string; keys: string; comment: string }
export interface Table { id: string; name: string; columns: Column[]; decl?: true }
/** `left`/`right`: how many on each side, as mermaid writes it (||, |o, }|, }o and their mirrors) */
export interface Relation { from: string; to: string; left: string; right: string; dashed: boolean; label: string }
export interface ErDiagram { kind: 'er'; dir?: Dir; tables: Table[]; links: Relation[]; extra?: string[] }

export type Diagram = Flowchart | Sequence | Pie | Mindmap | Timeline | Gantt | ClassDiagram | StateDiagram | ErDiagram;
export type Kind = Diagram['kind'];

export const KINDS: { kind: Kind; label: string; hint: string }[] = [
  { kind: 'flowchart', label: 'Flowchart', hint: 'Steps, choices and where they lead' },
  { kind: 'sequence', label: 'Sequence', hint: 'Who says what to whom, in order' },
  { kind: 'pie', label: 'Pie chart', hint: 'Parts of a whole' },
  { kind: 'mindmap', label: 'Mind map', hint: 'Ideas branching from one' },
  { kind: 'timeline', label: 'Timeline', hint: 'What happened when' },
  { kind: 'gantt', label: 'Gantt', hint: 'Tasks on a calendar' },
  { kind: 'class', label: 'Class diagram', hint: 'Classes, what they hold and how they relate' },
  { kind: 'state', label: 'State diagram', hint: 'States and what moves between them' },
  { kind: 'er', label: 'Database tables', hint: 'Tables, their columns and how they relate' },
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
    case 'class': return {
      kind,
      classes: [
        { id: 'Animal', name: 'Animal', members: ['+String name', '+eat()'] },
        { id: 'Dog', name: 'Dog', members: ['+bark()'] },
        { id: 'Owner', name: 'Owner', members: ['+String name'] },
      ],
      links: [
        { from: 'Animal', to: 'Dog', arrow: '<|--', label: '', fromCard: '', toCard: '' },
        { from: 'Owner', to: 'Dog', arrow: '-->', label: 'walks', fromCard: '1', toCard: '*' },
      ],
    };
    case 'state': return {
      kind, v2: true,
      states: [{ id: 'Draft', name: 'Draft', desc: '' }, { id: 'Review', name: 'Review', desc: '' }, { id: 'Done', name: 'Done', desc: '' }],
      links: [
        { from: '[*]', to: 'Draft', label: '' }, { from: 'Draft', to: 'Review', label: 'submit' },
        { from: 'Review', to: 'Draft', label: 'changes' }, { from: 'Review', to: 'Done', label: 'approve' }, { from: 'Done', to: '[*]', label: '' },
      ],
    };
    case 'er': return {
      kind,
      tables: [
        { id: 'CUSTOMER', name: 'CUSTOMER', columns: [{ type: 'int', name: 'id', keys: 'PK', comment: '' }, { type: 'string', name: 'name', keys: '', comment: '' }] },
        { id: 'ORDER', name: 'ORDER', columns: [{ type: 'int', name: 'id', keys: 'PK', comment: '' }, { type: 'int', name: 'customer_id', keys: 'FK', comment: '' }] },
      ],
      links: [{ from: 'CUSTOMER', to: 'ORDER', left: '||', right: 'o{', dashed: false, label: 'places' }],
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
const KEYWORD = /^(title|section|excludes|includes|dateformat|axisformat|tickinterval|todaymarker|weekday|weekend|acctitle|accdescr|displaymode|inclusiveenddates|topaxis)\b/i;
const unkeyword = (s: string) => (KEYWORD.test(s) ? `#${s.charCodeAt(0)};${s.slice(1)}` : s);
const one = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim(); // a label is one line
const quoted = (s: string) => `"${ent(one(s), '"#|')}"`;
const unquote = (s: string) => unent(s.trim().replace(/^"(.*)"$/, '$1'));
// a flowchart's label may hold line breaks: written as mermaid's <br>, read back as the breaks they were
const brQuoted = (s: string) => `"${ent(s.split('\n').map(one).join('\n').replace(/^\n+|\n+$/g, ''), '"#|').replace(/\n/g, '<br>')}"`;
const unlines = (s: string) => unquote(s).replace(/<br\s*\/?>/gi, '\n');

// ---- flowchart ----
const SHAPES: Record<Shape, [string, string]> = {
  round: ['(', ')'], box: ['[', ']'], pill: ['([', '])'], diamond: ['{', '}'], circle: ['((', '))'], db: ['[(', ')]'],
};
const ARROWS: Record<Line, string> = { solid: '-->', dotted: '-.->', thick: '==>' };

/** an arrow as written: its kind of line (= thick, . dotted, - solid) */
const lineOf = (arrow: string): Line => (arrow.includes('=') ? 'thick' : arrow.includes('.') ? 'dotted' : 'solid');

function flowCode(d: Flowchart) {
  const lines = [...(d.pre ?? []), `flowchart ${d.dir}`];
  const shapeOf = (n: FlowNode) => (n.raw && n.raw.as === n.shape ? [n.raw.open, n.raw.close] : SHAPES[n.shape]);
  const nodeLine = (n: FlowNode, pad: string) => { const [a, b] = shapeOf(n); return `${pad}${n.id}${a}${brQuoted(n.label)}${b}${n.cls ? `:::${n.cls}` : ''}`; };
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
    const arrow = e.arrow && lineOf(e.arrow) === e.line ? e.arrow : ARROWS[e.line];
    lines.push(`  ${e.from} ${arrow}${one(e.label) ? `|${brQuoted(e.label)}|` : ''} ${e.to}`);
  }
  for (const x of d.extra ?? []) lines.push(`  ${x}`);
  return lines.join('\n');
}

// a node as written: an id, and its shape and label if given here (A, A[Text], A{"Text"}, A[/Text/], …), and a :::class
// after it. Longer brackets first; the ones the forms have no button for are kept as written (raw), drawn as `as`.
const OPENS: [string, string[], Shape, boolean][] = [
  ['(((', [')))'], 'circle', true], ['([', ['])'], 'pill', false], ['[[', [']]'], 'box', true], ['[(', [')]'], 'db', false],
  ['((', ['))'], 'circle', false], ['{{', ['}}'], 'diamond', true], ['[/', ['/]', '\\]'], 'box', true], ['[\\', ['\\]', '/]'], 'box', true],
  ['[', [']'], 'box', false], ['(', [')'], 'round', false], ['{', ['}'], 'diamond', false], ['>', [']'], 'box', true],
];
// an id: letters and digits of any script (시작 --> 끝), and _ (a "-" would run into the arrow after it)
const ID = /^[\p{L}\p{N}_]+/u;
function readNode(s: string): { id: string; label?: string; shape?: Shape; raw?: FlowNode['raw']; cls?: string; rest: string } | null {
  const m = ID.exec(s);
  if (!m) return null;
  const id = m[0];
  let rest = s.slice(id.length);
  const withClass = <T extends { rest: string; cls?: string }>(n: T): T => {
    const c = /^:::([\w-]+)/.exec(n.rest);
    return c ? { ...n, cls: c[1], rest: n.rest.slice(c[0].length) } : n;
  };
  for (const [open, closes, shape, kept] of OPENS) {
    if (!rest.startsWith(open)) continue;
    // a quoted label ends at its closing quote: the bracket after it closes the shape
    const q = rest[open.length] === '"' ? rest.indexOf('"', open.length + 1) : open.length - 1;
    if (q < 0) return null;
    const found = closes.map((c) => [c, rest.indexOf(c, q + 1)] as const).filter(([, at]) => at >= 0).sort((x, y) => x[1] - y[1])[0];
    if (!found) return null;
    const [close, end] = found;
    const label = unlines(rest.slice(open.length, end));
    rest = rest.slice(end + close.length);
    return withClass({ id, label, shape, ...(kept ? { raw: { open, close, as: shape } } : {}), rest });
  }
  return withClass({ id, rest });
}
/** boxes joined by & (A & B --> C): each, and what follows them */
function readNodes(s: string): { nodes: NonNullable<ReturnType<typeof readNode>>[]; rest: string } | null {
  const nodes = [];
  let rest = s;
  for (;;) {
    const n = readNode(rest.trimStart());
    if (!n) return null;
    nodes.push(n);
    rest = n.rest.trimStart();
    if (!rest.startsWith('&')) return { nodes, rest };
    rest = rest.slice(1);
  }
}
/** an arrow at the start of `s`, and its label: -->, ---, -.->, ==>, --o, --x, <-->, --->, with |a label| after it, or
 *  written inside it (-- a label -->, -. a label .->, == a label ==>) */
function readArrow(s: string): { arrow: string; label: string; rest: string } | null {
  const inside = /^([<ox]?)(--|-\.|==)\s+(.*?)\s+(-{2,}|\.+-|={2,})([>ox]?)(?![-=.])/u.exec(s);
  if (inside && !/^[-=.]/.test(inside[3])) {
    const close = inside[4] + inside[5];
    const arrow = inside[1] + (inside[2] === '-.' ? '-' + close : close);
    return { arrow, label: inside[3], rest: s.slice(inside[0].length) };
  }
  const bare = /^([<ox]?)(-{2,}|-\.+-|={2,})([>ox]?)\s*(?:\|([^|]*)\|)?/.exec(s);
  if (!bare || bare[0].trim() === '') return null;
  return { arrow: bare[1] + bare[2] + bare[3], label: bare[4] ?? '', rest: s.slice(bare[0].length) };
}
/** a line's statements: mermaid takes `;` between them, outside a label's quotes or brackets */
function statements(line: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = false, from = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quote = !quote;
    else if (!quote && '[({'.includes(c)) depth++;
    else if (!quote && '])}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (!quote && !depth && c === ';') { out.push(line.slice(from, i)); from = i + 1; }
  }
  out.push(line.slice(from));
  return out.map((x) => x.trim()).filter(Boolean);
}
/** a line the forms do not show, kept as written: styles, classes, a link's style, a click, a comment, accessibility */
const KEPT = /^(%%|style\s|classDef\s|class\s|linkStyle\s|click\s|accTitle\b|accDescr\b)/;

function flowRead(lines: string[], head: string, pre: string[] = []): Flowchart | null {
  const dir = /^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)\s*;?$/.exec(head) ?? (/^(?:flowchart|graph)\s*;?$/.test(head) ? [head, 'TD'] : null);
  if (!dir) return null;
  const d: Flowchart = { kind: 'flowchart', dir: dir[1] === 'TB' ? 'TD' : (dir[1] as Flowchart['dir']), nodes: [], edges: [] };
  if (pre.length) d.pre = pre;
  const seen = new Map<string, FlowNode>();
  let lane: Lane | null = null; // the subgraph being read
  const node = (n: { id: string; label?: string; shape?: Shape; raw?: FlowNode['raw']; cls?: string }) => {
    let have = seen.get(n.id);
    if (!have) { have = { id: n.id, label: n.label ?? n.id, shape: n.shape ?? 'box' }; seen.set(n.id, have); d.nodes.push(have); }
    else if (n.label !== undefined) { have.label = n.label; have.shape = n.shape!; delete have.raw; }
    if (n.raw) have.raw = n.raw;
    if (n.cls) have.cls = n.cls;
    // in a lane: the lane it is first named in (mermaid's own rule: a box mentioned in a subgraph is in it)
    if (lane && !have.lane) have.lane = lane.id;
    return have;
  };
  const keep = (x: string) => (d.extra ??= []).push(x);
  for (const raw of lines) {
    const whole = raw.trim();
    if (KEPT.test(whole)) { keep(whole); continue; }
    for (const line of statements(whole)) {
      if (KEPT.test(line)) { keep(line); continue; }
      // a swimlane: `subgraph id["Label"]` (or id[Label], or a bare id, or a title of words) … `end`; one inside
      // another is more than lanes
      const sub = /^subgraph\s+([\p{L}\p{N}_]+)\s*(?:\[(.*)\])?$/u.exec(line) ?? /^subgraph\s+(.+)$/.exec(line);
      if (sub) {
        if (lane) return null;
        const words = sub.length === 2 || (sub[2] === undefined && /\s/.test(sub[1]));
        const id = words ? freshId('L', [...(d.lanes ?? []), ...d.nodes]) : sub[1];
        if ((d.lanes ?? []).some((l) => l.id === id) || seen.has(id)) return null;
        lane = { id, label: words ? unquote(sub[1]) : sub[2] === undefined ? sub[1] : unquote(sub[2]) };
        (d.lanes ??= []).push(lane);
        continue;
      }
      if (line === 'end') { if (!lane) return null; lane = null; continue; }
      if (/^direction\s+(LR|RL|TB|TD|BT)$/.test(line)) { if (!lane) return null; continue; } // written anew with the chart's
      // boxes, and the arrows between them: A --> B, A --> B --> C, A & B --> C & D
      let group = readNodes(line);
      if (!group) return null;
      let from = group.nodes.map(node);
      let rest = group.rest;
      while (rest) {
        const arrow = readArrow(rest);
        if (!arrow) return null;
        group = readNodes(arrow.rest);
        if (!group) return null;
        const to = group.nodes.map(node);
        const line_ = lineOf(arrow.arrow);
        for (const a of from) for (const b of to) d.edges.push({ from: a.id, to: b.id, label: unlines(arrow.label), line: line_, ...(arrow.arrow !== ARROWS[line_] ? { arrow: arrow.arrow } : {}) });
        from = to;
        rest = group.rest;
      }
    }
  }
  if (lane) return null; // a lane never closed
  return d;
}

// ---- sequence ----
// a participant's id as mermaid reads it: any letters (사용자->>앱), not a sign an arrow or a note's comma starts with
const SID = String.raw`[^\s,:;+<>\-]+`;
const SEQ_ARROW = String.raw`<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->`;
const PARTICIPANT = new RegExp(String.raw`^(participant|actor)\s+(${SID})(?:\s+as\s+(.+))?$`);
const MESSAGE = new RegExp(String.raw`^(${SID})\s*(${SEQ_ARROW})\s*([+-]?)\s*(${SID})\s*(?::\s?(.*))?$`);
const NOTE = new RegExp(String.raw`^note\s+(over|left of|right of)\s+(${SID})(?:\s*,\s*(${SID}))?\s*:\s?(.*)$`, 'i');
const BLOCK = /^(loop|alt|else|opt|par|and|critical|option|break|rect)\b\s*(.*)$/;
const OPENS_BLOCK = new Set(['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect']);
/** an arrow replies when it is dashed (-->>, --x, --)) */
const replies = (arrow: string) => arrow.replace(/^<</, '').startsWith('--');
// a name can hold what a participant line could not (`as`, spaces): it is written with an id and an alias
function seqCode(d: Sequence) {
  const lines = ['sequenceDiagram'];
  if (d.numbered) lines.push('  autonumber');
  for (const p of d.people) lines.push(`  ${p.actor ? 'actor' : 'participant'} ${p.id} as ${ent(one(p.name) || p.id, ';#')}`);
  const ids = new Set(d.people.map((p) => p.id));
  let depth = 1; // a group's lines indented under it
  const pad = (n: number) => '  '.repeat(Math.max(1, n));
  const says = (text: string) => (one(text) ? `: ${ent(one(text), ';#')}` : ':');
  for (const st of d.messages) {
    if ('raw' in st) { lines.push(`${pad(depth)}${st.raw}`); continue; }
    if ('block' in st) {
      if (st.block === 'end') { depth = Math.max(1, depth - 1); lines.push(`${pad(depth)}end`); continue; }
      const opens = OPENS_BLOCK.has(st.block);
      lines.push(`${pad(opens ? depth : depth - 1)}${st.block}${one(st.text) ? ` ${ent(one(st.text), ';#')}` : ''}`);
      if (opens) depth++;
      continue;
    }
    if ('note' in st) {
      const who = st.who.filter((w) => ids.has(w)).slice(0, st.note === 'over' ? 2 : 1);
      if (who.length) lines.push(`${pad(depth)}Note ${st.note} ${who.join(',')}${says(st.text)}`);
      continue;
    }
    if (!ids.has(st.from) || !ids.has(st.to)) continue;
    const arrow = st.arrow && replies(st.arrow) === st.reply ? st.arrow : st.reply ? '-->>' : '->>';
    lines.push(`${pad(depth)}${st.from}${arrow}${st.act ?? ''}${st.to}${says(st.text)}`);
  }
  return lines.join('\n');
}
function seqRead(lines: string[]): Sequence | null {
  const d: Sequence = { kind: 'sequence', people: [], messages: [], numbered: false };
  const person = (id: string) => { if (!d.people.some((p) => p.id === id)) d.people.push({ id, name: id, actor: false }); };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'autonumber') { d.numbered = true; continue; }
    if (/^box\b/.test(line)) return null; // participants in a box: their lines go together, which the form cannot keep
    const p = PARTICIPANT.exec(line);
    if (p) {
      if (d.people.some((x) => x.id === p[2])) return null;
      d.people.push({ id: p[2], name: unent(p[3]?.trim() ?? p[2]), actor: p[1] === 'actor' });
      continue;
    }
    const m = MESSAGE.exec(line);
    if (m) {
      person(m[1]); person(m[4]);
      const msg: Message = { from: m[1], to: m[4], text: unent((m[5] ?? '').trim()), reply: replies(m[2]) };
      if (m[2] !== '->>' && m[2] !== '-->>') msg.arrow = m[2];
      if (m[3]) msg.act = m[3] as '+' | '-';
      d.messages.push(msg);
      continue;
    }
    const n = NOTE.exec(line);
    if (n) {
      const who = [n[2], ...(n[3] ? [n[3]] : [])];
      who.forEach(person);
      d.messages.push({ note: n[1].toLowerCase() as NoteAt, who, text: unent(n[4].trim()) });
      continue;
    }
    if (line === 'end') { d.messages.push({ block: 'end', text: '' }); continue; }
    const b = BLOCK.exec(line);
    if (b) { d.messages.push({ block: b[1] as BlockKind, text: unent(b[2].trim()) }); continue; }
    d.messages.push({ raw: line });
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
const TAGS = new Set(['done', 'active', 'crit', 'milestone']);
/** each task's start and length as drawn: a task after others starts when the last of them ends, one after the one
 *  before it when that ends (one after ids that name none, on the chart's first day) */
export function ganttDates(d: Gantt): Map<Task, { start: string; days: number }> {
  const out = new Map<Task, { start: string; days: number }>();
  const all = d.sections.flatMap((s) => s.tasks);
  const first = all.filter((t) => t.after === undefined).map((t) => t.start).sort()[0] ?? iso(new Date());
  const byId = new Map(all.filter((t) => t.id).map((t) => [t.id!, t]));
  const end = (t: Task | undefined) => { const r = t && out.get(t); return r ? addDays(r.start, r.days) : null; };
  let prev: Task | undefined;
  for (const t of all) {
    const start = t.after === undefined ? t.start
      : t.after === '' ? end(prev) ?? first
      : t.after.split(' ').map((id) => end(byId.get(id))).filter((x): x is string => !!x).sort().pop() ?? first;
    out.set(t, { start, days: t.days });
    prev = t;
  }
  return out;
}
function ganttCode(d: Gantt) {
  const lines = ['gantt', '  dateFormat YYYY-MM-DD'];
  const dates = ganttDates(d);
  // a tick a day for a fortnight, a week for a season, else a month: mermaid's own choice put hours under days
  const spans = [...dates.values()];
  if (spans.length && !(d.extra ?? []).some((x) => /^(tickInterval|axisFormat)\b/i.test(x))) {
    const from = spans.map((t) => t.start).sort()[0], to = spans.map((t) => addDays(t.start, t.days)).sort().pop()!;
    const span = (Date.parse(to) - Date.parse(from)) / 864e5;
    lines.push(span <= 16 ? '  tickInterval 1day' : span <= 120 ? '  tickInterval 1week' : '  tickInterval 1month');
    if (span > 120) lines.push('  axisFormat %Y-%m');
  }
  if (one(d.title)) lines.push(`  title ${ent(one(d.title), '#;')}`);
  for (const x of d.extra ?? []) lines.push(`  ${x}`);
  for (const s of d.sections) {
    lines.push(`  section ${ent(one(s.name) || 'Tasks', '#;')}`);
    for (const t of s.tasks) {
      const days = `${Math.max(t.tags?.includes('milestone') ? 0 : 1, Math.round(t.days) || 0)}d`;
      // after the one before it: the length alone, as mermaid reads it; with an id too, its date (an id and a length
      // alone would be read as a start and a length)
      const start = t.after === undefined ? t.start : t.after ? `after ${t.after}` : t.id ? dates.get(t)!.start : null;
      const meta = [...(t.tags ?? []), ...(t.id ? [t.id] : []), ...(start ? [start] : []), days];
      lines.push(`    ${unkeyword(ent(one(t.name) || 'Task', ':#;'))} : ${meta.join(', ')}`);
    }
  }
  return lines.join('\n');
}
const realDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && realDay(s);
/** a setting the forms do not show, kept as written */
const GANTT_KEPT = /^(excludes|includes|todayMarker|weekday|weekend|axisFormat|tickInterval|displayMode|inclusiveEndDates|topAxis|accTitle|accDescr)\b/i;
function ganttRead(lines: string[]): Gantt | null {
  const d: Gantt = { kind: 'gantt', title: '', sections: [] };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'dateFormat YYYY-MM-DD' || /^tickInterval 1(day|week|month)$/.test(line) || line === 'axisFormat %Y-%m') continue; // written anew
    if (/^dateFormat\b/i.test(line)) return null; // its dates in another form: the date fields would misread them
    if (GANTT_KEPT.test(line)) { (d.extra ??= []).push(line); continue; }
    const t = /^title\s+(.*)$/i.exec(line);
    if (t) { d.title = unent(t[1].trim()); continue; }
    const s = /^section\s+(.*)$/i.exec(line);
    if (s) { d.sections.push({ name: unent(s[1].trim()), tasks: [] }); continue; }
    const k = /^(.+?)\s*:\s*(.+)$/.exec(line);
    if (!k) return null;
    const meta = k[2].split(',').map((x) => x.trim());
    const tags: string[] = [];
    while (meta.length > 1 && TAGS.has(meta[0])) tags.push(meta.shift()!);
    if (meta.length > 3 || !meta.every(Boolean)) return null;
    // mermaid's own reading: [id,] start, length, or the length alone (after the task before)
    const [id, from, len] = meta.length === 3 ? meta : meta.length === 2 ? [undefined, ...meta] : [undefined, undefined, meta[0]];
    if (id !== undefined && !/^[\w-]+$/.test(id)) return null;
    const task: Task = { name: unent(k[1]), start: '', days: 0 };
    if (from === undefined) task.after = '';
    else if (/^after\s+[\w-]+(\s+[\w-]+)*$/.test(from)) task.after = from.replace(/^after\s+/, '').replace(/\s+/g, ' ');
    else if (isDay(from)) task.start = from;
    else return null;
    const n = /^(\d+)([dw])$/.exec(len);
    if (n) task.days = +n[1] * (n[2] === 'w' ? 7 : 1);
    else if (isDay(len) && task.start) task.days = Math.round((Date.parse(len) - Date.parse(task.start)) / 864e5);
    else return null;
    // a real length under a century (a milestone's may be none)
    if (task.days > 36500 || task.days < 0 || (!task.days && !tags.includes('milestone'))) return null;
    if (id) task.id = id;
    if (tags.length) task.tags = tags;
    if (!d.sections.length) d.sections.push({ name: 'Tasks', tasks: [] });
    d.sections[d.sections.length - 1].tasks.push(task);
  }
  return d;
}

// ---- class, state and table diagrams: what the forms show read and written, any other line kept as written ----
const DIRECTION = /^direction\s+(TB|BT|LR|RL)$/;
/** the last line of the `{ … }` block opening at `at`: kept whole, as one statement */
function blockEnd(lines: string[], at: number): number {
  let depth = 0;
  for (let i = at; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) ?? []).length - (lines[i].match(/\}/g) ?? []).length;
    if (depth <= 0) return i;
  }
  return lines.length - 1;
}
/** lines `from`…`to` as one kept statement, indented as they were under its first */
function block(lines: string[], from: number, to: number) {
  const pad = lines[from].length - lines[from].trimStart().length;
  return lines.slice(from, to + 1).map((l) => l.slice(Math.min(pad, l.length - l.trimStart().length)).trimEnd()).join('\n');
}
/** a kept statement written back, each of its lines under the diagram's */
const kept = (x: string) => x.split('\n').map((l) => `  ${l}`).join('\n');

const CID = String.raw`[\p{L}\p{N}_]+(?:~[^~\s]+~)?`;
const CLASS_ARROW = String.raw`(?:<\|?|\*|o)?(?:--|\.\.)(?:\|?>|\*|o)?`;
const CLASS_LINK = new RegExp(String.raw`^(${CID})\s*(?:"([^"]*)"\s*)?(${CLASS_ARROW})\s*(?:"([^"]*)"\s*)?(${CID})\s*(?::\s*(.*))?$`, 'u');
const CLASS_HEAD = new RegExp(String.raw`^class\s+(${CID})(?:\["([^"]*)"\])?\s*(\{\s*\}?)?$`, 'u');
const CLASS_MEMBER = new RegExp(String.raw`^(${CID})\s*:\s*(.+)$`, 'u');
const CLASS_NOTE = new RegExp(String.raw`^(<<[^>]+>>)\s+(${CID})$`, 'u');
function classCode(d: ClassDiagram) {
  const lines = ['classDiagram'];
  if (d.dir) lines.push(`  direction ${d.dir}`);
  for (const c of d.classes) {
    const named = !!one(c.name) && one(c.name) !== c.id;
    const members = c.members.map(one).filter(Boolean);
    if (named) {
      // a class with a label takes its members one a line (`Id : member`): mermaid reads both of a class so
      lines.push(`  class ${c.id}["${one(c.name).replace(/"/g, "'")}"]`);
      for (const m of members) lines.push(`  ${c.id} : ${m}`);
    } else if (members.length) lines.push(`  class ${c.id} {`, ...members.map((m) => `    ${m}`), '  }');
    else if (c.decl) lines.push(`  class ${c.id}`);
  }
  const ids = new Set(d.classes.map((c) => c.id));
  const card = (s: string) => one(s).replace(/"/g, '');
  for (const l of d.links) {
    if (!ids.has(l.from) || !ids.has(l.to)) continue;
    const a = card(l.fromCard), b = card(l.toCard);
    lines.push(`  ${l.from}${a ? ` "${a}"` : ''} ${l.arrow} ${b ? `"${b}" ` : ''}${l.to}${one(l.label) ? ` : ${one(l.label)}` : ''}`);
  }
  for (const x of d.extra ?? []) lines.push(kept(x));
  return lines.join('\n');
}
function classRead(lines: string[]): ClassDiagram | null {
  const d: ClassDiagram = { kind: 'class', classes: [], links: [] };
  const box = (id: string) => {
    let c = d.classes.find((x) => x.id === id);
    if (!c) { c = { id, name: id, members: [] }; d.classes.push(c); }
    return c;
  };
  const all = lines.map((l) => l.trim());
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    const dir = DIRECTION.exec(line);
    if (dir) { d.dir = dir[1] as Dir; continue; }
    const c = CLASS_HEAD.exec(line);
    if (c) {
      const b = box(c[1]);
      if (c[2] !== undefined) b.name = c[2];
      if (c[3] === '{') {
        const end = all.indexOf('}', i);
        if (end < 0) return null;
        b.members.push(...all.slice(i + 1, end).filter(Boolean));
        i = end;
      }
      if (c[2] === undefined) b.decl = true;
      continue;
    }
    const l = CLASS_LINK.exec(line);
    if (l) {
      box(l[1]); box(l[5]);
      d.links.push({ from: l[1], to: l[5], arrow: l[3], label: l[6]?.trim() ?? '', fromCard: l[2] ?? '', toCard: l[4] ?? '' });
      continue;
    }
    const m = CLASS_MEMBER.exec(line);
    if (m) { box(m[1]).members.push(m[2].trim()); continue; }
    const a = CLASS_NOTE.exec(line);
    if (a) { box(a[2]).members.unshift(a[1]); continue; }
    if (line.endsWith('{')) { const end = blockEnd(all, i); (d.extra ??= []).push(block(lines, i, end)); i = end; continue; }
    (d.extra ??= []).push(line);
  }
  // declared on a line of its own only when that is all there is of it (members or a label write it anyway)
  for (const b of d.classes) if (b.decl && (b.members.length || b.name !== b.id)) delete b.decl;
  return d;
}

const STATE_ID = String.raw`[\p{L}\p{N}_]+`;
const STATE_END = String.raw`\[\*\]|${STATE_ID}`;
const STATE_NAMED = new RegExp(String.raw`^state\s+"([^"]*)"\s+as\s+(${STATE_ID})$`, 'u');
const STATE_BARE = new RegExp(String.raw`^state\s+(${STATE_ID})$`, 'u');
const STATE_LINK = new RegExp(String.raw`^(${STATE_END})\s*-->\s*(${STATE_END})\s*(?::\s*(.*))?$`, 'u');
const STATE_DESC = new RegExp(String.raw`^(${STATE_ID})\s*:\s*(.+)$`, 'u');
function stateCode(d: StateDiagram) {
  const lines = [d.v2 ? 'stateDiagram-v2' : 'stateDiagram'];
  if (d.dir) lines.push(`  direction ${d.dir}`);
  for (const st of d.states) {
    if (one(st.name) && one(st.name) !== st.id) lines.push(`  state "${one(st.name).replace(/"/g, "'")}" as ${st.id}`);
    else if (st.decl) lines.push(`  state ${st.id}`);
    for (const x of st.desc.split('\n').map(one).filter(Boolean)) lines.push(`  ${st.id} : ${x}`);
  }
  const ids = new Set(['[*]', ...d.states.map((x) => x.id)]);
  for (const l of d.links) if (ids.has(l.from) && ids.has(l.to)) lines.push(`  ${l.from} --> ${l.to}${one(l.label) ? ` : ${one(l.label)}` : ''}`);
  for (const x of d.extra ?? []) lines.push(kept(x));
  return lines.join('\n');
}
function stateRead(lines: string[], v2: boolean): StateDiagram | null {
  const d: StateDiagram = { kind: 'state', v2, states: [], links: [] };
  const box = (id: string) => {
    let st = d.states.find((x) => x.id === id);
    if (!st) { st = { id, name: id, desc: '' }; d.states.push(st); }
    return st;
  };
  const all = lines.map((l) => l.trim());
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    const dir = DIRECTION.exec(line);
    if (dir) { d.dir = dir[1] as Dir; continue; }
    const named = STATE_NAMED.exec(line);
    if (named) { box(named[2]).name = named[1]; continue; }
    const bare = STATE_BARE.exec(line);
    if (bare) { box(bare[1]).decl = true; continue; }
    const l = STATE_LINK.exec(line);
    if (l) {
      for (const id of [l[1], l[2]]) if (id !== '[*]') box(id);
      d.links.push({ from: l[1], to: l[2], label: l[3]?.trim() ?? '' });
      continue;
    }
    const desc = STATE_DESC.exec(line);
    if (desc) { const st = box(desc[1]); st.desc = st.desc ? `${st.desc}\n${desc[2].trim()}` : desc[2].trim(); continue; }
    // a state of states, or a note over lines of its own: kept whole
    if (line.endsWith('{')) { const end = blockEnd(all, i); (d.extra ??= []).push(block(lines, i, end)); i = end; continue; }
    if (/^note\s+(left|right)\s+of\s+\S+$/i.test(line)) {
      const end = all.findIndex((x, j) => j > i && /^end\s+note$/i.test(x));
      if (end < 0) return null;
      (d.extra ??= []).push(block(lines, i, end));
      i = end;
      continue;
    }
    (d.extra ??= []).push(line);
  }
  for (const st of d.states) if (st.decl && st.name !== st.id) delete st.decl;
  return d;
}

const ER_ID = String.raw`[\p{L}\p{N}_-]+`;
const ER_LEFT = String.raw`\|o|\|\||\}o|\}\|`, ER_RIGHT = String.raw`o\||\|\||o\{|\|\{`;
const ER_HEAD = new RegExp(String.raw`^(${ER_ID})(?:\["([^"]*)"\])?\s*(\{)?$`, 'u');
const ER_LINK = new RegExp(String.raw`^(${ER_ID})\s*(${ER_LEFT})(--|\.\.)(${ER_RIGHT})\s*(${ER_ID})\s*:\s*(.*)$`, 'u');
const COLUMN = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/;
function erCode(d: ErDiagram) {
  const lines = ['erDiagram'];
  if (d.dir) lines.push(`  direction ${d.dir}`);
  const bare = (s: string) => one(s).replace(/\s+/g, '_');
  for (const t of d.tables) {
    const head = one(t.name) && one(t.name) !== t.id ? `${t.id}["${one(t.name).replace(/"/g, "'")}"]` : t.id;
    const cols = t.columns.filter((c) => bare(c.type) && bare(c.name));
    if (cols.length) {
      lines.push(`  ${head} {`);
      for (const c of cols) lines.push(`    ${bare(c.type)} ${bare(c.name)}${one(c.keys) ? ` ${one(c.keys)}` : ''}${one(c.comment) ? ` "${one(c.comment).replace(/"/g, "'")}"` : ''}`);
      lines.push('  }');
    } else if (t.decl || head !== t.id) lines.push(`  ${head}`);
  }
  const ids = new Set(d.tables.map((t) => t.id));
  // a label of one word bare, of more quoted, none as ""
  const label = (s: string) => (/^[\p{L}\p{N}_]+$/u.test(one(s)) ? one(s) : `"${one(s).replace(/"/g, "'")}"`);
  for (const l of d.links) if (ids.has(l.from) && ids.has(l.to)) lines.push(`  ${l.from} ${l.left}${l.dashed ? '..' : '--'}${l.right} ${l.to} : ${label(l.label)}`);
  for (const x of d.extra ?? []) lines.push(kept(x));
  return lines.join('\n');
}
function erRead(lines: string[]): ErDiagram | null {
  const d: ErDiagram = { kind: 'er', tables: [], links: [] };
  const table = (id: string) => {
    let t = d.tables.find((x) => x.id === id);
    if (!t) { t = { id, name: id, columns: [] }; d.tables.push(t); }
    return t;
  };
  const all = lines.map((l) => l.trim());
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    const dir = DIRECTION.exec(line);
    if (dir) { d.dir = dir[1] as Dir; continue; }
    const head = ER_HEAD.exec(line);
    if (head) {
      if (head[3]) {
        const end = all.indexOf('}', i);
        if (end < 0) return null;
        const cols = all.slice(i + 1, end).filter(Boolean).map((c) => COLUMN.exec(c));
        // a column the form cannot show: the table kept as written
        if (cols.some((c) => !c)) { (d.extra ??= []).push(block(lines, i, end)); i = end; continue; }
        const t = table(head[1]);
        if (head[2] !== undefined) t.name = head[2];
        t.columns.push(...cols.map((c) => ({ type: c![1], name: c![2], keys: c![3]?.replace(/\s*,\s*/g, ', ') ?? '', comment: c![4] ?? '' })));
        i = end;
      } else {
        const t = table(head[1]);
        if (head[2] !== undefined) t.name = head[2];
        else t.decl = true;
      }
      continue;
    }
    const l = ER_LINK.exec(line);
    if (l) {
      table(l[1]); table(l[5]);
      d.links.push({ from: l[1], to: l[5], left: l[2], right: l[4], dashed: l[3] === '..', label: l[6].trim().replace(/^"(.*)"$/, '$1') });
      continue;
    }
    (d.extra ??= []).push(line);
  }
  for (const t of d.tables) if (t.decl && (t.columns.length || t.name !== t.id)) delete t.decl;
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
    case 'class': return classCode(d);
    case 'state': return stateCode(d);
    case 'er': return erCode(d);
  }
}

/** a diagram's code as the builder's chart, or null: not a kind it makes, or written beyond what it can show */
export function fromCode(code: string): Diagram | null {
  // an entity the forms would not read back (#copy;): written anew it would change, so the code is left as it is
  for (const m of code.matchAll(/#([a-zA-Z]+);/g)) if (!(m[1] in NAMED)) return null;
  // a flowchart pasted in as other apps write it: its comments and settings kept as written (flowRead), the rest read
  const filled = code.split('\n').filter((l) => l.trim());
  const at = filled.findIndex((l) => !/^\s*%%/.test(l));
  if (at >= 0 && /^(flowchart|graph)\b/.test(filled[at].trim())) return flowRead(filled.slice(at + 1), filled[at].trim(), filled.slice(0, at).map((l) => l.trim()));
  // a sequence, class, state or table diagram keeps its %% comments too: lines the forms show as written
  if (at === 0) {
    const head = filled[0].trim(), rest = filled.slice(1);
    if (head === 'sequenceDiagram') return seqRead(rest);
    if (head === 'classDiagram' || head === 'classDiagram-v2') return classRead(rest);
    if (head === 'stateDiagram' || head === 'stateDiagram-v2') return stateRead(rest, head === 'stateDiagram-v2');
    if (head === 'erDiagram') return erRead(rest);
  }
  const lines = code.split('\n').filter((l) => l.trim() && !/^\s*%%/.test(l) === true);
  if (lines.length !== code.split('\n').filter((l) => l.trim()).length) return null; // a %% comment would be lost
  const head = lines.shift()?.trim() ?? '';
  const word = head.split(/\s+/)[0];
  if (head === 'sequenceDiagram') return seqRead(lines);
  if (word === 'pie') return pieRead(lines, head);
  if (head === 'mindmap') return mindRead(lines);
  if (head === 'timeline') return timeRead(lines);
  if (head === 'gantt') return ganttRead(lines);
  return null;
}

/** Why a diagram opens as its code, not its drawing: the kind the editor has no form for, or the first line it cannot
 *  show (a `Note`, a `style`, a `loop`), found as the line without which the rest reads. null when it reads. */
export function whyCode(code: string): { kind: string } | { line: string } | { other: true } | null {
  if (fromCode(code)) return null;
  const all = code.split('\n');
  const head = all.find((l) => l.trim())?.trim() ?? '';
  const word = head.split(/\s+/)[0];
  if (!['flowchart', 'graph', 'sequenceDiagram', 'pie', 'mindmap', 'timeline', 'gantt', 'classDiagram', 'classDiagram-v2', 'stateDiagram', 'stateDiagram-v2', 'erDiagram'].includes(word)) return { kind: word || 'empty' };
  const first = all.findIndex((l) => l.trim());
  for (let i = first + 1; i < all.length; i++) {
    if (!all[i].trim()) continue;
    if (fromCode(all.filter((_, j) => j !== i).join('\n'))) return { line: all[i].trim() };
  }
  return { other: true };
}

/** a chart with nothing left in it (its last box deleted): drawn, it was an empty grey card, and Done takes it away */
export function isEmpty(d: Diagram): boolean {
  switch (d.kind) {
    case 'flowchart': return !d.nodes.length;
    case 'sequence': return !d.people.length && !d.messages.length;
    case 'pie': return !d.slices.length;
    case 'mindmap': return !d.root.trim() && !d.items.length;
    case 'timeline': return !d.periods.length;
    case 'gantt': return d.sections.every((s) => !s.tasks.length);
    case 'class': return !d.classes.length;
    case 'state': return !d.states.length && !d.links.length;
    case 'er': return !d.tables.length;
  }

}

/** a fresh id for a node or a person, not one the chart has */
export function freshId(prefix: string, taken: { id: string }[]) {
  for (let i = taken.length + 1; ; i++) if (!taken.some((t) => t.id === `${prefix}${i}`)) return `${prefix}${i}`;
}
