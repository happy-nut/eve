import type { Flowchart, FlowNode } from './diagram';

/**
 * Swimlanes, drawn by Eve: a flowchart whose boxes sit in lanes (mermaid's subgraphs). Mermaid draws subgraphs as
 * boxes it places where it likes, overlapping and out of line; lanes are bands side by side, every step in the band
 * of who does it, the steps in the order they happen across them. Across (LR) the lanes are rows, their names at the
 * left; down (TD) they are columns, their names on top.
 *
 * The drawing is made as mermaid makes a flowchart (a g.node per box, ids ending in -flowchart-<id>-0, a
 * path.flowchart-link per line in the chart's order, g.edgeLabel > g.label for their labels), so FlowEditor.svelte
 * edits it the same way; each lane's name is a g.lane-head to be clicked. Colours are CSS variables (app.css), so the
 * light and dark themes need no drawing again.
 */

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif";
let ctx: CanvasRenderingContext2D | null | undefined;
/** a text's width at that size: the page's own measure, or a fair guess where there is no page (tests) */
export function textW(s: string, size: number, weight = 400): number {
  if (ctx === undefined) {
    try { ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { ctx = null; }
  }
  if (ctx) { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(s).width; }
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? size : size * 0.56;
  return w;
}
/** a label in lines no wider than `max` (at spaces; a word longer than a line keeps its line) */
export function wrap(s: string, max: number, size: number, weight = 400): string[] {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textW(next, size, weight) > max) { out.push(line); line = w; } else line = next;
  }
  out.push(line);
  return out;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SIZE = 14, LINE = 19;
const GAP = 40; // between steps, along the flow (wider where a line's label stands in it)
const LABEL_MAX = 150, LABEL_LINE = 15, LABEL_AIR = 8; // a line's label: its width before it wraps, and room around it
const PAD = 20; // before the first step and after the last
const SLOT_GAP = 26; // between two steps side by side in a lane
const LANE_PAD = 14;
const LOOP = 20; // how far a line back into its own step stands out from it (its label's middle, clear of the box)
let uid = 0;

interface Box { n: FlowNode; lines: string[]; w: number; h: number; rank: number; lane: number; slot: number; m: number; c: number }

