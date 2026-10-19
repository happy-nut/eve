/**
 * Folding a sequence diagram's blocks (alt, opt, loop, par, critical, break, rect) while it is looked at: a folded
 * block keeps its box, its label and its condition, and its inside is drawn as one note saying what is hidden
 * ("⋯ 4 messages"). It is a way of looking, not an edit: the note's code is never changed; the code drawn is a copy
 * with the folded blocks' insides swapped for that note (foldSeq), and the drawing's labels are then matched back to
 * the blocks they belong to (markFolds), so a click on one folds it.
 */

export interface SeqBlock {
  /** what the block is known by while the note is open: its kind, its condition and which of the same it is, so an
   *  edit elsewhere in the code leaves the folds where they were */
  key: string;
  kind: string;
  /** the condition written after the keyword (`alt is ok` → "is ok"), or a rect's colour */
  text: string;
  /** its opening line and its `end`, as line numbers of the code */
  open: number;
  close: number;
  /** the block it is inside, as an index into the list, or -1 */
  parent: number;
  /** how many parts it has: an alt with one else has 2 */
  sections: number;
  messages: number;
  notes: number;
  /** the participants its inside uses, in the diagram's order */
  who: string[];
}

const BLOCK = /^(alt|opt|loop|par_over|par|critical|break|rect|box)(?:\s+(.*))?$/i;
const SECTION = /^(else|and|option)(?:\s+(.*))?$/i;
const END = /^end\s*;?$/i;
const DECL = /^(?:create\s+)?(participant|actor)\s+(.+)$/i;
const ARROW = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*(.+?)\s*:(.*)$/;
const NOTE = /^note\s+(?:over|left\s+of|right\s+of)\s+([^:]+?)\s*:/i;
const ACTIVATION = /^(activate|deactivate)\s+(.+?)\s*;?$/i;
const NUMBER = /^autonumber(?:\s+(off)|\s+(\d+)(?:\s+(\d+))?)?\s*;?$/i;

/** a declared participant's id: what comes before `as`, without mermaid's `@{ … }` settings */
const declId = (rest: string) => rest.replace(/@\{[\s\S]*\}/, '').replace(/\s+as\s+[\s\S]*$/i, '').trim();

/** one line read for what it does: who it involves, and whether it is a message */
type Line =
  | { t: 'decl'; id: string }
  | { t: 'msg'; from: string; to: string; act: '+' | '-' | '' }
  | { t: 'note'; who: string[] }
  | { t: 'act'; id: string; on: boolean }
  | { t: 'num'; off: boolean; start?: number; step?: number }
  | { t: 'open'; kind: string; text: string }
  | { t: 'section' }
  | { t: 'end' }
  | { t: 'other' };

function read(raw: string): Line {
  const line = raw.trim();
  if (!line || line.startsWith('%%')) return { t: 'other' };
  if (END.test(line)) return { t: 'end' };
  let m = BLOCK.exec(line);
  if (m) return { t: 'open', kind: m[1].toLowerCase(), text: (m[2] ?? '').trim() };
  if (SECTION.test(line)) return { t: 'section' };
  if ((m = NUMBER.exec(line))) return { t: 'num', off: !!m[1], start: m[2] ? +m[2] : undefined, step: m[3] ? +m[3] : undefined };
  if ((m = DECL.exec(line))) return { t: 'decl', id: declId(m[2]) };
  if ((m = NOTE.exec(line))) return { t: 'note', who: m[1].split(',').map((s) => s.trim()).filter(Boolean) };
  if ((m = ACTIVATION.exec(line))) return { t: 'act', id: m[2], on: m[1].toLowerCase() === 'activate' };
  if ((m = ARROW.exec(line))) return { t: 'msg', from: m[1].trim(), to: m[4].trim(), act: m[3] as '+' | '-' | '' };
  return { t: 'other' };
}

interface Parsed { lines: string[]; read: Line[]; head: number; blocks: SeqBlock[]; order: Map<string, number> }

