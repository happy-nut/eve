import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { imageMarkdown } from './image';
import { hidePipesInMath } from './math';
import { CellSelection, cellAround, columnResizingPluginKey, deleteColumn, deleteRow, fixTables, inSameTable, nextCell, tableEditingKey } from '@tiptap/pm/tables';

/**
 * Tables. The markdown form is the GFM pipe table everyone else writes:
 *
 *   | Name | Qty |
 *   | --- | --- |
 *   | Pen | 2 |
 *
 * markdown-it reads those on its own (that is how an imported file keeps its tables); this adds the
 * way back out, because tiptap-markdown has no serializer for table nodes and would otherwise write
 * raw HTML into the note.
 */

/** One cell as a single line of markdown, marks and all (`**bold**` survives a round trip). */
function cellText(state: any, cell: PMNode): string {
  // the cell borrows the output buffer, and with it what is kept about the buffer: the quote's "> " (written at
  // what looked like the start of a line: a table in a quote got one more "> " in each cell every save) and where
  // a mark opened (tiptap-markdown fixes the mark's spaces at those offsets later, in the table's own text instead)
  const { out, delim, inlines } = state;
  state.out = '';
  state.delim = '';
  state.inlines = [];
  // a line break as `<br>` (tiptap-markdown's own way in a table): its usual backslash and newline came back as
  // "\ ", and one more backslash every save
  state.inTable = state.inCell = true;
  // every line in it, however deep: a list, quote or toggle typed into a cell is not a cell's markdown, but its
  // text left out was gone from the note at the next save while still on screen
  cell.descendants((child) => {
    if (!child.isTextblock && child.type.name !== 'image') return true;
    // a cell holding two paragraphs is still one line (the text after a picture may bring its own space)
    if (state.out && !/\s$/.test(state.out) && !/^\s/.test(child.textContent)) state.out += ' ';
    // a picture read from a cell is a block of its own in it; it goes back in the line, not left out
    if (child.isTextblock) state.renderInline(child);
    else state.out += imageMarkdown(state, child);
    return false;
  });
  const text = state.out;
  Object.assign(state, { out, delim, inlines, inTable: false, inCell: false });
  return text.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
}

