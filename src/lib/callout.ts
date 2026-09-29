import { Node, mergeAttributes } from '@tiptap/core';
import { ui } from './ui.svelte';
import { customIcon } from './icons';
import { calloutKind } from './calloutKind';

const renderIcon = (el: HTMLElement, icon: string) => {
  const c = customIcon(icon);
  if (c) el.innerHTML = c.svg; else el.textContent = calloutKind(icon)?.icon ?? icon;
};
/** the box's colour: an Obsidian type's own, else the plain grey */
const colorOf = (icon: string) => calloutKind(icon)?.color ?? '';

/**
 * Notion-style callout: emoji + colored box. Markdown form, Obsidian's:
 *   > [!💡]            an icon of its own
 *   > [!warning]- Title  or one of Obsidian's types (its icon and colour; the word stays in the file, and
 *   > text               the fold mark after it, - or +, is kept though Eve does not fold)
 * Text on the marker's own line is the callout's title: the box's first paragraph, in bold, written back
 * on that line.
 */
/** Split a paragraph at its first line break: what came before it becomes a paragraph of its own, before
 *  it (marks and all). A paragraph of one line is all title. Returns whether there was a title. */
function splitTitle(p: Element): boolean {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const at = t.data.indexOf('\n');
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(p, 0);
    range.setEnd(t, at);
    const title = document.createElement('p');
    title.append(range.extractContents());
    t.data = t.data.slice(1); // the break itself (extractContents left the text from it on)
    p.before(title);
    return true;
  }
  // one line: it is the title, and the body follows in the next paragraphs
  return true;
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      emoji: { default: '💡', parseHTML: (el) => el.getAttribute('data-callout') || '💡' },
      fold: { default: '', parseHTML: (el) => el.getAttribute('data-fold') ?? '' },
      titled: { default: false, parseHTML: (el) => el.hasAttribute('data-titled') },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-callout': node.attrs.emoji, 'data-color': colorOf(node.attrs.emoji), ...(node.attrs.titled ? { 'data-titled': '' } : {}), class: 'callout' }),
      ['span', { class: 'callout-emoji', contenteditable: 'false' }, calloutKind(node.attrs.emoji)?.icon ?? node.attrs.emoji],
      ['div', { class: 'callout-body' }, 0],
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'callout';
      dom.dataset.callout = node.attrs.emoji;
      dom.dataset.color = colorOf(node.attrs.emoji);
      dom.toggleAttribute('data-titled', !!node.attrs.titled);
      const emoji = document.createElement('span');
      emoji.className = 'callout-emoji';
      emoji.contentEditable = 'false';
      renderIcon(emoji, node.attrs.emoji);
      emoji.title = 'Change icon';
      emoji.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        const v = await ui.pickEmoji(emoji, node.attrs.emoji);
        if (v?.trim()) editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(getPos()!, undefined, { ...tr.doc.nodeAt(getPos()!)?.attrs, emoji: v.trim() });
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
          dom.dataset.color = colorOf(n.attrs.emoji);
          dom.toggleAttribute('data-titled', !!n.attrs.titled);
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
            state.write(`[!${node.attrs.emoji}]${node.attrs.fold}`);
            const first = node.firstChild;
            if (node.attrs.titled && first?.type.name === 'paragraph' && first.content.size) {
              // the title back on the marker's line, the rest below it
              state.write(' ');
              state.renderInline(first);
              // a paragraph after it goes on the very next line, as Obsidian writes it (read back, the
              // title's line break splits them again); anything else keeps a blank line between
              if (node.childCount > 1 && node.child(1).type.name === 'paragraph') state.ensureNewLine();
              else state.closeBlock(first);
              node.forEach((child: any, _: number, i: number) => { if (i > 0) state.render(child, node, i); });
            } else {
              state.ensureNewLine();
              state.renderContent(node);
            }
          });
        },
        parse: {
          updateDOM(root: HTMLElement) {
            for (const bq of [...root.querySelectorAll('blockquote')]) {
              const first = bq.firstElementChild;
              const m = first?.tagName === 'P' && /^\[!([^\]]+)\]([+-]?)[ \t]*/.exec(first.textContent ?? '');
              if (!m) continue;
              const text = first.firstChild;
              if (text && text.nodeType === 3) text.textContent = (text.textContent ?? '').replace(/^\[!([^\]]+)\][+-]?[ \t]*/, '');
              // anything left on the marker's line is the title: it becomes a paragraph of its own
              let titled = false;
              if (text && text.nodeType === 3 && text.textContent!.startsWith('\n')) text.textContent = text.textContent!.slice(1);
              else if (first.textContent?.trim()) titled = splitTitle(first);
              if (!first.textContent?.trim() && first.children.length === 0) first.remove();
              const div = document.createElement('div');
              div.setAttribute('data-callout', m[1]);
              if (m[2]) div.setAttribute('data-fold', m[2]);
              if (titled) div.setAttribute('data-titled', '');
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