/** the code read as a sequence diagram: null when it is not one, or its blocks do not close as they open */
function parse(code: string): Parsed | null {
  const lines = code.split('\n');
  let head = 0;
  // mermaid's settings ahead of the diagram (a `---` front matter, `%%` lines) are not the diagram
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (close < 0) return null;
    head = close + 1;
  }
  while (head < lines.length && (!lines[head].trim() || lines[head].trim().startsWith('%%'))) head++;
  if (!/^sequenceDiagram\b/.test(lines[head]?.trim() ?? '')) return null;
  const rd = lines.map((l, i) => (i > head ? read(l) : { t: 'other' as const }));
  const order = new Map<string, number>();
  const meet = (id: string) => { if (!order.has(id)) order.set(id, order.size); };
  const blocks: SeqBlock[] = [];
  const seen = new Map<string, number>();
  // what is open around each line: the blocks (an index into `blocks`), or -2 for a `box` of participants
  const stack: number[] = [];
  const inside = (f: (b: SeqBlock) => void) => { for (const i of stack) if (i >= 0) f(blocks[i]); };
  const use = (ids: string[]) => { for (const id of ids) meet(id); inside((b) => { for (const id of ids) if (!b.who.includes(id)) b.who.push(id); }); };
  for (let i = head + 1; i < lines.length; i++) {
    const l = rd[i];
    if (l.t === 'open') {
      if (l.kind === 'box') { stack.push(-2); continue; }
      const id = `${l.kind}:${l.text}`;
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      const parent = [...stack].reverse().find((s) => s >= 0) ?? -1;
      blocks.push({ key: `${id}#${n}`, kind: l.kind, text: l.text, open: i, close: -1, parent, sections: 1, messages: 0, notes: 0, who: [] });
      stack.push(blocks.length - 1);
    } else if (l.t === 'end') {
      const b = stack.pop();
      if (b === undefined) return null;
      if (b >= 0) blocks[b].close = i;
    } else if (l.t === 'section') {
      const b = stack[stack.length - 1];
      if (b !== undefined && b >= 0) blocks[b].sections++;
    } else if (l.t === 'decl') meet(l.id);
    else if (l.t === 'msg') { use([l.from, l.to]); inside((b) => b.messages++); }
    else if (l.t === 'note') { use(l.who); inside((b) => b.notes++); }
    else if (l.t === 'act') use([l.id]);
  }
  if (stack.length) return null;
  for (const b of blocks) b.who.sort((x, y) => order.get(x)! - order.get(y)!);
  return { lines, read: rd, head, blocks, order };
}

/** the blocks of a sequence diagram, in the order they open; none when the code is not one */
export function seqBlocks(code: string): SeqBlock[] {
  return parse(code)?.blocks ?? [];
}

/** a block with nothing in it to hide has nothing to fold */
export const foldable = (b: SeqBlock) => b.who.length > 0;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** what the note across a folded block says */
export function hiddenSays(b: SeqBlock): string {
  const what = b.messages ? plural(b.messages, 'message') : plural(b.notes, 'note');
  return `⋯ ${what}${b.sections > 1 ? ` in ${b.sections} parts` : ''}`;
}

/**
 * The code to draw with the blocks in `folded` (their keys) folded: a folded block's inside is one note across the
 * participants it used. What the hidden lines did to the rest of the drawing is kept: a participant first met inside
 * still takes its place among the others, one left active (or let go) there still is, and the messages after it keep
 * their numbers. `shown` is the blocks the drawing has (none of those inside a folded one).
 */
