import { createDocument, type Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { getMarkdown } from './editor';
import { serializeBoard } from './board';

function sameBoards(open: PMNode, next: PMNode): PMNode {
  const boards: PMNode[] = [];
  open.descendants((n) => { if (n.type.name === 'kanban') boards.push(n); return !n.isAtom; });
  if (!boards.length) return next;
  let i = 0;
  const text = (n: PMNode) => serializeBoard(n.attrs.columns, n.attrs.template);
  const walk = (n: PMNode): PMNode => {
    if (n.type.name === 'kanban') { const was = boards[i++]; return was && text(was) === text(n) ? was : n; }
    if (n.isLeaf || n.isTextblock) return n;
    const kids: PMNode[] = [];
    n.forEach((c) => kids.push(walk(c)));
    return n.copy(Fragment.fromArray(kids));
  };
  return walk(next);
}

export function takeBody(editor: Editor, body: string): boolean {
  if (getMarkdown(editor).trimEnd() === body.trimEnd()) return false;
  const doc = editor.state.doc;
  let next = sameBoards(doc, createDocument((editor.storage as any).markdown.parser.parse(body), editor.schema, editor.options.parseOptions));
  const tail = doc.lastChild, nextTail = next.lastChild;
  if (tail?.type.name === 'paragraph' && !tail.content.size && nextTail && nextTail.type.name !== 'paragraph') {
    next = next.copy(next.content.addToEnd(tail.type.create()));
  }
  const start = doc.content.findDiffStart(next.content);
  if (start === null) return false;
  let { a: endA, b: endB } = doc.content.findDiffEnd(next.content)!;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) { endA += overlap; endB += overlap; }
  const edges: number[] = [0];
  doc.forEach((c) => edges.push(edges[edges.length - 1] + c.nodeSize));
  const from = Math.max(...edges.filter((p) => p <= start));
  const toA = Math.min(...edges.filter((p) => p >= endA)), toB = toA + endB - endA;
  const { selection } = editor.state;
  const tr = editor.state.tr.replace(from, toA, next.slice(from, toB));
  if (selection instanceof TextSelection) {
    const map = (p: number) => (p <= start ? p : p >= endA ? p + endB - endA : Math.min(p, endB));
    tr.setSelection(TextSelection.between(tr.doc.resolve(map(selection.anchor)), tr.doc.resolve(map(selection.head))));
  }
  editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
  return true;
}
