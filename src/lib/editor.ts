import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { Plugin, PluginKey, type Command } from '@tiptap/pm/state';
import { WikiLink } from './wikilink';
import { shortcuts } from './shortcuts.svelte';

const KEYMAP = new PluginKey('jot-keymap');

export const getMarkdown = (editor: Editor): string => (editor.storage as any).markdown.getMarkdown();

/** Editor-scoped actions, by id. Rebindable at runtime (see applyKeymap). */
function editorCommands(editor: Editor): Record<string, () => boolean> {
  const c = () => editor.chain().focus();
  return {
    bold: () => c().toggleBold().run(),
    italic: () => c().toggleItalic().run(),
    underline: () => c().toggleUnderline().run(),
    strike: () => c().toggleStrike().run(),
    code: () => c().toggleCode().run(),
    link: () => {
      const prev = editor.getAttributes('link').href as string | undefined;
      const url = window.prompt('URL', prev ?? 'https://');
      if (url === null) return true;
      if (!url) return c().unsetLink().run();
      return c().extendMarkRange('link').setLink({ href: url }).run();
    },
    wikiLink: () => c().insertContent('[[').run(),
    paragraph: () => c().setParagraph().run(),
    h1: () => c().toggleHeading({ level: 1 }).run(),
    h2: () => c().toggleHeading({ level: 2 }).run(),
    h3: () => c().toggleHeading({ level: 3 }).run(),
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

export interface SuggestionUI {
  show(items: string[], rect: DOMRect | null, pick: (title: string) => void): void;
  move(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
}

export function createEditor(opts: {
  element: HTMLElement;
  content: string;
  onUpdate: (markdown: string) => void;
  onOpenNote: (title: string) => void;
  titles: () => string[];
  suggestionUI: SuggestionUI;
}) {
  const editor = new Editor({
    element: opts.element,
    autofocus: 'end',
    content: opts.content,
    editorProps: { attributes: { class: 'prose', spellcheck: 'true' } },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
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
            return hits;
          },
          command: ({ editor, range, props }) =>
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: 'wikiLink', attrs: { title: props } }, { type: 'text', text: ' ' }])
              .run(),
          render: () => ({
            onStart: (p) => opts.suggestionUI.show(p.items as string[], p.clientRect?.() ?? null, (t) => p.command(t)),
            onUpdate: (p) => opts.suggestionUI.show(p.items as string[], p.clientRect?.() ?? null, (t) => p.command(t)),
            onKeyDown: ({ event }) => {
              if (!opts.suggestionUI.visible()) return false;
              if (event.key === 'ArrowDown') return (opts.suggestionUI.move(1), true);
              if (event.key === 'ArrowUp') return (opts.suggestionUI.move(-1), true);
              if (event.key === 'Enter' || event.key === 'Tab') return opts.suggestionUI.select();
              if (event.key === 'Escape') return (opts.suggestionUI.hide(), true);
              return false;
            },
            onExit: () => opts.suggestionUI.hide(),
          }),
        },
      }),
    ],
    onUpdate: ({ editor }) => opts.onUpdate(getMarkdown(editor)),
  });
  applyKeymap(editor);
  if (import.meta.env.DEV) (window as any).__jot = editor;
  return editor;
}
