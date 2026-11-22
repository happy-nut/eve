import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { chipAttrs, chipLabel } from './date';

export const FIND = new PluginKey<FindState>('eve-find');

export interface Hit { from: number; to: number; atom?: boolean }
export interface FindState { query: string; index: number; hits: Hit[] }

function shown(node: PMNode): string {
  if (node.type.name === 'wikiLink') return node.attrs.alias || node.attrs.title || '';
  if (node.type.name === 'dateMention') return chipLabel(chipAttrs(node.attrs));
  if (node.type.name === 'hardBreak') return '\n';
  return '\ufffc';
}

function search(doc: PMNode, query: string): Hit[] {
  const hits: Hit[] = [];
  if (!query) return hits;
  // the case is ignored by the match itself, on the text as it is: lower-casing the text first changed its length
  // ("İ" becomes two characters), and every match after it was off by one
  const q = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  doc.descendants((block, start) => {
    if (!block.isTextblock) return true;
    let text = '';
    block.forEach((n) => { text += n.isText ? n.text! : shown(n); });
    q.lastIndex = 0;
    if (!q.test(text)) return false;
    q.lastIndex = 0; // (matchAll starts where the test left off)
    const at: { off: number; pos: number; size: number; atom: boolean }[] = [];
    let off = 0;
    block.forEach((n, offset) => {
      at.push({ off, pos: start + 1 + offset, size: n.nodeSize, atom: !n.isText });
      off += n.isText ? n.text!.length : shown(n).length;
    });
    let k = 0;
    for (const m of text.matchAll(q)) {
      const a = m.index!, b = a + m[0].length;
      while (k + 1 < at.length && at[k + 1].off <= a) k++;
      let j = k;
      while (j + 1 < at.length && at[j + 1].off < b) j++;
      const first = at[k], last = at[j];
      let atom = false;
      for (let i = k; i <= j; i++) atom ||= at[i].atom;
      hits.push({
        from: first.atom ? first.pos : first.pos + (a - first.off),
        to: last.atom ? last.pos + last.size : last.pos + (b - last.off),
        ...(atom ? { atom } : {}),
      });
    }
    return false;
  });
  return hits;
}

export const Find = Extension.create({
  name: 'find',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: FIND,
        state: {
          init: () => ({ query: '', index: 0, hits: [] }),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(FIND) as Partial<FindState> | undefined;
            const value = { ...prev, ...meta };
            if (meta?.query !== undefined || tr.docChanged) {
              value.hits = search(next.doc, value.query);
              value.index = Math.max(0, Math.min(value.index, value.hits.length - 1));
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const s = FIND.getState(state);
            if (!s?.query || !s.hits.length) return null;
            return DecorationSet.create(
              state.doc,
              s.hits.map((h, i) => Decoration.inline(h.from, h.to, { class: i === s.index ? 'find-hit current' : 'find-hit' })),
            );
          },
        },
      }),
    ];
  },
});

export const findState = (editor: Editor): FindState => FIND.getState(editor.state) ?? { query: '', index: 0, hits: [] };

const caretBeforeFind = new WeakMap<Editor, { anchor: number; head: number }>();

export function setQuery(editor: Editor, query: string) {
  if (!findState(editor).query || !caretBeforeFind.has(editor)) caretBeforeFind.set(editor, { anchor: editor.state.selection.anchor, head: editor.state.selection.head });
  editor.view.dispatch(editor.state.tr.setMeta(FIND, { query, index: 0 }));
  selectHit(editor, 0);
  const was = caretBeforeFind.get(editor)!;
  if (findState(editor).hits.length) return;
  const max = editor.state.doc.content.size;
  const at = (n: number) => editor.state.doc.resolve(Math.min(Math.max(0, n), max));
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(at(was.anchor), at(was.head))).setMeta('addToHistory', false));
}

export function step(editor: Editor, dir: 1 | -1) {
  const { hits, index } = findState(editor);
  if (!hits.length) return;
  selectHit(editor, (index + dir + hits.length) % hits.length);
}

/**
 * Bring the match into view. ProseMirror's own `scrollIntoView()` anchors on the DOM selection, which
 * sits in the find box while you are typing — so it looks for a scroller around *that* and the note
 * never moves. The element under the match is the anchor that always belongs to the note's scroller.
 * It only scrolls when the match is not comfortably on screen: the bar covers the top of the note, and
 * a page that jumps at every keystroke is worse than one that stays put.
 */
const FIND_BAR_FALLBACK_BOTTOM = 96;
function reveal(editor: Editor, from: number) {
  const box = editor.view.coordsAtPos(from);
  const bar = document.querySelector('.find')?.getBoundingClientRect().bottom ?? FIND_BAR_FALLBACK_BOTTOM;
  if (box.top > Math.max(FIND_BAR_FALLBACK_BOTTOM, bar + 4) && box.bottom < window.innerHeight - 24) return;
  const dom = editor.view.domAtPos(from).node;
  const el = dom.nodeType === Node.TEXT_NODE ? dom.parentElement : (dom as HTMLElement);
  el?.scrollIntoView({ block: 'center' });
}

function selectHit(editor: Editor, index: number) {
  const { hits } = findState(editor);
  const hit = hits[index];
  const tr = editor.state.tr.setMeta(FIND, { index });
  if (hit) {
    const $at = tr.doc.resolve(hit.from);
    for (let d = $at.depth; d > 0; d--) {
      const n = $at.node(d);
      if (n.type.name === 'details' && !n.attrs.open) tr.setNodeAttribute($at.before(d), 'open', true);
    }
    tr.setMeta('addToHistory', false);
    tr.setSelection(TextSelection.create(tr.doc, hit.from, hit.to));
  }
  editor.view.dispatch(tr);
  if (hit) reveal(editor, hit.from);
}

export function replaceOne(editor: Editor, text: string) {
  const { hits, index } = findState(editor);
  let hit = hits[index];
  if (hit?.atom) {
    const next = hits.findIndex((h, i) => !h.atom && i > index);
    const any = next >= 0 ? next : hits.findIndex((h) => !h.atom);
    if (any < 0) return;
    hit = hits[any];
  }
  if (!hit) return;
  editor.view.dispatch(put(editor, editor.state.tr, hit, text));
  const left = findState(editor).hits;
  if (!left.length) return;
  const next = left.findIndex((h) => h.from >= hit.from + text.length);
  selectHit(editor, next >= 0 ? next : 0);
}

export function replaceAll(editor: Editor, text: string) {
  const { hits } = findState(editor);
  if (!hits.length) return;
  const tr = editor.state.tr;
  for (const hit of [...hits].reverse()) if (!hit.atom) put(editor, tr, hit, text);
  editor.view.dispatch(tr);
}

/** `text` in place of the match, in the marks of its first character: a match over "**quick** brown" is all bold, as
 *  typing over it would make it (ProseMirror's own choice dropped a mark the match ran out of) */
function put(editor: Editor, tr: Transaction, hit: Hit, text: string) {
  const marks = tr.doc.nodeAt(hit.from)?.marks ?? [];
  return text ? tr.replaceWith(hit.from, hit.to, editor.schema.text(text, marks)) : tr.delete(hit.from, hit.to);
}

export const clearFind = (editor: Editor) => editor.view.dispatch(editor.state.tr.setMeta(FIND, { query: '', index: 0 }));
