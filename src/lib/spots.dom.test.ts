import { describe, expect, it } from 'vitest';
import { fromCode, linkOrder, toCode, type Gantt, type Sequence } from './diagram';
import { adders, spotOf, tagSpots } from './spots';
import { insideOptions, startOptions } from './diagramOps';
import type { StateDiagram } from './diagram';

const gantt = (code: string) => fromCode(`gantt\n  dateFormat YYYY-MM-DD\n${code}`) as Gantt;
const act = (d: Gantt, key: string, label: string) => spotOf(d, key)!.acts.find((a) => a.label === label)!.run();

describe('chart parts', () => {
  it('ties each drawn person to their own name, whatever order mermaid draws them in', () => {
    const d = fromCode('sequenceDiagram\n  actor Ann\n  participant Web\n  participant DB as Database\n  Ann->>Web: Hi') as Sequence;
    const root = document.createElement('div');
    // last to first, as mermaid draws them, and again along the foot
    root.innerHTML = ['Database', 'Web', 'Ann', 'Database', 'Web', 'Ann'].map((n) => `<g><text class="actor">${n}</text></g>`).join('');
    tagSpots(d, root);
    expect([...root.querySelectorAll('g')].map((g) => g.getAttribute('data-spot'))).toEqual(
      ['person:DB', 'person:Web', 'person:Ann', 'person:DB', 'person:Web', 'person:Ann']);
  });

  it("marks mermaid's own Gantt: a name beside its bar, the title and the sections", () => {
    const d = gantt('  title Plan\n  excludes weekends\n  section A\n  One : 2026-01-05, 3d\n  section B\n  Two : 2026-01-08, 1d');
    const root = document.createElement('div');
    root.innerHTML = '<text class="titleText">Plan</text><text class="sectionTitle sectionTitle0">A</text><text class="sectionTitle sectionTitle1">B</text>'
      + '<rect class="task task0"></rect><rect class="task task1"></rect><text class="taskText taskText0">One</text><text class="taskTextOutsideRight taskText1">Two</text>';
    tagSpots(d, root);
    const keys = (sel: string) => [...root.querySelectorAll(sel)].map((e) => e.getAttribute('data-spot'));
    expect(keys('text[class*="taskText"]')).toEqual(['task:0:0', 'task:1:0']);
    expect(keys('.titleText')).toEqual(['title']);
    expect(keys('.sectionTitle')).toEqual(['phase:0', 'phase:1']);
  });

  it('Tab from a section just added types into its task, not a second one beside it', () => {
    const d = gantt('  section Build\n  Code : 2026-01-05, 3d');
    d.sections.push({ name: 'Launch', tasks: [{ name: 'Task', start: '2026-01-08', days: 2 }] });
    expect(act(d, 'phase:1', 'Add a task')).toBe('task:1:0');
    expect(d.sections[1].tasks).toHaveLength(1);
  });

  it('a task added after another goes before what waited for that one', () => {
    const d = gantt('  section S\n  Wireframes :a1, 2026-01-05, 3d\n  Visual :a2, after a1, 2d');
    expect(act(d, 'task:0:0', 'Add a task after it')).toBe('task:0:1');
    const [, added, visual] = d.sections[0].tasks;
    expect(added.id).toBeTruthy();
    expect(visual.after).toBe(added.id);
    expect(added.after).toBe('a1'); // after it by name: an id with a length alone reads as a start date
    expect(toCode(d)).toMatch(/Task : t\d, after a1, 2d\n {4}Visual : a2, after t\d/);
  });

  it('a task cannot be set to start after one that starts after it (a loop)', () => {
    const d = gantt('  section S\n  A :a1, 2026-01-05, 3d\n  B :b1, after a1, 2d\n  C : 2d\n  D :d1, 2026-01-20, 1d');
    const names = startOptions(d, d.sections[0].tasks[0]).map(([, label]) => label);
    expect(names).not.toContain('After “B”');
    expect(names).not.toContain('After “C”'); // after the one before it, B
    expect(names).toContain('After “D”');
  });

  it("ties a sequence's group words and lines that say the same to their own parts", () => {
    const d = fromCode('sequenceDiagram\n  participant A\n  participant B\n  alt cached\n    A->>B: hit\n  else not cached\n    A->>B: miss\n  end\n  opt audit\n    A->>B: log\n  end') as Sequence;
    const root = document.createElement('div');
    root.innerHTML = '<text class="loopText">[cached]</text><text>[not cached]</text><text class="loopText">[audit]</text>';
    tagSpots(d, root);
    expect([...root.querySelectorAll('text')].map((t) => t.getAttribute('data-spot'))).toEqual(['step:0', 'step:2', 'step:5']);
    const c = fromCode('classDiagram\n  A <|-- B : inherits\n  A <|-- C : inherits')!;
    root.innerHTML = '<g class="edgeLabel">inherits</g><g class="edgeLabel">inherits</g>';
    tagSpots(c, root);
    expect([...root.querySelectorAll('g')].map((g) => g.getAttribute('data-spot'))).toEqual(['clink:0', 'clink:1']);
  });

  it('a state is not offered to be put in one it has a line with, or one with a description', () => {
    const s = fromCode('stateDiagram-v2\n  Idle : waiting\n  Idle --> Running\n  Done') as StateDiagram;
    const running = s.states.find((x) => x.id === 'Running')!;
    expect(insideOptions(s, running).map(([v]) => v)).toEqual(['', 'Done']);
  });

  it("a note's place is set from its bar", () => {
    const d = fromCode('sequenceDiagram\n  participant A\n  participant B\n  Note over A,B: hi') as Sequence;
    const where = spotOf(d, 'step:0')!.fields[0];
    expect(where.kind === 'select' && where.options.map(([v]) => v)).toContain('right of|B');
    where.set('right of|B');
    expect(toCode(d)).toMatch(/Note right of B: hi/);
  });

  it('the first task is not offered to start after the one before it, there being none', () => {
    const d = gantt('  section S\n  A :a1, 2026-01-05, 3d\n  B :b1, 2026-01-09, 2d');
    expect(startOptions(d, d.sections[0].tasks[0]).map(([v]) => v)).not.toContain('prev');
    expect(startOptions(d, d.sections[0].tasks[1]).map(([v]) => v)).toContain('prev');
  });

  it('a line is not offered again to what it goes to already', () => {
    const s = fromCode('stateDiagram-v2\n  Running --> Done : finish\n  Idle') as StateDiagram;
    const to = spotOf(s, 'state:Running')!.fields.find((f) => f.label === 'Draw a line to')!;
    expect(to.kind === 'select' && to.options.map(([v]) => v)).toEqual(['', 'Idle']);
    // a line either way counts; with each one linked, no list of nothing
    const e = fromCode('erDiagram\n  CUSTOMER ||--o{ ORDER : places') as never;
    expect(spotOf(e, 'table:ORDER')!.fields.some((f) => f.label === 'Draw a line to')).toBe(false);
  });

  it('a task deleted leaves what started after it on the day it started', () => {
    const d = gantt('  section S\n  Sketch :a1, 2026-01-05, 5d\n  Review :r1, after a1, 3d');
    act(d, 'task:0:0', 'Delete');
    expect(d.sections[0].tasks[0]).toMatchObject({ name: 'Review', start: '2026-01-10' });
    // and the one that just came next
    const g = gantt('  section S\n  A :a1, 2026-01-05, 2d\n  B :b1, 2026-01-07, 3d\n  C : 2d');
    act(g, 'task:0:1', 'Delete');
    expect(g.sections[0].tasks[1]).toMatchObject({ name: 'C', start: '2026-01-10' });
    // in the next section too
    const h = gantt('  section A\n  X :x1, 2026-01-05, 2d\n  Y : 3d\n  section B\n  Z : 2d');
    act(h, 'task:0:1', 'Delete');
    expect(h.sections[1].tasks[0]).toMatchObject({ name: 'Z', start: '2026-01-10' });
  });

  it('marks every line drawn, a label or none, in the order the links are written, with a wider stroke to hit', () => {
    const s = fromCode('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> Idle\n  state Running {\n    [*] --> Busy\n  }') as StateDiagram;
    const order = linkOrder(s);
    // a state's own lines are written inside it, before those around it
    expect(toCode(s).split('\n').filter((l) => l.includes('-->')).map((l) => l.trim())).toEqual(order.map((i) => {
      const l = s.links[i]; return `${l.from} --> ${l.to}${l.label ? ` : ${l.label}` : ''}`;
    }));
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    root.innerHTML = order.map((_, k) => `<path data-edge="true" data-id="edge${k}"/>`).join('') + order.map((_, k) => `<g class="edgeLabel"><g data-id="edge${k}"></g></g>`).join('');
    tagSpots(s, root);
    expect([...root.querySelectorAll('path[data-edge]')].map((p) => p.getAttribute('data-spot'))).toEqual(order.map((i) => `slink:${i}`));
    expect(root.querySelectorAll('path.spot-hit').length).toBe(order.length);
    expect([...root.querySelectorAll('g.edgeLabel')].map((g) => g.getAttribute('data-spot'))).toEqual(order.map((i) => `slink:${i}`));
    tagSpots(s, root); // drawn once, marked once
    expect(root.querySelectorAll('path.spot-hit').length).toBe(order.length);
  });
});