export function foldSeq(code: string, folded: ReadonlySet<string>): { code: string; shown: SeqBlock[] } {
  const p = parse(code);
  if (!p) return { code, shown: [] };
  const fold = new Set(p.blocks.filter((b) => folded.has(b.key) && foldable(b)));
  const hiddenBy = (i: number) => p.blocks.findIndex((b, j) => j !== i && b.open < p.blocks[i].open && b.close > p.blocks[i].close && fold.has(b));
  const shown = p.blocks.filter((_, i) => hiddenBy(i) < 0);
  const outer = shown.filter((b) => fold.has(b));
  if (!outer.length) return { code, shown };
  const out = p.lines.slice(0, p.head + 1);
  const met = new Set<string>();
  const active = new Map<string, number>();
  let num = { on: false, at: 1, step: 1 };
  const step = (l: Line) => {
    if (l.t === 'num') num = l.off ? { ...num, on: false } : { on: true, at: l.start ?? (num.on ? num.at : 1), step: l.step ?? 1 };
    if (l.t === 'msg') {
      if (num.on) num.at += num.step;
      const who = l.act === '+' ? l.to : l.from;
      if (l.act) active.set(who, (active.get(who) ?? 0) + (l.act === '+' ? 1 : -1));
    }
    if (l.t === 'act') active.set(l.id, (active.get(l.id) ?? 0) + (l.on ? 1 : -1));
  };
  for (let i = p.head + 1; i < p.lines.length; i++) {
    const b = outer.find((x) => x.open === i);
    if (!b) {
      const l = p.read[i];
      if (l.t === 'decl') met.add(l.id);
      if (l.t === 'msg') { met.add(l.from); met.add(l.to); }
      if (l.t === 'note') l.who.forEach((id) => met.add(id));
      if (l.t === 'act') met.add(l.id);
      step(l);
      out.push(p.lines[i]);
      continue;
    }
    out.push(p.lines[i]);
    const pad = (/^\s*/.exec(p.lines[i])?.[0] ?? '') + '  ';
    const numWas = { ...num };
    const activeWas = new Map(active);
    for (let j = b.open + 1; j < b.close; j++) {
      const l = p.read[j];
      // a participant declared, or first met, inside: still in its place among the others
      if (l.t === 'decl' && !met.has(l.id)) { met.add(l.id); out.push(p.lines[j].replace(/^\s*(?:create\s+)?/i, pad)); }
      const ids = l.t === 'msg' ? [l.from, l.to] : l.t === 'note' ? l.who : l.t === 'act' ? [l.id] : [];
      for (const id of ids) if (!met.has(id)) { met.add(id); out.push(`${pad}participant ${id}`); }
      step(l);
    }
    const ends = b.who.length > 1 ? `${b.who[0]},${b.who[b.who.length - 1]}` : b.who[0];
    out.push(`${pad}Note over ${ends}: ${hiddenSays(b)}`);
    // left active, or let go, by the hidden lines: so it still is
    for (const [id, n] of active) {
      const d = n - (activeWas.get(id) ?? 0);
      for (let k = 0; k < Math.abs(d); k++) out.push(`${pad}${d > 0 ? 'activate' : 'deactivate'} ${id}`);
    }
    out.push(p.lines[b.close]);
    if (num.on !== numWas.on || num.at !== numWas.at || num.step !== numWas.step) out.push(num.on ? `${pad.slice(2)}autonumber ${num.at} ${num.step}` : `${pad.slice(2)}autonumber off`);
    i = b.close;
  }
  return { code: out.join('\n'), shown };
}

/** a condition as mermaid prints it, and as written, made comparable: no brackets, spaces or invisible space, and no
 *  hyphens (a long word is broken over two lines with one: "[remembe-r me]") */
const plain = (s: string) => s.replace(/[[\]\s\u200b-]/g, '').toLowerCase();

/**
 * The drawing's block labels marked with the block each one is (`data-fold` = its key), so a click on one folds it,
 * and a ▾ (▸ folded) put beside each. Mermaid draws the labelled blocks one group each (`data-et="control-structure"`),
 * in the order their `end`s come, inner before outer; and a rect, which has no label, as a plain `rect.rect` put
 * first in the drawing as each one ends, so they come in the opposite order. Each pairing is checked against what is
 * printed (the keyword, the condition, a rect's colour): false, with nothing marked, when the drawing is not what the
 * code says, and the blocks are folded from a row of their own instead.
 */
