import type { Editor } from '@tiptap/core';
import type { Mark as PMMark } from '@tiptap/pm/model';

/**
 * Coloured words (Notion's text colours). Written as `<span style="color: #c4302b">`: another app shows the colour the
 * style says (the light theme's shade); Eve knows its nine by their hex and draws the theme's own (app.css, --ink-*),
 * which reads in both. It is the note's inline-HTML mark (html.ts, which keeps no data-* or class of a note's span),
 * so it saves, copies and pastes as any span it keeps does.
 */
export const COLORS: { name: string; label: string; hex: string }[] = [
  { name: 'gray', label: 'Gray', hex: '#6f6e69' }, { name: 'brown', label: 'Brown', hex: '#8a5a44' },
  { name: 'orange', label: 'Orange', hex: '#b0500a' }, { name: 'yellow', label: 'Yellow', hex: '#8f6516' },
  { name: 'green', label: 'Green', hex: '#2f7a52' }, { name: 'blue', label: 'Blue', hex: '#1f6fa8' },
  { name: 'purple', label: 'Purple', hex: '#7b4fa8' }, { name: 'pink', label: 'Pink', hex: '#b03a78' },
  { name: 'red', label: 'Red', hex: '#c4302b' },
];

/** which of the nine a span's style says, if one */
const colorOf = (m: PMMark) => {
  if (m.type.name !== 'htmlInline' || m.attrs.tag !== 'span') return undefined;
  const style = (m.attrs.attrs as [string, string][]).find(([k]) => k === 'style')?.[1] ?? '';
  return COLORS.find((c) => new RegExp(`(^|;)\\s*color:\\s*${c.hex}\\s*(;|$)`, 'i').test(style));
};
const isColor = (m: PMMark) => !!colorOf(m);

/** The words from..to coloured `name`, or their colour taken off (null). One step to undo. */
export function colorText(editor: Editor, from: number, to: number, name: string | null) {
  const { state } = editor;
  const type = state.schema.marks.htmlInline;
  if (!type || from >= to) return;
  const tr = state.tr;
  // a colour replaces the one there, never sits inside it
  state.doc.nodesBetween(from, to, (node, pos) => {
    for (const m of node.marks) if (isColor(m)) tr.removeMark(Math.max(from, pos), Math.min(to, pos + node.nodeSize), m);
  });
  const c = COLORS.find((x) => x.name === name);
  if (c) tr.addMark(from, to, type.create({ tag: 'span', attrs: [['style', `color: ${c.hex}`]] }));
  editor.view.dispatch(tr);
}

/** the colour the words at the caret (or the start of the selection) are, '' for none */
export function colorAt(editor: Editor): string {
  const m = editor.state.selection.$from.marks().find(isColor);
  return m ? colorOf(m)!.name : '';
}
