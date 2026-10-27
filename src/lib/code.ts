import CodeBlockBase from '@tiptap/extension-code-block';
import { textblockTypeInputRule, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { ui, under } from './ui.svelte';
import { composing } from './keys';
import { isMobile } from './platform';
import { starter, toCode, type Diagram, type Kind } from './diagram';
import { mountDiagram } from './diagramBlock.svelte';
import { blockBeside } from './blocks';
import { fenceFor } from './markdown';

/**
 * Syntax highlighting, loaded with the first code block shown: lowlight, highlight.js and the grammars
 * are a sixth of the app's script and most notes have no code. Until they arrive a block draws plain;
 * then every waiting editor repaints once.
 */
type Hast = { type: string; value?: string; properties?: { className?: string[] }; children?: Hast[] };
type Lowlight = { highlight(lang: string, code: string): Hast; registered(lang: string): boolean };
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

/** Each block's highlighting (spans from its start, with their hljs-* classes), kept while the block is unchanged:
 * a key typed in one block highlighted every block in the note again */
const spans = new WeakMap<PMNode, [from: number, to: number, cls: string][]>();

/** lowlight's tree for one code block */
function spansOf(node: PMNode) {
  let got = spans.get(node);
  if (got) return got;
  const ll = lowlight!, text = node.textContent, lang: string | null = node.attrs.language;
  // only in the language the block says: one guessed for plain text (or a language with no grammar here) came out in
  // some other language's colours, often the wrong one, under a chip that said Plain text
  const tree = lang && ll.registered(lang) ? ll.highlight(lang, text) : null;
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

/** every code block in the note highlighted, as inline decorations; `round` tells one drawing from the next */
function highlight(doc: PMNode, round = 0): DecorationSet {
  if (!lowlight) return DecorationSet.empty;
  const out: Decoration[] = [];
  const attrs = (cls: string) => (round ? { class: cls, 'data-round': String(round) } : { class: cls });
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    for (const [from, to, cls] of spansOf(node)) out.push(Decoration.inline(pos + 1 + from, pos + 1 + to, attrs(cls)));
    return false;
  });
  return DecorationSet.create(doc, out);
}
/** A word typed through an input method (Korean, Japanese…) is left alone on screen while it is being put together,
 *  and the highlighting it changed was never drawn after: "// 주석" stayed uncoloured, and in WebKit the block's
 *  colours stayed wrong even after the comment was deleted again. Once it is in, the highlighting is drawn again,
 *  told apart from the last drawing (`round`) so that the editor does draw it. */
let round = 0;
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
      tr.getMeta(HIGHLIGHT) === 'redraw' ? highlight(now.doc, ++round)
        : tr.getMeta(HIGHLIGHT) || (tr.docChanged && codeOf(old.doc) !== codeOf(now.doc)) ? highlight(now.doc) : set.map(tr.mapping, tr.doc),
  },
  props: {
    decorations: (state) => HIGHLIGHT.getState(state),
    handleDOMEvents: {
      compositionend: (view) => {
        if (!lowlight || !view.state.selection.$from.parent.type.spec.code) return false;
        // only once the editor has read the word in: it does so 20ms after this event (prosemirror-view's
        // endComposition); drawn before that, the screen would be drawn from a note without the word in it
        setTimeout(() => {
          if (view.isDestroyed || view.composing) return; // the next word's own end draws it
          (view as any).domObserver?.forceFlush?.(); // anything typed still unread, read first
          view.dispatch(view.state.tr.setMeta(HIGHLIGHT, 'redraw'));
        }, 60);
        return false;
      },
    },
  },
});

