import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * The selection, drawn by the editor on a layer of its own over the note (CodeMirror's way), never by the browser
 * (app.css turns the browser's off) and never by touching the text.
 *
 * WebKit paints a selection its own way per kind of block: line ends and the gaps between blocks filled in lists,
 * to-dos, nested items, callouts, so a drag that stopped mid-line could light the line to its end. Wrapping the
 * selected text in spans instead (inline decorations) split the text while the mouse was still dragging, and in
 * some notes WebKit lost the selection's start on mouseup and the selection collapsed. Here the text is left
 * alone: each selected piece of text gets a rectangle exactly its size on the layer, blended over the page so the
 * text stays readable on any background. Pictures, cards and empty lines are marked by paintSelection (editor.ts),
 * which only sets a class.
 */
export const SelectionLayer = Extension.create({
  name: 'selectionLayer',
  addProseMirrorPlugins: () => [new Plugin({ view: (view) => new Layer(view) })],
});

class Layer {
  private el = document.createElement('div');
  private frame = 0;
  constructor(private view: EditorView) {
    this.el.className = 'sel-layer';
    this.el.setAttribute('aria-hidden', 'true');
    view.dom.after(this.el);
    document.addEventListener('selectionchange', this.schedule);
    window.addEventListener('resize', this.schedule);
    // any scroll (the note's own pane, a card page): the rectangles follow the text
    document.addEventListener('scroll', this.schedule, true);
    this.schedule();
  }
  update() { this.schedule(); }
  destroy() {
    cancelAnimationFrame(this.frame);
    document.removeEventListener('selectionchange', this.schedule);
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('scroll', this.schedule, true);
    this.el.remove();
  }
  private schedule = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  };
  /** the selected text's own boxes, line by line, as rectangles on the layer */
  private draw() {
    const { view, el } = this;
    const sel = view.state.selection;
    const boxes: DOMRect[] = [];
    // a table's cell selection colours whole cells itself (.selectedCell); a node selection outlines its node
    const cells = '$anchorCell' in sel;
    if (!sel.empty && !(sel instanceof NodeSelection) && !cells && view.dom.isConnected) {
      const { from, to } = sel;
      view.state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return true;
        const a = view.domAtPos(Math.max(from, pos)), b = view.domAtPos(Math.min(to, pos + node.nodeSize));
        const range = document.createRange();
        try { range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset); } catch { return false; }
        for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0) boxes.push(r);
        return false;
      });
    }
    // the layer sits at the top-left of its positioned ancestor, which may itself scroll
    const op = el.offsetParent as HTMLElement | null;
    const host = op?.getBoundingClientRect() ?? new DOMRect();
    const dx = (op?.scrollLeft ?? 0) - host.left - (op?.clientLeft ?? 0), dy = (op?.scrollTop ?? 0) - host.top - (op?.clientTop ?? 0);
    el.replaceChildren(...boxes.map((r) => {
      const d = document.createElement('div');
      d.style.cssText = `left:${r.left + dx}px;top:${r.top + dy}px;width:${r.width}px;height:${r.height}px`;
      return d;
    }));
  }
}
