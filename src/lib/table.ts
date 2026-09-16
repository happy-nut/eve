import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';

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
      // GFM has no headerless table: the first row is the header, whatever it holds
      state.write(line(rows[0], width));
      state.ensureNewLine();
      state.write(line(Array(width).fill('---'), width));
      state.ensureNewLine();
      for (const row of rows.slice(1)) {
        state.write(line(row, width));
        state.ensureNewLine();
      }
      state.closeBlock(node);
    },
  },
};

/** the rows and cells are written by the table itself; these keep the serializer from visiting them */
const inner = { markdown: { serialize() {} } };

export const TableNodes = [
  Table.extend({ addStorage: () => tableMarkdown }).configure({ resizable: true }),
  TableRow.extend({ addStorage: () => inner }),
  TableHeader.extend({ addStorage: () => inner }),
  TableCell.extend({ addStorage: () => inner }),
];
