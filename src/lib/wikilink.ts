import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { NodeSelection, TextSelection, PluginKey } from '@tiptap/pm/state';
import { customIcon } from './icons';
import type MarkdownIt from 'markdown-it';
import { splitAlias } from './markdown';

/**
 * [[Note title]] — an inline atom that links to another note by title.
 * Markdown: serialized/parsed as `[[Title]]`, or `[[Title|shown as]]` (Obsidian's alias: the link opens
 * Title and reads as the alias; inside a table the bar is escaped, `[[Title\|shown as]]`). Typing `[[`
 * opens a suggestion popup.
 */


export interface WikiLinkOptions {
  onOpen: (title: string) => void;
  /** the linked note's icon, so a link reads like its row in the sidebar ('' = none) */
  iconOf: (title: string) => string;
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onOpen: () => {}, iconOf: () => '', suggestion: { char: '[[', pluginKey: new PluginKey('wikiLink') } };
  },

  addAttributes() {
    return {
      title: { default: '', parseHTML: (el) => el.getAttribute('data-wikilink') },
      alias: { default: '', parseHTML: (el) => el.getAttribute('data-alias') ?? '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-wikilink': node.attrs.title, ...(node.attrs.alias ? { 'data-alias': node.attrs.alias } : {}), class: 'wikilink' }),
      node.attrs.alias || node.attrs.title,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const title: string = node.attrs.title;
      const dom = document.createElement('span');
      dom.className = 'wikilink';
      dom.dataset.wikilink = title;
      const icon = this.options.iconOf(title);
      if (icon) {
        const slot = document.createElement('span');
        slot.className = 'wl-ico';
        const custom = customIcon(icon);
        if (custom) slot.innerHTML = custom.svg; else slot.textContent = icon;
        dom.append(slot);
      }
      const text = document.createElement('span');
      text.className = 'wl-t';
      text.textContent = node.attrs.alias || title;
      dom.append(text);
      dom.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.options.onOpen(title);
      });
      return { dom };
    };
  },

  addKeyboardShortcuts() {
    // a selected link opens on Enter (and ⌘↓, the "go into it" gesture), like clicking it
    const open = () => {
      const sel = this.editor.state.selection;
      if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name) return false;
      this.options.onOpen(sel.node.attrs.title);
      return true;
    };
    // arrowing onto a link selects it instead of skipping over it, so there is a keyboard way in:
    // ← / → lands on the link, Enter (or ⌘↓) opens it, another ← / → steps past it as usual
    const step = (dir: 1 | -1) => () => {
      const { state } = this.editor;
      const sel = state.selection;
      if (!sel.empty || !(sel instanceof TextSelection)) return false;
      const node = dir === 1 ? sel.$from.nodeAfter : sel.$from.nodeBefore;
      if (!node || node.type.name !== this.name) return false;
      const at = dir === 1 ? sel.from : sel.from - node.nodeSize;
      this.editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
      return true;
    };
    return { Enter: open, 'Mod-ArrowDown': open, ArrowRight: step(1), ArrowLeft: step(-1) };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[[${node.attrs.title}${node.attrs.alias ? `|${node.attrs.alias}` : ''}]]`);
        },
        parse: {
          setup(md: MarkdownIt) {
            md.inline.ruler.before('link', 'wikilink', (state, silent) => {
              const src = state.src;
              if (src.charCodeAt(state.pos) !== 0x5b || src.charCodeAt(state.pos + 1) !== 0x5b) return false;
              const end = src.indexOf(']]', state.pos + 2);
              if (end < 0) return false;
              const inner = src.slice(state.pos + 2, end);
              const [title, alias] = splitAlias(inner);
              if (!title || inner.includes('\n')) return false;
              if (!silent) {
                const t = state.push('wikilink', '', 0);
                t.content = title;
                t.meta = { alias };
              }
              state.pos = end + 2;
              return true;
            });
            md.renderer.rules.wikilink = (tokens, i) => {
              const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
              const t = esc(tokens[i].content), a = esc(tokens[i].meta?.alias ?? '');
              return a ? `<span data-wikilink="${t}" data-alias="${a}">${a}</span>` : `<span data-wikilink="${t}">${t}</span>`;
            };
          },
        },
      },
    };
  },
});
