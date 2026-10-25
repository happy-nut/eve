import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { chipLabel } from './date';

/**
 * Find (and replace) inside the open note. Matches are decorations, so nothing in the document is
 * touched until a replace actually runs.
 *
 * ponytail: plain case-insensitive text. Regex if it ever bites.
 */
export const FIND = new PluginKey<FindState>('eve-find');

/** `atom`: the match is in (or runs into) a [[link]] or a date, shown but not replaced, which would cut it up */
export interface Hit { from: number; to: number; atom?: boolean }
export interface FindState { query: string; index: number; hits: Hit[] }

/** what an inline node that is not text reads as on screen, for the search: a [[link]] its words, a date its day */
function shown(node: PMNode): string {
  if (node.type.name === 'wikiLink') return node.attrs.alias || node.attrs.title || '';
  if (node.type.name === 'dateMention') return chipLabel(node.attrs);
  if (node.type.name === 'hardBreak') return '\n';
  return '\ufffc'; // a picture, a formula: nothing to find in it
}

/**
 * Each line is searched as it reads, the words of it whatever their marks: matched one text node at a time, a phrase
 * running over bold ("The **quick** brown") or into a [[link]] was not found. A match is mapped back to where it
 * is in the note, all of an atom it touches included.
 */
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
    if (!q.test(text)) return false; // the usual line: nothing in it, and nothing more to work out
    q.lastIndex = 0; // (matchAll starts where the test left off)
    // where each piece of the line starts in its text and in the note
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

/** Type in the find box. The first match is selected, so Enter walks on from there. */
export function setQuery(editor: Editor, query: string) {
  editor.view.dispatch(editor.state.tr.setMeta(FIND, { query, index: 0 }));
  show(editor, 0);
}

/** Step to the next (1) or previous (-1) match, wrapping around. */
export function step(editor: Editor, dir: 1 | -1) {
  const { hits, index } = findState(editor);
  if (!hits.length) return;
  show(editor, (index + dir + hits.length) % hits.length);
}

/**
 * Bring the match into view. ProseMirror's own `scrollIntoView()` anchors on the DOM selection, which
 * sits in the find box while you are typing — so it looks for a scroller around *that* and the note
 * never moves. The element under the match is the anchor that always belongs to the note's scroller.
 * It only scrolls when the match is not comfortably on screen: the bar covers the top of the note, and
 * a page that jumps at every keystroke is worse than one that stays put.
 */
const BAR = 96; // the find bar's reach down the top of the note
function reveal(editor: Editor, from: number) {
  const box = editor.view.coordsAtPos(from);
  // where the bar really ends (a phone's, with its replace row, reaches further than the Mac's)
  const bar = document.querySelector('.find')?.getBoundingClientRect().bottom ?? BAR;
  if (box.top > Math.max(BAR, bar + 4) && box.bottom < window.innerHeight - 24) return;
  const dom = editor.view.domAtPos(from).node;
  const el = dom.nodeType === Node.TEXT_NODE ? dom.parentElement : (dom as HTMLElement);
  el?.scrollIntoView({ block: 'center' });
}

/** Put the match on screen and select it, without taking the keyboard out of the find box. */
function show(editor: Editor, index: number) {
  const { hits } = findState(editor);
  const hit = hits[index];
  const tr = editor.state.tr.setMeta(FIND, { index });
  // a match inside a folded toggle is shown, not counted out of sight: its toggles open
  if (hit) {
    const $at = tr.doc.resolve(hit.from);
    for (let d = $at.depth; d > 0; d--) {
      const n = $at.node(d);
      if (n.type.name === 'details' && !n.attrs.open) tr.setNodeAttribute($at.before(d), 'open', true);
    }
    tr.setMeta('addToHistory', false);
  }
  if (hit) tr.setSelection(TextSelection.create(tr.doc, hit.from, hit.to));
  editor.view.dispatch(tr);
  if (hit) reveal(editor, hit.from);
}

/**
 * Replace the match in view, then sit on the one that follows it, so Enter walks the note in order. The one
 * after is the first that starts past what was just put in: the replacement may itself match ("eve" → "Eve",
 * the search ignoring case; "eve" → "steve"), and the same index then stayed on it, replacing it over and over.
 */
export function replaceOne(editor: Editor, text: string) {
  const { hits, index } = findState(editor);
  let hit = hits[index];
  // one in a [[link]] or a date is shown, not replaced: the next that can be is
  if (hit?.atom) {
    const next = hits.findIndex((h, i) => !h.atom && i > index);
    const any = next >= 0 ? next : hits.findIndex((h) => !h.atom);
    if (any < 0) return;
    hit = hits[any];
  }
  if (!hit) return;
  editor.view.dispatch(put(editor, editor.state.tr, hit, text));
  const left = findState(editor).hits; // the plugin re-searched the changed doc
  if (!left.length) return;
  const next = left.findIndex((h) => h.from >= hit.from + text.length);
  show(editor, next >= 0 ? next : 0); // past the last one: round to the first again
}

/** Replace every match, back to front so the earlier positions stay valid. */
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
