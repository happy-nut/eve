import CodeBlockBase from '@tiptap/extension-code-block';
import { textblockTypeInputRule, type Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView, type ViewMutationRecord } from '@tiptap/pm/view';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { ui, under } from './ui.svelte';
import { claimKeys, composing, PRIORITY } from './keys';
import { isMobile } from './platform';
import { inKorean, starter, toCode, type Diagram, type Kind } from './diagram';
import { mountDiagram } from './diagramBlock.svelte';
import { closeHistory, redoNoScroll, undoNoScroll } from '@tiptap/pm/history';
import { blockBeside, inCell } from './blocks';
import { fenceFor } from './markdown';
import { heldWhileComposing, whenComposed } from './ime';

type Hast = { type: string; value?: string; properties?: { className?: string[] }; children?: Hast[] };
type Lowlight = { highlight(lang: string, code: string): Hast & { data?: { relevance?: number } }; registered(lang: string): boolean };
let lowlight: Lowlight | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<Editor>();
const HIGHLIGHT = new PluginKey<DecorationSet>('highlight');

function withGrammars(editor: Editor) {
  if (lowlight) return;
  waiting.add(editor);
  grammars();
}
function grammars() {
  return loading ??= import('./grammars').then((m) => {
    lowlight = m.lowlight;
    for (const e of waiting) if (!e.isDestroyed) e.view.dispatch(e.state.tr.setMeta(HIGHLIGHT, true));
    waiting.clear();
  }, () => { loading = null; });
}

const spans = new WeakMap<PMNode, [from: number, to: number, cls: string][]>();

function spansOf(node: PMNode) {
  let got = spans.get(node);
  if (got) return got;
  const ll = lowlight!, text = node.textContent, lang: string | null = node.attrs.language;
  const tree = lang && ll.registered(lang) ? ll.highlight(lang, text) : null;
  got = [];
  let at = 0;
  const walk = (nodes: Hast[] = [], classes: string[]) => {
    for (const n of nodes) {
      if (n.type === 'text') {
        const to = at + (n.value?.length ?? 0);
        if (classes.length) got!.push([at, to, classes.join(' ')]);
        at = to;
      } else walk(n.children, n.properties?.className?.length ? n.properties.className : classes);
    }
  };
  if (tree) walk(tree.children, []);
  spans.set(node, got);
  return got;
}

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

const highlighter = new Plugin<DecorationSet>({
  key: HIGHLIGHT,
  state: {
    init: (_, { doc }) => highlight(doc),
    apply: (tr, set, _old, now) => (tr.getMeta(HIGHLIGHT) || tr.docChanged ? highlight(now.doc) : set),
  },
  props: { decorations: heldWhileComposing((state) => HIGHLIGHT.getState(state)) },
});

