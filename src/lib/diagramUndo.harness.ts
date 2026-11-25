// The guard for a drawing's ↶ and ↷, as keyMatrix is for the note's keys: the bugs here were one change taken back
// together with another (a step added with + and its name typed at once), or something left on the drawing after ↶ for
// a part it took away (a + beside a box, a step still picked that the first Esc let go of). Seeded random runs of edits
// are made to a drawing in a note, ↶ and ↷ pressed among them, and after each step the rules in `wrong` are checked.
// A new edit goes in `FLOW` or `PIE`, a new rule in `wrong` (any drawing), `wrongInFlow` or `wrongInChart`.
import { test, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { Editor } from '@tiptap/core';
import { editorWith } from './testEditor';
import { allowFocusLoss } from './focusWatch';
import { mermaidBoxOf } from './lanes';
import { fromCode, type Flowchart } from './diagram';
import { ui } from './ui.svelte';

/** the code the drawing was last drawn from, set by the test file's stand-in for `renderMermaid` */
export type Drawn = { code: string };

// jsdom lays nothing out: each box stands at a place of its own, by its number (n3 at x 300), and each lane's head
// by its own, so the pointer can be put on one and a ring told for which
type Place = { x: number; y: number; w: number; h: number };
const numberOf = (id: string | null | undefined) => Number(/(\d+)$/.exec(id ?? '')?.[1] ?? NaN);
function placeOf(el: Element): Place | null {
  const k = el.matches('g.node') ? numberOf(mermaidBoxOf(el)) : el.matches('g.lane-head') ? numberOf((el as SVGGElement).dataset.lane) : NaN;
  if (Number.isNaN(k)) return null;
  return el.matches('g.node') ? { x: 100 * k, y: 200, w: 80, h: 40 } : { x: 100 * k, y: 20, w: 80, h: 30 };
}
const domRect = ({ x, y, w, h }: Place) => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect;
const laidOut = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element) { const p = placeOf(this); return p ? domRect(p) : laidOut.call(this); };
document.elementsFromPoint = (x: number, y: number) => [...document.querySelectorAll('g.node')].filter((g) => {
  const p = placeOf(g)!;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
});
(SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM ??= () => null;
(globalThis as { SVGPathElement?: unknown }).SVGPathElement ??= class {};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const settle = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); flushSync(); };

/** a press as a browser makes it: down (the keyboard let go of unless the press keeps it), a moment, up, a click */
async function press(el: Element, init: MouseEventInit = {}) {
  const p = placeOf(el.closest('g.node, g.lane-head') ?? el);
  const at = { bubbles: true, cancelable: true, button: 0, clientX: p ? p.x + p.w / 2 : 1, clientY: p ? p.y + p.h / 2 : 1, ...init };
  const down = new PointerEvent('pointerdown', { ...at, pointerType: 'mouse' });
  el.dispatchEvent(down);
  if (!down.defaultPrevented) {
    const md = new MouseEvent('mousedown', at);
    el.dispatchEvent(md);
    if (!md.defaultPrevented) {
      const field = el.closest<HTMLElement>('input, textarea');
      if (field) field.focus();
      else (document.activeElement as HTMLElement | null)?.blur();
    }
  }
  await settle(0);
  el.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('click', at));
  flushSync();
}
function key(k: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(e);
  flushSync();
  return e;
}
/** letters typed one at a time, each over what is chosen in the field, as a keyboard types them */
async function typeIn(field: HTMLInputElement | HTMLTextAreaElement, word: string, r: () => number) {
  field.focus();
  for (const ch of word) {
    if (key(ch).defaultPrevented) continue;
    const v = field.value, s = field.selectionStart, e = field.selectionEnd;
    if (s === null || e === null) field.value = v + ch;
    else { field.value = v.slice(0, s) + ch + v.slice(e); field.setSelectionRange(s + 1, s + 1); }
    field.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
    await settle(Math.floor(r() * 40));
  }
}

interface Walk {
  ed: Editor; dom: HTMLElement; r: () => number; drawn: Drawn;
  /** the charts made, one per change, and which of them is in the note now */
  charts: string[]; at: number;
  /** the box the pointer is on */
  pointer: string | null;
  /** the field the last change was typed in, while nothing else has been done */
  typedIn: Element | null;
}
type Kind = 'edit' | 'type' | 'undo' | 'redo' | 'esc' | 'pointer';
interface Act { kind: Kind; can: (w: Walk) => boolean; run: (w: Walk) => unknown }

