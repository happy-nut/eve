import { Node } from '@tiptap/core';
import { assetUrl } from './platform';
import { VIDEO_FILE } from './drop';
import { nameOf, sizeGrip, widthOf, withWidth } from './resize';

/**
 * A video dropped into a note. Markdown form is an ordinary link — `[clip.mp4](assets/17…-ab.mp4)` —
 * like the PDF card, so the note stays readable anywhere else; here it plays in place. The width the
 * writer dragged rides along in the name (`clip.mp4|540`).
 */
export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: '' }, name: { default: '' }, width: { default: null } };
  },
  parseHTML() {
    return [{
      tag: 'div[data-video]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const text = el.textContent ?? '';
        return { src: el.getAttribute('data-video'), name: nameOf(text), width: widthOf(text) };
      },
    }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-video': node.attrs.src, class: 'vid-card' }, withWidth(node.attrs.name, node.attrs.width)];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('figure');
      dom.className = 'vid-fig';
      dom.contentEditable = 'false';

      const video = document.createElement('video');
      video.src = assetUrl(node.attrs.src) ?? node.attrs.src;
      video.controls = true;
      video.preload = 'metadata'; // the first frame only, until it is played
      video.playsInline = true;
      if (node.attrs.width) video.style.width = `${node.attrs.width}px`;

      const setWidth = (width: number | null) => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, width }));
      };

      dom.append(video, sizeGrip(video, setWidth));
      return {
        dom,
        ignoreMutation: () => true,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          video.src = assetUrl(updated.attrs.src) ?? updated.attrs.src;
          video.style.width = updated.attrs.width ? `${updated.attrs.width}px` : '';
          return true;
        },
        // the player's own buttons belong to the player, not to the editor's selection handling
        stopEvent: (e) => e.target instanceof Node && video.contains(e.target),
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[${state.esc(withWidth(node.attrs.name ?? '', node.attrs.width))}](${node.attrs.src ?? ''})`);
          state.closeBlock(node);
        },
        parse: {
          // a line that is nothing but a link to a video file is a player
          updateDOM(root: HTMLElement) {
            for (const p of [...root.children]) {
              if (p.tagName !== 'P' || p.children.length !== 1) continue;
              const a = p.firstElementChild as HTMLAnchorElement;
              const href = a.getAttribute('href') ?? '';
              const text = a.textContent?.trim() ?? '';
              if (a.tagName !== 'A' || !(VIDEO_FILE.test(href) || VIDEO_FILE.test(nameOf(text)))) continue;
              if (p.textContent?.trim() !== text) continue;
              const card = document.createElement('div');
              card.setAttribute('data-video', href);
              card.textContent = text;
              p.replaceWith(card);
            }
          },
        },
      },
    };
  },
});
