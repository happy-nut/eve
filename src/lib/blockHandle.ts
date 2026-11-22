import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { ui, under, type MenuItem } from './ui.svelte';
import { ICONS } from './lineIcons';

interface Block { pos: number; node: PMNode; dom: HTMLElement; item?: boolean }

export const TURN: [kind: string, label: string, icon: keyof typeof ICONS][] = [
  ['paragraph', 'Text', 'text'], ['h1', 'Heading 1', 'h1'], ['h2', 'Heading 2', 'h2'], ['h3', 'Heading 3', 'h3'],
  ['bulletList', 'Bulleted list', 'bullet'], ['orderedList', 'Numbered list', 'numbered'], ['taskList', 'To-do list', 'todo'],
  ['blockquote', 'Quote', 'quote'], ['callout', 'Callout', 'callout'], ['toggle', 'Toggle', 'toggle'], ['codeBlock', 'Code block', 'code'],
];
const kindOf = (n: PMNode) => (n.type.name === 'paragraph' ? 'paragraph' : n.type.name === 'heading' && n.attrs.level <= 3 ? `h${n.attrs.level}` : null);

export function moveBlockTo(state: EditorState, from: number, target: number, copy = false): Transaction | null {
  const node = state.doc.nodeAt(from);
  if (!node) return null;
  let start = from, end = from + node.nodeSize;
  if (!copy && target >= start && target <= end) return null;
  const $f = state.doc.resolve(from);
  const list = /Item$/.test(node.type.name) ? $f.parent : null;
  const where = placeFor(state, target, node, list);
  if (!where) return null;
  const { put } = where;
  if (list && !copy && list.childCount === 1) { start = $f.before(); end = $f.after(); }
  const $s = state.doc.resolve(start), alone = !copy && $s.depth > 0 && $s.parent.childCount === 1;
  const tr = copy ? state.tr : alone ? state.tr.replaceWith(start, end, state.schema.nodes.paragraph.create()) : state.tr.delete(start, end);
  let at = tr.mapping.map(where.pos);
  if (where.split) {
    const $at = tr.doc.resolve(at), cut = $at.parent;
    tr.split(at);
    at += 1;
    if (cut.type.name === 'orderedList') tr.setNodeAttribute(at, 'start', (cut.attrs.start ?? 1) + $at.index());
  }
  tr.insert(at, put);
  const $at = tr.doc.resolve(at);
  for (let d = $at.depth; d > 0; d--) if ($at.node(d).type.name === 'details' && !$at.node(d).attrs.open) tr.setNodeAttribute($at.before(d), 'open', true);
  return tr.setSelection(NodeSelection.create(tr.doc, put === node ? at : at + 1)).scrollIntoView();
}
function placeFor(state: EditorState, pos: number, node: PMNode, list: PMNode | null): { pos: number; put: PMNode; split?: boolean } | null {
  if (fitsAt(state, pos, node)) return { pos, put: node };
  const put = list ? asList(list, node) : node;
  if (fitsAt(state, pos, put)) return { pos, put };
  const $p = state.doc.resolve(pos);
  if (!/List$/.test($p.parent.type.name) || $p.depth < 1) return null;
  const i = $p.index(), edge = i === 0 ? $p.before() : i === $p.parent.childCount ? $p.after() : null;
  if (edge !== null) return fitsAt(state, edge, put) ? { pos: edge, put } : null;
  return fitsAt(state, $p.before(), put) ? { pos, put, split: true } : null;
}
const fitsAt = (state: EditorState, pos: number, node: PMNode) => { const $p = state.doc.resolve(pos); return $p.parent.canReplaceWith($p.index(), $p.index(), node.type); };
const asList = (list: PMNode, item: PMNode) => list.type.create(list.type.name === 'orderedList' ? { ...list.attrs, start: 1 } : list.attrs, item);

type Placed = Block & { top: number; bottom: number; depth: number };
const HOLDS = /^(detailsContent|callout|blockquote)$/;
function blocks(view: EditorView): Placed[] {
  const out: Placed[] = [];
  const walk = (parent: PMNode, start: number, depth: number) => parent.forEach((node, offset, i) => {
    const pos = start + offset;
    if (depth === 0 && i === 0) return;
    if (node.type.name === 'detailsSummary') return;
    if (node.type.name === 'detailsContent') { walk(node, pos + 1, depth); return; }
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const r = dom.getBoundingClientRect(), cs = getComputedStyle(dom);
    if (!r.height) return;
    out.push({ pos, node, dom, depth, top: r.top - (parseFloat(cs.marginTop) || 0), bottom: r.bottom + (parseFloat(cs.marginBottom) || 0) });
    if (node.type.name === 'details' || HOLDS.test(node.type.name)) walk(node, pos + 1, depth + 1);
  });
  walk(view.state.doc, 0, 0);
  return out;
}
function items(view: EditorView): Placed[] {
  const out: Placed[] = [];
  view.state.doc.descendants((node, pos) => {
    if (!/Item$/.test(node.type.name)) return true;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const r = dom.getBoundingClientRect();
      if (r.height) out.push({ pos, node, dom, item: true, depth: view.state.doc.resolve(pos).depth, top: r.top, bottom: r.bottom });
    }
    return true;
  });
  return out;
}
const deepest = (all: Placed[], y: number) => all.filter((b) => y >= b.top && y < b.bottom).sort((a, b) => b.depth - a.depth)[0];

