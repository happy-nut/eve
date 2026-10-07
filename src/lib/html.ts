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

type Attrs = [name: string, value: string][];

/** an element's attributes worth keeping, in order */
function attrsOf(el: Element): Attrs {
  return [...el.attributes]
    .filter((a) => a.name !== MARK && /^[a-z][a-z0-9:-]*$/i.test(a.name) && !/^on/i.test(a.name))
    .filter((a) => !(/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)))
    .map((a) => [a.name, a.value]);
}
const write = (attrs: Attrs) => attrs.map(([n, v]) => (v === '' ? ` ${n}` : ` ${n}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)).join('');
const render = (attrs: Attrs) => Object.fromEntries([...attrs, [MARK, '']]);
const json = { default: [] as Attrs, rendered: false };

/** HTML around text: the tag and its attributes, written back as they were */
export const HtmlInline = Mark.create({
  name: 'htmlInline',
  inclusive: false, // typing after it is plain text, not more of the span
  excludes: '', // a <kbd> inside a <span>
  addAttributes: () => ({ tag: { default: 'span', rendered: false }, attrs: json }),
  parseHTML: () => INLINE.map((tag) => ({ tag: `${tag}[${MARK}]`, getAttrs: (el: HTMLElement) => ({ tag, attrs: attrsOf(el) }) })),
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
  parseHTML: () => [{ tag: `div[${MARK}]`, getAttrs: (el: HTMLElement) => ({ attrs: attrsOf(el) }) }],
  renderHTML: ({ node }) => ['div', { ...render(node.attrs.attrs), class: 'html-block' }, 0],
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
          for (const el of root.querySelectorAll(INLINE.join(','))) el.setAttribute(MARK, '');
          for (const el of root.querySelectorAll('div')) {
            if (![...el.attributes].some((a) => a.name.startsWith('data-'))) el.setAttribute(MARK, '');
          }
          const walk = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
          const comments: Comment[] = [];
          while (walk.nextNode()) comments.push(walk.currentNode as Comment);
          for (const c of comments) {
            const parent = c.parentElement;
            // one between blocks (in a paragraph it would split it): a block of its own
            if (parent && parent !== root && !(parent.tagName === 'DIV' && parent.hasAttribute(MARK))) continue;
            const box = document.createElement('div');
            box.setAttribute('data-eve-comment', c.data);
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

export const Html = [HtmlInline, HtmlBlock, HtmlComment];
