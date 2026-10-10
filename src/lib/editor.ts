import { Editor, Extension, InputRule, textblockTypeInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Code from '@tiptap/extension-code';
import Heading from '@tiptap/extension-heading';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Command, type EditorState } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { WikiLink } from './wikilink';
import { DateMention, dayChoices } from './date';
import { Callout } from './callout';
import { Highlight } from './highlight';
import { Html } from './html';
import { Toggle } from './toggle';
import Blockquote from '@tiptap/extension-blockquote';
import { ImageView, LocalImage } from './image';
import { Bookmark, URL_RE, openLinkHere } from './bookmark';
import { Kanban } from './kanban';
import { CodeBlock } from './code';
import { Pdf } from './pdf';
import { Video } from './video';
import { TableNodes } from './table';
import { Find } from './find';
import { SelectionLayer } from './selectionLayer';
import { ClickTarget } from './clickTarget';
import { Divider } from './divider';
import { MathBlock, MathInline, Text, insertMath } from './math';
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
import { moveBlock, indentLines, switchItem, switchLines } from './blocks';
import { holdEdit, dropEdit } from './pending';

/** markdown that would otherwise land as literal characters ("**bold**", "# heading", "- item", …) */
const MD_SYNTAX = /(\$[^\s$]|\*\*|__|~~|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|`|\[[^\]]*\]\(|^\|.*\|\s*$)/m;
/** clipboard HTML that carries formatting of its own, so it is more than a plain-text flavour */
const RICH_HTML = /<(strong|b|em|i|u|s|a|h[1-6]|ul|ol|li|code|pre|blockquote|img|table|hr)\b/i;

/** list items hold text or an image first, then any block (stock TipTap insists on a paragraph) */
const LIST_ITEM_CONTENT = '(paragraph|image) block*';

/** blocks markdown may put on an item's own line (`- ```js`, `- # heading`, `- > quote`, `- | table |`, `- - item`) */
const LEADS = 'pre, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol, div[data-math-block], div[data-kanban], div[data-eve-raw]';

/**
 * A list item that starts with a block other than a line of text. The item's first line is text (blocks.ts, the
 * list commands and the keys all work from it), so such an item is read with an empty line first, and `lead` says
 * the block was on the item's own line: it is written back there, not after an empty line (which was the item's
 * text, the block coming out of the list after it). An item made in the editor never has it.
 */