class Handle {
  private el = document.createElement('div');
  private line = document.createElement('div');
  private host: HTMLElement;
  private cur: Block | null = null;
  private dragFrom: number | null = null;
  private zone: HTMLElement | null = null;
  private frame = 0;

  constructor(private view: EditorView, private run: (id: string) => boolean) {
    this.host = view.dom.parentElement!;
    this.el.className = 'block-handle';
    this.el.innerHTML = `<button class="plus" type="button" tabindex="-1" aria-label="Add a block below" data-tip="Add a block below"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button><button class="grip" type="button" tabindex="-1" draggable="true" aria-label="Block menu" data-tip="Drag to move, click for the menu"><svg viewBox="0 0 16 16"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg></button>`;
    this.el.setAttribute('aria-hidden', 'true');
    this.line.className = 'block-drop';
    this.host.append(this.el, this.line);
    const [plus, grip] = this.el.querySelectorAll('button');
    // pressing + keeps the caret and the focus in the note. Not ⋮⋮: a press the page turns down is no drag to WebKit,
    // and the block never moved (the menu and the drop put the focus back in the note themselves)
    plus.addEventListener('mousedown', (e) => e.preventDefault());
    plus.addEventListener('click', (e) => this.add(e.altKey));
    grip.addEventListener('click', () => this.menu(grip));
    grip.addEventListener('dragstart', (e) => this.dragStart(e));
    this.host.addEventListener('mousemove', this.onMove);
    this.host.addEventListener('dragover', this.onHostOver);
    this.host.addEventListener('drop', this.onHostDrop);
    this.host.addEventListener('mouseleave', this.onLeave);
  }

