import { Fragment, type Node as PMNode, type NodeType, type ResolvedPos } from '@tiptap/pm/model';
import { EditorState, Selection, TextSelection } from '@tiptap/pm/state';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { canJoin, liftTarget } from '@tiptap/pm/transform';

export const inCell = ($pos: ResolvedPos) => {
  for (let d = $pos.depth; d > 0; d--) if (/^table(Cell|Header)$/.test($pos.node(d).type.name)) return true;
  return false;
};

/**
 * The block a ⌫ at the start of the line at `$pos` runs into (dir -1), or a Delete at its end (1): the line's
 * neighbour, or the last (first) block deep in it as far as `stop` lets it go, since a list ending in a picture ends
 * in that picture. Null when the line is the first (last) in what holds it, which ⌫ lifts it out of instead. A closed
 * toggle is not looked into: its body is not on screen.
 */
export function blockBeside($pos: ResolvedPos, dir: -1 | 1, stop: (n: PMNode) => boolean = () => false): { node: PMNode; pos: number } | null {
  if ($pos.depth < 1) return null;
  const i = $pos.index(-1) + dir, holder = $pos.node(-1);
  if (i < 0 || i >= holder.childCount) return null;
  let node = holder.child(i), pos = dir < 0 ? $pos.before() - node.nodeSize : $pos.after();
  while (!node.isTextblock && !node.isAtom && node.childCount && !stop(node) && !(node.type.name === 'details' && !node.attrs.open)) {
    const inner = dir < 0 ? node.lastChild! : node.firstChild!;
    pos = dir < 0 ? pos + node.nodeSize - 1 - inner.nodeSize : pos + 1;
    node = inner;
  }
  return { node, pos };
}

export function moveBlock(dir: -1 | 1) {
  return ({ state, dispatch }: { state: any; dispatch?: (tr: any) => void }): boolean => {
    const tr = state.tr;
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

function splitList(tr: any, pos: number) {
  const $p = tr.doc.resolve(pos), list = $p.parent;
  tr.split(pos);
  if (list.type.name === 'orderedList') tr.setNodeAttribute(pos + 1, 'start', (list.attrs.start ?? 1) + $p.index());
}

function splitAtSelection(tr: any) {
  const { $from, $to } = tr.selection;
  const range = $from.blockRange($to);
  if (!range || /List$/.test(range.parent.type.name) || range.endIndex - range.startIndex < 2) return;
  const d = range.depth + 1;
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
function isEdge(doc: PMNode, parent: PMNode, i: number, dir: -1 | 1): boolean {
  if (dir > 0) return isTrailer(doc, parent, i);
  return parent === doc && i === 0 && doc.child(0).type.name === 'heading';
}

const splitAt = (node: PMNode, from: number, dir: -1 | 1): number | null =>
  /List$/.test(node.type.name) && node.childCount > 1
    ? dir > 0 ? from + 1 + node.firstChild!.nodeSize : from + node.nodeSize - 1 - node.lastChild!.nodeSize
    : null;

function moveOnce(state: any, dir: -1 | 1, done = 0): any {
  const { $from, $to } = state.selection;
  let range = $from.blockRange($to);
  while (range) {
    const { parent, startIndex, endIndex, start, end } = range;
    if (/Item$/.test(parent.type.name) && startIndex === 0) {
      range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1));
      continue;
    }
    if (parent.type.name === 'tableRow') {
      range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1));
      continue;
    }
    if (parent.type.name === 'details') {
      if (startIndex > 0) return true;
      range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1));
      continue;
    }
    if (parent.type.name === 'callout' && parent.attrs.titled) {
      if (startIndex === 1 && dir < 0) return true;
      if (startIndex === 0) {
        range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1));
        continue;
      }
    }
    const i = dir < 0 ? startIndex - 1 : endIndex;
    if (/^(callout|blockquote)$/.test(parent.type.name) && (i < 0 || i >= parent.childCount) && endIndex - startIndex < parent.childCount) {
      const target = liftTarget(range);
      if (target == null) return true;
      state.tr.lift(range, target);
      return true;
    }
    // rows move among the body rows: the header stays on top (the markdown table needs it there), and a row at
    // the body's edge stays in its table rather than taking the whole table along
    if (parent.type.name === 'table' && (startIndex === 0 || i < 1 || i >= parent.childCount)) return true;
    if (isEdge(state.doc, parent, i, dir)) return true;
    if (i >= 0 && i < parent.childCount) {
      const node = parent.child(i);
      const split = splitAt(node, dir < 0 ? start - node.nodeSize : end, dir);
      if (split !== null) return split;
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
    if (/List$/.test(parent.type.name)) return hopOutOfList(state, range, dir, done);
    if (range.depth < 1) return false;
    range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1));
  }
  return false;
}