/** Languages offered by the chip, in menu order. Anything lowlight knows still highlights. */
const LANGUAGES: [value: string, label: string][] = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['c', 'C'],
  ['cmake', 'CMake'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['dart', 'Dart'],
  ['diff', 'Diff'],
  ['dockerfile', 'Dockerfile'],
  ['elixir', 'Elixir'],
  ['go', 'Go'],
  ['graphql', 'GraphQL'],
  ['groovy', 'Groovy / Gradle'],
  ['haskell', 'Haskell'],
  ['ini', 'INI / TOML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['lua', 'Lua'],
  ['makefile', 'Makefile'],
  ['markdown', 'Markdown'],
  ['mermaid', 'Mermaid diagram'],
  ['nginx', 'Nginx'],
  ['php', 'PHP'],
  ['powershell', 'PowerShell'],
  ['protobuf', 'Protocol Buffers'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['scala', 'Scala'],
  ['scss', 'SCSS'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['xml', 'HTML / XML'],
  ['yaml', 'YAML'],
];

/** what people type for a language, as the menu names it */
const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash',
  html: 'xml', yml: 'yaml', md: 'markdown', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', toml: 'ini', kt: 'kotlin', rb: 'ruby',
  rs: 'rust', golang: 'go', plain: '', text: '', txt: '',
  docker: 'dockerfile', ps1: 'powershell', pwsh: 'powershell', proto: 'protobuf', hs: 'haskell', ex: 'elixir', exs: 'elixir',
  gradle: 'groovy', make: 'makefile', mk: 'makefile',
};
/**
 * The language a name typed in the field means: an alias (js), a name or label (python, C++), else the first whose
 * name or label starts with it (ty → TypeScript), else one whose label has it in it. null: none of the menu's.
 */
export function matchLanguage(typed: string): [value: string, label: string] | null {
  const q = typed.trim().toLowerCase();
  if (!q) return null;
  const by = (v: string) => LANGUAGES.find(([value]) => value === v) ?? null;
  if (q in ALIASES) return by(ALIASES[q]);
  return LANGUAGES.find(([v, l]) => v === q || l.toLowerCase() === q)
    ?? LANGUAGES.find(([v, l]) => v.startsWith(q) || l.toLowerCase().startsWith(q))
    ?? LANGUAGES.find(([, l]) => l.toLowerCase().includes(q))
    ?? null;
}
/** set by ``` as it makes a block: the block's view opens its language field (it is made in the same update) */
let askLanguage = false;

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
      // at a line's start: the block's very left, whatever the pixels round to (a block placed at a fraction of a pixel
      // was left 1px scrolled, its first letter's edge cut)
      const { $head } = selection;
      if (!$head.parentOffset || $head.parent.textBetween($head.parentOffset - 1, $head.parentOffset) === '\n') { pre.scrollLeft = 0; return; }
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

/**
 * A block's own controls going with the block (an undo took out a diagram being edited, or a board's card that had the
 * keyboard): the keyboard back in the note, not left on nothing, where ⌘⇧Z and the keys typed next went unheard. A
 * moment later, once the note has drawn the change; the note's view keeps its scroll (ProseMirror focuses without one).
 */
export function focusBack(editor: Editor) {
  queueMicrotask(() => {
    const a = document.activeElement;
    if (editor.isDestroyed || (a && a !== document.body && a.isConnected)) return;
    editor.view.focus();
  });
}

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

/**
 * A diagram shown as its drawing (not as its code, as a hand-written one the editor can't draw, or one that failed, is
 * shown): a block the keys step onto and select, as they do a picture, not text the caret goes into. In its hidden
 * code the caret was out of sight, and the next ⌫ took a ")" out of it: "Parse error".
 */
export function isDrawn(view: EditorView, node: PMNode | null | undefined, pos: number) {
  if (node?.type.name !== 'codeBlock' || node.attrs.language !== 'mermaid') return false;
  const dom = view.nodeDOM(pos);
  return !(dom instanceof HTMLElement && dom.classList.contains('mermaid-error'));
}
/** the diagram at `pos` selected as a whole: outlined, ⌫ deletes it, ↵ opens it */
const selectBlock = (state: EditorState, pos: number) => state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView();
/** the diagram selected as a whole (⌫ under it, ↑ onto it, Done) */
export const selectedDiagram = (state: EditorState) => {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === 'codeBlock' && sel.node.attrs.language === 'mermaid' ? sel : null;
};

/**
 * ⌫ at the start of a line under code (a diagram's too, or code ending the list item above): the caret to the end of
 * the code, an empty line gone, as ⌦ from above goes into it. The stock join ran the line into the code
 * ("A --> Bbelow"), where it was code from then on. The caret goes in rather than the code being selected first, as
 * a picture is: code is text the caret can be in, and nothing is lost by a press. A drawn diagram is a picture, and is
 * selected first (an empty line going, as under a picture); the second ⌫ deletes it.
 */
function toCodeBefore(state: EditorState, view: EditorView, $at: ResolvedPos) {
  if (!$at.parent.isTextblock || $at.parentOffset !== 0) return false;
  const code = blockBeside($at, -1);
  if (code?.node.type.name !== 'codeBlock') return false;
  const tr = $at.parent.content.size ? state.tr : state.tr.delete($at.before(), $at.after());
  if (isDrawn(view, code.node, code.pos)) tr.setSelection(NodeSelection.create(tr.doc, code.pos));
  else tr.setSelection(TextSelection.create(tr.doc, code.pos + code.node.nodeSize - 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Typing with a diagram selected (after Done, or ↑ onto it): the text goes on the line under it, made when there is
 * none. The stock input put the letter in the diagram's place, and the diagram was gone.
 */
const typeBelow = new Plugin({
  props: {
    handleTextInput(view, _from, _to, text) {
      const sel = selectedDiagram(view.state);
      if (!sel) return false;
      const tr = view.state.tr, after = sel.to, next = tr.doc.nodeAt(after), para = view.state.schema.nodes.paragraph;
      const $after = tr.doc.resolve(after);
      if (!(next?.type === para && !next.content.size)) {
        if (!$after.parent.canReplaceWith($after.index(), $after.index(), para)) return false;
        tr.insert(after, para.create());
      }
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).insertText(text).scrollIntoView());
      return true;
    },
  },
});

export const CodeBlock = CodeBlockBase.extend({
  // ahead of a list's own keys: Tab in code inside a list indents the code, not the whole list item
  priority: 1000,
  addProseMirrorPlugins() { return [...(this.parent?.() ?? []), highlighter, editingDiagram, caretInSight, typeBelow]; },
  // ↓ from the line above a diagram (↑ from the line under it) goes onto it, selected, and ↵ opens it; one shown as
  // code goes into its code. Its code hidden, the caret went past the diagram, and the keyboard could not reach it
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
      const p = dir === 'down' ? at : at - n.nodeSize;
      if (isDrawn(view, n, p)) view.dispatch(selectBlock(state, p));
      else view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, dir === 'down' ? at + 1 : at - 1)).scrollIntoView());
      return true;
    };
    const stock = this.parent?.() ?? {};
    return {
      ...stock,
      // ↑ at the start of a code block heading the note still makes a line above it (the stock exit)
      ArrowDown: (p) => into('down')() || (stock.ArrowDown?.(p) ?? false),
      ArrowUp: (p) => into('up')() || (stock.ArrowUp?.(p) ?? false),
      // ↵ on a diagram selected: opened for editing, as a click opens it (the stock ↵ put a line in its place)
      Enter: (p) => {
        const sel = selectedDiagram(this.editor.state);
        if (sel) return !!(this.editor.view.nodeDOM(sel.from) as any)?.__openDiagram?.();
        return stock.Enter?.(p) ?? false;
      },
      // ⌫ in an emptied block, or at the start of the note's first: the line is plain again where it is. The stock
      // one lifted it out of every list or callout around it too (cutting that in two), and its lines ran into one
      // on save (no line breaks put in for the code's newlines)
      Backspace: () => {
        const { state, view } = this.editor, { empty, $anchor } = state.selection;
        if (empty && $anchor.parent.type.name !== this.name) return toCodeBefore(state, view, $anchor);
        if (!empty) return false;
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
        const code = blockBeside($head, 1);
        if (code?.node.type.name !== this.name) return false;
        if ($head.parent.content.size && isDrawn(view, code.node, code.pos)) return view.dispatch(selectBlock(state, code.pos)), true;
        const tr = $head.parent.content.size ? state.tr.setSelection(TextSelection.create(state.doc, code.pos + 1)) : state.tr.delete($head.before(), $head.after());
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
  // ``` alone at the start of a line: a code block at once, the keyboard in its language field (↓, Tab, ↩ or a space
  // go on into the code). ```lang then a space or Enter (and ~~~ likewise): a language with capitals or signs too
  // (```TypeScript, ```c++, ```C#). Not in a table cell, whose code a table can't keep (it came back as plain text)
  addInputRules() {
    const now = textblockTypeInputRule({ find: /^```$/, type: this.type, getAttributes: () => ({ language: null }) });
    const make = now.handler;
    now.handler = (props) => {
      if (inCell(props.state.selection.$from)) return null;
      askLanguage = true;
      return make(props);
    };
    return [now, ...['```', '~~~'].map((fence) => {
      const rule = textblockTypeInputRule({
        find: new RegExp(`^${fence}([\\w+#.-]+)?[\\s\\n]$`, 'i'),
        type: this.type,
        getAttributes: (m) => ({ language: m[1]?.toLowerCase() || null }),
      });
      const run = rule.handler;
      rule.handler = (props) => (inCell(props.state.selection.$from) ? null : run(props));
      return rule;
    })];
  },
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        // the fence one backtick longer than any run of backticks in the code (fenceFor)
        serialize(state: any, node: any) {
          const fence = fenceFor(node.textContent);
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
          onLeave: () => {
            const p = posNow();
            const cur = p == null ? null : editor.state.doc.nodeAt(p);
            if (p == null || !cur || editor.isDestroyed) return;
            editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p)));
            editor.view.focus();
          },
          onDelete: (focus) => {
            const p = posNow();
            const cur = p == null ? null : editor.state.doc.nodeAt(p);
            if (p == null || !cur || editor.isDestroyed) return;
            const tr = editor.state.tr.delete(p, p + cur.nodeSize);
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(p, tr.doc.content.size)), 1));
            editor.view.dispatch(tr.scrollIntoView());
            if (focus) editor.view.focus();
          },
        });
      };
      setDiagram(node);
      (dom as any).__openDiagram = () => block?.edit() ?? false;

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
        ui.openMenu(under(r),
          items.map(([value, label]) => ({ label, keywords: [value, ...Object.keys(ALIASES).filter((k) => ALIASES[k] === value)].join(' '), checked: value === current, run: () => setLanguage(value) })),
          () => chip.classList.remove('open'), 'Search languages');
      });

      // the language field, where ``` puts the keyboard: a name (or the start of one, an alias) and ↓, Tab, ↩ or a
      // space go on into the code in that language; Esc goes on with none; ⌫ with nothing typed takes the ``` back
      const ask = document.createElement('span');
      ask.className = 'code-lang-ask';
      ask.contentEditable = 'false';
      const field = document.createElement('input');
      field.placeholder = 'Language';
      field.spellcheck = false;
      field.setAttribute('aria-label', 'Code language');
      field.setAttribute('autocapitalize', 'off');
      const hint = document.createElement('span');
      hint.className = 'code-lang-hint';
      ask.append(field, hint);
      dom.append(ask); // always there, shown by .asking: put in and taken out, ProseMirror read it as an edit
      const showHint = () => {
        const m = matchLanguage(field.value);
        hint.textContent = field.value.trim() ? (m ? m[1] : field.value.trim().toLowerCase()) : '↓ to code';
      };
      field.addEventListener('input', showHint);
      let asking = false;
      const openField = () => {
        asking = true;
        dom.classList.add('asking');
        field.value = '';
        showHint();
        field.focus({ preventScroll: true });
      };
      const closeField = () => { asking = false; dom.classList.remove('asking'); };
      /** into the code, at its start, in the language typed (`keep`: none chosen, as Esc leaves it) */
      const intoCode = (keep: boolean) => {
        const typed = field.value.trim();
        closeField();
        const p = posNow();
        const cur = p == null ? null : editor.state.doc.nodeAt(p);
        if (p == null || !cur || editor.isDestroyed) return;
        const value = keep && typed ? (matchLanguage(typed)?.[0] ?? typed.toLowerCase()) : null;
        const tr = editor.state.tr;
        if ((value || null) !== (cur.attrs.language ?? null)) tr.setNodeMarkup(p, undefined, { ...cur.attrs, language: value || null });
        editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, p + 1)).scrollIntoView());
        editor.view.focus();
      };
      field.addEventListener('keydown', (e) => {
        e.stopPropagation(); // the app's own keys (Esc hides the window) and the note's are not this field's
        if (composing(e)) return;
        if (e.key === 'ArrowDown' || e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); intoCode(true); }
        else if (e.key === 'Escape') { e.preventDefault(); intoCode(false); }
        else if (e.key === 'Backspace' && !field.value) {
          // the ``` back as it was typed, less the last `, as ⌫ after it would have left it
          e.preventDefault();
          closeField();
          editor.view.focus();
          const p = posNow();
          const cur = p == null ? null : editor.state.doc.nodeAt(p);
          if (p == null || !cur) return;
          // the block as the ``` line was (what it was made of stays after it), not the stock undo: the keyboard going to
          // the field had already put a step between
          const para = editor.schema.nodes.paragraph.create(null, [editor.schema.text('``'), ...(cur.content.size ? [editor.schema.text(cur.textContent)] : [])]);
          const tr = editor.state.tr.replaceWith(p, p + cur.nodeSize, para);
          editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, p + 3)).scrollIntoView());
        }
      });
      // a click away: the language as typed so far, the keyboard where the click took it
      field.addEventListener('blur', () => {
        if (!asking) return;
        const typed = field.value.trim();
        closeField();
        const p = posNow();
        const cur = p == null ? null : editor.state.doc.nodeAt(p);
        if (!typed || p == null || !cur || editor.isDestroyed) return;
        const value = matchLanguage(typed)?.[0] ?? typed.toLowerCase();
        if (value !== (cur.attrs.language ?? '')) editor.view.dispatch(editor.state.tr.setNodeMarkup(p, undefined, { ...cur.attrs, language: value || null }));
      });
      if (askLanguage) { askLanguage = false; queueMicrotask(() => { if (dom.isConnected) openField(); }); }

      const owns = (target: EventTarget | Node | null) => target instanceof Node && (chip.contains(target) || host.contains(target) || ask.contains(target));
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
        // selected as a whole (a diagram, ⌫ under it): outlined as a picture is, and not made draggable as the stock does
        selectNode: () => dom.classList.add('ProseMirror-selectednode'),
        deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
        destroy: () => {
          asking = false;
          // the keyboard on the diagram (or in the language field) as it goes, an undo taking it out: back to the note
          const a = document.activeElement;
          const had = owns(a) || ((!a || a === document.body) && !!host.querySelector('.dblock.active, .dblock.full'));
          block?.destroy();
          if (had) focusBack(editor);
        },
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
