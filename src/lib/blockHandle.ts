/**
 * The handle beside a block (Notion's + and ⋮⋮), on a Mac, under the pointer: + opens the / menu on a new line under
 * the block (⌥-click: above it), ⋮⋮ opens the block's menu (delete, duplicate, move, turn into) or, dragged, carries
 * the block to another place in the note (⌥ held: a copy of it). Every change is one transaction, so one ⌘Z takes it back. The title (the
 * note's first line) has none: it is the page's name, not a block to move.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { ui, under, type MenuItem } from './ui.svelte';

interface Block { pos: number; node: PMNode; dom: HTMLElement; item?: boolean }

/** what a plain line can be turned into: the editor's own commands (editor.ts), as the / menu and the keys run them */
const TURN: [kind: string, label: string][] = [
  ['paragraph', 'Text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'],
  ['bulletList', 'Bulleted list'], ['orderedList', 'Numbered list'], ['taskList', 'To-do list'],
  ['blockquote', 'Quote'], ['callout', 'Callout'], ['toggle', 'Toggle'], ['codeBlock', 'Code'],
];
/** a plain line's kind as TURN names it; null for anything else (a list, a quote, a picture…), which is not turned.
 *  (ponytail: a list or a quote turned into another kind as Notion does needs an unwrap first; add when asked for) */
const kindOf = (n: PMNode) => (n.type.name === 'paragraph' ? 'paragraph' : n.type.name === 'heading' && n.attrs.level <= 3 ? `h${n.attrs.level}` : null);

/** Move the top-level block at `from` to `target` (a position between top-level blocks): null where it already is.
 *  `copy` (⌥ held as it is let go, Notion's): a copy goes there, the block stays where it was */
export function moveBlockTo(state: EditorState, from: number, target: number, copy = false): Transaction | null {
  const node = state.doc.nodeAt(from);
  if (!node) return null;
  const end = from + node.nodeSize;
  if (!copy && target >= from && target <= end) return null;
  const tr = copy ? state.tr : state.tr.delete(from, end);
  const at = tr.mapping.map(target);
  tr.insert(at, node);
  return tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
}

/** each top-level block but the title, with where it sits on screen (its margins counted, so a gap is never no one's) */
function blocks(view: EditorView): (Block & { top: number; bottom: number })[] {
  const out: (Block & { top: number; bottom: number })[] = [];
  // ponytail: every block measured on each move of the pointer; a binary search over them if long notes lag
  view.state.doc.forEach((node, pos, i) => {
    const dom = view.nodeDOM(pos);
    if (i === 0 || !(dom instanceof HTMLElement)) return;
    const r = dom.getBoundingClientRect(), cs = getComputedStyle(dom);
    out.push({ pos, node, dom, top: r.top - (parseFloat(cs.marginTop) || 0), bottom: r.bottom + (parseFloat(cs.marginBottom) || 0) });
  });
  return out;
}

class Handle {
  private el = document.createElement('div');
  private line = document.createElement('div'); // where a dragged block would land
  private host: HTMLElement;
  private cur: Block | null = null;
  private dragFrom: number | null = null;
  private dragList: HTMLElement | null = null; // a list's line is dragged among its list's lines
  private frame = 0;

  constructor(private view: EditorView, private run: (id: string) => boolean) {
    this.host = view.dom.parentElement!;
    this.el.className = 'block-handle';
    this.el.innerHTML = `<button class="plus" type="button" tabindex="-1" aria-label="Add a block below" data-tip="Add a block below"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button><button class="grip" type="button" tabindex="-1" draggable="true" aria-label="Block menu" data-tip="Drag to move, click for the menu"><svg viewBox="0 0 16 16"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg></button>`;
    this.el.setAttribute('aria-hidden', 'true'); // the keys have all of this already (⌥↑ ⌥↓, /, the shortcuts)
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
    // the pointer in the margin beside the text (where ⋮⋮ is): the note's own drop handling is not there, so the line
    // follows and the drop lands from here too
    this.host.addEventListener('dragover', this.onHostOver);
    this.host.addEventListener('drop', this.onHostDrop);
    this.host.addEventListener('mouseleave', this.onLeave);
  }