const line = (cells: string[], width: number) =>
  `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;

/** a row's cells as markdown-it splits them: at each `|` not written `\|` (whose backslash goes), its outer bars off */
function cellsOf(line: string): string[] {
  const cells: string[] = [];
  let current = '', last = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '|') continue;
    if (line[i - 1] === '\\') { current += line.slice(last, i - 1); last = i; continue; }
    cells.push(current + line.slice(last, i));
    current = '';
    last = i + 1;
  }
  cells.push(current + line.slice(last));
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

const HIDDEN = ''; // a `|` inside a formula, while markdown-it splits the row
const widened = new WeakSet<object>();

/**
 * Tables as written by hand, which markdown-it reads short of what they hold: a row with more cells than the header
 * lost the ones past it (gone from the note at the next save), and a `|` inside a formula (`$|x|$`) split its cell in
 * two. A formula's bars are kept from the split, and the header gets empty cells up to the widest row, as it is
 * written back.
 */
function wideTables(md: any) {
  if (widened.has(md)) return;
  widened.add(md);
  const at = md.block.ruler.__find__('table');
  if (at < 0) return;
  const table = md.block.ruler.__rules__[at].fn;
  md.block.ruler.at('table', (state: any, start: number, end: number, silent: boolean) => {
    const src: string = state.src;
    const lineOf = (l: number) => state.src.slice(state.bMarks[l] + state.tShift[l], state.eMarks[l]);
    let patched = src;
    for (let l = start; l < end && !state.isEmpty(l); l++) {
      const from = state.bMarks[l] + state.tShift[l], to = state.eMarks[l];
      if (!src.slice(from, to).includes('$')) continue;
      patched = patched.slice(0, from) + hidePipesInMath(src.slice(from, to), HIDDEN) + patched.slice(to);
    }
    const first = state.tokens.length;
    state.src = patched;
    let ok: boolean;
    try { ok = table(state, start, end, silent); } finally { state.src = src; }
    if (!ok || silent) return ok;
    const tokens: any[] = state.tokens;
    for (let i = first; i < tokens.length; i++) if (tokens[i].type === 'inline') tokens[i].content = tokens[i].content.replaceAll(HIDDEN, '|');
    const rows: { open: number; cells: string[] }[] = [];
    for (let i = first; i < tokens.length; i++) {
      if (tokens[i].type !== 'tr_open') continue;
      state.src = patched;
      const cells = cellsOf(lineOf(tokens[i].map[0]).trim());
      state.src = src;
      rows.push({ open: i, cells: cells.map((c) => c.replaceAll(HIDDEN, '|').trim()) });
    }
    let count = 0;
    for (let i = rows[0]?.open + 1; tokens[i]?.type === 'th_open'; i += 3) count++;
    const width = Math.max(count, ...rows.map((r) => r.cells.length));
    if (width === count) return true;
    for (const { open, cells } of [...rows].reverse()) {
      const head = tokens[open + 1].type === 'th_open', level = tokens[open].level;
      let close = open + 1;
      while (tokens[close].type !== 'tr_close') close++;
      const extra: any[] = [];
      for (let k = count; k < width; k++) {
        const o = new state.Token(head ? 'th_open' : 'td_open', head ? 'th' : 'td', 1);
        const text = new state.Token('inline', '', 0);
        const c = new state.Token(head ? 'th_close' : 'td_close', head ? 'th' : 'td', -1);
        Object.assign(o, { level: level + 1, block: true });
        Object.assign(text, { level: level + 2, block: true, content: head ? '' : cells[k] ?? '', children: [], map: tokens[open].map });
        Object.assign(c, { level: level + 1, block: true });
        extra.push(o, text, c);
      }
      tokens.splice(close, 0, ...extra);
    }
    return true;
  }, { alt: md.block.ruler.__rules__[at].alt });
}

const WIDTHS = 'eve:widths';
const WIDTHS_RE = new RegExp(`^<!--\\s*${WIDTHS}((?:\\s+(?:\\d+|-))+)\\s*-->\\s*$`);

/** a table's column widths, from the comment under it (written by the table's serializer), onto its cells */
function tableWidths(md: any) {
  if (sized.has(md)) return;
  sized.add(md);
  md.core.ruler.after('block', 'eve-table-widths', (state: any) => {
    const t: any[] = state.tokens;
    for (let i = 1; i < t.length; i++) {
      const m = t[i].type === 'html_block' && t[i - 1].type === 'table_close' && t[i - 1].level === t[i].level ? WIDTHS_RE.exec(t[i].content) : null;
      if (!m) continue;
      const widths = m[1].trim().split(/\s+/).map((w) => (w === '-' ? null : +w));
      let open = i - 1;
      while (open > 0 && !(t[open].type === 'table_open' && t[open].level === t[i].level)) open--;
      let col = 0;
      for (let k = open; k < i; k++) {
        if (t[k].type === 'tr_open') col = 0;
        if (t[k].type !== 'th_open' && t[k].type !== 'td_open') continue;
        const w = widths[col++];
        if (w) t[k].attrSet('colwidth', String(w));
      }
      t.splice(i, 1);
    }
  });
}
const sized = new WeakSet<object>();

const tableMarkdown = {
  markdown: {
    parse: { setup: (md: any) => { wideTables(md); tableWidths(md); } },
    serialize(state: any, node: PMNode) {
      // the blank line that closes the block before this one, before any cell borrows the output buffer
      state.flushClose();
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(cellText(state, cell)));
        rows.push(cells);
      });
      if (!rows.length) return;
      const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
      // a column's alignment, as the first cell of it that has one says (":---", ":---:", "---:"); it was always
      // written "---", and an aligned column came back plain
      const aligns: (string | null)[] = Array(width).fill(null);
      node.forEach((row) => row.forEach((cell, _o, i) => { aligns[i] ??= cell.attrs.align ?? null; }));
      const rule = (a: string | null) => (a === 'left' ? ':---' : a === 'center' ? ':---:' : a === 'right' ? '---:' : '---');
      // GFM has no headerless table: the first row is the header, whatever it holds
      state.write(line(rows[0], width));
      state.ensureNewLine();
      state.write(line(aligns.map(rule), width));
      state.ensureNewLine();
      for (const row of rows.slice(1)) {
        state.write(line(row, width));
        state.ensureNewLine();
      }
      state.closeBlock(node);
      // the widths its columns were dragged to: markdown's table has no place for them, so a comment under it (which
      // other apps do not show) holds them, "-" for a column left to size itself
      const widths: (number | null)[] = Array(width).fill(null);
      node.forEach((row) => row.forEach((cell, _o, i) => { widths[i] ??= cell.attrs.colwidth?.[0] ?? null; }));
      if (widths.some((w) => w)) {
        state.write(`<!-- ${WIDTHS} ${widths.map((w) => w || '-').join(' ')} -->`);
        state.closeBlock(node);
      }
    },
  },
};

/** a cell's alignment, as markdown's ":---:" gives it (markdown-it writes it as the cell's text-align) */
const align = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => (['left', 'center', 'right'].includes(el.style.textAlign) ? el.style.textAlign : null),
  renderHTML: (a: { align?: string | null }) => (a.align ? { style: `text-align: ${a.align}` } : {}),
};

/** the rows and cells are written by the table itself; these keep the serializer from visiting them */
const inner = { markdown: { serialize() {} } };

/** a text selection with one end in a table cell and the other out of the table */
const halfInTable = (sel: Selection) => sel instanceof TextSelection && !cellAround(sel.$from) !== !cellAround(sel.$to);

/**
 * tableEditing, with a text selection that runs out of a table left alone. It folds one that ends at the very
 * start of a line in another cell or out of the table back into its first cell (it takes that for a triple-click
 * in a cell), so a drag to the start of the line below stayed in the cell. ⇧↑ / ⇧↓ into a table from above or
 * below made the selection whole cells, dropping where it started; now it runs on through the table as text.
 * And ⇧↓ in the last row (⇧↑ in the first) did nothing, WebKit only stepping to the next cell: it now takes the
 * selection out to the next line, from the start of the cell it began in (its end, going up).
 */
/** ⇧↓ / ⇧↑ from the table's last / first row: the selection out to the line after / before the table */
function outOfTable(view: EditorView, dir: 1 | -1): boolean {
  const { selection: sel, doc } = view.state;
  const cells = sel instanceof CellSelection;
  const $cell = cells ? sel.$headCell : cellAround(sel.$head);
  if (!$cell || nextCell($cell, 'vert', dir)) return false;
  const edge = ($c: ResolvedPos, d: number) => Selection.near(doc.resolve(d > 0 ? $c.pos + $c.nodeAfter!.nodeSize : $c.pos), -d).head;
  // a text selection only once it is on the cell's last (first) line
  if (!cells && (doc.resolve(edge($cell, dir)).parent !== sel.$head.parent || !view.endOfTextblock(dir > 0 ? 'down' : 'up'))) return false;
  const head = Selection.near(doc.resolve(dir > 0 ? $cell.after(-1) : $cell.before(-1)), dir).head;
  if (head > $cell.before(-1) && head < $cell.after(-1)) return false; // nothing past the table
  const anchor = cells ? edge(sel.$anchorCell, -dir) : sel.anchor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, anchor, head)).scrollIntoView());
  return true;
}

/**
 * A selection from text above a table into a cell (or from a cell to text below) cleared: the text out of the table
 * goes, the cells it covers are emptied, every row and column stays. Deleted as one range, the cells taken out left
 * their rows short, and fixTables filled them from the rows below: rows were lost, cells moved up into the header.
 * The caret ends where the selection began, `text` typed there; or, `out`, on the side out of the table.
 */
function clearHalf(view: EditorView, text = '', out = false) {
  view.dispatch(cleared(view.state, text, out).scrollIntoView());
  return true;
}

function cleared(state: EditorState, text: string, out: boolean): Transaction {
  const { from, to } = state.selection;
  const $cell = cellAround(state.selection.$to) ?? cellAround(state.selection.$from)!;
  const start = $cell.before(-1), end = $cell.after(-1);
  // the part out of the table, then the part of each cell in the selection; the last first, so the rest stay put
  const parts: [number, number][] = [start > from ? [from, start] : [end, to]];
  const lo = Math.max(from, start), hi = Math.min(to, end);
  state.doc.nodesBetween(lo, hi, (node, pos) => {
    if (!/^table(Cell|Header)$/.test(node.type.name)) return true;
    const a = Math.max(lo, pos + 1), b = Math.min(hi, pos + node.nodeSize - 1);
    if (a < b) parts.push([a, b]);
    return false;
  });
  const tr = state.tr;
  for (const [a, b] of parts.sort((x, y) => y[0] - x[0])) {
    const $a = tr.doc.resolve(a);
    // a whole cell keeps an empty line: a cell cannot be left with none
    if (/^table(Cell|Header)$/.test($a.parent.type.name) && b === $a.end()) tr.replaceWith(a, b, state.schema.nodes.paragraph.create());
    else tr.delete(a, b);
  }
  const below = out && start <= from ? Selection.findFrom(tr.doc.resolve(tr.mapping.map(end, -1)), 1, true) : null;
  tr.setSelection(below ?? TextSelection.create(tr.doc, tr.mapping.map(from, -1)));
  if (text) tr.insertText(text);
  return tr;
}

/**
 * A paste over a selection half in a table: cleared as ⌫ clears it, then what is pasted goes in out of the table
 * (in a cell, lines and blocks have no place). Pasted over as one range, the table lost rows as with a delete.
 */
export function clearForPaste(view: EditorView) {
  if (!halfInTable(view.state.selection)) return;
  const tr = cleared(view.state, '', true);
  view.dispatch(tr);
  // one undo takes back both: the paste is history's next step after the clearing (unmarked, a paste below the table
  // was a step of its own, not touching what was cleared). It is put in at once, in this same event.
  pasting = tr;
  queueMicrotask(() => { pasting = null; });
}
let pasting: Transaction | null = null;
/** marks the paste after clearForPaste's clearing as part of it, for the history */
const pasteAfterClear = new Plugin({
  filterTransaction: (tr) => {
    if (pasting && tr !== pasting && tr.docChanged && !tr.getMeta('appendedTransaction')) tr.setMeta('appendedTransaction', pasting);
    return true;
  },
});

/** a line put above a table that opens the note, the caret on it: with nothing above the table, no key could make one */
function lineAbove(view: EditorView) {
  const tr = view.state.tr.insert(0, view.state.schema.nodes.paragraph.create());
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1)).scrollIntoView());
  return true;
}

/** the caret's cell, in the first row of a table opening the note */
function topRow(view: EditorView) {
  const sel = view.state.selection;
  const $cell = sel instanceof TextSelection && sel.empty ? cellAround(sel.$head) : null;
  return !!$cell && $cell.before(1) === 0 && $cell.index(1) === 0;
}

/**
 * Enter in a table cell: a line break in it (`<br>` in the note, as ⇧Enter). The stock Enter split the cell into two
 * lines, which a cell's one line of markdown cannot hold: the second ran into the first on save ("a1 next"). At the
 * very start of a table opening the note, the line above it instead (no line break leads a cell).
 */
export function cellEnter(view: EditorView, hardBreak: () => boolean): boolean {
  const sel = view.state.selection;
  if (sel instanceof CellSelection || !cellAround(sel.$head)) return false;
  if (topRow(view) && sel.head === Selection.atStart(view.state.doc).head) return lineAbove(view);
  return hardBreak();
}

/** ↑ in the first row of a table opening the note: a line above it, as ↑ makes one over code opening the note */
export const upAboveTable = (view: EditorView) => topRow(view) && view.endOfTextblock('up') && lineAbove(view);

function lessTableEditing(plugin: Plugin): Plugin {
  const { appendTransaction, props } = plugin.spec;
  return new Plugin({
    ...plugin.spec,
    appendTransaction: (trs, old, state) => (halfInTable(state.selection) ? fixTables(state, old) : appendTransaction!(trs, old, state)),
    props: {
      ...props,
      // a cut of such a selection: copied as any, then cleared as ⌫ clears it (the stock cut deleted it as one range)
      handleDOMEvents: {
        ...props?.handleDOMEvents,
        cut: (view, e) => {
          const data = e.clipboardData;
          if (!halfInTable(view.state.selection) || !data) return false;
          const { dom, text } = view.serializeForClipboard(view.state.selection.content());
          e.preventDefault();
          data.clearData();
          data.setData('text/html', dom.innerHTML);
          data.setData('text/plain', text);
          return clearHalf(view);
        },
      },
      handleTextInput: (view, _from, _to, text) => halfInTable(view.state.selection) && clearHalf(view, text),
      handleKeyDown(view, e) {
        const sel = view.state.selection;
        if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.altKey && !e.ctrlKey && halfInTable(sel)) return clearHalf(view);
        if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.altKey && !e.ctrlKey && dropEmptyLines(view)) return true;
        if (e.shiftKey && sel instanceof TextSelection && !cellAround(sel.$anchor)) return false;
        if (e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && outOfTable(view, e.key === 'ArrowDown' ? 1 : -1)) return true;
        return props!.handleKeyDown!.call(plugin, view, e);
      },
    },
  });
}

/**
 * ⌫ (or Delete) on whole rows or columns chosen with nothing in them: they go, as with the table's own Delete row /
 * Delete column. Chosen with words in them, ⌫ empties them as it always did (a second ⌫ then takes them out). The
 * header row emptied and taken out, the row under it is the header (a markdown table always has one). The whole
 * table is prosemirror-tables' own: it goes.
 */
function dropEmptyLines(view: EditorView): boolean {
  const sel = view.state.selection;
  if (!(sel instanceof CellSelection) || (sel.isRowSelection() && sel.isColSelection())) return false;
  let empty = true;
  sel.forEachCell((cell) => { if (cell.textContent.trim() || cell.content.childCount > 1) empty = false; });
  if (!empty) return false;
  if (sel.isRowSelection()) {
    const header = Math.min(sel.$anchorCell.index(-1), sel.$headCell.index(-1)) === 0;
    // one step for ⌘Z: the row taken out and the new header made in the same transaction
    return deleteRow(view.state, (tr) => {
      const $cell = header ? cellAround(tr.selection.$from) : null;
      const table = $cell?.node(-1);
      if ($cell && table?.firstChild && table.firstChild.firstChild?.type.name !== 'tableHeader') {
        const th = tr.doc.type.schema.nodes.tableHeader;
        let pos = $cell.before(-1) + 2; // the first row's first cell
        table.firstChild.forEach((c) => { tr.setNodeMarkup(pos, th, c.attrs); pos += c.nodeSize; });
      }
      view.dispatch(tr);
    });
  }
  return sel.isColSelection() && deleteColumn(view.state, view.dispatch);
}

/**
 * prosemirror-tables turns any drag that leaves its first cell into a cell selection and keeps it in the table,
 * so a drag from a cell to the text below never got out. Once the pointer is out of the table this makes the drag
 * a text selection from where it started, like a drag across any other block; back in the table it is a cell
 * selection again. It runs just before tableEditing's own mousemove (it is the plugin before it, so its listener
 * goes first) and marks the drag as tableEditing's: that keeps tableEditing from starting a cell selection of
 * its own, and keeps ProseMirror from reading the browser's selection over this one.
 */
const dragOutOfTable = new Plugin({
  props: {
    handleDOMEvents: {
      mousedown(view, down) {
        if (down.button !== 0 || down.shiftKey || down.ctrlKey || down.metaKey) return false;
        if ((columnResizingPluginKey.getState(view.state)?.activeHandle ?? -1) > -1) return false; // a column being resized
        const start = view.posAtCoords({ left: down.clientX, top: down.clientY });
        const $cell = start && cellAround(view.state.doc.resolve(start.pos));
        if (!start || !$cell) return false;
        const anchor = start.pos, cell = $cell.pos;
        const move = (e: MouseEvent) => {
          const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
          if (!at) return;
          const { doc } = view.state;
          const $in = cellAround(doc.resolve(at.inside >= 0 ? at.inside : at.pos)) ?? cellAround(doc.resolve(at.pos));
          if ($in && inSameTable($in, doc.resolve(cell))) return;
          // beside a line, between blocks: the line the pointer is on
          const head = Selection.near(doc.resolve(at.pos), at.pos > anchor ? 1 : -1).head;
          const sel = TextSelection.create(doc, anchor, head);
          if (!sel.eq(view.state.selection) || tableEditingKey.getState(view.state) == null) {
            view.dispatch(view.state.tr.setSelection(sel).setMeta(tableEditingKey, cell));
          }
        };
        const up = () => {
          view.root.removeEventListener('mousemove', move as EventListener);
          view.root.removeEventListener('mouseup', up);
          view.root.removeEventListener('dragstart', up);
        };
        view.root.addEventListener('mousemove', move as EventListener);
        view.root.addEventListener('mouseup', up);
        view.root.addEventListener('dragstart', up);
        return false;
      },
    },
  },
});

/**
 * A table's columns stay as wide as they are while its cells are written in, as Notion's do. Opened, a table is laid
 * out by what its cells hold (a column of long words wide, one of numbers narrow); then those widths are held, so a
 * cell's words wrap in it, where they used to push its column wider and squeeze the others under the caret. Held on
 * screen only, never in the note (a GFM table has no widths to keep): a window or pane of another width, a column
 * added or taken away, and the table is laid out afresh. One sized by hand (colwidth) keeps the widths it was given.
 */
interface Pin { pos: number; widths: number[]; total: number }
const pinKey = new PluginKey<Pin[]>('tableWidths');
const sizedByHand = (table: PMNode) => { let by = false; table.descendants((n) => { if (n.attrs.colwidth) by = true; return !by; }); return by; };
const fits = (table: PMNode, pin: Pin) => table.type.name === 'table' && table.firstChild?.childCount === pin.widths.length && !sizedByHand(table);

const holdWidths = new Plugin<Pin[]>({
  key: pinKey,
  state: {
    init: () => [],
    apply: (tr, pins) => tr.getMeta(pinKey) ?? (tr.docChanged
      ? pins.flatMap((p) => { const r = tr.mapping.mapResult(p.pos, 1); return r.deleted ? [] : [{ ...p, pos: r.pos }]; })
      : pins),
  },
  props: {
    decorations(state) {
      const decos: Decoration[] = [];
      for (const pin of pinKey.getState(state) ?? []) {
        const table = state.doc.nodeAt(pin.pos);
        if (!table || !fits(table, pin)) continue;
        decos.push(Decoration.node(pin.pos, pin.pos + table.nodeSize, { class: 'held', style: `--held-w: ${pin.total}px` }));
        let at = pin.pos + 2; // into the table, into its first row
        table.firstChild!.forEach((cell, _o, i) => { decos.push(Decoration.node(at, at + cell.nodeSize, { style: `width: ${pin.widths[i]}px` })); at += cell.nodeSize; });
      }
      return DecorationSet.create(state.doc, decos);
    },
  },
  view(view) {
    let frame = 0, width = view.dom.clientWidth;
    // the tables not held yet, measured as the page laid them out, and held from then on
    const measure = () => {
      frame = 0;
      const pins = pinKey.getState(view.state) ?? [];
      const next = pins.filter((p) => { const t = view.state.doc.nodeAt(p.pos); return t && fits(t, p); });
      let added = false;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'table') return true;
        if (next.some((p) => p.pos === pos) || sizedByHand(node)) return false;
        const wrap = view.nodeDOM(pos) as HTMLElement | null, row = wrap?.querySelector('tr');
        const total = wrap?.querySelector('table')?.getBoundingClientRect().width ?? 0;
        if (!row || !total) return false; // not laid out (a closed toggle, a test's page)
        next.push({ pos, widths: [...row.children].map((c) => Math.round(c.getBoundingClientRect().width)), total: Math.round(total) });
        added = true;
        return false;
      });
      if (added || next.length !== pins.length) view.dispatch(view.state.tr.setMeta(pinKey, next).setMeta('addToHistory', false));
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(measure); };
    // another width for the note: every table laid out afresh for the room there is now
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (view.dom.clientWidth === width) return;
      width = view.dom.clientWidth;
      view.dispatch(view.state.tr.setMeta(pinKey, []).setMeta('addToHistory', false));
      soon();
    });
    resized?.observe(view.dom);
    soon();
    return {
      update: (v, prev) => { if (v.state.doc !== prev.doc || pinKey.getState(v.state) !== pinKey.getState(prev)) soon(); },
      destroy: () => { cancelAnimationFrame(frame); resized?.disconnect(); },
    };
  },
});

export const TableNodes = [
  Table.extend({
    addStorage: () => tableMarkdown,
    addProseMirrorPlugins() {
      return [dragOutOfTable, pasteAfterClear, holdWidths, ...(this.parent?.() ?? []).map((p) => (p.spec.key === tableEditingKey ? lessTableEditing(p) : p))];
    },
  }).configure({ resizable: true }),
  TableRow.extend({ addStorage: () => inner }),
  TableHeader.extend({ addStorage: () => inner, addAttributes() { return { ...this.parent?.(), align }; } }),
  TableCell.extend({ addStorage: () => inner, addAttributes() { return { ...this.parent?.(), align }; } }),
];
