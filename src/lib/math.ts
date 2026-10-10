import { InputRule, Node, type Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type MarkdownIt from 'markdown-it';
import { loadMath, mathMarkup, mathNow } from './mathRender';
import { mountMath, type MathEditing } from './mathEdit.svelte';
import { scrollHint } from './scrollHint';

/**
 * Formulas: `$E = mc^2$` in a line of text, and a block of its own,
 *
 *   $$
 *   \int_0^1 x^2 \, dx
 *   $$
 *
 * as Obsidian, GitHub and pandoc write them, so a note's formulas read the same anywhere. In the note a formula is
 * drawn (MathLive); clicked, it becomes the box it is typed in, the formula as it looks, with a row of the parts
 * a formula is made of (fractions, roots, sums, matrices, Greek letters) to put in by a click; its TeX is there too.
 *
 * Dollars that are money stay money. A `$` opens a formula only with no space after it, and closes one only with
 * no space before it and no digit after it (pandoc's rule): "$5 and $10" is text. Text that would read as a formula
 * all the same is written with its dollars escaped (`\$`), so a note reads back as it was.
 */

// ---- markdown ----

/** where the formula opened at `start` (a `$`) closes in `src`, or -1 */
function closing(src: string, start: number): number {
  const first = src[start + 1];
  if (!first || first === '$' || /\s/.test(first)) return -1;
  for (let i = start + 1; ; ) {
    const j = src.indexOf('$', i);
    if (j < 0) return -1;
    i = j + 1;
    if (src[j - 1] === '\\') continue; // \$, a dollar in the formula
    if (/\s/.test(src[j - 1])) continue;
    if (/\d/.test(src[j + 1] ?? '')) continue;
    return j;
  }
}

/** a run of text that would be read back as a formula (some `$…$` in it) */
export const readsAsMath = (text: string): boolean => {
  for (let i = text.indexOf('$'); i >= 0; i = text.indexOf('$', i + 1)) {
    if (text[i - 1] === '\\') continue;
    if (closing(text, i) > 0) return true;
  }
  return false;
};

function inlineRule(md: MarkdownIt) {
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x24) return false;
    const end = closing(state.src, start);
    if (end < 0) return false;
    if (!silent) {
      const t = state.push('math_inline', '', 0);
      t.content = state.src.slice(start + 1, end);
    }
    state.pos = end + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, i) => `<span data-math-inline="">${md.utils.escapeHtml(tokens[i].content)}</span>`;
}

function blockRule(md: MarkdownIt) {
  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    if (!state.src.startsWith('$$', pos)) return false;
    const rest = state.src.slice(pos + 2, max);
    let body: string;
    let last = startLine;
    if (rest.trim().endsWith('$$') && rest.trim().length >= 2) {
      body = rest.trim().slice(0, -2); // $$ x $$ on a line of its own
    } else {
      // the line that ends in $$, inside whatever holds this one (a list item, a quote)
      for (last = startLine + 1; last < endLine; last++) {
        if (state.sCount[last] < state.blkIndent && !state.isEmpty(last)) return false;
        const s = state.bMarks[last] + state.tShift[last];
        if (state.src.slice(s, state.eMarks[last]).trimEnd().endsWith('$$')) break;
      }
      if (last >= endLine) return false;
      const inner = state.getLines(startLine + 1, last + 1, state.sCount[startLine], false).replace(/\s*\$\$\s*$/, '');
      body = (rest.trim() ? rest.trim() + '\n' : '') + inner;
    }
    if (silent) return true;
    const t = state.push('math_block', 'div', 0);
    t.block = true;
    t.content = body.trim();
    t.map = [startLine, last + 1];
    state.line = last + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_block = (tokens, i) => `<div data-math-block="">${md.utils.escapeHtml(tokens[i].content)}</div>\n`;
}

// ---- editing ----

/** a formula just put in (the / menu, `$$`, the shortcut): its box opens as it is first drawn */
let openNext = false;

/** the formula at `pos`, if that is where one still is */
const formulaAt = (editor: Editor, pos: number | null | undefined) => {
  const n = pos == null ? null : editor.state.doc.nodeAt(pos);
  return n && (n.type.name === 'mathInline' || n.type.name === 'mathBlock') ? n : null;
};