function hopOutOfList(state: any, range: any, dir: -1 | 1, done: number): any {
  const { parent, start, end, depth } = range;
  const $start = state.doc.resolve(start);
  const listStart = $start.before(depth), listEnd = $start.after(depth);
  const $list = state.doc.resolve(listStart);
  const beside = dir < 0 ? $list.nodeBefore : state.doc.resolve(listEnd).nodeAfter;
  const item = $list.parent, outer = depth > 1 ? $list.node(depth - 2) : null;
  const lift = /Item$/.test(item.type.name) && !!outer && /List$/.test(outer.type.name) && (dir < 0 ? $list.index() === 1 : !beside);
  const across = lift && outer!.type !== parent.type;
  // the list is already at the edge, or what is beside it is the title or the note's end: nothing to step
  // over, and the key stays ours (the webview's own ⌥↓ would drop the selection)
  if (!lift && (!beside || isEdge(state.doc, $list.parent, dir < 0 ? $list.index() - 1 : $list.index() + 1, dir))) return true;
  if (!lift) {
    const split = splitAt(beside, dir < 0 ? listStart - beside.nodeSize : listEnd, dir);
    if (split !== null) return split;
  }
  const alone = range.startIndex === 0 && range.endIndex === parent.childCount;
  const cut = alone ? { from: listStart, to: listEnd } : { from: start, to: end };
  const ownerAt = $list.index(depth - 2), ownerEdge = dir < 0 ? ownerAt === 0 : ownerAt === outer?.childCount - 1;
  const target = !lift ? (dir < 0 ? listStart - beside!.nodeSize : listEnd + beside!.nodeSize)
    : across && ownerEdge ? (dir < 0 ? $list.before(depth - 2) : $list.after(depth - 2))
    : dir < 0 ? $list.before(depth - 1) : $list.after(depth - 1);
  const items = state.doc.slice(start, end).content;
  const numbered = parent.type.name === 'orderedList', first = (parent.attrs.start ?? 1) + range.startIndex;
  const moved = lift && !across ? items : alone && !lift ? state.doc.slice(listStart, listEnd).content
    : numbered ? parent.type.create({ ...parent.attrs, start: first }, items) : parent.copy(items);
  const base = lift && !across ? start : alone && !lift ? listStart : start - 1;
  const tr = state.tr.delete(cut.from, cut.to);
  if (numbered && !alone && dir < 0 && range.startIndex === 0) tr.setNodeAttribute(tr.mapping.slice(done).map(listStart), 'start', (parent.attrs.start ?? 1) + range.endIndex);
  const at = tr.mapping.slice(done).map(target);
  tr.insert(at, moved);
  if (lift && across && !ownerEdge && outer!.type.name === 'orderedList') {
    const $at = tr.doc.resolve(Math.min(at + (moved.nodeSize ?? moved.size), tr.doc.content.size));
    let after = $at.nodeAfter ? $at.pos : -1;
    for (let p = $at.pos; after < 0 && p < Math.min($at.pos + 4, tr.doc.content.size); p++) if (tr.doc.resolve(p).nodeAfter?.type.name === 'orderedList') after = p;
    const next = after >= 0 ? tr.doc.resolve(after).nodeAfter : null;
    if (next?.type.name === 'orderedList') tr.setNodeAttribute(after, 'start', (outer!.attrs.start ?? 1) + ownerAt + 1);
  }
  const { anchor, head, empty } = state.selection;
  const pos = (p: number) => tr.doc.resolve(Math.min(at + p - base, tr.doc.content.size));
  tr.setSelection(empty ? Selection.near(pos(head)) : TextSelection.between(pos(anchor), pos(head)));
  return true;
}

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
        if (!item) { item = name; list = $p.node(d - 1).type.name; first = $p.index(d) === 0; }
      }
    }
    out.push({ pos, end: pos + n.nodeSize, depth, item, list, first });
    return false;
  });
  return out;
}

