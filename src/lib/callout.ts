import { Node, mergeAttributes } from '@tiptap/core';
import { ui } from './ui.svelte';
import { customIcon } from './icons';

const renderIcon = (el: HTMLElement, icon: string) => {
  const c = customIcon(icon);
  if (c) el.innerHTML = c.svg; else el.textContent = icon;
};

/**
 * Notion-style callout: emoji + colored box. Markdown form (Obsidian-compatible-ish):
 *   > [!💡]
 *   > text
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return { emoji: { default: '💡', parseHTML: (el) => el.getAttribute('data-callout') || '💡' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-callout': node.attrs.emoji, class: 'callout' }),
      ['span', { class: 'callout-emoji', contenteditable: 'false' }, node.attrs.emoji],
      ['div', { class: 'callout-body' }, 0],
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'callout';
      dom.dataset.callout = node.attrs.emoji;
      const emoji = document.createElement('span');
      emoji.className = 'callout-emoji';
      emoji.contentEditable = 'false';
      renderIcon(emoji, node.attrs.emoji);
      emoji.title = 'Change icon';
      emoji.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        const v = await ui.pickEmoji(emoji, node.attrs.emoji);
        if (v?.trim()) editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(getPos()!, undefined, { emoji: v.trim() });
          return true;
        }).run();
      });
      const contentDOM = document.createElement('div');
      contentDOM.className = 'callout-body';
      dom.append(emoji, contentDOM);
      return {
        dom,
        contentDOM,
        update: (n) => {
          if (n.type.name !== 'callout') return false;
          renderIcon(emoji, n.attrs.emoji);
          dom.dataset.callout = n.attrs.emoji;
          return true;
        },
      };
    };
  },
  addKeyboardShortcuts() {
    // Enter on an empty trailing paragraph leaves the callout
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.content.size !== 0) return false;
        const callout = $from.node(-1);
        if (callout?.type.name !== 'callout' || $from.index(-1) !== callout.childCount - 1 || callout.childCount < 2) return false;
        return editor.chain().deleteNode('paragraph').insertContentAt($from.after(-1), { type: 'paragraph' }).focus().run();
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.wrapBlock('> ', null, node, () => {
            state.write(`[!${node.attrs.emoji}]`);
            state.ensureNewLine();
            state.renderContent(node);
          });
        },
        parse: {
          updateDOM(root: HTMLElement) {
            for (const bq of [...root.querySelectorAll('blockquote')]) {
              const first = bq.firstElementChild;
              const m = first?.tagName === 'P' && /^\[!([^\]]+)\]\s*/.exec(first.textContent ?? '');
              if (!m) continue;
              const text = first.firstChild;
              if (text && text.nodeType === 3) text.textContent = (text.textContent ?? '').replace(/^\[!([^\]]+)\]\s*/, '');
              if (!first.textContent?.trim() && first.children.length === 0) first.remove();
              const div = document.createElement('div');
              div.setAttribute('data-callout', m[1]);
              div.append(...bq.childNodes);
              if (!div.childNodes.length) div.append(document.createElement('p'));
              bq.replaceWith(div);
            }
          },
        },
      },
    };
  },
});