export function markFolds(svg: Element, shown: SeqBlock[], folded: ReadonlySet<string>): boolean {
  const byEnd = (list: SeqBlock[]) => [...list].sort((a, b) => a.close - b.close);
  const labelled = byEnd(shown.filter((b) => b.kind !== 'rect'));
  const rects = byEnd(shown.filter((b) => b.kind === 'rect')).reverse();
  const groups = [...svg.querySelectorAll('g[data-et="control-structure"]')];
  // (a `box` of participants is a rect.rect too, but in a group of its own with its title)
  const boxes = [...svg.children].filter((e) => e.matches('rect.rect'));
  if (groups.length !== labelled.length || boxes.length !== rects.length) return false;
  const ok = labelled.every((b, i) => {
    const g = groups[i];
    const word = g.querySelector('.labelText')?.textContent?.trim().toLowerCase();
    if (word !== b.kind && !(b.kind === 'par_over' && word === 'par')) return false;
    // a condition with entities or markup is printed as something else: its keyword and place say enough
    if (/[#<&]/.test(b.text)) return true;
    // (a long one is printed over lines of its own)
    return plain([...g.querySelectorAll('.loopText')].map((t) => t.textContent).join('')) === plain(b.text);
  }) && rects.every((b, i) => {
    const fill = boxes[i].getAttribute('fill');
    return !fill || /[#<&]/.test(b.text) || plain(fill) === plain(b.text);
  });
  if (!ok) return false;
  // marked once already (drawn again as it was): marked afresh
  svg.querySelectorAll('.eve-fold-mark').forEach((m) => m.remove());
  const ns = 'http://www.w3.org/2000/svg';
  // a label box's corners (a polygon's "x,y x,y …")
  const corners = (box: Element | null) => (box?.getAttribute('points') ?? '').split(/[\s,]+/).map(Number);
  const xs = (box: Element | null) => corners(box).filter((v, k) => k % 2 === 0 && Number.isFinite(v));
  const ys = (box: Element | null) => corners(box).filter((v, k) => k % 2 === 1 && Number.isFinite(v));
  const mark = (key: string, x: number, y: number) => {
    const t = svg.ownerDocument.createElementNS(ns, 'text');
    t.setAttribute('class', 'eve-fold-mark');
    t.setAttribute('data-fold', key);
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('dominant-baseline', 'middle');
    t.textContent = folded.has(key) ? '▸' : '▾';
    return t;
  };
  labelled.forEach((b, i) => {
    if (!foldable(b)) return;
    const g = groups[i], box = g.querySelector('.labelBox'), label = g.querySelector('.labelText');
    if (!box || !label) return;
    g.classList.add('eve-fold');
    g.classList.toggle('folded', folded.has(b.key));
    box.setAttribute('data-fold', b.key);
    label.setAttribute('data-fold', b.key);
    g.append(mark(b.key, Math.max(...xs(box)) + 5, +(label.getAttribute('y') ?? 0)));
  });
  // the note a folded block's inside became: drawn quieter than a note of the diagram's own, and a click on it unfolds
  // it too. It is the first note saying so under the block's top (one of the diagram's own saying the same above it
  // is not it)
  const tops = new Map<string, number>();
  labelled.forEach((b, i) => tops.set(b.key, Math.min(...ys(groups[i].querySelector('.labelBox')))));
  rects.forEach((b, i) => tops.set(b.key, +(boxes[i].getAttribute('y') ?? 0)));
  const says = [...svg.querySelectorAll('g[data-et="note"]')];
  for (const b of shown) {
    const top = tops.get(b.key);
    if (!folded.has(b.key) || !foldable(b) || top === undefined) continue;
    const note = says.find((g) => +(g.querySelector('rect')?.getAttribute('y') ?? -Infinity) >= top && g.querySelector('.noteText')?.textContent?.trim() === hiddenSays(b));
    note?.classList.add('eve-folded-note');
    note?.setAttribute('data-fold', b.key);
  }
  rects.forEach((b, i) => {
    if (!foldable(b)) return;
    const r = boxes[i], x = +(r.getAttribute('x') ?? 0), y = +(r.getAttribute('y') ?? 0);
    // no label to click: a ▾ of its own at its corner, to fold it by (on top of all: the rect is drawn under the rest)
    const m = mark(b.key, x + 5, y + 10);
    m.classList.add('alone');
    if (folded.has(b.key)) m.classList.add('folded');
    svg.append(m);
  });
  return true;
}
