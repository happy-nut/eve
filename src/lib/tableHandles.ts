import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { CellSelection, TableMap, deleteCellSelection, moveTableColumn, moveTableRow } from '@tiptap/pm/tables';
import type { Editor } from '@tiptap/core';
import { ui, under, type MenuItem } from './ui.svelte';
import { ICONS } from './lineIcons';
import { followPointer } from './followPointer';

function tableAt(doc: PMNode, pos: number) {
  const node = doc.nodeAt(pos);
  return node?.type.name === 'table' ? { node, map: TableMap.get(node) } : null;
}
const cellPos = (pos: number, map: TableMap, r: number, c: number) => pos + 1 + map.map[r * map.width + c];

export function chooseLine(editor: Editor, pos: number, line: { row?: number; col?: number }) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const { map } = t, doc = editor.state.doc;
  const sel = line.row !== undefined
    ? CellSelection.rowSelection(doc.resolve(cellPos(pos, map, line.row, 0)), doc.resolve(cellPos(pos, map, line.row, map.width - 1)))
    : CellSelection.colSelection(doc.resolve(cellPos(pos, map, 0, line.col!)), doc.resolve(cellPos(pos, map, map.height - 1, line.col!)));
  editor.view.dispatch(editor.state.tr.setSelection(sel));
}

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

export function duplicateColumn(editor: Editor, pos: number, c: number) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const tr = editor.state.tr;
  for (let r = t.map.height - 1; r >= 0; r--) {
    const at = cellPos(pos, t.map, r, c), cell = tr.doc.nodeAt(at)!;
    tr.insert(at + cell.nodeSize, cell.type.create(cell.attrs, cell.content));
  }
  editor.view.dispatch(tr);
}

export function addAtEnd(editor: Editor, pos: number, what: 'row' | 'col') {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  if (what === 'col') addColumnAt(editor, pos, t.map.width); else addRowAt(editor, pos, t.map.height);
}

export function addRowAt(editor: Editor, pos: number, edge: number) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  editor.chain().setTextSelection(cellPos(pos, t.map, edge - 1, 0) + 2).run();
  editor.chain().addRowAfter().run();
  const n = tableAt(editor.state.doc, pos)!;
  editor.chain().focus().setTextSelection(cellPos(pos, n.map, edge, 0) + 2).run();
}

export function addColumnAt(editor: Editor, pos: number, edge: number) {
  const t = tableAt(editor.state.doc, pos);
  if (!t) return;
  const before = edge < t.map.width;
  editor.chain().setTextSelection(cellPos(pos, t.map, 0, before ? edge : t.map.width - 1) + 2).run();
  if (before) editor.chain().addColumnBefore().run(); else editor.chain().addColumnAfter().run();
  const n = tableAt(editor.state.doc, pos)!;
  editor.chain().focus().setTextSelection(cellPos(pos, n.map, 0, edge) + 2).run();
}

