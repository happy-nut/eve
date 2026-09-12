import { Editor, Extension, textInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { Plugin, PluginKey, type Command } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import type { Node as PMNode } from '@tiptap/pm/model';
import { WikiLink } from './wikilink';
import { Callout } from './callout';
import { LocalImage } from './image';
import { Bookmark, URL_RE } from './bookmark';
import { Kanban, insertKanban } from './kanban';
import { CodeBlock } from './code';
import { ui } from './ui.svelte';
import { notes, titleOf } from './notes.svelte';
import { isCustom, RANDOM_ICONS } from './icons';
import { pickImage, saveImage } from './platform';
import Suggestion from '@tiptap/suggestion';
import { shortcuts } from './shortcuts.svelte';

/** list items hold text or an image first, then any block (stock TipTap insists on a paragraph) */
const LIST_ITEM_CONTENT = '(paragraph|image) block*';

const KEYMAP = new PluginKey('eve-keymap');
const APP_GUARD = new PluginKey('eve-app-guard');
let suggestionVisible: () => boolean = () => false;

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
  editor.unregisterPlugin(APP_GUARD);
  // App-scope combos (e.g. ⌘B rebound to "focus sidebar") must not be eaten by the editor's
  // built-in keymaps; mark the event and stop editor handling so the window listener runs it.
  const guard = new Plugin({
    key: APP_GUARD,
    props: {
      handleKeyDown: (_view, e) => {
        if (suggestionVisible()) return false;
        const a = shortcuts.match(e, ['app']);
        if (!a || a.id === 'hide') return false;
        (e as any).eveApp = true;
        return true;
      },
    },
  });
  editor.registerPlugin(guard, (p, all) => [p, ...all]);
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
  { label: 'Kanban', hint: '칸반 board', run: insertKanban },
  { label: 'Image', hint: 'Pick a file', run: (e) => { pickImage().then((src) => src && e.chain().focus().setImage({ src }).run()); } },
  { label: 'Link to note', hint: '[[ another note', run: (e) => e.chain().focus().insertContent('[[').run() },
  { label: 'New page', hint: '📄 하위 페이지', run: newPage },
  {
    label: 'Emoji', hint: '😀 pick one',
    run: (e) => {
      const c = e.view.coordsAtPos(e.state.selection.from);
      ui.pickEmoji(new DOMRect(c.left, c.top, 0, c.bottom - c.top)).then((v) => {
        if (v && !isCustom(v)) e.chain().focus().insertContent(v).run(); else e.commands.focus();
      });
    },
  },
];

/** 'Untitled', 'Untitled 2', … — a fresh page needs a title no other page answers to, because
 *  [[links]] resolve by title. Renaming the page carries its links along (see followRename). */
function untitled(): string {
  const taken = new Set(notes.visible.map((n) => titleOf(n)));
  let title = 'Untitled';
  for (let i = 2; taken.has(title); i++) title = `Untitled ${i}`;
  return title;
}

/**
 * Notion-style sub-page: a [[link]] lands at the cursor and the new page opens straight away,
 * nested under this one in the sidebar, with its title selected so the first keystroke names it.
 */
function newPage(editor: Editor) {
  const parent = notes.current;
  const title = untitled();
  editor.chain().focus().insertContent([{ type: 'wikiLink', attrs: { title } }, { type: 'text', text: ' ' }]).run();
  if (parent) notes.flush(parent.id); // creating the page navigates away from this editor
  notes.selectTitle = true;
  const child = notes.create(`# ${title}\n\n`, parent?.group ?? '', parent?.id);
  if (parent?.icon) notes.setIcon(child.id, RANDOM_ICONS[Math.floor(Math.random() * RANDOM_ICONS.length)]);
}

function insertImageFiles(editor: Editor, files?: FileList | null): boolean {
  const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return false;
  (async () => {
    for (const f of images) {
      const src = await saveImage(f);
      editor.chain().focus().setImage({ src }).run();
    }
  })();
  return true;
}