  private onMove = (e: MouseEvent) => {
    if (this.dragFrom !== null || this.el.contains(e.target as Node)) return;
    const y = e.clientY;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const b = blocks(this.view).find((x) => y >= x.top && y < x.bottom);
      if (b) this.show(this.itemAt(b, y) ?? b); else this.hide();
    });
  };
  private onLeave = () => { if (this.dragFrom === null) this.hide(); };

  /** In a list, the line under the pointer is a block of its own, as Notion's are: its handle beside it, its menu and
   *  drag its own. (Held to the list, the handle of a long one stood at its first line, often off screen.) */
  private itemAt(b: Block, y: number): Block | null {
    if (!/^(bulletList|orderedList|taskList)$/.test(b.node.type.name)) return null;
    let li: HTMLElement | null = null;
    for (const el of b.dom.querySelectorAll<HTMLElement>('li')) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y < r.bottom) li = el; // the last one found is the innermost
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
    // level with the block's first line of text (a heading's, a callout's past its padding), or its top
    const box = b.dom.getBoundingClientRect();
    const first = Selection.findFrom(this.view.state.doc.resolve(b.pos), 1, true);
    // no line of text, or one not drawn there (a diagram's hidden source said 0, and the handle went to the note's
    // top): the block's middle, a short one's (a divider: 12px down put it by the next line), else its first 24px
    let mid = box.top + Math.min(12, box.height / 2);
    if (first && first.from < b.pos + b.node.nodeSize) {
      const c = this.view.coordsAtPos(first.from), m = (c.top + c.bottom) / 2;
      if (c.bottom > c.top && m >= box.top - 2 && m <= box.bottom + 2) mid = m;
    }
    this.el.style.top = `${Math.round(mid - host.top - 12)}px`;
    // left of the block itself where it reaches past the text (a wide table, code), not over its first cells; a
    // list's line left of its bullet (its list's own edge); a table further still, clear of its rows' ⋮⋮
    const list = b.item ? b.dom.parentElement : null;
    const edge = (list ? list.getBoundingClientRect().left : Math.min(column, box.left)) - (b.node.type.name === 'table' ? 12 : 0);
    // as far left as what can be seen of the page goes, not the editor's own box: a day's or a card's page has its
    // room for the handle in the padding around the editor, and held to the editor's box the handle sat on the words
    this.el.style.left = `${Math.round(Math.max(this.seen() + 2, edge - 46) - host.left)}px`;
    this.el.classList.add('on');
  }
  hide() { this.cur = null; this.el.classList.remove('on'); }

  /** the box the note scrolls in */
  private scroller(): HTMLElement | null {
    for (let el = this.host.parentElement; el; el = el.parentElement) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
    return null;
  }

  /** where what can be seen of the page begins on the left: the box the note scrolls in (or clips it) */
  private seen(): number {
    for (let el: HTMLElement | null = this.host; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return el.getBoundingClientRect().left;
    }
    return 0;
  }

  /** a new line under the block (or over it), the / menu open on it; an empty line is used as it is */
  private add(above: boolean) {
    const b = this.cur;
    if (!b) return;
    const { state } = this.view;
    const tr = state.tr;
    if (b.node.type.name === 'paragraph' && !b.node.content.size) tr.setSelection(TextSelection.create(tr.doc, b.pos + 1));
    else if (b.item) {
      // a list's line: a plain line under (over) the whole list, as + on the list did; a new item there took the
      // / menu's heading or code as half a list, its nesting lost
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

  /** the block chosen as a whole (its text, so the commands below act on it), then its menu */
  private menu(from: HTMLElement) {
    const b = this.cur;
    if (!b) return;
    const { pos, node } = b, end = pos + node.nodeSize;
    const { doc } = this.view.state;
    // the press took the focus out of the note; given back, the note scrolled to where its caret had been, the menu
    // opened where ⋮⋮ had been (off the top of the window). Measured first, and the page kept where it was
    const r = from.getBoundingClientRect(), scroller = this.scroller(), top = scroller?.scrollTop ?? 0;
    const first = Selection.findFrom(doc.resolve(pos), 1, true), last = Selection.findFrom(doc.resolve(end), -1, true);
    // its own text when it has some (and is not a table, whose cells' text the line commands pass over); else the
    // block itself: a divider's "text" was found in the lines around it, and Duplicate copied those
    const own = first && last && node.type.name !== 'table' && first.from >= pos && first.from < end && last.to > pos && last.to <= end && first.from <= last.to;
    const sel = own ? TextSelection.create(doc, first!.from, last!.to) : NodeSelection.create(doc, pos);
    this.view.dispatch(this.view.state.tr.setSelection(sel));
    this.view.focus();
    if (scroller) scroller.scrollTop = top;
    const kind = kindOf(node);
    const items: MenuItem[] = [
      { label: 'Delete', danger: true, run: () => {
        // the only line of its list: the list goes too (an empty bullet was left)
        const $p = this.view.state.doc.resolve(pos), alone = b.item && $p.parent.childCount === 1;
        const [from, to] = alone ? [$p.before(), $p.after()] : [pos, end];
        this.view.dispatch(this.view.state.tr.delete(from, to).scrollIntoView());
      } },
      // a block taken whole (a table, a picture, a divider) is copied and moved as a block: the line commands act on
      // a selection's lines, and a table chosen whole is its cells to them (they did nothing)
      { label: 'Duplicate', run: () => (own ? this.run('duplicate') : this.view.dispatch(this.view.state.tr.insert(end, node).scrollIntoView())) },
      { label: 'Move up', run: () => (own ? this.run('moveBlockUp') : this.step(pos, -1)) },
      { label: 'Move down', run: () => (own ? this.run('moveBlockDown') : this.step(pos, 1)) },
      ...(kind ? TURN.map(([k, label], i) => ({ label, sep: i === 0, checked: k === kind, run: () => void (k !== kind && this.run(k)) })) : []),
    ];
    this.hide();
    ui.openMenu(under(r), items);
  }

  /** the block at `pos` past its neighbour above (-1) or under it (1); never above the note's title */
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
    // a list's line goes as a list of one, so it can be written out (and pasted elsewhere) as markdown
    const list = b.item ? this.view.state.doc.resolve(b.pos).parent : null;
    const slice = list ? new Slice(Fragment.from(list.type.create(list.attrs, b.node)), 0, 0) : sel.content();
    const { dom, text } = this.view.serializeForClipboard(slice);
    e.dataTransfer.clearData();
    e.dataTransfer.setData('text/html', dom.innerHTML);
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copyMove'; // ⌥ makes it a copy
    // a small picture of the block beside the pointer, not the whole block under it: the system draws that picture
    // over the page, and a block-sized one covered the line saying where the block would go
    const ghost = document.createElement('div');
    ghost.className = 'block-ghost tiptap';
    ghost.append(b.dom.cloneNode(true));
    document.body.append(ghost);
    e.dataTransfer.setDragImage(ghost, -14, -14);
    setTimeout(() => ghost.remove());
    this.view.dragging = { slice, move: true };
    this.dragFrom = b.pos;
    this.dragList = b.item ? b.dom.parentElement : null;
    document.documentElement.classList.add('block-drag'); // the editor's own drop line gives way to this one
  }

  /** where a dragged block lands: before the block under the pointer or after it, whichever half it is over */
  private target(y: number): { pos: number; y: number } | null {
    const all = this.dragList
      ? [...this.dragList.children].filter((el): el is HTMLElement => el.tagName === 'LI').map((dom) => {
        const pos = this.view.posAtDOM(dom, 0) - 1, r = dom.getBoundingClientRect();
        return { pos, node: this.view.state.doc.nodeAt(pos)!, dom, top: r.top, bottom: r.bottom };
      }).filter((b) => b.node)
      : blocks(this.view);
    if (!all.length) return null;
    for (const b of all) {
      if (y >= b.bottom) continue;
      const r = b.dom.getBoundingClientRect();
      return y < (r.top + r.bottom) / 2 ? { pos: b.pos, y: r.top } : { pos: b.pos + b.node.nodeSize, y: r.bottom };
    }
    const b = all[all.length - 1];
    return { pos: b.pos + b.node.nodeSize, y: b.dom.getBoundingClientRect().bottom };
  }

  over(e: DragEvent) {
    if (this.dragFrom === null) return;
    const t = this.target(e.clientY);
    if (!t) return;
    const host = this.host.getBoundingClientRect(), page = this.view.dom.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(this.view.dom).paddingLeft) || 0;
    Object.assign(this.line.style, { top: `${Math.round(t.y - host.top - 2)}px`, left: `${Math.round(page.left + pad - host.left)}px`, width: `${Math.round(page.width - 2 * pad)}px` });
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
    this.dragFrom = null;
    this.dragList = null;
    this.view.dragging = null;
    this.line.classList.remove('on');
    document.documentElement.classList.remove('block-drag');
  }

  update(view: EditorView, prev: EditorState) {
    // typing: the handle goes until the pointer moves again, as Notion's does
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
