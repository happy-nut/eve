/**
 * A flowchart's line labels, kept off one another and off the boxes. Mermaid puts each at the middle of its line, and
 * a line back up the chart (a retry, a "no") runs beside the ones going down: their labels landed on each other. Drawn,
 * each label that sits on one placed before it (or on a box) is moved along its own line to the nearest place that is
 * free, the middle first, then outwards; none free, it stays where mermaid put it. Labels and lines are in the same
 * order in the drawing (g.edgeLabel, path.flowchart-link), so the i-th label belongs to the i-th line.
 */
type Rect = { l: number; r: number; t: number; b: number };
const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85];
// a label's chip is drawn 5px past its box (mermaid.ts), and wants a little air past that
const PAD = 7;

const box = (el: Element, pad: number): Rect => {
  const b = el.getBoundingClientRect();
  return { l: b.left - pad, r: b.right + pad, t: b.top - pad, b: b.bottom + pad };
};
const hits = (a: Rect, b: Rect) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** the labels moved; how many were */
export function spreadLabels(svg: SVGSVGElement): number {
  const labels = [...svg.querySelectorAll<SVGGElement>('g.edgeLabels > g.edgeLabel')];
  const lines = [...svg.querySelectorAll<SVGPathElement>('path.flowchart-link')];
  if (!labels.length || labels.length !== lines.length) return 0;
  const taken: Rect[] = [...svg.querySelectorAll('g.node')].map((n) => box(n, 2));
  let moved = 0;
  labels.forEach((label, i) => {
    if (!label.textContent?.trim()) return;
    const here = box(label, PAD);
    if (!taken.some((t) => hits(here, t))) { taken.push(here); return; }
    const line = lines[i], toScreen = line.getScreenCTM(), parent = (label.parentNode as SVGGraphicsElement).getScreenCTM();
    if (!toScreen || !parent || typeof line.getTotalLength !== 'function') { taken.push(here); return; }
    const length = line.getTotalLength(), w = here.r - here.l, h = here.b - here.t;
    const mid = { x: (here.l + here.r) / 2, y: (here.t + here.b) / 2 };
    for (const f of ALONG) {
      const p = line.getPointAtLength(length * f), at = new DOMPoint(p.x, p.y).matrixTransform(toScreen);
      const there = { l: at.x - w / 2, r: at.x + w / 2, t: at.y - h / 2, b: at.y + h / 2 };
      if (taken.some((t) => hits(there, t))) continue;
      // the label's own place (its middle, translate(x, y)) moved by as much, in its parent's units
      const m = /translate\(\s*([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/.exec(label.getAttribute('transform') ?? '');
      const [x, y] = m ? [+m[1], +m[2]] : [0, 0];
      label.setAttribute('transform', `translate(${x + (at.x - mid.x) / parent.a}, ${y + (at.y - mid.y) / parent.d})`);
      taken.push(there);
      moved++;
      return;
    }
    taken.push(here);
  });
  return moved;
}
