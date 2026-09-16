import Image from '@tiptap/extension-image';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { assetUrl } from './platform';
import { nameOf, sizeGrip, widthOf, withWidth } from './resize';

/**
 * Images. Markdown keeps a portable relative path (`assets/x.png`, next to the notes);
 * only the rendered <img src> is mapped to something the webview can load.
 *
 * The caption is the image's alt text, so `![caption](assets/x.png)` is all the markdown needs.
 */
export const LocalImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // how wide the writer dragged it, carried in the caption as "caption|540" so the markdown keeps it
      width: {
        default: null,
        parseHTML: (el) => widthOf(el.getAttribute('alt')) ?? (el.getAttribute('width') ? Number(el.getAttribute('width')) : null),
        renderHTML: (attrs: any) => (attrs.width ? { style: `width:${attrs.width}px` } : {}),
      },
      alt: { default: null, parseHTML: (el: HTMLElement) => nameOf(el.getAttribute('alt')) || null },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', { ...HTMLAttributes, src: assetUrl(HTMLAttributes.src), draggable: 'false' }];
  },

  addStorage() {
    return {
      markdown: {
        // the stock serializer writes the image inline and never closes the block, so whatever followed
        // it ("끝" right after a picture) was glued onto the same markdown line
        serialize(state: any, node: any) {
          // the src is a URL, not text: escaping it would put backslashes into the file name
          const alt = withWidth(state.esc(node.attrs.alt ?? ''), node.attrs.width);
          state.write(`![${alt}](${node.attrs.src ?? ''}${node.attrs.title ? ` "${state.esc(node.attrs.title)}"` : ''})`);
          state.closeBlock(node);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const name = this.name;
    return [new Plugin({
      key: new PluginKey('imageWholeSelection'),
      // dragging across a picture is a text selection that happens to contain it, which reads as if
      // its insides were being selected. A range that holds nothing but the image becomes the image.
      appendTransaction: (_trs, _old, state) => {
        const sel = state.selection;
        if (!(sel instanceof TextSelection) || sel.empty) return null;
        let at: number | null = null;
        let other = false;
        state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
          if (node.type.name === name) { if (at === null) at = pos; else other = true; return false; }
          if (node.isText && node.text?.trim()) other = true;
          return true;
        });
        return at === null || other ? null : state.tr.setSelection(NodeSelection.create(state.doc, at));
      },
    })];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const figure = document.createElement('figure');
      figure.className = 'img-fig';
      const img = document.createElement('img');
      img.src = assetUrl(node.attrs.src) ?? node.attrs.src;
      img.draggable = false;
      if (node.attrs.alt) img.alt = node.attrs.alt;
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`;

      /** the dragged width goes onto the node, so it is saved with the note and undoable */
      const setWidth = (width: number | null) => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width }));
      };

      const cap = document.createElement('figcaption');
      const owns = (target: EventTarget | Node | null) => target === cap || (target instanceof Node && cap.contains(target));
      cap.className = 'img-cap';
      cap.contentEditable = 'true';
      cap.spellcheck = false;
      cap.dataset.placeholder = 'Add a caption';
      cap.textContent = node.attrs.alt ?? '';

      // the caption lives outside the document flow, so its edits reach the node as attribute changes
      let timer: ReturnType<typeof setTimeout> | undefined;
      const save = () => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.attrs.alt === cap.textContent) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, alt: cap.textContent || null }));
      };
      cap.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 300); }); // one undo step per pause, not per key
      cap.addEventListener('blur', () => { clearTimeout(timer); save(); });
      // a click in the body has to land on the first press: the caption is its own editable island,
      // and the editor's own mousedown handling leaves the caret sitting in it otherwise
      const release = (e: MouseEvent) => { if (!owns(e.target)) cap.blur(); };
      cap.addEventListener('focus', () => document.addEventListener('mousedown', release, true));
      cap.addEventListener('blur', () => document.removeEventListener('mousedown', release, true));
      cap.addEventListener('keydown', (e) => {
        // ⌘A belongs to the caption while the caret is in it, not to the whole note
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          e.stopPropagation();
          const range = document.createRange();
          range.selectNodeContents(cap);
          const sel = getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        clearTimeout(timer);
        save();
        editor.commands.focus();
      });

      figure.append(img, sizeGrip(img, setWidth), cap);
      return {
        dom: figure,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          img.src = assetUrl(updated.attrs.src) ?? updated.attrs.src;
          img.alt = updated.attrs.alt ?? '';
          img.style.width = updated.attrs.width ? `${updated.attrs.width}px` : '';
          if (document.activeElement !== cap) cap.textContent = updated.attrs.alt ?? '';
          return true;
        },
        ignoreMutation: (m) => owns(m.target),
        stopEvent: (e) => owns(e.target),
        destroy: () => { clearTimeout(timer); document.removeEventListener('mousedown', release, true); },
      };
    };
  },
});
