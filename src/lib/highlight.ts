import { Mark, markInputRule, markPasteRule, type Editor } from '@tiptap/core';
import type MarkdownIt from 'markdown-it';
import { ui, under, type MenuItem } from './ui.svelte';
import { appearance } from './appearance.svelte';

export const isPen = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
/** the colour as the browser hands a style back (rgb(…)), or as written: #rrggbb, or null */
function penOf(css: string): string | null {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css.trim());
  const hex = m ? '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : css.trim();
  return isPen(hex) ? hex.toLowerCase() : null;
}

export function penName(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.06) return max > 0.85 ? 'White' : max < 0.25 ? 'Black' : 'Grey';
  const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const hue = (h + 360) % 360;
  if ((hue >= 330 || hue < 15) && min > 0.6) return 'Pink';
  return hue < 15 ? 'Red' : hue < 40 ? 'Orange' : hue < 70 ? 'Yellow' : hue < 165 ? 'Green' : hue < 195 ? 'Teal' : hue < 255 ? 'Blue' : hue < 290 ? 'Purple' : hue < 335 ? 'Pink' : 'Red';
}

export function highlightMenu(editor: Editor) {
  const { selection } = editor.state;
  if (selection.empty) { editor.chain().focus().toggleMark('highlight').run(); return; }
  const end = editor.view.coordsAtPos(selection.to);
  const pens = appearance.s.highlights.filter(isPen);
  const items: MenuItem[] = pens.map((c, i) => ({
    label: penName(c),
    swatch: c,
    run: () => editor.chain().focus().setMark('highlight', { color: i ? c : null }).run(),
  }));
  if (editor.isActive('highlight')) items.push({ label: 'Remove highlight', sep: true, run: () => editor.chain().focus().unsetMark('highlight').run() });
  ui.openMenu(under(end), items);
}

export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => penOf(el.style.backgroundColor || el.style.background || ''),
        renderHTML: (a: { color: string | null }) => (isPen(a.color) ? { style: `background-color: ${a.color}` } : {}),
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
          open: (_s: unknown, mark: { attrs: { color: string | null } }) => (isPen(mark.attrs.color) ? `<mark style="background-color: ${mark.attrs.color}">` : '=='),
          close: (_s: unknown, mark: { attrs: { color: string | null } }) => (isPen(mark.attrs.color) ? '</mark>' : '=='),
          mixable: true, expelEnclosingWhitespace: true,
        },
        parse: {
          setup(md: MarkdownIt) {
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
