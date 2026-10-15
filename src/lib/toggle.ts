import { InputRule } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Notion-style toggle: "> " at the start of a line folds it into a toggle (a quote is "| " instead). Markdown form
 * is GitHub's, so the note still reads anywhere:
 *   <details open>
 *   <summary>Title</summary>
 *
 *   body
 *
 *   </details>
 * `open` is kept in the note, so a toggle stays the way it was left. The title is plain text (a `<summary>`
 * line is HTML, where markdown does not apply).
 */
/** where a caret hidden in a closed toggle's body should be instead: the end of that toggle's title (the outermost
 *  closed one, if they nest); null when it is on screen */
function outOfClosed(state: EditorState): number | null {
  const { $head, empty } = state.selection;
  if (!empty && !(state.selection instanceof TextSelection)) return null;
  for (let d = 1; d < $head.depth; d++) {
    const n = $head.node(d);
    if (n.type.name !== 'details' || n.attrs.open || $head.index(d) === 0) continue; // index 0: in the title
    return $head.start(d) + n.firstChild!.nodeSize - 1;
  }
  return null;
}

const toggles = (doc: PMNode) => {
  let n = 0;
  doc.descendants((x) => { if (x.type.name === 'details') n++; });
  return n;
};

export const Toggle = [
  Details.extend({
    addInputRules() {
      return [new InputRule({
        find: /^>[^\S\n]$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const para = $from.parent;
          const at = $from.index(-1);
          if (para.type.name !== 'paragraph' || !$from.node(-1).canReplaceWith(at, at + 1, this.type)) return null;
          const s = state.schema;
          // the line's text as it reads, a [[link]] or @date in it too (textContent left them out: the words around
          // them stayed with a double space where the link was)
          const shown = (n: any) => n.type.name === 'wikiLink' ? n.attrs.alias || n.attrs.title : n.type.name === 'dateMention' ? `@${n.attrs.date}` : n.textContent ?? '';
          const title = state.doc.textBetween(range.to, $from.end(), undefined, shown);
          const toggle = this.type.create({ open: true }, [
            s.nodes.detailsSummary.create(null, title ? s.text(title) : null),
            s.nodes.detailsContent.create(null, s.nodes.paragraph.create()),
          ]);
          const pos = $from.before();
          const { tr } = state;
          tr.replaceWith(pos, pos + para.nodeSize, toggle).setSelection(TextSelection.create(tr.doc, pos + 2));
        },
      })];
    },
    // A closed toggle hides its body, but the caret could stay in it (closed by its arrow, the caret in the body;
    // undo; a sync): the page then showed it nowhere, or somewhere else, while the keys went on writing out of
    // sight. A caret inside a closed toggle's body goes to the end of its title, the line still on screen.
    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), new Plugin({
        key: new PluginKey('toggleCaretShown'),
        // A toggle's title holds a line of text and nothing else: a block put there (a divider, a formula, anything
        // the / menu makes) cut the toggle in two or three around it, its body left in a title-less one. Whatever
        // would make more toggles out of one, from a caret in a title, does not happen.
        filterTransaction: (tr, state) => {
          if (!tr.docChanged || state.selection.$from.parent.type.name !== 'detailsSummary') return true;
          return toggles(tr.doc) <= toggles(state.doc);
        },
        appendTransaction: (_trs, _old, state) => {
          const to = outOfClosed(state);
          return to === null ? null : state.tr.setSelection(TextSelection.create(state.doc, to)).scrollIntoView();
        },
      })];
    },
    addKeyboardShortcuts() {
      const stock = this.parent?.() ?? {};
      return {
        ...stock,
        // a new toggle already holds one empty line: Enter in the title steps into it rather than adding another
        Enter: (p) => {
          const { $head } = p.editor.state.selection;
          const toggle = $head.node(-1);
          const body = toggle?.type === this.type && toggle.attrs.open ? toggle.lastChild : null;
          if ($head.parent.type.name === 'detailsSummary' && body?.childCount === 1 && !body.firstChild!.content.size) {
            return p.editor.commands.setTextSelection($head.after() + 2);
          }
          return stock.Enter?.(p) ?? false;
        },
      };
    },
    // The stock view opens a persisted toggle on a timer that races its own update and shuts it again; this one
    // just follows `open` (CSS hides the body of a closed one).
    addNodeView() {
      return ({ node, getPos, editor }) => {
        const dom = document.createElement('div');
        dom.dataset.type = 'details';
        const button = document.createElement('button');
        button.type = 'button';
        button.contentEditable = 'false';
        const contentDOM = document.createElement('div');
        dom.append(button, contentDOM);
        const show = (open: boolean) => {
          dom.classList.toggle('is-open', open);
          button.ariaLabel = open ? 'Collapse' : 'Expand';
        };
        show(node.attrs.open);
        button.addEventListener('mousedown', (e) => {
          e.preventDefault(); // keep the caret where it was
          const pos = getPos();
          if (typeof pos !== 'number' || !editor.isEditable) return;
          const open = !editor.state.doc.nodeAt(pos)?.attrs.open;
          editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'open', open));
        });
        return {
          dom,
          contentDOM,
          ignoreMutation: (m) => m.type !== 'selection' && (button.contains(m.target) || m.target === dom),
          update: (n) => {
            if (n.type !== node.type) return false;
            show(n.attrs.open);
            return true;
          },
        };
      };
    },
    addStorage: () => ({
      markdown: {
        serialize(state: any, node: any) {
          // part of a toggle's body copied on its own (a selection starting below its title): just that body; written
          // as a toggle, its first line became the title and was copied twice
          if (node.firstChild?.type.name !== 'detailsSummary') { state.renderContent(node.lastChild ?? node); return; }
          state.write(node.attrs.open ? '<details open>' : '<details>');
          state.ensureNewLine();
          state.write(`<summary>${esc(node.firstChild.textContent)}</summary>`);
          state.closeBlock(node.firstChild);
          state.renderContent(node.lastChild);
          state.write('</details>');
          state.closeBlock(node);
        },
        parse: {
          // markdown-it hands the body over as siblings of <summary>; the node wants them in one content box
          updateDOM(root: HTMLElement) {
            for (const d of [...root.querySelectorAll('details')].reverse()) {
              const box = document.createElement('div');
              box.dataset.type = 'detailsContent';
              box.append(...[...d.childNodes].filter((c) => (c as Element).tagName !== 'SUMMARY'));
              if (!box.children.length) box.append(document.createElement('p'));
              if (!d.querySelector(':scope > summary')) d.prepend(document.createElement('summary'));
              d.append(box);
            }
          },
        },
      },
    }),
  }).configure({ persist: true }),
  DetailsSummary,
  DetailsContent.extend({ addNodeView: () => null }),
];
