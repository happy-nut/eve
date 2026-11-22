import type { Editor } from '@tiptap/core';
import type { Mark as PMMark } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';

export const COLORS: { name: string; label: string; hex: string }[] = [
  { name: 'gray', label: 'Gray', hex: '#6f6e69' }, { name: 'brown', label: 'Brown', hex: '#8a5a44' },
  { name: 'orange', label: 'Orange', hex: '#b0500a' }, { name: 'yellow', label: 'Yellow', hex: '#8f6516' },
  { name: 'green', label: 'Green', hex: '#2f7a52' }, { name: 'blue', label: 'Blue', hex: '#1f6fa8' },
  { name: 'purple', label: 'Purple', hex: '#7b4fa8' }, { name: 'pink', label: 'Pink', hex: '#b03a78' },
  { name: 'red', label: 'Red', hex: '#c4302b' },
];

const colorOf = (m: PMMark) => {
  if (m.type.name !== 'htmlInline' || m.attrs.tag !== 'span') return undefined;
  const style = (m.attrs.attrs as [string, string][]).find(([k]) => k === 'style')?.[1] ?? '';
  return COLORS.find((c) => new RegExp(`(^|;)\\s*color:\\s*${c.hex}\\s*(;|$)`, 'i').test(style));
};
const isColor = (m: PMMark) => !!colorOf(m);

export function colorText(editor: Editor, from: number, to: number, name: string | null) {
  const { state } = editor;
  const type = state.schema.marks.htmlInline;
  const c = COLORS.find((x) => x.name === name);
  if (!type || from > to) return;
  const ink = (hex: string) => type.create({ tag: 'span', attrs: [['style', `color: ${hex}`]] });
  if (from === to) {
    const others = (state.storedMarks ?? state.selection.$from.marks()).filter((m) => !isColor(m));
    editor.view.dispatch(state.tr.setStoredMarks(c ? [...others, ink(c.hex)] : others));
    return;
  }
  const tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    for (const m of node.marks) if (isColor(m)) tr.removeMark(Math.max(from, pos), Math.min(to, pos + node.nodeSize), m);
  });
  if (c) tr.addMark(from, to, ink(c.hex));
  editor.view.dispatch(tr);
}

export function colorAt(editor: Editor): string {
  const m = editor.state.selection.$from.marks().find(isColor);
  return m ? colorOf(m)!.name : '';
}

export const inkGoesOnWhileTyping = new Plugin({
  appendTransaction(trs, before, after) {
    const ink = before.storedMarks?.find(isColor);
    if (!ink || after.storedMarks || !trs.some((t) => t.docChanged)) return null;
    const { $from, empty } = after.selection;
    if (!empty || !$from.nodeBefore?.marks.some((m) => m.eq(ink))) return null;
    return after.tr.setStoredMarks([...$from.marks().filter((m) => !isColor(m)), ink]);
  },
});

