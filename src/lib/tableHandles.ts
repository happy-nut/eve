/**
 * A table's own handles, Notion's, on a Mac under the pointer: ⋮⋮ on the left edge of the row the pointer is in and
 * ⋯ on the top edge of its column — a click chooses that row (column) and opens its menu, a drag moves it — and a +
 * bar along the table's foot (a row) and its right side (a column). They stand on the table's own edges, never over
 * its cells. A phone, with no pointer to bring them up, keeps TableTools' bar.
 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { CellSelection, TableMap, deleteCellSelection, moveTableColumn, moveTableRow } from '@tiptap/pm/tables';
import type { Editor } from '@tiptap/core';
import { ui, under, type MenuItem } from './ui.svelte';

/** the table at `pos` (its node, its map) */
function tableAt(doc: PMNode, pos: number) {
  const node = doc.nodeAt(pos);
  return node?.type.name === 'table' ? { node, map: TableMap.get(node) } : null;
}
/** where row `r` column `c`'s cell starts */
const cellPos = (pos: number, map: TableMap, r: number, c: number) => pos + 1 + map.map[r * map.width + c];

/** Row `r` (or column `c`) of the table at `pos` chosen whole, as its handle's click chooses it */
export function chooseLine(editor: Editor, pos: number, line: { row?: number; col?: number }) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const { map } = t, doc = editor.state.doc;
  const sel = line.row !== undefined
    ? CellSelection.rowSelection(doc.resolve(cellPos(pos, map, line.row, 0)), doc.resolve(cellPos(pos, map, line.row, map.width - 1)))
    : CellSelection.colSelection(doc.resolve(cellPos(pos, map, 0, line.col!)), doc.resolve(cellPos(pos, map, map.height - 1, line.col!)));
  editor.view.dispatch(editor.state.tr.setSelection(sel));
}

/** Row `r` again under it, words and all (a copy of the header row is a row of the body) */
export function duplicateRow(editor: Editor, pos: number, r: number) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const row = t.node.child(r);
  let at = pos + 1;
  for (let i = 0; i <= r; i++) at += t.node.child(i).nodeSize;
  const { tableCell } = editor.state.schema.nodes;
  const copy = row.type.create(row.attrs, (() => { const cells: PMNode[] = []; row.forEach((c) => cells.push(tableCell.create(c.attrs, c.content))); return cells; })());
  editor.view.dispatch(editor.state.tr.insert(at, copy));
}

/** Column `c` again to its right, words and all */
export function duplicateColumn(editor: Editor, pos: number, c: number) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const tr = editor.state.tr;
  // from the last row up, so the places still to come are not moved by what goes in before them
  for (let r = t.map.height - 1; r >= 0; r--) {
    const at = cellPos(pos, t.map, r, c), cell = tr.doc.nodeAt(at)!;
    tr.insert(at + cell.nodeSize, cell.type.create(cell.attrs, cell.content));
  }
  editor.view.dispatch(tr);
}

/** A row (column) at the table's end, the + bar's */
export function addAtEnd(editor: Editor, pos: number, what: 'row' | 'col') {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const { map } = t;
  const last = what === 'row' ? cellPos(pos, map, map.height - 1, 0) : cellPos(pos, map, 0, map.width - 1);
  editor.chain().setTextSelection(last + 2).run();
  if (what === 'row') editor.chain().addRowAfter().run(); else editor.chain().addColumnAfter().run();
  // the caret into the new row's (column's) first cell, to write in
  const n = tableAt(editor.state.doc, pos)!;
  const into = what === 'row' ? cellPos(pos, n.map, n.map.height - 1, 0) : cellPos(pos, n.map, 0, n.map.width - 1);
  editor.chain().focus().setTextSelection(into + 2).run();
}

const DOTS_V = '<svg viewBox="0 0 8 16"><circle cx="2.5" cy="4" r="1.2"/><circle cx="5.5" cy="4" r="1.2"/><circle cx="2.5" cy="8" r="1.2"/><circle cx="5.5" cy="8" r="1.2"/><circle cx="2.5" cy="12" r="1.2"/><circle cx="5.5" cy="12" r="1.2"/></svg>';
const DOTS_H = '<svg viewBox="0 0 16 8"><circle cx="4" cy="2.5" r="1.2"/><circle cx="4" cy="5.5" r="1.2"/><circle cx="8" cy="2.5" r="1.2"/><circle cx="8" cy="5.5" r="1.2"/><circle cx="12" cy="2.5" r="1.2"/><circle cx="12" cy="5.5" r="1.2"/></svg>';
const PLUS = '<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

interface Over { pos: number; table: HTMLTableElement; wrap: HTMLElement; row: number; col: number }

