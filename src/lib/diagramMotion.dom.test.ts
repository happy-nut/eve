import { describe, expect, it } from 'vitest';
import { levels, timeline } from './diagramMotion';

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
});
