// A diagram that draws itself in, after pele-animate (github.com/dkdev24/pele-animate, MIT), on mermaid's own SVG: a
// flowchart's boxes come up level by level from the ones nothing points to, each line drawing from its source once that
// is up and its label fading in with it; a sequence diagram's people, then its messages in order. Then light flows
// along its lines, a box pointed at lights the way through it, and ▶ tells it a step at a time. Nothing is hidden at
// rest: the finished picture is what is drawn, and the motion only plays over it (none with the system's Reduce motion).

const UNIT = 0.6;
const MAX = 2.4;
const FADE = 400, POP = 520;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Step = { el: Element; at: number; stage: number; line?: SVGPathElement | SVGLineElement };

export function timeline(svg: SVGSVGElement): Step[] {
  const kind = svg.getAttribute('aria-roledescription');
  if (kind === 'sequence') {
    const msgs = [...svg.querySelectorAll<SVGLineElement | SVGPathElement>(':is(line, path)[class^="messageLine"]')];
    const u = Math.min(UNIT, MAX / Math.max(1, msgs.length));
    const steps: Step[] = [...svg.querySelectorAll('rect.actor, text.actor, g.actor-man')].map((el) => ({ el, at: 0, stage: 0 }));
    for (const el of svg.querySelectorAll('line.actor-line')) steps.push({ el, at: 0.2, stage: 0 });
    msgs.forEach((line, i) => {
      const at = 0.4 + i * u;
      steps.push({ el: line, at, stage: i + 1, line });
      const t = line.previousElementSibling;
      if (t?.classList.contains('messageText')) steps.push({ el: t, at, stage: i + 1 });
    });
    return steps;
  }
  const parts = flowParts(svg);
  if (!parts) return [];
  const { nodes, lines, labels } = parts;
  const level = numbered(levels([...nodes.keys()], lines.flatMap((l) => (l.ends ? [l.ends] : []))), nodes);
  const u = Math.min(UNIT, MAX / (Math.max(0, ...level.values()) + 1));
  const steps: Step[] = [...nodes].map(([id, el]) => ({ el, at: level.get(id)! * u, stage: level.get(id)! }));
  for (const { p, ends } of lines) {
    const [s, d] = ends ?? ['', ''];
    const at = Math.max((level.get(s) ?? 0) * u + 0.25 * (u / UNIT), (level.get(d) ?? 0) * u - 0.4 * (u / UNIT));
    const stage = Math.max(level.get(s) ?? 0, level.get(d) ?? 0);
    steps.push({ el: p, at, stage, line: p });
    const label = labels.get(p.dataset.id!);
    if (label) steps.push({ el: label, at: at + 0.15, stage });
  }
  return steps;
}