  private onMove = (e: MouseEvent) => {
    if (this.dragFrom !== null || this.el.contains(e.target as Node)) return;
    const y = e.clientY;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const b = deepest(blocks(this.view), y);
      if (b) this.show(this.itemAt(b, y) ?? b); else this.hide();
    });
  };
  private onLeave = () => { if (this.dragFrom === null) this.hide(); };

  private itemAt(b: Block, y: number): Block | null {
    if (!/^(bulletList|orderedList|taskList)$/.test(b.node.type.name)) return null;
    let li: HTMLElement | null = null;
    for (const el of b.dom.querySelectorAll<HTMLElement>('li')) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y < r.bottom) li = el;
    }
    if (!li) return null;
    const pos = this.view.posAtDOM(li, 0) - 1, node = this.view.state.doc.nodeAt(pos);
    return node && /Item$/.test(node.type.name) ? { pos, node, dom: li, item: true } : null;
  }
  private onHostOver = (e: DragEvent) => {
    if (this.dragFrom === null || this.view.dom.contains(e.target as Node)) return;
    e.preventDefault();
    this.over(e);
  };
  private onHostDrop = (e: DragEvent) => {
    if (this.dragFrom === null || this.view.dom.contains(e.target as Node)) return;
    this.drop(e);
  };

  private show(b: Block) {
    this.cur = b;
    const host = this.host.getBoundingClientRect();
    const page = this.view.dom.getBoundingClientRect();
    const column = page.left + (parseFloat(getComputedStyle(this.view.dom).paddingLeft) || 0);
    const box = b.dom.getBoundingClientRect();
    const first = Selection.findFrom(this.view.state.doc.resolve(b.pos), 1, true);
    let mid = box.top + Math.min(12, box.height / 2);
    if (first && first.from < b.pos + b.node.nodeSize) {
      const c = this.view.coordsAtPos(first.from), m = (c.top + c.bottom) / 2;
      if (c.bottom > c.top && m >= box.top - 2 && m <= box.bottom + 2) mid = m;
    }
    this.el.style.top = `${Math.round(mid - host.top - 12)}px`;
    const list = b.item ? b.dom.parentElement : null;
    const edge = (list ? list.getBoundingClientRect().left : Math.min(column, box.left)) - (b.node.type.name === 'table' ? 12 : 0);
    const left = Math.round(Math.max(this.seen() + 2, edge - 46) - host.left);
    this.el.style.left = `${left}px`;
    this.el.style.setProperty('--bridge', `${Math.max(0, -(left + this.el.offsetWidth)) + 2}px`);
    this.el.classList.add('on');
  }
  hide() { this.cur = null; this.el.classList.remove('on'); }

  private scroller(): HTMLElement | null {
    for (let el = this.host.parentElement; el; el = el.parentElement) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    return null;
  }

  private seen(): number {
    for (let el: HTMLElement | null = this.host; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return el.getBoundingClientRect().left;
    }
    return 0;
  }

  private add(above: boolean) {
    const b = this.cur;
    if (!b) return;
    const { state } = this.view;
    const tr = state.tr;
    if (b.node.type.name === 'paragraph' && !b.node.content.size) tr.setSelection(TextSelection.create(tr.doc, b.pos + 1));
    else if (b.item) {
      const $top = state.doc.resolve(b.pos), top = $top.before(1), after = $top.after(1);
      const at = above ? top : after;
      tr.insert(at, state.schema.nodes.paragraph.create()).setSelection(TextSelection.create(tr.doc, at + 1));
    } else {
      const at = above ? b.pos : b.pos + b.node.nodeSize;
      tr.insert(at, state.schema.nodes.paragraph.create()).setSelection(TextSelection.create(tr.doc, at + 1));
    }
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
    this.run('slash');
  }

  private menu(from: HTMLElement) {
    const b = this.cur;
    if (!b) return;
    const { pos, node } = b, end = pos + node.nodeSize;
    const { doc } = this.view.state;
    const r = from.getBoundingClientRect(), scroller = this.scroller(), top = scroller?.scrollTop ?? 0;
    const first = Selection.findFrom(doc.resolve(pos), 1, true), last = Selection.findFrom(doc.resolve(end), -1, true);
    const own = first && last && node.type.name !== 'table' && first.from >= pos && first.from < end && last.to > pos && last.to <= end && first.from <= last.to;
    const sel = own ? TextSelection.create(doc, first!.from, last!.to) : NodeSelection.create(doc, pos);
    this.view.dispatch(this.view.state.tr.setSelection(sel));
    this.view.focus();
    if (scroller) scroller.scrollTop = top;
    const kind = kindOf(node);
    const items: MenuItem[] = [
      { label: 'Delete', icon: ICONS.trash, danger: true, run: () => {
        const $p = this.view.state.doc.resolve(pos), alone = b.item && $p.parent.childCount === 1;
        const [from, to] = alone ? [$p.before(), $p.after()] : [pos, end];
        this.view.dispatch(this.view.state.tr.delete(from, to).scrollIntoView());
      } },
      { label: 'Duplicate', icon: ICONS.duplicate, run: () => (own ? this.run('duplicate') : this.view.dispatch(this.view.state.tr.insert(end, node).scrollIntoView())) },
      { label: 'Move up', icon: ICONS.up, run: () => (own ? this.run('moveBlockUp') : this.step(pos, -1)) },
      { label: 'Move down', icon: ICONS.down, run: () => (own ? this.run('moveBlockDown') : this.step(pos, 1)) },
      ...(kind ? TURN.map(([k, label, icon], i) => ({ label, icon: ICONS[icon], sep: i === 0, checked: k === kind, run: () => void (k !== kind && this.run(k)) })) : []),
    ];
    this.hide();
    ui.openMenu(under(r), items);
  }

  private step(pos: number, dir: -1 | 1) {
    const { state } = this.view, $p = state.doc.resolve(pos), i = $p.index(), parent = $p.parent;
    const node = parent.child(i), next = parent.maybeChild(i + dir);
    if (!next || (dir < 0 && $p.depth === 0 && i - 1 === 0)) return;
    const tr = moveBlockTo(state, pos, dir < 0 ? pos - next.nodeSize : pos + node.nodeSize + next.nodeSize);
    if (tr) this.view.dispatch(tr);
  }

  private dragStart(e: DragEvent) {
    const b = this.cur;
    if (!b || !e.dataTransfer) return;
    const sel = NodeSelection.create(this.view.state.doc, b.pos);
    this.view.dispatch(this.view.state.tr.setSelection(sel));
    const list = b.item ? this.view.state.doc.resolve(b.pos).parent : null;
    const slice = list ? new Slice(Fragment.from(list.type.create(list.attrs, b.node)), 0, 0) : sel.content();
    const { dom, text } = this.view.serializeForClipboard(slice);
    e.dataTransfer.clearData();
    e.dataTransfer.setData('text/html', dom.innerHTML);
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copyMove';
    const ghost = document.createElement('div');
    ghost.className = 'block-ghost tiptap';
    ghost.append(b.dom.cloneNode(true));
    document.body.append(ghost);
    e.dataTransfer.setDragImage(ghost, -14, -14);
    setTimeout(() => ghost.remove());
    this.view.dragging = { slice, move: true };
    this.dragFrom = b.pos;
    document.documentElement.classList.add('block-drag');
    this.zone = this.scroller();
    if (this.zone && this.zone !== this.host) {
      this.zone.addEventListener('dragover', this.onHostOver);
      this.zone.addEventListener('drop', this.onHostDrop);
    }
  }

  private target(y: number): { pos: number; y: number; left?: number; width?: number } | null {
    const { state } = this.view, from = this.dragFrom!, moving = state.doc.nodeAt(from);
    const list = moving && /Item$/.test(moving.type.name) ? state.doc.resolve(from).parent : null;
    const all = [...blocks(this.view), ...(list ? items(this.view) : [])].filter((b) => !moving || b.pos < from || b.pos >= from + moving.nodeSize);
    if (!all.length) return null;
    const fits = (pos: number) => !moving || !!placeFor(state, pos, moving, list);
    const line = (b: Placed, pos: number, at: number) => { const r = b.dom.getBoundingClientRect(); return { pos, y: at, left: r.left, width: r.width }; };
    const b = deepest(all, y) ?? (y < all[0].top ? all[0] : all.filter((x) => x.depth === 0).at(-1)!);
    const r = b.dom.getBoundingClientRect();
    if (b.node.type.name === 'details') {
      const title = b.dom.querySelector('summary')?.getBoundingClientRect();
      if (title && y >= (title.top + title.bottom) / 2 && y < title.bottom + 4) {
        const inside = b.pos + 1 + b.node.child(0).nodeSize + 1;
        const body = b.dom.querySelector<HTMLElement>('[data-type="detailsContent"]')?.getBoundingClientRect();
        if (fits(inside)) return { pos: inside, y: title.bottom, left: body?.left ?? title.left, width: body?.width ?? title.width };
      }
    }
    const before = y < (r.top + r.bottom) / 2;
    const pos = before ? b.pos : b.pos + b.node.nodeSize;
    if (fits(pos)) return line(b, pos, before ? r.top : r.bottom);
    const $b = state.doc.resolve(b.pos), outer = $b.depth ? $b.before($b.depth) : null;
    if (outer === null) return null;
    const holder = state.doc.nodeAt(outer)!, hr = (this.view.nodeDOM(outer) as HTMLElement).getBoundingClientRect();
    return before ? { pos: outer, y: hr.top } : { pos: outer + holder.nodeSize, y: hr.bottom };
  }

  over(e: DragEvent) {
    if (this.dragFrom === null) return;
    const t = this.target(e.clientY);
    if (!t) return;
    const host = this.host.getBoundingClientRect(), page = this.view.dom.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(this.view.dom).paddingLeft) || 0;
    const left = t.left ?? page.left + pad, width = t.width ?? page.width - 2 * pad;
    Object.assign(this.line.style, { top: `${Math.round(t.y - host.top - 2)}px`, left: `${Math.round(left - host.left)}px`, width: `${Math.round(width)}px` });
    this.line.classList.add('on');
  }

  drop(e: DragEvent): boolean {
    if (this.dragFrom === null) return false;
    const t = this.target(e.clientY), from = this.dragFrom;
    this.endDrag();
    e.preventDefault();
    const tr = t && moveBlockTo(this.view.state, from, t.pos, e.altKey);
    if (tr) this.view.dispatch(tr);
    this.view.focus();
    return true;
  }

  endDrag() {
    if (this.zone && this.zone !== this.host) {
      this.zone.removeEventListener('dragover', this.onHostOver);
      this.zone.removeEventListener('drop', this.onHostDrop);
    }
    this.zone = null;
    this.dragFrom = null;
    this.view.dragging = null;
    this.line.classList.remove('on');
    document.documentElement.classList.remove('block-drag');
  }

  update(view: EditorView, prev: EditorState) {
    if (!view.state.doc.eq(prev.doc) && this.dragFrom === null) this.hide();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.host.removeEventListener('mousemove', this.onMove);
    this.host.removeEventListener('mouseleave', this.onLeave);
    this.host.removeEventListener('dragover', this.onHostOver);
    this.host.removeEventListener('drop', this.onHostDrop);
    this.endDrag();
    this.el.remove();
    this.line.remove();
  }
}

export const BlockHandle = Extension.create<{ run: (id: string) => boolean }>({
  name: 'blockHandle',
  addOptions: () => ({ run: () => false }),
  addProseMirrorPlugins() {
    let handle: Handle | null = null;
    const run = (id: string) => this.options.run(id);
    return [new Plugin({
      key: new PluginKey('blockHandle'),
      view: (view) => (handle = new Handle(view, run)),
      props: {
        handleDrop: (_view, e) => handle?.drop(e) ?? false,
        handleDOMEvents: {
          dragover: (_view, e) => (handle?.over(e), false),
          dragend: () => (handle?.endDrag(), false),
        },
      },
    })];
  },
});