const ListItemLead = ListItem.extend({
  content: LIST_ITEM_CONTENT,
  addAttributes() {
    return { ...this.parent?.(), lead: { default: false, parseHTML: (el: HTMLElement) => el.hasAttribute('data-lead'), rendered: false } };
  },
  addStorage: () => ({
    markdown: {
      serialize(state: any, node: PMNode, parent: PMNode) {
        const first = node.firstChild, text = first?.firstChild;
        if (node.attrs.lead && first?.type.name === 'paragraph' && !first.content.size && node.childCount > 1) {
          node.forEach((child, _o, i) => { if (i) state.render(child, node, i); });
          return;
        }
        // a numbered to-do (`1. [ ] task`), which the note has no checkbox for, is read as that text: its brackets
        // are written as they were, not escaped, so another app still finds its to-do there
        if (parent?.type.name === 'orderedList' && first?.type.name === 'paragraph' && text?.isText && !text.marks.length && /^\[[ xX]\] \S/.test(text.text!)) {
          state.write(text.text!.slice(0, 4));
          state.render(first.cut(4), node, 0);
          node.forEach((child, _o, i) => { if (i) state.render(child, node, i); });
          return;
        }
        state.renderContent(node);
      },
      parse: {
        setup(md: any) {
          // `1. [ ] task`: a to-do in a numbered list, which a to-do list cannot be. Read as a to-do, it was taken out
          // of the list, an empty item left in its place; its brackets are kept as text instead.
          md.core.ruler.before('inline', 'eve-numbered-todo', (state: any) => {
            const lists: string[] = [];
            for (const [i, t] of (state.tokens as any[]).entries()) {
              if (/_list_open$/.test(t.type)) lists.push(t.type);
              else if (/_list_close$/.test(t.type)) lists.pop();
              else if (t.type === 'inline' && lists.at(-1) === 'ordered_list_open' && state.tokens[i - 2]?.type === 'list_item_open'
                && /^\[[ xX]\]([ \u00a0]|$)/.test(t.content)) t.content = `\\[${t.content[1]}\\]${t.content.slice(3)}`;
            }
          });
        },
        updateDOM(root: HTMLElement) {
          const leads = [...root.querySelectorAll('li:not(.task-list-item)')].filter((li) => {
            const first = [...li.childNodes].find((n) => n.nodeType !== 3 || n.textContent!.trim());
            return first instanceof HTMLElement && first.matches(LEADS);
          });
          if (!leads.length) return;
          // a list is tight when it has no <p> (tiptap-markdown): the empty line put in is not one of the note's
          for (const list of root.querySelectorAll('ul, ol')) if (!list.hasAttribute('data-tight') && !list.querySelector('p')) list.setAttribute('data-tight', 'true');
          for (const li of leads) {
            li.prepend(document.createElement('p'));
            li.setAttribute('data-lead', '');
          }
        },
      },
    },
  }),
});

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
        serialize(state: any, node: PMNode, parent?: PMNode, index?: number) {
          // empty lines at the very end of the note are not written: the one StarterKit's TrailingNode keeps after a
          // note ending in a block (a code block, a table) is the editor's, not the note's — written down, merely
          // opening such a note changed it ("edited just now", synced), and the next opening added it again — and
          // any other left at the end shows nothing, but came back as a blank line under the note's last line
          // (a copy renders a bare Fragment: no parent node there, and nothing to leave out)
          const atEnd = (p: PMNode, i: number) => { for (let k = i; k < p.childCount; k++) if (p.child(k).type.name !== 'paragraph' || p.child(k).content.size) return false; return true; };
          if (parent?.type?.name === 'doc' && index !== undefined && index > 0 && !node.content.size && atEnd(parent, index)) return;
          if (node.content.size) {
            // a line starting "1) " is a numbered list to markdown as much as "1. " is, which prosemirror-markdown
            // escapes and this did not: "1) Buy milk" came back a list
            const esc = state.esc;
            state.esc = (str: string, start?: boolean) => {
              const s: string = esc.call(state, str, start);
              return start ? s.replace(/^(\s*\d+)\)(\s|$)/, '$1\\)$2') : s;
            };
            try { state.renderInline(node); } finally { state.esc = esc; }
          } else state.write(BLANK);
          state.closeBlock(node);
        },
        parse: {
          setup(md: any) {
            // a line break inside a paragraph is a space between words, but tiptap-markdown drops the newline at the
            // start of the text after any bold, code, link, [[link]] or date: "**Alice**\nand Bob" came back as
            // "**Alice**and Bob", the words run together. A space ahead of it keeps them apart.
            md.renderer.rules.softbreak = () => ' \n';
          },
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
/** a note this long (in ProseMirror positions, about characters) waits for a pause before it becomes markdown */
const LONG = 10_000;

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

/**
 * ⌘↩ on a to-do, Notion's way: its box ticked or cleared. Over several lines, every to-do among them: all
 * ticked if any was open, all cleared if every one was done. Elsewhere the key is not ours.
 */
function toggleCheck({ tr, state }: { tr: any; state: any }): boolean {
  const { from, to } = state.selection;
  const items: number[] = [];
  state.doc.nodesBetween(from, to, (n: PMNode, pos: number) => {
    if (!n.isTextblock) return true;
    const $p = state.doc.resolve(pos);
    if ($p.parent.type.name === 'taskItem' && $p.index() === 0) items.push($p.before());
    return false;
  });
  if (!items.length) return false;
  const check = items.some((pos) => !state.doc.nodeAt(pos).attrs.checked);
  for (const pos of items) tr.setNodeAttribute(pos, 'checked', check);
  return true;
}

/**
 * An arrow typed as text ("->" becomes →). Not inside `code` still being typed: its mark only comes with the
 * closing backtick, by when "=>" in it had already turned. (Code that is already code is left alone anyway.)
 */
const arrow = (find: RegExp, replace: string) => new InputRule({
  find,
  handler: ({ state, range }) => {
    const $from = state.doc.resolve(range.from);
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
    if ((before.match(/`/g)?.length ?? 0) % 2) return null;
    state.tr.insertText(replace, range.from, range.to);
  },
});

/** Run one editor action by id (the phone's formatting bar uses these; a keyboard uses applyKeymap). */
export const runEditorCommand = (editor: Editor, id: string): boolean => editorCommands(editor)[id]?.() ?? false;

/** Editor-scoped actions, by id. Rebindable at runtime (see applyKeymap). */
function editorCommands(editor: Editor): Record<string, () => boolean> {
  const c = () => editor.chain().focus();
  return {
    // the / menu opens where a word can start: right after a word (the phone's Insert block, the caret at the
    // end of a line) a bare "/" opened nothing and stayed in the text, so a space goes first
    slash: () => {
      const { $from } = editor.state.selection;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, '\ufffc');
      return c().insertContent(before && !/\s/.test(before) ? ' /' : '/').run();
    },
    callout: () => c().toggleWrap('callout').run(),
    math: () => (insertMath(editor, false), true),
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
    // on list lines of another kind, only those lines change kind, where they are (a bullet under a number stays
    // under it); otherwise the stock toggle (a line becomes a list, a list's lines plain again)
    bulletList: () => editor.commands.command(switchLines('bulletList', 'listItem')) || c().toggleBulletList().run(),
    orderedList: () => editor.commands.command(switchLines('orderedList', 'listItem')) || c().toggleOrderedList().run(),
    taskList: () => editor.commands.command(switchLines('taskList', 'taskItem')) || c().toggleTaskList().run(),
    // ⌘↩: the link or card under the caret opens; on a to-do, its box is ticked or cleared
    toggleCheck: () => openLinkHere(editor) || editor.commands.command(toggleCheck),
    blockquote: () => c().toggleBlockquote().run(),
    codeBlock: () => c().toggleCodeBlock().run(),
    divider: () => c().setHorizontalRule().run(),
    selectAll: () => c().selectAll().run(),
    undo: () => c().undo().run(),
    redo: () => c().redo().run(),
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
    if (a.scope !== 'editor' || !a.keys || !cmds[a.id]) continue;
    // ProseMirror knows the minus key as "-" ("Minus" is the list's own name for it), and with Shift held the
    // key reads "_": that is found by the key's code (Mod-Shift--), or as "_" without its Shift (Mod-_)
    const keys = a.keys.replace(/Minus$/, '-');
    bindings[keys] = () => cmds[a.id]();
    if (keys !== a.keys && keys.includes('Shift-')) bindings[keys.replace('Shift-', '').replace(/-$/, '_')] = bindings[keys];
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
 *
 * It goes next to the innermost line that can have a picture beside it: a file let go on the second item of
 * a list, in a table's cell or on a line in a callout went above or below the whole list, table or callout.
 */
export function dropBlock(view: EditorView, event: DragEvent): number | undefined {
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!at) return undefined;
  const $pos = view.state.doc.resolve(at.pos);
  if ($pos.depth < 1) return at.pos;
  const block = view.state.schema.nodes.image; // every attachment is a block, as a picture is
  for (let d = $pos.depth; d >= 1; d--) {
    const parent = $pos.node(d - 1), i = $pos.index(d - 1);
    const fitsAbove = parent.canReplaceWith(i, i, block), fitsBelow = parent.canReplaceWith(i + 1, i + 1, block);
    if (!fitsAbove && !fitsBelow) continue;
    const before = $pos.before(d);
    const box = (view.nodeDOM(before) as HTMLElement | null)?.getBoundingClientRect?.();
    const above = !!box && event.clientY < box.top + box.height / 2;
    // a list item's first line has nothing above it inside the item, so the file goes under that line
    return (above && fitsAbove) || !fitsBelow ? before : $pos.after(d);
  }
  return at.pos;
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

/**
 * Where a trigger that may open a menu was just written (typed, or put in by the phone's Insert block), followed
 * through later edits; null once the caret goes back before it, leaves its line, or it is deleted. One pasted, or
 * already in the text, is never it. `endsAtSpace`: the / menu is a single word, so a space ends it, and so does any
 * move of the caret; the [[ picker takes spaces, and only a click elsewhere (or leaving the line) ends it, so ← and
 * → can still fix a typo in the title being typed.
 */
function typedTrigger(key: PluginKey<number | null>, char: string, endsAtSpace: boolean, closer?: string) {
  return new Plugin<number | null>({
    key,
    state: {
      init: () => null,
      apply(tr, at, _old, state) {
        if (at !== null) {
          const r = tr.mapping.mapResult(at, 1);
          at = r.deleted ? null : r.pos;
        }
        const { empty, $head } = state.selection;
        // undo and redo put back a trigger that was already there: not one just typed
        if (tr.docChanged && empty && !tr.getMeta('paste') && tr.getMeta('uiEvent') !== 'paste' && tr.getMeta('uiEvent') !== 'drop' && !tr.getMeta('history$')
          && $head.parent.isTextblock && $head.parentOffset >= char.length
          && $head.parent.textBetween($head.parentOffset - char.length, $head.parentOffset) === char
          && tr.steps.some((st) => { const c = (st as { slice?: { content: Fragment; size: number } }).slice; return !!c?.size && c.content.textBetween(0, c.content.size).endsWith(char.at(-1)!); })) {
          return $head.pos - char.length;
        }
        if (at !== null && (state.selection.head <= at || state.doc.resolve(at).parent !== $head.parent)) return null;
        // done with once the menu has closed: a space typed after it, or the caret moved away (by a click, an arrow),
        // so coming back to it later (a click, a ⌫) does not open it again
        if (at !== null && endsAtSpace && /\s/.test(state.doc.textBetween(at + 1, Math.max(at + 1, $head.pos)))) return null;
        // and once it is closed by hand ("[[Bob]]" typed out): the picker stayed on for the rest of the line, kept @ dates
        // and :emoji from coming up, and Enter there turned what followed into a link
        if (at !== null && closer && state.doc.textBetween(at + char.length, Math.max(at + char.length, $head.pos)).includes(closer)) return null;
        if (at !== null && !tr.docChanged && tr.selectionSet && (endsAtSpace || tr.getMeta('pointer'))) return null;
        return at;
      },
    },
  });
}
const SLASH_AT = new PluginKey<number | null>('slashAt');
const slashTyped = typedTrigger(SLASH_AT, '/', true);
// an earlier "[[" left open in a paragraph ("np.array([[1, 2", "if [[ -n $x ]]") opened the picker whenever the caret
// came back after it, and Enter there turned the rest of the line into a link
const WIKI_AT = new PluginKey<number | null>('wikiAt');
const wikiTyped = typedTrigger(WIKI_AT, '[[', false, ']]');

/**
 * Bold, italic, strike and highlight at the start of a line in a quote or a callout lost the line's "> ": tiptap-markdown
 * notes where such a mark starts before the blank line and the "> " ahead of it are written, then moves the "**" it
 * finds there past spaces, over the ">". The paragraph merged into the one above or fell out of the callout, and a
 * "~~" could become a code fence that swallowed the rest of the note. The mark's start is taken again once they are out.
 */
function markStartsAfterPrefix(editor: Editor) {
  const serializer = (editor.storage as any).markdown.serializer;
  const marksOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(serializer), 'marks')?.get;
  if (!marksOf) return;
  Object.defineProperty(serializer, 'marks', {
    configurable: true,
    get() {
      const marks = marksOf.call(serializer);
      for (const [name, info] of Object.entries<any>(marks)) {
        if (!info?.expelEnclosingWhitespace) continue;
        const open = info.open;
        marks[name] = {
          ...info,
          open(state: any, mark: any, parent: any, index: number) {
            state.write(); // the blank line and the "> " before this line, which writing the mark would put out anyway
            const delim = typeof open === 'function' ? open(state, mark, parent, index) : open;
            const top = state.inlines?.at(-1);
            if (top && top.end === undefined) Object.assign(top, { start: state.out.length, delimiter: delim });
            return delim;
          },
        };
      }
      return marks;
    },
  });
}

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
  // the menus at the caret, so one can stay shut while another is open: in "[[Meeting :sm" both the link picker and
  // the emoji row came up, one over the other, and Enter picked from whichever answered first
  const WIKI_MENU = new PluginKey('wikiLinkSuggest'), DATE_MENU = new PluginKey('dateMention'), SLASH_MENU = new PluginKey('slashMenu');
  // the state being made has a menu's say only once that menu's plugin has run on it, and tiptap runs them in no
  // order to count on; until then, the say it had before this keystroke
  const menuOpen = (ed: Editor, state: EditorState, ...menus: PluginKey[]) =>
    menus.some((k) => (k.getState(state) ?? k.getState(ed.state))?.active);
  const iconOf = (link: string) => {
    const find = (t: string) => notes.byTitle(t);
    return find(splitLink(link, (t) => !!find(t))[0])?.icon ?? ''; // a section link keeps the page's icon
  };
  // A long note's markdown is a few milliseconds per key (54 KB: 6.6 ms of a 7.9 ms keystroke), so it is made
  // once the typing pauses; a short one, at once. Anything that reads the note first runs flushEdits() (pending.ts).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; dropEdit(flush); };
  const flush = () => { if (timer === undefined) return; cancel(); opts.onUpdate(getMarkdown(editor)); };
  let closing = false; // the editor is going: an edit made now (a caption saved on the way out) is handed over at once
  function handOver(ed: Editor) {
    if (closing || ed.state.doc.content.size < LONG) { cancel(); opts.onUpdate(getMarkdown(ed)); return; }
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
    holdEdit(flush);
  }
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
      // a copy is markdown (tiptap-markdown's serializer, transformCopiedText below); words inside one line come
      // as just those words, their bold or links kept, not wrapped in the line's list item or heading
      clipboardTextSerializer: (slice, view) => {
        const { $from, $to } = view.state.selection;
        const serializer = (editor.storage as any).markdown.serializer;
        const inLine = $from.sameParent($to) && $from.parent.isTextblock;
        if (inLine && $from.parent.type.spec.code) return slice.content.textBetween(0, slice.content.size, '\n');
        let content = inLine ? Fragment.from(view.state.schema.nodes.paragraph.create(null, $from.parent.content.cut($from.parentOffset, $to.parentOffset))) : slice.content;
        // a callout copied from below its title line: its first copied line is not its title
        if (!inLine) for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name !== 'callout' || !$from.node(d).attrs.titled || $from.index(d) === 0) continue;
          const untitle = (frag: Fragment): Fragment => {
            const first = frag.firstChild;
            if (!first) return frag;
            const node = first.type.name === 'callout' ? first.type.create({ ...first.attrs, titled: false }, first.content, first.marks) : first.copy(untitle(first.content));
            return frag.replaceChild(0, node);
          };
          content = untitle(content);
          break;
        }
        return (serializer.serialize(content) as string).replace(new RegExp(`^${BLANK}$`, 'gm'), ''); // an empty line is just empty
      },
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
          // a line pasted into a line keeps the spaces at its ends (read as markdown, " $x$ ok" lost its first)
          const lead = raw.includes('\n') ? '' : /^[ \t]+/.exec(raw)?.[0] ?? '', trail = raw.includes('\n') ? '' : /[ \t]+$/.exec(raw)?.[0] ?? '';
          const c = editor.chain().focus();
          if (lead) c.insertContent({ type: 'text', text: lead });
          c.insertContent(parsed);
          // the space after it is plain, and so is what is typed next: inserted as text, it took the last mark of
          // what was pasted (" `y` " then "z" gave "`y z`")
          if (trail) c.command(({ tr }) => {
            tr.insert(tr.selection.from, editor.schema.text(trail)).setStoredMarks([]);
            return true;
          });
          return c.run();
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
        heading: false, // replaced below: a line break in a heading
        link: { openOnClick: false, autolink: true },
        codeBlock: false, // replaced below: syntax highlighting + a language chip
        horizontalRule: false, // replaced below: no divider inside a list, and the caret can reach it
        blockquote: false, // replaced below: "> " makes a toggle, as in Notion, so a quote is "| "
        text: false, // replaced below: text that would read back as a formula keeps its dollars escaped
        code: false, // replaced below: code in a link
        bulletList: false, // replaced below: "-" then Enter is a line of its own
      }),
      Text,
      // code inside a link ([run `npm i` first](u)) stays in it: stock code shuts out every other mark, so the link
      // was cut in two around it. Formatting still goes (nothing in code is bold).
      Code.extend({ excludes: 'bold italic strike underline highlight' }),
      // TipTap runs the markdown rules on Enter too, as if a newline had been typed: "-", "1.", "#" or ">" alone on
      // a line and then Enter made a list, heading or toggle instead of a new line. The rules here and below take
      // a typed space only (any whitespace but a newline).
      BulletList.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*([-+*])[^\S\n]$/, type: this.type })];
        },
      }),
      // a heading is one line in markdown: a line break in it goes out as `<br>` (as in a table cell), not as the
      // usual backslash and newline, which read back as a heading ending in "\" and a paragraph under it
      Heading.configure({ levels: [1, 2, 3, 4, 5] }).extend({
        addInputRules() {
          return this.options.levels.map((level: number) => textblockTypeInputRule({ find: new RegExp(`^(#{1,${level}})[^\\S\\n]$`), type: this.type, getAttributes: { level } }));
        },
        addStorage() {
          return {
            markdown: {
              serialize(state: any, node: PMNode) {
                state.write(`${state.repeat('#', node.attrs.level)} `);
                const inTable = state.inTable;
                state.inTable = true;
                state.renderInline(node, false);
                state.inTable = inTable;
                state.closeBlock(node);
              },
            },
          };
        },
      }),
      MathInline,
      MathBlock,
      Blockquote.extend({
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*\|[^\S\n]$/, type: this.type })];
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
      ListItemLead,
      // Notion-style numbering: typing "1. " (any number) directly after a numbered list joins it and
      // continues the count. Stock TipTap only joins when the typed number is the next one.
      OrderedList.extend({
        // written as tiptap-markdown does (")" for every other of two numbered lists in a row, so they stay two), but a
        // list inside an item from 1: markdown reads one numbered from 5 right under the item's line as more of that
        // line (a note from elsewhere may hold one, separated by a blank line, which a tight list does not keep)
        addStorage: () => ({
          markdown: {
            serialize(state: any, node: PMNode, parent: PMNode, index: number) {
              const nested = /Item$/.test((parent as any)?.type?.name ?? '');
              const start = nested ? 1 : node.attrs.start || 1;
              const width = String(start + node.childCount - 1).length;
              let run = 0;
              while (index - run > 0 && parent.child(index - run - 1).type.name === node.type.name) run++;
              const sep = run % 2 ? ') ' : '. ';
              state.renderList(node, state.repeat(' ', width + 2), (i: number) => {
                const n = String(start + i);
                return state.repeat(' ', width - n.length) + n + sep;
              });
            },
            parse: {},
          },
        }),
        addInputRules() {
          return [wrappingInputRule({ find: /^(\d+)\.[^\S\n]$/, type: this.type, getAttributes: (m) => ({ start: +m[1] }), joinPredicate: (_m, node) => !node.attrs.type || node.attrs.type === '1' })];
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
          const rule = (find: RegExp, list: string, item: string, attrs?: (m: RegExpMatchArray) => Record<string, unknown>, itemAttrs?: (m: RegExpMatchArray) => Record<string, unknown>) =>
            new InputRule({ find, handler: ({ state, range, match }) => (switchItem(state.tr, range.from, range.to, n[list], n[item], attrs?.(match), itemAttrs?.(match)) ? undefined : null) });
          return [
            rule(/^\s*[-+*][^\S\n]$/, 'bulletList', 'listItem'),
            // "[x] " makes a to-do already done, as it does on a plain line
            rule(/^\s*\[( |x)?\][^\S\n]$/, 'taskList', 'taskItem', undefined, (m) => ({ checked: m[1] === 'x' })),
            rule(/^(\d+)\.[^\S\n]$/, 'orderedList', 'listItem', (m) => ({ start: +m[1] })),
          ];
        },
      }),
      // The selection is drawn by SelectionLayer (rectangles over the text, nothing inside it); what the layer
      // cannot show is marked here with a class only: a picture, card, PDF or video the selection covers whole
      // (the colour laid over it), a [[link]] or date in it, an empty line it runs through.
      SelectionLayer,
      ClickTarget,
      Extension.create({
        name: 'paintSelection',
        addProseMirrorPlugins: () => [new Plugin({
          props: {
            decorations: (state) => {
              const sel = state.selection;
              if (sel.empty || sel instanceof NodeSelection) return null;
              const { from, to } = sel;
              const marks: Decoration[] = [];
              state.doc.nodesBetween(from, to, (node, pos) => {
                if (node.isText) return false;
                const whole = pos >= from && pos + node.nodeSize <= to;
                if (node.isAtom) {
                  // a [[link]] or a date in the line takes the text's colour; a block (picture, card…) the overlay
                  if (whole) marks.push(Decoration.node(pos, pos + node.nodeSize, { class: node.isBlock ? 'in-sel' : 'pm-sel' }));
                  return false;
                }
                // an empty line the selection runs through (not the one it merely starts or ends on)
                if (node.isTextblock && !node.content.size && pos > from && pos + node.nodeSize < to) {
                  marks.push(Decoration.node(pos, pos + node.nodeSize, { class: 'pm-sel-empty' }));
                }
                return true;
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
      // ⌫ at the start of the line under a picture (a PDF, a video, a link card, a formula block), or Delete at the
      // end of the line over it: the first press selects it, the second removes it. In one keystroke the picture
      // was gone, easy to miss when all that was meant was to join two lines.
      Extension.create({
        name: 'selectMediaFirst',
        priority: 1000,
        addKeyboardShortcuts() {
          const MEDIA = /^(image|pdf|video|bookmark|mathBlock)$/;
          const select = (dir: -1 | 1) => () => {
            const { state, view } = this.editor;
            const { $from, empty } = state.selection;
            const line = $from.parent;
            if (!empty || !line.isTextblock || !line.content.size) return false; // an empty line goes as it always did
            if ($from.parentOffset !== (dir < 0 ? 0 : line.content.size) || $from.depth < 1) return false;
            const i = $from.index(-1) + dir, holder = $from.node(-1);
            const next = i >= 0 && i < holder.childCount ? holder.child(i) : null;
            if (!next || !MEDIA.test(next.type.name)) return false;
            const at = dir < 0 ? $from.before() - next.nodeSize : $from.after();
            view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
            return true;
          };
          return { Backspace: select(-1), Delete: select(1) };
        },
      }),
      // ahead of the list items' own Tab, which moves an item's sub-items along with it
      Extension.create({
        name: 'lineIndent',
        priority: 101,
        addKeyboardShortcuts() {
          const run = (dir: 1 | -1) => () => !suggestionVisible.get(this.editor)?.() && this.editor.commands.command(indentLines(dir));
          // ⌫ / Enter step out as ⇧Tab does — but where the line cannot move, the key's own meaning still applies
          // (⇧Tab keeps the key even then; these would otherwise do nothing at all)
          const stepOut = () => {
            const doc = this.editor.state.doc;
            return run(-1)() && this.editor.state.doc !== doc;
          };
          return {
            Tab: run(1),
            'Shift-Tab': run(-1),
            // ⌫ at the very start of a nested item: it steps out a level as ⇧Tab does, still its own kind (a bullet
            // under a number stays a bullet). The stock join made it an item of its parent's list, of that list's kind.
            // A top-level item is left to the stock ⌫ (the line becomes plain text).
            Backspace: () => {
              const { $from, empty } = this.editor.state.selection;
              if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 4 || $from.index(-1) !== 0) return false;
              if (!/Item$/.test($from.node(-1).type.name) || !/Item$/.test($from.node(-3).type.name)) return false;
              return stepOut();
            },
            // Enter on an empty item under an item of another kind (a bullet under a to-do): it steps out as
            // ⇧Tab does, still a bullet. The stock lift made it an unmarked line inside the to-do, where the
            // caret could not be seen in WebKit. A number under a bullet is one too (both are list items, but the
            // stock lift made it a bullet, where ⇧Tab and ⌫ keep it a number)
            Enter: () => {
              const { $from, empty } = this.editor.state.selection;
              if (!empty || $from.parent.content.size || $from.depth < 4 || $from.index(-1) !== 0) return false;
              const item = $from.node(-1), owner = $from.node(-3);
              if (!/Item$/.test(item.type.name) || !/Item$/.test(owner.type.name)) return false;
              if (owner.type === item.type && $from.node(-2).type === $from.node(-4).type) return false;
              return stepOut();
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
              // A numbered list inside an item counts from 1. Markdown lets only a list starting at 1 begin right under a
              // line of text, so one numbered from 5 under its item's line ("5. " typed there, a list split in two) was
              // read back as more of that line: the list gone, "a 5. x" in its place.
              const restart: number[] = [], loose: number[] = [];
              state.doc.descendants((node, pos, parent) => {
                if (node.type.name === 'orderedList' && (node.attrs.start ?? 1) !== 1 && parent && /Item$/.test(parent.type.name)) restart.push(pos);
                // a list with an item of two paragraphs is loose, as markdown reads it back: written tight, the note
                // came back with blank lines between all its items, changed by being opened and saved
                // and a list around a loose one is loose too, as markdown reads it: the note kept "inner loose, outer
                // tight" only until it was opened again
                if (/List$/.test(node.type.name) && node.attrs.tight) {
                  let two = false;
                  const twoIn = (item: PMNode) => { let n = 0; item.forEach((c) => { if (c.type.name === 'paragraph') n++; }); return n > 1; };
                  node.forEach((item) => { if (twoIn(item)) two = true; });
                  node.descendants((d) => { if (two) return false; if (/List$/.test(d.type.name) && !d.attrs.tight) two = true; if (/Item$/.test(d.type.name) && twoIn(d)) two = true; });
                  if (two) loose.push(pos);
                }
              });
              if (!at.length && !restart.length && !loose.length) return null;
              const tr = state.tr;
              for (const p of restart) tr.setNodeAttribute(p, 'start', 1); // attributes only: no position moves
              for (const p of loose) tr.setNodeAttribute(p, 'tight', false);
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
                // A run of to-dos and a run of bullets one after the other are one list to markdown, and the blank
                // line the two lists are written with makes that one list loose: each run came back loose (spaced
                // out) and was written so, the note changing on the first read. A run with no blank line inside it
                // is tight again; the runs are split apart later (updateDOM).
                md.core.ruler.after('block', 'eve-tight-runs', (state: any) => {
                  const t = state.tokens, lines: string[] = state.src.split('\n');
                  // blank inside a quote or a callout too, where the line is a bare ">"
                  const blank = (n: number) => n >= 0 && n < lines.length && !lines[n].replace(/^\s*(>\s?)*/, '').trim();
                  for (let i = 0; i < t.length; i++) {
                    if (t[i].type !== 'bullet_list_open') continue;
                    const level = t[i].level;
                    const items: { open: number; task: boolean }[] = [];
                    let end = i + 1;
                    for (; end < t.length && !(t[end].type === 'bullet_list_close' && t[end].level === level); end++) {
                      if (t[end].type !== 'list_item_open' || t[end].level !== level + 1) continue;
                      const first = t[end + 2];
                      items.push({ open: end, task: first?.type === 'inline' && /^\[[ xX]\](\s|$)/.test(first.content) });
                    }
                    if (!items.some((x) => x.task) || items.every((x) => x.task)) continue; // one kind: markdown's own say
                    for (let a = 0; a < items.length; ) {
                      let b = a;
                      while (b + 1 < items.length && items[b + 1].task === items[a].task) b++;
                      // tight: no blank line between its items nor inside them (their trailing blank line aside)
                      let tight = true;
                      for (let k = a; k <= b && tight; k++) {
                        const [from, to] = t[items[k].open].map ?? [0, 0];
                        for (let n = from; n < (k < b ? t[items[k + 1].open].map[0] : to) - (k < b ? 0 : 1); n++) if (blank(n)) { tight = false; break; }
                      }
                      const stop = b + 1 < items.length ? items[b + 1].open : end;
                      // never an item of two paragraphs: made tight, they ran together into one line
                      for (let k = a; k <= b && tight; k++) {
                        const to = k < b ? items[k + 1].open : stop;
                        let paras = 0;
                        for (let m = items[k].open; m < to; m++) if (t[m].type === 'paragraph_open' && t[m].level === level + 2) paras++;
                        if (paras > 1) tight = false;
                      }
                      if (tight) {
                        for (let k = items[a].open; k < stop; k++) {
                          if ((t[k].type === 'paragraph_open' || t[k].type === 'paragraph_close') && t[k].level === level + 2) t[k].hidden = true;
                        }
                      }
                      a = b + 1;
                    }
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
      TaskItem.extend({
        content: LIST_ITEM_CONTENT,
        addInputRules() {
          return [wrappingInputRule({ find: /^\s*(\[([( |x])?\])[^\S\n]$/, type: this.type, getAttributes: (m) => ({ checked: m[m.length - 1] === 'x' }) })];
        },
        // the item's own content wrapper only where the editor drew one (its label, then a div: copied HTML), else
        // the item itself (read from markdown) — not the first div anywhere in it: a toggle's or a board's div in
        // a to-do was taken for the whole item, and its text and the rest were gone the next time it was read
        parseHTML() {
          const content = (el: HTMLElement) => (el.querySelector(':scope > label') && el.querySelector<HTMLElement>(':scope > div')) || el;
          return [{ tag: `li[data-type="${this.name}"]`, priority: 51, contentElement: content }];
        },
        // the box and its hidden label are the view's own: tiptap rewrites the label on every update and WebKit
        // touches the box's style after a drag, and ProseMirror read either back as an edit of the item, so a
        // drag selection starting in a to-do collapsed on mouseup. Only the item's own text counts.
        addNodeView() {
          const stock = this.parent?.();
          if (!stock) return null;
          return (props) => {
            const view = stock(props) as any;
            return { ...view, ignoreMutation: (m: { type: string; target: Node }) => m.type !== 'selection' && !view.contentDOM?.contains(m.target) };
          };
        },
      }).configure({ nested: true }),
      // a phone's bar does the formatting; the markdown hint is for a keyboard
      Placeholder.configure({ placeholder: isMobile ? 'Start writing…' : 'Start typing… `#` heading, `-` list, `[[` link' }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true, linkify: true, breaks: false }),
      // ahead of the picker's own plugin, which reads where the "[[" was typed in the same transaction
      Extension.create({ name: 'wikiTyped', priority: 1000, addProseMirrorPlugins: () => [wikiTyped] }),
      WikiLink.configure({
        onOpen: opts.onOpenNote,
        iconOf,
        suggestion: {
          char: '[[',
          allowSpaces: true,
          startOfLine: false,
          allowedPrefixes: null, // `[[` means a link wherever it is typed, not only after a space
          pluginKey: WIKI_MENU,
          // only the "[[" just typed opens it (wikiTyped)
          allow: ({ state, range }) => WIKI_AT.getState(state) === range.from,
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
          pluginKey: DATE_MENU,
          allow: ({ editor, state }) => !menuOpen(editor, state, WIKI_MENU, SLASH_MENU),
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
      ...Html,
      Extension.create({
        name: 'arrows',
        addInputRules: () => [
          // both ways first: "<-" is already ← by the time ">" comes, so they are ← finished with > — and with
          // the ← taken back (⌫), "<-" then ">" must not be read as "<" and "->"
          arrow(/(?:←|<-)>$/, '↔'),
          arrow(/(?:⇐|<=)>$/, '⇔'),
          arrow(/->$/, '→'),
          arrow(/<-$/, '←'),
          arrow(/=>$/, '⇒'),
          arrow(/<=$/, '⇐'),
        ],
      }),
      LocalImage.configure({ inline: false, allowBase64: true }),
      ImageView,
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
            slashTyped,
            Suggestion({
              editor: this.editor,
              char: '/',
              pluginKey: SLASH_MENU,
              allowSpaces: false,
              // default prefixes (line start / after a space): a '/' already inside text like KRW/USD must not open the menu
              // only the "/" just typed opens it: the caret coming back after one already in the sentence ("x / y",
              // by an arrow, a click, a ⌫) opened it, and so did a "/" right after bold text or a link, where it
              // starts its own text node and looked to the plugin like the start of the line
              allow: ({ state, range }) => {
                if (SLASH_AT.getState(state) !== range.from) return false;
                const $at = state.doc.resolve(range.from);
                if ($at.parent.type.spec.code) return false; // in code a / is code (Enter made a new page)
                const before = $at.parent.textBetween(Math.max(0, $at.parentOffset - 1), $at.parentOffset, undefined, '\ufffc');
                return !before || /\s/.test(before);
              },
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
      // Slack's `:smile`: a colon (at a line's start or after a space) and two letters bring up the best
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
              allow: ({ editor, state, range }) => !state.doc.resolve(range.from).parent.type.spec.code && !menuOpen(editor, state, WIKI_MENU, DATE_MENU, SLASH_MENU),
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
    onUpdate: ({ editor }) => handOver(editor),
  });
  markStartsAfterPrefix(editor);
  editor.on('blur', flush); // leaving the note: the list, a dialog, another app
  // the note closed or switched (the document is still there to read)
  editor.on('destroy', () => { closing = true; flush(); });
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
      if (!shrank) return;
      if (editor.view.hasFocus()) { requestAnimationFrame(() => editor.isDestroyed || editor.commands.scrollIntoView()); return; }
      // a text box inside the note (a diagram's box name or row, a formula) with the keyboard: brought into view the
      // same way, or it was typed into blind behind the keyboard
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== editor.view.dom && editor.view.dom.contains(a)) requestAnimationFrame(() => a.scrollIntoView({ block: 'center', inline: 'nearest' }));
    };
    window.addEventListener('resize', onResize);
    editor.on('destroy', () => window.removeEventListener('resize', onResize));
  }
  if (import.meta.env.DEV) (window as any).__eve = editor;
  return editor;
}
