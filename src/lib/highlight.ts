import { Mark, markInputRule, markPasteRule } from '@tiptap/core';
import type MarkdownIt from 'markdown-it';

/**
 * ==highlighted== text (Obsidian's highlight): a mark drawn like a marker pen. Markdown keeps the `==`
 * pair; typing `==text==` or pasting it turns it into the mark, ⌘⇧H (rebindable) toggles it.
 */
export const Highlight = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML() {
    return ['mark', 0];
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
        serialize: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
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
