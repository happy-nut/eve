import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { Plugin, PluginKey, type Command } from '@tiptap/pm/state';
import { WikiLink } from './wikilink';
import { Callout } from './callout';
import { LocalImage } from './image';
import { ui } from './ui.svelte';
import { pickImage } from './platform';
import Suggestion from '@tiptap/suggestion';
import { shortcuts } from './shortcuts.svelte';

const KEYMAP = new PluginKey('eve-keymap');

export const getMarkdown = (editor: Editor): string => (editor.storage as any).markdown.getMarkdown();

/** Editor-scoped actions, by id. Rebindable at runtime (see applyKeymap). */
function editorCommands(editor: Editor): Record<string, () => boolean> {
  const c = () => editor.chain().focus();
  return {
    slash: () => c().insertContent('/').run(),
    callout: () => c().toggleWrap('callout').run(),
    image: () => {
      pickImage().then((src) => src && c().setImage({ src }).run());
      return true;
    },
    bold: () => c().toggleBold().run(),
    italic: () => c().toggleItalic().run(),
    underline: () => c().toggleUnderline().run(),
    strike: () => c().toggleStrike().run(),
    code: () => c().toggleCode().run(),
    link: () => {
      const prev = editor.getAttributes('link').href as string | undefined;
      ui.prompt('Link URL', prev ?? 'https://').then((url) => {
        if (url === null) return;
        if (!url) c().unsetLink().run();
        else c().extendMarkRange('link').setLink({ href: url }).run();
      });
      return true;
    },
    wikiLink: () => c().insertContent('[[').run(),
    paragraph: () => c().setParagraph().run(),
    h1: () => c().toggleHeading({ level: 1 }).run(),
    h2: () => c().toggleHeading({ level: 2 }).run(),
    h3: () => c().toggleHeading({ level: 3 }).run(),
    h4: () => c().toggleHeading({ level: 4 }).run(),
    h5: () => c().toggleHeading({ level: 5 }).run(),
    bulletList: () => c().toggleBulletList().run(),
    orderedList: () => c().toggleOrderedList().run(),
    taskList: () => c().toggleTaskList().run(),
    blockquote: () => c().toggleBlockquote().run(),
    codeBlock: () => c().toggleCodeBlock().run(),
    divider: () => c().setHorizontalRule().run(),
  };
}

/** (Re)install the user keymap in front of every other plugin, so rebinding wins. */
export function applyKeymap(editor: Editor) {
  const cmds = editorCommands(editor);
  const bindings: Record<string, Command> = {};
  for (const a of shortcuts.actions) {
    if (a.scope === 'editor' && a.keys && cmds[a.id]) bindings[a.keys] = () => cmds[a.id]();
  }
  editor.unregisterPlugin(KEYMAP);
  const plugin = new Plugin({ key: KEYMAP, props: { handleKeyDown: keydownHandler(bindings) } });
  editor.registerPlugin(plugin, (p, all) => [p, ...all]);
}

export interface SuggestItem { label: string; hint?: string; run?: (editor: Editor) => void }
export interface SuggestionUI {
  show(items: SuggestItem[], rect: DOMRect | null, pick: (item: SuggestItem) => void): void;
  move(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
}

/** Shared suggestion popup wiring for [[ and / menus. */
function popup(uiRef: SuggestionUI) {
  return {
    onStart: (p: any) => uiRef.show(p.items, p.clientRect?.() ?? null, (i: SuggestItem) => p.command(i)),
    onUpdate: (p: any) => uiRef.show(p.items, p.clientRect?.() ?? null, (i: SuggestItem) => p.command(i)),
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!uiRef.visible()) return false;
      if (event.key === 'ArrowDown') return (uiRef.move(1), true);
      if (event.key === 'ArrowUp') return (uiRef.move(-1), true);
      if (event.key === 'Enter' || event.key === 'Tab') return uiRef.select();
      if (event.key === 'Escape') return (uiRef.hide(), true);
      return false;
    },
    onExit: () => uiRef.hide(),
  };
}

/** The "/" block menu, Notion-style. */
const SLASH: SuggestItem[] = [
  { label: 'Callout', hint: '💡 highlighted box', run: (e) => e.chain().focus().toggleWrap('callout').run() },
  { label: 'Code block', hint: '``` code', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { label: 'Divider', hint: '---', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { label: 'Image', hint: 'Pick a file', run: (e) => { pickImage().then((src) => src && e.chain().focus().setImage({ src }).run()); } },
  { label: 'Link to note', hint: '[[ another note', run: (e) => e.chain().focus().insertContent('[[').run() },
];

export function createEditor(opts: {
  element: HTMLElement;
  content: string;
  onUpdate: (markdown: string) => void;
  onOpenNote: (title: string) => void;
  titles: () => string[];
  suggestionUI: SuggestionUI;
  cursor?: number;
}) {
  const editor = new Editor({
    element: opts.element,
    autofocus: opts.cursor === undefined ? 'end' : false,
    content: opts.content,
    editorProps: { attributes: { class: 'prose', spellcheck: 'true' } },
    onCreate: ({ editor }) => {
      if (opts.cursor !== undefined) editor.commands.setTextSelection(Math.min(opts.cursor, editor.state.doc.content.size));
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
        link: { openOnClick: false, autolink: true },
        codeBlock: { languageClassPrefix: 'language-' },
      }),
      TaskList,
      // tiptap-markdown only marks bullet/ordered lists as tight; do the same for task lists
      Extension.create({
        name: 'tightTaskList',
        addGlobalAttributes: () => [{
          types: ['taskList'],
          attributes: {
            tight: {
              default: true,
              parseHTML: (el: HTMLElement) => el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
              renderHTML: (a: Record<string, unknown>) => ({ 'data-tight': a.tight ? 'true' : null }),
            },
          },
        }],
      }),
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start typing… `#` heading, `-` list, `[[` link' }),
      Markdown.configure({ html: true, transformPastedText: true, linkify: true, breaks: false }),
      WikiLink.configure({
        onOpen: opts.onOpenNote,
        suggestion: {
          char: '[[',
          allowSpaces: true,
          startOfLine: false,
          pluginKey: new PluginKey('wikiLinkSuggest'),
          items: ({ query }) => {
            const q = query.toLowerCase();
            const hits = opts.titles().filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
            if (query && !hits.some((t) => t.toLowerCase() === q)) hits.push(query);
            return hits.map((label) => ({ label }));
          },
          command: ({ editor, range, props }) =>
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: 'wikiLink', attrs: { title: (props as SuggestItem).label } }, { type: 'text', text: ' ' }])
              .run(),
          render: () => popup(opts.suggestionUI),
        },
      }),
      Callout,
      LocalImage.configure({ inline: false, allowBase64: true }),
      Extension.create({
        name: 'slashMenu',
        addProseMirrorPlugins() {
          return [
            Suggestion({
              editor: this.editor,
              char: '/',
              pluginKey: new PluginKey('slashMenu'),
              allowSpaces: false,
              allowedPrefixes: null, // trigger mid-word too, like Notion
              items: ({ query }) => {
                const q = query.toLowerCase();
                return SLASH.filter((i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q));
              },
              command: ({ editor, range, props }) => {
                editor.chain().focus().deleteRange(range).run();
                (props as SuggestItem).run?.(editor);
              },
              render: () => popup(opts.suggestionUI),
            }),
          ];
        },
      }),
    ],
    onUpdate: ({ editor }) => opts.onUpdate(getMarkdown(editor)),
  });
  applyKeymap(editor);
  if (import.meta.env.DEV) (window as any).__eve = editor;
  return editor;
}
