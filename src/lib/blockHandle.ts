/**
 * The handle beside a block (Notion's + and ⋮⋮), on a Mac, under the pointer: + opens the / menu on a new line under
 * the block (⌥-click: above it), ⋮⋮ opens the block's menu (delete, duplicate, move, turn into) or, dragged, carries
 * the block to another place in the note. Every change is one transaction, so one ⌘Z takes it back. The title (the
 * note's first line) has none: it is the page's name, not a block to move.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ui, type MenuItem } from './ui.svelte';

interface Block { pos: number; node: PMNode; dom: HTMLElement }

/** what a plain line can be turned into: the editor's own commands (editor.ts), as the / menu and the keys run them */
const TURN: [kind: string, label: string][] = [
  ['paragraph', 'Text'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'],
  ['bulletList', 'Bulleted list'], ['orderedList', 'Numbered list'], ['taskList', 'To-do list'],
  ['blockquote', 'Quote'], ['callout', 'Callout'], ['toggle', 'Toggle'], ['codeBlock', 'Code'],
];
/** a plain line's kind as TURN names it; null for anything else (a list, a quote, a picture…), which is not turned.
 *  (ponytail: a list or a quote turned into another kind as Notion does needs an unwrap first; add when asked for) */
const kindOf = (n: PMNode) => (n.type.name === 'paragraph' ? 'paragraph' : n.type.name === 'heading' && n.attrs.level <= 3 ? `h${n.attrs.level}` : null);

/** Move the top-level block at `from` to `target` (a position between top-level blocks): null where it already is */
export function moveBlockTo(state: EditorState, from: number, target: number): Transaction | null {
  const node = state.doc.nodeAt(from);
  if (!node) return null;
  const end = from + node.nodeSize;
  if (target >= from && target <= end) return null;
  const tr = state.tr.delete(from, end);
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
  private frame = 0;

  constructor(private view: EditorView, private run: (id: string) => boolean) {
    this.host = view.dom.parentElement!;
    this.el.className = 'block-handle';
    this.el.innerHTML = `<button class="plus" type="button" tabindex="-1" aria-label="Add a block below" data-tip="Add a block below"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button><button class="grip" type="button" tabindex="-1" draggable="true" aria-label="Block menu" data-tip="Drag to move, click for the menu"><svg viewBox="0 0 16 16"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg></button>`;
    this.el.setAttribute('aria-hidden', 'true'); // the keys have all of this already (⌥↑ ⌥↓, /, the shortcuts)
    this.line.className = 'block-drop';
    this.host.append(this.el, this.line);
    const [plus, grip] = this.el.querySelectorAll('button');
    // pressing either keeps the caret and the focus in the note: the menu gives the keyboard back to it
    for (const b of [plus, grip]) b.addEventListener('mousedown', (e) => e.preventDefault());
    plus.addEventListener('click', (e) => this.add(e.altKey));
    grip.addEventListener('click', () => this.menu(grip));
    grip.addEventListener('dragstart', (e) => this.dragStart(e));
    this.host.addEventListener('mousemove', this.onMove);
    this.host.addEventListener('mouseleave', this.onLeave);
  }

  private onMove = (e: MouseEvent) => {
    if (this.dragFrom !== null || this.el.contains(e.target as Node)) return;
    const y = e.clientY;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const b = blocks(this.view).find((x) => y >= x.top && y < x.bottom);
      if (b) this.show(b); else this.hide();
    });
  };
  private onLeave = () => { if (this.dragFrom === null) this.hide(); };

  private show(b: Block) {
    this.cur = b;
    const host = this.host.getBoundingClientRect();
    const page = this.view.dom.getBoundingClientRect();
    const column = page.left + (parseFloat(getComputedStyle(this.view.dom).paddingLeft) || 0);
    // level with the block's first line of text (a heading's, a callout's past its padding), or its top
    const first = Selection.findFrom(this.view.state.doc.resolve(b.pos), 1, true);
    let mid: number;
    if (first && first.from < b.pos + b.node.nodeSize) {
      const c = this.view.coordsAtPos(first.from);
      mid = (c.top + c.bottom) / 2;
    } else mid = b.dom.getBoundingClientRect().top + 12;
    this.el.style.top = `${Math.round(mid - host.top - 12)}px`;
    this.el.style.left = `${Math.max(2, Math.round(column - host.left - 46))}px`;
    this.el.classList.add('on');
  }
  hide() { this.cur = null; this.el.classList.remove('on'); }

  /** a new line under the block (or over it), the / menu open on it; an empty line is used as it is */
  private add(above: boolean) {
    const b = this.cur;
    if (!b) return;
    const { state } = this.view;
    const tr = state.tr;
    if (b.node.type.name === 'paragraph' && !b.node.content.size) tr.setSelection(TextSelection.create(tr.doc, b.pos + 1));
    else {
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
    const first = Selection.findFrom(doc.resolve(pos), 1, true), last = Selection.findFrom(doc.resolve(end), -1, true);
    const sel = first && last && first.from >= pos && last.to <= end ? TextSelection.create(doc, first.from, last.to) : NodeSelection.create(doc, pos);
    this.view.dispatch(this.view.state.tr.setSelection(sel));
    this.view.focus();
    const kind = kindOf(node);
    const items: MenuItem[] = [
      { label: 'Delete', danger: true, run: () => this.view.dispatch(this.view.state.tr.delete(pos, end).scrollIntoView()) },
      { label: 'Duplicate', run: () => this.run('duplicate') },
      { label: 'Move up', run: () => this.run('moveBlockUp') },
      { label: 'Move down', run: () => this.run('moveBlockDown') },
      ...(kind ? TURN.map(([k, label], i) => ({ label, sep: i === 0, checked: k === kind, run: () => void (k !== kind && this.run(k)) })) : []),
    ];
    const r = from.getBoundingClientRect();
    this.hide();
    ui.openMenu({ clientX: Math.round(r.left), clientY: Math.round(r.bottom + 4) }, items);
  }

  private dragStart(e: DragEvent) {
    const b = this.cur;
    if (!b || !e.dataTransfer) return;
    const sel = NodeSelection.create(this.view.state.doc, b.pos);
    this.view.dispatch(this.view.state.tr.setSelection(sel));
    const slice = sel.content();
    const { dom, text } = this.view.serializeForClipboard(slice);
    e.dataTransfer.clearData();
    e.dataTransfer.setData('text/html', dom.innerHTML);
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(b.dom, 0, 0);
    this.view.dragging = { slice, move: true };
    this.dragFrom = b.pos;
    document.documentElement.classList.add('block-drag'); // the editor's own drop line gives way to this one
  }

  /** where a dragged block lands: before the block under the pointer or after it, whichever half it is over */
  private target(y: number): { pos: number; y: number } | null {
    const all = blocks(this.view);
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
    const tr = t && moveBlockTo(this.view.state, from, t.pos);
    if (tr) this.view.dispatch(tr);
    this.view.focus();
    return true;
  }

  endDrag() {
    this.dragFrom = null;
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
