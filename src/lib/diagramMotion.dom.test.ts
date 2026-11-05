import { describe, expect, it, vi } from 'vitest';
import { DRAWING, levels, numbered, stepper, timeline } from './diagramMotion';
import { fromCode, type Flowchart } from './diagram';
import { laneSvg } from './lanes';

const svgOf = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as SVGSVGElement;
};
const at = (svg: SVGSVGElement, sel: string) => timeline(svg).find((s) => s.el === svg.querySelector(sel))?.at;

describe('a diagram drawing itself in', () => {
  it('levels go breadth first from the boxes nothing points to; a circle of its own comes after', () => {
    const l = levels(['A', 'B', 'C', 'D', 'X', 'Y'], [['A', 'B'], ['B', 'C'], ['A', 'D'], ['C', 'A'], ['X', 'Y'], ['Y', 'X']]);
    expect(Object.fromEntries(l)).toEqual({ A: 0, B: 1, D: 1, C: 2, X: 3, Y: 4 });
  });

  it("a flowchart: boxes by level, a line after its source and its label with it, names with underscores read whole", () => {
    const svg = svgOf(`<svg id="m1" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg">
      <g class="edgePaths"><path class="flowchart-link" data-id="L_a_b_c_0" d="M0,0L10,0"/><path class="flowchart-link" data-id="L_c_end_0" d="M10,0L20,0"/></g>
      <g class="edgeLabels"><g class="edgeLabel" id="lab"><g class="label" data-id="L_a_b_c_0"></g></g></g>
      <g class="nodes"><g class="node" id="m1-flowchart-a_b-0"></g><g class="node" id="m1-flowchart-c-1"></g><g class="node" id="m1-flowchart-end-2"></g></g></svg>`);
    expect(at(svg, '#m1-flowchart-a_b-0')).toBe(0);
    const c = at(svg, '#m1-flowchart-c-1')!, end = at(svg, '#m1-flowchart-end-2')!;
    expect(c).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(c);
    const first = at(svg, '[data-id="L_a_b_c_0"]')!;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(c);
    expect(at(svg, '#lab')).toBeGreaterThan(first);
    expect(at(svg, '[data-id="L_c_end_0"]')).toBeGreaterThan(c);
  });

  it('a sequence diagram: its people first, then each message in order with its words', () => {
    const svg = svgOf(`<svg aria-roledescription="sequence" xmlns="http://www.w3.org/2000/svg">
      <rect class="actor actor-top" id="p"/><line class="actor-line" id="ll"/>
      <text class="messageText" id="t0"/><line class="messageLine0" id="m0"/>
      <text class="messageText" id="t1"/><line class="messageLine1" id="m1"/>
      <text class="messageText" id="t2"/><path class="messageLine0" id="self"/></svg>`);
    expect(at(svg, '#p')).toBe(0);
    // a message to oneself, a loop drawn as a path, comes in its turn with its words
    expect(at(svg, '#self')).toBeGreaterThan(at(svg, '#m1')!);
    expect(at(svg, '#t2')).toBe(at(svg, '#self'));
    expect(at(svg, '#m0')).toBeGreaterThan(at(svg, '#ll')!);
    expect(at(svg, '#t0')).toBe(at(svg, '#m0'));
    expect(at(svg, '#m1')).toBeGreaterThan(at(svg, '#m0')!);
  });

  it('nothing for a kind it does not know: drawn as it is', () => {
    expect(timeline(svgOf('<svg aria-roledescription="pie" xmlns="http://www.w3.org/2000/svg"><path/></svg>'))).toEqual([]);
  });

  it('a line drawn in gets its arrowhead back even when its animation never ends (stalled while Eve was away)', () => {
    vi.useFakeTimers();
    try {
      const svg = svgOf(`<svg id="m2" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg">
        <path class="flowchart-link" data-id="L_a_b_0" d="M0,0L10,0" style="marker-end: url(#head)"/>
        <g class="node" id="m2-flowchart-a-0"></g><g class="node" id="m2-flowchart-b-1"></g></svg>`);
      const line = svg.querySelector('path')!;
      // an animation that is started and then never plays on: no finish, no cancel
      const stalled = () => Object.assign(new EventTarget(), { finished: new Promise(() => {}), cancel() {} });
      for (const el of svg.querySelectorAll('path, g')) Object.assign(el, { animate: stalled });
      Object.assign(line, { getTotalLength: () => 10 });
      const walk = stepper(svg);
      walk.show(0);
      walk.show(1);
      expect(line.classList.contains(DRAWING)).toBe(true); // not ahead of the line while it draws
      vi.advanceTimersByTime(1000);
      expect(line.classList.contains(DRAWING)).toBe(false);
      expect(line.style.markerEnd).toMatch(/^url\("?#head"?\)$/);
    } finally { vi.useRealTimers(); }
  });

  it('a line keeps its head through → ← → in quick turns, and in a copy taken while it was drawing in', () => {
    vi.useFakeTimers();
    try {
      // its head set on it, as the case above: jsdom puts no marker-end attribute in the computed style
      const make = () => svgOf(`<svg id="m4" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg">
        <path class="flowchart-link" data-id="L_a_b_0" d="M0,0L10,0" style="marker-end: url(#head)"/>
        <g class="node" id="m4-flowchart-a-0"></g><g class="node" id="m4-flowchart-b-1"></g></svg>`);
      const ready = (svg: SVGSVGElement) => {
        for (const el of svg.querySelectorAll('path, g')) Object.assign(el, { animate: () => Object.assign(new EventTarget(), { finished: new Promise(() => {}), cancel() {} }) });
        Object.assign(svg.querySelector('path')!, { getTotalLength: () => 10 });
        return svg;
      };
      const head = (svg: SVGSVGElement) => { const p = svg.querySelector('path')!; return p.classList.contains(DRAWING) ? 'hidden' : p.style.markerEnd; };
      // the second turn read the first one's hidden head as the line's own, and put that back
      const svg = ready(make()), walk = stepper(svg);
      walk.show(0); walk.show(1); walk.show(0); walk.show(1);
      vi.advanceTimersByTime(2000);
      expect(head(svg)).toMatch(/url/);
      // Present copies the note's blocks as they are: a line still drawing in came with its head hidden (mermaid's own
      // head is an attribute, which the hidden one is over)
      const drawing = svgOf(`<svg id="m6" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg">
        <path class="flowchart-link ${DRAWING}" data-id="L_a_b_0" d="M0,0L10,0" marker-end="url(#head)"/>
        <g class="node" id="m6-flowchart-a-0"></g><g class="node" id="m6-flowchart-b-1"></g></svg>`);
      const copy = ready(drawing.cloneNode(true) as SVGSVGElement), step = stepper(copy);
      step.show(0); step.show(1);
      vi.advanceTimersByTime(2000);
      expect(head(copy)).toBe(''); // the attribute's head shows again
      expect(copy.querySelector('path')!.getAttribute('marker-end')).toBe('url(#head)');
    } finally { vi.useRealTimers(); }
  });

  it("a Moving line (named, e1@-->) comes with its ends, read from where it is drawn: its id names no boxes", () => {
    const svg = svgOf(`<svg id="m5" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg">
      <path class="flowchart-link" data-id="L_A_B_0" d="M50,30L50,90"/><path class="flowchart-link" data-id="e1" d="M50,130L50,190"/>
      <g class="node" id="m5-flowchart-A-0" transform="translate(50, 10)"></g><g class="node" id="m5-flowchart-B-1" transform="translate(50, 110)"></g>
      <g class="node" id="m5-flowchart-C-2" transform="translate(50, 210)"></g></svg>`);
    const stage = (sel: string) => timeline(svg).find((s) => s.el === svg.querySelector(sel))?.stage;
    expect([stage('#m5-flowchart-A-0'), stage('#m5-flowchart-B-1'), stage('#m5-flowchart-C-2'), stage('[data-id="e1"]')]).toEqual([0, 1, 2, 2]);
  });

  it("a box numbered (class stepN) comes up at its number, the rest in the arrows' order, no press left empty", () => {
    const g = (cls = '') => Object.assign(document.createElement('g'), { className: `node ${cls}` });
    const nodes = new Map([['A', g()], ['B', g()], ['C', g('step1')], ['D', g('step5')]]);
    // A → B → C → D: C first with A, then B, then D (its 5 closed up to the next press)
    expect(Object.fromEntries(numbered(new Map([['A', 0], ['B', 1], ['C', 2], ['D', 3]]), nodes))).toEqual({ A: 0, C: 0, B: 1, D: 2 });
    const svg = svgOf(`<svg id="m3" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg">
      <path class="flowchart-link" data-id="L_a_b_0" d="M0,0L10,0"/><path class="flowchart-link" data-id="L_b_c_0" d="M0,0L10,0"/>
      <g class="node default step2" id="m3-flowchart-a-0"></g><g class="node default" id="m3-flowchart-b-1"></g><g class="node default step1" id="m3-flowchart-c-2"></g></svg>`);
    const stage = (sel: string) => timeline(svg).find((s) => s.el === svg.querySelector(sel))!.stage;
    // c, numbered 1, before a (2), and b (no number, one past a by its arrow) with a
    expect([stage('#m3-flowchart-c-2'), stage('#m3-flowchart-a-0'), stage('#m3-flowchart-b-1')]).toEqual([0, 1, 1]);
    expect(stepper(svg).count).toBe(2);
  });

  it('a chart in lanes comes up a step at a time too, and keeps the Order its boxes are given', () => {
    const d = fromCode('flowchart LR\n  subgraph L1["Shop"]\n    a("Order")\n  end\n  subgraph L2["Store"]\n    b("Pack")\n    c("Ship")\n  end\n  a --> b\n  b --> c\n  class c step1') as Flowchart;
    const svg = svgOf(laneSvg(d));
    const walk = stepper(svg);
    expect(walk.count).toBe(2); // c, numbered 1, with a (where nothing points); then b
    const stage = (box: string) => timeline(svg).find((s) => s.el === svg.querySelector(`g.node[id$="-flowchart-${box}-0"]`))?.stage;
    expect([stage('c'), stage('a'), stage('b')]).toEqual([0, 0, 1]);
    // the line from a to b comes with b
    expect(timeline(svg).find((s) => s.line?.dataset.id === 'L_a_b_0')?.stage).toBe(1);
  });
});