const pick = <T,>(w: Walk, xs: T[]) => xs[Math.floor(w.r() * xs.length)];
const q = <T extends Element = HTMLElement>(w: Walk, sel: string) => w.dom.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(w: Walk, sel: string) => [...w.dom.querySelectorAll<T>(sel)];
const open = (w: Walk) => !!q(w, '.dblock.active');
const boxes = (w: Walk) => qa(w, '.mermaid-view g.node');
const boxIds = (w: Walk) => boxes(w).map((g) => mermaidBoxOf(g)!);
const boxEl = (w: Walk, id: string) => boxes(w).find((g) => mermaidBoxOf(g) === id)!;
const bar = (w: Walk, label: string) => q<HTMLButtonElement>(w, `.layer .bar button[aria-label="${label}"]`);
const nameField = (w: Walk) => q<HTMLInputElement>(w, '.layer input.rename, .layer input.lane-name');
const armedField = (w: Walk) => q<HTMLInputElement>(w, '.layer input.armed');
const laneHeads = (w: Walk) => qa(w, '.mermaid-view g.lane-head');
const moveLane = (w: Walk) => qa<HTMLButtonElement>(w, '.layer .bar button:is([aria-label="Move left"], [aria-label="Move right"], [aria-label="Move up"], [aria-label="Move down"]):not(:disabled)');

/** what is shown picked: the boxes and lanes ringed, the line drawn picked */
function picked(w: Walk) {
  const rings = qa(w, '.layer .ring:not(.target)').map((r) => ({ x: parseFloat(r.style.left), y: parseFloat(r.style.top) }));
  return {
    steps: rings.filter((r) => r.y > 100).map((r) => `n${Math.round((r.x + 4) / 100)}`).sort(),
    lanes: rings.filter((r) => r.y < 100).map((r) => `L${Math.round((r.x + 2) / 100)}`).sort(),
    line: q(w, '.mermaid-view path.flowchart-link.picked')?.getAttribute('data-id')?.replace(/^L_|_\d+$/g, '') ?? null,
  };
}
/** everything a person sees of the drawing and its tools */
function seen(w: Walk) {
  const layer = qa(w, '.layer > *').map((el) => `${el.className}|${el.getAttribute('aria-label') ?? ''}|${(el as HTMLInputElement).value ?? ''}|${el.style.left},${el.style.top}`);
  const a = document.activeElement;
  return JSON.stringify({ open: open(w), drawing: w.drawn.code, layer, focus: a ? `${a.tagName}.${a.className}` : '', menu: !!ui.menu });
}
const noteChart = (w: Walk) => {
  let code = '';
  w.ed.state.doc.descendants((n) => { if (n.type.name === 'codeBlock' && n.attrs.language === 'mermaid') code = n.textContent; return !code; });
  return code;
};

const WORDS = ['Ship', 'Pack it', '결제', 'Ask again', 'x', 'Check the stock'];
const LOOKS = ['Rounded', 'Box', 'Start / end', 'Decision', 'Circle', 'Database'];

const pointAt = (w: Walk, id: string) => {
  boxEl(w, id).dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
  flushSync();
  w.pointer = open(w) ? id : null;
};
const clickBox = async (w: Walk, id: string, init: MouseEventInit = {}) => { pointAt(w, id); await press(boxEl(w, id).querySelector('text, tspan, .sl-shape') ?? boxEl(w, id), init); };
const pickedBox = (w: Walk) => { const p = picked(w); return p.steps.length === 1 && !p.lanes.length && !p.line ? p.steps[0] : null; };
const others = (w: Walk, id: string) => boxIds(w).filter((x) => x !== id);
const typing = (w: Walk) => document.activeElement instanceof HTMLElement && document.activeElement.matches('.layer input:not(.armed), .layer textarea');
const fromDock = async (w: Walk, label: string) => {
  w.dom.querySelector('.mermaid-view')!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
  w.pointer = null;
  await press(q(w, `.dock button[aria-label="${label}"]`)!);
};
const dockMenu = async (w: Walk, dockLabel: string, item: string) => {
  await fromDock(w, dockLabel);
  const it = ui.menu?.items.find((x) => x.label === item);
  ui.closeMenu(it);
};

