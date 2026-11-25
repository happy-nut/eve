import { Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { assetUrl, pdfThumb } from './platform';
import { DOC_FILE } from './drop';
import { ui } from './ui.svelte';

export const Pdf = Node.create({
  name: 'pdf',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: '' }, name: { default: '' } };
  },
  parseHTML() {
    // a div, not <a>: an <a href> would be claimed by the Link mark's parse rule first
    return [{
      tag: 'div[data-pdf]',
      getAttrs: (dom) => ({ src: (dom as HTMLElement).getAttribute('data-pdf'), name: (dom as HTMLElement).textContent ?? '' }),
    }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-pdf': node.attrs.src, class: 'pdf-card' }, node.attrs.name];
  },

  addNodeView() {
    return ({ node }) => {
      const src = node.attrs.src as string;
      const name = (node.attrs.name as string) || 'Document';
      const kind = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? 'file').toUpperCase();
      const dom = document.createElement('div');
      dom.className = 'pdf-card';
      dom.contentEditable = 'false';
      dom.title = name;

      const thumb = document.createElement('div');
      thumb.className = 'pdf-thumb';
      thumb.innerHTML = pageGlyph(kind);

      const body = document.createElement('div');
      body.className = 'pdf-body';
      const title = document.createElement('span');
      title.className = 'pdf-name';
      title.textContent = name;
      const sub = document.createElement('span');
      sub.className = 'pdf-sub';
      sub.textContent = `${kind} · click to open`;
      body.append(title, sub);

      dom.append(thumb, body);
      dom.addEventListener('click', () => ui.openPdf(src, name));

      // lazy: the page is only rendered once the card is actually on screen. A picture, not a live PDF
      // view — the webview's built-in one draws its own floating zoom/share HUD over the note on hover.
      let url: string | null = null;
      let destroyed = false;
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void pdfThumb(src).then((u) => {
          if (!u) return;
          if (destroyed) return URL.revokeObjectURL(u);
          url = u;
          const img = document.createElement('img');
          img.className = 'pdf-page';
          img.alt = '';
          img.src = u;
          thumb.append(img);
        });
      });
      io.observe(dom);

      return {
        dom,
        ignoreMutation: () => true,
        destroy: () => { destroyed = true; io.disconnect(); if (url) URL.revokeObjectURL(url); },
      };
    };
  },

  addProseMirrorPlugins() {
    // a click on a card opens its document: taken as handled, ProseMirror does not choose the card, and the note keeps
    // the caret it is written at, put back over the browser's own (the press left that in the card's words, where keys
    // go nowhere)
    return [new Plugin({ key: new PluginKey('pdfClick'), props: { handleClickOn: (view, _pos, node, _nodePos, _event, direct) => {
      if (!direct || node.type !== this.type) return false;
      view.focus();
      return true;
    } } })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[${state.esc(node.attrs.name ?? '')}](${node.attrs.src ?? ''})`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(root: HTMLElement) {
            for (const p of [...root.children]) {
              if (p.tagName !== 'P' || p.children.length !== 1) continue;
              const a = p.firstElementChild as HTMLAnchorElement;
              const href = a.getAttribute('href') ?? '';
              const text = a.textContent?.trim() ?? '';
              if (a.tagName !== 'A' || !(DOC_FILE.test(href) || DOC_FILE.test(text)) || p.textContent?.trim() !== text) continue;
              const card = document.createElement('div');
              card.setAttribute('data-pdf', href);
              card.textContent = a.textContent;
              p.replaceWith(card);
            }
          },
        },
      },
    };
  },
});

export const pdfSrc = (src: string) => assetUrl(src) ?? src;

const pageGlyph = (kind: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4"/><text x="12" y="17" text-anchor="middle" textLength="11" lengthAdjust="spacingAndGlyphs">${kind}</text></svg>`;
