import { Editor, Extension, textInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { Plugin, PluginKey, Selection, type Command } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { WikiLink } from './wikilink';
import { Callout } from './callout';
import { LocalImage } from './image';
import { Bookmark, URL_RE } from './bookmark';
import { Kanban, insertKanban } from './kanban';
import { CodeBlock } from './code';
import { Pdf } from './pdf';
import { Video } from './video';
import { TableNodes } from './table';
import { Find } from './find';
import { Divider } from './divider';
import { ui, type MenuItem } from './ui.svelte';
import { notes, titleOf, type Note } from './notes.svelte';
import { headingsOf, splitLink } from './markdown';
import { isCustom } from './icons';
import { pickImage, pickVideo, openUrl, clipboardText } from './platform';
import { fileMarkdown, isAsset } from './drop';
import { exportCurrent } from './transfer';
import Suggestion from '@tiptap/suggestion';
import { shortcuts } from './shortcuts.svelte';

/** markdown that would otherwise land as literal characters ("**bold**", "# heading", "- item", …) */
const MD_SYNTAX = /(\*\*|__|~~|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|`|\[[^\]]*\]\(|^\|.*\|\s*$)/m;
/** clipboard HTML that carries formatting of its own, so it is more than a plain-text flavour */
const RICH_HTML = /<(strong|b|em|i|u|s|a|h[1-6]|ul|ol|li|code|pre|blockquote|img|table|hr)\b/i;

/** list items hold text or an image first, then any block (stock TipTap insists on a paragraph) */
const LIST_ITEM_CONTENT = '(paragraph|image) block*';

/**
 * A blank line the user pressed Enter for. Markdown has no empty paragraph — the blank lines around a
 * block are just separators — so an empty one used to vanish the next time the note was read back.
 * It travels as a line holding a single non-breaking space, and the parse hook empties it again.
 */
const BLANK = '\u00a0';
const BlankLine = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: PMNode) {
          if (node.content.size) state.renderInline(node);
          else state.write(BLANK);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const p of element.querySelectorAll('p')) if (p.textContent === BLANK) p.replaceChildren();
          },
        },
      },
    };
  },
});

const KEYMAP = new PluginKey('eve-keymap');
const APP_GUARD = new PluginKey('eve-app-guard');
let suggestionVisible: () => boolean = () => false;

export const getMarkdown = (editor: Editor): string => (editor.storage as any).markdown.getMarkdown();

/**
 * Move whatever the selection covers one step up or down among its siblings — a line, a list item, a
 * picture, or a whole dragged-over range. Nothing to swap with at this level (the only paragraph in a
 * list item, say) means the block one level out moves instead, so ⌥↓ walks an item down the list.
 *
 * The neighbour is the one that actually moves: cutting it and putting it back on the other side
 * leaves the selection where the writer put it, carried along by the transaction's own mapping.
 */
function moveBlock(dir: -1 | 1) {
  return ({ state, dispatch }: { state: any; dispatch?: (tr: any) => void }): boolean => {
    const { $from, $to } = state.selection;
    let range = $from.blockRange($to);
    while (range) {
      const { parent, startIndex, endIndex, start, end } = range;
      const i = dir < 0 ? startIndex - 1 : endIndex;
      if (i >= 0 && i < parent.childCount) {
        if (dispatch) {
          const node = parent.child(i);
          const tr = state.tr;
          if (dir < 0) {
            tr.delete(start - node.nodeSize, start);
            tr.insert(tr.mapping.map(end), node);
          } else {
            tr.delete(end, end + node.nodeSize);
            tr.insert(start, node);
          }
          dispatch(tr.scrollIntoView());
        }
        return true;
      }
      // first / last item of a list: the item itself steps over whatever sits beside the list, instead
      // of dragging the whole list along
      if (/List$/.test(parent.type.name)) return hopOutOfList({ state, dispatch }, range, dir);
      if (range.depth < 1) return false;
      range = state.doc.resolve(start - 1).blockRange(state.doc.resolve(end + 1)); // one level out
    }
    return false;
  };
}

/** Carry the item out of its list and past the block on the other side, still an item of its own list. */
function hopOutOfList(
  { state, dispatch }: { state: any; dispatch?: (tr: any) => void },
  range: any,
  dir: -1 | 1,
): boolean {
  const { parent, start, end, depth } = range;
  const $start = state.doc.resolve(start);
  const listStart = $start.before(depth), listEnd = $start.after(depth);
  const beside = dir < 0 ? state.doc.resolve(listStart).nodeBefore : state.doc.resolve(listEnd).nodeAfter;
  if (!beside) return false; // the list is already at the edge: there is nothing to step over
  const alone = parent.childCount === 1; // the last item leaves no empty list behind
  const cut = alone ? { from: listStart, to: listEnd } : { from: start, to: end };
  // measured from the list's own edges: the item has to clear the whole neighbour, not just the list
  const target = dir < 0 ? listStart - beside.nodeSize : listEnd + beside.nodeSize;
  if (dispatch) {
    const moved = alone ? state.doc.slice(listStart, listEnd).content : parent.copy(state.doc.slice(start, end).content);
    const caretIn = state.selection.from - (alone ? listStart : start - 1); // where the caret sat inside it
    const tr = state.tr.delete(cut.from, cut.to);
    const at = tr.mapping.map(target);
    tr.insert(at, moved);
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(at + caretIn, tr.doc.content.size))));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

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
    moveBlockUp: () => editor.commands.command(moveBlock(-1)),
    moveBlockDown: () => editor.commands.command(moveBlock(1)),
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
  // App-scope combos (e.g. ⌘B rebound to "focus sidebar", Esc to hide the window) must not be eaten
  // by the editor's built-in keymaps; mark the event and stop editor handling so the window listener
  // runs it. A card page still closes on Esc instead: it stops the event before it reaches the window.
  const guard = new Plugin({
    key: APP_GUARD,
    props: {
      handleKeyDown: (_view, e) => {
        if (suggestionVisible()) return false;
        const a = shortcuts.match(e, ['app']);
        if (!a) return false;
        (e as any).eveApp = true;
        return true;
      },
    },
  });
  editor.registerPlugin(guard, (p, all) => [p, ...all]);
  // ⌥↩ opens the note's own menu, the one the right button opens (the sidebar answers to it too)
  bindings['Alt-Enter'] = () => (noteMenu(editor, null), true);
  const plugin = new Plugin({ key: KEYMAP, props: { handleKeyDown: keydownHandler(bindings) } });
  editor.registerPlugin(plugin, (p, all) => [p, ...all]);
}

export interface SuggestItem { label: string; value?: string; hint?: string; icon?: string; noteIcon?: string; run?: (editor: Editor) => void }
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

/** 16x16 line icons for the menu, drawn in the sidebar's stroke style. */
const ICONS = {
  page: '<path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5"/><path d="M6.2 10h3.6M8 8.2v3.6"/>',
  note: '<path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5"/><path d="M5.9 8.6h4.2M5.9 11h4.2"/>',
  callout: '<circle cx="8" cy="6.6" r="4"/><path d="M6.3 11.6h3.4M6.9 13.6h2.2"/>',
  kanban: '<rect x="2.5" y="3.5" width="3.2" height="9" rx="1"/><rect x="6.4" y="3.5" width="3.2" height="6" rx="1"/><rect x="10.3" y="3.5" width="3.2" height="7.6" rx="1"/>',
  image: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><circle cx="6" cy="6.8" r="1"/><path d="M3.2 11.8 6.4 8.7l2.3 2.1 2.1-2 2.5 2.8"/>',
  video: '<rect x="1.5" y="3.5" width="9" height="9" rx="1.5"/><path d="M10.5 7.4l4-2.2v5.6l-4-2.2z"/>',
  wikiLink: '<path d="M6.4 3.5H4.3v9h2.1M11.7 3.5H9.6v9h2.1"/>',
  table: '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M2.5 6.6h11M6.5 6.6v5.9M10 6.6v5.9"/>',
  section: '<path d="M6.4 2.9 4.8 13.1M11.2 2.9 9.6 13.1M3.3 6.1h9.4M2.8 9.9h9.4"/>',
  emoji: '<circle cx="8" cy="8" r="6"/><path d="M5.8 9.4c.6.9 1.3 1.4 2.2 1.4s1.6-.5 2.2-1.4"/><path d="M6.3 6.4h.01M9.7 6.4h.01"/>',
};

/** The "/" block menu, Notion-style. ``` and --- still make a code block / divider as you type. */
const SLASH: SuggestItem[] = [
  { label: 'New page', hint: '📄 하위 페이지', icon: ICONS.page, run: newPage },
  { label: 'Callout', hint: '💡 highlighted box', icon: ICONS.callout, run: (e) => e.chain().focus().toggleWrap('callout').run() },
  { label: 'Kanban', hint: '칸반 board', icon: ICONS.kanban, run: insertKanban },
  { label: 'Table', hint: '3×3, with a header row', icon: ICONS.table, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: 'Image', hint: 'Pick a file', icon: ICONS.image, run: (e) => { pickImage().then((src) => src && e.chain().focus().setImage({ src }).run()); } },
  { label: 'Video', hint: 'Pick a file', icon: ICONS.video, run: (e) => { pickVideo().then((src) => src && e.chain().focus().insertContent({ type: 'video', attrs: { src, name: src.split('/').pop() } }).run()); } },
  { label: 'Link to note', hint: '[[ another note', icon: ICONS.wikiLink, run: (e) => e.chain().focus().insertContent('[[').run() },
  {
    label: 'Emoji', hint: '😀 pick one', icon: ICONS.emoji,
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
  notes.create(`# ${title}\n\n`, parent?.group ?? '', parent?.id);
}

/**
 * Attachments pasted or dropped into a note: a picture or a PDF, stored next to the notes (a blob: URL
 * would die on restart). `at` is the drop point, so a file lands where it was let go, not at the caret.
 * A markdown/text file is not an attachment — App opens it as a note of its own.
 */
function insertFiles(editor: Editor, files?: FileList | null, at?: number): boolean {
  const take = [...(files ?? [])].filter(isAsset);
  if (!take.length) return false;
  (async () => {
    let pos = at;
    for (const f of take) {
      const md = await fileMarkdown(f);
      if (md === null) continue;
      const content = (editor.storage as any).markdown.parser.parse(md);
      const chain = editor.chain().focus();
      (pos === undefined ? chain.insertContent(content) : chain.insertContentAt(pos, content)).run();
      if (pos !== undefined) pos = editor.state.selection.to; // the next file follows this one
    }
  })();
  return true;
}

/**
 * Where a dropped file belongs: between blocks, on the side of the line the pointer is nearer to.
 * The raw coordinate would land mid-word and split the heading it was dropped on.
 */
function dropBlock(view: EditorView, event: DragEvent): number | undefined {
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!at) return undefined;
  const $pos = view.state.doc.resolve(at.pos);
  if ($pos.depth < 1) return at.pos;
  const before = $pos.before(1);
  const box = (view.nodeDOM(before) as HTMLElement | null)?.getBoundingClientRect?.();
  return box && event.clientY < box.top + box.height / 2 ? before : $pos.after(1);
}

/**
 * Open the page at one of its headings (a `[[Title#Section]]` link was followed): the caret lands on the
 * heading and it comes to the top of the view. A heading since renamed away simply opens the page.
 */
export function goToSection(editor: Editor, section: string) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (node.type.name === 'heading' && node.textContent.trim() === section) at = pos;
    return at < 0;
  });
  if (at < 0) return void editor.commands.focus('start');
  editor.chain().focus(at + 1).run();
  (editor.view.nodeDOM(at) as HTMLElement | null)?.scrollIntoView({ block: 'start' });
}