/** what a person does to a flowchart: every kind of edit, and the moves between them */
const FLOW: Record<string, Act> = {
  'add a step with the + beside a box': { kind: 'edit', can: (w) => open(w) && boxIds(w).length > 0 && !typing(w), run: async (w) => {
    pointAt(w, pick(w, boxIds(w)));
    await press(q(w, '.layer button.plus')!);
  } },
  'add a box from the dock': { kind: 'edit', can: open, run: (w) => dockMenu(w, 'Add', 'Box') },
  'type a name': { kind: 'type', can: (w) => !!(nameField(w) ?? armedField(w)) && w.typedIn !== (nameField(w) ?? armedField(w)), run: (w) => typeIn((nameField(w) ?? armedField(w))!, pick(w, WORDS), w.r) },
  'Enter: done with the name': { kind: 'edit', can: (w) => !!nameField(w), run: () => key('Enter') },
  'Tab: a step into its line': { kind: 'edit', can: (w) => !!pickedBox(w) && !!(nameField(w) ?? armedField(w)), run: () => key('Tab') },
  'pick a box': { kind: 'edit', can: (w) => boxIds(w).length > 0, run: (w) => clickBox(w, pick(w, boxIds(w))) },
  'pick another box too (⇧)': { kind: 'edit', can: (w) => picked(w).steps.length > 0 && boxIds(w).length > 1, run: (w) => clickBox(w, pick(w, others(w, picked(w).steps[0])), { shiftKey: true }) },
  'click empty space': { kind: 'edit', can: open, run: (w) => press(q(w, '.mermaid-view svg')!) },
  'delete what is picked (⌫)': { kind: 'edit', can: (w) => !typing(w) && picked(w).steps.length > 0 && picked(w).steps.length < boxIds(w).length, run: () => key('Backspace') },
  'delete the picked box from its bar': { kind: 'edit', can: (w) => !!pickedBox(w) && boxIds(w).length > 1 && !!bar(w, 'Delete'), run: (w) => press(bar(w, 'Delete')!) },
  'its shape': { kind: 'edit', can: (w) => !!pickedBox(w) && !!bar(w, 'Box'), run: (w) => press(bar(w, pick(w, LOOKS))!) },
  'its order (⌥1)': { kind: 'edit', can: (w) => picked(w).steps.length > 0 && !typing(w), run: (w) => { const k = pick(w, [0, 1, 2]); key(['º', '¡', '™'][k], { altKey: true, code: `Digit${k}` }); } },
  'Connect: start': { kind: 'edit', can: (w) => !!pickedBox(w) && !!bar(w, 'Connect to another box') && boxIds(w).length > 1, run: (w) => press(bar(w, 'Connect to another box')!) },
  'Connect: the box to': { kind: 'edit', can: (w) => !!q(w, '.layer .pickhint'), run: (w) => clickBox(w, pick(w, boxIds(w))) },
  'pick a line': { kind: 'edit', can: (w) => qa(w, '.mermaid-view path.hit').length > 0, run: (w) => press(pick(w, qa(w, '.mermaid-view path.hit'))) },
  'its look': { kind: 'edit', can: (w) => !!bar(w, 'Reverse'), run: (w) => press(bar(w, pick(w, ['Arrow', 'Dotted', 'Bold']))!) },
  'its label': { kind: 'type', can: (w) => !!q(w, '.layer textarea.edge-label') && w.typedIn !== q(w, '.layer textarea.edge-label'), run: (w) => typeIn(q<HTMLTextAreaElement>(w, '.layer textarea.edge-label')!, pick(w, WORDS), w.r) },
  'reverse it': { kind: 'edit', can: (w) => !!bar(w, 'Reverse'), run: (w) => press(bar(w, 'Reverse')!) },
  'a step in the line': { kind: 'edit', can: (w) => !!bar(w, 'Put a step in this line'), run: (w) => press(bar(w, 'Put a step in this line')!) },
  'delete the line': { kind: 'edit', can: (w) => !!bar(w, 'Reverse'), run: (w) => press(q(w, '.layer .bar:has(button[aria-label="Reverse"]) button[aria-label="Delete"]')!) },
  'Move its end: start': { kind: 'edit', can: (w) => !!bar(w, 'Move its end'), run: (w) => press(bar(w, 'Move its end')!) },
  'Across or Down': { kind: 'edit', can: open, run: (w) => dockMenu(w, 'More', pick(w, ['Across', 'Down'])) },
  'add a lane from the dock': { kind: 'edit', can: open, run: (w) => dockMenu(w, 'Add', 'Lane') },
  'pick a lane': { kind: 'edit', can: (w) => open(w) && laneHeads(w).length > 0, run: async (w) => { const h = pick(w, laneHeads(w)); await press(h.querySelector('text') ?? h); } },
  'rename the lane from its bar': { kind: 'edit', can: (w) => !!bar(w, 'Rename the lane'), run: (w) => press(bar(w, 'Rename the lane')!) },
  'move the lane': { kind: 'edit', can: (w) => moveLane(w).length > 0, run: (w) => press(pick(w, moveLane(w))) },
  'a step in the lane': { kind: 'edit', can: (w) => !!bar(w, 'Add a step in this lane'), run: (w) => press(bar(w, 'Add a step in this lane')!) },
  'delete the lane': { kind: 'edit', can: (w) => !!bar(w, 'Delete the lane') && boxIds(w).length > 0, run: (w) => press(bar(w, 'Delete the lane')!) },
  'move what is picked to a lane': { kind: 'edit', can: (w) => !!bar(w, 'Lane'), run: async (w) => {
    await press(bar(w, 'Lane')!);
    ui.closeMenu(pick(w, ui.menu?.items.filter((x) => x.run && !x.disabled) ?? []));
  } },
  'point at a box': { kind: 'pointer', can: (w) => open(w) && boxIds(w).length > 0, run: (w) => pointAt(w, pick(w, boxIds(w))) },
  'point off the drawing': { kind: 'pointer', can: open, run: (w) => {
    w.dom.querySelector('.mermaid-view')!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    w.pointer = null;
  } },
  Esc: { kind: 'esc', can: (w) => open(w), run: () => key('Escape') },
  'open it again': { kind: 'edit', can: (w) => !open(w), run: (w) => press(q(w, '.mermaid-view')!) },
  // ⌘Z in a name being typed is the field's own (the browser's), which jsdom has not
  '↶ (⌘Z)': { kind: 'undo', can: (w) => open(w) && !typing(w), run: () => key('z', { metaKey: true }) },
  '↶ (the dock)': { kind: 'undo', can: (w) => open(w), run: (w) => fromDock(w, 'Undo') },
  '↷ (⇧⌘Z)': { kind: 'redo', can: (w) => open(w) && !typing(w), run: () => key('z', { metaKey: true, shiftKey: true }) },
  '↷ (the dock)': { kind: 'redo', can: (w) => open(w), run: (w) => fromDock(w, 'Redo') },
};

