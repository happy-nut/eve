import assert from 'node:assert/strict';
import { KINDS, starter, toCode, fromCode, swimlaneStarter, whyCode } from './diagram.ts';
import { laneSvg } from './lanes.ts';

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
  'flowchart LR\n  A --> B\n  style A fill:#f9f',
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

// ---- found in the bug hunt ----
// a task or a period named like a setting ("title …", "Section …") is not taken for one
{
  const g = { kind: 'gantt', title: '', sections: [{ name: 'S', tasks: [{ name: 'title search', start: '2024-01-01', days: 3 }, { name: 'Section review', start: '2024-01-04', days: 2 }] }] };
  assert.deepEqual(fromCode(toCode(g)), g);
  const t = { kind: 'timeline', title: '', periods: [{ label: 'title deed', events: ['signed'] }, { label: 'section x', events: [] }] };
  assert.deepEqual(fromCode(toCode(t)), t);
}
// a colon inside an event (a time, a URL) is not where it ends
assert.deepEqual(fromCode('timeline\n  2020 : meeting at 10:30 : see https://x.com').periods[0].events, ['meeting at 10:30', 'see https://x.com']);
// named entities read as mermaid reads them; one the forms do not know leaves the code alone
assert.equal(fromCode('flowchart LR\n  A["Tom #amp; Jerry"] --> B').nodes[0].label, 'Tom & Jerry');
assert.equal(fromCode('pie\n  "R#amp;D" : 1').slices[0].label, 'R&D');
assert.equal(fromCode('flowchart LR\n  A["#copy; 2026"] --> B'), null);
// parallelograms and trapezoids are shapes the chart cannot keep
assert.equal(fromCode('flowchart LR\n  A[/Input/] --> B[\\Out\\]'), null);
assert.equal(fromCode('flowchart LR\n  A["/path/"] --> B').nodes[0].label, '/path/');
// a mind map's class or icon line is not a branch
assert.equal(fromCode('mindmap\n  root((x))\n    A\n    :::urgent large'), null);
// days that are not days, and spans past a century
assert.equal(fromCode('gantt\n  section A\n    T : 2024-13-01, 2d'), null);
assert.equal(fromCode('gantt\n  section A\n    T : 2024-02-30, 2d'), null);
assert.equal(fromCode('gantt\n  section A\n    T : 2024-01-01, 100000000d'), null);
// a pie value that is not a number
assert.equal(fromCode('pie\n  "x" : 1.2.3'), null);
assert.equal(fromCode('pie\n  "x" : .'), null);
assert.match(toCode({ kind: 'pie', title: '', showData: false, slices: [{ label: 'x', value: 1e29 }] }), /: 1000000000000000$/);
// a pie's title is read like every other
assert.equal(fromCode('pie title A #35; B\n  "x" : 1').title, 'A # B');
assert.deepEqual(fromCode(toCode({ kind: 'pie', title: 'A # B; C', showData: false, slices: [{ label: 'x', value: 1 }] })).title, 'A # B; C');

console.log('diagram hunt ok');

// ---- swimlanes: subgraphs as lanes ----
{
  const d = swimlaneStarter();
  const code = toCode(d);
  assert.deepEqual(fromCode(code), d, 'the swimlane starter reads back as written');
  assert.equal(toCode(fromCode(code)), code);
  assert.match(code, /subgraph L1\["Customer"\]\n {4}direction TD\n {4}n1\(\["Order"\]\)\n {4}n6\(\["Receive"\]\)\n {2}end/);
  // written by hand: a lane named by its id, by [Text] or ["Text"]; a box first named outside, then inside a lane
  const hand = fromCode('flowchart LR\n  a --> b\n  subgraph ops[Operations]\n    b\n    c\n  end\n  subgraph qa\n    direction TB\n    d\n  end\n  c --> d');
  assert.deepEqual(hand.lanes, [{ id: 'ops', label: 'Operations' }, { id: 'qa', label: 'qa' }]);
  assert.deepEqual(hand.nodes.map((n) => [n.id, n.lane]), [['a', undefined], ['b', 'ops'], ['c', 'ops'], ['d', 'qa']]);
  // more than lanes: kept as code
  assert.equal(fromCode('flowchart LR\n  subgraph a\n    subgraph b\n      x\n    end\n  end'), null, 'a lane in a lane');
  assert.equal(fromCode('flowchart LR\n  subgraph a\n    x'), null, 'a lane never closed');
  assert.equal(fromCode('flowchart LR\n  subgraph Two words\n    x\n  end'), null, 'a title with no id');
  assert.equal(fromCode('flowchart LR\n  x\n  end'), null, 'an end with no lane');
  assert.equal(fromCode('flowchart LR\n  direction TB\n  x'), null, 'a direction outside a lane');
  // drawn: a lane per subgraph (and one for the boxes in none), every box, every line, in the chart's order
  const svg = laneSvg(hand);
  assert.equal((svg.match(/<g class="lane /g) ?? []).length, 3);
  assert.deepEqual([...svg.matchAll(/-flowchart-([a-z]+)-0"/g)].map((m) => m[1]).sort(), ['a', 'b', 'c', 'd']);
  assert.equal((svg.match(/class="flowchart-link/g) ?? []).length, hand.edges.length);
  // a loop, a line to itself and a lane with nothing in it draw without trouble
  const odd = laneSvg({ kind: 'flowchart', dir: 'TD', lanes: [{ id: 'A', label: 'A <&> "B"' }, { id: 'E', label: '' }], nodes: [{ id: 'x', label: 'x', shape: 'circle', lane: 'A' }, { id: 'y', label: 'y', shape: 'db', lane: 'A' }], edges: [{ from: 'x', to: 'y', label: '', line: 'solid' }, { from: 'y', to: 'x', label: 'again', line: 'dotted' }, { from: 'y', to: 'y', label: '', line: 'thick' }] });
  assert.ok(!/NaN|undefined/.test(odd), 'no NaN in the drawing');
  assert.match(odd, /A &#60;&#38;&#62; &#34;B&#34;/, 'a lane name is text, not markup');
}
console.log('swimlanes ok');

// why a diagram opens as its code: the line the editor cannot show, or the kind it has no form for
assert.equal(whyCode('flowchart LR\n  A --> B'), null);
assert.deepEqual(whyCode('flowchart LR\n  A --> B\n  style A fill:#f9f'), { line: 'style A fill:#f9f' });
assert.deepEqual(whyCode('sequenceDiagram\n  A->>B: hi\n  Note over A: thinking'), { line: 'Note over A: thinking' });
assert.deepEqual(whyCode('classDiagram\n  A <|-- B'), { kind: 'classDiagram' });
console.log('why code ok');