function flowParts(svg: SVGSVGElement) {
  if (svg.getAttribute('aria-roledescription') !== 'flowchart-v2') return null;
  const prefix = `${svg.id}-flowchart-`;
  const nodes = new Map<string, Element>();
  for (const g of svg.querySelectorAll('g.node')) if (g.id.startsWith(prefix)) nodes.set(g.id.slice(prefix.length).replace(/-\d+$/, ''), g);
  const ids = [...nodes.keys()];
  // `L_<from>_<to>_<n>`: names may have underscores of their own, so it is read against the boxes there are
  const ends = (dataId: string): [string, string] | null => {
    for (const s of ids) if (dataId.startsWith(`L_${s}_`)) for (const d of ids) if (new RegExp(`^L_${esc(s)}_${esc(d)}_\\d+$`).test(dataId)) return [s, d];
    return null;
  };
  // a line given a name of its own (`e1@-->`, a Moving one) has it for its id: its ends are the boxes nearest where it
  // starts and stops (read as nothing, it came up first, and the box only it reaches with it)
  const centre = new Map([...nodes].map(([id, g]) => {
    const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(g.getAttribute('transform') ?? '');
    return [id, m ? [+m[1], +m[2]] : null] as const;
  }));
  const nearest = (x: number, y: number) => {
    let best = '', d = Infinity;
    for (const [id, c] of centre) if (c && Math.hypot(c[0] - x, c[1] - y) < d) { d = Math.hypot(c[0] - x, c[1] - y); best = id; }
    return best;
  };
  const drawnEnds = (p: SVGPathElement): [string, string] | null => {
    const n = (p.getAttribute('d') ?? '').match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    if (n.length < 4) return null;
    const s = nearest(n[0], n[1]), d = nearest(n[n.length - 2], n[n.length - 1]);
    return s && d && s !== d ? [s, d] : null;
  };
  const lines = [...svg.querySelectorAll<SVGPathElement>('path.flowchart-link[data-id]')].map((p) => ({ p, ends: ends(p.dataset.id!) ?? drawnEnds(p) }));
  const labels = new Map([...svg.querySelectorAll<SVGGElement>('g.edgeLabel > g.label[data-id]')].map((g) => [g.dataset.id!, g.parentElement!]));
  return { nodes, lines, labels };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function levels(ids: string[], pairs: [string, string][]): Map<string, number> {
  const level = new Map<string, number>();
  const pointed = new Set(pairs.map(([, d]) => d));
  let queue = ids.filter((i) => !pointed.has(i));
  if (!queue.length && ids.length) queue = [ids[0]];
  for (const q of queue) level.set(q, 0);
  while (queue.length) {
    const next: string[] = [];
    for (const s of queue) for (const [a, d] of pairs) if (a === s && !level.has(d)) { level.set(d, level.get(s)! + 1); next.push(d); }
    queue = next;
    if (!queue.length) { const left = ids.find((i) => !level.has(i)); if (left) { level.set(left, Math.max(...level.values()) + 1); queue = [left]; } }
  }
  return level;
}

export function numbered(level: Map<string, number>, nodes: Map<string, Element>): Map<string, number> {
  for (const [id, el] of nodes) {
    const k = /(?:^|\s)step([1-9]\d*)(?:\s|$)/.exec(el.getAttribute('class') ?? '');
    if (k) level.set(id, +k[1] - 1);
  }
  const used = [...new Set(level.values())].sort((a, b) => a - b);
  return new Map([...level].map(([id, l]) => [id, used.indexOf(l)]));
}

// by its tag: a page without SVG's classes (jsdom) has no SVGPathElement to ask
const len = (l: SVGPathElement | SVGLineElement) => {
  if (l.tagName === 'path') return (l as SVGPathElement).getTotalLength();
  const { x1, x2, y1, y2 } = l as SVGLineElement;
  return Math.hypot(x2.baseVal.value - x1.baseVal.value, y2.baseVal.value - y1.baseVal.value);
};

export const DRAWING = 'eve-drawing';
const heads = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const settle = (svg: SVGSVGElement) => { for (const l of svg.querySelectorAll(`.${DRAWING}`)) { clearTimeout(heads.get(l)); heads.delete(l); l.classList.remove(DRAWING); } };

function enter({ el, line }: Step, delay: number): Animation {
  if (!line && el.matches('g.node, rect.actor, g.actor-man')) {
    return el.animate([{ opacity: 0, scale: '0.92' }, { opacity: 1, scale: '1.015', offset: 0.6 }, { opacity: 1, scale: '1' }],
      { duration: POP, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
  }
  if (!line) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, delay, easing: 'ease-out', fill: 'backwards' });
  const n = len(line);
  const a = line.animate([
    { strokeDasharray: `${n}`, strokeDashoffset: `${n}` },
    { strokeDasharray: `${n}`, strokeDashoffset: '0' },
  ], { duration: FADE, delay, easing: 'ease-out', fill: 'backwards' });
  clearTimeout(heads.get(line));
  line.classList.add(DRAWING);
  const back = () => { clearTimeout(heads.get(line)); heads.delete(line); line.classList.remove(DRAWING); };
  heads.set(line, setTimeout(back, delay + FADE));
  a.addEventListener?.('cancel', back);
  return a;
}

export function stepper(svg: SVGSVGElement): { count: number; show(k: number): void } {
  settle(svg);
  const steps = timeline(svg);
  const count = steps.length ? Math.max(...steps.map((s) => s.stage)) + 1 : 0;
  let shown = count - 1;
  return {
    count: count > 1 ? count : 0,
    show(k) {
      for (const s of steps) {
        (s.el as SVGElement).style.opacity = s.stage > k ? '0' : '';
        const f = s.line?.nextElementSibling;
        if (f?.classList.contains(FLOW)) (f as SVGElement).style.opacity = s.stage > k ? '0' : '';
        if (s.stage === k && k > shown && 'animate' in s.el && !reduced()) enter(s, 0);
      }
      shown = k;
    },
  };
}

export function drawIn(svg: SVGSVGElement, played?: () => void): () => void {
  if (reduced() || typeof IntersectionObserver === 'undefined' || !svg.animate) return () => {};
  settle(svg);
  const steps = timeline(svg);
  if (!steps.length) return () => {};
  const running: Animation[] = [];
  const play = () => {
    for (const s of steps) running.push(enter(s, s.at * 1000));
    Promise.all(running.map((a) => a.finished)).then(() => played?.(), () => {});
  };
  const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.3 });
  io.observe(svg);
  return () => { io.disconnect(); for (const a of running) a.cancel(); };
}