type Before = { seen: string; picked: ReturnType<typeof picked>; at: number };
const backOrForth = (a: Act) => a.kind === 'undo' || a.kind === 'redo';

/** what is wrong with any drawing after `name` was done, `before` it what was seen, picked and where in its changes */
function wrong(w: Walk, name: string, act: Act, before: Before): string[] {
  const out: string[] = [];
  if (q(w, '.mermaid-view.error')) out.push(`the drawing failed: ${q(w, '.mermaid-view')!.textContent}`);
  if (backOrForth(act)) {
    const want = w.charts[w.at];
    if (noteChart(w) !== want) out.push(`${name} left the note\n${noteChart(w)}\nnot\n${want}`);
    else if (w.drawn.code !== want) out.push(`${name} left the drawing\n${w.drawn.code}\nnot\n${want}`);
  }
  if (act.kind === 'esc' && seen(w) === before.seen) out.push('Esc changed nothing that can be seen');
  if (open(w) && document.activeElement === w.dom) out.push(`${name} left the keyboard in the note's text with the drawing open: ⌘Z there is the note's own, which scrolls the note`);
  return out;
}

/** what is wrong with a flowchart's tools: a + only by the box pointed at or picked, nothing for a part ↶ or ↷ took */
function wrongInFlow(w: Walk, name: string, act: Act, before: Before): string[] {
  const out: string[] = [];
  const now = picked(w);
  if (backOrForth(act) && w.at !== before.at) {
    const f = nameField(w), chart = fromCode(w.drawn.code) as Flowchart;
    const named = f?.matches('.rename') ? chart.nodes.find((n) => n.id === pickedBox(w))?.label : chart.lanes?.find((l) => l.id === now.lanes[0])?.label;
    if (f && f.value !== named) out.push(`${name} left a name being typed as “${f.value}”, where the drawing has “${named ?? 'nothing'}”`);
    const was = before.picked;
    for (const s of now.steps) if (!was.steps.includes(s)) out.push(`${name} picked ${s}, which was not picked`);
    for (const l of now.lanes) if (!was.lanes.includes(l)) out.push(`${name} picked lane ${l}, which was not picked`);
    if (now.line && now.line !== was.line) out.push(`${name} picked the line ${now.line}, not ${was.line ?? 'none'}`);
  }
  if (!open(w)) return out;
  const ids = new Set(boxIds(w));
  const single = pickedBox(w);
  const want = (w.pointer && ids.has(w.pointer)) || single ? 1 : 0;
  const plus = qa(w, '.layer button.plus').length;
  if (plus !== want) out.push(`${plus} + shown, with the pointer on ${w.pointer ?? 'nothing'} and ${single ?? 'no box'} picked`);
  if (nameField(w)?.matches('.rename') && !now.steps.length) out.push('a name is being typed for a box that is not picked');
  const hint = !!q(w, '.layer .pickhint'), offered = qa(w, '.layer .ring.target.pick').length;
  if (hint && offered !== ids.size - 1) out.push(`${offered} boxes offered to connect to of ${ids.size}: the one it starts from is gone`);
  return out;
}