// a new part of a chart written in Korean is named in Korean, as a new flowchart step is ("새 단계"): an "Idea" or a
// "Task" in the middle of 한글 was one more word to type over
describe('a new part in a Korean chart', () => {
  it('is named in Korean, by the chart’s +, the bar’s + and Tab', () => {
    const m = fromCode('mindmap\n  root((출시))\n    마케팅') as import('./diagram').Mindmap;
    adders(m)[0].run();
    expect(m.items.at(-1)!.text).toBe('아이디어');
    spotOf(m, 'branch:0')!.acts.find((a) => a.label === 'Add an idea under it')!.run();
    expect(m.items.some((b) => b.text === 'Idea')).toBe(false);
    const g = gantt('  section 기획\n  조사 : 2026-01-05, 3d');
    act(g, 'task:0:0', 'Add a task after it');
    expect(g.sections[0].tasks[1].name).toBe('작업');
    const s = fromCode('sequenceDiagram\n  participant 앱\n  participant 서버\n  앱->>서버: 요청') as Sequence;
    adders(s)[0].run();
    expect(s.people.at(-1)!.name).toBe('참여자 3');
    spotOf(s, 'step:0')!.acts.find((a) => a.tab)!.run();
    expect(s.messages[1]).toMatchObject({ text: '메시지' });
  });
  it('an English one keeps English words', () => {
    const m = fromCode('mindmap\n  root((Launch))\n    Ads') as import('./diagram').Mindmap;
    adders(m)[0].run();
    expect(m.items.at(-1)!.text).toBe('Idea');
  });
});
