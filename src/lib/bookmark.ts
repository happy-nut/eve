import { Node, getMarkRange, type Editor } from '@tiptap/core';
import { Plugin, TextSelection, type NodeSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** a bare address longer than this is shown cut short */
const LONG = 48;
import { fetchUrl, openUrl } from './platform';

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

const el = (tag: string, cls: string, text = '') => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
const trim = (u: string) => u.replace(/\/$/, '');
/** an address as one reads it: `서울` and `%EC%84%9C%EC%9A%B8` are the same page */
const plain = (u: string) => { try { return trim(decodeURI(u)); } catch { return trim(u); } };

const reads = new Map<string, boolean>();
/**
 * Whether the address, written bare on its line, is read back as this same card. Markdown takes some apart:
 * a `*x*` or `[x]` in it is emphasis or a bracket, a `)` or a closing `.` is left out of the link. Made a card
 * anyway, such a link was a plain link (or a link and some text) the next time the note was opened.
 */
export function cardable(editor: Editor, href: string): boolean {
  let ok = reads.get(href);
  if (ok === undefined) {
    const t = document.createElement('template');
    t.innerHTML = (editor.storage as any).markdown.parser.parse(href);
    const card = t.content.querySelector('[data-bookmark]');
    ok = t.content.children.length === 1 && !!card && plain(card.getAttribute('data-bookmark') ?? '') === plain(href);
    reads.set(href, ok);
  }
  return ok;
}

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
        if (!URL_RE.test(text) || !cardable(editor, text)) return false;
        return editor.chain()
          .insertContentAt({ from: $from.before(), to: $from.after() }, [{ type: 'bookmark', attrs: { href: text } }, { type: 'paragraph' }])
          .focus()
          .run();
      },
    };
  },

  addProseMirrorPlugins() {
    // a URL pasted with nothing selected goes in as it is, a plain link; ⌥↩ on it then offers the card.
    // (Over selected text the URL links that text: editor.ts handles that before this.)
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain').trim() ?? '';
            const { $from, empty } = view.state.selection;
            if (!URL_RE.test(text) || !empty || $from.parent.type.spec.code) return false;
            const link = view.state.schema.text(text, [view.state.schema.marks.link.create({ href: text })]);
            view.dispatch(view.state.tr.replaceSelectionWith(link, false).scrollIntoView());
            return true;
          },
        },
      }),
      // a bare address too long for its line is cut short with an ellipsis; with the caret in it, it shows whole
      new Plugin({
        props: {
          decorations: (state) => {
            const type = state.schema.marks.link, { from, to } = state.selection;
            const cut: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return true;
              const href = type.isInSet(node.marks)?.attrs.href;
              const end = pos + node.nodeSize;
              if (href && node.text === href && href.length > LONG && (to < pos || from > end)) cut.push(Decoration.inline(pos, end, { class: 'long-link' }));
              return false;
            });
            return cut.length ? DecorationSet.create(state.doc, cut) : null;
          },
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(this: { editor: Editor }, state: any, node: any) {
          // one that would not read back as a card (see cardable) stays a whole link, in markdown's <…>
          const href: string = node.attrs.href;
          state.write(cardable(this.editor, href) ? href : `<${href.replace(/[<>\s]/g, encodeURI)}>`);
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
              // the link's text is the address decoded (`서울`), its href encoded (`%EC%84…`): the same address.
              // Compared as written, a Korean address was never a card again, and once a plain link it was
              // saved as [text](address).
              if (!URL_RE.test(href) || plain(p.textContent?.trim() ?? '') !== plain(href)) continue;
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

/** The link under the caret (or just behind it): where it runs and where it points. */
function linkAt(editor: Editor): { from: number; to: number; href: string } | null {
  const { $from, empty } = editor.state.selection;
  const type = editor.schema.marks.link;
  const range = empty ? getMarkRange($from, type) : undefined;
  const mark = range && type.isInSet(editor.state.doc.nodeAt(range.from)?.marks ?? []);
  return mark ? { ...range, href: mark.attrs.href } : null;
}

/** The card the selection is on (an arrow key or a click selects it whole), with where it sits. */
function cardAt(editor: Editor): { pos: number; href: string } | null {
  const sel = editor.state.selection as NodeSelection;
  return sel.node?.type.name === 'bookmark' ? { pos: sel.from, href: sel.node.attrs.href } : null;
}

/** ⌘↩ on a link or a card: open it. False when the caret is on neither (the key goes on to a to-do). */
export function openLinkHere(editor: Editor): boolean {
  const href = cardAt(editor)?.href ?? linkAt(editor)?.href;
  if (!href) return false;
  void openUrl(href);
  return true;
}

/**
 * ⌥↩ on a link: show it as a card. A link alone on its line becomes the card; one inside a sentence keeps
 * its place and the card goes under the line. False where no card can sit (a toggle's title, a table cell…).
 */
export function linkToCard(editor: Editor): boolean {
  const link = linkAt(editor);
  if (!link || !cardable(editor, link.href)) return false;
  const { state } = editor, $from = state.selection.$from, card = state.schema.nodes.bookmark.create({ href: link.href });
  const line = $from.parent, holder = $from.node(-1), at = $from.index(-1);
  const alone = line.type.name === 'paragraph' && line.textContent.trim() === state.doc.textBetween(link.from, link.to).trim();
  if (alone && holder.canReplaceWith(at, at + 1, card.type)) {
    editor.chain().command(({ tr }) => { tr.replaceWith($from.before(), $from.after(), card); return true; }).setNodeSelection($from.before()).focus().run();
    return true;
  }
  if (!holder.canReplaceWith(at + 1, at + 1, card.type)) return false;
  editor.chain().insertContentAt($from.after(), card.toJSON()).focus().run();
  return true;
}

/** ⌥↩ on a card: back to a plain link on a line of its own, the caret after it. */
export function cardToLink(editor: Editor): boolean {
  const card = cardAt(editor);
  if (!card) return false;
  const { schema } = editor.state;
  const line = schema.nodes.paragraph.create(null, schema.text(card.href, [schema.marks.link.create({ href: card.href })]));
  editor.chain().command(({ tr }) => {
    tr.replaceWith(card.pos, card.pos + 1, line);
    tr.setSelection(TextSelection.create(tr.doc, card.pos + 1 + card.href.length));
    return true;
  }).focus().run();
  return true;
}
