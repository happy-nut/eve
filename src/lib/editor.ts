import { Editor, Extension, InputRule, textInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ListItem, OrderedList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Command } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { WikiLink } from './wikilink';
import { DateMention, dayChoices } from './date';
import { Callout } from './callout';
import { Highlight } from './highlight';
import { Toggle } from './toggle';
import Blockquote from '@tiptap/extension-blockquote';
import { LocalImage } from './image';
import { Bookmark, URL_RE } from './bookmark';
import { Kanban } from './kanban';
import { CodeBlock } from './code';
import { Pdf } from './pdf';
import { Video } from './video';
import { TableNodes } from './table';
import { Find } from './find';
import { Divider } from './divider';
import { ui } from './ui.svelte';
import { notes, titleOf, type Note } from './notes.svelte';
import { headingsOf, splitLink } from './markdown';
import { pickImage, openUrl, isMobile } from './platform';
import { hints } from './hints.svelte';
import { fileMarkdown, isAsset } from './drop';
import Suggestion from '@tiptap/suggestion';
import { shortcuts } from './shortcuts.svelte';
import { calendar, emojiRow, popup, ICONS, SLASH, type CalendarUI, type EmojiUI, type SuggestionUI, type SuggestItem } from './slash';
import { loadEmoji, newestEmoji, searchEmoji, type EmojiEntry } from './emoji';
import { noteMenu } from './noteMenu';
import { moveBlock, indentLines, switchItem } from './blocks';

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
// per editor: the note and an open card page each have their own popups, and one shared variable
// would leave the note asking the closed card's popups — then Esc hides the window, not the calendar
const suggestionVisible = new WeakMap<Editor, () => boolean>();

export const getMarkdown = (editor: Editor): string => (editor.storage as any).markdown.getMarkdown();

/**
 * What ⌥↑ / ⌥↓ just moved is lit faintly for a moment, so the eye can tell which lines went where: every
 * line in the selection, or for a caret in an item's first line the whole item with what hangs under it.
 * The two classes are taken in turn so a second move right away starts the fade over.
 */
const FLASH = new PluginKey<DecorationSet>('moveFlash');
let flashes = 0;
let flashTimer: ReturnType<typeof setTimeout> | undefined;
/** per editor: ⌥↑ / ⌥↓ that move the note itself rather than a line (the note's own editor says when) */
const noteMove = new WeakMap<Editor, (dir: -1 | 1, onTitle: boolean) => boolean>();

function moveAndFlash(editor: Editor, dir: -1 | 1): boolean {
  // the title line never moves inside its note: there (or right after the note was opened from the list)
  // the keys move the note itself, the way they move a row in the list
  const { $from, empty } = editor.state.selection;
  const onTitle = empty && $from.depth === 1 && $from.index(0) === 0 && $from.parent.type.name === 'heading';
  if (noteMove.get(editor)?.(dir, onTitle)) return true;
  const before = editor.state.doc;
  if (!editor.commands.command(moveBlock(dir))) return false;
  const { state, view } = editor;
  if (state.doc.eq(before)) return true;
  let { from, to } = state.selection;
  const $sel = state.selection.$from;
  for (let d = $sel.depth; d > 0; d--) {
    if (!/Item$/.test($sel.node(d).type.name)) continue;
    if (state.selection.empty && $sel.index(d) === 0) { from = $sel.before(d); to = $sel.after(d); }
    break;
  }
  const cls = `moved-flash-${flashes++ % 2}`;
  const decos: Decoration[] = [];
  state.doc.nodesBetween(from, to, (n, pos) => {
    if (!n.isTextblock && !(n.isBlock && n.isAtom)) return true;
    decos.push(Decoration.node(pos, pos + n.nodeSize, { class: cls }));
    return false;
  });
  view.dispatch(state.tr.setMeta(FLASH, DecorationSet.create(state.doc, decos)));
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(FLASH, DecorationSet.empty)); }, 900);
  return true;
}

