import { Node } from '@tiptap/core';
import { assetUrl, pdfThumb } from './platform';
import { PDF_FILE } from './drop';
import { ui } from './ui.svelte';

/**
 * A PDF dropped into a note. Its markdown form is an ordinary link — `[report.pdf](assets/17…-ab.pdf)` —
 * so a note read anywhere else is still a plain link; only this editor draws the card.
 *
 * Nothing of the document is loaded up front: the first page arrives when the card scrolls into view,
 * and the readable document only when the card is clicked (PdfViewer, a floating panel).
 */
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
      const name = (node.attrs.name as string) || 'PDF';
      const dom = document.createElement('div');
      dom.className = 'pdf-card';
      dom.contentEditable = 'false';
      dom.title = name;

      const thumb = document.createElement('div');
      thumb.className = 'pdf-thumb';
      thumb.innerHTML = PAGE_GLYPH; // stays behind the preview, and is all a failed/blocked preview leaves

      const body = document.createElement('div');
      body.className = 'pdf-body';
      const title = document.createElement('span');
      title.className = 'pdf-name';
      title.textContent = name;
      const sub = document.createElement('span');
      sub.className = 'pdf-sub';
      sub.textContent = 'PDF · click to open';
      body.append(title, sub);

      dom.append(thumb, body);
      dom.addEventListener('click', () => ui.openPdf(src, name));

      // lazy: the page is only rendered once the card is actually on screen. A picture, not a live PDF
      // view — the webview's built-in one draws its own floating zoom/share HUD over the note on hover.
      let url: string | null = null;
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void pdfThumb(src).then((u) => {
          if (!u) return;
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
        destroy: () => { io.disconnect(); if (url) URL.revokeObjectURL(url); },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // the path is a URL, not text: escaping it would put backslashes into the file name
          state.write(`[${state.esc(node.attrs.name ?? '')}](${node.attrs.src ?? ''})`);
          state.closeBlock(node);
        },
        parse: {
          // a line that is nothing but a link to a .pdf is a card
          updateDOM(root: HTMLElement) {
            for (const p of [...root.children]) {
              if (p.tagName !== 'P' || p.children.length !== 1) continue;
              const a = p.firstElementChild as HTMLAnchorElement;
              const href = a.getAttribute('href') ?? '';
              const text = a.textContent?.trim() ?? '';
              // the name carries the .pdf as reliably as the path does (and a dev-mode blob: URL has no name at all)
              if (a.tagName !== 'A' || !(PDF_FILE.test(href) || PDF_FILE.test(text)) || p.textContent?.trim() !== text) continue;
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

/** The webview URL for a stored PDF, as the floating viewer loads it. */
export const pdfSrc = (src: string) => assetUrl(src) ?? src;

const PAGE_GLYPH = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4"/><text x="12" y="17" text-anchor="middle">PDF</text></svg>`;
