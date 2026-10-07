import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { Plugin, Selection, TextSelection } from '@tiptap/pm/state';
import { CellSelection, cellAround, columnResizingPluginKey, fixTables, inSameTable, nextCell, tableEditingKey } from '@tiptap/pm/tables';

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
  const before = state.out;
  state.out = '';
  cell.forEach((child) => {
    if (!child.isTextblock) return;
    if (state.out) state.out += ' '; // a cell holding two paragraphs is still one line
    state.renderInline(child);
  });
  const text = state.out;
  state.out = before;
  return text.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
}

const line = (cells: string[], width: number) =>
  `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;

const tableMarkdown = {
  markdown: {
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

function lessTableEditing(plugin: Plugin): Plugin {
  const { appendTransaction, props } = plugin.spec;
  return new Plugin({
    ...plugin.spec,
    appendTransaction: (trs, old, state) => (halfInTable(state.selection) ? fixTables(state, old) : appendTransaction!(trs, old, state)),
    props: {
      ...props,
      handleKeyDown(view, e) {
        const sel = view.state.selection;
        if (e.shiftKey && sel instanceof TextSelection && !cellAround(sel.$anchor)) return false;
        if (e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && outOfTable(view, e.key === 'ArrowDown' ? 1 : -1)) return true;
        return props!.handleKeyDown!.call(plugin, view, e);
      },
    },
  });
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

export const TableNodes = [
  Table.extend({
    addStorage: () => tableMarkdown,
    addProseMirrorPlugins() {
      return [dragOutOfTable, ...(this.parent?.() ?? []).map((p) => (p.spec.key === tableEditingKey ? lessTableEditing(p) : p))];
    },
  }).configure({ resizable: true }),
  TableRow.extend({ addStorage: () => inner }),
  TableHeader.extend({ addStorage: () => inner, addAttributes() { return { ...this.parent?.(), align }; } }),
  TableCell.extend({ addStorage: () => inner, addAttributes() { return { ...this.parent?.(), align }; } }),
];
