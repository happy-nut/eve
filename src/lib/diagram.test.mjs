import assert from 'node:assert/strict';
import { KINDS, starter, toCode, fromCode, swimlaneStarter, whyCode, isEmpty, ganttDates } from './diagram.ts';
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
  'sequenceDiagram\n  box Aqua Team\n  participant A\n  end\n  A->>B: x',
  'journey\n  title Day',
  'mindmap\n  root((R))\n    A[Square]',
  'timeline\n  section S\n  a : b',
  'gantt\n  dateFormat DD-MM-YYYY\n  a : 01-02-2026, 3d',
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
assert.equal(whyCode('sequenceDiagram\n  A->>B: hi\n  Note over A: n'), null);
assert.deepEqual(whyCode('mindmap\n  root((R))\n    A\n    B[Square]'), { line: 'B[Square]' });
assert.deepEqual(whyCode('journey\n  title Day'), { kind: 'journey' });
console.log('why code ok');

// a chart with its last part deleted is empty (Done takes the block away); no starter is
for (const { kind } of KINDS) assert.equal(isEmpty(starter(kind, '2026-10-08')), false, kind);
assert.equal(isEmpty({ kind: 'flowchart', dir: 'LR', nodes: [], edges: [] }), true);
assert.equal(isEmpty({ kind: 'gantt', title: '', sections: [{ name: 'A', tasks: [] }] }), true);
assert.equal(isEmpty(fromCode('flowchart LR')), true);
console.log('empty ok');

// a line's label (and a box's) over two lines: written as mermaid's <br>, read back as the break it was
{
  const d = starter('flowchart');
  d.edges[1].label = 'when the order\nis paid';
  d.nodes[0].label = 'Start\nhere';
  const code = toCode(d);
  assert.match(code, /\|"when the order<br>is paid"\|/);
  assert.match(code, /"Start<br>here"/);
  const back = fromCode(code);
  assert.equal(back.edges[1].label, 'when the order\nis paid');
  assert.equal(back.nodes[0].label, 'Start\nhere');
  assert.equal(toCode(back), code);
}

// ---- a flowchart pasted in, as other apps (Notion, GitHub, a chat) write it: drawn and edited as any other ----
{
  const code = [
    '%%{init: {"theme": "neutral"}}%%',
    'graph LR',
    '  %% where it starts',
    '  시작([주문]) --> 결제{결제됐나?}',
    '  결제 -- 예 --> 포장[[포장]] --> 배송[/배송/]',
    '  결제 -.->|아니오| 시작',
    '  A & B --> C:::hot; C --- D',
    '  D --o E',
    '  E <--> F',
    '  subgraph 물류 팀',
    '    포장',
    '  end',
    '  classDef hot fill:#f96',
    '  style A fill:#9f9',
    '  linkStyle 0 stroke:#f00',
    '  click A "https://example.com"',
  ].join('\n');
  const d = fromCode(code);
  assert.ok(d, 'read');
  assert.equal(d.dir, 'LR');
  assert.deepEqual(d.edges.map((e) => [e.from, e.to, e.label, e.line, e.arrow ?? '']), [
    ['시작', '결제', '', 'solid', ''], ['결제', '포장', '예', 'solid', ''], ['포장', '배송', '', 'solid', ''], ['결제', '시작', '아니오', 'dotted', ''],
    ['A', 'C', '', 'solid', ''], ['B', 'C', '', 'solid', ''], ['C', 'D', '', 'solid', '---'], ['D', 'E', '', 'solid', '--o'], ['E', 'F', '', 'solid', '<-->'],
  ]);
  assert.deepEqual(d.nodes.find((n) => n.id === '포장').raw, { open: '[[', close: ']]', as: 'box' });
  assert.deepEqual(d.nodes.find((n) => n.id === '배송').raw, { open: '[/', close: '/]', as: 'box' });
  assert.equal(d.nodes.find((n) => n.id === 'C').cls, 'hot');
  assert.equal(d.lanes[0].label, '물류 팀');
  // written back: what it showed as it was, what it could not show kept, and read again the same
  const out = toCode(d);
  for (const kept of ['%%{init: {"theme": "neutral"}}%%', '%% where it starts', 'classDef hot fill:#f96', 'style A fill:#9f9', 'linkStyle 0 stroke:#f00', 'click A "https://example.com"', 'C --- D', 'D --o E', 'E <--> F', '포장[["포장"]]', '배송[/"배송"/]', ':::hot']) assert.ok(out.includes(kept), `${kept} kept in\n${out}`);
  assert.equal(toCode(fromCode(out)), out, 'written once, it reads and writes the same');
  // a line's style changed in the editor: written as the forms write it
  d.edges[6].line = 'dotted';
  assert.match(toCode(d), /C -\.-> D/);
  console.log('pasted flowchart ok');
}

