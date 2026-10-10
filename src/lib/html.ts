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

export const Html = [HtmlInline, HtmlBlock, HtmlComment, HtmlCommentInline];