/** Run one editor action by id (the phone's formatting bar uses these; a keyboard uses applyKeymap). */
export const runEditorCommand = (editor: Editor, id: string): boolean => editorCommands(editor)[id]?.() ?? false;

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
    moveBlockUp: () => moveAndFlash(editor, -1),
    moveBlockDown: () => moveAndFlash(editor, 1),
    bold: () => c().toggleBold().run(),
    italic: () => c().toggleItalic().run(),
    underline: () => c().toggleUnderline().run(),
    strike: () => c().toggleStrike().run(),
    highlight: () => c().toggleMark('highlight').run(),
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
    selectAll: () => c().selectAll().run(),
    indent: () => c().command(indentLines(1)).run(),
    outdent: () => c().command(indentLines(-1)).run(),
  };
}

/**
 * ⇧↓ / ⇧↑ from a line into a picture (a video, a PDF card, a bookmark…): the browser extends a selection
 * line by line and has no line inside a block without text, so the selection stopped just before it.
 * On the last (first) line of a block, the head goes past every such block in the way to the next text,
 * or to the note's edge, and the pictures are in the selection like the lines around them.
 */
function shiftPastBlocks(view: EditorView, e: KeyboardEvent): boolean {
  if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return false;
  const dir = e.key === 'ArrowDown' ? 1 : -1;
  const { state } = view;
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || !sel.$head.parent.isTextblock) return false;
  if (!view.endOfTextblock(dir > 0 ? 'down' : 'up')) return false;
  let $edge = state.doc.resolve(dir > 0 ? sel.$head.after() : sel.$head.before());
  const next = (at: typeof $edge) => (dir > 0 ? at.nodeAfter : at.nodeBefore);
  if (!next($edge)?.isAtom || !next($edge)!.isBlock) return false;
  while (next($edge)?.isAtom && next($edge)!.isBlock) $edge = state.doc.resolve($edge.pos + dir * next($edge)!.nodeSize);
  const beyond = Selection.findFrom($edge, dir, true);
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, sel.anchor, beyond ? beyond.head : $edge.pos)).scrollIntoView());
  return true;
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
        if (suggestionVisible.get(editor)?.()) return false;
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

let lastCut = { text: '', at: 0 };

