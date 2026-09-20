import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Find (and replace) inside the open note. Matches are decorations, so nothing in the document is
 * touched until a replace actually runs.
 *
 * ponytail: plain case-insensitive text, matched inside one text node at a time — a word split by a
 * mark boundary ("**wo**rd") is not found. Regex and mark-spanning matches if it ever bites.
 */
export const FIND = new PluginKey<FindState>('eve-find');

export interface Hit { from: number; to: number }
export interface FindState { query: string; index: number; hits: Hit[] }

function search(doc: PMNode, query: string): Hit[] {
  const hits: Hit[] = [];
  const q = query.toLowerCase();
  if (!q) return hits;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + q.length)) {
      hits.push({ from: pos + i, to: pos + i + q.length });
    }
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
  if (box.top > BAR && box.bottom < window.innerHeight - 24) return;
  const dom = editor.view.domAtPos(from).node;
  const el = dom.nodeType === Node.TEXT_NODE ? dom.parentElement : (dom as HTMLElement);
  el?.scrollIntoView({ block: 'center' });
}

/** Put the match on screen and select it, without taking the keyboard out of the find box. */
function show(editor: Editor, index: number) {
  const { hits } = findState(editor);
  const hit = hits[index];
  const tr = editor.state.tr.setMeta(FIND, { index });
  if (hit) tr.setSelection(TextSelection.create(tr.doc, hit.from, hit.to));
  editor.view.dispatch(tr);
  if (hit) reveal(editor, hit.from);
}

/**
 * Replace the match in view, then sit on the one that follows it — the replaced match leaves the list,
 * so the same index is already the next one, and Enter walks the note in order.
 */
export function replaceOne(editor: Editor, text: string) {
  const { hits, index } = findState(editor);
  const hit = hits[index];
  if (!hit) return;
  editor.view.dispatch(editor.state.tr.insertText(text, hit.from, hit.to));
  const left = findState(editor).hits; // the plugin re-searched the changed doc
  if (left.length) show(editor, index < left.length ? index : 0);
}

/** Replace every match, back to front so the earlier positions stay valid. */
export function replaceAll(editor: Editor, text: string) {
  const { hits } = findState(editor);
  if (!hits.length) return;
  const tr = editor.state.tr;
  for (const hit of [...hits].reverse()) tr.insertText(text, hit.from, hit.to);
  editor.view.dispatch(tr);
}

export const clearFind = (editor: Editor) => editor.view.dispatch(editor.state.tr.setMeta(FIND, { query: '', index: 0 }));
