import { createDocument, type Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { getMarkdown } from './editor';
import { serializeBoard } from './board';

/**
 * `next` with each board written the same as the one at its place in `open` taken as that board. A board read again
 * gets new ids for its columns and cards (they are the editor's, not in the note): it never came back equal, and
 * everything from the first change to the board was put back, the caret moved with it and the board drawn anew.
 */
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

/**
 * A note's body that came in from outside while it is open (sync: another device saved it) put into its editor:
 * only the stretch that differs, the caret kept by the text it was in. False when there was nothing to change.
 * (Editor.svelte; caretSync.dom.test.ts holds it to every kind of block, alone and nested.)
 */
export function takeBody(editor: Editor, body: string): boolean {
  if (getMarkdown(editor).trimEnd() === body.trimEnd()) return false;
  // only the stretch that differs is replaced: the caret stays by the text it was in (put back at the same
  // offset, it landed inside a line the other device added above, and the next keys went into that), and the
  // writer's own steps before it can still be undone. Not a step of theirs to undo either: ⌘Z took the other
  // device's edit back out, and saved that.
  const doc = editor.state.doc;
  let next = sameBoards(doc, createDocument((editor.storage as any).markdown.parser.parse(body), editor.schema, editor.options.parseOptions));
  // the empty line the editor keeps after a last block that is not a line of text (a picture, a toggle, a list) is
  // not in the note read again: without it the two never ended alike, and everything from the change to the end
  // was replaced (the caret landed on the picture, and the next key replaced it)
  const tail = doc.lastChild, nextTail = next.lastChild;
  if (tail?.type.name === 'paragraph' && !tail.content.size && nextTail && nextTail.type.name !== 'paragraph') {
    next = next.copy(next.content.addToEnd(tail.type.create()));
  }
  const start = doc.content.findDiffStart(next.content);
  if (start === null) return false;
  let { a: endA, b: endB } = doc.content.findDiffEnd(next.content)!;
  const overlap = start - Math.min(endA, endB); // a line added next to one like it: the two ends cross
  if (overlap > 0) { endA += overlap; endB += overlap; }
  // whole blocks of the note are replaced, the first and the last that changed: a piece cut from inside a toggle or
  // a list was fitted into whatever stood there (a toggle with no title around the new line, a title split in two)
  const edges: number[] = [0];
  doc.forEach((c) => edges.push(edges[edges.length - 1] + c.nodeSize));
  const from = Math.max(...edges.filter((p) => p <= start));
  const toA = Math.min(...edges.filter((p) => p >= endA)), toB = toA + endB - endA;
  const { selection } = editor.state;
  const tr = editor.state.tr.replace(from, toA, next.slice(from, toB));
  // the caret stays by the text it was in, judged by the stretch that really differs (start…endA), not by the whole
  // blocks replaced: before it and after it, by the same text; in it, as far in as it was, or at its end. (By the
  // blocks, a caret in a table — one block, however big — went into another cell as soon as a cell before it grew.)
  if (selection instanceof TextSelection) {
    const map = (p: number) => (p <= start ? p : p >= endA ? p + endB - endA : Math.min(p, endB));
    tr.setSelection(TextSelection.between(tr.doc.resolve(map(selection.anchor)), tr.doc.resolve(map(selection.head))));
  }
  editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
  return true;
}
