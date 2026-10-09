// Moving and indenting lines: plain ProseMirror, no editor or DOM, so it runs in Node (blocks.test.mjs).
import { Fragment, type Node as PMNode, type NodeType } from '@tiptap/pm/model';
import { Selection, TextSelection } from '@tiptap/pm/state';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';

/**
 * Move whatever the selection covers one step up or down among its siblings — a line, a list item, a
 * picture, or a whole dragged-over range. Nothing to swap with at this level (the only paragraph in a
 * list item, say) means the block one level out moves instead, so ⌥↓ walks an item down the list.
 *
 * The neighbour is the one that actually moves: cutting it and putting it back on the other side
 * leaves the selection where the writer put it, carried along by the transaction's own mapping.
 *
 * Every line is its own step, a list item and an empty line too: a neighbouring list of several items is
 * split first, so the block passes only the item next to it (the lists join up again behind it).
 */
export function moveBlock(dir: -1 | 1) {
  return ({ state, dispatch }: { state: any; dispatch?: (tr: any) => void }): boolean => {
    const tr = state.tr;
    // one transaction for the split and the move: applied apart, joinLists would glue the list back first
    const at = () => ({ doc: tr.doc, selection: tr.selection, tr });
    splitAtSelection(tr);
    let r = moveOnce(at(), dir, tr.steps.length);
    if (typeof r === 'number') {
      splitList(tr, r);
      r = moveOnce(at(), dir, tr.steps.length);
    }
    if (!r || typeof r === 'number') return false;
    if (dispatch && tr.docChanged) dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Split a list between two items at `pos`; the half split off a numbered list keeps counting, not from 1. */
function splitList(tr: any, pos: number) {
  const $p = tr.doc.resolve(pos), list = $p.parent;
  tr.split(pos);
  if (list.type.name === 'orderedList') tr.setNodeAttribute(pos + 1, 'start', (list.attrs.start ?? 1) + $p.index());
}

/**
 * A selection over several blocks that starts or ends partway into a list (a bullet and the to-do under it,
 * say) covers only some of that list's items: the list is split there, so only the selected items move.
 */
function splitAtSelection(tr: any) {
  const { $from, $to } = tr.selection;
  const range = $from.blockRange($to);
  if (!range || /List$/.test(range.parent.type.name) || range.endIndex - range.startIndex < 2) return;
  const d = range.depth + 1; // the level of the blocks in the range
  const last = range.parent.child(range.endIndex - 1);
  if (/List$/.test(last.type.name) && $to.depth > d && $to.index(d) < last.childCount - 1) splitList(tr, $to.after(d + 1));
  const first = range.parent.child(range.startIndex);
  if (/List$/.test(first.type.name) && $from.depth > d && $from.index(d) > 0) splitList(tr, $from.before(d + 1));
}

/**
 * The empty line the editor keeps at the very end of a note (StarterKit's TrailingNode puts one back
 * whenever the note ends in anything else). It is not a line to swap with: stepping past it only makes
 * the editor add another, and ⌥↓ would go on trading places with new empty lines forever.
 */
function isTrailer(doc: PMNode, parent: PMNode, i: number): boolean {
  const node = parent === doc && i === doc.childCount - 1 ? doc.child(i) : null;
  return !!node && node.type.name === 'paragraph' && node.content.size === 0;
}
/** The neighbour a move would pass is the note's end, or its title (a heading as the first line): both stay put. */
function isEdge(doc: PMNode, parent: PMNode, i: number, dir: -1 | 1): boolean {
  if (dir > 0) return isTrailer(doc, parent, i);
  return parent === doc && i === 0 && doc.child(0).type.name === 'heading';
}

/** a list of several items beside the moving block: where to split it so only its nearest item is passed */
const splitAt = (node: PMNode, from: number, dir: -1 | 1): number | null =>
  /List$/.test(node.type.name) && node.childCount > 1
    ? dir > 0 ? from + 1 + node.firstChild!.nodeSize : from + node.nodeSize - 1 - node.lastChild!.nodeSize
    : null;

/**
 * The move added to `state.tr` (true), false when there is nowhere to go, or a position to split a neighbouring
 * list at first. `done`: steps already in the transaction, whose mapping the positions here must not go through.
 */
function moveOnce(state: any, dir: -1 | 1, done = 0): any {
  const { $from, $to } = state.selection;
  let range = $from.blockRange($to);
  while (range) {
    const { parent, startIndex, endIndex, start, end } = range;
    // an item's own line moves the whole item (and what hangs under it), not just the text inside it
    if (/Item$/.test(parent.type.name) && startIndex === 0) {
      range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1));
      continue;
    }
    const i = dir < 0 ? startIndex - 1 : endIndex;
    if (isEdge(state.doc, parent, i, dir)) return true; // the note's title or its end: nothing to pass
    if (i >= 0 && i < parent.childCount) {
      const node = parent.child(i);
      const split = splitAt(node, dir < 0 ? start - node.nodeSize : end, dir);
      if (split !== null) return split;
      // the neighbour is what moves: the selection stays where the writer put it, carried by the mapping
      const tr = state.tr;
      if (dir < 0) {
        tr.delete(start - node.nodeSize, start);
        tr.insert(tr.mapping.slice(done).map(end), node);
      } else {
        tr.delete(end, end + node.nodeSize);
        tr.insert(start, node);
      }
      return true;
    }
    // first / last item of a list: the item itself steps over whatever sits beside the list, instead
    // of dragging the whole list along
    if (/List$/.test(parent.type.name)) return hopOutOfList(state, range, dir, done);
    if (range.depth < 1) return false;
    range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1)); // one level out
  }
  return false;
}

