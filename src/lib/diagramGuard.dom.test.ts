// The guard for diagrams, as storeFuzz is for the notes store: most of the diagram fixes so far were one chart drawn
// wrong (a label cut at the edge, a line through a box, a loop off the drawing) or one sequence of turns that left a
// part hidden (a line without its head, a box never back). Here seeded random charts are drawn and walked, and the
// rules checked on each; a new kind of line or a new motion is added to `chart` / `turns`, a new rule to `wrong`.
import { describe, expect, it, vi } from 'vitest';
import type { Flowchart, FlowNode } from './diagram';
import { laneSvg } from './lanes';
import { DRAWING, drawIn, stepper } from './diagramMotion';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SHAPES: FlowNode['shape'][] = ['round', 'box', 'pill', 'diamond', 'circle', 'db'];
const WORDS = ['Order', '결제', 'Check the stock', 'Ship it to the customer today', '포장', 'Done', 'a', '다시 확인하고 알려 주기'];
const LABELS = ['', '', 'yes', 'no', '쿠폰이면 건너뜀', 'when the order is paid and packed'];

/** a random chart in lanes: forward lines, lines back, to itself, past a step, beside one; some boxes in no lane */
function chart(r: () => number): Flowchart {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const lanes = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => ({ id: `L${i}`, label: pick(['Customer', '가게', 'Service team', '']) }));
  const nodes: FlowNode[] = Array.from({ length: 2 + Math.floor(r() * 7) }, (_, i) => ({
    id: `n${i}`, label: pick(WORDS), shape: pick(SHAPES), lane: r() < 0.9 ? pick(lanes).id : undefined,
  }));
  const edges: Flowchart['edges'] = [];
  for (let i = 1; i < nodes.length; i++) if (r() < 0.8) edges.push({ from: nodes[Math.floor(r() * i)].id, to: nodes[i].id, label: pick(LABELS), line: pick(['solid', 'dotted', 'thick']) });
  for (let k = Math.floor(r() * 3); k > 0; k--) edges.push({ from: pick(nodes).id, to: pick(nodes).id, label: pick(LABELS), line: 'solid' });
  return { kind: 'flowchart', dir: r() < 0.5 ? 'LR' : 'TD', lanes, nodes, edges };
}

const svgOf = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as SVGSVGElement;
};
type Rect = { x0: number; y0: number; x1: number; y1: number };
const num = (el: Element, a: string) => +(el.getAttribute(a) ?? NaN);
/** a box's outline as drawn (its shape's own numbers: jsdom lays nothing out) */
function boxRect(g: Element): Rect {
  const s = g.querySelector('.sl-shape')!;
  if (s.tagName === 'rect') return { x0: num(s, 'x'), y0: num(s, 'y'), x1: num(s, 'x') + num(s, 'width'), y1: num(s, 'y') + num(s, 'height') };
  if (s.tagName === 'circle') { const [cx, cy, rr] = [num(s, 'cx'), num(s, 'cy'), num(s, 'r')]; return { x0: cx - rr, y0: cy - rr, x1: cx + rr, y1: cy + rr }; }
  // a diamond's corners, or a cylinder's moves from its top-left: the numbers of its path are enough for its extent
  const d = s.getAttribute('d')!;
  if (s.classList.contains('sl-shape') && /^M[-\d.]+,[-\d.]+ L/.test(d)) {
    const p = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    return { x0: Math.min(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), x1: Math.max(...p.map((q) => q[0])), y1: Math.max(...p.map((q) => q[1])) };
  }
  const [, l, t] = /^M(-?[\d.]+),(-?[\d.]+)/.exec(d)!.map(Number);
  const w = +/a([\d.]+),6/.exec(d)![1] * 2, h = +/v([\d.]+)/.exec(d)![1] + 12;
  return { x0: l, y0: t - 6, x1: l + w, y1: t - 6 + h };
}
/** a line's corners (the rounding's control points stand at them) */
const corners = (p: Element) => [...(p.getAttribute('d') ?? '').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]] as [number, number]);
const shrink = (r: Rect, k: number): Rect => ({ x0: r.x0 + k, y0: r.y0 + k, x1: r.x1 - k, y1: r.y1 - k });
const crosses = ([x0, y0]: [number, number], [x1, y1]: [number, number], r: Rect) =>
  Math.min(x0, x1) < r.x1 && Math.max(x0, x1) > r.x0 && Math.min(y0, y1) < r.y1 && Math.max(y0, y1) > r.y0;
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** what is wrong with a drawing of `d` */
function wrong(d: Flowchart, svg: SVGSVGElement): string[] {
  const out: string[] = [];
  if (/NaN|undefined/.test(svg.outerHTML)) out.push('NaN or undefined in the drawing');
  const [, , W, H] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  const inside = (x: number, y: number) => x >= -0.5 && y >= -0.5 && x <= W + 0.5 && y <= H + 0.5;
  const boxes = new Map<string, Rect>();
  for (const g of svg.querySelectorAll('g.node')) boxes.set(/-flowchart-(.+)-0$/.exec(g.id)![1], boxRect(g));
  if (boxes.size !== d.nodes.length) out.push(`${boxes.size} boxes drawn of ${d.nodes.length}`);
  for (const [id, b] of boxes) if (!inside(b.x0, b.y0) || !inside(b.x1, b.y1)) out.push(`box ${id} past the edge`);
  const lines = [...svg.querySelectorAll('path.flowchart-link')];
  if (lines.length !== d.edges.length) out.push(`${lines.length} lines drawn of ${d.edges.length}`);
  lines.forEach((p, i) => {
    const e = d.edges[i];
    if (p.getAttribute('data-id') !== `L_${e.from}_${e.to}_${i}`) out.push(`line ${i} named ${p.getAttribute('data-id')}`);
    const pts = corners(p);
    for (const [x, y] of pts) if (!inside(x, y)) { out.push(`line ${e.from}→${e.to} at ${x},${y} past the edge`); break; }
    // through no box but its own two (its own it may leave and enter, and a loop sits on its one)
    for (const [id, b] of boxes) {
      if (id === e.from || id === e.to) continue;
      for (let k = 1; k < pts.length; k++) if (crosses(pts[k - 1], pts[k], shrink(b, 1))) { out.push(`line ${e.from}→${e.to} through box ${id}`); break; }
    }
  });
  for (const c of svg.querySelectorAll('.sl-chip')) {
    const r = { x0: num(c, 'x'), y0: num(c, 'y'), x1: num(c, 'x') + num(c, 'width'), y1: num(c, 'y') + num(c, 'height') };
    const name = c.parentElement!.textContent;
    if (!inside(r.x0, r.y0) || !inside(r.x1, r.y1)) out.push(`label "${name}" past the edge`);
    for (const [id, b] of boxes) if (overlap(r, shrink(b, 1)) > 0) out.push(`label "${name}" over box ${id}`);
  }
  return out;
}

