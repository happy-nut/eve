import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { liftTarget } from '@tiptap/pm/transform';
import { ui } from './ui.svelte';
import { isMobile } from './platform';
import { customIcon } from './icons';
import { calloutKind } from './calloutKind';
import { whenComposed } from './ime';

const renderIcon = (el: HTMLElement, icon: string) => {
  const c = customIcon(icon);
  if (c) el.innerHTML = c.svg; else el.textContent = calloutKind(icon)?.icon ?? icon;
};
const colorOf = (icon: string) => calloutKind(icon)?.color ?? '';

function splitTitle(p: Element): void {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const at = t.data.indexOf('\n');
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(p, 0);
    range.setEnd(t, at);
    const title = document.createElement('p');
    title.append(range.extractContents());
    t.data = t.data.slice(1);
    p.before(title);
    return;
  }
}

const calloutBody = (el: HTMLElement): HTMLElement => el.querySelector<HTMLElement>(':scope > .callout-body') ?? el;

const dropTitleWithoutLine = () => new Plugin({
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
});

function stepTitleOut(state: EditorState, view: EditorView): boolean {
  const { $from, empty } = state.selection;
  const callout = $from.depth > 1 ? $from.node(-1) : null;
  if (!empty || $from.parentOffset !== 0 || callout?.type.name !== 'callout' || !callout.attrs.titled || $from.index(-1) !== 0) return false;
  const tr = state.tr.setNodeAttribute($from.before(-1), 'titled', false);
  const range = tr.doc.resolve($from.pos).blockRange();
  const target = range && liftTarget(range);
  if (!range || target == null) return false;
  view.dispatch(tr.lift(range, target).scrollIntoView());
  return true;
}

function enterCalloutFromLineAbove(state: EditorState, view: EditorView): boolean {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.depth === 0 || $from.parentOffset !== $from.parent.content.size) return false;
  if (state.doc.resolve($from.after()).nodeAfter?.type.name !== 'callout') return false;
  const tr = state.tr;
  if (!$from.parent.content.size) tr.delete($from.before(), $from.after());
  const into = Selection.findFrom(tr.doc.resolve(tr.mapping.map($from.after()) + 1), 1, true);
  if (into) view.dispatch(tr.setSelection(into).scrollIntoView());
  return !!into;
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      emoji: { default: '💡', parseHTML: (el) => el.getAttribute('data-callout') || '💡', renderHTML: () => ({}) },
      fold: { default: '', parseHTML: (el) => el.getAttribute('data-fold') ?? '', renderHTML: (a) => (a.fold ? { 'data-fold': a.fold } : {}) },
      titled: { default: false, parseHTML: (el) => el.hasAttribute('data-titled'), renderHTML: () => ({}) },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: (el) => calloutBody(el as HTMLElement) }];
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
      const emoji = document.createElement('span');
      emoji.className = 'callout-emoji';
      emoji.contentEditable = 'false';
      emoji.title = 'Change icon';
      let drawn = node;
      const draw = () => {
        renderIcon(emoji, drawn.attrs.emoji);
        dom.dataset.callout = drawn.attrs.emoji;
        dom.dataset.color = colorOf(drawn.attrs.emoji);
        dom.toggleAttribute('data-titled', !!drawn.attrs.titled);
      };
      draw();
      emoji.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        const v = await ui.pickEmoji(emoji, node.attrs.emoji);
        if (v?.trim()) editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(getPos()!, undefined, { ...tr.doc.nodeAt(getPos()!)?.attrs, emoji: v.trim() });
          return true;
        }).run();
        else if (!isMobile) editor.commands.focus();
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
          drawn = n;
          whenComposed(editor.view, draw);
          return true;
        },
      };
    };
  },
  addProseMirrorPlugins() {
    return [dropTitleWithoutLine()];
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.content.size !== 0) return false;
        const callout = $from.node(-1);
        if (callout?.type.name !== 'callout' || $from.index(-1) !== callout.childCount - 1 || callout.childCount < 2) return false;
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
              state.write(' ');
              state.renderInline(first);
              if (node.childCount > 1 && node.child(1).type.name === 'paragraph') state.ensureNewLine();
              else state.closeBlock(first);
              node.forEach((child: any, _: number, i: number) => { if (i > 0) state.render(child, node, i); });
            } else {
              // a first line of words goes right under the marker; anything else a blank line down: "---" just under it
              // read as the marker's underline (a heading), and the callout was gone the next time
              if (first?.type.name === 'paragraph') state.ensureNewLine();
              else state.closeBlock(node);
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
              let titled = false;
              if (text && text.nodeType === 3 && text.textContent!.startsWith('\n')) text.textContent = text.textContent!.slice(1);
              else if (first.textContent?.trim()) { splitTitle(first); titled = true; }
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

export const CalloutEdges = Extension.create({
  name: 'calloutEdges',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => stepTitleOut(editor.state, editor.view),
      Delete: ({ editor }) => enterCalloutFromLineAbove(editor.state, editor.view),
    };
  },
});
