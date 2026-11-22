import Image from '@tiptap/extension-image';
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ui } from './ui.svelte';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { assetUrl, copyImage } from './platform';
import { MIN_WIDTH, alignOf, escapeWidth, nameOf, sizeGrip, widthOf, withAlign, withWidth } from './resize';
import type { Editor } from '@tiptap/core';

function linkDestination(src: string): string {
  // ...but one with a space, a "<" or ">", or a ")" with no "(" before it ends the link early (the rest was
  // read back as text): markdown's <…> holds those
  let depth = 0;
  for (const c of src) if ((depth += c === '(' ? 1 : c === ')' ? -1 : 0) < 0) break;
  return depth || /[\s<>]/.test(src) ? `<${src.replace(/[<>]/g, '\\$&')}>` : src;
}

export function imageMarkdown(state: any, node: PMNode): string {
  const alt = withAlign(withWidth(escapeWidth(state.esc(node.attrs.alt ?? '')), node.attrs.width), node.attrs.align);
  const dest = linkDestination(node.attrs.src ?? '');
  const title = node.attrs.title ? ` "${state.esc(node.attrs.title).replace(/"/g, '\\"')}"` : '';
  return `![${alt}](${dest}${title})`;
}

const keepEscapedPipe = (t: { content: string; markup: string }) => (t.content === '|' ? t.markup : t.content);

/**
 * A caption as it was written, out of the tokens markdown read it into. markdown-it's own alt text drops a
 * backslash-escaped character and every bit of markup: `2*3=6` (saved `2\*3=6`) came back `23=6`, `[draft]`
 * as `draft`, `C:\path` as `C:path`, and a `==` or a backtick vanished, each time the note was opened.
 */
function captionOf(tokens: any[]): string {
  let out = '';
  for (const t of tokens) {
    if (t.type === 'text') out += t.content;
    else if (t.type === 'text_special') out += keepEscapedPipe(t);
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
function keepPercentWidthImgTags(md: any) {
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

const htmlWidth = (el: HTMLElement) => (Number(el.getAttribute('width')) ? Math.max(MIN_WIDTH, Number(el.getAttribute('width'))) : null);

function asWritten(node: PMNode): string | null {
  const html: string | null = node.attrs.html;
  if (!html || node.attrs.width || node.attrs.align) return null;
  const box = document.createElement('template');
  box.innerHTML = html;
  const img = box.content.querySelector('img');
  return img && img.getAttribute('src') === node.attrs.src && (nameOf(img.getAttribute('alt')) || null) === node.attrs.alt ? html : null;
}

export const LocalImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => widthOf(el.getAttribute('alt')) ?? htmlWidth(el),
        renderHTML: (attrs: any) => (attrs.width ? { style: `width:${attrs.width}px` } : {}),
      },
      alt: { default: null, parseHTML: (el: HTMLElement) => nameOf(el.getAttribute('alt')) || null },
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => alignOf(el.getAttribute('alt')) ?? (/^(center|right)$/.exec(el.getAttribute('data-align') ?? el.getAttribute('align') ?? '')?.[1] || null),
        renderHTML: (attrs: any) => (attrs.align ? { 'data-align': attrs.align } : {}),
      },
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
            if (!keptTags.has(md)) {
              keptTags.add(md);
              keepPercentWidthImgTags(md);
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
      if (node.attrs.align) figure.dataset.align = node.attrs.align;

      const pos = () => getPos();
      /** the dragged width goes onto the node, so it is saved with the note and undoable */
      const setWidth = (width: number | null) => {
        const p = pos();
        if (p == null) return;
        const current = editor.state.doc.nodeAt(p);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(p, undefined, { ...current.attrs, width }));
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
        const p = pos();
        if (p == null || editor.isDestroyed) return;
        const current = editor.state.doc.nodeAt(p);
        if (!current || current.attrs.alt === cap.textContent) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(p, undefined, { ...current.attrs, alt: cap.textContent || null }));
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

      // a click on the picture (a tap on a phone) opens its menu: copy it, set where it sits. A double-click (a
      // double tap) shows it full size, with the same menu on it: the first click waits to see if a second follows
      let pending: ReturnType<typeof setTimeout> | undefined;
      img.addEventListener('click', (e) => {
        if (e.detail !== 1 || !editor.isEditable) return;
        const at = { clientX: e.clientX, clientY: e.clientY };
        clearTimeout(pending);
        pending = setTimeout(() => imageMenu(editor, pos, at, img.src), 260);
      });
      img.addEventListener('dblclick', (e) => {
        e.preventDefault();
        clearTimeout(pending);
        ui.viewImage(img.src, img.alt, (at) => imageMenu(editor, pos, at, img.src));
      });
      // a right-click: the picture's menu, not the note's (Cut, Bold, … have nothing to do with a picture)
      img.addEventListener('contextmenu', (e) => {
        if (!editor.isEditable) return;
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(pending);
        // the picture is what the menu acts on: picked, as a left click picks it (the caret stayed wherever it was)
        const p = pos();
        if (p != null) editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p)));
        imageMenu(editor, pos, e, img.src);
      });

      const grip = sizeGrip(img, setWidth);
      figure.append(img, grip, cap);
      return {
        dom: figure,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          img.src = assetUrl(updated.attrs.src) ?? updated.attrs.src;
          img.alt = updated.attrs.alt ?? '';
          img.style.width = updated.attrs.width ? `${updated.attrs.width}px` : '';
          if (updated.attrs.align) figure.dataset.align = updated.attrs.align; else delete figure.dataset.align;
          if (document.activeElement !== cap) cap.textContent = updated.attrs.alt ?? '';
          return true;
        },
        // a drag writes the width straight onto the <img> style. Left to ProseMirror, that change is
        // read back as an edit: the figure is re-parsed, the parse finds no width in the alt, and the
        // picture snaps back to its natural size under the pointer. Only a caret move outside the
        // caption is the editor's business; every other change in here is this view's own.
        ignoreMutation: (m) => m.type !== 'selection' || owns(m.target),
        stopEvent: (e) => owns(e.target) || e.target === grip,
        destroy: () => { clearTimeout(timer); clearTimeout(pending); editor.off('destroy', save); document.removeEventListener('mousedown', release, true); },
      };
    };
  },
});