export function indentLines(dir: 1 | -1) {
  return ({ tr }: { tr: any }): boolean => {
    const { from, to, $from } = tr.selection;
    if ($from.parent.type.spec.code) return false;
    if (inCell($from)) return false;
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
    if (first < 0 || !before[first].item) return false;
    if (dir < 0 && before.some((l, k) => picked[k] && l.item && l.depth <= 1)) return true;
    // nowhere to go, but the line is in a list all the same: the key stays ours (the webview's Tab leaves the note)
    if (!step(dir > 0, before[first].item)) return true;
    for (let k = 0; k < before.length; k++) {
      if (picked[k] || !before[k].item) continue;
      for (let tries = 0; tries < 4; tries++) {
        const now = lineDepths(tr.doc)[k];
        if (now.depth === before[k].depth) break;
        tr.setSelection(TextSelection.create(tr.doc, now.pos + 1));
        if (!step(now.depth < before[k].depth, now.item)) break;
      }
    }
    const schema = tr.doc.type.schema;
    for (let k = before.length - 1; k >= 0; k--) {
      const was = before[k], now = lineDepths(tr.doc)[k];
      if (picked[k] || !was.item || !was.first || !now.first || now.list === was.list || !schema.nodes[was.list]) continue;
      switchItem(tr, now.pos + 1, now.pos + 1, schema.nodes[was.list], schema.nodes[was.item]);
    }
    const after = lineDepths(tr.doc);
    const at = (k: number, p: number) => Math.min(after[k].pos + Math.max(1, p - before[k].pos), after[k].end - 1);
    tr.setSelection(TextSelection.create(tr.doc, at(first, from), at(last, to)));
    return true;
  };
}
const offsetOf = (node: PMNode, i: number) => { let o = 0; for (let k = 0; k < i; k++) o += node.child(k).nodeSize; return o; };

function liftAcross(tr: any): boolean | null {
  const { $from, $to } = tr.selection;
  const range = $from.blockRange($to, (n: PMNode) => /List$/.test(n.type.name));
  if (!range || range.depth < 2) return null;
  const list: PMNode = range.parent, owner: PMNode = range.$from.node(range.depth - 1);
  const outerList: PMNode = range.$from.node(range.depth - 2);
  if (!/Item$/.test(owner.type.name)) return null;
  if (owner.type === list.firstChild!.type && outerList.type === list.type) return liftOverTrailing(tr, range);
  const { startIndex, endIndex } = range;
  const moved: PMNode[] = [];
  for (let k = startIndex; k < endIndex; k++) moved.push(list.child(k));
  if (endIndex < list.childCount) {
    const rest = list.content.cut(offsetOf(list, endIndex));
    const last = moved.pop()!;
    moved.push(last.copy(last.content.append(Fragment.from(list.copy(rest)))));
  }
  const listStart = range.$from.before(range.depth), contentEnd = range.$from.end(range.depth);
  const ownerEnd = range.$from.after(range.depth - 1), outerEnd = range.$from.after(range.depth - 2);
  const ownerIsLast = range.$from.index(range.depth - 2) === range.$from.node(range.depth - 2).childCount - 1;
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
    const outer: PMNode = range.$from.node(range.depth - 2);
    if (outer.type.name === 'orderedList') tr.setNodeAttribute(at + 1 + out.nodeSize, 'start', (outer.attrs.start ?? 1) + range.$from.index(range.depth - 2) + 1);
  }
  return true;
}

function liftOverTrailing(tr: any, range: any): boolean | null {
  const list: PMNode = range.parent, $r = range.$from, d = range.depth;
  const owner: PMNode = $r.node(d - 1), at = $r.index(d - 1);
  if (at === owner.childCount - 1) return null;
  const { startIndex, endIndex } = range;
  const moved: PMNode[] = [];
  for (let k = startIndex; k < endIndex; k++) moved.push(list.child(k));
  let below = owner.content.cut(offsetOf(owner, at + 1));
  if (endIndex < list.childCount) below = Fragment.from(list.copy(list.content.cut(offsetOf(list, endIndex)))).append(below);
  const last = moved.pop()!;
  moved.push(last.copy(last.content.append(below)));
  let kept = owner.content.cut(0, offsetOf(owner, at));
  if (startIndex > 0) kept = kept.addToEnd(list.copy(list.content.cut(0, offsetOf(list, startIndex))));
  tr.replaceWith($r.before(d - 1), $r.after(d - 1), [owner.copy(kept), ...moved]);
  return true;
}