/** Carry the item out of its list and past the block on the other side, still an item of its own list. */
function hopOutOfList(state: any, range: any, dir: -1 | 1, done: number): any {
  const { parent, start, end, depth } = range;
  const $start = state.doc.resolve(start);
  const listStart = $start.before(depth), listEnd = $start.after(depth);
  const $list = state.doc.resolve(listStart);
  const beside = dir < 0 ? $list.nodeBefore : state.doc.resolve(listEnd).nodeAfter;
  // a nested list's first item going up would land above its parent item's own text, and its last one
  // has nothing to step over: either way it steps out to its parent's level, beside the parent item. (A list
  // further down in the item, after other blocks of it, steps over those instead.)
  const item = $list.parent, outer = depth > 1 ? $list.node(depth - 2) : null;
  const lift = /Item$/.test(item.type.name) && !!outer && /List$/.test(outer.type.name) && (dir < 0 ? $list.index() === 1 : !beside);
  // under an item of another kind (bullets under a to-do) the items come out as a list of their own kind
  const across = lift && outer!.type !== parent.type;
  // the list is already at the edge, or what is beside it is the title or the note's end: nothing to step
  // over, and the key stays ours (the webview's own ⌥↓ would drop the selection)
  if (!lift && (!beside || isEdge(state.doc, $list.parent, dir < 0 ? $list.index() - 1 : $list.index() + 1, dir))) return true;
  if (!lift) {
    const split = splitAt(beside, dir < 0 ? listStart - beside.nodeSize : listEnd, dir);
    if (split !== null) return split;
  }
  const alone = range.startIndex === 0 && range.endIndex === parent.childCount; // every item goes: no empty list left behind
  const cut = alone ? { from: listStart, to: listEnd } : { from: start, to: end };
  // beside the parent item: inside the outer list, or (across) just outside it when the parent is its first
  // or last item; in between, inserting there splits the outer list around the new one
  const ownerAt = $list.index(depth - 2), ownerEdge = dir < 0 ? ownerAt === 0 : ownerAt === outer?.childCount - 1;
  const target = !lift ? (dir < 0 ? listStart - beside!.nodeSize : listEnd + beside!.nodeSize)
    : across && ownerEdge ? (dir < 0 ? $list.before(depth - 2) : $list.after(depth - 2))
    : dir < 0 ? $list.before(depth - 1) : $list.after(depth - 1);
  const items = state.doc.slice(start, end).content;
  // numbered items keep their numbers wherever they go: a copy of their list counts from where they were
  const numbered = parent.type.name === 'orderedList', first = (parent.attrs.start ?? 1) + range.startIndex;
  const moved = lift && !across ? items : alone && !lift ? state.doc.slice(listStart, listEnd).content
    : numbered ? parent.type.create({ ...parent.attrs, start: first }, items) : parent.copy(items);
  const base = lift && !across ? start : alone && !lift ? listStart : start - 1; // where the moved piece began
  const tr = state.tr.delete(cut.from, cut.to);
  // the first items gone up, the ones left behind go on counting from where they were (3. stays 3.)
  if (numbered && !alone && dir < 0 && range.startIndex === 0) tr.setNodeAttribute(tr.mapping.map(listStart), 'start', (parent.attrs.start ?? 1) + range.endIndex);
  const at = tr.mapping.slice(done).map(target);
  tr.insert(at, moved);
  // a list put between two items of a numbered list splits it: the half after it goes on counting
  if (lift && across && !ownerEdge && outer!.type.name === 'orderedList') {
    const $at = tr.doc.resolve(Math.min(at + (moved.nodeSize ?? moved.size), tr.doc.content.size));
    let after = $at.nodeAfter ? $at.pos : -1;
    // the split may leave the position just inside the closing of the inserted list: step to the next sibling
    for (let p = $at.pos; after < 0 && p < Math.min($at.pos + 4, tr.doc.content.size); p++) if (tr.doc.resolve(p).nodeAfter?.type.name === 'orderedList') after = p;
    const next = after >= 0 ? tr.doc.resolve(after).nodeAfter : null;
    if (next?.type.name === 'orderedList') tr.setNodeAttribute(after, 'start', (outer!.attrs.start ?? 1) + ownerAt + 1);
  }
  // the selection rides along: the caret, or every item that was selected
  const { anchor, head, empty } = state.selection;
  const pos = (p: number) => tr.doc.resolve(Math.min(at + p - base, tr.doc.content.size));
  tr.setSelection(empty ? Selection.near(pos(head)) : TextSelection.between(pos(anchor), pos(head)));
  return true;
}