const SHELL_COMMAND = /^(?:\.{0,2}\/[\w./-]+|git|gh|npm|npx|yarn|pnpm|bun|deno|node|cd|ls|curl|wget|docker|docker-compose|kubectl|helm|brew|apt|apt-get|yum|pip|pip3|python|python3|java|javac|gradle|mvn|make|cargo|rustup|go|export|echo|mkdir|rm|cp|mv|cat|touch|chmod|chown|ln|ssh|scp|grep|tail|head|tar|unzip|source|which|open|aws|gcloud|terraform|psql|mysql|redis-cli|xcodebuild|xcrun|sed|awk|find|kill|ps|env|sh|bash|zsh)$/;
const TEXT_ART = /[←-⇿─-╿■-◿]/;
const SIBLING_LANGUAGES = [['javascript', 'typescript'], ['c', 'cpp'], ['css', 'scss']];
export function guessLanguage(code: string, ll: Lowlight | null): string | null {
  const text = code.trim();
  if (!text || TEXT_ART.test(text)) return null;
  if (/^[[{]/.test(text)) { try { JSON.parse(text); return 'json'; } catch { } }
  if (/^<[a-z!?]/i.test(text) && /<\/?[a-z][^>]*>$/i.test(text)) return 'xml';
  const lines = text.split('\n'), commands: string[] = [];
  lines.forEach((line, i) => {
    const l = line.trim();
    if (l && !l.startsWith('#') && !lines[i - 1]?.trimEnd().endsWith('\\')) commands.push(l.replace(/^\$\s+/, '').replace(/^sudo\s+/, ''));
  });
  if (commands.length && commands.every((l) => SHELL_COMMAND.test(l.split(/\s/)[0]))) return 'bash';
  if (!ll) return null;
  const kin = (a: string, b: string) => a === b || SIBLING_LANGUAGES.some((k) => k.includes(a) && k.includes(b));
  const scores = LANGUAGES.map(([v]) => v).filter((v) => v && v !== 'mermaid' && v !== 'markdown' && ll.registered(v))
    .map((v) => [v, ll.highlight(v, text).data?.relevance ?? 0] as const).sort((a, b) => b[1] - a[1]);
  const [best, rival] = [scores[0], scores.find(([v]) => !kin(v, scores[0][0]))];
  if (!best || best[1] < 7 || best[1] - (rival?.[1] ?? 0) < 4) return null;
  return best[0] === 'c' && text.includes('::') ? 'cpp' : best[0];
}

const guessing = new Plugin({
  view(view) {
    return {
      update() {
        if (lowlight || !unsure.size) return;
        void grammars().then(() => {
          if (view.isDestroyed) return;
          const tr = view.state.tr;
          view.state.doc.descendants((n, pos) => {
            if (!unsure.has(n)) return n.type.name !== 'codeBlock';
            const lang = guessLanguage(n.textContent, lowlight);
            if (lang) tr.setNodeMarkup(pos, undefined, { ...n.attrs, language: lang });
            return false;
          });
          unsure.clear();
          if (tr.docChanged) view.dispatch(tr);
        });
      },
    };
  },
  appendTransaction(trs, old, state) {
    if (!trs.some((tr) => tr.getMeta('paste'))) return null;
    if (!trs.some((tr) => tr.docChanged)) return null;
    const before = new Set<PMNode>();
    old.doc.descendants((n) => { if (n.type.name === 'codeBlock') before.add(n); return !n.isTextblock; });
    const tr = state.tr;
    state.doc.descendants((n, pos) => {
      if (n.type.name !== 'codeBlock') return !n.isTextblock;
      if (n.attrs.language || before.has(n) || !n.textContent.trim()) return false;
      const lang = guessLanguage(n.textContent, lowlight);
      if (lang) tr.setNodeMarkup(pos, undefined, { ...n.attrs, language: lang });
      else if (!lowlight) unsure.add(n);
      return false;
    });
    return tr.docChanged ? tr : null;
  },
});
const unsure = new Set<PMNode>();

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

const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash',
  html: 'xml', yml: 'yaml', md: 'markdown', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', toml: 'ini', kt: 'kotlin', rb: 'ruby',
  rs: 'rust', golang: 'go', plain: '', text: '', txt: '',
  docker: 'dockerfile', ps1: 'powershell', pwsh: 'powershell', proto: 'protobuf', hs: 'haskell', ex: 'elixir', exs: 'elixir',
  gradle: 'groovy', make: 'makefile', mk: 'makefile',
};
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
const passedToNewNodeViews = <T>(name: string) => {
  const key = new PluginKey<T | null>(name);
  const plugin = new Plugin<T | null>({
    key,
    state: { init: () => null, apply: (tr, was) => tr.getMeta(key) ?? (tr.getMeta('appendedTransaction') ? was : null) },
  });
  return { key, plugin, read: (state: EditorState) => key.getState(state) ?? null };
};
const ASK_LANGUAGE = passedToNewNodeViews<true>('ask-language');
const START_DIAGRAM = passedToNewNodeViews<string>('start-diagram');

const labelOf = (language: string | null) => LANGUAGES.find(([v]) => v === (language ?? ''))?.[1] ?? language ?? 'Plain text';

const EDITING = new PluginKey('mermaid-editing');
const editingDiagram = new Plugin({
  key: EDITING,
  props: {
    decorations: heldWhileComposing((state) => {
      const { $head } = state.selection;
      for (let d = $head.depth; d > 0; d--) {
        const n = $head.node(d);
        if (n.type.name === 'codeBlock') {
          return n.attrs.language === 'mermaid' ? DecorationSet.create(state.doc, [Decoration.node($head.before(d), $head.after(d), { class: 'editing' }, { editing: true })]) : null;
        }
      }
      return null;
    }),
    handleClick(view, pos) {
      const $p = view.state.doc.resolve(pos);
      let at = -1;
      for (let d = $p.depth; d > 0 && at < 0; d--) if ($p.node(d).type.name === 'codeBlock') at = $p.before(d);
      if (at < 0 && !$p.parent.isTextblock) at = $p.nodeBefore?.type.name === 'codeBlock' ? pos - $p.nodeBefore.nodeSize : $p.nodeAfter?.type.name === 'codeBlock' ? pos : -1;
      const n = at < 0 ? null : view.state.doc.nodeAt(at), { $head } = view.state.selection;
      if (!n || !isDrawn(view, n, at) || ($head.pos > at && $head.pos < at + n.nodeSize)) return false;
      view.dispatch(selectBlock(view.state, at));
      return true;
    },
  },
});

export function scrollToShow(box: { left: number; right: number }, caret: { left: number; right: number }): number {
  if (caret.left < box.left) return caret.left - box.left;
  if (caret.right > box.right) return caret.right - box.right;
  return 0;
}
const caretInSight = new Plugin({
  view: () => ({
    update(view, prev) {
      const { selection } = view.state;
      if (prev.selection.eq(selection) && prev.doc.eq(view.state.doc)) return;
      if (!selection.$head.parent.type.spec.code) return;
      const at = view.domAtPos(selection.head).node;
      const pre = (at instanceof Element ? at : at.parentElement)?.closest('pre');
      if (!pre || pre.scrollWidth <= pre.clientWidth) return;
      const { $head } = selection;
      if (!$head.parentOffset || $head.parent.textBetween($head.parentOffset - 1, $head.parentOffset) === '\n') { pre.scrollLeft = 0; return; }
      let c: { left: number; right: number };
      try { c = view.coordsAtPos(selection.head); } catch { return; }
      const r = pre.getBoundingClientRect(), pad = parseFloat(getComputedStyle(pre).paddingLeft) || 0;
      const by = scrollToShow({ left: r.left + pad, right: r.right - pad }, { left: c.left, right: c.right + 1 });
      if (by) pre.scrollLeft = Math.max(0, by < 0 ? Math.floor(pre.scrollLeft + by) : Math.ceil(pre.scrollLeft + by));
    },
  }),
});

export function focusBack(editor: Editor) {
  queueMicrotask(() => {
    const a = document.activeElement;
    if (editor.isDestroyed || (a && a !== document.body && a.isConnected)) return;
    editor.view.focus();
  });
}

function toLineBefore(state: EditorState, view: EditorView, at: number) {
  const before = state.doc.resolve(at).nodeBefore;
  if (!before?.isTextblock) return false;
  const tr = before.content.size ? state.tr.setSelection(TextSelection.create(state.doc, at - 1)) : state.tr.delete(at - before.nodeSize, at);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function isDrawn(view: EditorView, node: PMNode | null | undefined, pos: number) {
  if (node?.type.name !== 'codeBlock' || node.attrs.language !== 'mermaid') return false;
  const dom = view.nodeDOM(pos);
  return !(dom instanceof HTMLElement && dom.classList.contains('mermaid-error'));
}
const diagramOpeners = new WeakMap<Node, () => boolean>();
const selectBlock = (state: EditorState, pos: number) => state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView();
export const selectedDiagram = (state: EditorState) => {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type.name === 'codeBlock' && sel.node.attrs.language === 'mermaid' ? sel : null;
};

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
  priority: 1000,
  addProseMirrorPlugins() { return [...(this.parent?.() ?? []), highlighter, guessing, editingDiagram, caretInSight, typeBelow, ASK_LANGUAGE.plugin, START_DIAGRAM.plugin]; },
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
      ArrowDown: (p) => into('down')() || (stock.ArrowDown?.(p) ?? false),
      ArrowUp: (p) => into('up')() || (stock.ArrowUp?.(p) ?? false),
      Enter: (p) => {
        const sel = selectedDiagram(this.editor.state);
        if (sel) { const dom = this.editor.view.nodeDOM(sel.from); return !!(dom && diagramOpeners.get(dom)?.()); }
        return stock.Enter?.(p) ?? false;
      },
      Backspace: () => {
        const { state, view } = this.editor, { empty, $anchor } = state.selection;
        if (empty && $anchor.parent.type.name !== this.name) return toCodeBefore(state, view, $anchor);
        if (!empty) return false;
        if ($anchor.pos === 1 || !$anchor.parent.textContent.length) return this.editor.commands.setNode('paragraph');
        return $anchor.parentOffset === 0 && toLineBefore(state, view, $anchor.before());
      },
      Tab: (p) => {
        const { state, view } = this.editor;
        if (!state.selection.empty || state.selection.$from.parent.type.name !== this.name) return stock.Tab?.(p) ?? false;
        view.dispatch(state.tr.insertText(' '.repeat(this.options.tabSize ?? 4)).scrollIntoView());
        return true;
      },
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
  addInputRules() {
    const now = textblockTypeInputRule({ find: /^```$/, type: this.type, getAttributes: () => ({ language: null }) });
    const make = now.handler;
    now.handler = (props) => {
      if (inCell(props.state.selection.$from)) return null;
      props.state.tr.setMeta(ASK_LANGUAGE.key, true);
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
              const info = tokens[idx].info.trim().replace(/^\S+\s*/, '');
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
      chip.tabIndex = -1;
      chip.textContent = labelOf(node.attrs.language);
      const host = document.createElement('div');
      host.className = 'mermaid-host';
      host.contentEditable = 'false';
      dom.append(chip, pre, host);
      const posNow = () => getPos();
      let block: ReturnType<typeof mountDiagram> | null = null;
      let codeShown = false;
      let drawnNode: PMNode = node;
      const setDiagram = (n: PMNode) => {
        const on = n.attrs.language === 'mermaid';
        dom.classList.toggle('mermaid', on);
        if (!on) { block?.destroy(); block = null; dom.classList.remove('mermaid-error'); return; }
        if (block) { block.set({ code: n.textContent, codeShown }); return; }
        const start = START_DIAGRAM.read(editor.state) === n.textContent;
        block = mountDiagram(host, {
          code: n.textContent, start, codeShown,
          onCode: (code, startsChange) => {
            if (editor.isDestroyed) return;
            const p = posNow();
            const cur = p == null ? null : editor.state.doc.nodeAt(p);
            // equal, not the same object: the note read anew keeps this view for an equal node without telling it
            if (p == null || !cur || !cur.eq(drawnNode) || cur.textContent === code) return;
            const tr = editor.state.tr.replaceWith(p + 1, p + cur.nodeSize - 1, code ? editor.schema.text(code) : []);
            if (startsChange) closeHistory(tr);
            editor.view.dispatch(tr);
          },
          onHistory: (redo) => queueMicrotask(() => (redo ? redoNoScroll : undoNoScroll)(editor.state, editor.view.dispatch)),
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
      diagramOpeners.set(dom, () => block?.edit() ?? false);

      const language = (): string => {
        const pos = posNow();
        return (pos == null ? null : editor.state.doc.nodeAt(pos)?.attrs.language) ?? '';
      };
      const setLanguage = (value: string) => {
        const pos = posNow();
        if (pos == null) return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: value || null }));
        editor.commands.focus();
      };
      chip.addEventListener('mousedown', (e) => e.preventDefault());
      chip.addEventListener('click', () => {
        if (ui.menu) { ui.closeMenu(); return; }
        const current = language();
        const items = LANGUAGES.some(([v]) => v === current) ? LANGUAGES : [...LANGUAGES, [current, current] as [string, string]];
        const r = chip.getBoundingClientRect();
        chip.classList.add('open');
        ui.openMenu(under(r),
          items.map(([value, label]) => ({ label, keywords: [value, ...Object.keys(ALIASES).filter((k) => ALIASES[k] === value)].join(' '), checked: value === current, run: () => setLanguage(value) })),
          () => chip.classList.remove('open'), 'Search languages');
      });

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
      dom.append(ask);
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
      const fieldKey = (e: KeyboardEvent) => {
        if (composing(e)) return true;
        if (e.key === 'ArrowDown' || e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); intoCode(true); }
        else if (e.key === 'Escape') { e.preventDefault(); intoCode(false); }
        else if (e.key === 'Backspace' && !field.value) {
          e.preventDefault();
          closeField();
          editor.view.focus();
          const p = posNow();
          const cur = p == null ? null : editor.state.doc.nodeAt(p);
          if (p == null || !cur) return true;
          const para = editor.schema.nodes.paragraph.create(null, [editor.schema.text('``'), ...(cur.content.size ? [editor.schema.text(cur.textContent)] : [])]);
          const tr = editor.state.tr.replaceWith(p, p + cur.nodeSize, para);
          editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, p + 3)).scrollIntoView());
        }
        return true;
      };
      const unclaimField = claimKeys(field, { '*': fieldKey }, { capture: true, priority: PRIORITY.app, composing: true, letType: true });
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
      if (ASK_LANGUAGE.read(editor.state)) queueMicrotask(() => { if (dom.isConnected) openField(); });

      const draw = () => {
        chip.textContent = labelOf(drawnNode.attrs.language);
        setDiagram(drawnNode);
      };
      const owns = (target: EventTarget | Node | null) => target instanceof Node && (chip.contains(target) || host.contains(target) || ask.contains(target));
      const ownMutation = (m: ViewMutationRecord) => owns(m.target) || (m.type === 'attributes' && m.target === dom);
      return {
        dom,
        contentDOM: code,
        update: (updated, decorations) => {
          if (updated.type !== node.type) return false;
          codeShown = decorations.some((d) => d.spec.editing);
          drawnNode = updated;
          whenComposed(editor.view, draw);
          return true;
        },
        ignoreMutation: ownMutation,
        stopEvent: (e) => owns(e.target),
        selectNode: () => dom.classList.add('ProseMirror-selectednode'),
        deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
        destroy: () => {
          unclaimField();
          asking = false;
          const a = document.activeElement;
          const had = owns(a) || ((!a || a === document.body) && !!host.querySelector('.dblock.active, .dblock.full'));
          block?.destroy();
          if (had) focusBack(editor);
        },
      };
    };
  },
}).configure({ languageClassPrefix: 'language-', enableTabIndentation: true, tabSize: 4 });


export function starterCode(kind: Kind | Diagram, noteText: string): string {
  const d = typeof kind === 'string' ? starter(kind) : kind;
  return toCode(/[\uac00-\ud7a3]/.test(noteText) ? inKorean(d) : d);
}
export function insertDiagram(editor: Editor, kind: Kind | Diagram) {
  const code = starterCode(kind, editor.state.doc.textContent);
  const { from } = editor.state.selection;
  const c = isMobile ? editor.chain() : editor.chain().focus();
  c.setMeta(START_DIAGRAM.key, code).insertContent({ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: code }] }).run();
  const $at = editor.state.doc.resolve(Math.min(editor.state.selection.from, editor.state.doc.content.size));
  for (let d = $at.depth; d > 0; d--) {
    if ($at.node(d).type.name !== 'codeBlock' || $at.before(d) < from - 2) continue;
    const tr = editor.state.tr;
    editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve($at.after(d)))).scrollIntoView());
    break;
  }
}
