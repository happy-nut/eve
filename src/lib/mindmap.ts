import type { Mindmap, MindShape } from './diagram';
import { textW, wrap } from './lanes';

/**
 * A mind map, drawn by Eve: the idea in the middle as a solid pill, its branches out to both sides on soft curves,
 * each first branch a tinted chip in a colour of its own that every idea under it shares, the ideas further out plain
 * words on a line of that colour. Mermaid's own drawing set every idea in a box of its own on straight spokes around
 * the middle, crowded and lopsided. Every idea is a g.mm-node with data-spot ("root", "branch:<i>", i its place in
 * d.items) for the editor to find it by (ChartEditor.svelte); colours are CSS variables (app.css), so the light and
 * dark themes need no drawing again.
 */

type Node = { text: string; shape: MindShape; depth: number; spot: string; hue: number; kids: Node[]; lines: string[]; w: number; h: number; x: number; y: number; right: boolean };

// size, weight, line height, padding across and down, widest line, per depth (the middle, a first branch, further out)
const LOOK = [
  { size: 16, weight: 650, line: 21, px: 22, py: 13, max: 220 },
  { size: 14, weight: 600, line: 19, px: 15, py: 9, max: 190 },
  { size: 13.5, weight: 450, line: 18, px: 4, py: 6, max: 210 },
];
const look = (n: { depth: number; shape: MindShape }) => {
  const l = LOOK[Math.min(n.depth, 2)];
  // an idea further out given a shape is drawn in it, so it is padded as a chip
  return n.depth >= 2 && n.shape !== 'plain' ? { ...l, px: 12, py: 7 } : l;
};
const GAP_X = [64, 44, 34]; // from an idea to the ones under it
const GAP_Y = [22, 14, 6]; // between ideas under one (the first branches, under them, further out)
const PAD = 18;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const span = (n: Node): number => n.kids.length ? Math.max(n.h, n.kids.reduce((a, k) => a + span(k), 0) + GAP_Y[Math.min(n.depth, 2)] * (n.kids.length - 1)) : n.h;

function sized(n: Node) {
  const l = look(n);
  n.lines = wrap(n.text || ' ', l.max, l.size, l.weight);
  const tw = Math.max(...n.lines.map((s) => textW(s, l.size, l.weight)));
  n.w = Math.ceil(tw + l.px * 2);
  n.h = n.lines.length * l.line + l.py * 2;
  if (n.shape === 'circle' && n.depth > 0) n.w = n.h = Math.max(n.w, n.h); // a circle as wide as it is tall
  if (n.shape === 'hexagon') n.w += n.h * 0.4; // its points outside the words
  n.kids.forEach(sized);
}

/** an idea and those under it laid out from `x` (its inner edge), its block of ideas starting `top` down */
function place(n: Node, x: number, top: number, right: boolean) {
  const s = span(n);
  n.right = right;
  n.y = top + s / 2;
  n.x = right ? x : x - n.w;
  const kidsH = n.kids.reduce((a, k) => a + span(k), 0) + GAP_Y[Math.min(n.depth, 2)] * Math.max(0, n.kids.length - 1);
  let y = top + (s - kidsH) / 2;
  const gx = GAP_X[Math.min(n.depth, 2)], nx = right ? n.x + n.w + gx : n.x - gx;
  for (const k of n.kids) { place(k, nx, y, right); y += span(k) + GAP_Y[Math.min(n.depth, 2)]; }
}

/** an idea's words drawn under a line (further out, plain): its line is where the lines in and out of it meet */
const underlined = (n: Node) => n.depth >= 2 && n.shape === 'plain';
/** where a line leaves an idea, outwards */
function outPt(n: Node) {
  if (underlined(n)) return { x: n.right ? n.x + n.w : n.x, y: n.y + n.h / 2 };
  if (n.depth === 0) return { x: n.x + n.w / 2, y: n.y }; // from the middle of the centre: the curves fan out of it
  return { x: n.right ? n.x + n.w : n.x, y: n.y };
}
function inPt(n: Node) {
  if (underlined(n)) return { x: n.right ? n.x : n.x + n.w, y: n.y + n.h / 2 };
  return { x: n.right ? n.x : n.x + n.w, y: n.y };
}

function shapeOf(n: Node) {
  const x = n.x, y = n.y - n.h / 2, { w, h } = n;
  if (underlined(n)) return `<rect class="mm-hit" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><path class="mm-under" d="M${x} ${y + h}H${x + w}"/>`;
  switch (n.depth === 0 && n.shape === 'circle' ? 'pill' : n.shape) {
    case 'square': return `<rect class="mm-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
    case 'circle': return `<circle class="mm-shape" cx="${x + w / 2}" cy="${n.y}" r="${w / 2}"/>`;
    case 'hexagon': {
      const k = h * 0.3;
      return `<polygon class="mm-shape" points="${x + k},${y} ${x + w - k},${y} ${x + w},${n.y} ${x + w - k},${y + h} ${x + k},${y + h} ${x},${n.y}"/>`;
    }
    case 'cloud': return `<rect class="mm-shape cloud" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
    case 'bang': return `<rect class="mm-shape bang" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
    case 'pill': return `<rect class="mm-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
    default: return `<rect class="mm-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.depth === 0 ? h / 2 : 11}"/>`;
  }
}