class Handles {
  private host: HTMLElement;
  private rowGrip = this.button('tbl-grip row', DOTS_V, 'Row: drag to move, click for its menu');
  private colGrip = this.button('tbl-grip col', DOTS_H, 'Column: drag to move, click for its menu');
  private addRow = this.button('tbl-add row', PLUS, 'Add a row');
  private addCol = this.button('tbl-add col', PLUS, 'Add a column');
  private line = document.createElement('div'); // where a dragged row (column) would go
  private cur: Over | null = null;
  private dragging: { what: 'row' | 'col'; from: number; to: number } | null = null;
  private frame = 0;

  constructor(private view: EditorView, private editor: Editor) {
    this.host = view.dom.parentElement!;
    this.line.className = 'tbl-drop';
    this.host.append(this.rowGrip, this.colGrip, this.addRow, this.addCol, this.line);
    this.host.addEventListener('mousemove', this.onMove);
    this.host.addEventListener('mouseleave', this.onLeave);
    this.rowGrip.addEventListener('mousedown', (e) => this.press(e, 'row'));
    this.colGrip.addEventListener('mousedown', (e) => this.press(e, 'col'));
    for (const b of [this.addRow, this.addCol]) b.addEventListener('mousedown', (e) => e.preventDefault());
    this.addRow.addEventListener('click', () => { const c = this.cur; if (c) { this.hide(); addAtEnd(this.editor, c.pos, 'row'); } });
    this.addCol.addEventListener('click', () => { const c = this.cur; if (c) { this.hide(); addAtEnd(this.editor, c.pos, 'col'); } });
  }

  private button(cls: string, svg: string, tip: string) {
    const b = document.createElement('button');
    Object.assign(b, { type: 'button', className: cls, innerHTML: svg, tabIndex: -1 });
    b.setAttribute('aria-label', tip);
    b.setAttribute('data-tip', tip);
    return b;
  }

  /** the table under the pointer, or by it (its handles stand just off its edges) */
  private find(x: number, y: number): Over | null {
    for (const wrap of this.view.dom.querySelectorAll<HTMLElement>('.tableWrapper')) {
      const table = wrap.querySelector('table');
      if (!table) continue;
      const r = wrap.getBoundingClientRect(), t = table.getBoundingClientRect();
      const right = Math.min(t.right, r.right);
      if (x < t.left - 28 || x > right + 28 || y < t.top - 20 || y > t.bottom + 24) continue;
      const rows = [...table.rows], cells = [...(rows[0]?.cells ?? [])];
      // the table's place: its rows' box (the node's content) starts just inside it
      const pos = this.view.posAtDOM(table.tBodies[0] ?? table, 0) - 1;
      if (this.view.state.doc.nodeAt(pos)?.type.name !== 'table' || !rows.length) continue;
      const row = rows.findIndex((tr) => y < tr.getBoundingClientRect().bottom);
      const col = cells.findIndex((c) => x < c.getBoundingClientRect().right);
      // (ponytail: a first row with merged cells counts its columns by them; TableMap if that is ever wrong)
      return { pos, table, wrap, row: row < 0 ? rows.length - 1 : row, col: col < 0 ? cells.length - 1 : col };
    }
    return null;
  }

