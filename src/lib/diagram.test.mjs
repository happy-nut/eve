import assert from 'node:assert/strict';
import { KINDS, starter, toCode, fromCode } from './diagram.ts';

// every kind's starter: written, read back the same, written again the same
for (const { kind } of KINDS) {
  const d = starter(kind, '2026-10-08');
  const code = toCode(d);
  assert.deepEqual(fromCode(code), d, kind);
  assert.equal(toCode(fromCode(code)), code, kind);
}

// labels holding what the code uses for itself come back as they were
const tricky = 'a "quote" : colon; semi # hash (paren) [br] {c}';
const flow = { kind: 'flowchart', dir: 'TD', nodes: [{ id: 'n1', label: tricky, shape: 'round' }, { id: 'n2', label: 'b', shape: 'db' }],
  edges: [{ from: 'n1', to: 'n2', label: tricky, line: 'thick' }] };
assert.deepEqual(fromCode(toCode(flow)), flow);
const seq = { kind: 'sequence', numbered: true, people: [{ id: 'p1', name: 'Ann Lee; #1', actor: true }, { id: 'p2', name: 'B', actor: false }],
  messages: [{ from: 'p1', to: 'p2', text: tricky, reply: false }] };
assert.deepEqual(fromCode(toCode(seq)), seq);
const pie = { kind: 'pie', title: 'T', showData: true, slices: [{ label: tricky, value: 1.5 }] };
assert.deepEqual(fromCode(toCode(pie)), pie);
const time = { kind: 'timeline', title: 'x: y', periods: [{ label: '10:30', events: ['a: b', 'c'] }] };
assert.deepEqual(fromCode(toCode(time)), time);
const mind = { kind: 'mindmap', root: 'R (x)', items: [{ text: 'f(x) = [1]', depth: 1 }, { text: 'g', depth: 2 }, { text: 'h', depth: 2 }, { text: 'i', depth: 1 }] };
assert.deepEqual(fromCode(toCode(mind)), mind);
const gantt = { kind: 'gantt', title: 'G', sections: [{ name: 'S', tasks: [{ name: 'a: b', start: '2026-01-02', days: 3 }] }] };
assert.deepEqual(fromCode(toCode(gantt)), gantt);

// mind map: a branch two steps deeper than the one above is written one step deeper
assert.match(toCode({ kind: 'mindmap', root: 'R', items: [{ text: 'a', depth: 1 }, { text: 'b', depth: 3 }] }), /\n    a\n      b$/);

// hand-written flowcharts the builder can show
const hand = fromCode('flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -.-> A');
assert.deepEqual(hand.nodes.map((n) => [n.id, n.label, n.shape]), [['A', 'Start', 'box'], ['B', 'Choice', 'diamond'], ['C', 'Done', 'box']]);
assert.deepEqual(hand.edges.map((e) => [e.from, e.to, e.label, e.line]), [['A', 'B', '', 'solid'], ['B', 'C', 'yes', 'solid'], ['B', 'A', '', 'dotted']]);
assert.equal(fromCode('graph TD\n  A --> B').dir, 'TD');

// what it cannot show is left to the code
for (const code of [
  'flowchart LR\n  subgraph one\n  A --> B\n  end',
  'flowchart LR\n  A --> B\n  style A fill:#f00',
  'flowchart LR\n  %% a note\n  A --> B',
  'flowchart LR\n  A --> B --> C',
  'sequenceDiagram\n  Note over A: hi',
  'sequenceDiagram\n  loop Every day\n  A->>B: x\n  end',
  'classDiagram\n  A <|-- B',
  'mindmap\n  root((R))\n    A[Square]',
  'timeline\n  section S\n  a : b',
  'gantt\n  dateFormat YYYY-MM-DD\n  a :t1, after t0, 3d',
]) assert.equal(fromCode(code), null, code);

console.log('diagram ok');
