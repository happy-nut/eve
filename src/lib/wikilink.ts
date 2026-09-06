import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type MarkdownIt from 'markdown-it';

/**
 * [[Note title]] — an inline atom that links to another note by title.
 * Markdown: serialized/parsed as `[[Title]]`. Typing `[[` opens a suggestion popup.
 */
export interface WikiLinkOptions {
  onOpen: (title: string) => void;
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onOpen: () => {}, suggestion: { char: '[[', pluginKey: new PluginKey('wikiLink') } };
  },

  addAttributes() {
    return { title: { default: '', parseHTML: (el) => el.getAttribute('data-wikilink') } };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-wikilink': node.attrs.title, class: 'wikilink' }),
      node.attrs.title,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'wikilink';
      dom.dataset.wikilink = node.attrs.title;
      dom.textContent = node.attrs.title;
      dom.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.options.onOpen(node.attrs.title);
      });
      return { dom };
    };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[[${node.attrs.title}]]`);
        },
        parse: {
          setup(md: MarkdownIt) {
            md.inline.ruler.before('link', 'wikilink', (state, silent) => {
              const src = state.src;
              if (src.charCodeAt(state.pos) !== 0x5b || src.charCodeAt(state.pos + 1) !== 0x5b) return false;
              const end = src.indexOf(']]', state.pos + 2);
              if (end < 0) return false;
              const title = src.slice(state.pos + 2, end).trim();
              if (!title || title.includes('\n')) return false;
              if (!silent) state.push('wikilink', '', 0).content = title;
              state.pos = end + 2;
              return true;
            });
            md.renderer.rules.wikilink = (tokens, i) => {
              const t = tokens[i].content.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
              return `<span data-wikilink="${t}">${t}</span>`;
            };
          },
        },
      },
    };
  },
});
