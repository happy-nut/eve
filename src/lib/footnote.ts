import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type MarkdownIt from 'markdown-it';

/**
 * Footnotes as GitHub and Obsidian write them: `[^1]` in the text, `[^1]: what it says` on a line of its own. The
 * reference is drawn as its number raised, and a click goes to its note; the note's line keeps its words as they
 * are, drawn smaller (a decoration only, so it is written back exactly as it was).
 */
const DEF = /^\[\^([^\]\s]+)\]:/;

/** `[^label]` in a line, not the `[^label]:` that starts a footnote's own line */
export function footnoteMarkdown(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'footnoteref', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b || state.src.charCodeAt(state.pos + 1) !== 0x5e) return false; // "[^"
    const m = /^\[\^([^\]\s]+)\]/.exec(state.src.slice(state.pos));
    if (!m) return false;
    if (state.pos === 0 && state.src[m[0].length] === ':') return false; // the footnote's own line
    if (!silent) state.push('footnoteref', '', 0).content = m[1];
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.footnoteref = (tokens, i) => {
    const label = tokens[i].content.replace(/"/g, '&quot;');
    return `<sup data-footnote="${label}">${label}</sup>`;
  };
}

/** the line that is footnote `label`'s, if the note has one */
function defOf(doc: PMNode, label: string): number | null {
  let at: number | null = null;
  doc.descendants((n, pos) => {
    if (at !== null) return false;
    if (n.isTextblock && DEF.exec(n.textContent)?.[1] === label) { at = pos; return false; }
    return !n.isTextblock;
  });
  return at;
}

/** Notion-style "Footnote": the next number at the caret, and its line at the note's end, the caret there */
export function insertFootnote(editor: Editor) {
  const used = new Set<string>();
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'footnoteRef') used.add(n.attrs.label);
    if (n.isTextblock) { const m = DEF.exec(n.textContent); if (m) used.add(m[1]); }
  });
  let k = 1;
  while (used.has(String(k))) k++;
  const label = String(k);
  editor.chain().focus().insertContent({ type: 'footnoteRef', attrs: { label } }).run();
  const { tr, schema } = editor.state;
  const end = tr.doc.content.size;
  tr.insert(end, schema.nodes.paragraph.create(null, schema.text(`[^${label}]: `)));
  tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1)).scrollIntoView();
  editor.view.dispatch(tr);
}

export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { label: { default: '1', parseHTML: (el) => el.getAttribute('data-footnote') ?? '1' } };
  },
  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { 'data-footnote': node.attrs.label, class: 'fnref' }), node.attrs.label];
  },
  renderText: ({ node }) => `[^${node.attrs.label}]`,
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('sup');
      dom.className = 'fnref';
      dom.dataset.footnote = node.attrs.label;
      dom.textContent = node.attrs.label;
      dom.title = 'Go to the footnote';
      // a click goes to the footnote's line (one not written yet: nothing happens)
      dom.addEventListener('click', () => {
        const at = defOf(editor.state.doc, node.attrs.label);
        if (at === null) return;
        const $end = editor.state.doc.resolve(at + 1 + editor.state.doc.nodeAt(at)!.content.size);
        editor.chain().focus().setTextSelection($end.pos).scrollIntoView().run();
      });
      return { dom };
    };
  },
  addProseMirrorPlugins() {
    // a footnote's own line drawn as one: smaller, under a rule (its words untouched)
    return [new Plugin({
      key: new PluginKey('footnoteLines'),
      props: {
        decorations: (state) => {
          const decos: Decoration[] = [];
          state.doc.descendants((n, pos) => {
            if (n.type.name === 'paragraph' && DEF.test(n.textContent)) decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'fndef' }));
            return !n.isTextblock;
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    })];
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) { state.write(`[^${node.attrs.label}]`); },
        parse: { setup: footnoteMarkdown },
      },
    };
  },
});

/**
 * As text a footnote mark is what the file says, `[^1]` (ProseMirror's leafText, which a line's textContent reads):
 * a line reads the same whether the mark came typed as words or read back as a mark, so a caret kept by its words
 * (takeBody) stays where it was when "[^1]" written in another device's edit comes back a mark.
 */
export const FootnoteText = Extension.create({
  name: 'footnoteText',
  extendNodeSchema: (ext) => (ext.name === 'footnoteRef' ? { leafText: (n: PMNode) => `[^${n.attrs.label}]` } : {}),
});
