import CodeBlockBase from '@tiptap/extension-code-block';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ui } from './ui.svelte';
import { isMobile } from './platform';
import { renderMermaid, themeKey } from './mermaid';

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

/** lowlight's tree for every code block, as inline decorations carrying its hljs-* classes */
function highlight(doc: PMNode): DecorationSet {
  if (!lowlight) return DecorationSet.empty;
  const ll = lowlight, out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    const lang: string | null = node.attrs.language;
    const tree = lang && ll.registered(lang) ? ll.highlight(lang, node.textContent) : ll.highlightAuto(node.textContent);
    let at = pos + 1;
    const walk = (nodes: Hast[] = [], classes: string[]) => {
      for (const n of nodes) {
        if (n.type === 'text') {
          const to = at + (n.value?.length ?? 0);
          if (classes.length) out.push(Decoration.inline(at, to, { class: classes.join(' ') }));
          at = to;
        } else walk(n.children, [...classes, ...(n.properties?.className ?? [])]);
      }
    };
    walk(tree.children, []);
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
          return n.attrs.language === 'mermaid' ? DecorationSet.create(state.doc, [Decoration.node($head.before(d), $head.after(d), { class: 'editing' })]) : null;
        }
      }
      return null;
    },
  },
});

/** Syntax highlighting, plus a language chip (and its menu) that appears on hover. */
export const CodeBlock = CodeBlockBase.extend({
  addProseMirrorPlugins() { return [...(this.parent?.() ?? []), highlighter, editingDiagram]; },
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        // the fence one backtick longer than any run of backticks in the code: always ``` before, so a ``` line
        // in the code closed the block there, and the note came back split into code, text and an open fence
        serialize(state: any, node: any) {
          const longest = Math.max(0, ...(node.textContent.match(/`+/g) ?? []).map((r: string) => r.length));
          const fence = '`'.repeat(Math.max(3, longest + 1));
          state.write(fence + (node.attrs.language || '') + '\n');
          state.text(node.textContent, false);
          state.ensureNewLine();
          state.write(fence);
          state.closeBlock(node);
        },
      },
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
      // a mermaid block's picture: drawn from its code, a click on it puts the caret in the code
      const view = document.createElement('div');
      view.className = 'mermaid-view diagram-canvas';
      view.contentEditable = 'false';
      dom.append(chip, pre, view);
      let drawn = '', timer: ReturnType<typeof setTimeout> | undefined, gone = false;
      const draw = (n: PMNode) => {
        const on = n.attrs.language === 'mermaid';
        dom.classList.toggle('mermaid', on);
        if (!on) { drawn = ''; view.replaceChildren(); return; }
        const want = themeKey() + '\u0000' + n.textContent;
        if (want === drawn) return;
        drawn = want;
        clearTimeout(timer);
        // as it is typed, a moment after the keys stop; the first drawing at once
        timer = setTimeout(async () => {
          const out = await renderMermaid(n.textContent);
          if (gone || drawn !== want) return;
          dom.classList.toggle('mermaid-error', 'error' in out);
          if ('svg' in out) view.innerHTML = out.svg;
          else view.textContent = out.error;
        }, view.childNodes.length ? 300 : 0);
      };
      draw(node);
      const redraw = () => { const p = typeof getPos === 'function' ? getPos() : null; const n = p == null ? null : editor.state.doc.nodeAt(p); if (n) draw(n); };
      const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
      scheme?.addEventListener('change', redraw);
      const themeWatch = new MutationObserver(redraw);
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      // a click on the picture opens it in the builder (DiagramBuilder.svelte), which also has its code
      view.addEventListener('mousedown', (e) => e.preventDefault());
      view.addEventListener('click', () => {
        const p = typeof getPos === 'function' ? getPos() : null;
        const n = p == null ? null : editor.state.doc.nodeAt(p);
        if (p == null || !n || ui.diagram) return;
        void ui.openDiagram(n.textContent, view.offsetWidth).then((code) => {
          const at = typeof getPos === 'function' ? getPos() : null;
          const now = at == null ? null : editor.state.doc.nodeAt(at);
          if (at == null || !now || code === null || code === now.textContent) return;
          const tr = editor.state.tr.replaceWith(at + 1, at + now.nodeSize - 1, editor.schema.text(code));
          // the caret under the diagram, so it shows as drawn rather than as its code
          editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + tr.doc.nodeAt(at)!.nodeSize))).scrollIntoView());
        });
      });

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

      const owns = (target: EventTarget | Node | null) => target instanceof Node && (chip.contains(target) || view.contains(target));
      return {
        dom,
        contentDOM: code,
        update: (updated) => {
          if (updated.type !== node.type) return false;
          chip.textContent = labelOf(updated.attrs.language);
          draw(updated);
          return true;
        },
        // the block's own classes (mermaid, mermaid-error) are set here: read as an edit, ProseMirror made the block
        // anew, which drew again, failed again and set them again, without end
        ignoreMutation: (m) => owns(m.target) || (m.type === 'attributes' && m.target === dom),
        stopEvent: (e) => owns(e.target),
        destroy: () => { gone = true; clearTimeout(timer); scheme?.removeEventListener('change', redraw); themeWatch.disconnect(); },
      };
    };
  },
}).configure({ languageClassPrefix: 'language-' });

/** the width a diagram drawn at the caret will have: its block's container, inside its padding (the note's column,
 *  a list item, a callout), so the builder previews it at that size */
export function canvasWidth(editor: Editor): number {
  const { $from } = editor.state.selection;
  const block = $from.depth ? editor.view.nodeDOM($from.before($from.depth)) : null;
  const box = (block instanceof HTMLElement ? block.parentElement : null) ?? editor.view.dom;
  const cs = getComputedStyle(box);
  return Math.round(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 640;
}

/** the / menu's Diagram: the builder, and what it made put in at the caret */
export function insertDiagram(editor: Editor) {
  void ui.openDiagram(null, canvasWidth(editor)).then((code) => {
    if (!code || editor.isDestroyed) return;
    const { from } = editor.state.selection;
    const c = isMobile ? editor.chain() : editor.chain().focus();
    c.insertContent({ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: code }] }).run();
    // out of the block it went into, onto the line under it
    const $at = editor.state.doc.resolve(Math.min(editor.state.selection.from, editor.state.doc.content.size));
    for (let d = $at.depth; d > 0; d--) {
      if ($at.node(d).type.name !== 'codeBlock' || $at.before(d) < from - 2) continue;
      const tr = editor.state.tr;
      editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve($at.after(d)))).scrollIntoView());
      break;
    }
  });
}
