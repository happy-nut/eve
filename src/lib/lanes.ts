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
function textW(s: string, size: number, weight = 400): number {
  if (ctx === undefined) {
    try { ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { ctx = null; }
  }
  if (ctx) { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(s).width; }
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(ch) ? size : size * 0.56;
  return w;
}
/** a label in lines no wider than `max` (at spaces; a word longer than a line keeps its line) */
function wrap(s: string, max: number, size: number, weight = 400): string[] {
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
const GAP = 40; // between steps, along the flow
const PAD = 20; // before the first step and after the last
const SLOT_GAP = 26; // between two steps side by side in a lane
const LANE_PAD = 14;
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

/** `minScale`: how far it may shrink to the note's width (a lane chart, long by nature, a fifth further than others) */
export function laneSvg(d: Flowchart, minScale = 0.8): string {
  const LR = d.dir === 'LR';
  const id = `sl${++uid}`;
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
  const slotC = lanes.map((_, i) => Math.max(LR ? 44 : 96, ...[...boxes.values()].filter((b) => b.lane === i).map(cross)) + SLOT_GAP);
  const HEAD = LR ? Math.max(84, Math.min(140, Math.ceil(Math.max(...lanes.map((l) => textW(l.label, 13, 600)))) + 28)) : 40;
  const laneC = lanes.map((_, i) => laneSlots[i] * slotC[i] + LANE_PAD * 2 - SLOT_GAP);
  const laneAt = lanes.map((_, i) => laneC.slice(0, i).reduce((a, b) => a + b, 0));
  const colAt = colM.map((_, r) => HEAD + PAD + colM.slice(0, r).reduce((a, b) => a + b, 0) + GAP * r);
  for (const b of boxes.values()) {
    b.m = colAt[b.rank] + colM[b.rank] / 2;
    b.c = laneAt[b.lane] + LANE_PAD + b.slot * slotC[b.lane] + (slotC[b.lane] - SLOT_GAP) / 2;
  }
  const M = HEAD + PAD * 2 + colM.reduce((a, b) => a + b, 0) + GAP * (ranks - 1);
  const C = Math.max(1, laneC.reduce((a, b) => a + b, 0));
  const W = Math.ceil(LR ? M : C), H = Math.ceil(LR ? C : M);
  const xy = (m: number, c: number): [number, number] => (LR ? [m, c] : [c, m]);

  // ---- the lanes ----
  let svg = `<svg class="lanes" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width: ${W}px; min-width: ${Math.round(W * minScale * 0.8)}px;" role="img" aria-label="Swimlanes">`;
  svg += `<defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="sl-head" d="M0,1.5 L9,5 L0,8.5 z"/></marker></defs>`;
  lanes.forEach((l, i) => {
    const [x, y] = xy(0, laneAt[i]);
    const [w, h] = LR ? [W, laneC[i]] : [laneC[i], H];
    const [hw, hh] = LR ? [HEAD, laneC[i]] : [laneC[i], HEAD];
    const name = wrap(l.label, LR ? HEAD - 20 : laneC[i] - 20, 13, 600);
    const [cx, cy] = [x + hw / 2, y + hh / 2];
    const tspans = name.map((t, k) => `<tspan x="${cx}" y="${cy + (k - (name.length - 1) / 2) * 17}">${esc(t)}</tspan>`).join('');
    svg += `<g class="lane c${i % 12}${l.id ? '' : ' none'}" data-lane="${esc(l.id)}">`
      + `<rect class="lane-bg" x="${x}" y="${y}" width="${w}" height="${h}"/>`
      + `<g class="lane-head" data-lane="${esc(l.id)}"><rect x="${x}" y="${y}" width="${hw}" height="${hh}"/>`
      + `<text class="lane-name" text-anchor="middle" dominant-baseline="central">${tspans}</text></g>`
      + (i ? `<line class="lane-rule" x1="${x}" y1="${y}" x2="${LR ? W : x}" y2="${LR ? y : H}"/>` : '')
      + `</g>`;
  });

  // ---- the lines: out of a step's far side into the next one's near side, turning in the gap between them ----
  const labels: string[] = [];
  edges.forEach((e, i) => {
    const a = boxes.get(e.from)!, b = boxes.get(e.to)!;
    let pts: [number, number][];
    let at: [number, number];
    if (a === b) {
      const s0 = a.m + main(a) / 4, top = a.c - cross(a) / 2;
      pts = [[s0, top], [s0, top - 16], [a.m - main(a) / 4, top - 16], [a.m - main(a) / 4, top]];
      at = [a.m, top - 16];
    } else if (b.rank > a.rank) {
      const s: [number, number] = [a.m + main(a) / 2, a.c], t: [number, number] = [b.m - main(b) / 2, b.c];
      const mid = colAt[a.rank] + colM[a.rank] + GAP / 2;
      pts = s[1] === t[1] ? [s, t] : [s, [mid, s[1]], [mid, t[1]], t];
      at = s[1] === t[1] ? [(s[0] + t[0]) / 2, s[1]] : [mid, (s[1] + t[1]) / 2];
    } else if (b.rank === a.rank) {
      const down = b.c > a.c ? 1 : -1;
      pts = [[a.m, a.c + (down * cross(a)) / 2], [b.m, b.c - (down * cross(b)) / 2]];
      at = [a.m, (a.c + b.c) / 2];
    } else {
      // back to an earlier step: under (or beside) both, then up into it
      const low = Math.max(a.c + cross(a) / 2, b.c + cross(b) / 2) + 14;
      pts = [[a.m, a.c + cross(a) / 2], [a.m, low], [b.m, low], [b.m, b.c + cross(b) / 2]];
      at = [(a.m + b.m) / 2, low];
    }
    const p = pts.map(([m, c]) => xy(m, c));
    svg += `<path class="flowchart-link sl-edge ${e.line}" data-id="${id}-e${i}" d="${rounded(p)}" marker-end="url(#${id}-arrow)"/>`;
    const text = e.label.trim();
    if (text) {
      const [x, y] = xy(at[0], at[1]);
      const tw = Math.ceil(textW(text, 12)) + 14;
      labels.push(`<g class="edgeLabel"><g class="label" data-id="${id}-e${i}"><rect class="sl-chip" x="${x - tw / 2}" y="${y - 11}" width="${tw}" height="22" rx="11"/>`
        + `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text></g></g>`);
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
      case 'pill': shape = `<rect class="sl-shape pill" x="${l}" y="${t}" width="${b.w}" height="${b.h}" rx="${b.h / 2}"/>`; break;
      case 'box': shape = `<rect class="sl-shape" x="${l}" y="${t}" width="${b.w}" height="${b.h}" rx="3"/>`; break;
      case 'db': shape = `<path class="sl-shape" d="M${l},${t + 6} a${b.w / 2},6 0 0,0 ${b.w},0 a${b.w / 2},6 0 0,0 ${-b.w},0 v${b.h - 12} a${b.w / 2},6 0 0,0 ${b.w},0 v${-(b.h - 12)}"/>`; break;
      default: shape = `<rect class="sl-shape" x="${l}" y="${t}" width="${b.w}" height="${b.h}" rx="12"/>`;
    }
    const lines = b.lines.map((s, k) => `<tspan x="${x}" y="${y + (b.n.shape === 'db' ? 4 : 0) + (k - (b.lines.length - 1) / 2) * LINE}">${esc(s)}</tspan>`).join('');
    svg += `<g class="node sl-${b.n.shape}" id="${id}-flowchart-${esc(b.n.id)}-0">${shape}<text class="sl-text" text-anchor="middle" dominant-baseline="central">${lines}</text></g>`;
  }
  return svg + '</svg>';
}