/** Each line (textblock) in order, with how many list items it sits in: the level Tab and ⇧Tab change. */
function lineDepths(doc: PMNode) {
  const out: { pos: number; end: number; depth: number; item: string; list: string; first: boolean }[] = [];
  doc.descendants((n, pos) => {
    if (!n.isTextblock) return true;
    const $p = doc.resolve(pos + 1);
    let depth = 0, item = '', list = '', first = false;
    for (let d = $p.depth; d > 0; d--) {
      const name = $p.node(d).type.name;
      if (/Item$/.test(name)) {
        depth++;
        // the line's own item: its kind, its list's, and whether the line is the item's first (the marker's line)
        if (!item) { item = name; list = $p.node(d - 1).type.name; first = $p.index(d) === 0; }
      }
    }
    out.push({ pos, end: pos + n.nodeSize, depth, item, list, first });
    return false;
  });
  return out;
}

/**
 * Tab / ⇧Tab in a list: only the caret's line, or the selected lines, change level. The stock commands carry
 * an item's sub-items along, so every other line is put back at the level it had (where the outline allows:
 * a first sub-item has nothing above it to sit under once its parent moves out).
 */
export function indentLines(dir: 1 | -1) {
  return ({ tr }: { tr: any }): boolean => {
    const { from, to, $from } = tr.selection;
    if ($from.parent.type.spec.code) return false;
    // ProseMirror's own list commands, run on the one transaction (tiptap's would read a stale selection)
    const step = (sink: boolean, item: string) => {
      const type = tr.doc.type.schema.nodes[item];
      const state = { doc: tr.doc, selection: tr.selection, schema: tr.doc.type.schema, tr };
      const across = sink ? sinkAcross(tr) : liftAcross(tr);
      if (across !== null) return across;
      return (sink ? sinkListItem(type) : liftListItem(type))(state as any, () => {});
    };
    const before = lineDepths(tr.doc);
    const picked = before.map((l) => l.pos + 1 <= to && l.end - 1 >= from);
    const first = picked.indexOf(true), last = picked.lastIndexOf(true);
    if (first < 0 || !before[first].item) return false; // not in a list: Tab belongs to someone else
    // ⇧Tab at the outermost level has nowhere to go: the line stays an item (a to-do keeps its box)
    if (dir < 0 && before.some((l, k) => picked[k] && l.item && l.depth <= 1)) return true;
    if (!step(dir > 0, before[first].item)) return false;
    for (let k = 0; k < before.length; k++) {
      if (picked[k] || !before[k].item) continue;
      for (let tries = 0; tries < 4; tries++) {
        const now = lineDepths(tr.doc)[k];
        if (now.depth === before[k].depth) break;
        tr.setSelection(TextSelection.create(tr.doc, now.pos + 1));
        if (!step(now.depth < before[k].depth, now.item)) break;
      }
    }
    // put back at its level, a line kept its new neighbours' kind (a bullet under a moved number became a number):
    // it is the kind it was again. Back to front, so the lines not yet seen keep their places.
    const schema = tr.doc.type.schema;
    for (let k = before.length - 1; k >= 0; k--) {
      const was = before[k], now = lineDepths(tr.doc)[k];
      if (picked[k] || !was.item || !was.first || !now.first || now.list === was.list || !schema.nodes[was.list]) continue;
      switchItem(tr, now.pos + 1, now.pos + 1, schema.nodes[was.list], schema.nodes[was.item]);
    }
    // the same lines selected as before (lines are never added or removed by a level change)
    const after = lineDepths(tr.doc);
    const at = (k: number, p: number) => Math.min(after[k].pos + Math.max(1, p - before[k].pos), after[k].end - 1);
    tr.setSelection(TextSelection.create(tr.doc, at(first, from), at(last, to)));
    return true;
  };
}
/** Where child `i` of `node` starts, counted from the start of its content. */
const offsetOf = (node: PMNode, i: number) => { let o = 0; for (let k = 0; k < i; k++) o += node.child(k).nodeSize; return o; };

