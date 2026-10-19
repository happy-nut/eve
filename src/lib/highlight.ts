import { Mark, markInputRule, markPasteRule, type Editor } from '@tiptap/core';
import type MarkdownIt from 'markdown-it';
import { ui, type MenuItem } from './ui.svelte';

/**
 * The marker pens. Yellow is the plain one, written `==text==` as Obsidian writes it; any other is written
 * `<mark data-color="green">text</mark>`, which other apps still show as a highlight. Each colour's look is in app.css.
 */
export const HIGHLIGHTS = [
  { id: '', label: 'Yellow', swatch: '🟨' },
  { id: 'green', label: 'Green', swatch: '🟩' },
  { id: 'blue', label: 'Blue', swatch: '🟦' },
  { id: 'pink', label: 'Pink', swatch: '🟥' },
  { id: 'purple', label: 'Purple', swatch: '🟪' },
] as const;
const COLORS = new Set<string>(HIGHLIGHTS.map((h) => h.id).filter(Boolean));

/**
 * ⌘⇧H (or Highlight in the note's menu, or the phone bar's pen): the pens to pick from, under the words chosen; ↩
 * takes the first (yellow). With the words already highlighted, taking it off is offered too. Nothing chosen: the
 * yellow pen turned on or off for what is typed next, as before.
 */
export function highlightMenu(editor: Editor) {
  const { selection } = editor.state;
  if (selection.empty) { editor.chain().focus().toggleMark('highlight').run(); return; }
  const end = editor.view.coordsAtPos(selection.to);
  const items: MenuItem[] = HIGHLIGHTS.map((h) => ({
    label: `${h.swatch}  ${h.label}`,
    run: () => editor.chain().focus().setMark('highlight', { color: h.id || null }).run(),
  }));
  if (editor.isActive('highlight')) items.push({ label: 'Remove highlight', sep: true, run: () => editor.chain().focus().unsetMark('highlight').run() });
  ui.openMenu({ clientX: Math.round(end.left), clientY: Math.round(end.bottom + 4) }, items);
}

/**
 * ==highlighted== text (Obsidian's highlight): a mark drawn like a marker pen. Markdown keeps the `==`
 * pair; typing `==text==` or pasting it turns it into the mark, ⌘⇧H (rebindable) toggles it.
 */
export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => { const c = el.getAttribute('data-color'); return c && COLORS.has(c) ? c : null; },
        renderHTML: (a: { color: string | null }) => (a.color ? { 'data-color': a.color } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0];
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(==(?!\s)((?:[^=]|=(?!=))+?)(?<!\s)==)$/, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: /(?:^|\s)(==(?!\s)((?:[^=]|=(?!=))+?)(?<!\s)==)/g, type: this.type })];
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_s: unknown, mark: { attrs: { color: string | null } }) => (mark.attrs.color ? `<mark data-color="${mark.attrs.color}">` : '=='),
          close: (_s: unknown, mark: { attrs: { color: string | null } }) => (mark.attrs.color ? '</mark>' : '=='),
          mixable: true, expelEnclosingWhitespace: true,
        },
        parse: {
          setup(md: MarkdownIt) {
            // `==text==` -> <mark>text</mark>, with the text inside parsed as usual (bold, links…)
            md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
              const src = state.src, start = state.pos;
              if (src.charCodeAt(start) !== 0x3d || src.charCodeAt(start + 1) !== 0x3d) return false;
              const end = src.indexOf('==', start + 2);
              if (end < 0 || end === start + 2 || /\s/.test(src[start + 2]) || /\s/.test(src[end - 1])) return false;
              if (!silent) {
                const max = state.posMax;
                state.push('mark_open', 'mark', 1);
                state.pos = start + 2;
                state.posMax = end;
                state.md.inline.tokenize(state);
                state.posMax = max;
                state.push('mark_close', 'mark', -1);
              }
              state.pos = end + 2;
              return true;
            });
          },
        },
      },
    };
  },
});
