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
import { DateMention, dayChoices } from './date';
import { Callout } from './callout';
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
import { calendar, popup, ICONS, SLASH, type CalendarUI, type SuggestionUI, type SuggestItem } from './slash';
import { noteMenu, linkMenu, linkLeft } from './noteMenu';

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
        contextmenu: (_view, event) => { event.preventDefault(); noteMenu(editor, event as MouseEvent); return true; },
        // the pointer resting on a link brings up what can be done with it; leaving it puts that away
        mouseover: (_view, event) => {
          const a = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
          if (a && !a.closest('.bookmark')) { ui.keepMenu(); linkMenu(editor, a); }
          return false;
        },
        mouseout: (_view, event) => {
          if ((event.target as HTMLElement | null)?.closest?.('a[href]')) { linkLeft(); ui.closeMenuSoon(); }
          return false;
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
  suggestionVisible = () => opts.suggestionUI.visible() || opts.calendarUI.visible();
  applyKeymap(editor);
  if (import.meta.env.DEV) (window as any).__eve = editor;
  return editor;
}
