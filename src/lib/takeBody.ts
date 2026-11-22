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

function keepTrailingParagraph(open: PMNode, next: PMNode): PMNode {
  const tail = open.lastChild, nextTail = next.lastChild;
  if (tail?.type.name === 'paragraph' && !tail.content.size && nextTail && nextTail.type.name !== 'paragraph') {
    return next.copy(next.content.addToEnd(tail.type.create()));
  }
  return next;
}

function changedBlockRange(open: PMNode, next: PMNode) {
  const start = open.content.findDiffStart(next.content);
  if (start === null) return null;
  let { a: endA, b: endB } = open.content.findDiffEnd(next.content)!;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) { endA += overlap; endB += overlap; }
  const edges: number[] = [0];
  open.forEach((c) => edges.push(edges[edges.length - 1] + c.nodeSize));
  const from = Math.max(...edges.filter((p) => p <= start));
  const toA = Math.min(...edges.filter((p) => p >= endA)), toB = toA + endB - endA;
  return { start, endA, endB, from, toA, toB };
}

const caretAcrossDiff = (p: number, start: number, endA: number, endB: number) =>
  p <= start ? p : p >= endA ? p + endB - endA : Math.min(p, endB);

export const sameBody = (a: string, b: string) => a.trimEnd() === b.trimEnd();

export function takeBody(editor: Editor, body: string): boolean {
  if (sameBody(getMarkdown(editor), body)) return false;
  const doc = editor.state.doc;
  const next = keepTrailingParagraph(doc, sameBoards(doc, createDocument((editor.storage as any).markdown.parser.parse(body), editor.schema, editor.options.parseOptions)));
  const range = changedBlockRange(doc, next);
  if (!range) return false;
  const { start, endA, endB, from, toA, toB } = range;
  const { selection } = editor.state;
  const tr = editor.state.tr.replace(from, toA, next.slice(from, toB));
  if (selection instanceof TextSelection) {
    const map = (p: number) => caretAcrossDiff(p, start, endA, endB);
    tr.setSelection(TextSelection.between(tr.doc.resolve(map(selection.anchor)), tr.doc.resolve(map(selection.head))));
  }
  editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
  return true;
}