const DOTS_V = '<svg viewBox="0 0 8 16"><circle cx="2.5" cy="4" r="1.2"/><circle cx="5.5" cy="4" r="1.2"/><circle cx="2.5" cy="8" r="1.2"/><circle cx="5.5" cy="8" r="1.2"/><circle cx="2.5" cy="12" r="1.2"/><circle cx="5.5" cy="12" r="1.2"/></svg>';
const DOTS_H = '<svg viewBox="0 0 16 8"><circle cx="4" cy="2.5" r="1.2"/><circle cx="4" cy="5.5" r="1.2"/><circle cx="8" cy="2.5" r="1.2"/><circle cx="8" cy="5.5" r="1.2"/><circle cx="12" cy="2.5" r="1.2"/><circle cx="12" cy="5.5" r="1.2"/></svg>';
const PLUS = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${ICONS.plus}</svg>`;

interface Over { pos: number; table: HTMLTableElement; wrap: HTMLElement; row: number; col: number; cellEl?: HTMLTableCellElement; x: number; y: number }
const EDGE_REACH = 14;
const ROW_GRIP = { width: 12, height: 24 }, COL_GRIP = { width: 24, height: 16 };
const ADD_HERE_SIZE = 16, ADD_BAR_THICKNESS = 16, ADD_BAR_GAP = 3;

const tablePosOf = (view: EditorView, table: HTMLTableElement): number => view.posAtDOM(table.tBodies[0] ?? table, 0) - 1;
const columnAt = (view: EditorView, map: TableMap, tablePos: number, cellEl: HTMLTableCellElement): number =>
  map.colCount(view.posAtDOM(cellEl, 0) - 1 - (tablePos + 1));

class Handles {
  private host: HTMLElement;
  private rowGrip = this.button('tbl-grip row', DOTS_V, 'Row: drag to move, click for its menu');
  private colGrip = this.button('tbl-grip col', DOTS_H, 'Column: drag to move, click for its menu');
  private addRow = this.button('tbl-add row', PLUS, 'Add a row');
  private addCol = this.button('tbl-add col', PLUS, 'Add a column');
  private addHere = this.button('tbl-add here', PLUS, 'Add here');
  private here: { what: 'row' | 'col'; edge: number } = { what: 'col', edge: 0 };
  private line = document.createElement('div');
  private cur: Over | null = null;
  private dragging: { what: 'row' | 'col'; from: number; to: number } | null = null;
  private frame = 0;

  constructor(private view: EditorView, private editor: Editor) {
    this.host = view.dom.parentElement!;
    this.line.className = 'tbl-drop';
    this.host.append(this.rowGrip, this.colGrip, this.addRow, this.addCol, this.addHere, this.line);
    this.host.addEventListener('mousemove', this.onMove);
    this.host.addEventListener('mouseleave', this.onLeave);
    this.rowGrip.addEventListener('pointerdown', (e) => this.press(e, 'row'));
    this.colGrip.addEventListener('pointerdown', (e) => this.press(e, 'col'));
    for (const b of [this.rowGrip, this.colGrip, this.addRow, this.addCol, this.addHere]) b.addEventListener('mousedown', (e) => e.preventDefault());
    this.addRow.addEventListener('click', () => { const c = this.cur; if (c) { this.hide(); addAtEnd(this.editor, c.pos, 'row'); } });
    this.addCol.addEventListener('click', () => { const c = this.cur; if (c) { this.hide(); addAtEnd(this.editor, c.pos, 'col'); } });
    this.addHere.addEventListener('click', () => {
      const c = this.cur, { what, edge } = this.here;
      if (!c) return;
      this.hide();
      if (what === 'col') addColumnAt(this.editor, c.pos, edge); else addRowAt(this.editor, c.pos, edge);
    });
    this.addHere.addEventListener('mouseenter', () => { if (this.cur) this.drawEdge(this.cur); });
    this.addHere.addEventListener('mouseleave', () => this.line.classList.remove('on'));
  }

  private button(cls: string, svg: string, tip: string) {
    const b = document.createElement('button');
    Object.assign(b, { type: 'button', className: cls, innerHTML: svg, tabIndex: -1 });
    b.setAttribute('aria-label', tip);
    b.setAttribute('data-tip', tip);
    return b;
  }

  private find(x: number, y: number): Over | null {
    for (const wrap of this.view.dom.querySelectorAll<HTMLElement>('.tableWrapper')) {
      const table = wrap.querySelector('table');
      if (!table) continue;
      const r = wrap.getBoundingClientRect(), t = table.getBoundingClientRect();
      const right = Math.min(t.right, r.right);
      if (x < t.left - 28 || x > right + 28 || y < t.top - 20 || y > t.bottom + 24) continue;
      const rows = [...table.rows], cells = [...(rows[0]?.cells ?? [])];
      const pos = tablePosOf(this.view, table);
      if (this.view.state.doc.nodeAt(pos)?.type.name !== 'table' || !rows.length) continue;
      const row = rows.findIndex((tr) => y < tr.getBoundingClientRect().bottom);
      const cellEl = cells.find((c) => x < c.getBoundingClientRect().right) ?? cells[cells.length - 1];
      const map = TableMap.get(this.view.state.doc.nodeAt(pos)!);
      const col = cellEl ? columnAt(this.view, map, pos, cellEl) : 0;
      return { pos, table, wrap, row: row < 0 ? rows.length - 1 : row, col, cellEl, x, y };
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
    const row = o.table.rows[o.row].getBoundingClientRect(), cell = (o.cellEl ?? o.table.rows[0].cells[0]).getBoundingClientRect();
    const put = (el: HTMLElement, box: { left: number; top: number; width?: number; height?: number }) => {
      el.style.left = `${Math.round(box.left - host.left)}px`;
      el.style.top = `${Math.round(box.top - host.top)}px`;
      if (box.width !== undefined) el.style.width = `${Math.round(box.width)}px`;
      if (box.height !== undefined) el.style.height = `${Math.round(box.height)}px`;
      el.classList.add('on');
    };
    put(this.rowGrip, { left: left - ROW_GRIP.width / 2, top: row.top + row.height / 2 - ROW_GRIP.height / 2 });
    if (cell.left >= left - 1 && cell.right <= right + 1) put(this.colGrip, { left: cell.left + cell.width / 2 - COL_GRIP.width / 2, top: t.top - COL_GRIP.height / 2 });
    else this.colGrip.classList.remove('on');
    put(this.addRow, { left, top: t.bottom + ADD_BAR_GAP, width: right - left, height: ADD_BAR_THICKNESS });
    put(this.addCol, { left: right + ADD_BAR_GAP, top: t.top, width: ADD_BAR_THICKNESS, height: t.height });
    const cols = [...o.table.rows[0].cells].map((c, i, all) => (i ? all[i - 1].getBoundingClientRect().right : c.getBoundingClientRect().left));
    const rows = [...o.table.rows].map((r) => r.getBoundingClientRect().top).slice(1);
    const nearest = (edges: number[], at: number) => edges.reduce((b, e, i) => (Math.abs(e - at) < Math.abs(edges[b] - at) ? i : b), 0);
    const c = nearest(cols, o.x), r = rows.length ? nearest(rows, o.y) : -1;
    if (Math.abs(o.y - t.top) <= EDGE_REACH && Math.abs(cols[c] - o.x) <= EDGE_REACH && cols[c] >= left - 1) {
      this.here = { what: 'col', edge: c };
      put(this.addHere, { left: cols[c] - ADD_HERE_SIZE / 2, top: t.top - ADD_HERE_SIZE / 2 });
      this.colGrip.classList.remove('on');
      if (c === 0) this.rowGrip.classList.remove('on');
    } else if (r >= 0 && Math.abs(o.x - left) <= EDGE_REACH && Math.abs(rows[r] - o.y) <= EDGE_REACH) {
      this.here = { what: 'row', edge: r + 1 };
      put(this.addHere, { left: left - ADD_HERE_SIZE / 2, top: rows[r] - ADD_HERE_SIZE / 2 });
      this.rowGrip.classList.remove('on');
    } else this.addHere.classList.remove('on');
  }
  hide() {
    this.cur = null;
    for (const el of [this.rowGrip, this.colGrip, this.addRow, this.addCol, this.addHere, this.line]) el.classList.remove('on');
  }

  private press(e: PointerEvent, what: 'row' | 'col') {
    const o = this.cur;
    if (!o || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    const from = what === 'row' ? o.row : o.col;
    let moved = false;
    const move = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      this.dragging = { what, from, to: this.target(o, what, ev) };
      this.drawLine(o, what, this.dragging.to);
    };
    const end = () => {
      this.line.classList.remove('on');
      const d = this.dragging;
      this.dragging = null;
      return d;
    };
    const up = () => {
      const d = end();
      if (!moved) return this.menu(o, what);
      if (!d || d.to === d.from) return;
      // its table chosen first: the moves read the selection's table, and with the caret elsewhere nothing moved
      chooseLine(this.editor, o.pos, what === 'row' ? { row: d.from } : { col: d.from });
      const cmd = what === 'row' ? moveTableRow({ from: d.from, to: d.to, pos: o.pos + 1 }) : moveTableColumn({ from: d.from, to: d.to, pos: o.pos + 1 });
      cmd(this.view.state, this.view.dispatch);
      this.view.focus();
    };
    followPointer({ move, up, cancel: end });
  }

  private target(o: Over, what: 'row' | 'col', ev: MouseEvent): number {
    const items = what === 'row' ? [...o.table.rows] : [...o.table.rows[0].cells];
    const at = items.findIndex((el) => { const r = el.getBoundingClientRect(); return what === 'row' ? ev.clientY < r.top + r.height / 2 : ev.clientX < r.left + r.width / 2; });
    const from = what === 'row' ? o.row : o.col;
    const slot = at < 0 ? items.length : at;
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

  private drawEdge(o: Over) {
    const host = this.host.getBoundingClientRect(), t = o.table.getBoundingClientRect(), { what, edge } = this.here;
    if (what === 'col') {
      const cells = o.table.rows[0].cells, x = edge ? cells[edge - 1].getBoundingClientRect().right : cells[0].getBoundingClientRect().left;
      Object.assign(this.line.style, { left: `${x - host.left - 1.5}px`, top: `${t.top - host.top}px`, width: '3px', height: `${t.height}px` });
    } else {
      const y = o.table.rows[edge].getBoundingClientRect().top, w = o.wrap.getBoundingClientRect();
      const left = Math.max(t.left, w.left), right = Math.min(t.right, w.right);
      Object.assign(this.line.style, { left: `${left - host.left}px`, top: `${y - host.top - 1.5}px`, width: `${right - left}px`, height: '3px' });
    }
    this.line.classList.add('on');
  }

  private menu(o: Over, what: 'row' | 'col') {
    chooseLine(this.editor, o.pos, what === 'row' ? { row: o.row } : { col: o.col });
    this.view.focus();
    const c = (name: string) => () => (this.editor.chain().focus() as any)[name]().run();
    // (no Merge here: a markdown table has no merged cells, and saved, a merge scrambled the columns; a table that has
    // a cell spanning two, from elsewhere, is not duplicated by row or column, which split it across copies)
    let spans = false;
    this.view.state.doc.nodeAt(o.pos)?.descendants((n) => { if ((n.attrs.colspan ?? 1) > 1 || (n.attrs.rowspan ?? 1) > 1) spans = true; return !spans; });
    const items: MenuItem[] = what === 'row'
      ? [
        { label: 'Insert above', run: c('addRowBefore') },
        { label: 'Insert below', run: c('addRowAfter') },
        { label: 'Duplicate', hide: spans, run: () => duplicateRow(this.editor, o.pos, o.row) },
        { label: 'Clear contents', run: () => deleteCellSelection(this.view.state, this.view.dispatch) },
        ...(o.row === 0 ? [{ label: 'Header row', checked: o.table.rows[0].cells[0]?.tagName === 'TH', run: c('toggleHeaderRow') }] : []),
        { label: 'Delete row', danger: true, sep: true, run: c('deleteRow') },
      ]
      : [
        { label: 'Insert left', run: c('addColumnBefore') },
        { label: 'Insert right', run: c('addColumnAfter') },
        { label: 'Duplicate', hide: spans, run: () => duplicateColumn(this.editor, o.pos, o.col) },
        { label: 'Clear contents', run: () => deleteCellSelection(this.view.state, this.view.dispatch) },
        { label: 'Delete column', danger: true, sep: true, run: c('deleteColumn') },
      ];
    const r = (what === 'row' ? this.rowGrip : this.colGrip).getBoundingClientRect();
    this.hide();
    ui.openMenu(under(r), items);
  }

  update(view: EditorView, prev: { doc: PMNode }) {
    if (!view.state.doc.eq(prev.doc) && !this.dragging) this.hide();
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    this.host.removeEventListener('mousemove', this.onMove);
    this.host.removeEventListener('mouseleave', this.onLeave);
    for (const el of [this.rowGrip, this.colGrip, this.addRow, this.addCol, this.addHere, this.line]) el.remove();
  }
}

export const TableHandles = Extension.create({
  name: 'tableHandles',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({ view: (view) => new Handles(view, editor) })];
  },
});
