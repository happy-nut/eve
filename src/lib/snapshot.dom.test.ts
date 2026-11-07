import { describe, expect, it, vi } from 'vitest';
import { drawnCopy } from './snapshot';

describe('a diagram copied as a picture', () => {
  it('is taken as it ends, not half drawn in, and without the dot running its lines', () => {
    const d = document.createElement('div');
    d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><g class="node" style="opacity: 0.3"></g>
      <path class="flowchart-link" d="M0,0L10,0" style="stroke-dashoffset: 80"/><path class="eve-flow" d="M0,0L10,0"/></svg>`;
    const svg = d.firstElementChild as SVGSVGElement;
    const [box, line] = [svg.querySelector('g')!, svg.querySelector('path')!];
    // an animation part way: its end is the drawing at rest (here, as jsdom plays none, the styles it would end on)
    const fade = { effect: { getTiming: () => ({ iterations: 1 }) }, finish: vi.fn(() => { box.style.opacity = ''; line.style.strokeDashoffset = ''; }) };
    const dot = { effect: { getTiming: () => ({ iterations: Infinity }) }, finish: vi.fn(() => { throw new Error('an endless one has no end'); }) };
    Object.assign(svg, { getAnimations: () => [fade, dot] });
    const copy = drawnCopy(svg);
    expect(fade.finish).toHaveBeenCalled();
    expect(dot.finish).not.toHaveBeenCalled();
    expect((copy.querySelector('g') as SVGElement).style.opacity).not.toBe('0.3');
    expect((copy.querySelector('path') as SVGElement).style.strokeDashoffset).not.toBe('80');
    expect(copy.querySelector('.eve-flow')).toBeNull();
  });

  it("draws a line's label chip as the drawing's own rectangles: as a shadow round HTML, WebKit drew half of it", () => {
    const d = document.createElement('div');
    d.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><g class="edgeLabel"><g class="label"><foreignObject width="20" height="18">
      <div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="background-color: rgb(255, 255, 255); border-radius: 6px; box-shadow: rgb(255, 255, 255) 0px 0px 0px 4px, rgb(229, 232, 235) 0px 0px 0px 5px"><span class="edgeLabel">yes</span></div>
      </foreignObject></g></g></svg>`;
    const copy = drawnCopy(d.firstElementChild!);
    const rects = [...copy.querySelectorAll('g.label > rect')].map((r) => [r.getAttribute('x'), r.getAttribute('width'), r.getAttribute('rx'), (r as SVGElement).style.fill]);
    // the ring widest first, under the rest; then the chip; each round as the chip is, its words still on top
    expect(rects).toEqual([['-5', '30', '11', 'rgb(229, 232, 235)'], ['-4', '28', '10', 'rgb(255, 255, 255)'], ['0', '20', '6', 'rgb(255, 255, 255)']]);
    expect(copy.querySelector('g.label > :last-child')!.tagName).toBe('foreignObject');
    expect((copy.querySelector('.labelBkg') as HTMLElement).style.boxShadow).toBe('none');
  });
});
