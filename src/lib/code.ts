import CodeBlockBase from '@tiptap/extension-code-block';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

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

/** Syntax highlighting, plus a language chip (and its menu) that appears on hover. */
export const CodeBlock = CodeBlockBase.extend({
  addProseMirrorPlugins() { return [...(this.parent?.() ?? []), highlighter]; },
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
      dom.append(chip, pre);

      // a popover, so the browser handles the top layer, Esc, and click-outside for us
      const menu = document.createElement('ul');
      menu.className = 'lang-menu';
      menu.popover = 'auto';
      chip.popoverTargetElement = menu;

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

      menu.addEventListener('beforetoggle', (e) => {
        const open = (e as ToggleEvent).newState === 'open';
        chip.classList.toggle('open', open); // the chip is hover-only, but must stay while its menu is up
        if (!open) return;
        const current = language();
        // a language typed in markdown that the menu does not list (```vbnet) keeps its own entry
        const items = LANGUAGES.some(([v]) => v === current) ? LANGUAGES : [...LANGUAGES, [current, current] as [string, string]];
        menu.replaceChildren(...items.map(([value, label]) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = label;
          if (value === current) item.classList.add('on');
          item.addEventListener('mouseenter', () => item.focus());
          item.addEventListener('click', () => { menu.hidePopover(); setLanguage(value); });
          const li = document.createElement('li');
          li.append(item);
          return li;
        }));
      });
      menu.addEventListener('toggle', (e) => {
        if ((e as ToggleEvent).newState !== 'open') return;
        const r = chip.getBoundingClientRect();
        menu.style.left = `${Math.round(Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
        const below = r.bottom + 4;
        menu.style.top = `${Math.round(below + menu.offsetHeight + 8 > innerHeight ? Math.max(8, r.top - 4 - menu.offsetHeight) : below)}px`;
        (menu.querySelector<HTMLButtonElement>('button.on') ?? menu.querySelector('button'))?.focus();
        menu.querySelector('button.on')?.scrollIntoView({ block: 'nearest' });
      });
      menu.addEventListener('keydown', (e) => {
        const items = [...menu.querySelectorAll('button')];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
        else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
      document.body.append(menu);

      const owns = (target: EventTarget | Node | null) => target === chip || (target instanceof Node && chip.contains(target));
      return {
        dom,
        contentDOM: code,
        update: (updated) => updated.type === node.type && ((chip.textContent = labelOf(updated.attrs.language)), true),
        ignoreMutation: (m) => owns(m.target),
        stopEvent: (e) => owns(e.target),
        destroy: () => menu.remove(),
      };
    };
  },
}).configure({ languageClassPrefix: 'language-' });
