import Image from '@tiptap/extension-image';
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ui } from './ui.svelte';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { assetUrl } from './platform';
import { MIN_WIDTH, escapeWidth, nameOf, sizeGrip, widthOf, withWidth } from './resize';

/** `![caption](src "title")`, the picture as a block of its own or inside a table's cell */
export function imageMarkdown(state: any, node: PMNode): string {
  // the src is a URL, not text: escaping it would put backslashes into the file name
  const alt = withWidth(escapeWidth(state.esc(node.attrs.alt ?? '')), node.attrs.width);
  const src: string = node.attrs.src ?? '';
  // ...but one with a space, a "<" or ">", or a ")" with no "(" before it ends the link early (the rest was
  // read back as text): markdown's <…> holds those
  let depth = 0;
  for (const c of src) if ((depth += c === '(' ? 1 : c === ')' ? -1 : 0) < 0) break;
  const dest = depth || /[\s<>]/.test(src) ? `<${src.replace(/[<>]/g, '\\$&')}>` : src;
  const title = node.attrs.title ? ` "${state.esc(node.attrs.title).replace(/"/g, '\\"')}"` : ''; // a " in it closed it
  return `![${alt}](${dest}${title})`;
}

/**
 * A caption as it was written, out of the tokens markdown read it into. markdown-it's own alt text drops a
 * backslash-escaped character and every bit of markup: `2*3=6` (saved `2\*3=6`) came back `23=6`, `[draft]`
 * as `draft`, `C:\path` as `C:path`, and a `==` or a backtick vanished, each time the note was opened.
 */
function captionOf(tokens: any[]): string {
  let out = '';
  for (const t of tokens) {
    if (t.type === 'text') out += t.content;
    // `\|` stays escaped: only a bare `|540` at the end is the width (see widthOf)
    else if (t.type === 'text_special') out += t.content === '|' ? t.markup : t.content;
    else if (t.type === 'code_inline') out += t.markup + t.content + t.markup;
    else if (t.type === 'math_inline') out += `$${t.content}$`;
    else if (t.type === 'softbreak' || t.type === 'hardbreak') out += '\n';
    else if (t.type === 'image') out += captionOf(t.children ?? []);
    else if (/^mark_(open|close)$/.test(t.type)) out += '==';
    else if (/_(open|close)$/.test(t.type)) out += t.markup ?? '';
    else out += t.content ?? '';
  }
  return out;
}

