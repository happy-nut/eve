import { Mark, Node } from '@tiptap/core';

/**
 * HTML written in a note's markdown that the editor has no node of its own for, kept as it was: a <span> with a
 * colour, <kbd>, <sub>, <sup>, <abbr> and the like around text; a <div> around blocks (a README's
 * <div align="center">); a <!-- comment -->. Read, they used to be dropped — the text kept, the tags gone the next
 * time the note was saved, the comment gone whole.
 *
 * Only HTML that came from markdown is kept (updateDOM marks it data-eve-html): HTML pasted from a web page is full of
 * spans and divs that mean nothing in a note, and is still taken for its text alone. Handlers (on…) and
 * javascript: addresses are never kept: a note's HTML is drawn in the app.
 */
const INLINE = ['span', 'kbd', 'sub', 'sup', 'abbr', 'small', 'var', 'samp', 'cite', 'q', 'dfn', 'ins', 'time', 'font'];
const MARK = 'data-eve-html';

/**
 * Every element HTML has (and SVG's and MathML's root). Anything else in angle brackets is text: `Array<string>`,
 * "press <Enter>". Read as a tag, it was dropped, the words with it.
 */
export const HTML_TAGS = new Set(('a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound big blink '
  + 'blockquote body br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog dir div dl dt em '
  + 'embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe image img '
  + 'input ins isindex kbd keygen label legend li link listing main map mark marquee math menu menuitem meta meter nav nobr noembed '
  + 'noframes noscript object ol optgroup option output p param picture plaintext portal pre progress q rb rp rt rtc ruby s samp '
  + 'script search section select slot small source spacer span strike strong style sub summary sup svg table tbody td template '
  + 'textarea tfoot th thead time title tr track tt u ul var video wbr xmp').split(' '));