export function focus(svg: SVGSVGElement): () => void {
  const parts = flowParts(svg);
  if (!parts) return () => {};
  const { nodes, lines, labels } = parts;
  const ids = new Map([...nodes].map(([id, el]) => [el, id]));
  const back = new Set<(typeof lines)[number]>(), seen = new Set<string>(), stack = new Set<string>();
  const walk = (at: string) => {
    seen.add(at); stack.add(at);
    for (const l of lines) if (l.ends?.[0] === at) {
      if (stack.has(l.ends[1])) back.add(l);
      else if (!seen.has(l.ends[1])) walk(l.ends[1]);
    }
    stack.delete(at);
  };
  const pointed = new Set(lines.map((l) => l.ends?.[1]));
  for (const id of [...nodes.keys()].sort((a, b) => +pointed.has(a) - +pointed.has(b))) if (!seen.has(id)) walk(id);
  const on = lines.filter((l) => l.ends && !back.has(l));
  const reach = (from: string, way: 0 | 1) => {
    const got = new Set([from]);
    for (let todo = [from]; todo.length;) {
      const at = todo.pop()!;
      for (const { ends } of on) if (ends![1 - way] === at && !got.has(ends![way])) { got.add(ends![way]); todo.push(ends![way]); }
    }
    return got;
  };
  const clear = () => { svg.classList.remove('eve-focus'); for (const el of svg.querySelectorAll('.eve-lit, .eve-here')) el.classList.remove('eve-lit', 'eve-here'); };
  const over = (e: Event) => {
    const box = (e.target as Element).closest?.('g.node');
    const id = box && ids.get(box);
    clear();
    if (!id) return;
    const up = reach(id, 0), down = reach(id, 1);
    const path = new Set([...up, ...down]);
    const lit: Element[] = [];
    for (const l of lines) {
      if (!l.ends) continue;
      const [s, d] = l.ends;
      const through = on.includes(l) && ((up.has(s) && up.has(d)) || (down.has(s) && down.has(d)));
      if (!through && s !== id && d !== id) continue;
      path.add(s); path.add(d);
      const label = labels.get(l.p.dataset.id!), f = l.p.nextElementSibling;
      lit.push(l.p);
      if (label) lit.push(label);
      if (f?.classList.contains(FLOW)) lit.push(f);
    }
    for (const p of path) lit.push(nodes.get(p)!);
    for (const el of lit) el.classList.add('eve-lit');
    box.classList.add('eve-here');
    svg.classList.add('eve-focus');
  };
  svg.addEventListener('pointerover', over);
  svg.addEventListener('pointerleave', clear);
  return () => { clear(); svg.removeEventListener('pointerover', over); svg.removeEventListener('pointerleave', clear); };
}

const BEAT = 900;
export function play(svg: SVGSVGElement, done: () => void): () => void {
  const s = stepper(svg), steps = timeline(svg);
  if (!s.count) { done(); return () => {}; }
  let k = 0, over = false;
  const mark = () => {
    for (const el of svg.querySelectorAll('.eve-now')) el.classList.remove('eve-now');
    for (const st of steps) if (st.stage === k) st.el.classList.add('eve-now');
  };
  svg.classList.add('eve-playing');
  s.show(0);
  mark();
  const end = () => {
    if (over) return;
    over = true;
    clearInterval(t);
    s.show(s.count - 1);
    for (const el of svg.querySelectorAll('.eve-now')) el.classList.remove('eve-now');
    svg.classList.remove('eve-playing');
    done();
  };
  const t = setInterval(() => {
    if (++k >= s.count) return end();
    s.show(k);
    mark();
  }, BEAT);
  return end;
}

export const FLOW = 'eve-flow';
export function flow(svg: SVGSVGElement): () => void {
  if (reduced()) return () => {};
  const lines = svg.querySelectorAll<SVGPathElement | SVGLineElement>(
    'path.flowchart-link:not(.dotted, .moving, .edge-pattern-dotted, .edge-pattern-dashed, [class*="edge-animation"]), line.messageLine0, path.messageLine0');
  const copies = [...lines].map((l) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    c.setAttribute('d', l.tagName === 'path' ? l.getAttribute('d') ?? '' : `M${l.getAttribute('x1')},${l.getAttribute('y1')}L${l.getAttribute('x2')},${l.getAttribute('y2')}`);
    c.setAttribute('class', FLOW);
    l.after(c);
    return c;
  });
  const io = typeof IntersectionObserver === 'undefined' ? null
    : new IntersectionObserver(([e]) => svg.classList.toggle('eve-flowing', !!e?.isIntersecting));
  io?.observe(svg);
  return () => { io?.disconnect(); svg.classList.remove('eve-flowing'); for (const c of copies) c.remove(); };
}