const keptTags = new WeakSet<object>();
/** the <img> tag the picture was read from, while it still says what the picture is (not resized, not renamed) */
function asWritten(node: PMNode): string | null {
  const html: string | null = node.attrs.html;
  if (!html || node.attrs.width) return null;
  const box = document.createElement('template');
  box.innerHTML = html;
  const img = box.content.querySelector('img');
  return img && img.getAttribute('src') === node.attrs.src && (nameOf(img.getAttribute('alt')) || null) === node.attrs.alt ? html : null;
}

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
      // an <img width="20"> is no narrower than a drag can make it, as a "|20" is not: read as 20 it was written
      // "|20", which came back 120 the next time
      width: {
        default: null,
        parseHTML: (el) => widthOf(el.getAttribute('alt')) ?? (Number(el.getAttribute('width')) ? Math.max(MIN_WIDTH, Number(el.getAttribute('width'))) : null),
        renderHTML: (attrs: any) => (attrs.width ? { style: `width:${attrs.width}px` } : {}),
      },
      alt: { default: null, parseHTML: (el: HTMLElement) => nameOf(el.getAttribute('alt')) || null },
      // an <img> whose width the note has no way to write (`width="50%"`): the tag as it was, written back so
      html: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-eve-img'), rendered: false },
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
          state.write(asWritten(node) ?? imageMarkdown(state, node));
          state.closeBlock(node);
        },
        parse: {
          setup(md: any) {
            // `<img width="50%">` came back as `![](…)`, its width gone: the tag is kept with the picture
            if (!keptTags.has(md)) {
              keptTags.add(md);
              md.core.ruler.after('inline', 'eve-img-width', (state: any) => {
                const keep = (t: any) => {
                  if (/^<img\b[^>]*\bwidth\s*=\s*["']?\s*\d+(\.\d+)?%/i.test(t.content) && /^<img\b[^<]*>\s*$/i.test(t.content)) {
                    t.content = t.content.replace(/^<img/i, `<img data-eve-img="${t.content.trim().replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
                  }
                };
                for (const t of state.tokens) {
                  if (t.type === 'html_block') keep(t);
                  for (const c of t.children ?? []) if (c.type === 'html_inline') keep(c);
                }
              });
            }
            md.renderer.rules.image = (tokens: any[], i: number, opts: any, _env: any, self: any) => {
              tokens[i].attrSet('alt', captionOf(tokens[i].children ?? []));
              return self.renderToken(tokens, i, opts);
            };
          },
          // pictures on lines one after the other are one paragraph to markdown, and the line break between them,
          // left alone in it once each picture is a block, became an empty line under the first (written down as
          // one, it stayed). Pictures alone in their paragraph are taken out of it.
          updateDOM(root: HTMLElement) {
            for (const p of root.querySelectorAll('p')) {
              const parts = [...p.childNodes];
              if (parts.filter((n) => n.nodeName === 'IMG').length < 2) continue;
              if (parts.every((n) => n.nodeName === 'IMG' || n.nodeName === 'BR' || (n.nodeType === 3 && /^[ \t\r\n]*$/.test(n.textContent ?? '')))) {
                p.replaceWith(...parts.filter((n) => n.nodeName === 'IMG'));
              }
            }
          },
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
      // Only a drag: ⇧ + an arrow across the picture turned into the picture alone too, which dropped the end the
      // selection grew from, so the next ⇧ + arrow started over from the picture.
      appendTransaction: (trs, _old, state) => {
        if (!trs.some((tr) => tr.getMeta('pointer'))) return null;
        const sel = state.selection;
        if (!(sel instanceof TextSelection) || sel.empty) return null;
        let at: number | null = null;
        let other = false;
        state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
          if (node.type.name === name) { if (at === null) at = pos; else other = true; return false; }
          if (node.isText && node.text?.trim()) other = true;
          // anything else the range takes in counts too: a divider, a video or a card, an empty line lying
          // wholly inside it (the lines it starts and ends on are only touched). Left out, the drag became the
          // picture alone and ⌫ left them behind.
          else if (node.isAtom && !node.isText) other = true;
          else if (node.isTextblock && !node.content.size && pos > sel.from && pos + node.nodeSize < sel.to) other = true;
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
      // writable only while it is being written in: an editable island sitting in the note all the time caught
      // a drag going up over the picture (WebKit ends the selection inside it), so it stopped at the picture
      cap.contentEditable = 'false';
      cap.spellcheck = false;
      cap.dataset.placeholder = 'Add a caption';
      cap.textContent = node.attrs.alt ?? '';

      // the caption lives outside the document flow, so its edits reach the node as attribute changes
      let timer: ReturnType<typeof setTimeout> | undefined;
      const save = () => {
        clearTimeout(timer);
        timer = undefined;
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null || editor.isDestroyed) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.attrs.alt === cap.textContent) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, alt: cap.textContent || null }));
      };
      cap.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 300); }); // one undo step per pause, not per key
      // A caption typed just before ⌘N (another note, the note closed) was lost: the pause was cut short with the
      // editor, and the blur that comes as the caption is taken off the page lands in the middle of Svelte
      // redrawing it, which refuses a change to the notes there. It is saved as the editor goes instead (Svelte
      // lets that one through), and a blur waits a microtask, past the redraw (by then a no-op if the editor went).
      editor.on('destroy', save);
      cap.addEventListener('blur', () => queueMicrotask(save));
      // a click in the body has to land on the first press: the caption is its own editable island,
      // and the editor's own mousedown handling leaves the caret sitting in it otherwise
      const release = (e: MouseEvent) => { if (!owns(e.target)) cap.blur(); };
      cap.addEventListener('focus', () => { cap.classList.add('editing'); document.addEventListener('mousedown', release, true); });
      cap.addEventListener('blur', () => { cap.classList.remove('editing'); cap.contentEditable = 'false'; document.removeEventListener('mousedown', release, true); });
      // a drag across the note passes over the caption instead of starting a selection inside it; a
      // press on the caption itself makes it writable before the caret lands
      cap.addEventListener('mousedown', () => { cap.contentEditable = 'true'; cap.classList.add('editing'); });
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

      // a double-click (a double tap on a phone) shows the picture full size
      img.addEventListener('dblclick', (e) => { e.preventDefault(); ui.viewImage(img.src, img.alt); });

      const grip = sizeGrip(img, setWidth);
      figure.append(img, grip, cap);
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
        // a drag writes the width straight onto the <img> style. Left to ProseMirror, that change is
        // read back as an edit: the figure is re-parsed, the parse finds no width in the alt, and the
        // picture snaps back to its natural size under the pointer. Only a caret move outside the
        // caption is the editor's business; every other change in here is this view's own.
        ignoreMutation: (m) => m.type !== 'selection' || owns(m.target),
        stopEvent: (e) => owns(e.target) || e.target === grip,
        destroy: () => { clearTimeout(timer); editor.off('destroy', save); document.removeEventListener('mousedown', release, true); },
      };
    };
  },
});

/**
 * ↩ on a selected picture shows it full size, as a double-click does. Its own extension, ahead of the
 * others: left to them, Enter would replace the selected picture with a new line.
 */
export const ImageView = Extension.create({
  name: 'imageView',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = this.editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return false;
        const img = this.editor.view.nodeDOM(sel.from) as HTMLElement | null;
        const shown = img?.querySelector('img');
        ui.viewImage(shown?.src || assetUrl(sel.node.attrs.src) || sel.node.attrs.src, sel.node.attrs.alt ?? '');
        return true;
      },
    };
  },
});