/**
 * A list line whose marker is typed over by another kind's ("- " on a to-do, "[] " or "1. " on a bullet):
 * that one line becomes the other kind, its list split around it (and joined with a neighbour of the same
 * kind afterwards, by joinLists). `from`–`to` is the typed marker, removed; `itemAttrs` the new item's (a to-do typed
 * "[x] " is done). False when the line is not the first line of an item, or already that kind.
 */
export function switchItem(tr: any, from: number, to: number, listType: NodeType, itemType: NodeType, listAttrs: Record<string, unknown> = {}, itemAttrs: Record<string, unknown> = {}): boolean {
  const $p = tr.doc.resolve(from);
  const d = $p.depth;
  if (d < 3 || $p.parentOffset !== 0 || !$p.parent.isTextblock) return false;
  const item: PMNode = $p.node(d - 1);
  if (!/Item$/.test(item.type.name) || $p.index(d - 1) !== 0 || !/List$/.test($p.node(d - 2).type.name)) return false;
  if ($p.node(d - 2).type === listType) return false;
  tr.delete(from, to);
  const $q = tr.doc.resolve(from);
  const own: PMNode = $q.node(d - 1), list: PMNode = $q.node(d - 2), i = $q.index(d - 2);
  const attrs = itemType.name === 'taskItem' ? { checked: false, ...itemAttrs } : null;
  if (!itemType.validContent(own.content)) return false;
  const parts: PMNode[] = [];
  if (i > 0) parts.push(list.copy(list.content.cut(0, offsetOf(list, i))));
  parts.push(listType.create(listAttrs, itemType.create(attrs, own.content)));
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
 * its own, its list split in two and the count after it starting over. When every selected line is that kind
 * already, they all become plain lines (plainLines). False when a plain line is among them (the stock toggle then
 * makes them a list).
 */
export function switchLines(list: string, item: string) {
  return ({ tr }: { tr: any }): boolean => {
    const schema = tr.doc.type.schema;
    const { from, to } = tr.selection;
    const lines = lineDepths(tr.doc);
    const picked = lines.map((l, k) => ({ l, k })).filter(({ l }) => l.pos + 1 <= to && l.end - 1 >= from && (l.item || l.end - l.pos > 2));
    if (!picked.length || picked.some(({ l }) => !l.item)) return false;
    const change = picked.filter(({ l }) => l.first && l.list !== list);
    if (!change.length) return plainLines(tr, picked.map(({ k }) => k));
    const offset = from - picked[0].l.pos, span = to - from;
    for (const { k } of [...change].reverse()) {
      const now = lineDepths(tr.doc)[k];
      switchItem(tr, now.pos + 1, now.pos + 1, schema.nodes[list], schema.nodes[item]);
    }
    const first = lineDepths(tr.doc)[picked[0].k];
    const a = Math.min(first.pos + offset, first.end - 1);
    tr.setSelection(TextSelection.between(tr.doc.resolve(a), tr.doc.resolve(Math.min(a + span, tr.doc.content.size))));
    return true;
  };
}

function plainLines(tr: any, picked: number[]): boolean {
  const { from, to } = tr.selection;
  const before = lineDepths(tr.doc), schema = tr.doc.type.schema;
  for (const k of picked) {
    if (!before[k].first) continue;
    for (let level = before[k].depth; level > 0; level--) {
      const now = lineDepths(tr.doc)[k];
      if (!now.item) break;
      // a state of its own: the stock lift checks its positions against the whole transaction's mapping, which
      // the lifts before it in this one would throw off
      const state = EditorState.create({ doc: tr.doc, selection: TextSelection.create(tr.doc, now.pos + 1) });
      let lifted: any = null;
      if (!liftListItem(schema.nodes[now.item])(state, (t) => { lifted = t; }) || !lifted) break;
      for (const step of lifted.steps) tr.step(step);
    }
  }
  const after = lineDepths(tr.doc), first = picked[0], last = picked[picked.length - 1];
  const at = (k: number, p: number) => Math.min(after[k].pos + Math.max(1, p - before[k].pos), after[k].end - 1);
  tr.setSelection(TextSelection.create(tr.doc, at(first, from), at(last, to)));
  return true;
}

/**
 * ⌘⇧7 / ⌘⇧8 / ⌘⇧9 over lines with a toggle, a callout, a table or the like among them: each run of plain lines
 * becomes a list of its own, and what lies between them stays as it was. The stock toggle wrapped the whole range,
 * the toggle with it, which went in under the first new item. False when there is no such block in the range (the
 * stock toggle then does what it does).
 */
export function wrapLines(list: string, item: string) {
  return ({ tr }: { tr: any }): boolean => {
    const { $from, $to } = tr.selection;
    const range = $from.blockRange($to);
    if (!range || /(List|Item)$/.test(range.parent.type.name)) return false;
    const schema = tr.doc.type.schema, listType = schema.nodes[list], itemType = schema.nodes[item];
    const lines: { at: number; n: number }[] = [];
    let other = false, pos = range.start;
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const n: PMNode = range.parent.child(i);
      if (n.type.name === 'paragraph') lines.push({ at: pos, n: lines.length });
      else if (!n.isTextblock && !/List$/.test(n.type.name)) other = true;
      pos += n.nodeSize;
    }
    if (!other || !lines.length) return false;
    for (const { at, n } of lines.reverse()) {
      tr.wrap(tr.doc.resolve(at + 1).blockRange(), [
        { type: listType, attrs: list === 'orderedList' ? { start: n + 1 } : null },
        { type: itemType, attrs: item === 'taskItem' ? { checked: false } : null },
      ]);
      const next = at + tr.doc.nodeAt(at).nodeSize;
      if (tr.doc.nodeAt(next)?.type === listType && canJoin(tr.doc, next)) tr.join(next);
    }
    return true;
  };
}

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
  tr.insert(listStart - 2, moved);
  return true;
}