  private onMove = (e: MouseEvent) => {
    if (this.dragging) return;
    const { clientX: x, clientY: y } = e;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => { const o = this.find(x, y); if (o) this.show(o); else this.hide(); });
  };
  private onLeave = () => { if (!this.dragging) this.hide(); };

  private show(o: Over) {
    this.cur = o;
    const host = this.host.getBoundingClientRect(), t = o.table.getBoundingClientRect(), w = o.wrap.getBoundingClientRect();
    const right = Math.min(t.right, w.right), left = Math.max(t.left, w.left);
    const row = o.table.rows[o.row].getBoundingClientRect(), cell = o.table.rows[0].cells[o.col].getBoundingClientRect();
    const put = (el: HTMLElement, box: { left: number; top: number; width?: number; height?: number }) => {
      el.style.left = `${Math.round(box.left - host.left)}px`;
      el.style.top = `${Math.round(box.top - host.top)}px`;
      if (box.width !== undefined) el.style.width = `${Math.round(box.width)}px`;
      if (box.height !== undefined) el.style.height = `${Math.round(box.height)}px`;
      el.classList.add('on');
    };
    // on the edges: the row's ⋮⋮ across the table's left border, the column's ⋯ across its top one
    put(this.rowGrip, { left: t.left - 8, top: row.top + row.height / 2 - 12 });
    if (cell.left >= left - 1 && cell.right <= right + 1) put(this.colGrip, { left: cell.left + cell.width / 2 - 12, top: t.top - 8 });
    else this.colGrip.classList.remove('on');
    put(this.addRow, { left, top: t.bottom + 3, width: right - left, height: 16 });
    put(this.addCol, { left: right + 3, top: t.top, width: 16, height: t.height });
  }
  hide() {
    this.cur = null;
    for (const el of [this.rowGrip, this.colGrip, this.addRow, this.addCol]) el.classList.remove('on');
  }

  /** a press on a handle: let go where it was pressed, the menu; moved, the row (column) is carried */
  private press(e: MouseEvent, what: 'row' | 'col') {
    const o = this.cur;
    if (!o || e.button !== 0) return;
    e.preventDefault(); // the caret stays in the note, and no text selection starts
    const start = { x: e.clientX, y: e.clientY };
    const from = what === 'row' ? o.row : o.col;
    let moved = false;
    const move = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      this.dragging = { what, from, to: this.target(o, what, ev) };
      this.drawLine(o, what, this.dragging.to);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.line.classList.remove('on');
      const d = this.dragging;
      this.dragging = null;
      if (!moved) return this.menu(o, what);
      if (!d || d.to === d.from) return;
      const cmd = what === 'row' ? moveTableRow({ from: d.from, to: d.to, pos: o.pos + 1 }) : moveTableColumn({ from: d.from, to: d.to, pos: o.pos + 1 });
      cmd(this.view.state, this.view.dispatch);
      this.view.focus();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /** the row (column) a dragged one would take the place of, by the pointer */
  private target(o: Over, what: 'row' | 'col', ev: MouseEvent): number {
    const items = what === 'row' ? [...o.table.rows] : [...o.table.rows[0].cells];
    const at = items.findIndex((el) => { const r = el.getBoundingClientRect(); return what === 'row' ? ev.clientY < r.top + r.height / 2 : ev.clientX < r.left + r.width / 2; });
    const from = what === 'row' ? o.row : o.col;
    const slot = at < 0 ? items.length : at; // the gap it goes into
    return slot > from ? slot - 1 : slot;
  }
  private drawLine(o: Over, what: 'row' | 'col', to: number) {
    const host = this.host.getBoundingClientRect(), t = o.table.getBoundingClientRect();
    const from = what === 'row' ? o.row : o.col;
    const items = what === 'row' ? [...o.table.rows] : [...o.table.rows[0].cells];
    const el = items[to].getBoundingClientRect();
    const edge = what === 'row' ? (to > from ? el.bottom : el.top) : (to > from ? el.right : el.left);
    Object.assign(this.line.style, what === 'row'
      ? { left: `${t.left - host.left}px`, top: `${edge - host.top - 1.5}px`, width: `${t.width}px`, height: '3px' }
      : { left: `${edge - host.left - 1.5}px`, top: `${t.top - host.top}px`, width: '3px', height: `${t.height}px` });
    this.line.classList.add('on');
  }

  private menu(o: Over, what: 'row' | 'col') {
    chooseLine(this.editor, o.pos, what === 'row' ? { row: o.row } : { col: o.col });
    this.view.focus();
    const c = (name: string) => () => (this.editor.chain().focus() as any)[name]().run();
    const items: MenuItem[] = what === 'row'
      ? [
        { label: 'Insert above', run: c('addRowBefore') },
        { label: 'Insert below', run: c('addRowAfter') },
        { label: 'Duplicate', run: () => duplicateRow(this.editor, o.pos, o.row) },
        { label: 'Clear contents', run: () => deleteCellSelection(this.view.state, this.view.dispatch) },
        ...(o.row === 0 ? [{ label: 'Header row', checked: o.table.rows[0].cells[0]?.tagName === 'TH', run: c('toggleHeaderRow') }] : []),
        { label: 'Merge cells', hide: !this.editor.can().mergeCells(), run: c('mergeCells') },
        { label: 'Delete row', danger: true, sep: true, run: c('deleteRow') },
      ]
      : [
        { label: 'Insert left', run: c('addColumnBefore') },
        { label: 'Insert right', run: c('addColumnAfter') },
        { label: 'Duplicate', run: () => duplicateColumn(this.editor, o.pos, o.col) },
        { label: 'Clear contents', run: () => deleteCellSelection(this.view.state, this.view.dispatch) },
        { label: 'Merge cells', hide: !this.editor.can().mergeCells(), run: c('mergeCells') },
        { label: 'Delete column', danger: true, sep: true, run: c('deleteColumn') },
      ];
    const r = (what === 'row' ? this.rowGrip : this.colGrip).getBoundingClientRect();
    this.hide();
    ui.openMenu(under(r), items);
  }

  update(view: EditorView, prev: { doc: PMNode }) {
    if (!view.state.doc.eq(prev.doc) && !this.dragging) this.hide(); // typing: they go until the pointer moves
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    this.host.removeEventListener('mousemove', this.onMove);
    this.host.removeEventListener('mouseleave', this.onLeave);
    for (const el of [this.rowGrip, this.colGrip, this.addRow, this.addCol, this.line]) el.remove();
  }
}

export const TableHandles = Extension.create({
  name: 'tableHandles',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({ view: (view) => new Handles(view, editor) })];
  },
});
