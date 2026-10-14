import CodeBlockBase from '@tiptap/extension-code-block';
import { textblockTypeInputRule, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { ui } from './ui.svelte';
import { isMobile } from './platform';
import { starter, toCode, type Diagram, type Kind } from './diagram';
import { mountDiagram } from './diagramBlock.svelte';

/**
 * Syntax highlighting, loaded with the first code block shown: lowlight, highlight.js and the grammars
 * are a sixth of the app's script and most notes have no code. Until they arrive a block draws plain;
 * then every waiting editor repaints once.
 */
type Hast = { type: string; value?: string; properties?: { className?: string[] }; children?: Hast[] };
type Lowlight = { highlight(lang: string, code: string): Hast; highlightAuto(code: string): Hast; registered(lang: string): boolean };
let lowlight: Lowlight | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<Editor>();
const HIGHLIGHT = new PluginKey<DecorationSet>('highlight');

function withGrammars(editor: Editor) {
  if (lowlight) return;
  waiting.add(editor);
  loading ??= import('./grammars').then((m) => {
    lowlight = m.lowlight;
    for (const e of waiting) if (!e.isDestroyed) e.view.dispatch(e.state.tr.setMeta(HIGHLIGHT, true));
    waiting.clear();
  }, () => { loading = null; }); // offline or failed: the next code block tries again
}

/** Language guessed only for code up to this long: the guess runs every grammar over it, and a long block without a
 * language took a second and more each key */
const AUTO_MAX = 2000;

/** Each block's highlighting (spans from its start, with their hljs-* classes), kept while the block is unchanged:
 * a key typed in one block highlighted every block in the note again */
const spans = new WeakMap<PMNode, [from: number, to: number, cls: string][]>();

/** lowlight's tree for one code block */
function spansOf(node: PMNode) {
  let got = spans.get(node);
  if (got) return got;
  const ll = lowlight!, text = node.textContent, lang: string | null = node.attrs.language;
  const tree = lang && ll.registered(lang) ? ll.highlight(lang, text) : text.length <= AUTO_MAX ? ll.highlightAuto(text) : null;
  got = [];
  let at = 0;
  const walk = (nodes: Hast[] = [], classes: string[]) => {
    for (const n of nodes) {
      if (n.type === 'text') {
        const to = at + (n.value?.length ?? 0);
        if (classes.length) got!.push([at, to, classes.join(' ')]);
        at = to;
      } else walk(n.children, [...classes, ...(n.properties?.className ?? [])]);
    }
  };
  if (tree) walk(tree.children, []);
  spans.set(node, got);
  return got;
}

/** every code block in the note highlighted, as inline decorations */
function highlight(doc: PMNode): DecorationSet {
  if (!lowlight) return DecorationSet.empty;
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    for (const [from, to, cls] of spansOf(node)) out.push(Decoration.inline(pos + 1 + from, pos + 1 + to, { class: cls }));
    return false;
  });
  return DecorationSet.create(doc, out);
}
/** what the highlighting depends on: each block's language and text */
function codeOf(doc: PMNode) {
  let s = '';
  doc.descendants((n) => {
    if (n.type.name === 'codeBlock') s += `${n.attrs.language}\u0000${n.textContent}\u0001`;
    return n.type.name !== 'codeBlock';
  });
  return s;
}
const highlighter = new Plugin<DecorationSet>({
  key: HIGHLIGHT,
  state: {
    init: (_, { doc }) => highlight(doc),
    apply: (tr, set, old, now) =>
      tr.getMeta(HIGHLIGHT) || (tr.docChanged && codeOf(old.doc) !== codeOf(now.doc)) ? highlight(now.doc) : set.map(tr.mapping, tr.doc),
  },
  props: { decorations: (state) => HIGHLIGHT.getState(state) },
});