/** what is wrong with a chart's tools: ↶ or ↷ lets go of the part picked (its key may be another part's now) */
function wrongInChart(w: Walk, name: string, act: Act, before: Before): string[] {
  if (!backOrForth(act) || w.at === before.at) return [];
  const f = q<HTMLInputElement>(w, '.layer input.field');
  return f ? [`${name} left a part's name being typed: ${f.value}`] : [];
}

const part = (w: Walk) => q<HTMLInputElement>(w, '.layer input.field');
const partBar = (w: Walk, label: string) => q<HTMLButtonElement>(w, `.layer .bar button[aria-label="${label}"]:not(:disabled)`);
const valueField = (w: Walk) => q<HTMLInputElement>(w, '.layer .bar input[aria-label="Value"]');
const parts = (w: Walk) => qa(w, '.mermaid-view .row[data-spot^="slice:"]');
const inPart = (w: Walk) => !!part(w) && document.activeElement === part(w);

/** what a person does to a pie: every kind of edit, and the moves between them */
const PIE: Record<string, Act> = {
  'pick a part': { kind: 'edit', can: (w) => parts(w).length > 0, run: (w) => press(pick(w, parts(w)).querySelector('.lbl')!) },
  'type its name': { kind: 'type', can: (w) => !!part(w) && w.typedIn !== part(w), run: (w) => typeIn(part(w)!, pick(w, WORDS), w.r) },
  'its value': { kind: 'type', can: (w) => !!valueField(w) && w.typedIn !== valueField(w), run: async (w) => {
    const f = valueField(w)!;
    await press(f);
    f.value = '';
    await typeIn(f, pick(w, ['5', '40', '120']), w.r);
  } },
  'Enter: done with it': { kind: 'edit', can: inPart, run: () => key('Enter') },
  'Tab: a part after it': { kind: 'edit', can: inPart, run: () => key('Tab') },
  'add a part after it': { kind: 'edit', can: (w) => !!partBar(w, 'Add a part after it'), run: (w) => press(partBar(w, 'Add a part after it')!) },
  'move it up': { kind: 'edit', can: (w) => !!partBar(w, 'Move up'), run: (w) => press(partBar(w, 'Move up')!) },
  'move it down': { kind: 'edit', can: (w) => !!partBar(w, 'Move down'), run: (w) => press(partBar(w, 'Move down')!) },
  'delete it': { kind: 'edit', can: (w) => !!partBar(w, 'Delete') && parts(w).length > 1, run: (w) => press(partBar(w, 'Delete')!) },
  'add a part from the dock': { kind: 'edit', can: open, run: (w) => dockMenu(w, 'Add', 'Part') },
  'add a title from the dock': { kind: 'edit', can: (w) => open(w) && !q(w, '.mermaid-view [data-spot="title"]'), run: (w) => dockMenu(w, 'Add', 'Title') },
  'pick the title': { kind: 'edit', can: (w) => !!q(w, '.mermaid-view [data-spot="title"]'), run: (w) => press(q(w, '.mermaid-view [data-spot="title"]')!) },
  'show its values': { kind: 'edit', can: open, run: (w) => dockMenu(w, 'More', 'Values') },
  'click empty space': { kind: 'edit', can: open, run: (w) => press(q(w, '.mermaid-view .chart')!) },
  Esc: FLOW.Esc,
  'open it again': FLOW['open it again'],
  '↶ (⌘Z)': { kind: 'undo', can: (w) => open(w) && !typing(w), run: () => key('z', { metaKey: true }) },
  '↶ (the dock)': FLOW['↶ (the dock)'],
  '↷ (⇧⌘Z)': { kind: 'redo', can: (w) => open(w) && !typing(w), run: () => key('z', { metaKey: true, shiftKey: true }) },
  '↷ (the dock)': FLOW['↷ (the dock)'],
};