const levelOf = ($p: any) => { let n = 0; for (let d = $p.depth; d > 0; d--) if (/Item$/.test($p.node(d).type.name)) n++; return n; };

export function joinListBelow({ tr }: { tr: any }): boolean {
  const { $from, empty } = tr.selection;
  const line: PMNode = $from.parent;
  if (!empty || !line.isTextblock || line.type.spec.code || $from.parentOffset !== line.content.size) return false;
  if ($from.depth >= 2 && /Item$/.test($from.node(-1).type.name)) return false;
  const after = $from.after(), list: PMNode | null = tr.doc.resolve(after).nodeAfter;
  if (!list || !/^(bulletList|orderedList|taskList)$/.test(list.type.name)) return false;
  const item = list.firstChild!, text = item.firstChild;
  if (!text?.isTextblock || text.type.spec.code || !line.type.validContent(line.content.append(text.content))) return false;
  const rest = item.content.cut(text.nodeSize);
  if (list.childCount === 1) tr.delete(after, after + list.nodeSize);
  else tr.delete(after + 1, after + 1 + item.nodeSize);
  if (rest.size) tr.insert(after, rest);
  tr.insert($from.pos, text.content);
  tr.setSelection(TextSelection.create(tr.doc, $from.pos));
  return true;
}

export function joinNextItem({ tr }: { tr: any }): boolean {
  const { $from, empty } = tr.selection;
  const line: PMNode = $from.parent;
  if (!empty || !line.isTextblock || line.type.spec.code || $from.parentOffset !== line.content.size || $from.depth < 3) return false;
  if (!/Item$/.test($from.node(-1).type.name)) return false;
  const after = $from.after(), next = Selection.findFrom(tr.doc.resolve(after), 1, true);
  if (!next) return false;
  const $n = next.$from, s = $from.sharedDepth($n.pos);
  if ($n.parentOffset !== 0 || $n.before() - after !== $from.depth - 1 - s + ($n.depth - 1 - s)) return false;
  const text: PMNode = $n.parent;
  if (text.type.spec.code) return false;
  if (!levelOf($n)) {
    if ($n.depth !== s + 1) return false;
    if (isTrailer(tr.doc, $n.node(-1), $n.index(-1))) return true;
    if (!line.type.validContent(line.content.append(text.content))) return false;
    tr.delete($n.before(), $n.after());
    tr.insert($from.pos, text.content);
    tr.setSelection(TextSelection.create(tr.doc, $from.pos));
    return true;
  }
  const item: PMNode = $n.node(-1), list: PMNode = $n.node(-2);
  if (!/Item$/.test(item.type.name) || $n.index(-1) !== 0) return false;
  const level = levelOf($n);
  if (level === levelOf($from) && item.type === $from.node(-1).type && list.type === $from.node(-2).type) return false;
  if (!line.type.validContent(line.content.append(text.content))) return false;
  const rest = item.content.cut(text.nodeSize);
  let home = -1;
  for (let d = $from.depth - 1; d > 0 && home < 0; d--) if (/Item$/.test($from.node(d).type.name) && levelOf(tr.doc.resolve($from.before(d) + 1)) === level) home = $from.end(d);
  const itemPos = $n.before(-1), listPos = $n.before(-2);
  if (list.childCount === 1) tr.delete(listPos, listPos + list.nodeSize);
  else tr.delete(itemPos, itemPos + item.nodeSize);
  if (rest.size) tr.insert(home >= 0 ? home : list.childCount === 1 ? listPos : itemPos, rest);
  tr.insert($from.pos, text.content);
  tr.setSelection(TextSelection.create(tr.doc, $from.pos));
  return true;
}

