import { Node } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { fetchUrl, openUrl } from './platform';
import { ui } from './ui.svelte';

/**
 * Bookmark card: a URL on a line of its own renders as a compact preview (favicon, title, description,
 * thumbnail) and opens in the browser on click. Markdown form is just the bare URL, so files stay plain.
 * Made by pasting a URL into an empty line, or by typing one and pressing Enter.
 */
export const URL_RE = /^https?:\/\/[^\s<>"']+$/;
const LS = 'eve.links';
export interface Meta { title: string; desc: string; image: string; icon: string }

const cache: Record<string, Meta> = (() => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } })();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** How long a link may be before the card shortens it. */
const LINK_MAX = 20;
/** The link as the card shows it: the address itself, minus the scheme, cut only when it runs long. */
export const shortUrl = (u: string) => {
  const bare = u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return bare.length > LINK_MAX ? `${bare.slice(0, LINK_MAX)}…` : bare;
};

/** og:/twitter:/plain <meta> out of a page; relative image/icon URLs resolved against the page. */
export function parseMeta(html: string, url: string): Meta {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const m = (sel: string) => d.querySelector(sel)?.getAttribute('content')?.trim() ?? '';
  const abs = (u: string) => { try { return u ? new URL(u, url).href : ''; } catch { return ''; } };
  const icon = d.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')?.getAttribute('href') || '/favicon.ico';
  return {
    title: m('meta[property="og:title"]') || m('meta[name="twitter:title"]') || d.title.trim() || host(url),
    desc: m('meta[property="og:description"]') || m('meta[name="description"]') || m('meta[name="twitter:description"]'),
    image: abs(m('meta[property="og:image"]') || m('meta[name="twitter:image"]')),
    icon: abs(icon),
  };
}

/** Cached per URL; failures are not cached, so an offline moment is retried next time. */
export async function linkMeta(url: string): Promise<Meta> {
  if (cache[url]) return cache[url];
  try {
    const meta = parseMeta(await fetchUrl(url), url);
    cache[url] = meta;
    try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* quota */ }
    return meta;
  } catch {
    return { title: host(url), desc: '', image: '', icon: '' };
  }
}

/** What a pasted link becomes. Escape falls back to the plain link — nothing is lost that way. */
function linkContent(href: string, how: 'card' | 'link' | 'both') {
  const card = { type: 'bookmark', attrs: { href } };
  const link = { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'link', attrs: { href } }], text: href }] };
  const tail = { type: 'paragraph' };
  if (how === 'card') return [card, tail];
  if (how === 'link') return [link, tail];
  return [link, card, tail];
}

const el = (tag: string, cls: string, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
const trim = (u: string) => u.replace(/\/$/, '');

export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { href: { default: '' } };
  },
  parseHTML() {
    // a div, not <a>: an <a href> would be claimed by the Link mark's parse rule first
    return [{ tag: 'div[data-bookmark]', getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('data-bookmark') }) }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-bookmark': node.attrs.href, class: 'bookmark' }, node.attrs.href];
  },

  addNodeView() {
    return ({ node }) => {
      const href = node.attrs.href as string;
      const dom = el('a', 'bookmark') as HTMLAnchorElement;
      dom.href = href;
      dom.contentEditable = 'false';
      const body = el('span', 'bm-body');
      const title = el('span', 'bm-title', host(href));
      const site = el('span', 'bm-site');
      const ico = el('img', 'bm-ico') as HTMLImageElement;
      ico.alt = '';
      site.append(ico, el('span', 'bm-url', shortUrl(href))); // the address, not just the site name
      body.append(title, site);
      dom.append(body);
      dom.addEventListener('click', (e) => { e.preventDefault(); void openUrl(href); });
      void linkMeta(href).then((m) => {
        title.textContent = m.title;
        if (m.desc) body.insertBefore(el('span', 'bm-desc', m.desc), site);
        if (m.icon) { ico.src = m.icon; ico.onerror = () => ico.remove(); } else ico.remove();
        if (m.image) {
          const im = el('img', 'bm-thumb') as HTMLImageElement;
          im.alt = '';
          im.src = m.image;
          im.onerror = () => im.remove();
          dom.append(im);
        }
      });
      return { dom };
    };
  },

  addKeyboardShortcuts() {
    // a line that is only a URL turns into a card on Enter
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        const p = $from.parent;
        if (!empty || p.type.name !== 'paragraph' || $from.parentOffset !== p.content.size || $from.depth !== 1) return false;
        const text = p.textContent.trim();
        if (!URL_RE.test(text)) return false;
        return editor.chain()
          .insertContentAt({ from: $from.before(), to: $from.after() }, [{ type: 'bookmark', attrs: { href: text } }, { type: 'paragraph' }])
          .focus()
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    // a URL pasted into an empty top-level line: card, plain link, or both — asked on the spot
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain').trim() ?? '';
            const { $from, empty } = view.state.selection;
            if (!URL_RE.test(text) || !empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size) return false;
            const editor = this.editor;
            const line = { from: $from.before(), to: $from.after() };
            const c = view.coordsAtPos($from.pos);
            void ui.pickLink(new DOMRect(c.left, c.top, 0, c.bottom - c.top)).then((how) => {
              editor.chain().insertContentAt(line, linkContent(text, how ?? 'link')).focus().run();
            });
            return true;
          },
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(node.attrs.href);
          state.closeBlock(node);
        },
        parse: {
          /**
           * Only a URL written bare on its line becomes a card. A link the markdown spells out —
           * `[text](url)`, or the `<url>` angle form a plain link is saved as — stays a link, which is
           * what keeps the "link" and "both" choices from turning into cards when the note is read back.
           */
          setup(md: any) {
            const open = md.renderer.rules.link_open ?? ((t: any, i: number, o: any, _e: any, self: any) => self.renderToken(t, i, o));
            md.renderer.rules.link_open = (tokens: any, i: number, opts: any, env: any, self: any) => {
              if (tokens[i].markup === 'linkify') tokens[i].attrSet('data-bare', '');
              return open(tokens, i, opts, env, self);
            };
          },
          updateDOM(root: HTMLElement) {
            for (const p of [...root.children]) {
              if (p.tagName !== 'P' || p.children.length !== 1) continue;
              const a = p.firstElementChild as HTMLAnchorElement;
              const href = a.getAttribute('href') ?? '';
              if (a.tagName !== 'A' || !a.hasAttribute('data-bare')) continue;
              if (!URL_RE.test(href) || trim(p.textContent?.trim() ?? '') !== trim(href)) continue;
              const b = document.createElement('div');
              b.setAttribute('data-bookmark', href);
              b.textContent = href;
              p.replaceWith(b);
            }
          },
        },
      },
    };
  },
});