const KINDS = {
  flowchart: { acts: FLOW, rules: wrongInFlow },
  pie: { acts: PIE, rules: wrongInChart },
};

async function walk(kind: keyof typeof KINDS, start: string, drawn: Drawn, seed: number, steps: number): Promise<string | null> {
  const { acts, rules } = KINDS[kind];
  const r = rng(seed);
  const ed = editorWith(`above\n\n\`\`\`mermaid\n${start}\n\`\`\`\n\nbelow`);
  const main = document.body.appendChild(document.createElement('main'));
  main.append(ed.view.dom.parentElement!);
  const w: Walk = { ed, dom: ed.view.dom as HTMLElement, r, drawn, charts: [], at: 0, pointer: null, typedIn: null };
  try {
    await settle(300);
    await press(q(w, '.mermaid-view')!);
    await settle(300);
    w.charts = [drawn.code];
    const trail: string[] = [];
    for (let i = 0; i < steps; i++) {
      const can = Object.entries(acts).filter(([, a]) => a.can(w));
      const [name, act] = can[Math.floor(r() * can.length)];
      const before = { seen: seen(w), picked: picked(w), at: w.at };
      trail.push(name);
      await act.run(w);
      if (ui.pending) ui.done('');
      await settle(pick(w, [130, 300, 800]));
      if (act.kind === 'undo') w.at = Math.max(0, w.at - 1);
      else if (act.kind === 'redo') w.at = Math.min(w.charts.length - 1, w.at + 1);
      else if (drawn.code !== w.charts[w.at]) {
        w.charts = [...w.charts.slice(0, w.at + 1), drawn.code];
        w.at++;
      }
      if (act.kind !== 'pointer') w.typedIn = act.kind === 'type' ? document.activeElement : null;
      if (!open(w) || (w.pointer && !boxIds(w).includes(w.pointer))) w.pointer = null;
      const bad = [...wrong(w, name, act, before), ...rules(w, name, act, before)];
      if (bad.length) return `seed ${seed}, after ${trail.join(' → ')}:\n  ${bad.join('\n  ')}`;
    }
    return null;
  } finally {
    ed.destroy();
    main.remove();
    ui.closeMenu();
    if (ui.pending) ui.done(null);
  }
}

/** the walks for `kind`, one test for each drawing it starts from (one test file a kind, so they run side by side) */
export function undoWalks(kind: keyof typeof KINDS, starts: Record<string, string>, drawn: Drawn, seeds = 30, steps = 40) {
  for (const [name, start] of Object.entries(starts)) {
    test(`${name}: ↶ takes back one change at a time, ↷ brings it back, and nothing is left of what they take away`, async () => {
      allowFocusLoss();
      vi.useFakeTimers();
      try {
        const fails: string[] = [];
        for (let seed = 1; seed <= seeds && fails.length < 3; seed++) {
          const bad = await walk(kind, start, drawn, seed, steps);
          if (bad) fails.push(bad);
        }
        expect(fails).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    }, 600_000);
  }
}
