import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * A click lands in the block it was made on. WebKit places the caret from the point clicked, and on what is not a
 * line of text it reaches for the nearest text it finds, which may be another block: beside a picture narrower than
 * the note, or on the empty line under it, the caret went into the block below; on a code block's padding, into the
 * block above. After a click (a press and release in one place: a drag is left as the browser made it), when the
 * caret is outside the block under the pointer it is put inside it: a picture, card or other block of no text is
 * selected whole, a block of text gets the caret on its line nearest the click.
 */
export const ClickTarget = Extension.create({
  name: 'clickTarget',
  addProseMirrorPlugins() {
    let down: { x: number; y: number; block: number } | null = null;
    let typed = 0; // keys pressed since: a selection they made (⇧↑ right after the click) is not the click's to put right
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, e) => {
              down = e.button === 0 && !e.shiftKey && e.detail === 1 ? { x: e.clientX, y: e.clientY, block: blockAt(view, e) } : null;
              return false;
            },
            keydown: () => { typed++; return false; },
            mouseup: (view, e) => {
              const d = down;
              down = null;
              if (!d || d.block < 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return false;
              // after ProseMirror has read the selection the browser made
              const keys = typed;
              setTimeout(() => { if (!view.isDestroyed && typed === keys) settle(view, d.block, d.x, d.y); }, 0);
              return false;
            },
          },
        },
      }),
    ];
  },
});

/**
 * The note's top-level block a pointer event is over (by height, when it is on the note's own margin), or -1: also
 * for a click on something of its own that is not the text (a callout's icon, a code block's language, a checkbox,
 * a caption, a board, a link card), which does what it does and leaves the caret be.
 */
function blockAt(view: EditorView, e: MouseEvent): number {
  const target = e.target as HTMLElement | null;
  if (!target || target.closest('input, button, select, label, a, [contenteditable="false"], .callout-emoji, .code-lang, .img-cap')) return -1;
  let el: HTMLElement | null = target;
  while (el && el.parentElement !== view.dom) el = el.parentElement;
  if (!el || el === view.dom) {
    // beside a block narrower than the note (a picture), or on the note's padding: the block at that height
    el = ([...view.dom.children] as HTMLElement[]).find((c) => { const r = c.getBoundingClientRect(); return r.height > 0 && e.clientY >= r.top && e.clientY <= r.bottom; }) ?? null;
  }
  if (!el) return -1;
  try { return view.state.doc.resolve(view.posAtDOM(el, 0)).index(0); } catch { return -1; }
}

function settle(view: EditorView, index: number, x: number, y: number) {
  const { doc } = view.state;
  if (index >= doc.childCount) return;
  let start = 0;
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize;
  const node = doc.child(index), end = start + node.nodeSize;
  const sel = view.state.selection;
  if (sel.from >= start && sel.to <= end) return; // where it was clicked: nothing to put right
  if (!node.isTextblock && !hasText(node)) {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(doc, start)));
    return;
  }
  // a line of the block: the click's height, kept inside the block's text (a code block's own lines, not its padding)
  const dom = view.nodeDOM(start) as HTMLElement | null;
  const box = (dom?.querySelector('pre code') ?? dom)?.getBoundingClientRect();
  let pos: number | null = null;
  if (box) {
    const hit = view.posAtCoords({ left: Math.min(Math.max(x, box.left + 2), box.right - 2), top: Math.min(Math.max(y, box.top + 3), box.bottom - 3) });
    if (hit && hit.pos > start && hit.pos < end) pos = hit.pos;
  }
  const $pos = doc.resolve(pos ?? (box && y > (box.top + box.bottom) / 2 ? end - 1 : start + 1));
  const near = TextSelection.near($pos, pos === null && box && y > (box.top + box.bottom) / 2 ? -1 : 1);
  if (near.from >= start && near.to <= end) view.dispatch(view.state.tr.setSelection(near));
}

const hasText = (node: { descendants: (f: (n: { isTextblock: boolean }) => boolean | void) => void }) => {
  let found = false;
  node.descendants((n) => { if (n.isTextblock) found = true; return !found; });
  return found;
};