/**
 * ⇧Tab on items whose list hangs under an item of another kind (bullets under a to-do or a number, a to-do under a
 * number…). ProseMirror would turn them into plain lines inside that item; here they come out as a list of
 * their own kind right after it, the outer list split around them. Items below the lifted ones stay at their
 * level, under the last one lifted. null: not that case, the stock lift applies.
 */
function liftAcross(tr: any): boolean | null {
  const { $from, $to } = tr.selection;
  const range = $from.blockRange($to, (n: PMNode) => /List$/.test(n.type.name));
  if (!range || range.depth < 2) return null;
  const list: PMNode = range.parent, owner: PMNode = range.$from.node(range.depth - 1);
  // of another kind: another kind of item (a to-do), or the same item in another kind of list (a bullet under a number)
  const outerList: PMNode = range.$from.node(range.depth - 2);
  if (!/Item$/.test(owner.type.name) || (owner.type === list.firstChild!.type && outerList.type === list.type)) return null;
  const { startIndex, endIndex } = range;
  const moved: PMNode[] = [];
  for (let k = startIndex; k < endIndex; k++) moved.push(list.child(k));
  if (endIndex < list.childCount) { // the items below come along as the last one's children
    const rest = list.content.cut(offsetOf(list, endIndex));
    const last = moved.pop()!;
    moved.push(last.copy(last.content.append(Fragment.from(list.copy(rest)))));
  }
  const listStart = range.$from.before(range.depth), contentEnd = range.$from.end(range.depth);
  const ownerEnd = range.$from.after(range.depth - 1), outerEnd = range.$from.after(range.depth - 2);
  const ownerIsLast = range.$from.index(range.depth - 2) === range.$from.node(range.depth - 2).childCount - 1;
  // positions here are in the document as it is now: mapped through this lift's own steps only, not through the
  // ones already in the transaction (Tab sinks a line first, then puts the lines under it back with this)
  const steps = tr.steps.length;
  const map = (p: number) => tr.mapping.slice(steps).map(p);
  if (startIndex === 0) tr.delete(listStart, contentEnd + 1);
  else tr.delete(range.start, contentEnd);
  const out = list.copy(Fragment.fromArray(moved));
  if (ownerIsLast) tr.insert(map(outerEnd), out);
  else {
    const at = map(ownerEnd);
    tr.split(at);
    tr.insert(at + 1, out);
    // the numbered list split around them goes on counting after them (3. stays 3., not 1.)
    const outer: PMNode = range.$from.node(range.depth - 2);
    if (outer.type.name === 'orderedList') tr.setNodeAttribute(at + 1 + out.nodeSize, 'start', (outer.attrs.start ?? 1) + range.$from.index(range.depth - 2) + 1);
  }
  return true;
}

/**
 * A list line whose marker is typed over by another kind's ("- " on a to-do, "[] " or "1. " on a bullet):
 * that one line becomes the other kind, its list split around it (and joined with a neighbour of the same
 * kind afterwards, by joinLists). `from`–`to` is the typed marker, removed. False when the line is not the
 * first line of an item, or already that kind.
 */