// ---- pasted in as other apps write them, read into the forms; what they cannot show kept where it was ----
/** read, written, read again the same, and every line it had still in it (written in the forms' spelling) */
function settles(code, kind) {
  const d = fromCode(code);
  assert.ok(d, `${kind} reads`);
  assert.equal(d.kind, kind);
  // written once in the forms' spelling (a state with a line of its own first), it reads and writes the same from then on
  const out = toCode(d), again = fromCode(out);
  assert.equal(toCode(again), out, `${kind}: written, it reads and writes the same\n${out}`);
  assert.deepEqual(fromCode(toCode(again)), again, kind);
  // the same parts, if not in the same order (one written with a line of its own comes first)
  const parts = (x) => ({ ...x, ...Object.fromEntries(['states', 'tables', 'classes'].filter((k) => x[k]).map((k) => [k, [...x[k]].sort((a, b) => a.id.localeCompare(b.id))])) });
  assert.deepEqual(parts(again), parts(d), `${kind}: nothing lost`);
  return [d, out];
}
{
  const [d, out] = settles([
    'sequenceDiagram',
    '  %% a comment',
    '  autonumber',
    '  actor 사용자',
    '  participant 앱 as 모바일 앱',
    '  사용자->>+앱: 로그인',
    '  loop 세 번까지',
    '    앱->>서버: 확인',
    '    서버--x앱: 실패',
    '  end',
    '  alt 성공',
    '    앱-->>-사용자: 토큰',
    '  else 실패',
    '    앱-)사용자: 알림',
    '  end',
    '  Note over 앱,서버: 암호화',
    '  Note right of 사용자: 기다림',
    '  activate 서버',
    '  rect rgb(240, 240, 255)',
    '    앱->사용자: 끝',
    '  end',
  ].join('\n'), 'sequence');
  assert.deepEqual(d.people.map((p) => [p.id, p.name, p.actor]), [['사용자', '사용자', true], ['앱', '모바일 앱', false], ['서버', '서버', false]]);
  assert.deepEqual(d.messages[0], { raw: '%% a comment' });
  assert.deepEqual(d.messages[1], { from: '사용자', to: '앱', text: '로그인', reply: false, act: '+' });
  assert.deepEqual(d.messages[2], { block: 'loop', text: '세 번까지' });
  assert.deepEqual(d.messages[4], { from: '서버', to: '앱', text: '실패', reply: true, arrow: '--x' });
  assert.deepEqual(d.messages.find((m) => m.note === 'over'), { note: 'over', who: ['앱', '서버'], text: '암호화' });
  assert.deepEqual(d.messages.find((m) => m.raw === 'activate 서버'), { raw: 'activate 서버' });
  for (const kept of ['  %% a comment', '사용자->>+앱: 로그인', '  loop 세 번까지\n    앱->>서버: 확인', '서버--x앱: 실패', '  else 실패\n    앱-)사용자: 알림', 'Note over 앱,서버: 암호화', 'Note right of 사용자: 기다림', 'activate 서버', 'rect rgb(240, 240, 255)', '앱->사용자: 끝']) assert.ok(out.includes(kept), `${kept} in\n${out}`);
  // an arrow of its own turned into a reply: the forms' reply arrow
  d.messages[4].reply = false;
  assert.match(toCode(d), /서버->>앱: 실패/);
  console.log('pasted sequence ok');
}
{
  const [d, out] = settles([
    'gantt',
    '  title 출시',
    '  dateFormat YYYY-MM-DD',
    '  excludes weekends',
    '  section 개발',
    '    설계 :done, a1, 2026-01-05, 3d',
    '    구현 :crit, active, a2, after a1, 2w',
    '    리뷰 : 2d',
    '    마감 :milestone, m1, after a2, 0d',
    '  section 끝',
    '    배포 : 2026-02-01, 2026-02-04',
  ].join('\n'), 'gantt');
  const tasks = d.sections.flatMap((s) => s.tasks);
  assert.deepEqual(tasks[0], { name: '설계', start: '2026-01-05', days: 3, id: 'a1', tags: ['done'] });
  assert.deepEqual(tasks[1], { name: '구현', start: '', days: 14, id: 'a2', tags: ['crit', 'active'], after: 'a1' });
  assert.deepEqual(tasks[2], { name: '리뷰', start: '', days: 2, after: '' });
  assert.equal(tasks[4].days, 3, 'an end date is a length');
  assert.deepEqual(d.extra, ['excludes weekends']);
  assert.ok(out.includes('구현 : crit, active, a2, after a1, 14d'), out);
  assert.ok(out.includes('리뷰 : 2d'), out);
  // drawn where mermaid puts them: after a task when it ends, after the one before when that ends
  const at = [...ganttDates(d).values()].map((x) => x.start);
  assert.deepEqual(at.slice(0, 4), ['2026-01-05', '2026-01-08', '2026-01-22', '2026-01-22']);
  console.log('pasted gantt ok');
}
{
  const [d, out] = settles([
    'classDiagram',
    '  direction LR',
    '  class 동물 {',
    '    <<abstract>>',
    '    +String 이름',
    '    +먹다() void',
    '  }',
    '  class 개',
    '  class Cat["고양이"]',
    '  Cat : +야옹()',
    '  동물 <|-- 개',
    '  동물 <|-- Cat',
    '  주인 "1" --> "*" 개 : 산책시킨다',
    '  List~int~ o-- 개',
    '  note for 개 "충성스럽다"',
    '  namespace 집 {',
    '    class 방',
    '  }',
    '  classDef hot fill:#f96',
  ].join('\n'), 'class');
  assert.equal(d.dir, 'LR');
  assert.deepEqual(d.classes.map((c) => [c.id, c.name, c.members.length]), [['동물', '동물', 3], ['개', '개', 0], ['Cat', '고양이', 1], ['주인', '주인', 0], ['List~int~', 'List~int~', 0]]);
  assert.deepEqual(d.links[2], { from: '주인', to: '개', arrow: '-->', label: '산책시킨다', fromCard: '1', toCard: '*' });
  assert.deepEqual(d.extra, ['note for 개 "충성스럽다"', 'namespace 집 {\n  class 방\n}', 'classDef hot fill:#f96']);
  for (const kept of ['class 개\n', 'class Cat["고양이"]', 'Cat : +야옹()', '주인 "1" --> "*" 개 : 산책시킨다', 'note for 개', 'classDef hot']) assert.ok(out.includes(kept), `${kept} in\n${out}`);
  console.log('pasted class ok');
}
{
  const [d, out] = settles([
    'stateDiagram-v2',
    '  [*] --> 대기',
    '  state "처리 중" as 처리',
    '  대기 --> 처리 : 요청',
    '  처리 : 서버가 일한다',
    '  state 검토 {',
    '    [*] --> 1차',
    '    1차 --> [*]',
    '  }',
    '  처리 --> 검토',
    '  검토 --> [*]',
    '  note right of 처리',
    '    오래 걸릴 수 있다',
    '  end note',
    '  state 분기 <<choice>>',
  ].join('\n'), 'state');
  assert.deepEqual(d.states.map((s) => [s.id, s.name, s.desc]), [['대기', '대기', ''], ['처리', '처리 중', '서버가 일한다'], ['검토', '검토', '']]);
  assert.deepEqual(d.links.map((l) => [l.from, l.to, l.label]), [['[*]', '대기', ''], ['대기', '처리', '요청'], ['처리', '검토', ''], ['검토', '[*]', '']]);
  assert.equal(d.extra.length, 3);
  for (const kept of ['state "처리 중" as 처리', '처리 : 서버가 일한다', '  state 검토 {\n    [*] --> 1차', 'end note', 'state 분기 <<choice>>']) assert.ok(out.includes(kept), `${kept} in\n${out}`);
  console.log('pasted state ok');
}
{
  const [d, out] = settles([
    'erDiagram',
    '  CUSTOMER ||--o{ ORDER : places',
    '  ORDER ||--|{ LINE-ITEM : "contains many"',
    '  CUSTOMER }|..|{ DELIVERY-ADDRESS : uses',
    '  CUSTOMER {',
    '    string name "고객 이름"',
    '    string email UK',
    '    int id PK, FK',
    '  }',
    '  p["사람"] {',
    '    string 이름',
    '  }',
    '  ODD {',
    '    string[] tags',
    '    weird',
    '  }',
  ].join('\n'), 'er');
  assert.deepEqual(d.links.map((l) => [l.from, l.left, l.dashed, l.right, l.to, l.label]), [
    ['CUSTOMER', '||', false, 'o{', 'ORDER', 'places'], ['ORDER', '||', false, '|{', 'LINE-ITEM', 'contains many'], ['CUSTOMER', '}|', true, '|{', 'DELIVERY-ADDRESS', 'uses'],
  ]);
  assert.deepEqual(d.tables[0].columns, [{ type: 'string', name: 'name', keys: '', comment: '고객 이름' }, { type: 'string', name: 'email', keys: 'UK', comment: '' }, { type: 'int', name: 'id', keys: 'PK, FK', comment: '' }]);
  assert.equal(d.tables.find((t) => t.id === 'p').name, '사람');
  assert.deepEqual(d.extra, ['ODD {\n  string[] tags\n  weird\n}'], 'a table the form cannot show is kept as written');
  for (const kept of ['ORDER ||--|{ LINE-ITEM : "contains many"', 'CUSTOMER }|..|{ DELIVERY-ADDRESS : uses', 'string name "고객 이름"', 'int id PK, FK', 'p["사람"] {', 'weird']) assert.ok(out.includes(kept), `${kept} in\n${out}`);
  console.log('pasted er ok');
}