export function createEditor(opts: {
  element: HTMLElement;
  content: string;
  onUpdate: (markdown: string) => void;
  onOpenNote: (title: string) => void;
  /** the notes a `[[link]]` may point at: their titles, and the sections inside them */
  targets: () => Note[];
  suggestionUI: SuggestionUI;
  calendarUI: CalendarUI;
  emojiUI: EmojiUI;
  cursor?: number;
  /** ⌥↑ / ⌥↓ that should move the note itself, not a line: true when it did (`onTitle`: the caret is on the title) */
  onNoteMove?: (dir: -1 | 1, onTitle: boolean) => boolean;
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
      // a phone's formatting bar (MobileBar, ~50px) sits over the bottom of the page: the caret is kept
      // clear of it, and scrolled to a little early, instead of typing (or deleting) out of sight
      ...(isMobile ? { scrollMargin: { top: 16, bottom: 90, left: 0, right: 0 }, scrollThreshold: { top: 16, bottom: 90, left: 0, right: 0 } } : {}),
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
        // cut, then paste the same text elsewhere: moving lines around, which ⌥↑↓ does in place
        cut: (view) => {
          const { from, to } = view.state.selection;
          lastCut = { text: view.state.doc.textBetween(from, to, '\n').trim(), at: Date.now() };
          return false;
        },
        paste: (_view, event) => {
          const text = (event as ClipboardEvent).clipboardData?.getData('text/plain').trim();
          if (text && lastCut.text && text === lastCut.text && Date.now() - lastCut.at < 120_000) {
            hints.show('moveBlock', 'Move lines without cut and paste', [shortcuts.keysFor('moveBlockUp'), shortcuts.keysFor('moveBlockDown')]);
          }
          return false;
        },
        // a phone's long press is the system's: select a word, drag the handles (the note bar's ⋯ has the rest)
        contextmenu: (_view, event) => {
          if (isMobile) return false;
          event.preventDefault(); noteMenu(editor, event as MouseEvent); return true;
        },
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
        blockquote: false, // replaced below: "> " makes a toggle, as in Notion, so a quote is "| "
      }),
      Blockquote.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*\|\s$/, type: this.type })];
        },
      }),
      ...Toggle,
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
      // "- ", "[] " or "1. " typed at the start of a list line of another kind turns that line into it (the stock
      // rules only wrap a plain line, so on a to-do "- " stayed text)
      Extension.create({
        name: 'listSwitch',
        priority: 102,
        addInputRules() {
          const n = this.editor.schema.nodes;
          const rule = (find: RegExp, list: string, item: string, attrs?: (m: RegExpMatchArray) => Record<string, unknown>) =>
            new InputRule({ find, handler: ({ state, range, match }) => (switchItem(state.tr, range.from, range.to, n[list], n[item], attrs?.(match)) ? undefined : null) });
          return [
            rule(/^\s*[-+*]\s$/, 'bulletList', 'listItem'),
            rule(/^\s*\[( |x)?\]\s$/, 'taskList', 'taskItem'),
            rule(/^(\d+)\.\s$/, 'orderedList', 'listItem', (m) => ({ start: +m[1] })),
          ];
        },
      }),
      // A selection running over a picture, a link card, a PDF or a video: the browser paints its blue only on
      // text, so those blocks stayed blank and the selection looked broken into pieces. Each one the selection
      // covers whole is marked, the same whether it came from the mouse or from ⇧ and the arrows.
      Extension.create({
        name: 'blocksInSelection',
        addProseMirrorPlugins: () => [new Plugin({
          props: {
            decorations: (state) => {
              const sel = state.selection;
              if (sel.empty || sel instanceof NodeSelection) return null;
              const marks: Decoration[] = [];
              state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
                if (!(node.isBlock && node.isAtom)) return true;
                if (pos >= sel.from && pos + node.nodeSize <= sel.to) marks.push(Decoration.node(pos, pos + node.nodeSize, { class: 'in-sel' }));
                return false;
              });
              return marks.length ? DecorationSet.create(state.doc, marks) : null;
            },
          },
        })],
      }),
      Extension.create({
        name: 'moveFlash',
        addProseMirrorPlugins: () => [new Plugin({
          key: FLASH,
          state: {
            init: () => DecorationSet.empty,
            apply: (tr, set) => tr.getMeta(FLASH) ?? set.map(tr.mapping, tr.doc),
          },
          props: { decorations: (state) => FLASH.getState(state) },
        })],
      }),
      // ahead of the list items' own Tab, which moves an item's sub-items along with it
      Extension.create({
        name: 'lineIndent',
        priority: 101,
        addKeyboardShortcuts() {
          const run = (dir: 1 | -1) => () => !suggestionVisible.get(this.editor)?.() && this.editor.commands.command(indentLines(dir));
          return {
            Tab: run(1),
            'Shift-Tab': run(-1),
            // Enter on an empty item under an item of another kind (a bullet under a to-do): it steps out as
            // ⇧Tab does, still a bullet. The stock lift made it an unmarked line inside the to-do, where the
            // caret could not be seen in WebKit
            Enter: () => {
              const { $from, empty } = this.editor.state.selection;
              if (!empty || $from.parent.content.size || $from.depth < 4 || $from.index(-1) !== 0) return false;
              const item = $from.node(-1), owner = $from.node(-3);
              if (!/Item$/.test(item.type.name) || !/Item$/.test(owner.type.name) || owner.type === item.type) return false;
              return !suggestionVisible.get(this.editor)?.() && this.editor.commands.command(indentLines(-1));
            },
          };
        },
      }),
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
                // Markdown writes a to-do and a bullet with the same "-", so one written after the other is a single
                // list, which tiptap-markdown makes a to-do list whole: the bullets in it did not fit and came back
                // as an empty to-do above them. Each run of to-dos or of plain items becomes a list of its own.
                for (const ul of [...element.querySelectorAll<HTMLElement>('ul.contains-task-list')].reverse()) {
                  const items = [...ul.children];
                  if (items.every((li) => li.classList.contains('task-list-item'))) continue;
                  const runs: HTMLElement[] = [];
                  let task: boolean | null = null;
                  for (const li of items) {
                    const isTask = li.classList.contains('task-list-item');
                    if (isTask !== task) {
                      const run = document.createElement('ul');
                      if (isTask) { run.className = 'contains-task-list'; run.dataset.type = 'taskList'; }
                      runs.push(run);
                      task = isTask;
                    }
                    runs.at(-1)!.append(li);
                  }
                  ul.replaceWith(...runs);
                }
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
      // a phone's bar does the formatting; the markdown hint is for a keyboard
      Placeholder.configure({ placeholder: isMobile ? 'Start writing…' : 'Start typing… `#` heading, `-` list, `[[` link' }),
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
              // a link can aim at a section of another page too; it stores `Title#Section` and shows the
              // heading with its page beside it, so two notes with a "TODO" heading stay apart
              const inside = headingsOf(n.body).map((h) => ({ label: h, value: `${title}#${h}`, hint: title, icon: ICONS.section }));
              // the same sections twice over, reached two ways: typed after a `#`, or by opening the
              // page in the list with → when the headings are not what you remember
              if (title !== self && title.toLowerCase().includes(q)) {
                pages.push({ label: title, sections: inside, ...(n.icon ? { noteIcon: n.icon } : { icon: ICONS.note }) });
              }
              for (const h of inside) if (h.value.toLowerCase().includes(q)) sections.push(h);
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
      // @ — a day, stored as the day and shown as it reads now. The trigger keeps the default
      // prefixes (line start or after a space), which is what keeps an address out of it.
      DateMention.configure({
        suggestion: {
          char: '@',
          allowSpaces: false,
          pluginKey: new PluginKey('dateMention'),
          // the days a query could mean; the calendar opens on the first and closes when there is none
          items: ({ query }) => dayChoices(query),
          command: ({ editor, range, props }) =>
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: 'dateMention', attrs: { date: (props as { value: string }).value } }, { type: 'text', text: ' ' }])
              .run(),
          render: () => calendar(opts.calendarUI),
        },
      }),
      Callout,
      Highlight,
      Extension.create({
        name: 'arrows',
        addInputRules: () => [
          textInputRule({ find: /->$/, replace: '→' }),
          textInputRule({ find: /<-$/, replace: '←' }),
          textInputRule({ find: /=>$/, replace: '⇒' }),
          textInputRule({ find: /<=$/, replace: '⇐' }),
        ],
      }),
      LocalImage.configure({ inline: false, allowBase64: true }),
      Extension.create({
        name: 'shiftPastBlocks',
        addProseMirrorPlugins: () => [new Plugin({ key: new PluginKey('shiftPastBlocks'), props: { handleKeyDown: shiftPastBlocks } })],
      }),
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
      // Slack's `:smile`: a colon (at a line's start or after a space) and a letter bring up the best
      // few emoji in a row; the pick replaces what was typed. Not in code, where `:x` is just text.
      Extension.create({
        name: 'emojiSuggest',
        addProseMirrorPlugins() {
          return [
            Suggestion({
              editor: this.editor,
              char: ':',
              pluginKey: new PluginKey('emojiSuggest'),
              allowSpaces: false,
              allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
              items: async ({ query }) => searchEmoji(await loadEmoji().catch(() => []), query, 5, newestEmoji()),
              command: ({ editor, range, props }) => {
                editor.chain().focus().insertContentAt(range, (props as EmojiEntry).emoji).run();
              },
              render: () => emojiRow(opts.emojiUI),
            }),
          ];
        },
      }),
    ],
    onUpdate: ({ editor }) => opts.onUpdate(getMarkdown(editor)),
  });
  suggestionVisible.set(editor, () => opts.suggestionUI.visible() || opts.calendarUI.visible() || opts.emojiUI.visible());
  if (opts.onNoteMove) noteMove.set(editor, opts.onNoteMove);
  applyKeymap(editor);
  if (isMobile) {
    // a tap on a line near the bottom puts the caret there, then the keyboard comes up and the page
    // shrinks under it (MainActivity): nothing scrolls on its own, and the caret ends up behind the
    // keyboard or the formatting bar. When the page shrinks with the caret in this note, bring the caret
    // back into view — scrollMargin keeps it clear of the bar.
    let tall = window.innerHeight;
    const onResize = () => {
      const shrank = window.innerHeight < tall;
      tall = window.innerHeight;
      if (shrank && editor.view.hasFocus()) requestAnimationFrame(() => editor.isDestroyed || editor.commands.scrollIntoView());
    };
    window.addEventListener('resize', onResize);
    editor.on('destroy', () => window.removeEventListener('resize', onResize));
  }
  if (import.meta.env.DEV) (window as any).__eve = editor;
  return editor;
}