export function switchItem(tr: any, from: number, to: number, listType: NodeType, itemType: NodeType, listAttrs: Record<string, unknown> = {}): boolean {
  const $p = tr.doc.resolve(from);
  const d = $p.depth;
  if (d < 3 || $p.parentOffset !== 0 || !$p.parent.isTextblock) return false;
  const item: PMNode = $p.node(d - 1);
  if (!/Item$/.test(item.type.name) || $p.index(d - 1) !== 0 || !/List$/.test($p.node(d - 2).type.name)) return false;
  if ($p.node(d - 2).type === listType) return false;
  tr.delete(from, to);
  const $q = tr.doc.resolve(from);
  const own: PMNode = $q.node(d - 1), list: PMNode = $q.node(d - 2), i = $q.index(d - 2);
  const attrs = itemType.name === 'taskItem' ? { checked: false } : null;
  if (!itemType.validContent(own.content)) return false;
  const parts: PMNode[] = [];
  if (i > 0) parts.push(list.copy(list.content.cut(0, offsetOf(list, i))));
  parts.push(listType.create(listAttrs, itemType.create(attrs, own.content)));
  // the numbered items after it keep their numbers (3. stays 3., not 1.); one inside an item counts from 1 (joinLists)
  if (i < list.childCount - 1) {
    const rest = list.content.cut(offsetOf(list, i + 1));
    parts.push(list.type.name === 'orderedList' ? list.type.create({ ...list.attrs, start: (list.attrs.start ?? 1) + i + 1 }, rest) : list.copy(rest));
  }
  const listPos = $q.before(d - 2);
  tr.replaceWith(listPos, $q.after(d - 2), parts);
  tr.setSelection(TextSelection.create(tr.doc, listPos + (i > 0 ? parts[0].nodeSize : 0) + 3));
  return true;
}

/**
 * ⌘⇧7 / ⌘⇧8 / ⌘⇧9 on list lines of another kind: each selected item becomes that kind where it is, as typing its
 * marker over it does (switchItem). The stock toggle lifted a nested item out of its parent to make it a list of
 * its own, its list split in two and the count after it starting over. False when no selected line is an item of
 * another kind (the stock toggle then does what it does: a plain line into a list, a list's lines plain again).
 */
export function switchLines(list: string, item: string) {
  return ({ tr }: { tr: any }): boolean => {
    const schema = tr.doc.type.schema;
    const { from, to } = tr.selection;
    const lines = lineDepths(tr.doc);
    const picked = lines.map((l, k) => ({ l, k })).filter(({ l }) => l.pos + 1 <= to && l.end - 1 >= from);
    if (!picked.length || picked.some(({ l }) => !l.item)) return false; // a plain line among them: the stock toggle
    const change = picked.filter(({ l }) => l.first && l.list !== list);
    if (!change.length) return false;
    const offset = from - picked[0].l.pos, span = to - from;
    for (const { k } of [...change].reverse()) {
      const now = lineDepths(tr.doc)[k];
      switchItem(tr, now.pos + 1, now.pos + 1, schema.nodes[list], schema.nodes[item]);
    }
    // the caret (or selection) where it was in its line
    const first = lineDepths(tr.doc)[picked[0].k];
    const a = Math.min(first.pos + offset, first.end - 1);
    tr.setSelection(TextSelection.between(tr.doc.resolve(a), tr.doc.resolve(Math.min(a + span, tr.doc.content.size))));
    return true;
  };
}

/**
 * Tab on the first items of a list that sits right under a list of another kind (bullets after to-dos): there
 * is no item above them in their own list to go under, so they go under the last item of the list above,
 * as a list of their own kind (the way ⇧Tab took them out). null: not that case.
 */
function sinkAcross(tr: any): boolean | null {
  const { $from, $to } = tr.selection;
  const range = $from.blockRange($to, (n: PMNode) => /List$/.test(n.type.name));
  if (!range || range.startIndex !== 0) return null;
  const list: PMNode = range.parent;
  const listStart = range.$from.before(range.depth), listEnd = range.$from.after(range.depth);
  const above = tr.doc.resolve(listStart).nodeBefore as PMNode | null;
  if (!above || !/List$/.test(above.type.name) || !above.lastChild) return null;
  const moved = list.copy(list.content.cut(0, offsetOf(list, range.endIndex)));
  if (range.endIndex === list.childCount) tr.delete(listStart, listEnd);
  else tr.delete(listStart + 1, listStart + 1 + offsetOf(list, range.endIndex));
  tr.insert(listStart - 2, moved); // the end of the last item above, inside it
  return true;
}
