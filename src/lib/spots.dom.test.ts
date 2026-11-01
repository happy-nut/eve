import { describe, expect, it } from 'vitest';
import { fromCode, toCode, type Gantt, type Sequence } from './diagram';
import { spotOf, tagSpots } from './spots';
import { startOptions } from './diagramOps';

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
    expect(toCode(d)).toMatch(/Visual : a2, after t\d/);
  });

  it('a task cannot be set to start after one that starts after it (a loop)', () => {
    const d = gantt('  section S\n  A :a1, 2026-01-05, 3d\n  B :b1, after a1, 2d\n  C : 2d\n  D :d1, 2026-01-20, 1d');
    const names = startOptions(d, d.sections[0].tasks[0]).map(([, label]) => label);
    expect(names).not.toContain('After “B”');
    expect(names).not.toContain('After “C”'); // after the one before it, B
    expect(names).toContain('After “D”');
  });
});
