import { InputRule } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
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