export function mindSvg(d: Mindmap, minScale = 0.8): string {
  // the tree as the code writes it: a branch at most one step deeper than the one above it
  const root: Node = { text: d.root.trim() || 'Idea', shape: d.rootShape ?? 'circle', depth: 0, spot: 'root', hue: 0, kids: [], lines: [], w: 0, h: 0, x: 0, y: 0, right: true };
  const stack: Node[] = [root];
  let first = -1;
  d.items.forEach((b, i) => {
    if (!b.text.trim()) return;
    const depth = Math.max(1, Math.min(b.depth, stack.length));
    stack.length = depth;
    if (depth === 1) first++;
    const n: Node = { text: b.text.trim(), shape: b.shape ?? 'plain', depth, spot: `branch:${i}`, hue: (first + 1) % 12, kids: [], lines: [], w: 0, h: 0, x: 0, y: 0, right: true };
    stack[depth - 1].kids.push(n);
    stack.push(n);
  });
  sized(root);
  // to both sides once there are three or more, the first ones on the right, the rest on the left going round
  // clockwise (from the bottom up), split where the two sides are nearest the same height
  const kids = root.kids;
  let cut = kids.length;
  if (kids.length >= 3) {
    const total = kids.reduce((a, k) => a + span(k), 0);
    let acc = 0;
    cut = 0;
    while (cut < kids.length - 1 && acc + span(kids[cut]) / 2 < total / 2) acc += span(kids[cut++]);
    cut = Math.max(1, cut);
  }
  const right = kids.slice(0, cut), left = kids.slice(cut).reverse();
  root.x = -root.w / 2; root.y = 0;
  const side = (list: Node[], isRight: boolean) => {
    const g = GAP_Y[0], H = list.reduce((a, k) => a + span(k), 0) + g * Math.max(0, list.length - 1);
    let y = -H / 2;
    for (const k of list) { place(k, isRight ? root.x + root.w + GAP_X[0] : root.x - GAP_X[0], y, isRight); y += span(k) + g; }
  };
  side(right, true);
  side(left, false);

  const all: Node[] = [];
  const walk = (n: Node) => { all.push(n); n.kids.forEach(walk); };
  walk(root);
  const minX = Math.min(...all.map((n) => n.x)) - PAD, maxX = Math.max(...all.map((n) => n.x + n.w)) + PAD;
  const minY = Math.min(...all.map((n) => n.y - n.h / 2)) - PAD, maxY = Math.max(...all.map((n) => n.y + n.h / 2)) + PAD;
  const W = Math.ceil(maxX - minX), H = Math.ceil(maxY - minY);

  const links: string[] = [];
  for (const p of all) for (const k of p.kids) {
    const a = outPt(p), b = inPt(k);
    // a soft S from one to the other, flat where it leaves and where it arrives
    const mx = (a.x + b.x) / 2;
    const from = p.depth === 0 ? { x: k.right ? root.x + root.w - root.h / 2 : root.x + root.h / 2, y: 0 } : a;
    const c1 = p.depth === 0 ? { x: k.right ? root.x + root.w + 8 : root.x - 8, y: b.y } : { x: mx, y: a.y };
    links.push(`<path class="mm-link c${k.hue}${p.depth === 0 ? ' trunk' : ''}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${mx.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"/>`);
  }
  const nodes = all.map((n) => {
    const l = look(n), cls = n.depth === 0 ? 'mm-root' : n.depth === 1 ? 'mm-l1' : underlined(n) ? 'mm-leaf' : 'mm-leaf shaped';
    // the words in the middle of the shape, however tall it is (a circle is as tall as it is wide)
    const top = n.y - (n.lines.length * l.line) / 2 + l.line / 2;
    const cx = n.x + n.w / 2;
    const text = n.lines.map((s, i) => `<text x="${cx.toFixed(1)}" y="${(top + i * l.line).toFixed(1)}">${esc(s)}</text>`).join('');
    return `<g class="mm-node ${cls} c${n.hue}" data-spot="${n.spot}">${shapeOf(n)}${text}</g>`;
  });
  return `<svg class="mindmap" xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${W} ${H}" width="100%" style="max-width: ${W}px; min-width: ${Math.round(W * minScale)}px;" role="img" aria-label="Mind map">`
    + `<g class="mm-links">${links.join('')}</g>${nodes.join('')}</svg>`;
}
