// A diagram that draws itself in, after pele-animate (github.com/dkdev24/pele-animate, MIT), on mermaid's own SVG: a
// flowchart's boxes come up level by level from the ones nothing points to, each line drawing from its source once that
// is up and its label fading in with it; a sequence diagram's people, then its messages in order. Hovered, a dot runs
// along each line in the same order, over and over. Nothing is hidden at rest: the finished picture is what is drawn,
// and the motion only plays over it (none with the system's Reduce motion).

const UNIT = 0.6; // seconds a level (or a message) takes
const MAX = 2.4; // a long diagram's levels are squeezed so the whole of it is drawn in about this long
const FADE = 400, TOKEN = 0.5;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Step = { el: Element; at: number; line?: SVGPathElement | SVGLineElement };

/** what comes up when: an element, the second it starts at, and its line when it is one */
export function timeline(svg: SVGSVGElement): Step[] {
  const kind = svg.getAttribute('aria-roledescription');
  if (kind === 'sequence') {
    const msgs = [...svg.querySelectorAll<SVGLineElement>('line[class^="messageLine"]')];
    const u = Math.min(UNIT, MAX / Math.max(1, msgs.length));
    const steps: Step[] = [...svg.querySelectorAll('rect.actor, text.actor, g.actor-man')].map((el) => ({ el, at: 0 }));
    for (const el of svg.querySelectorAll('line.actor-line')) steps.push({ el, at: 0.2 });
    msgs.forEach((line, i) => {
      const at = 0.4 + i * u;
      steps.push({ el: line, at, line });
      // its words are the text just before it
      const t = line.previousElementSibling;
      if (t?.classList.contains('messageText')) steps.push({ el: t, at });
    });
    return steps;
  }
  if (kind !== 'flowchart-v2') return [];
  const prefix = `${svg.id}-flowchart-`;
  const nodes = new Map<string, Element>();
  for (const g of svg.querySelectorAll('g.node')) if (g.id.startsWith(prefix)) nodes.set(g.id.slice(prefix.length).replace(/-\d+$/, ''), g);
  const ids = [...nodes.keys()];
  // `L_<from>_<to>_<n>`: names may have underscores of their own, so it is read against the boxes there are
  const ends = (dataId: string): [string, string] | null => {
    for (const s of ids) if (dataId.startsWith(`L_${s}_`)) for (const d of ids) if (new RegExp(`^L_${esc(s)}_${esc(d)}_\\d+$`).test(dataId)) return [s, d];
    return null;
  };
  const lines = [...svg.querySelectorAll<SVGPathElement>('path.flowchart-link[data-id]')].map((p) => ({ p, ends: ends(p.dataset.id!) }));
  const level = levels(ids, lines.flatMap((l) => (l.ends ? [l.ends] : [])));
  const u = Math.min(UNIT, MAX / (Math.max(0, ...level.values()) + 1));
  const steps: Step[] = [...nodes].map(([id, el]) => ({ el, at: level.get(id)! * u }));
  const labels = new Map([...svg.querySelectorAll<SVGGElement>('g.edgeLabel > g.label[data-id]')].map((g) => [g.dataset.id!, g.parentElement!]));
  for (const { p, ends } of lines) {
    const [s, d] = ends ?? ['', ''];
    // from its source once that is up, landing about when its target comes up (a line back up the chart: when it is due)
    const at = Math.max((level.get(s) ?? 0) * u + 0.25 * (u / UNIT), (level.get(d) ?? 0) * u - 0.4 * (u / UNIT));
    steps.push({ el: p, at, line: p });
    const label = labels.get(p.dataset.id!);
    if (label) steps.push({ el: label, at: at + 0.15 });
  }
  return steps;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** each box's level: breadth first from the ones nothing points to (or the first, in a circle) */
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
    // a part of the chart nothing above reaches (a circle of its own): from its first box, after the rest
    if (!queue.length) { const left = ids.find((i) => !level.has(i)); if (left) { level.set(left, Math.max(...level.values()) + 1); queue = [left]; } }
  }
  return level;
}

const len = (l: SVGPathElement | SVGLineElement) => (l instanceof SVGPathElement ? l.getTotalLength() : Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value));

/** the diagram drawn in, once it is well in sight; the returned function stops it (drawn again, put away) */
export function drawIn(svg: SVGSVGElement): () => void {
  if (reduced() || typeof IntersectionObserver === 'undefined' || !svg.animate) return () => {};
  const steps = timeline(svg);
  if (!steps.length) return () => {};
  const running: Animation[] = [];
  const play = () => {
    for (const { el, at, line } of steps) {
      const delay = at * 1000;
      if (line) {
        const n = len(line);
        // the dash is the keyframes' own, so a dotted line goes back to its dots when it is drawn
        // and its arrowhead only once it has got there (drawn at its end from the start, it was there before the line)
        const head = getComputedStyle(line).markerEnd, arrow = head && head !== 'none' ? { markerEnd: 'none' } : {};
        running.push(line.animate([
          { strokeDasharray: `${n}`, strokeDashoffset: `${n}`, ...arrow },
          { strokeDasharray: `${n}`, strokeDashoffset: '0', ...arrow, offset: 0.99 },
          { strokeDasharray: `${n}`, strokeDashoffset: '0' },
        ], { duration: FADE, delay, easing: 'ease-out', fill: 'backwards' }));
      } else running.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, delay, easing: 'ease-out', fill: 'backwards' }));
    }
  };
  const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.3 });
  io.observe(svg);
  return () => { io.disconnect(); for (const a of running) a.cancel(); };
}

/** hovered: a dot along each line, in the order they were drawn, then a pause, and again; the returned function stops it */
export function tokens(svg: SVGSVGElement): () => void {
  if (!svg.animate) return () => {};
  const lines = timeline(svg).filter((s): s is Step & { line: SVGPathElement | SVGLineElement } => !!s.line);
  if (!lines.length) return () => {};
  const cycle = Math.max(...lines.map((l) => l.at)) + TOKEN + 0.8;
  let dots: SVGCircleElement[] = [];
  const play = () => {
    if (reduced() || dots.length) return;
    dots = lines.map(({ line, at }) => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '3');
      dot.setAttribute('class', 'eve-token');
      dot.style.offsetPath = `path("${line instanceof SVGPathElement ? line.getAttribute('d') : `M${line.x1.baseVal.value},${line.y1.baseVal.value}L${line.x2.baseVal.value},${line.y2.baseVal.value}`}")`;
      dot.style.offsetRotate = '0deg';
      line.after(dot);
      const a = at / cycle, b = (at + TOKEN) / cycle, e = 0.001;
      dot.animate([
        { offset: 0, opacity: 0, offsetDistance: '0%' }, { offset: a, opacity: 0, offsetDistance: '0%' },
        { offset: a + e, opacity: 1, offsetDistance: '0%' }, { offset: b, opacity: 1, offsetDistance: '100%' },
        { offset: Math.min(b + e, 1), opacity: 0, offsetDistance: '100%' }, { offset: 1, opacity: 0, offsetDistance: '100%' },
      ], { duration: cycle * 1000, iterations: Infinity });
      return dot;
    });
  };
  const stop = () => { for (const d of dots) d.remove(); dots = []; };
  svg.addEventListener('pointerenter', play);
  svg.addEventListener('pointerleave', stop);
  return () => { stop(); svg.removeEventListener('pointerenter', play); svg.removeEventListener('pointerleave', stop); };
}