/**
 * Right-click inside a note. The webview's own menu is Look Up / Translate / Speech / AutoFill — a wall
 * of things a note cannot use — so the app draws this one instead: the clipboard, the marks that have
 * keyboard shortcuts nobody remembers, and nothing else.
 */
function noteMenu(editor: Editor, event: MouseEvent | null) {
  if (event) {
    // a right-click outside the selection moves the caret there first, the way every editor behaves
    const at = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    const sel = editor.state.selection;
    if (at && (at.pos < sel.from || at.pos > sel.to)) editor.commands.setTextSelection(at.pos);
  }
  const empty = editor.state.selection.empty;
  const linked = editor.isActive('link');
  /** execCommand is the one path that keeps ProseMirror's own clipboard serializer (markdown, nodes) */
  const clip = (cmd: 'cut' | 'copy') => () => { editor.commands.focus(); document.execCommand(cmd); };
  const keys = (id: string) => shortcuts.keysFor(id);
  // nothing greyed out: an item that cannot run is not on the list at all
  const items: MenuItem[] = [
    { label: 'Cut', keys: 'Mod-x', hide: empty, run: clip('cut') },
    { label: 'Copy', keys: 'Mod-c', hide: empty, run: clip('copy') },
    { label: 'Paste', keys: 'Mod-v', run: () => void clipboardText().then((t) => t && editor.view.pasteText(t)) },
    { label: 'Bold', sep: true, keys: keys('bold'), hide: empty, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', keys: keys('italic'), hide: empty, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Code', keys: keys('code'), hide: empty, run: () => editor.chain().focus().toggleCode().run() },
    linked
      ? { label: 'Remove link', run: () => editor.chain().focus().unsetLink().run() }
      : { label: 'Link…', keys: keys('link'), hide: empty, run: () => void linkSelection(editor) },
    { label: 'Select all', sep: true, keys: 'Mod-a', run: () => editor.chain().focus().selectAll().run() },
    { label: 'Export as Markdown…', sep: true, keys: keys('exportMd'), run: () => void exportCurrent('md') },
    { label: 'Export as PDF…', keys: keys('exportPdf'), run: () => void exportCurrent('pdf') },
    { label: 'Export as image…', keys: keys('exportPng'), run: () => void exportCurrent('png') },
  ];
  // from the keyboard (⌥↩) there is no pointer: the menu opens under the caret instead
  const caret = editor.view.coordsAtPos(editor.state.selection.head);
  ui.openMenu(event ?? { clientX: Math.round(caret.left), clientY: Math.round(caret.bottom) }, items);
}