describe('every chart in lanes is drawn whole', () => {
  it('random charts, across and down: inside the drawing, no line through another step, no label over one', () => {
    const fails: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const d = chart(rng(seed));
      const bad = wrong(d, svgOf(laneSvg(d)));
      if (bad.length) fails.push(`seed ${seed} (${d.dir}): ${bad.join('; ')}`);
    }
    expect(fails.slice(0, 15)).toEqual([]);
  });
});

describe('a diagram walked and drawn in any way ends as it was drawn', () => {
  it('drawn in, stepped → and ←, copied mid-way, put away at any moment: every part shown again, every line with its head', () => {
    vi.useFakeTimers();
    let watching: ((e: { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal('IntersectionObserver', class { constructor(f: (e: { isIntersecting: boolean }[]) => void) { watching.push(f); } observe() {} disconnect() {} });
    try {
      const fails: string[] = [];
      for (let seed = 1; seed <= 60; seed++) {
        const r = rng(seed);
        // its heads as mermaid's (an attribute) or set on it (a style), as both are met
        const html = laneSvg(chart(r)).replace(/marker-end="([^"]+)"/g, (m, u) => (r() < 0.5 ? m : `style="marker-end: ${u}"`));
        const ready = (svg: SVGSVGElement) => {
          for (const el of svg.querySelectorAll('path, g')) Object.assign(el, { animate: () => {
            const a = Object.assign(new EventTarget(), { finished: new Promise(() => {}), cancel: () => a.dispatchEvent(new Event('cancel')) });
            return a;
          } });
          for (const p of svg.querySelectorAll('path.flowchart-link')) Object.assign(p, { getTotalLength: () => 100 });
          return svg;
        };
        const at = (svg: SVGSVGElement) => [...svg.querySelectorAll<SVGElement>('g.node, g.edgeLabel, path.flowchart-link')]
          .map((el) => `${el.style.opacity}|${el.style.markerEnd}|${el.getAttribute('marker-end') ?? ''}|${el.classList.contains(DRAWING) ? 'headless' : ''}`);
        let svg = ready(svgOf(html));
        const start = at(svg);
        let walk = stepper(svg), stop = () => {};
        const turns: string[] = [];
        for (let k = 0; k < 12; k++) {
          const t = r();
          if (t < 0.15) { watching = []; stop = drawIn(svg); for (const f of watching) f([{ isIntersecting: true }]); turns.push('draw in'); }
          else if (t < 0.25) { stop(); turns.push('put away'); }
          else if (t < 0.35) { svg = ready(svg.cloneNode(true) as SVGSVGElement); walk = stepper(svg); turns.push('copied'); }
          else if (t < 0.55) { const ms = Math.floor(r() * 900); vi.advanceTimersByTime(ms); turns.push(`${ms}ms`); }
          else if (walk.count) { const s = Math.floor(r() * walk.count); walk.show(s); turns.push(`show ${s}`); }
        }
        // the end of the walk, then time for all of it to land
        if (walk.count) walk.show(walk.count - 1);
        stop();
        vi.advanceTimersByTime(5000);
        const end = at(svg);
        const off = end.map((s, i) => (s === start[i] ? '' : `${i}: ${start[i]} → ${s}`)).filter(Boolean);
        if (off.length) fails.push(`seed ${seed} [${turns.join(', ')}]: ${off.slice(0, 3).join('; ')}`);
      }
      expect(fails.slice(0, 10)).toEqual([]);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