export function createEditor(opts: {
  element: HTMLElement;
  content: string;
  onUpdate: (markdown: string) => void;
  onOpenNote: (title: string) => void;
  titles: () => string[];
  suggestionUI: SuggestionUI;
  cursor?: number;
}) {
  const editor: Editor = new Editor({
    element: opts.element,
    autofocus: false, // Editor.svelte decides (the sidebar may own focus, e.g. after deleting from the list)
    content: opts.content,
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      // images pasted or dropped in are stored as files (blob: URLs would die on restart)
      handlePaste: (view, event): boolean => {
        if (insertImageFiles(editor, event.clipboardData?.files)) return true;
        // a URL pasted over selected text links that text instead of replacing it (a bare URL on its own
        // line still becomes a bookmark card — that is the empty-selection case, further down the chain)
        const text = event.clipboardData?.getData('text/plain').trim() ?? '';
        if (URL_RE.test(text) && !view.state.selection.empty) return editor.chain().focus().setLink({ href: text }).run();
        return false;
      },
      handleDrop: (_view, event): boolean => insertImageFiles(editor, event.dataTransfer?.files),
    },
    onCreate: ({ editor }) => {
      if (opts.cursor !== undefined) editor.commands.setTextSelection(Math.min(opts.cursor, editor.state.doc.content.size));
    },
    extensions: [
      StarterKit.configure({
        orderedList: false, // replaced below: a new "1. " right after a numbered list continues it
        listItem: false, // replaced below: an image may be an item's first block
        heading: { levels: [1, 2, 3, 4, 5] },
        link: { openOnClick: false, autolink: true },
        codeBlock: false, // replaced below: syntax highlighting + a language chip
      }),
      // An image pasted onto an empty list item takes that line. Stock list items are `paragraph block*`, so
      // the image could only go *after* the item's paragraph and the empty line stayed above it.
      CodeBlock,
      ListItem.extend({ content: LIST_ITEM_CONTENT }),
      // Notion-style numbering: typing "1. " (any number) directly after a numbered list joins it and
      // continues the count. Stock TipTap only joins when the typed number is the next one.
      OrderedList.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^(\d+)\.\s$/, type: this.type, getAttributes: (m) => ({ start: +m[1] }), joinPredicate: (_m, node) => !node.attrs.type || node.attrs.type === '1' })];
        },
      }),
      // Two numbered lists that end up touching (a blank line between them deleted, a paragraph
      // between them turned into an item, …) become one list, so the count carries on instead of restarting at 1.
      Extension.create({
        name: 'joinOrderedLists',
        addProseMirrorPlugins() {
          const ol = this.editor.schema.nodes.orderedList;
          return [new Plugin({
            appendTransaction(trs, _old, state) {
              if (!trs.some((t) => t.docChanged)) return null;
              const at: number[] = [];
              const scan = (node: PMNode, start: number) => {
                let prev: PMNode | null = null;
                node.forEach((child, offset) => {
                  if (prev?.type === ol && child.type === ol && prev.attrs.type === child.attrs.type) at.push(start + offset);
                  prev = child;
                  scan(child, start + offset + 1);
                });
              };
              scan(state.doc, 0);
              if (!at.length) return null;
              const tr = state.tr;
              for (const p of at.reverse()) if (canJoin(tr.doc, p)) tr.join(p); // back to front: earlier positions stay valid
              return tr;
            },
          })];
        },
      }),
      TaskList,
      // markdown quirks around lists: tightness for task lists (tiptap-markdown only does bullet/ordered),
      // empty checkboxes, and an image that is a list item's whole content
      Extension.create({
        name: 'listMarkdown',
        addStorage: () => ({
          markdown: {
            // An empty task item serializes to "- [ ] "; markdown-it drops that trailing space, and
            // markdown-it-task-lists only recognises "[ ] " *followed by* content, so a note with an empty
            // checkbox came back as a bullet with the literal text "[ ]". Put the space back first.
            parse: {
              setup(md: any) {
                md.core.ruler.before('inline', 'eve-empty-task-item', (state: any) => {
                  const t = state.tokens;
                  for (let i = 2; i < t.length; i++) {
                    if (t[i].type === 'inline' && t[i - 2].type === 'list_item_open' && /^\[[ xX]\]$/.test(t[i].content)) t[i].content += ' ';
                  }
                });
              },
              // markdown-it wraps a loose list item's content in a <p>; ProseMirror then splits that paragraph
              // around the block image, leaving the item with an empty first line above the picture. Unwrap an
              // item that is nothing but an image (the checkbox moves up: the task-item hook reads it there).
              updateDOM(element: HTMLElement) {
                for (const p of element.querySelectorAll('li > p')) {
                  const kids = [...p.children];
                  const img = kids.find((c) => c.tagName === 'IMG');
                  if (!img || p.textContent!.trim() || kids.some((c) => c !== img && c.tagName !== 'INPUT')) continue;
                  const box = kids.find((c) => c.tagName === 'INPUT');
                  if (box) p.before(box);
                  p.replaceWith(img);
                }
              },
            },
          },
        }),
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
      TaskItem.extend({ content: LIST_ITEM_CONTENT }).configure({ nested: true }),
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
      Extension.create({
        name: 'arrows',
        addInputRules: () => [
          textInputRule({ find: /->$/, replace: '→' }),
          textInputRule({ find: /=>$/, replace: '⇒' }),
        ],
      }),
      LocalImage.configure({ inline: false, allowBase64: true }),
      Bookmark,
      Kanban,
      Extension.create({
        name: 'slashMenu',
        addProseMirrorPlugins() {
          return [
            Suggestion({
              editor: this.editor,
              char: '/',
              pluginKey: new PluginKey('slashMenu'),
              allowSpaces: false,
              // default prefixes (line start / after a space): a '/' already inside text like KRW/USD must not open the menu
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
  suggestionVisible = () => opts.suggestionUI.visible();
  applyKeymap(editor);
  if (import.meta.env.DEV) (window as any).__eve = editor;
  return editor;
}