/**
 * ↩ (or Space, Notion's) on a selected picture shows it full size, as a double-click does. Its own extension, ahead
 * of the others: left to them, Enter would replace the selected picture with a new line, and Space with a space.
 */
export const ImageView = Extension.create({
  name: 'imageView',
  priority: 1000,
  addKeyboardShortcuts() {
    const show = () => {
      const sel = this.editor.state.selection;
      if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return false;
      const img = this.editor.view.nodeDOM(sel.from) as HTMLElement | null;
      const shown = img?.querySelector('img');
      const src = shown?.src || assetUrl(sel.node.attrs.src) || sel.node.attrs.src;
      const at = sel.from;
      ui.viewImage(src, sel.node.attrs.alt ?? '', (p) => imageMenu(this.editor, () => at, p, src));
      return true;
    };
    return { Enter: show, Space: show };
  },
});

/**
 * A picture's own menu (a click on it, a right-click, ⌥↩ with it selected, and the same on it shown full size):
 * copy it as a picture, and where it sits across the page. Nothing else: the note's menu is for text.
 */
export function imageMenu(editor: Editor, getPos: () => number | null | undefined, at: { clientX: number; clientY: number }, src: string) {
  const at0 = getPos();
  const node = at0 == null ? null : editor.state.doc.nodeAt(at0);
  if (at0 == null || node?.type.name !== 'image') return;
  const align: string = node.attrs.align ?? 'left';
  const place = (to: 'left' | 'center' | 'right') => {
    const p = getPos();
    const cur = p == null ? null : editor.state.doc.nodeAt(p);
    if (p == null || cur?.type.name !== 'image') return;
    // the picture stays picked, the keyboard on it: moved across the page, the caret was left behind somewhere else
    const tr = editor.state.tr.setNodeMarkup(p, undefined, { ...cur.attrs, align: to === 'left' ? null : to });
    editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, p)));
    if (!ui.photo) editor.view.focus();
  };
  ui.openMenu(at, [
    { label: 'Copy image', run: () => void copyImage(src).then((ok) => { if (!ok) void ui.tell('The picture could not be copied.'); }) },
    { label: 'Align left', sep: true, checked: align === 'left', run: () => place('left') },
    { label: 'Align center', checked: align === 'center', run: () => place('center') },
    { label: 'Align right', checked: align === 'right', run: () => place('right') },
    // clicked on, the menu has the keyboard: ⌫ here is what deleted the picture, as in Notion (⌦ the same, Menu.svelte)
    { label: 'Delete', sep: true, danger: true, keys: 'Backspace', run: () => {
      const p = getPos();
      if (p == null || editor.state.doc.nodeAt(p)?.type.name !== 'image') return;
      editor.chain().focus().deleteRange({ from: p, to: p + 1 }).run();
    } },
  ]);
}

/**
 * A picture put in from the / menu, the caret on the line under it (that line made when there is none): left selected,
 * the next key typed replaced the picture just picked.
 */
export function insertImage(editor: Editor, src: string) {
  editor.chain().focus().setImage({ src }).run();
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection)) return;
  const tr = editor.state.tr, after = sel.to, $after = tr.doc.resolve(after), para = editor.schema.nodes.paragraph;
  if ($after.parent.inlineContent) tr.setSelection(TextSelection.create(tr.doc, after)); // a picture in a line of text
  else {
    const next = $after.nodeAfter;
    if (!(next?.type === para && !next.content.size)) tr.insert(after, para.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  }
  editor.view.dispatch(tr.scrollIntoView());
}