/** a path through `pts`, its corners rounded */
function rounded(pts: [number, number][], r = 10): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === pts.length - 1) { d += ` L${x},${y}`; break; }
    const [px, py] = pts[i - 1], [nx, ny] = pts[i + 1];
    const a = Math.min(r, Math.hypot(x - px, y - py) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${x - ux * a},${y - uy * a} Q${x},${y} ${x + vx * b},${y + vy * b}`;
  }
  return d;
}

/** `minScale`: how far it may shrink to the note's width before it scrolls sideways in its card */
export function laneSvg(d: Flowchart, minScale = 0.8): string {
  const LR = d.dir === 'LR' || d.dir === 'RL'; // (across, as diagram.ts's: a value import here would not load in node's tests)
  const id = `sl${++uid}`;
  // a flowchart without lanes (charts.ts draws one here when mermaid would draw it no differently): one band, unseen
  const plain = !d.lanes?.length;
  const lanes = [...(d.lanes ?? [])];
  const laneIx = new Map(lanes.map((l, i) => [l.id, i]));
  if (d.nodes.some((n) => !laneIx.has(n.lane ?? ''))) lanes.push({ id: '', label: '' }); // the boxes in no lane
  const laneOf = (n: FlowNode) => laneIx.get(n.lane ?? '') ?? lanes.length - 1;

  // ---- each box's size ----
  const boxes = new Map<string, Box>();
  for (const n of d.nodes) {
    const diamond = n.shape === 'diamond', circle = n.shape === 'circle';
    const lines = wrap(n.label, diamond ? 96 : 120, SIZE);
    const tw = Math.max(...lines.map((l) => textW(l, SIZE)));
    let w = Math.max(72, Math.ceil(tw) + 28), h = Math.max(42, lines.length * LINE + 22);
    if (diamond) { w = Math.ceil(tw) + 64; h = Math.max(64, lines.length * LINE + 40); }
    if (circle) { w = h = Math.max(64, Math.ceil(tw) + 28); }
    if (n.shape === 'db') h += 10;
    boxes.set(n.id, { n, lines, w, h, rank: 0, lane: laneOf(n), slot: 0, m: 0, c: 0 });
  }
  const edges = d.edges.filter((e) => boxes.has(e.from) && boxes.has(e.to));

  // ---- the order of the steps: each one after what leads to it (lines that loop back are left out of this) ----
  const out = new Map<string, string[]>();
  for (const e of edges) if (e.from !== e.to) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
  const back = new Set<string>(); // "from>to" of the lines that go back to a step already on the way
  const state = new Map<string, 1 | 2>();
  const visit = (v: string) => {
    state.set(v, 1);
    for (const t of out.get(v) ?? []) {
      if (state.get(t) === 1) back.add(`${v}>${t}`);
      else if (!state.has(t)) visit(t);
    }
    state.set(v, 2);
  };
  for (const n of d.nodes) if (!state.has(n.id)) visit(n.id);
  const fwd = edges.filter((e) => e.from !== e.to && !back.has(`${e.from}>${e.to}`));
  for (let pass = 0; pass < d.nodes.length; pass++) {
    let moved = false;
    for (const e of fwd) {
      const a = boxes.get(e.from)!, b = boxes.get(e.to)!;
      // a step in another lane at the same moment would sit beside it; one in the same lane goes after it
      if (b.rank < a.rank + 1) { b.rank = a.rank + 1; moved = true; }
    }
    if (!moved) break;
  }
  const ranks = Math.max(0, ...[...boxes.values()].map((b) => b.rank)) + 1;

  // ---- where each step goes: its column (rank) and its slot in its lane ----
  const cells = new Map<string, Box[]>();
  for (const b of boxes.values()) {
    const k = `${b.lane}:${b.rank}`;
    b.slot = (cells.get(k) ?? cells.set(k, []).get(k)!).push(b) - 1;
  }
  const main = (b: Box) => (LR ? b.w : b.h), cross = (b: Box) => (LR ? b.h : b.w);
  const colM = Array.from({ length: ranks }, (_, r) => Math.max(40, ...[...boxes.values()].filter((b) => b.rank === r).map(main)));
  const laneSlots = lanes.map((_, i) => Math.max(1, ...[...cells.entries()].filter(([k]) => +k.split(':')[0] === i).map(([, v]) => v.length)));
  // each line's label, wrapped, and its size across the flow (m) and along a lane (c)
  const chips = edges.map((e) => {
    const lines = e.label.trim() ? wrap(e.label, LABEL_MAX, 12) : [];
    const w = lines.length ? Math.ceil(Math.max(...lines.map((l) => textW(l, 12)))) + 14 : 0, h = 22 + (lines.length - 1) * LABEL_LINE;
    return { lines, m: LR ? w : h, c: LR ? h : w };
  });
  // a labelled line between two steps of one column stands its label between them: room for it there, between two
  // in a lane and between two lanes side by side (with 26 there, the label lay over both steps)
  const room = (i: number) => chips[i].c + 8;
  const beside = lanes.map(() => 0), pre = lanes.map(() => 0), stacked = new Map<string, number>();
  const loopsOn = new Map<Box, number>(), loopOff: number[] = [];
  // a line back into its own step loops out before it, its label on the loop: room for both before the step, in its
  // lane or after the step before it in the lane (it went past the drawing's edge, into the lane before, or through
  // the step beside it). Down the page the label lies along the lane: the loop stands out by half of it
  const loopOut = (i: number) => (chips[i].lines.length ? Math.max(LOOP, chips[i].c / 2 + 7) : LOOP);
  edges.forEach((e, i) => {
    const a = boxes.get(e.from)!, b = boxes.get(e.to)!;
    if (a === b) {
      // (a second loop on one step stands out past the first and its label: drawn on it, the two were one)
      const off = loopsOn.get(a) ?? 0;
      loopOff[i] = off;
      const need = off + loopOut(i) + (chips[i].lines.length ? chips[i].c / 2 + 3 : 2);
      loopsOn.set(a, need + 4);
      if (a.slot) beside[a.lane] = Math.max(beside[a.lane], need - SLOT_GAP);
      else pre[a.lane] = Math.max(pre[a.lane], need - LANE_PAD);
      return;
    }
    if (a.rank !== b.rank || !chips[i].lines.length) return;
    // (two lines there, both labelled: room for both, one after the other)
    const k = `${Math.min(a.lane, b.lane)}:${Math.max(a.lane, b.lane)}:${a.rank}`;
    stacked.set(k, (stacked.get(k) ?? 0) + room(i));
    if (a.lane === b.lane) beside[a.lane] = Math.max(beside[a.lane], stacked.get(k)! - SLOT_GAP);
    else if (Math.abs(a.lane - b.lane) === 1) { const l = Math.max(a.lane, b.lane); pre[l] = Math.max(pre[l], stacked.get(k)! - LANE_PAD * 2); }
  });
  const slotC = lanes.map((_, i) => Math.max(LR ? 44 : 96, ...[...boxes.values()].filter((b) => b.lane === i).map(cross)) + SLOT_GAP + beside[i]);
  // down the page, each name wrapped to its column; the head as tall as the longest (a fixed 40 cut a long name's lines)
  const HEAD = plain ? 0 : LR
    ? Math.max(84, Math.min(140, Math.ceil(Math.max(...lanes.map((l) => textW(l.label, 13, 600)))) + 28))
    : 40;
  const laneC = lanes.map((_, i) => pre[i] + laneSlots[i] * slotC[i] + LANE_PAD * 2 - SLOT_GAP - beside[i]);
  const names = lanes.map((l, i) => wrap(l.label, LR ? HEAD - 20 : laneC[i] - 20, 13, 600));
  const HEAD_M = plain ? 0 : LR ? HEAD : Math.max(40, Math.max(...names.map((n) => n.length)) * 17 + 22);
  const laneAt = lanes.map((_, i) => laneC.slice(0, i).reduce((a, b) => a + b, 0));
  for (const b of boxes.values()) b.c = laneAt[b.lane] + pre[b.lane] + LANE_PAD + b.slot * slotC[b.lane] + (slotC[b.lane] - SLOT_GAP - beside[b.lane]) / 2;
  if (plain) laneC[0] = place();

  /** Without lanes, each step stands across from the one its first line in comes from (a first step at the start), the
   *  steps of a column side by side in that order, each as near its place as there is room. So a line drawn in later
   *  moves only what it must: the step it leads to, if it now comes later, and what follows that. (Mermaid weighed
   *  every line in every step's place, and one more line moved all of them.) Returns how wide the drawing is across. */
  function place(): number {
    const first = new Map<Box, Box>();
    for (const e of fwd) { const b = boxes.get(e.to)!; if (!first.has(b)) first.set(b, boxes.get(e.from)!); }
    const order = [...boxes.values()];
    // room before a step for the loops on it (they stand out on that side), and between two side by side for a
    // labelled line between them
    const loopRoom = (b: Box) => (loopsOn.get(b) ?? 0);
    for (let r = 0; r < ranks; r++) {
      const col = order.filter((b) => b.rank === r);
      const want = (b: Box) => first.get(b)?.c ?? 0;
      col.sort((p, q) => want(p) - want(q) || order.indexOf(p) - order.indexOf(q));
      // where each would stand packed from 0, then as near its place as the ones before and after it let it: the
      // packed run cut where it may move apart, each part centred on the places its steps want (pool adjacent violators)
      const off: number[] = [];
      col.forEach((b, k) => {
        if (!k) { off.push(0); return; }
        const a = col[k - 1];
        const label = edges.reduce((n, e, i) => {
          const [x, y] = [boxes.get(e.from), boxes.get(e.to)];
          return n + ((x === a && y === b) || (x === b && y === a) ? (chips[i].lines.length ? room(i) : 0) : 0);
        }, 0);
        off.push(off[k - 1] + cross(a) / 2 + SLOT_GAP + Math.max(label, loopRoom(b)) + cross(b) / 2);
      });
      const pools: { sum: number; n: number }[] = [];
      col.forEach((b, k) => {
        pools.push({ sum: want(b) - off[k], n: 1 });
        while (pools.length > 1 && pools[pools.length - 2].sum / pools[pools.length - 2].n > pools[pools.length - 1].sum / pools[pools.length - 1].n) {
          const t = pools.pop()!;
          pools[pools.length - 1].sum += t.sum; pools[pools.length - 1].n += t.n;
        }
      });
      let k = 0;
      for (const pl of pools) for (let j = 0; j < pl.n; j++, k++) col[k].c = pl.sum / pl.n + off[k];
    }
    // all of it moved to start just after the edge, a loop's room before the first steps too
    const start = Math.min(...order.map((b) => b.c - cross(b) / 2 - loopRoom(b)));
    for (const b of order) b.c += LANE_PAD - start;
    return Math.max(...order.map((b) => b.c + cross(b) / 2)) + LANE_PAD;
  }
  // a line to a later step turns (and its label stands) in the gap just after the step it leaves. Labels that would
  // stand at the same height there go side by side, each line turning in a track of its own, the gap as wide as its
  // tracks. At 40 wide, one track, the labels of a busy chart stood on one another and over the boxes either side
  const gapW = Array.from({ length: Math.max(0, ranks - 1) }, () => GAP);
  const track = new Map<number, { k: number }>(), tracksW: number[][] = gapW.map(() => []);
  for (let r = 0; r < gapW.length; r++) {
    const here = edges.map((e, i) => ({ e, i, a: boxes.get(e.from)!, b: boxes.get(e.to)! })).filter((x) => x.b.rank > x.a.rank && x.a.rank === r && chips[x.i].lines.length)
      .map((x) => { const c = (x.a.c + x.b.c) / 2; return { ...x, c0: c - chips[x.i].c / 2 - LABEL_AIR, c1: c + chips[x.i].c / 2 + LABEL_AIR }; })
      .sort((p, q) => p.c0 - q.c0);
    const ends: number[] = [];
    for (const x of here) {
      let k = ends.findIndex((end) => end <= x.c0);
      if (k < 0) k = ends.push(-Infinity) - 1;
      ends[k] = x.c1;
      track.set(x.i, { k });
      tracksW[r][k] = Math.max(tracksW[r][k] ?? 0, chips[x.i].m + LABEL_AIR * 2);
    }
    gapW[r] = Math.max(GAP, tracksW[r].reduce((a, b) => a + b, 0));
  }
  const gapsTo = (r: number) => gapW.slice(0, r).reduce((a, b) => a + b, 0);
  const colAt = colM.map((_, r) => HEAD_M + PAD + colM.slice(0, r).reduce((a, b) => a + b, 0) + gapsTo(r));
  for (const b of boxes.values()) b.m = colAt[b.rank] + colM[b.rank] / 2;
  const M = HEAD_M + PAD * 2 + colM.reduce((a, b) => a + b, 0) + gapsTo(ranks - 1);
  // ---- each line's way: out of a step's far side into the next one's near side, turning in the gap between them.
  // Each kind of line has its ways, tried in turn against the steps they pass; the first through none is taken, or
  // the one through fewest (a line back up the chart, or one past a step, ran straight through the steps between) ----
  type Pt = [number, number];
  type Way = { pts: Pt[]; at: Pt };
  const near = (r: number) => colAt[r] - (r ? gapW[r - 1] : PAD) / 2; // the middle of the gap before a column
  const far = (r: number) => colAt[r] + colM[r] + (r < ranks - 1 ? gapW[r] : PAD) / 2; // and after it
  const bottom = (x: Box) => x.c + cross(x) / 2;
  const cuts = (w: Way, a: Box, b: Box) => [...boxes.values()].filter((x) => x !== a && x !== b && w.pts.slice(1).some((q, k) => {
    const p = w.pts[k];
    return Math.min(p[0], q[0]) < x.m + main(x) / 2 - 1 && Math.max(p[0], q[0]) > x.m - main(x) / 2 + 1
      && Math.min(p[1], q[1]) < x.c + cross(x) / 2 - 1 && Math.max(p[1], q[1]) > x.c - cross(x) / 2 + 1;
  })).length;
  const ways: Way[] = edges.map((e, i) => {
    const a = boxes.get(e.from)!, b = boxes.get(e.to)!;
    const tries: Way[] = [];
    if (a === b) {
      const s0 = a.m + main(a) / 4, top = a.c - cross(a) / 2, o = loopOff[i] + loopOut(i);
      return { pts: [[s0, top], [s0, top - o], [a.m - main(a) / 4, top - o], [a.m - main(a) / 4, top]], at: [a.m, top - o] };
    }
    if (b.rank > a.rank) {
      const s: Pt = [a.m + main(a) / 2, a.c], t: Pt = [b.m - main(b) / 2, b.c];
      const start = colAt[a.rank] + colM[a.rank], t0 = track.get(i);
      const mid = t0 ? start + tracksW[a.rank].slice(0, t0.k).reduce((p, q) => p + q, 0) + tracksW[a.rank][t0.k] / 2 : start + gapW[a.rank] / 2;
      tries.push(s[1] === t[1] ? { pts: [s, t], at: [mid, s[1]] } : { pts: [s, [mid, s[1]], [mid, t[1]], t], at: [mid, (s[1] + t[1]) / 2] });
      // past a step on its way: round the steps between by their edge, back in just before the end
      const between = [...boxes.values()].filter((x) => x.rank > a.rank && x.rank < b.rank);
      const hit = (c: number) => between.find((x) => Math.abs(x.c - c) < cross(x) / 2 + 6);
      let up = t[1], dn = t[1];
      for (let h = hit(up); h; h = hit(up)) up = h.c - cross(h) / 2 - 7;
      for (let h = hit(dn); h; h = hit(dn)) dn = h.c + cross(h) / 2 + 7;
      const half = (s[1] + t[1]) / 2;
      for (const run of Math.abs(up - half) <= Math.abs(dn - half) ? [up, dn] : [dn, up])
        tries.push({ pts: [s, [mid, s[1]], [mid, run], [near(b.rank), run], [near(b.rank), t[1]], t], at: [mid, run] });
    } else if (b.rank === a.rank) {
      const down = b.c > a.c ? 1 : -1;
      const [c0, c1] = [a.c + (down * cross(a)) / 2, b.c - (down * cross(b)) / 2];
      tries.push({ pts: [[a.m, c0], [b.m, c1]], at: [a.m, (c0 + c1) / 2] });
      // a step between them in the column: round it through the gap after them
      const g = far(a.rank);
      tries.push({ pts: [[a.m + main(a) / 2, a.c], [g, a.c], [g, b.c], [b.m + main(b) / 2, b.c]], at: [g, (a.c + b.c) / 2] });
    } else {
      // back to an earlier step: under (or beside) both, then up into it
      // (its label, standing on the run, clear of them too)
      const clear = 14 + (chips[i].lines.length ? chips[i].c / 2 + 4 : 0);
      const low = Math.max(bottom(a), bottom(b)) + clear;
      tries.push({ pts: [[a.m, bottom(a)], [a.m, low], [b.m, low], [b.m, bottom(b)]], at: [(a.m + b.m) / 2, low] });
      // steps under them or between: out through the gap after it, under every step on the way, into it from before
      const under = Math.max(...[...boxes.values()].filter((x) => x.rank >= b.rank && x.rank <= a.rank).map(bottom)) + clear;
      const [g0, g1] = [far(a.rank), near(b.rank)];
      tries.push({ pts: [[a.m + main(a) / 2, a.c], [g0, a.c], [g0, under], [g1, under], [g1, b.c], [b.m - main(b) / 2, b.c]], at: [(g0 + g1) / 2, under] });
    }
    let best = tries[0], fewest = Infinity;
    for (const w of tries) { const n = cuts(w, a, b); if (n < fewest) { fewest = n; best = w; } if (!n) break; }
    return best;
  });
  // room for every line, and for its label standing anywhere on it (half of one as wide as 150, down the page, fell
  // past the edge)
  let C = Math.max(1, laneC.reduce((a, b) => a + b, 0), ...chips.map((ch) => ch.c + 8));
  ways.forEach((w, i) => { for (const [, c] of w.pts) C = Math.max(C, c + (chips[i].lines.length ? chips[i].c / 2 + 4 : 4)); });
  const W = Math.ceil(LR ? M : C), H = Math.ceil(LR ? C : M);
  const xy = (m: number, c: number): [number, number] => (LR ? [m, c] : [c, m]);

  // ---- the lanes ----
  // named and marked as mermaid's flowchart is, its boxes `<id>-flowchart-<box>-0` and its lines `L_<from>_<to>_<n>`:
  // drawn in, and a step at a time in a presentation (boxes given an Order too), as a chart without lanes is
  let svg = `<svg class="lanes" id="${id}" aria-roledescription="flowchart-v2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width: ${W}px; min-width: ${Math.round(W * minScale)}px;" role="img" aria-label="${plain ? 'Flowchart' : 'Swimlanes'}">`;
  svg += `<defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="sl-head" d="M0,1.5 L9,5 L0,8.5 z"/></marker></defs>`;
  lanes.forEach((l, i) => {
    const [x, y] = xy(0, laneAt[i]);
    const last = i === lanes.length - 1;
    const [w, h] = LR ? [W, last ? C - laneAt[i] : laneC[i]] : [last ? C - laneAt[i] : laneC[i], H];
    const span = last ? C - laneAt[i] : laneC[i]; // the last lane runs to the drawing's edge
    const [hw, hh] = LR ? [HEAD_M, span] : [span, HEAD_M];
    const name = names[i];
    const [cx, cy] = [x + hw / 2, y + hh / 2];
    const tspans = name.map((t, k) => `<tspan dy="0.35em" x="${cx}" y="${cy + (k - (name.length - 1) / 2) * 17}">${esc(t)}</tspan>`).join('');
    svg += `<g class="lane c${i % 12}${l.id ? '' : ' none'}" data-lane="${esc(l.id)}">`
      + `<rect class="lane-bg" x="${x}" y="${y}" width="${w}" height="${h}"/>`
      + `<g class="lane-head" data-lane="${esc(l.id)}"><rect x="${x}" y="${y}" width="${hw}" height="${hh}"/>`
      + `<text class="lane-name" text-anchor="middle">${tspans}</text></g>`
      + (i ? `<line class="lane-rule" x1="${x}" y1="${y}" x2="${LR ? W : x}" y2="${LR ? y : H}"/>` : '')
      + `</g>`;
  });

  // ---- where a line's label stands: on its own line, clear of the boxes, the lane names and the labels already placed.
  // Each stood at its line's bend, and a busy chart put several on one spot, or on a box; now the bend is tried first,
  // then points further along the line, and with none clear, the one that covers least ----
  type R = { m0: number; m1: number; c0: number; c1: number };
  const taken: R[] = [...boxes.values()].map((b) => ({ m0: b.m - main(b) / 2 - 4, m1: b.m + main(b) / 2 + 4, c0: b.c - cross(b) / 2 - 4, c1: b.c + cross(b) / 2 + 4 }));
  taken.push({ m0: -Infinity, m1: HEAD_M + 4, c0: -Infinity, c1: Infinity }); // the lane names
  const fixed = taken.length; // the steps and the names; the labels placed come after
  const over = (a: R, b: R) => Math.max(0, Math.min(a.m1, b.m1) - Math.max(a.m0, b.m0)) * Math.max(0, Math.min(a.c1, b.c1) - Math.max(a.c0, b.c0));
  const ALONG = [0.5, 0.35, 0.65, 0.2, 0.8, 0.08, 0.92];
  function placeLabel(pts: [number, number][], at: [number, number], chip: { m: number; c: number }): [number, number] {
    const rect = ([m, c]: [number, number]): R => ({ m0: m - chip.m / 2 - 3, m1: m + chip.m / 2 + 3, c0: c - chip.c / 2 - 3, c1: c + chip.c / 2 + 3 });
    // the segment holding the bend first, then the rest of the line
    const segs = pts.slice(1).map((q, k) => [pts[k], q] as const);
    const home = segs.findIndex(([p, q]) => Math.min(p[0], q[0]) - 0.5 <= at[0] && at[0] <= Math.max(p[0], q[0]) + 0.5 && Math.min(p[1], q[1]) - 0.5 <= at[1] && at[1] <= Math.max(p[1], q[1]) + 0.5);
    const order = home < 0 ? segs : [segs[home], ...segs.filter((_, k) => k !== home)];
    const spots: [number, number][] = [at];
    for (const [p, q] of order) for (const f of ALONG) spots.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
    // each spot held inside the drawing: a long label at a line near its edge stood past it
    const hold = (v: number, half: number, max: number) => Math.min(Math.max(v, half + 3), max - half - 3);
    for (const sp of spots) { sp[0] = hold(sp[0], chip.m / 2, M); sp[1] = hold(sp[1], chip.c / 2, C); }
    let best = spots[0], least = Infinity;
    for (const s of spots) {
      const r = rect(s);
      const cover = taken.reduce((n, t) => n + over(r, t), 0);
      if (cover < least) { least = cover; best = s; }
      if (!cover) break;
    }
    // nowhere on the line clear (a loop or a line between two steps stacked close, a long label): the nearest clear
    // place beside it, a step at a time outward from where it would stand
    // (clear of everything, or else at least of the steps and the lane names: a label on another is read, one on a
    // step hides it)
    const from = best, solid = taken.length > fixed ? [taken.slice(0, fixed)] : [];
    for (const among of [taken, ...solid]) {
      for (let k = 1; least > 0 && k <= 40; k++) {
        for (const [dm, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const s: [number, number] = [hold(from[0] + dm * k * 6, chip.m / 2, M), hold(from[1] + dc * k * 6, chip.c / 2, C)];
          if (!among.reduce((n, t) => n + over(rect(s), t), 0)) { least = 0; best = s; break; }
        }
      }
    }
    taken.push(rect(best));
    return best;
  }

  // ---- the lines ----
  const labels: string[] = [];
  edges.forEach((e, i) => {
    const { pts, at } = ways[i];
    const p = pts.map(([m, c]) => xy(m, c));
    svg += `<path class="flowchart-link sl-edge ${e.line}${e.animate ? ' moving' : ''}" data-id="${esc(`L_${e.from}_${e.to}_${i}`)}" d="${rounded(p)}" marker-end="url(#${id}-arrow)"/>`;
    const chip = chips[i];
    if (chip.lines.length) {
      const [m, c] = placeLabel(pts, at, chip);
      const [x, y] = xy(m, c), [w, h] = LR ? [chip.m, chip.c] : [chip.c, chip.m];
      const tspans = chip.lines.map((l, k) => `<tspan dy="0.35em" x="${x}" y="${y + (k - (chip.lines.length - 1) / 2) * LABEL_LINE}">${esc(l)}</tspan>`).join('');
      labels.push(`<g class="edgeLabel"><g class="label" data-id="${esc(`L_${e.from}_${e.to}_${i}`)}"><rect class="sl-chip" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="11"/>`
        + `<text text-anchor="middle">${tspans}</text></g></g>`);
    }
  });
  svg += labels.join('');

  // ---- the steps ----
  for (const b of boxes.values()) {
    const [x, y] = xy(b.m, b.c);
    const l = x - b.w / 2, t = y - b.h / 2;
    let shape: string;
    switch (b.n.shape) {
      case 'diamond': shape = `<path class="sl-shape" d="M${x},${t} L${l + b.w},${y} L${x},${t + b.h} L${l},${y} Z"/>`; break;
      case 'circle': shape = `<circle class="sl-shape" cx="${x}" cy="${y}" r="${b.w / 2}"/>`; break;
      case 'pill': shape = `<rect class="sl-shape pill" x="${l}" y="${t}" width="${b.w}" height="${b.h}" rx="${Math.min(b.h / 2, 22)}"/>`; break; // a tall one: rounded ends, not a blob
      case 'box': shape = `<rect class="sl-shape" x="${l}" y="${t}" width="${b.w}" height="${b.h}" rx="3"/>`; break;
      case 'db': shape = `<path class="sl-shape" d="M${l},${t + 6} a${b.w / 2},6 0 0,0 ${b.w},0 a${b.w / 2},6 0 0,0 ${-b.w},0 v${b.h - 12} a${b.w / 2},6 0 0,0 ${b.w},0 v${-(b.h - 12)}"/>`; break;
      default: shape = `<rect class="sl-shape" x="${l}" y="${t}" width="${b.w}" height="${b.h}" rx="12"/>`;
    }
    const lines = b.lines.map((s, k) => `<tspan dy="0.35em" x="${x}" y="${y + (b.n.shape === 'db' ? 4 : 0) + (k - (b.lines.length - 1) / 2) * LINE}">${esc(s)}</tspan>`).join('');
    svg += `<g class="node sl-${b.n.shape}${b.n.step ? ` step${b.n.step}` : ''}" id="${id}-flowchart-${esc(b.n.id)}-0">${shape}<text class="sl-text" text-anchor="middle">${lines}</text></g>`;
  }
  return svg + '</svg>';
}