function view(editor: Editor, node: PMNode, getPos: () => number | undefined, display: boolean) {
  const dom = document.createElement(display ? 'div' : 'span');
  dom.className = display ? 'math-block' : 'math-inline';
  dom.contentEditable = 'false';
  const shown = document.createElement(display ? 'div' : 'span');
  shown.className = 'math-shown';
  dom.append(shown);
  let current = node; // as this view last drew it
  let editing: MathEditing | null = null;

  const draw = () => {
    const latex: string = current.attrs.latex;
    dom.classList.toggle('empty', !latex.trim());
    if (!latex.trim()) { shown.textContent = display ? 'New equation' : 'Equation'; return; }
    const m = mathNow();
    if (m) { shown.innerHTML = mathMarkup(m, latex, display); return; }
    shown.textContent = latex; // a moment, the first time: MathLive on its way
    loadMath().then(() => { if (!editing) draw(); }, () => {});
  };
  draw();

  /** the caret beside the formula: after it (1) or before it (-1), the keyboard back in the note */
  const leave = (side: 1 | -1) => {
    const p = getPos();
    if (p == null || !formulaAt(editor, p)) return;
    const tr = editor.state.tr;
    const at = side > 0 ? p + current.nodeSize : p;
    tr.setSelection(TextSelection.near(tr.doc.resolve(at), side));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };
  const write = (latex: string) => {
    const p = getPos();
    const n = formulaAt(editor, p);
    // only into this very formula: the node there must be the one this view last drew
    // equal, not the same object: the note read anew (a sync, a note not in the editor's own spelling) keeps this view
    // for an equal node without telling it, and every change typed was refused and lost
    if (p == null || !n || !n.eq(current) || n.attrs.latex === latex) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(p, undefined, { ...n.attrs, latex }));
  };
  const remove = () => {
    const p = getPos();
    if (p == null || !formulaAt(editor, p)?.eq(current)) return;
    const tr = editor.state.tr.delete(p, p + current.nodeSize);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(p, tr.doc.content.size)), -1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };
  const open = async (at: { x: number; y: number } | null = null) => {
    if (editing || !editor.isEditable) return;
    dom.classList.add('editing');
    editing = mountMath(dom, {
      latex: current.attrs.latex,
      display,
      at,
      onInput: write,
      onDone: (how) => {
        close();
        if (how === 'remove') remove();
        else if (how === 'before') leave(-1);
        else if (how !== 'away') leave(1);
      },
      onHistory: (redo) => queueMicrotask(() => { if (redo) editor.commands.redo(); else editor.commands.undo(); }),
    });
  };
  const close = () => {
    if (!editing) return;
    const e = editing;
    editing = null;
    e.destroy();
    dom.classList.remove('editing');
    // nothing typed: a formula with nothing in it is not kept
    if (!current.attrs.latex.trim()) queueMicrotask(remove); else draw();
  };

  dom.addEventListener('mousedown', (e) => {
    if (editing || (e as MouseEvent).button !== 0) return;
    e.preventDefault();
    const m = e as MouseEvent;
    void open({ x: m.clientX, y: m.clientY }); // the caret where it was clicked
  });
  if (openNext) { openNext = false; queueMicrotask(() => open()); }
  const unhint = display ? scrollHint(dom) : null; // a long one: cut off, it said nothing of it

  return {
    dom,
    update: (n: PMNode) => {
      if (n.type !== current.type) return false;
      const was = current;
      current = n;
      if (editing) { if (n.attrs.latex !== was.attrs.latex) editing.set(n.attrs.latex); } // an undo, a sync
      else if (n.attrs.latex !== was.attrs.latex) draw();
      return true;
    },
    selectNode: () => dom.classList.add('selected'),
    deselectNode: () => dom.classList.remove('selected'),
    stopEvent: (e: Event) => !!editing && e.target instanceof globalThis.Node && dom.contains(e.target),
    ignoreMutation: () => true,
    destroy: () => { editing?.destroy(); editing = null; unhint?.(); },
    /** Enter on a selected formula */
    open,
  };
}

/** Enter (or a double-click's worth: any key that edits) on a selected formula opens its box */
const openSelected = (editor: Editor) => {
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || !/^math(Inline|Block)$/.test(sel.node.type.name)) return false;
  (editor.view.nodeDOM(sel.from) as any)?.__open?.();
  return true;
};