export function itemAbove({ tr }: { tr: any }): boolean {
  const { $from, empty } = tr.selection;
  const line: PMNode = $from.parent;
  if (!empty || $from.parentOffset !== 0 || !line.isTextblock || line.type.spec.code || !line.content.size || $from.depth < 3) return false;
  const item: PMNode = $from.node(-1);
  if (!/Item$/.test(item.type.name) || $from.index(-1) !== 0) return false;
  const fresh = item.type.createAndFill();
  if (!fresh) return false;
  tr.insert($from.before(-1), fresh);
  return true;
}

/**
 * ⌫ at the start of a numbered item with items after it, or Enter on an empty one (`blank`): the line comes out of
 * the list as the stock lift takes it, and the items after it go on counting (3. stays 3., not 1.), the first one's
 * too (2. stays 2.).
 * A numbered list inside an item counts from 1 anyway (joinLists), so only one that is not is taken here.
 */
export function liftCounting(blank: boolean) {
  return ({ tr }: { tr: any }): boolean => {
    const { $from, empty } = tr.selection;
    if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 3 || (blank && $from.parent.content.size)) return false;
    const item: PMNode = $from.node(-1), list: PMNode = $from.node(-2), i = $from.index(-2);
    if (!/Item$/.test(item.type.name) || $from.index(-1) !== 0 || list.type.name !== 'orderedList') return false;
    if (i === list.childCount - 1 || /Item$/.test($from.node(-3).type.name)) return false;
    const steps = tr.steps.length;
    const state = { doc: tr.doc, selection: tr.selection, schema: tr.doc.type.schema, tr };
    if (!liftListItem(item.type)(state as any, () => {})) return false;
    const $p = tr.doc.resolve(tr.mapping.slice(steps).map($from.pos)), holder = $p.node(-1);
    let pos = $p.before();
    for (let k = 0; k < item.childCount; k++) pos += holder.child($p.index(-1) + k).nodeSize;
    if (tr.doc.nodeAt(pos)?.type === list.type) tr.setNodeAttribute(pos, 'start', (list.attrs.start ?? 1) + i + 1);
    return true;
  };
}

export function leaveTrailer({ tr }: { tr: any }): boolean {
  const doc: PMNode = tr.doc, { from, to } = tr.selection;
  const start = doc.content.size - doc.lastChild!.nodeSize;
  if (!isTrailer(doc, doc, doc.childCount - 1) || to <= start || from >= start) return true;
  const end = Selection.findFrom(doc.resolve(start), -1, true);
  if (end) tr.setSelection(TextSelection.between(doc.resolve(from), end.$from));
  return true;
}