/** Ask for a URL and hang it on the selection (⌘K has no home in this editor). */
async function linkSelection(editor: Editor) {
  const href = (await ui.prompt('링크 주소', ''))?.trim();
  if (!href) return editor.commands.focus();
  editor.chain().focus().setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run();
}

export function createEditor(opts: {
  element: HTMLElement;
  content: string;
  onUpdate: (markdown: string) => void;
  onOpenNote: (title: string) => void;
  /** the notes a `[[link]]` may point at: their titles, and the sections inside them */
  targets: () => Note[];
  suggestionUI: SuggestionUI;
  cursor?: number;
}) {
  const iconOf = (link: string) => {
    const title = splitLink(link)[0].toLowerCase(); // a section link keeps the page's icon
    return notes.visible.find((n) => titleOf(n).toLowerCase() === title)?.icon ?? '';
  };
  const editor: Editor = new Editor({
    element: opts.element,
    autofocus: false, // Editor.svelte decides (the sidebar may own focus, e.g. after deleting from the list)
    content: opts.content,
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      // images pasted or dropped in are stored as files (blob: URLs would die on restart)
      handlePaste: (view, event): boolean => {
        if (insertFiles(editor, event.clipboardData?.files)) return true;
        // a URL pasted over selected text links that text instead of replacing it (a bare URL on its own
        // line still becomes a bookmark card — that is the empty-selection case, further down the chain)
        const raw = event.clipboardData?.getData('text/plain') ?? '';
        const text = raw.trim();
        if (URL_RE.test(text) && !view.state.selection.empty) return editor.chain().focus().setLink({ href: text }).run();
        // markdown copied from a chat or a terminal comes as plain text that happens to carry HTML of the
        // same characters; render it instead of pasting the ** and # in literally. Real formatting wins.
        const html = event.clipboardData?.getData('text/html') ?? '';
        if (text && MD_SYNTAX.test(text) && !RICH_HTML.test(html) && !editor.isActive('codeBlock')) {
          const parsed = (editor.storage as any).markdown.parser.parse(raw);
          return editor.chain().focus().insertContent(parsed).run();
        }
        return false;
      },
      // links open in the browser: the editor's own webview must not navigate away from the app
      handleDOMEvents: {
        contextmenu: (_view, event) => { event.preventDefault(); noteMenu(editor, event as MouseEvent); return true; },
        click: (_view, event) => {
          const a = (event.target as HTMLElement | null)?.closest?.('a[href]');
          if (!a || a.closest('.bookmark')) return false; // the bookmark card opens itself
          event.preventDefault();
          void openUrl(a.getAttribute('href') ?? '');
          return true;
        },
      },
      // a file dragged in from Finder lands at the drop point. Even one we have no use for is swallowed:
      // the webview's own drop pastes DOM straight into the editor, which then takes no keystroke at all.
      handleDrop: (view, event): boolean => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        insertFiles(editor, files, dropBlock(view, event));
        return true;
      },
    },
    onCreate: ({ editor }) => {
      if (opts.cursor !== undefined) editor.commands.setTextSelection(Math.min(opts.cursor, editor.state.doc.content.size));
    },
    extensions: [
      StarterKit.configure({
        paragraph: false, // replaced below: an empty paragraph survives the markdown round trip
        orderedList: false, // replaced below: a new "1. " right after a numbered list continues it
        listItem: false, // replaced below: an image may be an item's first block
        heading: { levels: [1, 2, 3, 4, 5] },
        link: { openOnClick: false, autolink: true },
        codeBlock: false, // replaced below: syntax highlighting + a language chip
        horizontalRule: false, // replaced below: no divider inside a list, and the caret can reach it
      }),
      // An image pasted onto an empty list item takes that line. Stock list items are `paragraph block*`, so
      // the image could only go *after* the item's paragraph and the empty line stayed above it.
      BlankLine,
      CodeBlock,
      Pdf,
      Video,
      ...TableNodes,
      Divider,
      Find,
      ListItem.extend({ content: LIST_ITEM_CONTENT }),
      // Notion-style numbering: typing "1. " (any number) directly after a numbered list joins it and
      // continues the count. Stock TipTap only joins when the typed number is the next one.
      OrderedList.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^(\d+)\.\s$/, type: this.type, getAttributes: (m) => ({ start: +m[1] }), joinPredicate: (_m, node) => !node.attrs.type || node.attrs.type === '1' })];
        },
      }),
      // Two lists that end up touching (a blank line between them deleted, a paragraph between them
      // turned into an item, an item moved out with ⌥↓, …) become one list — markdown has no way to
      // keep them apart anyway, and a numbered count carries on instead of restarting at 1.
      Extension.create({
        name: 'joinLists',
        addProseMirrorPlugins() {
          return [new Plugin({
            appendTransaction(trs, _old, state) {
              if (!trs.some((t) => t.docChanged)) return null;
              const at: number[] = [];
              const scan = (node: PMNode, start: number) => {
                let prev: PMNode | null = null;
                node.forEach((child, offset) => {
                  const same = prev?.type === child.type && /List$/.test(child.type.name);
                  if (same && prev!.attrs.type === child.attrs.type) at.push(start + offset);
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
        iconOf,
        suggestion: {
          char: '[[',
          allowSpaces: true,
          startOfLine: false,
          allowedPrefixes: null, // `[[` means a link wherever it is typed, not only after a space
          pluginKey: new PluginKey('wikiLinkSuggest'),
          items: ({ query }) => {
            const q = query.toLowerCase();
            const pages: SuggestItem[] = [];
            const sections: SuggestItem[] = [];
            // the page being edited: no link to itself, but its own sections are fair game (a note that
            // points at its own headings is how a contents list is written)
            const self = editor.state.doc.firstChild?.textContent.trim();
            for (const n of opts.targets()) {
              const title = titleOf(n);
              if (title !== self && title.toLowerCase().includes(q)) pages.push(n.icon ? { label: title, noteIcon: n.icon } : { label: title, icon: ICONS.note });
              // a link can aim at a section of another page too; it stores `Title#Section` and shows the
              // heading with its page beside it, so two notes with a "TODO" heading stay apart
              for (const h of headingsOf(n.body)) {
                const value = `${title}#${h}`;
                if (value.toLowerCase().includes(q)) sections.push({ label: h, value, hint: title, icon: ICONS.section });
              }
            }
            const items = [...pages, ...sections].slice(0, 8); // pages first: the sections fill what is left
            // a title nothing answers to yet: picking it links a page that gets created on the first visit
            if (query && !query.includes('#') && !pages.some((p) => p.label.toLowerCase() === q)) {
              items.push({ label: query, hint: 'new page', icon: ICONS.page });
            }
            return items;
          },
          command: ({ editor, range, props }) =>
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: 'wikiLink', attrs: { title: (props as SuggestItem).value ?? (props as SuggestItem).label } }, { type: 'text', text: ' ' }])
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