const mathNode = (display: boolean) => Node.create({
  name: display ? 'mathBlock' : 'mathInline',
  group: display ? 'block' : 'inline',
  inline: !display,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { latex: { default: '', parseHTML: (el) => el.textContent ?? '', rendered: false } };
  },
  parseHTML() {
    return [{ tag: display ? 'div[data-math-block]' : 'span[data-math-inline]', priority: 60 }];
  },
  renderHTML({ node }) {
    return [display ? 'div' : 'span', { [display ? 'data-math-block' : 'data-math-inline']: '' }, node.attrs.latex];
  },
  renderText({ node }) {
    return display ? `$$\n${node.attrs.latex}\n$$` : `$${node.attrs.latex}$`;
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const v = view(editor, node, getPos as () => number | undefined, display);
      (v.dom as any).__open = v.open;
      return v;
    };
  },

  addKeyboardShortcuts() {
    return { Enter: () => openSelected(this.editor) };
  },

  addInputRules() {
    if (display) {
      // "$$" and a space (or Enter) on an empty line: a block formula, open to type in
      return [new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== 'paragraph' || $from.parent.textContent.trim() !== '$$') return null;
          openNext = true;
          state.tr.replaceRangeWith($from.before(), $from.after(), this.type.create({ latex: '' }));
        },
      })];
    }
    // "$x^2$" typed in a line: the formula, drawn, as it would be read back
    return [new InputRule({
      find: /(^|[^\\$\w])\$([^\s$](?:[^$]*[^\s$\\])?)\$$/,
      handler: ({ state, range, match }) => {
        const start = range.from + match[1].length;
        state.tr.replaceWith(start, range.to, this.type.create({ latex: match[2] }));
      },
    })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          const latex: string = node.attrs.latex;
          if (!display) { state.write(`$${latex}$`); return; }
          state.write('$$\n');
          state.text(latex, false);
          state.ensureNewLine();
          state.write('$$');
          state.closeBlock(node);
        },
        parse: { setup: (md: MarkdownIt) => (display ? blockRule(md) : inlineRule(md)) },
      },
    };
  },
});

export const MathInline = mathNode(false);
export const MathBlock = mathNode(true);

/**
 * ProseMirror's text node (in place of StarterKit's, the same node), written as tiptap-markdown writes it, except
 * dollars that would be read back as a formula: those are escaped (`\$`), so "$a$" typed where no formula was made (pasted, or the rule undone) stays text.
 */
const entities = new Map<string, boolean>();
/** `&name;` that HTML (and so markdown) reads as one character */
function isEntity(s: string): boolean {
  if (/^&#/.test(s)) return /^&#(\d{1,7}|x[0-9a-f]{1,6});$/i.test(s);
  let known = entities.get(s);
  if (known === undefined) {
    const el = document.createElement('textarea');
    el.innerHTML = s;
    entities.set(s, (known = el.value !== s));
  }
  return known;
}

const mathSafeText = {
  serialize(state: any, node: PMNode) {
    const text = (node.text ?? '')
      // "&lt;" typed as text came back as "<"; only a name markdown reads as a character is escaped, so "Q&A;" or
      // "AT&T;" stay as typed (written "&amp;A;" they showed so in the title, and a [[link]] to it found nothing)
      .replace(/&(#?[a-z0-9]+;)/gi, (m, rest) => (isEntity(m) ? `&amp;${rest}` : m))
      .replace(/</g, '&lt;').replace(/>/g, '&gt;'); // tiptap-markdown's own escapeHTML
    if (!readsAsMath(text)) { state.text(text); return; }
    text.split('$').forEach((part, i) => {
      if (i) state.write('\\$');
      if (part) state.text(part);
    });
  },
  parse: {},
};
export const Text = Node.create({ name: 'text', group: 'inline', addStorage: () => ({ markdown: mathSafeText }) });

/** the / menu's and the shortcut's formula: a block, or one in the line (the selected text its TeX), open to type in */
export function insertMath(editor: Editor, display: boolean) {
  const { state } = editor;
  const sel = state.selection;
  const text = sel.empty ? '' : state.doc.textBetween(sel.from, sel.to, ' ');
  openNext = true;
  const node = display
    ? { type: 'mathBlock', attrs: { latex: text } }
    : { type: 'mathInline', attrs: { latex: text } };
  editor.chain().focus().insertContent(node).run();
  if (openNext) openNext = false; // not drawn (no room for it here): nothing to open
}