/** the HTML the note makes something of: formatting, a picture, a list, a table, a toggle, a box of blocks */
const OWN = new Set([...INLINE, 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark', 'code', 'br', 'img', 'div', 'p',
  'details', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td', 'hr']);
const TAG = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/;
const quote = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ready = new WeakSet<object>();

/**
 * Tags the note has nothing for (a <video>, an <iframe>, <audio>, <svg>, an <a name>, an <input>) and words in angle
 * brackets that are no tag at all. Both were dropped when the note was read, and gone from the file once it was
 * saved. Words stay text; a tag is kept as it was written, shown as its code, and written back unchanged.
 */
function keepUnknownHtml(md: any) {
  if (ready.has(md)) return;
  ready.add(md);
  const rules = md.block.ruler.__rules__, at = md.block.ruler.__find__('html_block');
  if (at >= 0) {
    const html = rules[at].fn;
    // a line starting "<Enter>" is a paragraph: as an HTML block it swallowed the lines under it
    md.block.ruler.at('html_block', (state: any, start: number, end: number, silent: boolean) => {
      const m = TAG.exec(state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]));
      return m && !HTML_TAGS.has(m[2].toLowerCase()) ? false : html(state, start, end, silent);
    }, { alt: rules[at].alt });
  }
  // A link's address given further down (`[ref]: https://x.com`) or a short footnote (`[^1]: note`): markdown takes the
  // line for the links that use it and shows nothing, so it was gone from the file once the note was saved. It is kept
  // as it was written, like HTML the note has nothing for. A footnote is no address: `x[^1]` stays text, as it was
  // before such a line under it made it a link to "note".
  const ref = md.block.ruler.__find__('reference');
  if (ref >= 0) {
    const reference = rules[ref].fn;
    md.block.ruler.at('reference', (state: any, start: number, end: number, silent: boolean) => {
      if (silent) return reference(state, start, end, true);
      const refs = (state.env.references ??= {});
      const before = new Set(Object.keys(refs));
      if (!reference(state, start, end, false)) return false;
      for (const label of Object.keys(refs)) if (!before.has(label) && label.startsWith('^')) delete refs[label];
      const lines = state.getLines(start, state.line, state.blkIndent, false).replace(/\n$/, '');
      const prev = state.tokens.at(-1);
      // definitions one under the other stay so, not a blank line between each
      if (prev?.meta?.eveDefs !== undefined && prev.map?.[1] === start) {
        prev.meta.eveDefs += `\n${lines}`;
        prev.map[1] = state.line;
        prev.content = `<div data-eve-raw="${quote(prev.meta.eveDefs)}"></div>\n`;
        return true;
      }
      const t = state.push('html_block', '', 0);
      t.map = [start, state.line];
      t.meta = { eveDefs: lines };
      t.content = `<div data-eve-raw="${quote(lines)}"></div>\n`;
      return true;
    }, { alt: rules[ref].alt });
  }
  // A line starting with a comment and going on after it (`<!-- c --> x [[w]]`) is all one HTML block to markdown: the
  // words after the comment were read as they stood, the [[link]] as text, and an item's line grew a backslash before
  // each bracket on every save. Such a line is a line of text with the comment in it.
  md.core.ruler.after('block', 'eve-comment-line', (state: any) => {
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      if (tok.type !== 'html_block' || !/^<!--[\s\S]*?-->[^\S\n]*\S/.test(tok.content)) continue;
      // in a tight list a line of text has no paragraph of its own: so with this one
      let hidden = false;
      for (let k = i - 1; k >= 0; k--) {
        if (t[k].level !== tok.level - 2 || !/_list_open$/.test(t[k].type)) continue;
        const paras: any[] = [];
        for (let n = k + 1; n < t.length && t[n].level > t[k].level; n++) if (t[n].type === 'paragraph_open' && t[n].level === tok.level) paras.push(t[n]);
        hidden = paras.every((p) => p.hidden);
        break;
      }
      const open = new state.Token('paragraph_open', 'p', 1), inline = new state.Token('inline', '', 0), close = new state.Token('paragraph_close', 'p', -1);
      Object.assign(open, { map: tok.map, level: tok.level, block: true, hidden });
      Object.assign(inline, { map: tok.map, level: tok.level + 1, block: true, content: tok.content.replace(/\n$/, ''), children: [] });
      Object.assign(close, { level: tok.level, block: true, hidden });
      t.splice(i, 1, open, inline, close);
    }
  });
  md.core.ruler.after('inline', 'eve-unknown-html', (state: any) => {
    for (const t of state.tokens) {
      if (t.type === 'html_block') {
        const name = TAG.exec(t.content)?.[2].toLowerCase();
        if (name && HTML_TAGS.has(name) && !OWN.has(name)) t.content = `<div data-eve-raw="${quote(t.content.replace(/\n$/, ''))}"></div>\n`;
      }
      if (t.type !== 'inline' || !t.children) continue;
      const anchors: boolean[] = []; // an <a> without an address is kept as written, and so is its </a>
      for (const c of t.children) {
        if (c.type !== 'html_inline') continue;
        const m = TAG.exec(c.content);
        if (!m) continue; // a comment
        const name = m[2].toLowerCase();
        if (!HTML_TAGS.has(name)) { c.type = 'text'; continue; }
        let raw = !OWN.has(name) && !c.content.includes('task-list-item-checkbox');
        if (name === 'a') {
          if (m[1]) raw = anchors.pop() ?? false;
          else anchors.push((raw = !/\shref\s*=/i.test(c.content)));
        }
        if (raw) c.content = `<span data-eve-raw-inline="${quote(c.content)}"></span>`;
      }
    }
  });
}

const ATTRS = 'data-eve-attrs';

type Attrs = [name: string, value: string][];

/** CSS a note may set on its own text: colour, type, alignment. Not where things sit: a span positioned fixed over
 *  the whole window is drawn in the app too. */
