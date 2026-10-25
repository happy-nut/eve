import { InputRule } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model';
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

/** an inline node as it reads, in a title's plain text: a [[link]] or @date too (textContent left them out) */
const shown = (n: PMNode) => n.type.name === 'wikiLink' ? n.attrs.alias || n.attrs.title : n.type.name === 'dateMention' ? (n.attrs.remind ? `@${n.attrs.date} ${n.attrs.time} ⏰` : `@${n.attrs.date}`) : n.type.name === 'hardBreak' ? ' ' : n.textContent ?? '';

const toggles = (doc: PMNode) => {
  let n = 0;
  doc.descendants((x) => { if (x.type.name === 'details') n++; });
  return n;
};

/** a transaction's meta saying it copies whole blocks (⌘D), toggles among them */
export const DUPLICATE = 'duplicate';

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
        // would make more toggles out of one, from a caret in a title, does not happen — but ⌘D's copy of the whole
        // toggle, which says so (DUPLICATE)
        filterTransaction: (tr, state) => {
          if (!tr.docChanged || tr.getMeta(DUPLICATE) || state.selection.$from.parent.type.name !== 'detailsSummary') return true;
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
        Enter: (p) => {
          const { state, view } = p.editor;
          const { $head, $from, $to, empty } = state.selection;
          const title = $from.parent;
          if (title.type.name === 'detailsSummary' && $from.sameParent($to)) {
            // at the start of a title with text, a line above the toggle: the title stays as it was
            if (empty && $from.parentOffset === 0 && title.content.size) {
              const tr = state.tr.insert($from.before(-1), state.schema.nodes.paragraph.create());
              view.dispatch(tr.setSelection(TextSelection.create(tr.doc, $from.before(-1) + 1)).scrollIntoView());
              return true;
            }
            // in the middle of it, the rest of the title is the body's first line (the toggle opened to show it);
            // the stock Enter did nothing there
            if ($to.parentOffset < title.content.size) {
              const rest = state.schema.nodes.paragraph.create(null, title.content.cut($to.parentOffset));
              const tr = state.tr.delete($from.pos, $from.end());
              const at = tr.mapping.map($from.after()) + 1;
              tr.insert(at, rest).setNodeAttribute($from.before(-1), 'open', true);
              view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
              return true;
            }
          }
          // a new toggle already holds one empty line: Enter at the end of the title steps into it rather than adding
          // another
          const toggle = $head.node(-1);
          const body = toggle?.type === this.type && toggle.attrs.open ? toggle.lastChild : null;
          if ($head.parent.type.name === 'detailsSummary' && body?.childCount === 1 && !body.firstChild!.content.size) {
            return p.editor.commands.setTextSelection($head.after() + 2);
          }
          return stock.Enter?.(p) ?? false;
        },
        Backspace: (p) => {
          const { state, view } = p.editor;
          const { $from, empty } = state.selection;
          // a letter in the title: the webview's own ⌫, by whole characters (the stock one took one code unit, and
          // left half an emoji written into the file)
          if (empty && $from.parent.type.name === 'detailsSummary' && $from.parentOffset > 0) return false;
          // the line just after a toggle: into the toggle's last line (open) or to its title (closed), never the whole
          // toggle selected, then deleted with its folded body unseen by the next key
          const before = empty && $from.parentOffset === 0 && $from.parent.isTextblock && $from.depth > 0 ? state.doc.resolve($from.before()).nodeBefore : null;
          // the start of a toggle's first line: up into its title, the line's text joined on as plain text (the title
          // holds nothing else); an empty line goes, but never the body's only one. The stock ⌫ did nothing there.
          const box = $from.depth > 2 ? $from.node(-1) : null;
          if (empty && $from.parentOffset === 0 && box?.type.name === 'detailsContent' && $from.index(-1) === 0 && $from.node(-2).type === this.type) {
            const end = $from.before(-1) - 1, line = $from.parent, tr = state.tr;
            let text = '', whole = true;
            line.forEach((n) => { const s = n.isText ? n.text! : shown(n); if (!s && n.isLeaf) whole = false; text += s; });
            if (!line.content.size) { if (box.childCount > 1) tr.delete($from.before(), $from.after()); }
            // a heading, code or a line holding what has no text: only the caret goes up, nothing of it lost
            else if (line.type.name === 'paragraph' && whole) {
              if (box.childCount > 1) tr.delete($from.before(), $from.after());
              else tr.replaceWith($from.before(), $from.after(), line.type.create());
              if (text) tr.insert(end, state.schema.text(text));
            }
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView());
            return true;
          }
          if (before?.type === this.type) {
            const at = $from.before() - before.nodeSize;
            const into = before.attrs.open ? Selection.findFrom(state.doc.resolve($from.before()), -1, true) : null;
            const end = into ? into.from : at + 1 + before.firstChild!.nodeSize - 1;
            const line = $from.parent;
            const tr = state.tr;
            if (!line.content.size) tr.delete($from.before(), $from.after());
            else if (into && into.$from.parent.inlineContent) tr.delete($from.before(), $from.after()).insert(end, line.content);
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView());
            return true;
          }
          return stock.Backspace?.(p) ?? false;
        },
        // the line just before a toggle: Delete takes the caret to its title (an empty line goes), never the toggle
        Delete: (p) => {
          const { state, view } = p.editor;
          const { $from, empty } = state.selection;
          if (!empty || !$from.parent.isTextblock || $from.depth === 0 || $from.parentOffset !== $from.parent.content.size) return false;
          const next = state.doc.resolve($from.after()).nodeAfter;
          if (next?.type !== this.type) return false;
          const tr = state.tr;
          if (!$from.parent.content.size) tr.delete($from.before(), $from.after());
          const title = tr.mapping.map($from.after()) + 2;
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, title)).scrollIntoView());
          return true;
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
  // its text as the note has it: a title ending in a space ("- ", "$$ ") lost it at the next opening, ProseMirror
  // trimming a line's last spaces (the runs keepSpaces in editor.ts marks are kept; any other is one space, as in HTML)
  DetailsSummary.extend({
    parseHTML: () => [{
      tag: 'summary',
      preserveWhitespace: true, // (what getContent gives is trimmed already: this keeps ProseMirror from trimming it again)
      getContent: (el: HTMLElement | Node, schema: Schema) => {
        const keep = (s: string) => s.replace(/ /g, '\ue000').replace(/\t/g, '\ue001');
        const read = (n: Node): string => n.nodeType === 3 ? n.nodeValue! : n.nodeName === 'EVE-SPACE' ? keep(n.textContent!) : [...n.childNodes].map(read).join('');
        const text = read(el).replace(/[ \t\r\n\f]+/g, ' ').trim().replace(/\ue000/g, ' ').replace(/\ue001/g, '\t');
        return text ? Fragment.from(schema.text(text)) : Fragment.empty;
      },
    }],
  }),
  DetailsContent.extend({ addNodeView: () => null }),
];
