import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, Selection, TextSelection } from '@tiptap/pm/state';
import { liftTarget } from '@tiptap/pm/transform';
import { ui } from './ui.svelte';
import { isMobile } from './platform';
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
      // written as the data- attributes they are read from (renderHTML below): a copied folded callout came back unfolded
      emoji: { default: '💡', parseHTML: (el) => el.getAttribute('data-callout') || '💡', renderHTML: () => ({}) },
      fold: { default: '', parseHTML: (el) => el.getAttribute('data-fold') ?? '', renderHTML: (a) => (a.fold ? { 'data-fold': a.fold } : {}) },
      titled: { default: false, parseHTML: (el) => el.hasAttribute('data-titled'), renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    // a callout copied in the editor comes back as it was drawn, its icon beside its body: read whole, the icon was read
    // as a line of it ("✏️" became the title, the title its first line). Read from markdown, it is the body alone.
    return [{ tag: 'div[data-callout]', contentElement: (el) => (el as HTMLElement).querySelector<HTMLElement>(':scope > .callout-body') ?? (el as HTMLElement) }];
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
        else if (!isMobile) editor.commands.focus(); // dismissed: back into the note all the same
      });
      const contentDOM = document.createElement('div');
      contentDOM.className = 'callout-body';
      dom.append(emoji, contentDOM);
      return {
        dom,
        contentDOM,
        // the icon is the view's own, not the note's: WebKit touches its style after a drag, and ProseMirror read
        // that back as an edit of the callout and collapsed a selection running past it to where it started
        ignoreMutation: (m) => m.type !== 'selection' && !contentDOM.contains(m.target),
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
  // a title is a line of words: its first line made something else (a to-do from the phone's bar, a list, a heading),
  // the callout has none, as its file then says. Left titled, the note open was not the note saved, and read back
  // it changed under the caret
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction: (trs, _old, state) => {
        if (!trs.some((t) => t.docChanged)) return null;
        let tr = null as ReturnType<typeof state.tr.setNodeAttribute> | null;
        state.doc.descendants((n, pos) => {
          if (n.type.name !== 'callout' || !n.attrs.titled) return;
          const first = n.firstChild;
          if (first?.type.name === 'paragraph' && first.content.size) return;
          tr = (tr ?? state.tr).setNodeAttribute(pos, 'titled', false);
        });
        return tr;
      },
    })];
  },
  addKeyboardShortcuts() {
    // Enter on an empty trailing paragraph leaves the callout
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.content.size !== 0) return false;
        const callout = $from.node(-1);
        if (callout?.type.name !== 'callout' || $from.index(-1) !== callout.childCount - 1 || callout.childCount < 2) return false;
        // one step after the other on the same transaction: the place after the callout is mapped past the
        // deleted line (worked out on the old note, it landed two inside whatever came next)
        return editor.chain().command(({ tr }) => {
          tr.delete($from.before(), $from.after());
          const at = tr.mapping.map($from.after(-1));
          tr.insert(at, editor.schema.nodes.paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, at + 1));
          return true;
        }).focus().run();
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
          // the marker as it was written, before the HTML has it as text: a quote starting with "[!note]" typed as
          // text is written "\[!note\]", and read from the HTML alone it was a callout the next time
          setup(md: any) {
            md.core.ruler.after('block', 'eve-callout-marker', (state: any) => {
              const t = state.tokens;
              for (let i = 0; i + 2 < t.length; i++) {
                if (t[i].type === 'blockquote_open' && t[i + 1].type === 'paragraph_open' && /^\[![^\]]+\]/.test(t[i + 2].content)) t[i].attrSet('data-eve-callout', '');
              }
            });
          },
          updateDOM(root: HTMLElement) {
            for (const bq of [...root.querySelectorAll('blockquote[data-eve-callout]')]) {
              const first = bq.firstElementChild;
              const m = first?.tagName === 'P' && /^\[!([^\]]+)\]([+-]?)[ \t]*/.exec(first.textContent ?? '');
              if (!m) continue;
              const text = first.firstChild;
              if (text && text.nodeType === 3) text.textContent = (text.textContent ?? '').replace(/^\[!([^\]]+)\][+-]?[ \t]*/, '');
              // anything left on the marker's line is the title: it becomes a paragraph of its own
              let titled = false;
              if (text && text.nodeType === 3 && text.textContent!.startsWith('\n')) text.textContent = text.textContent!.slice(1);
              else if (first.textContent?.trim()) titled = splitTitle(first);
              // an empty line kept on purpose is written as a no-break space (trim() takes that too, and dropped the line)
              if (!/[^\s]|\u00a0/.test(first.textContent ?? '') && first.children.length === 0) first.remove();
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

/** The callout's ⌫ and Delete at its edges, ahead of the list and line keys that otherwise take them first. */
export const CalloutEdges = Extension.create({
  name: 'calloutEdges',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      // ⌫ at the start of a titled callout's title: the title steps out, and the callout has no title now (the body
      // line under it had become the title, in bold, untouched)
      Backspace: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        const callout = $from.depth > 1 ? $from.node(-1) : null;
        if (!empty || $from.parentOffset !== 0 || callout?.type.name !== 'callout' || !callout.attrs.titled || $from.index(-1) !== 0) return false;
        // the range read off the note with the title cleared: lift copies the callout around what it lifts out
        const tr = state.tr.setNodeAttribute($from.before(-1), 'titled', false);
        const range = tr.doc.resolve($from.pos).blockRange();
        const target = range && liftTarget(range);
        if (!range || target == null) return false;
        view.dispatch(tr.lift(range, target).scrollIntoView());
        return true;
      },
      // Delete at the end of the line just before a callout: the caret goes into its first line (an empty line goes).
      // The stock join pulled that first line out of the callout and left the caret where it was.
      Delete: ({ editor }) => {
        const { state, view } = editor;
        const { $from, empty } = state.selection;
        if (!empty || !$from.parent.isTextblock || $from.depth === 0 || $from.parentOffset !== $from.parent.content.size) return false;
        if (state.doc.resolve($from.after()).nodeAfter?.type.name !== 'callout') return false;
        const tr = state.tr;
        if (!$from.parent.content.size) tr.delete($from.before(), $from.after());
        const into = Selection.findFrom(tr.doc.resolve(tr.mapping.map($from.after()) + 1), 1, true);
        if (into) view.dispatch(tr.setSelection(into).scrollIntoView());
        return !!into;
      },
    };
  },
});