const STYLE = /^(color|background|background-color|font-weight|font-style|font-size|font-family|font-variant|text-decoration|text-align|vertical-align|letter-spacing|line-height|white-space)$/i;
function style(css: string): string {
  return css
    .split(';')
    .map((d) => d.trim())
    .filter((d) => { const i = d.indexOf(':'); return i > 0 && STYLE.test(d.slice(0, i).trim()) && !/url\(|expression\(|javascript:/i.test(d); })
    .join('; ');
}

/**
 * The attributes the note's HTML gave the element, in order: none of the app's own (data-*, class, id) or a
 * handler (on…), no javascript: address, its style to what text may wear. Drawn in the app, the element carries
 * them as they were (data-eve-attrs), so a copy and paste inside the app keeps them, and nothing added on the way
 * (ProseMirror's data-pm-slice) comes back with it.
 */
function attrsOf(el: Element): Attrs {
  const kept = el.getAttribute(ATTRS);
  if (kept) { try { return (JSON.parse(kept) as Attrs).filter(([n]) => safeName(n)); } catch { /* not ours */ } }
  return [...el.attributes]
    .filter((a) => safeName(a.name))
    .filter((a) => !(/^(href|src|action|formaction|xlink:href|cite)$/i.test(a.name) && /^\s*(javascript|vbscript|data):/i.test(a.value)))
    .map((a): [string, string] => [a.name, a.name.toLowerCase() === 'style' ? style(a.value) : a.value])
    .filter(([n, v]) => n.toLowerCase() !== 'style' || v);
}
const safeName = (n: string) => /^[a-z][a-z0-9:-]*$/i.test(n) && !/^(on|data-)/i.test(n) && !/^(class|id|slot|is|contenteditable|tabindex)$/i.test(n);
const write = (attrs: Attrs) => attrs.map(([n, v]) => (v === '' ? ` ${n}` : ` ${n}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)).join('');
const render = (attrs: Attrs) => Object.fromEntries([...attrs, [MARK, ''], [ATTRS, JSON.stringify(attrs)]]);
const json = { default: [] as Attrs, rendered: false };
/** what came from the note's markdown: an element of the app's own carries data-* (a [[link]], an @date, a board) */
const fromNote = (el: Element) => ![...el.attributes].some((a) => a.name.startsWith('data-'));

/** HTML around text: the tag and its attributes, written back as they were */
export const HtmlInline = Mark.create({
  name: 'htmlInline',
  inclusive: false, // typing after it is plain text, not more of the span
  excludes: '', // a <kbd> inside a <span>
  addAttributes: () => ({ tag: { default: 'span', rendered: false }, attrs: json }),
  // below the app's own (a [[link]] and an @date are spans too): a rule of theirs comes first
  parseHTML: () => INLINE.map((tag) => ({ tag: `${tag}[${MARK}]`, priority: 30, getAttrs: (el: HTMLElement) => ({ tag, attrs: attrsOf(el) }) })),
  renderHTML: ({ mark }) => [mark.attrs.tag, render(mark.attrs.attrs), 0],
  addStorage: () => ({
    markdown: {
      serialize: {
        open: (_state: unknown, mark: any) => `<${mark.attrs.tag}${write(mark.attrs.attrs)}>`,
        close: (_state: unknown, mark: any) => `</${mark.attrs.tag}>`,
        mixable: true,
      },
    },
  }),
});

/** a <div> around blocks, the blocks inside still a note's to write in */
export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({ attrs: json }),
  parseHTML: () => [{ tag: `div[${MARK}]`, priority: 30, getAttrs: (el: HTMLElement) => ({ attrs: attrsOf(el) }) }],
  renderHTML: ({ node }) => ['div', render(node.attrs.attrs), 0],
  addStorage: () => ({
    markdown: {
      // the blank line after the tag makes what is inside markdown again (an HTML block ends at a blank line)
      serialize(state: any, node: any) {
        state.write(`<div${write(node.attrs.attrs)}>`);
        state.closeBlock(node);
        state.renderContent(node);
        state.write('</div>');
        state.closeBlock(node);
      },
      parse: {
        setup: keepUnknownHtml,
        // what came from the note's markdown, as against what a paste or the app itself puts there: divs of the
        // app's own carry data-* (a board, a toggle's body); comments become a block that can hold them
        updateDOM(root: HTMLElement) {
          for (const el of root.querySelectorAll(`${INLINE.join(',')},div`)) if (fromNote(el)) el.setAttribute(MARK, '');
          const walk = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
          const comments: Comment[] = [];
          while (walk.nextNode()) comments.push(walk.currentNode as Comment);
          for (const c of comments) {
            const parent = c.parentElement;
            // one between blocks: a block of its own; one in a line of text (a paragraph, an item, a heading) is
            // kept in the line, where it used to be dropped (a block there would split the paragraph)
            const between = !parent || parent === root || (parent.tagName === 'DIV' && parent.hasAttribute(MARK));
            const box = document.createElement(between ? 'div' : 'span');
            box.setAttribute(between ? 'data-eve-comment' : 'data-eve-inline-comment', c.data);
            c.replaceWith(box);
          }
        },
      },
    },
  }),
});

/** an HTML comment between blocks: shown faintly, written back as it was */
export const HtmlComment = Node.create({
  name: 'htmlComment',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ text: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-eve-comment') ?? '', rendered: false } }),
  parseHTML: () => [{ tag: 'div[data-eve-comment]', priority: 60 }],
  renderHTML: ({ node }) => ['div', { 'data-eve-comment': node.attrs.text, class: 'html-comment' }, `<!--${node.attrs.text}-->`],
  addStorage: () => ({
    markdown: {
      serialize(state: any, node: any) {
        state.write(`<!--${node.attrs.text}-->`);
        state.closeBlock(node);
      },
    },
  }),
});

/** an HTML comment in a line of text (`para <!-- todo --> more`), the same, in the line */
export const HtmlCommentInline = Node.create({
  name: 'htmlCommentInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ text: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-eve-inline-comment') ?? '', rendered: false } }),
  parseHTML: () => [{ tag: 'span[data-eve-inline-comment]', priority: 60 }],
  renderHTML: ({ node }) => ['span', { 'data-eve-inline-comment': node.attrs.text, class: 'html-comment' }, `<!--${node.attrs.text}-->`],
  addStorage: () => ({
    markdown: {
      serialize(state: any, node: any) {
        state.text(`<!--${node.attrs.text}-->`, false); // text(), not write(): a comment of more lines inside a quote keeps its "> "
      },
    },
  }),
});

/** HTML the note has nothing for, between blocks (a <video>, an <iframe>, <svg>): shown as its code, written back as it was */
export const HtmlRaw = Node.create({
  name: 'htmlRaw',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ html: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-eve-raw') ?? '', rendered: false } }),
  parseHTML: () => [{ tag: 'div[data-eve-raw]', priority: 60 }],
  renderHTML: ({ node }) => ['div', { 'data-eve-raw': node.attrs.html, class: 'html-comment' }, node.attrs.html],
  addStorage: () => ({
    markdown: {
      serialize(state: any, node: any) {
        state.text(node.attrs.html, false); // text(): each line of it keeps the "> " or the item's indent it is in
        state.closeBlock(node);
      },
    },
  }),
});

/** the same in a line of text (`a <a name="x"></a> b`, an <input>): each tag kept as it was written */
export const HtmlRawInline = Node.create({
  name: 'htmlRawInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ html: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-eve-raw-inline') ?? '', rendered: false } }),
  parseHTML: () => [{ tag: 'span[data-eve-raw-inline]', priority: 60 }],
  renderHTML: ({ node }) => ['span', { 'data-eve-raw-inline': node.attrs.html, class: 'html-comment' }, node.attrs.html],
  addStorage: () => ({
    markdown: {
      serialize(state: any, node: any) {
        state.text(node.attrs.html, false);
      },
    },
  }),
});

export const Html = [HtmlInline, HtmlBlock, HtmlComment, HtmlCommentInline, HtmlRaw, HtmlRawInline];