/** Languages offered by the chip, in menu order. Anything lowlight knows still highlights. */
const LANGUAGES: [value: string, label: string][] = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['diff', 'Diff'],
  ['go', 'Go'],
  ['graphql', 'GraphQL'],
  ['ini', 'INI / TOML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['lua', 'Lua'],
  ['markdown', 'Markdown'],
  ['mermaid', 'Mermaid diagram'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['scss', 'SCSS'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['xml', 'HTML / XML'],
  ['yaml', 'YAML'],
];

const labelOf = (language: string | null) => LANGUAGES.find(([v]) => v === (language ?? ''))?.[1] ?? language ?? 'Plain text';

/**
 * A ```mermaid block is drawn as its diagram; its code shows (above the diagram, which follows it as it is typed)
 * while the caret is in it. The node decoration marks that block "editing".
 */
const EDITING = new PluginKey('mermaid-editing');
const editingDiagram = new Plugin({
  key: EDITING,
  props: {
    decorations(state) {
      const { $head } = state.selection;
      for (let d = $head.depth; d > 0; d--) {
        const n = $head.node(d);
        if (n.type.name === 'codeBlock') {
          return n.attrs.language === 'mermaid' ? DecorationSet.create(state.doc, [Decoration.node($head.before(d), $head.after(d), { class: 'editing' }, { editing: true })]) : null;
        }
      }
      return null;
    },
  },
});

/** Syntax highlighting, plus a language chip (and its menu) that appears on hover. */
/**
 * How far a code block scrolled sideways must go to show the caret: 0 when it already shows. `box` is the block's
 * visible stretch (its padding inside), `caret` where the caret is drawn.
 */
export function scrollToShow(box: { left: number; right: number }, caret: { left: number; right: number }): number {
  if (caret.left < box.left) return caret.left - box.left;
  if (caret.right > box.right) return caret.right - box.right;
  return 0;
}
/** A code line wider than its block scrolls in it, and the caret is followed there: ⌘← (or Home) back to the start of a
 *  line scrolled to its end left the block where it was, the caret out of sight. The webview moves the caret itself
 *  for those keys, and scrolls only the page, not the block. */
const caretInSight = new Plugin({
  view: () => ({
    update(view, prev) {
      const { selection } = view.state;
      if (prev.selection.eq(selection) && prev.doc.eq(view.state.doc)) return;
      if (!selection.$head.parent.type.spec.code) return;
      const at = view.domAtPos(selection.head).node;
      const pre = (at instanceof Element ? at : at.parentElement)?.closest('pre');
      if (!pre || pre.scrollWidth <= pre.clientWidth) return;
      let c: { left: number; right: number };
      try { c = view.coordsAtPos(selection.head); } catch { return; }
      const r = pre.getBoundingClientRect(), pad = parseFloat(getComputedStyle(pre).paddingLeft) || 0;
      const by = scrollToShow({ left: r.left + pad, right: r.right - pad }, { left: c.left, right: c.right + 1 });
      // whole pixels, rounded away from the caret: by a fraction, the webview rounded a line's start to 1px off the
      // block's left edge, its first letter's edge cut
      if (by) pre.scrollLeft = Math.max(0, by < 0 ? Math.floor(pre.scrollLeft + by) : Math.ceil(pre.scrollLeft + by));
    },
  }),
});

/** In a table cell: no code block there, a table's markdown holds one line of text a cell */
export const inCell = ($pos: ResolvedPos) => {
  for (let d = $pos.depth; d > 0; d--) if (/^table(Cell|Header)$/.test($pos.node(d).type.name)) return true;
  return false;
};

/** the caret from the start of the code at `at` to the end of the line over it, or that line gone when empty */
function toLineBefore(state: EditorState, view: EditorView, at: number) {
  const before = state.doc.resolve(at).nodeBefore;
  if (!before?.isTextblock) return false;
  const tr = before.content.size ? state.tr.setSelection(TextSelection.create(state.doc, at - 1)) : state.tr.delete(at - before.nodeSize, at);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const CodeBlock = CodeBlockBase.extend({
  // ahead of a list's own keys: Tab in code inside a list indents the code, not the whole list item
  priority: 1000,
  addProseMirrorPlugins() { return [...(this.parent?.() ?? []), highlighter, editingDiagram, caretInSight]; },
  // ↓ from the line above a diagram (↑ from the line under it) goes into its code, which then shows, with ⌘↵ to its
  // drawing: its code hidden, the caret went past the diagram, and the keyboard could not reach it at all
  addKeyboardShortcuts() {
    const into = (dir: 'up' | 'down') => () => {
      const { view, state } = this.editor;
      const sel = state.selection;
      if (!sel.empty || !view.endOfTextblock(dir)) return false;
      const $h = sel.$head;
      if ($h.parent.type.name === 'codeBlock') return false;
      const at = dir === 'down' ? $h.after() : $h.before();
      const $at = state.doc.resolve(at);
      const n = dir === 'down' ? $at.nodeAfter : $at.nodeBefore;
      if (n?.type.name !== 'codeBlock' || n.attrs.language !== 'mermaid') return false;
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, dir === 'down' ? at + 1 : at - 1)).scrollIntoView());
      return true;
    };
    const stock = this.parent?.() ?? {};
    return {
      ...stock,
      // ↑ at the start of a code block heading the note still makes a line above it (the stock exit)
      ArrowDown: (p) => into('down')() || (stock.ArrowDown?.(p) ?? false),
      ArrowUp: (p) => into('up')() || (stock.ArrowUp?.(p) ?? false),
      // ⌫ in an emptied block, or at the start of the note's first: the line is plain again where it is. The stock
      // one lifted it out of every list or callout around it too (cutting that in two), and its lines ran into one
      // on save (no line breaks put in for the code's newlines)
      Backspace: () => {
        const { state, view } = this.editor, { empty, $anchor } = state.selection;
        if (!empty || $anchor.parent.type.name !== this.name) return false;
        if ($anchor.pos === 1 || !$anchor.parent.textContent.length) return this.editor.commands.setNode('paragraph');
        // ⌫ at the start of code under a line: to that line's end (an empty line goes). Joined, the code ran into
        // the line as text, its # and - lines read back as headings and lists
        return $anchor.parentOffset === 0 && toLineBefore(state, view, $anchor.before());
      },
      // Tab with no selection: four spaces typed (the stock one put them in as HTML, which dropped them)
      Tab: (p) => {
        const { state, view } = this.editor;
        if (!state.selection.empty || state.selection.$from.parent.type.name !== this.name) return stock.Tab?.(p) ?? false;
        view.dispatch(state.tr.insertText(' '.repeat(this.options.tabSize ?? 4)).scrollIntoView());
        return true;
      },
      // ⌦ at the end of a line over code: into the code (an empty line goes), as ⌫ from the code's side
      Delete: () => {
        const { state, view } = this.editor, { empty, $head } = state.selection;
        if (!empty || !$head.parent.isTextblock || $head.parent.type.name === this.name || $head.parentOffset !== $head.parent.content.size) return false;
        const after = $head.after();
        if (state.doc.resolve(after).nodeAfter?.type.name !== this.name) return false;
        const tr = $head.parent.content.size ? state.tr.setSelection(TextSelection.create(state.doc, after + 1)) : state.tr.delete($head.before(), after);
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
  // ```lang then a space or Enter: a language with capitals or signs too (```TypeScript, ```c++, ```C#); not in a
  // table cell, whose code a table can't keep (it came back as plain text)
  addInputRules() {
    return ['```', '~~~'].map((fence) => {
      const rule = textblockTypeInputRule({
        find: new RegExp(`^${fence}([\\w+#.-]+)?[\\s\\n]$`, 'i'),
        type: this.type,
        getAttributes: (m) => ({ language: m[1]?.toLowerCase() || null }),
      });
      const run = rule.handler;
      rule.handler = (props) => (inCell(props.state.selection.$from) ? null : run(props));
      return rule;
    });
  },
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        // the fence one backtick longer than any run of backticks in the code: always ``` before, so a ``` line
        // in the code closed the block there, and the note came back split into code, text and an open fence
        serialize(state: any, node: any) {
          const longest = Math.max(0, ...(node.textContent.match(/`+/g) ?? []).map((r: string) => r.length));
          const fence = '`'.repeat(Math.max(3, longest + 1));
          state.write(fence + (node.attrs.language || '') + (node.attrs.info ? ` ${node.attrs.info}` : '') + '\n');
          state.text(node.textContent, false);
          // code ending in an empty line: that line break is the code's, and the fence's own comes after it (taken
          // for the fence's, the empty line went, one each save)
          if (node.textContent.endsWith('\n')) state.out += '\n';
          else state.ensureNewLine();
          state.write(fence);
          state.closeBlock(node);
        },
        // the rest of the fence's line after the language (```js title="a.js"): markdown-it leaves it out of the
        // HTML, and the next save wrote the fence without it. (In place of tiptap-markdown's own parse, so its two
        // steps are here too.)
        parse: {
          updateDOM(element: HTMLElement) {
            element.innerHTML = element.innerHTML.replace(/\n<\/code><\/pre>/g, '</code></pre>'); // markdown-it's own last line break
          },
          setup(md: any) {
            md.set({ langPrefix: 'language-' });
            const fence = md.renderer.rules.fence;
            md.renderer.rules.fence = (tokens: any[], idx: number, ...rest: unknown[]) => {
              const html: string = fence(tokens, idx, ...rest);
              const info = tokens[idx].info.trim().replace(/^\S+\s*/, ''); // as written, escapes and all
              return info ? html.replace(/^<pre/, `<pre data-info="${md.utils.escapeHtml(info)}"`) : html;
            };
          },
        },
      },
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      info: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-info'), renderHTML: (a: { info?: string | null }) => (a.info ? { 'data-info': a.info } : {}) },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      withGrammars(editor);
      const dom = document.createElement('div');
      dom.className = 'code-block';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.append(code);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'code-lang';
      chip.contentEditable = 'false';
      chip.tabIndex = -1; // a mouse affordance, not a tab stop
      chip.textContent = labelOf(node.attrs.language);
      // a mermaid block: its drawing, edited right there (DiagramBlock.svelte); the code shows only with the caret in it
      const host = document.createElement('div');
      host.className = 'mermaid-host';
      host.contentEditable = 'false';
      dom.append(chip, pre, host);
      const posNow = () => (typeof getPos === 'function' ? getPos() : null);
      let block: ReturnType<typeof mountDiagram> | null = null;
      let shown = false; // the caret in the code
      let shownNode: PMNode = node; // the block as this view last drew it
      const setDiagram = (n: PMNode) => {
        const on = n.attrs.language === 'mermaid';
        dom.classList.toggle('mermaid', on);
        if (!on) { block?.destroy(); block = null; dom.classList.remove('mermaid-error'); return; }
        if (block) { block.set({ code: n.textContent, codeShown: shown }); return; }
        const start = startNext !== null && startNext === n.textContent;
        if (start) startNext = null;
        block = mountDiagram(host, {
          code: n.textContent, start, codeShown: shown,
          // what was drawn, written into the block: one step to undo, the caret left where it was
          // only into this very block, where it still is: the node there must be the one this view last showed (a last
          // change written as the block was deleted found the paragraph after it at its old place, and wrote over it)
          onCode: (code) => {
            if (editor.isDestroyed) return;
            const p = posNow();
            const cur = p == null ? null : editor.state.doc.nodeAt(p);
            // equal, not the same object: the note read anew keeps this view for an equal node without telling it
            if (p == null || !cur || !cur.eq(shownNode) || cur.textContent === code) return;
            editor.view.dispatch(editor.state.tr.replaceWith(p + 1, p + cur.nodeSize - 1, code ? editor.schema.text(code) : []));
          },
          onHistory: (redo) => queueMicrotask(() => { if (redo) editor.commands.redo(); else editor.commands.undo(); }),
          onCodeEdit: () => {
            const p = posNow();
            const cur = p == null ? null : editor.state.doc.nodeAt(p);
            if (p == null || !cur) return;
            editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, p + cur.nodeSize - 1)).scrollIntoView());
            editor.view.focus();
          },
          onCodeLeave: () => {
            const p = posNow();
            const cur = p == null ? null : editor.state.doc.nodeAt(p);
            if (p == null || !cur) return;
            const tr = editor.state.tr;
            editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(p + cur.nodeSize))));
          },
          onError: (failed) => dom.classList.toggle('mermaid-error', failed),
        });
      };
      setDiagram(node);

      const language = (): string => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        return (pos == null ? null : editor.state.doc.nodeAt(pos)?.attrs.language) ?? '';
      };
      const setLanguage = (value: string) => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: value || null }));
        editor.commands.focus();
      };
      // pressing it leaves the caret where it was: WebKit put it in the block above the code (the chip straddles
      // the block's top edge), and the click looked as if it had landed somewhere else
      chip.addEventListener('mousedown', (e) => e.preventDefault());
      // the app's one menu (Menu.svelte): a popup under the chip on the Mac, a sheet on a phone
      chip.addEventListener('click', () => {
        if (ui.menu) { ui.closeMenu(); return; }
        const current = language();
        // a language typed in markdown that the menu does not list (```vbnet) keeps its own entry
        const items = LANGUAGES.some(([v]) => v === current) ? LANGUAGES : [...LANGUAGES, [current, current] as [string, string]];
        const r = chip.getBoundingClientRect();
        chip.classList.add('open'); // the chip is hover-only, but must stay while its menu is up
        ui.openMenu({ clientX: r.left, clientY: r.bottom + 4 },
          items.map(([value, label]) => ({ label, checked: value === current, run: () => setLanguage(value) })),
          () => chip.classList.remove('open'));
      });

      const owns = (target: EventTarget | Node | null) => target instanceof Node && (chip.contains(target) || host.contains(target));
      return {
        dom,
        contentDOM: code,
        update: (updated, decorations) => {
          if (updated.type !== node.type) return false;
          chip.textContent = labelOf(updated.attrs.language);
          shown = decorations.some((d) => (d as unknown as { spec?: { editing?: boolean } }).spec?.editing);
          shownNode = updated;
          setDiagram(updated);
          return true;
        },
        // the block's own classes (mermaid, mermaid-error) are set here: read as an edit, ProseMirror made the block
        // anew, which drew again, failed again and set them again, without end
        ignoreMutation: (m) => owns(m.target) || (m.type === 'attributes' && m.target === dom),
        stopEvent: (e) => owns(e.target),
        destroy: () => { block?.destroy(); },
      };
    };
  },
}).configure({ languageClassPrefix: 'language-', enableTabIndentation: true, tabSize: 4 });

/** the code of a diagram just made from the / menu: its block opens for editing as it is first drawn */
let startNext: string | null = null;

/** the / menu's diagrams: a small example of the kind, put in at the caret and opened for editing there */
export function insertDiagram(editor: Editor, kind: Kind | Diagram) {
  const code = toCode(typeof kind === 'string' ? starter(kind) : kind);
  startNext = code;
  const { from } = editor.state.selection;
  const c = isMobile ? editor.chain() : editor.chain().focus();
  c.insertContent({ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: code }] }).run();
  // out of the block it went into, onto the line under it: drawn, not shown as code
  const $at = editor.state.doc.resolve(Math.min(editor.state.selection.from, editor.state.doc.content.size));
  for (let d = $at.depth; d > 0; d--) {
    if ($at.node(d).type.name !== 'codeBlock' || $at.before(d) < from - 2) continue;
    const tr = editor.state.tr;
    editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve($at.after(d)))).scrollIntoView());
    break;
  }
}
