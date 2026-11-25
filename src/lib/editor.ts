import { Editor, Extension, InputRule, markInputRule, textblockTypeInputRule, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Code from '@tiptap/extension-code';
import { typedIn } from './hangul';
import Heading from '@tiptap/extension-heading';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import Placeholder from '@tiptap/extension-placeholder';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import { Markdown } from 'tiptap-markdown';
import { keydownHandler } from '@tiptap/pm/keymap';
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Command, type EditorState, type Transaction } from '@tiptap/pm/state';
import { NOTION_COPY, fromNotion } from './notionPaste';
import { AddMarkStep, RemoveMarkStep, findWrapping, liftTarget } from '@tiptap/pm/transform';
import { DOMParser, Fragment, Mark, Slice, type Node as PMNode, type Schema, type ResolvedPos } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { WikiLink } from './wikilink';
import { DateMention, dayChoices, remindChoices, remindTime, isTime } from './date';
import { askNotify } from './reminder';
import { Callout, CalloutEdges } from './callout';
import { Highlight, highlightMenu } from './highlight';
import { Html } from './html';
import { Toggle, DUPLICATE } from './toggle';
import Blockquote from '@tiptap/extension-blockquote';
import { ImageView, LocalImage } from './image';
import { Bookmark, URL_RE, openLinkHere } from './bookmark';
import { Kanban, deleteBoard } from './kanban';
import { DatabaseBlock } from './databaseNode';
import { FootnoteRef, FootnoteText } from './footnote';
import { CodeBlock } from './code';
import { Pdf } from './pdf';
import { Video } from './video';
import { TableNodes, cellBulletRule, cellEnter, cellUnbullet, dropEmptyTable, clearForPaste, toggleCellBullet, upAboveTable } from './table';
import { Find } from './find';
import { SelectionLayer } from './selectionLayer';
import { BlockHandle } from './blockHandle';
import { TableHandles } from './tableHandles';
import { ClickTarget } from './clickTarget';
import { Divider } from './divider';
import { MathBlock, MathInline, DollarSafeText, insertMath } from './math';
import { ui, under } from './ui.svelte';
import { notes, titleOf, type Note } from './notes.svelte';
import { headingsOf, splitLink } from './markdown';
import { pickImage, openUrl, isMobile } from './platform';
import { hints } from './hints.svelte';
import { fileMarkdown, isAsset } from './drop';
import Suggestion from '@tiptap/suggestion';
import { shortcuts } from './shortcuts.svelte';
import { calendar, emojiRow, popup, suggestionVisible, PICKERS, slashAsked, slashItems, pageItems, newPage, type CalendarUI, type EmojiUI, type SuggestionUI, type SuggestItem } from './slash';
import { leaveToApp } from './keys';
import { loadEmoji, newestEmoji, searchEmoji, type EmojiEntry } from './emoji';
import { noteMenu } from './noteMenu';
import { blockBeside, inCell, moveBlock, indentLines, switchLines, wrapLines, leaveTrailer } from './blocks';
import { holdEdit, dropEdit } from './pending';
import { ImeGate, heldWhileComposing, lineAttributes } from './ime';
import { ICONS } from './lineIcons';
import { LIST_ITEM_CONTENT, NumberedList, ListSwitch, JoinNextItem, LineIndent, JoinLists, ListMarkdown, ToDoItem, bulletsMarkdown } from './lists';
import { appearance } from './appearance.svelte';

const LITERAL_MARKDOWN = /(\$[^\s$]|\*\*|__|~~|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|`|\[[^\]]*\]\(|^\|.*\|\s*$)/m;
/** clipboard HTML that carries formatting of its own, so it is more than a plain-text flavour */
const RICH_HTML = /<(strong|b|em|i|u|s|a|h[1-6]|ul|ol|li|code|pre|blockquote|img|table|hr)\b/i;

/**
 * blocks markdown may put on an item's own line (`- ```js`, `- # heading`, `- > quote`, `- | table |`, `- - item`), and
 * HTML there: a toggle (`- <details>`, which came out of the list), a <video> kept as written
 */
const LEADS = 'pre, h1, h2, h3, h4, h5, h6, blockquote, table, ul, ol, div[data-math-block], div[data-kanban], div[data-eve-raw], details';

function writeNumberedTodo(state: any, item: PMNode, first: PMNode, text: string) {
  state.write(text.slice(0, 4));
  state.render(first.cut(4), item, 0);
  item.forEach((child, _o, i) => { if (i) state.render(child, item, i); });
}

function keepNumberedTodoBrackets(state: any) {
  const lists: string[] = [];
  for (const [i, t] of (state.tokens as any[]).entries()) {
    if (/_list_open$/.test(t.type)) lists.push(t.type);
    else if (/_list_close$/.test(t.type)) lists.pop();
    else if (t.type === 'inline' && lists.at(-1) === 'ordered_list_open' && state.tokens[i - 2]?.type === 'list_item_open'
      && /^\[[ xX]\]([ \u00a0]|$)/.test(t.content)) t.content = `\\[${t.content[1]}\\]${t.content.slice(3)}`;
  }
}

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
        if ((parent as PMNode | undefined)?.type?.name === 'orderedList' && first?.type.name === 'paragraph' && text?.isText && !text.marks.length && /^\[[ xX]\] \S/.test(text.text!)) {
          writeNumberedTodo(state, node, first, text.text!);
          return;
        }
        state.renderContent(node);
      },
      parse: {
        setup(md: any) {
          md.core.ruler.before('inline', 'eve-numbered-todo', keepNumberedTodoBrackets);
        },
        updateDOM(root: HTMLElement) {
          const leads = [...root.querySelectorAll('li:not(.task-list-item)')].filter((li) => {
            // not trim(): the non-breaking space an empty line is written as is the item's text, not blank. Taken for
            // blank, an empty bullet over its sub-item read back as a lead with that space a line of its own
            const first = [...li.childNodes].find((n) => n.nodeType !== 3 || /[^ \t\r\n]/.test(n.textContent!));
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
          if (state.options.copying && index && parent?.child(index - 1).type.name === 'paragraph') state.flushClose(1); // a newline, not a blank line
          if (node.content.size) {
            // a line starting "1) " is a numbered list to markdown as much as "1. " is, which prosemirror-markdown
            // escapes and this did not: "1) Buy milk" came back a list
            const esc = state.esc;
            state.esc = (str: string, start?: boolean) => {
              const s: string = esc.call(state, str, start);
              // and a line of = or - after a line break, which underlines the lines above it into a heading
              return start ? s.replace(/^(\s*\d+)\)(\s|$)/, '$1\\)$2').replace(/^(\s*)(=+\s*)$/, '$1\\$2') : s;
            };
            try { state.renderInline(node); } finally { state.esc = esc; }
          } else if (state.options.copying) {
            // the container's mark alone (`>`, not `> `), and the newline written out: prosemirror-markdown takes a
            // line holding nothing for no line at all
            state.write();
            state.out = `${state.out.replace(/[ \t]+$/, '')}\n`;
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
        },
      },
    };
  },
});

/**
 * Spaces and tabs in text as they were typed: ProseMirror reads HTML the way a browser shows it, every run of them
 * one space and none at a line's start, so "col1⇥col2", "foo  bar" and "  indented" came back changed each time the
 * note opened. Such a run is set in `white-space: pre`, which ProseMirror keeps as it is (with the letter after it:
 * spaces alone opening a list item were dropped before ProseMirror made the item's line). Not one beside a newline:
 * that is how hand-written HTML lays out its lines, not text. A line's leading ones are written as `&#32;` / `&#9;`,
 * which markdown does not trim (the text serializer in math.ts). It runs after every other extension has reshaped
 * the page (a callout's title split off its first line), so it sees the lines as they will be.
 */
function keepSpaces(root: HTMLElement) {
  for (const li of root.querySelectorAll('li[data-checked]')) {
    const first = document.createTreeWalker(li, NodeFilter.SHOW_TEXT).nextNode();
    if (first?.parentElement?.closest('li') === li && first.nodeValue?.startsWith(' ')) first.nodeValue = first.nodeValue.slice(1);
  }
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), found: Text[] = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/[ \t]/.test(n.nodeValue!) && !n.parentElement?.closest('pre, code')) found.push(n as Text);
  for (const t of found) {
    const text = t.nodeValue!, parts: (string | Node)[] = [];
    let last = 0;
    for (const m of text.matchAll(/[ \t]+/g)) {
      const a = m.index!, b = a + m[0].length;
      if (/\s/.test(text[a - 1] ?? '') || /\s/.test(text[b] ?? '')) continue;
      const prev = t.previousSibling;
      const lead = a === 0 && (!prev || prev.nodeName === 'BR' || /\s$/.test(prev.textContent ?? ''));
      if (m[0] === ' ' && !lead && (b < text.length || t.nextSibling)) continue;
      const to = b + (text.codePointAt(b)! > 0xffff ? 2 : b < text.length ? 1 : 0);
      const span = document.createElement('eve-space');
      span.style.whiteSpace = 'pre';
      span.textContent = text.slice(a, to);
      parts.push(text.slice(last, a), span);
      last = to;
    }
    if (parts.length) t.replaceWith(...parts, text.slice(last));
  }
}
function emptyBlankLines(el: HTMLElement) {
  for (const p of el.querySelectorAll('p')) if (p.textContent === BLANK) p.replaceChildren();
}
const LAST_TO_SEE_PAGE = 1;
const KeepSpaces = Extension.create({
  name: 'keepSpaces',
  priority: LAST_TO_SEE_PAGE,
  addStorage: () => ({ markdown: { parse: { updateDOM: (el: HTMLElement) => { emptyBlankLines(el); keepSpaces(el); } } } }),
});

const KEYMAP = new PluginKey('eve-keymap');
const APP_GUARD = new PluginKey('eve-app-guard');

export const getMarkdown = (editor: Editor): string => (editor.storage as any).markdown.getMarkdown();
const DEBOUNCE_FROM_SIZE = 10_000;

const FLASH = new PluginKey<DecorationSet>('moveFlash');
let flashes = 0;
let flashTimer: ReturnType<typeof setTimeout> | undefined;
const noteMove = new WeakMap<Editor, (dir: -1 | 1, onTitle: boolean) => boolean>();

const onTitleLine = ($from: ResolvedPos) => $from.depth === 1 && $from.index(0) === 0 && $from.parent.type.name === 'heading';

function moveAndFlash(editor: Editor, dir: -1 | 1): boolean {
  const { $from, empty } = editor.state.selection;
  if (noteMove.get(editor)?.(dir, empty && onTitleLine($from))) return true;
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

function copiedCells(sel: CellSelection, slice: Slice, serializer: any): string {
  const table = sel.$anchorCell.node(-1);
  const top = Math.min(sel.$anchorCell.index(-1), sel.$headCell.index(-1));
  const header = top === 0 && table.firstChild?.firstChild?.type.name === 'tableHeader';
  const rows: PMNode[] = [];
  slice.content.descendants((n) => (n.type.name === 'tableRow' ? (rows.push(n), false) : true));
  if (header && appearance.s.tableCopyMarkdown) return serializer.serialize(Fragment.from(table.type.create(table.attrs, rows))).trim();
  const plain = (cell: PMNode) => { const words: string[] = []; cell.forEach((b) => words.push(b.textContent)); return words.join(' ').replace(/[\t\n]/g, ' '); };
  return rows.map((r) => { const cells: string[] = []; r.forEach((c) => cells.push(plain(c))); return cells.join('\t'); }).join('\n');
}

function toggleHere({ tr, state }: { tr: any; state: any }): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== 'detailsSummary') continue;
    const pos = $from.before(d - 1), details = $from.node(d - 1);
    tr.setNodeMarkup(pos, undefined, { ...details.attrs, open: !details.attrs.open });
    return true;
  }
  return false;
}

function tickTodos({ tr, state }: { tr: any; state: any }): boolean {
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

const arrow = (find: RegExp, replace: string) => new InputRule({
  find,
  handler: ({ state, range }) => {
    const $from = state.doc.resolve(range.from);
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
    if ((before.match(/`/g)?.length ?? 0) % 2) return null;
    state.tr.insertText(replace, range.from, range.to);
  },
});

/**
 * ⌘D: the lines the selection is on, once more right after them, as Notion duplicates blocks. A list's lines are
 * copied as items (a second paragraph in the same item would read back as one line), a toggle's title as the whole
 * toggle. Not the note's title, which is the page's name, nor in a table, whose cell holds one line.
 */
const duplicateLines: Command = (state, dispatch) => {
  // a block chosen whole (a table, a picture, a divider: ⋮⋮'s Duplicate): it again under it, chosen
  if (state.selection instanceof NodeSelection && state.selection.node.isBlock) {
    if (dispatch) {
      const { node, to } = state.selection;
      const tr = state.tr.insert(to, node).setMeta(DUPLICATE, true);
      dispatch(tr.setSelection(NodeSelection.create(tr.doc, to)).scrollIntoView());
    }
    return true;
  }
  const { $from, $to } = state.selection;
  if (inCell($from)) return true;
  // not lines inside an item (the items instead), nor a toggle's title (the toggle); a toggle's body is lines as any
  const range = $from.blockRange($to, (n) => !/^(listItem|taskItem|details)$/.test(n.type.name));
  if (!range) return false;
  if (range.depth === 0 && range.startIndex === 0 && range.parent.firstChild?.type.name === 'heading') return true;
  if (dispatch) {
    const copy = state.doc.slice(range.start, range.end).content;
    const tr = state.tr.insert(range.end, copy).setMeta(DUPLICATE, true);
    const by = copy.size;
    tr.setSelection(TextSelection.create(tr.doc, state.selection.from + by, state.selection.to + by));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * ⌘⌥T: every toggle in the note opened, or all closed if they were all open already. A caret inside a toggle that
 * closes goes to its title, as it would be hidden otherwise.
 */
const toggleAll: Command = (state, dispatch) => {
  const all: { pos: number; node: PMNode }[] = [];
  state.doc.descendants((node, pos) => { if (node.type.name === 'details') all.push({ pos, node }); });
  if (!all.length) return false;
  const open = all.some((d) => !d.node.attrs.open);
  if (dispatch) {
    const tr = state.tr;
    let hidden: number | null = null;
    for (const { pos, node } of all) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, open });
      const body = pos + 1 + (node.firstChild?.nodeSize ?? 0);
      if (!open && hidden === null && state.selection.from > body && state.selection.from < pos + node.nodeSize) hidden = pos + node.firstChild!.nodeSize;
    }
    if (hidden !== null) tr.setSelection(TextSelection.create(tr.doc, hidden));
    dispatch(tr);
  }
  return true;
};

/** ⌘A as Notion takes it: the line first (a code block's code whole), the note on the second press */
const selectLine: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if ($from.parent !== $to.parent || !$from.parent.isTextblock || !$from.parent.content.size) return false;
  if ($from.pos === $from.start() && $to.pos === $to.end()) return false; // the line is chosen already: the whole note
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, $from.start(), $from.end())));
  return true;
};

/** Run one editor action by id (the phone's formatting bar uses these; a keyboard uses applyKeymap). */
export const runEditorCommand = (editor: Editor, id: string): boolean => editorCommands(editor)[id]?.() ?? false;

/** all the text from `from` to `to` (in one line) inline code */
function allCode(doc: PMNode, from: number, to: number) {
  if (from === to) return false;
  let all = true;
  doc.nodesBetween(from, to, (n) => {
    if (n.isInline && !doc.type.schema.marks.code.isInSet(n.marks)) all = false;
  });
  return all;
}

const LISTS = /^(bulletList|orderedList|taskList)$/;

/** the code block's language for VS Code's `mode` in what it puts on the clipboard (its own ids, mostly the same) */
function vscodeLanguage(data: string): string | null {
  let mode = '';
  try { mode = String(JSON.parse(data)?.mode ?? ''); } catch { /* not what VS Code writes: no language */ }
  const own: Record<string, string> = { shellscript: 'bash', plaintext: '', javascriptreact: 'javascript', typescriptreact: 'typescript', html: 'xml', jsonc: 'json', dockerfile: 'dockerfile' };
  return (mode in own ? own[mode] : mode.toLowerCase()) || null;
}

/** a list pasted in a list of another kind (bullets in to-dos) as that kind: left as it was, it went in under the line */
function asList(pasted: PMNode, list: PMNode, item: PMNode): PMNode {
  const items: PMNode[] = [];
  pasted.forEach((l) => { items.push(item.type.create(item.type.name === 'taskItem' ? { checked: !!l.attrs.checked } : null, l.content)); });
  return list.type.create(null, items);
}

/**
 * A block (a table, code, a heading) put on an empty item of a list takes that item's place, the list split around
 * it (in a sublist: under the item above). Left in the item, it sat under an empty bullet that would not go, and
 * read back the bullet was gone, the block out of the list.
 */
export function outOfEmptyItem(tr: Transaction, block: PMNode | null | undefined) {
  if (!block || !block.isBlock || /^(paragraph|listItem|taskItem)$/.test(block.type.name) || LISTS.test(block.type.name) || !tr.selection.empty) return;
  const $at = tr.selection.$from;
  if ($at.depth < 2 || $at.parent.type.name !== 'paragraph' || $at.parent.content.size || !/^(listItem|taskItem)$/.test($at.node(-1).type.name) || $at.node(-1).childCount !== 1) return;
  const range = $at.blockRange();
  const target = range && liftTarget(range);
  if (range && target != null) tr.lift(range, target);
}

/**
 * Markdown (as HTML) pasted where the caret is, fitted in as any paste is: the first line runs on in the caret's line,
 * the last one takes the rest of it. Put in with insertContent it was a document of its own, every newline and space
 * of it kept: a list pasted into a list came in as a loose sublist under an empty item, a to-do's text began with a
 * space, and "# H" in the middle of a heading cut the heading in three. `lead` and `trail` are spaces kept at the ends.
 */
function pasteMarkdown(view: EditorView, tr: Transaction, html: string, lead = '', trail = ''): true {
  const schema = tr.doc.type.schema, $from = tr.selection.$from;
  const el = document.createElement('div');
  el.innerHTML = html;
  // open into the lines, not into a table's cells: a table pasted is a table (as ProseMirror's own paste does)
  let slice = Slice.maxOpen(DOMParser.fromSchema(schema).parseSlice(el, { preserveWhitespace: false, context: $from }).content, false);
  const item = $from.depth > 1 && /^(listItem|taskItem)$/.test($from.node(-1).type.name) ? $from.node(-1) : null;
  const fresh = item?.type.name === 'taskItem' ? { checked: false } : null;
  // lines pasted into a list item are items of its list, as if typed with Enter between them, not lines of the one item
  let paras = slice.content.childCount > 1;
  slice.content.forEach((n) => { if (n.type.name !== 'paragraph') paras = false; });
  if (item && paras) {
    const items: PMNode[] = [];
    slice.content.forEach((p) => items.push(item.type.create(fresh, p)));
    slice = new Slice(Fragment.from(items), slice.openStart + 1, slice.openEnd + 1);
  }
  // in a cell: lines it can hold (a list cut the table in two), open at a line of words to join the cell's own
  const fitted = inCell($from) ? cellLines(view, slice.content, $from) : null;
  if (fitted) slice = new Slice(fitted, fitted.firstChild?.isTextblock ? 1 : 0, fitted.lastChild?.isTextblock ? 1 : 0);
  const only = slice.content.childCount === 1 ? slice.content.firstChild! : null;
  if (item && only && LISTS.test(only.type.name) && only.type !== $from.node(-2).type) slice = new Slice(Fragment.from(asList(only, $from.node(-2), item)), slice.openStart, slice.openEnd);
  outOfEmptyItem(tr, slice.content.firstChild);
  if (lead) tr.replaceSelectionWith(schema.text(lead), false);
  // a list (a heading, a quote) pasted at the start or the end of a line goes before or after that line, a list in a
  // list as items of it. Run into the line, "- a" pasted after "one" gave "onea", its sublist one level in.
  const $at = tr.selection.$from, first = slice.content.firstChild;
  const block = first && first.type.name !== 'paragraph' && first.type !== $at.parent.type && (item ? LISTS.test(first.type.name) : true);
  if (block && tr.selection.empty && $at.parent.content.size && ($at.parentOffset === 0 || $at.pos === $at.end())) {
    const end = $at.parentOffset > 0, depth = item ? 2 : 1, empty = item ? item.type.create(fresh, schema.nodes.paragraph.create()) : schema.nodes.paragraph.create();
    if (end) tr.split($at.pos, depth, item ? [{ type: item.type, attrs: fresh }] : [{ type: schema.nodes.paragraph }]);
    else tr.insert($at.before(1 + $at.depth - depth), empty);
    tr.setSelection(TextSelection.create(tr.doc, end ? $at.pos + 2 * depth : $at.before(1 + $at.depth - depth) + depth));
  }
  tr.replaceSelection(slice);
  // the space after it is plain, and so is what is typed next: inserted as text, it took the last mark of what was
  // pasted (" `y` " then "z" gave "`y z`")
  if (trail) tr.insert(tr.selection.from, schema.text(trail)).setStoredMarks([]);
  return true;
}

/**
 * ⌘⇧. on a list's line: the whole list goes into a quote, or out of the one it is in. The stock toggle tried to quote
 * the item's own line, which an item cannot hold, and did nothing.
 */
const quoteList = ({ state, tr, dispatch }: { state: EditorState; tr: Transaction; dispatch?: unknown }) => {
  const { $from, $to } = state.selection, quote = state.schema.nodes.blockquote;
  let list = -1, quoted = -1;
  for (let d = $from.depth; d > 0; d--) {
    if (LISTS.test($from.node(d).type.name)) list = d;
    else if ($from.node(d).type === quote && list > d && quoted < 0) quoted = d;
  }
  if (list < 0) return false;
  if (quoted >= 0) {
    const range = $from.blockRange($to, (n) => n.type === quote);
    const target = range && liftTarget(range);
    if (!range || target == null) return false;
    if (dispatch) tr.lift(range, target);
    return true;
  }
  const range = $from.blockRange($to, (n) => !LISTS.test(n.type.name) && !/^(listItem|taskItem)$/.test(n.type.name));
  const wrapping = range && findWrapping(range, quote);
  if (!range || !wrapping) return false;
  if (dispatch) tr.wrap(range, wrapping);
  return true;
};

/** Several lines (paragraphs, list lines) made code at once: one block of them all, a line each, where they were.
 * The stock toggle made each a code block of its own. */
const linesToCode = (editor: Editor) => ({ state, tr, dispatch }: { state: EditorState; tr: Transaction; dispatch?: unknown }) => {
  const { $from, $to } = state.selection, code = state.schema.nodes.codeBlock;
  const lines: string[] = [];
  // a formula, a [[link]], a date or a footnote's mark as it is written ($x^2$, [[Page]]…): as their text, they were
  // nothing, and went (the stock toggle dropped them too)
  let atoms = false;
  const written = (leaf: PMNode) => {
    atoms = true;
    const serializer = (editor.storage as any).markdown.serializer;
    return (serializer.serialize(state.schema.nodes.doc.create(null, state.schema.nodes.paragraph.create(null, leaf))) as string).trim();
  };
  state.doc.nodesBetween($from.pos, $to.pos, (n) => {
    if (!n.isTextblock) return true;
    lines.push(n.textBetween(0, n.content.size, '\n', (leaf) => (leaf.type.name === 'hardBreak' ? '\n' : written(leaf))));
    return false;
  });
  if ((lines.length < 2 && !atoms) || $from.parent.type === code) return false;
  const range = $from.blockRange($to, (n) => n.type.contentMatch.matchType(code) != null && !/^table(Cell|Header)$/.test(n.type.name));
  if (!range) return false;
  // the block made goes where the whole range was: a range that also holds lines outside the selection (the rest of a
  // list, a callout, a toggle the selection reached into) lost them. Only lines that are all selected become code
  let inRange = 0;
  state.doc.nodesBetween(range.start, range.end, (n) => (n.isTextblock ? (inRange++, false) : true));
  if (inRange !== lines.length) return false;
  if (dispatch) {
    tr.replaceWith(range.start, range.end, code.create(null, state.schema.text(lines.join('\n'))));
    tr.setSelection(TextSelection.near(tr.doc.resolve(range.start + 1)));
  }
  return true;
};

/** a ⌘K answer that is a note to link to, not an address (no address starts with a NUL) */
const LINK_NOTE = '\u0000note:';
export function editorCommands(editor: Editor): Record<string, () => boolean> {
  const c = () => editor.chain().focus();
  // in code, or a selection with code in it: a list made of it took its lines as items, and they ran together
  const inCode = () => {
    const { from, to } = editor.state.selection;
    let code = editor.isActive('codeBlock');
    editor.state.doc.nodesBetween(from, to, (n) => { if (n.type.spec.code) code = true; });
    return code;
  };
  return {
    // the / menu opens where a word can start: right after a word (the phone's Insert block, the caret at the
    // end of a line) a bare "/" opened nothing and stayed in the text, so a space goes first
    slash: () => {
      const { $from } = editor.state.selection;
      // a toggle's title holds text only: no / menu opens there, so no "/" is left behind either
      // nor in code, where it was typed into the code ("le /t a = 1") and no menu came
      if ($from.parent.type.name === 'detailsSummary' || $from.parent.type.spec.code) return false;
      // inside a word: at its end, not between its letters ("hel /lo" cut the word in two for good)
      const rest = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, undefined, '\ufffc');
      const word = /^\S*/.exec(rest)![0].length;
      const at = $from.pos + word;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset + word - 1), $from.parentOffset + word, undefined, '\ufffc');
      const spaced = !!before && !/\s/.test(before);
      const ok = c().setTextSelection(at).insertContent(spaced ? ' /' : '/').run();
      if (ok) slashAsked(editor.view, at, at + (spaced ? 1 : 0));
      return ok;
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
    highlight: () => (highlightMenu(editor), true),
    code: () => c().toggleCode().run(),
    link: () => {
      const prev = editor.getAttributes('link').href as string | undefined;
      const { from, to } = editor.state.selection;
      const words = editor.state.doc.textBetween(from, to, ' ');
      // as Notion's ⌘K: the notes found as the box is typed into, ↩ linking the words to one; an address all the same.
      // It asked for a URL only, "https://" in it, and a link to another note meant typing [[ and its title again
      const choices = prev ? undefined : (typed: string) => {
        const q = typed.trim().toLowerCase();
        return notes.pages.filter((n) => n.id !== notes.currentId && titleOf(n).toLowerCase().includes(q)).slice(0, 6)
          .map((n) => ({ label: titleOf(n), icon: n.icon ?? '', value: LINK_NOTE + titleOf(n) }));
      };
      ui.prompt(prev ? 'Link URL' : 'Link to', prev ?? '', { choices, placeholder: 'A note, or a web address' }).then((typed) => {
        if (typed === null) return;
        if (typed.startsWith(LINK_NOTE)) {
          const title = typed.slice(LINK_NOTE.length);
          // the words stay what the line says; the link opens the note (Obsidian's [[Title|words]])
          c().insertContentAt({ from, to }, { type: 'wikiLink', attrs: { title, alias: words && words !== title ? words : '' } }).run();
          return;
        }
        // an address pasted after an "https://" came out "https://https://…"; one typed bare (example.com) is the web's
        let url = typed.trim().replace(/^(?:https?:\/\/)+(https?:\/\/)/i, '$1');
        if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) url = `https://${url}`;
        if (!url || /^[a-z][\w+.-]*:\/*$/i.test(url)) c().extendMarkRange('link').unsetLink().run();
        // no words chosen and none linked: the address goes in as its own words (it linked nothing, and said nothing)
        else if (editor.state.selection.empty && !prev) c().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).unsetMark('link').run();
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
    // under it); over a toggle or a callout, only the lines around it; otherwise the stock toggle (a line becomes a
    // list, a list's lines plain again), never over the empty line at the note's end
    // a list made of code took its lines into one item's text, newlines and all: saved, they read back as one line,
    // and in a callout or a toggle the list landed outside it. Code stays code; the keys do nothing there
    bulletList: () => inCode() || toggleCellBullet(editor.view) || editor.commands.command(switchLines('bulletList', 'listItem')) || c().command(leaveTrailer).command(wrapLines('bulletList', 'listItem')).run() || c().command(leaveTrailer).toggleBulletList().run(),
    orderedList: () => inCode() || editor.commands.command(switchLines('orderedList', 'listItem')) || c().command(leaveTrailer).command(wrapLines('orderedList', 'listItem')).run() || c().command(leaveTrailer).toggleOrderedList().run(),
    taskList: () => inCode() || editor.commands.command(switchLines('taskList', 'taskItem')) || c().command(leaveTrailer).command(wrapLines('taskList', 'taskItem')).run() || c().command(leaveTrailer).toggleTaskList().run(),
    // ⌘↩: the link or card under the caret opens; on a to-do, its box is ticked or cleared
    toggleCheck: () => openLinkHere(editor) || editor.commands.command(tickTodos) || editor.commands.command(toggleHere),
    blockquote: () => editor.commands.command(quoteList) || c().toggleBlockquote().run(),
    codeBlock: () => !inCell(editor.state.selection.$from) && (editor.commands.command(linesToCode(editor)) || c().toggleCodeBlock().run()),
    // in a toggle's title, under the toggle: the title holds text only
    divider: () => {
      const { $from } = editor.state.selection;
      if ($from.parent.type.name === 'detailsSummary') return c().insertContentAt($from.after(-1), { type: 'horizontalRule' }).run();
      return c().setHorizontalRule().run();
    },
    toggle: () => c().setDetails().updateAttributes('details', { open: true }).run(),
    newPage: () => (newPage(editor), true),
    duplicate: () => duplicateLines(editor.state, editor.view.dispatch),
    toggleAll: () => toggleAll(editor.state, editor.view.dispatch),
    selectBlock: () => selectLine(editor.state, editor.view.dispatch),
    selectAll: () => c().selectAll().run(),
    // right after a markdown shortcut made something ("---" a divider, "- " a list), ⌘Z gives back what was typed, as
    // ⌫ does there (it left "--": the last dash was the shortcut's own)
    undo: () => editor.commands.undoInputRule() || c().undo().run(),
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

function chipMenu(editor: Editor, pos: number, dom: HTMLElement) {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== 'dateMention') return;
  const set = (attrs: Record<string, unknown>) => editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }), true)).run();
  const askTime = async (initial: string) => {
    const typed = (await ui.prompt('Remind at (HH:MM)', initial))?.trim().replace(/^(\d):/, '0$1:');
    if (typed && isTime(typed)) { set({ remind: true, time: typed }); void askNotify(); } else editor.commands.focus();
  };
  const r = dom.getBoundingClientRect();
  ui.openMenu(under(r), node.attrs.remind
    ? [
      { label: `Remind at ${node.attrs.time}…`, run: () => void askTime(node.attrs.time) },
      { label: 'Stop reminding', run: () => set({ remind: false, time: '' }) },
    ]
    : [{ label: 'Remind me…', run: () => void askTime(remindTime(node.attrs.date)) }]);
}

const KEYS_BEFORE_NOTION: Record<string, string> = {
  'Mod-Shift-7': 'orderedList', 'Mod-Shift-8': 'bulletList', 'Mod-Shift-9': 'taskList', 'Mod-Alt-c': 'codeBlock',
  'Mod-Shift-x': 'strike', 'Alt-ArrowUp': 'moveBlockUp', 'Alt-ArrowDown': 'moveBlockDown',
};

export function applyKeymap(editor: Editor) {
  const cmds = editorCommands(editor);
  const bindings: Record<string, Command> = {};
  const linkOrSearch = () => (!editor.state.selection.empty || editor.isActive('link')) && cmds.link();
  for (const a of shortcuts.actions) {
    if (a.scope !== 'editor' || !a.keys || !cmds[a.id]) continue;
    // ProseMirror knows the minus key as "-" ("Minus" is the list's own name for it), and with Shift held the
    // key reads "_": that is found by the key's code (Mod-Shift--), or as "_" without its Shift (Mod-_)
    const keys = a.keys.replace(/Minus$/, '-');
    bindings[keys] = a.id === 'link' ? linkOrSearch : () => cmds[a.id]();
    if (keys !== a.keys && keys.includes('Shift-')) bindings[keys.replace('Shift-', '').replace(/-$/, '_')] = bindings[keys];
  }
  editor.unregisterPlugin(KEYMAP);
  editor.unregisterPlugin(APP_GUARD);
  const guard = new Plugin({
    key: APP_GUARD,
    props: {
      handleKeyDown: (_view, e) => {
        if (suggestionVisible(editor)) return false;
        const a = shortcuts.match(e, ['app']);
        if (!a) return false;
        leaveToApp(e);
        return true;
      },
    },
  });
  editor.registerPlugin(guard, (p, all) => [p, ...all]);
  bindings['Alt-Enter'] = () => (noteMenu(editor, null), true);
  const taken = new Set(shortcuts.actions.map((a) => a.keys));
  for (const [keys, id] of Object.entries(KEYS_BEFORE_NOTION)) if (!taken.has(keys) && !bindings[keys] && cmds[id]) bindings[keys] = () => cmds[id]();
  const plugin = new Plugin({ key: KEYMAP, props: { handleKeyDown: keydownHandler(bindings) } });
  editor.registerPlugin(plugin, (p, all) => [p, ...all]);
}

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
      if (pos !== undefined) pos = editor.state.selection.to;
    }
  })();
  return true;
}

/**
 * The system's spelling help on the note as Settings has it: misspellings underlined, words corrected, a sentence's
 * first letter capitalised. A plugin's own attributes, read again on every update (Editor.svelte nudges it when the
 * setting changes): the editor's own attributes can't be a function, tiptap spreads them into an object.
 */
const spellingHelp = Extension.create({
  name: 'spellingHelp',
  addProseMirrorPlugins() {
    return [new Plugin({ props: { attributes: () => {
      const on = appearance.s.autoCorrect;
      return { spellcheck: String(on), autocorrect: on ? 'on' : 'off', autocapitalize: on ? 'sentences' : 'off' };
    } } })];
  },
});

export function clickBelow(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.detail > 1 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!view.state.selection.empty) return false;
  const doc = view.state.doc, last = doc.lastChild;
  const dom = last && (view.nodeDOM(doc.content.size - last.nodeSize) as HTMLElement | null);
  if (!dom?.getBoundingClientRect || event.clientY <= dom.getBoundingClientRect().bottom) return false;
  let tr = view.state.tr;
  if (!last!.isTextblock) tr = tr.insert(doc.content.size, view.state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.atEnd(tr.doc)).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return true;
}

export function dropBlock(view: EditorView, event: DragEvent): number | undefined {
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!at) return undefined;
  const $pos = view.state.doc.resolve(at.pos);
  if ($pos.depth < 1) return at.pos;
  const block = view.state.schema.nodes.image;
  for (let d = $pos.depth; d >= 1; d--) {
    const parent = $pos.node(d - 1), i = $pos.index(d - 1);
    const fitsAbove = parent.canReplaceWith(i, i, block), fitsBelow = parent.canReplaceWith(i + 1, i + 1, block);
    if (!fitsAbove && !fitsBelow) continue;
    const before = $pos.before(d);
    const box = (view.nodeDOM(before) as HTMLElement | null)?.getBoundingClientRect?.();
    const above = !!box && event.clientY < box.top + box.height / 2;
    return (above && fitsAbove) || !fitsBelow ? before : $pos.after(d);
  }
  return at.pos;
}

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

function typedTrigger(key: PluginKey<number | null>, char: string, endsAtSpace: boolean, closer?: string) {
  const typedJustNow = (tr: Transaction, state: EditorState) => {
    const { empty, $head } = state.selection;
    return tr.docChanged && empty && !tr.getMeta('paste') && tr.getMeta('uiEvent') !== 'paste' && tr.getMeta('uiEvent') !== 'drop' && !tr.getMeta('history$')
      && $head.parent.isTextblock && $head.parentOffset >= char.length
      && $head.parent.textBetween($head.parentOffset - char.length, $head.parentOffset) === char
      && tr.steps.some((st) => { const c = (st as { slice?: { content: Fragment; size: number } }).slice; return !!c?.size && c.content.textBetween(0, c.content.size).endsWith(char.at(-1)!); });
  };
  const endedBySpace = (state: EditorState, at: number) => endsAtSpace && /\s/.test(state.doc.textBetween(at + 1, Math.max(at + 1, state.selection.head)));
  const closedBy = (state: EditorState, at: number) => !!closer && state.doc.textBetween(at + char.length, Math.max(at + char.length, state.selection.head)).includes(closer);
  return new Plugin<number | null>({
    key,
    state: {
      init: () => null,
      apply(tr, at, _old, state) {
        if (at !== null) {
          const r = tr.mapping.mapResult(at, 1);
          at = r.deleted ? null : r.pos;
        }
        if (typedJustNow(tr, state)) return state.selection.head - char.length;
        if (at === null) return null;
        if (state.selection.head <= at || state.doc.resolve(at).parent !== state.selection.$head.parent) return null;
        if (endedBySpace(state, at) || closedBy(state, at)) return null;
        if (!tr.docChanged && tr.selectionSet && (endsAtSpace || tr.getMeta('pointer'))) return null;
        return at;
      },
    },
  });
}
const SLASH_AT = new PluginKey<number | null>('slashAt');
const slashTyped = typedTrigger(SLASH_AT, '/', true);
const WIKI_AT = new PluginKey<number | null>('wikiAt');
const wikiTyped = typedTrigger(WIKI_AT, '[[', false, ']]');
const PAGE_AT = new PluginKey<number | null>('pageAt');
const pageTyped = typedTrigger(PAGE_AT, '+', false);

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

/**
 * A key typed just after a 한글 syllable is that key. In WebKit ProseMirror drops the first key within 0.5s of a
 * composition's end: a Japanese IME confirms its word with ↩ and sends the ↩ on after it. A Korean syllable is never
 * confirmed that way (the key that ends it comes while it is still composing, which is skipped anyway), so the drop
 * only took a real key: ↩ or Tab typed quickly after "한글 " did nothing in code, a toggle's title, a list or the / menu.
 */
const hangulKeys = Extension.create({
  name: 'hangulKeys',
  addProseMirrorPlugins: () => [new Plugin({ props: { handleDOMEvents: {
    compositionend: (view, e) => {
      // after ProseMirror's own handler, which marks the time
      if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(e.data ?? '')) queueMicrotask(() => { (view as any).input.compositionEndedAt = -2e8; });
      return false;
    },
  } } })],
});

const markExit = Extension.create({
  name: 'markExit',
  addKeyboardShortcuts() {
    const out = (dir: -1 | 1) => () => {
      const { state, view } = this.editor, sel = state.selection;
      if (!sel.empty) return false;
      const $c = sel.$from, marks = state.storedMarks ?? $c.marks();
      if ((dir > 0 ? $c.pos !== $c.end() : $c.parentOffset !== 0) || !marks.length) return false;
      view.dispatch(state.tr.setStoredMarks([]));
      return true;
    };
    return { ArrowRight: out(1), ArrowLeft: out(-1) };
  },
});

function codeEdge(state: EditorState, $c = state.selection.$from, stored = state.storedMarks) {
  const code = state.schema.marks.code;
  if (!code || $c.parent.type.spec.code || !$c.parent.inlineContent) return null;
  const b = $c.nodeBefore, a = $c.nodeAfter;
  const inB = !!b?.isText && !!code.isInSet(b.marks), inA = !!a?.isText && !!code.isInSet(a.marks);
  if (inB === inA) return null;
  const other = inB ? a : b;
  return { after: inB, inside: !!code.isInSet(stored ?? $c.marks()), inMarks: (inB ? b : a)!.marks, outMarks: other?.isText ? other.marks : [] };
}

const codeEdges = Extension.create({
  name: 'codeEdges',
  priority: 110,
  addKeyboardShortcuts() {
    const stepAcrossEdge = (view: EditorView, dir: -1 | 1) => {
      const e = codeEdge(view.state);
      if (!e || (dir > 0) !== (e.after === e.inside)) return false;
      view.dispatch(view.state.tr.setStoredMarks(e.inside ? e.outMarks : e.inMarks));
      return true;
    };
    const stepOntoEdge = (view: EditorView, $c: ResolvedPos, dir: -1 | 1) => {
      const { state } = view, node = dir > 0 ? $c.nodeAfter : $c.nodeBefore;
      if (!node?.isText) return false;
      const letters = Array.from(node.text!), letter = dir > 0 ? letters[0] : letters[letters.length - 1];
      const $to = state.doc.resolve($c.pos + dir * letter.length), there = codeEdge(state, $to, null);
      const inside = !!state.schema.marks.code.isInSet(node.marks);
      if (!there || there.inside === inside) return false;
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, $to.pos)).setStoredMarks(inside ? there.inMarks : there.outMarks).scrollIntoView());
      return true;
    };
    const step = (dir: -1 | 1) => () => {
      const { view } = this.editor, sel = view.state.selection;
      if (!(sel instanceof TextSelection) || !sel.empty) return false;
      return stepAcrossEdge(view, dir) || stepOntoEdge(view, sel.$from, dir);
    };
    const joinTouchingCodes = () => {
      const { state, view } = this.editor, sel = state.selection;
      const code = state.schema.marks.code;
      if (!(sel instanceof TextSelection) || !sel.empty || !code) return false;
      const $c = sel.$from, b = $c.nodeBefore, a = $c.nodeAfter;
      if (!b?.isText || !a?.isText || !code.isInSet(b.marks) || !code.isInSet(a.marks) || Mark.sameSet(b.marks, a.marks)) return false;
      const end = $c.pos + a.nodeSize, tr = state.tr.removeMark($c.pos, end);
      for (const m of b.marks) tr.addMark($c.pos, end, m);
      view.dispatch(tr.setStoredMarks(b.marks));
      return true;
    };
    return { ArrowRight: step(1), ArrowLeft: step(-1), Backspace: joinTouchingCodes, Delete: joinTouchingCodes };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('codeEdges'),
      props: {
        // drawn by the code's own letter at the edge (a ::before or ::after), not a node of its own at the caret: a
        // widget there took an arrow's step and, at a line's start, left the input method nowhere to write (#325)
        decorations: heldWhileComposing((state) => {
          const e = state.selection.empty ? codeEdge(state) : null;
          if (!e) return null;
          const at = state.selection.from, $c = state.selection.$from;
          const letters = Array.from((e.after ? $c.nodeBefore : $c.nodeAfter)!.text!);
          const letter = e.after ? letters[letters.length - 1] : letters[0];
          const [from, to] = e.after ? [at - letter.length, at] : [at, at + letter.length];
          const cls = `code-caret code-caret-${e.after ? 'after' : 'before'}${e.inside ? '' : ' out'}`;
          return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: cls })]);
        }),
      },
    })];
  },
});

function dropOuterLists(content: Fragment, openStart: number): Fragment {
  for (let open = openStart; open >= 2 && content.childCount === 1 && LISTS.test(content.firstChild!.type.name)
    && content.firstChild!.childCount === 1 && LISTS.test(content.firstChild!.firstChild!.firstChild?.type.name ?? ''); open -= 2) {
    content = content.firstChild!.firstChild!.content;
  }
  return content;
}

function untitleCallout(frag: Fragment): Fragment {
  const first = frag.firstChild;
  if (!first) return frag;
  const node = first.type.name === 'callout' ? first.type.create({ ...first.attrs, titled: false }, first.content, first.marks) : first.copy(untitleCallout(first.content));
  return frag.replaceChild(0, node);
}

function copySerializer(serializer: any) {
  const copying = (write: (state: any, ...rest: unknown[]) => void) => (state: any, ...rest: unknown[]) => { state.options.copying = true; write(state, ...rest); };
  return Object.create(serializer, {
    nodes: { get: () => Object.fromEntries(Object.entries<any>(serializer.nodes).map(([name, write]) => [name, write && copying(write)])) },
  });
}

function copyText(slice: Slice, view: EditorView, serializer: any): string {
  const { $from, $to } = view.state.selection;
  if (view.state.selection instanceof CellSelection) return copiedCells(view.state.selection, slice, serializer);
  const inLine = $from.sameParent($to) && $from.parent.isTextblock;
  if (inLine && $from.parent.type.spec.code) return slice.content.textBetween(0, slice.content.size, '\n');
  if (inLine && allCode(view.state.doc, $from.pos, $to.pos)) return view.state.doc.textBetween($from.pos, $to.pos);
  if (inLine) return serializer.serialize(Fragment.from(view.state.schema.nodes.paragraph.create(null, $from.parent.content.cut($from.parentOffset, $to.parentOffset))));
  let content = dropOuterLists(slice.content, slice.openStart);
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== 'callout' || !$from.node(d).attrs.titled || $from.index(d) === 0) continue;
    content = untitleCallout(content);
    break;
  }
  return serializer.serialize(content);
}

function pasteInToggleTitle(view: EditorView, content: Fragment, serializer: any): Slice {
  const { schema } = view.state;
  const written = (leaf: PMNode) => (leaf.isText ? leaf.text! : leaf.isInline ? (serializer.serialize(schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, leaf))) as string).trim() : '');
  const words = content.textBetween(0, content.size, ' ', written).replace(/\s+/g, ' ').trim();
  return new Slice(words ? Fragment.from(schema.text(words)) : Fragment.empty, 0, 0);
}

// rows copied from a table come as rows, open: pasted outside a table, ProseMirror made a table around them
// and left the empty line above it. They are a table of their own. (Into a table, prosemirror-tables pastes
// the cells.)
function rowsAsTable(view: EditorView, content: Fragment): Slice | null {
  if (content.firstChild?.type.name !== 'tableRow' || inCell(view.state.selection.$from)) return null;
  return new Slice(Fragment.from(view.state.schema.nodes.table.create(null, content)), 0, 0);
}

function pasteInCell(view: EditorView, content: Fragment): Slice | null {
  const { $from, $to } = view.state.selection;
  if (!inCell($from) || !inCell($to) || content.firstChild?.type.name === 'tableRow') return null;
  const fitted = cellLines(view, content, $from);
  return fitted && new Slice(fitted, fitted.firstChild?.isTextblock ? 1 : 0, fitted.lastChild?.isTextblock ? 1 : 0);
}

function unwrapToggleBody(slice: Slice): Slice {
  let { content, openStart, openEnd } = slice;
  while (openStart >= 2 && content.childCount === 1 && content.firstChild!.type.name === 'details' && content.firstChild!.firstChild?.type.name === 'detailsContent') {
    content = content.firstChild!.firstChild!.content;
    openStart -= 2;
    openEnd = Math.max(0, openEnd - 2);
  }
  return content === slice.content ? slice : new Slice(content, openStart, openEnd);
}

function wordsOnly({ content, openStart, openEnd }: Slice): Slice | null {
  let inner = content, depth = 0;
  while (inner.childCount === 1 && !inner.firstChild!.isTextblock && depth < Math.min(openStart, openEnd)) inner = inner.firstChild!.content, depth++;
  const line = inner.childCount === 1 ? inner.firstChild! : null;
  if (!line?.isTextblock || openStart !== depth + 1 || openEnd !== depth + 1 || (line.type.spec.code && line.textContent.includes('\n'))) return null;
  return new Slice(line.content, 0, 0);
}

function linesIntoList(view: EditorView, { content, openStart, openEnd }: Slice): Slice | null {
  const $at = view.state.selection.$from, item = $at.depth >= 2 ? $at.node(-1) : null;
  if (!item || !/^(listItem|taskItem)$/.test(item.type.name) || $at.parent.type.name !== 'paragraph') return null;
  const list = $at.node(-2), only = content.childCount === 1 ? content.firstChild! : null;
  if (only && LISTS.test(only.type.name) && only.type !== list.type) return new Slice(Fragment.from(asList(only, list, item)), openStart, openEnd);
  const lines: PMNode[] = []; content.forEach((n) => { lines.push(n); });
  if (lines.length < 2 || !lines.every((n) => n.type.name === 'paragraph')) return null;
  const items = list.type.create(null, lines.map((l) => item.type.create(item.type.name === 'taskItem' ? { checked: false } : null, l)));
  return new Slice(Fragment.from(items), openStart ? openStart + 2 : 1, openEnd ? openEnd + 2 : 1);
}

type Clip = { pasted: string; text: string; html: string; vscode: string | undefined };

const parseMarkdown = (editor: Editor, md: string) => (editor.storage as any).markdown.parser.parse(md);

const inCodeBlock = ({ $from, $to }: Selection) => $from.parent.type.name === 'codeBlock' && $to.parent === $from.parent;

function pasteIntoCode(tr: Transaction, { pasted }: Clip): boolean {
  const { from, to, empty, $from } = tr.selection, { schema } = tr.doc.type, code = schema.marks.code;
  if (!pasted || inCodeBlock(tr.selection) || !(empty ? code.isInSet(tr.storedMarks ?? $from.marks()) : allCode(tr.doc, from, to))) return false;
  const marks = empty ? tr.storedMarks ?? $from.marks() : tr.doc.nodeAt(from)!.marks;
  tr.replaceWith(from, to, schema.text(pasted.replace(/\r?\n/g, ' '), marks));
  return true;
}

function linkSelection(tr: Transaction, { text }: Clip): boolean {
  if (!URL_RE.test(text) || tr.selection.empty) return false;
  const link = tr.doc.type.schema.marks.link, doc = tr.doc;
  for (const { $from, $to } of tr.selection.ranges) {
    doc.nodesBetween($from.pos, $to.pos, (n, pos) => {
      if (n.isInline) tr.addMark(Math.max(pos, $from.pos), Math.min(pos + n.nodeSize, $to.pos), link.create({ ...link.isInSet(n.marks)?.attrs, href: text }));
    });
  }
  tr.setMeta('preventAutolink', true);
  return true;
}

function pasteVsCode(editor: Editor, view: EditorView, tr: Transaction, { pasted, text, vscode }: Clip): boolean {
  const { $from, empty } = tr.selection, { schema } = tr.doc.type;
  if (!vscode || !text || inCodeBlock(tr.selection) || inCell($from) || $from.parent.type.name !== 'paragraph') return false;
  const code = pasted.replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd();
  if (!$from.parent.content.size && empty) {
    const block = schema.nodes.codeBlock.create({ language: vscodeLanguage(vscode) }, schema.text(code));
    tr.replaceRangeWith($from.before(), $from.after(), block);
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map($from.before()) + block.nodeSize - 1), -1));
    return true;
  }
  const { paragraph, doc } = schema.nodes;
  const asTyped = doc.create(null, code.split('\n').map((l) => paragraph.create(null, l ? schema.text(l) : null)));
  return pasteMarkdown(view, tr, parseMarkdown(editor, (editor.storage as any).markdown.serializer.serialize(asTyped)));
}

function pasteIntoOneLine(tr: Transaction, { text }: Clip): boolean {
  const { parent } = tr.selection.$from;
  if (!/\n/.test(text) || !parent.isTextblock || parent.type.spec.code || parent.type.contentMatch.matchType(tr.doc.type.schema.nodes.hardBreak)) return false;
  tr.insertText(text.replace(/\s*\r?\n\s*/g, ' '));
  return true;
}

// blocks copied in Notion: its markdown says what they were, its HTML does not (notionPaste.ts)
function pasteNotion(editor: Editor, view: EditorView, tr: Transaction, { pasted, text, html }: Clip): boolean {
  if (!text || !NOTION_COPY.test(html) || inCodeBlock(tr.selection) || inCell(tr.selection.$from)) return false;
  return pasteMarkdown(view, tr, parseMarkdown(editor, fromNotion(pasted)));
}

function pasteMarkdownText(editor: Editor, view: EditorView, tr: Transaction, { pasted, text, html }: Clip): boolean {
  if (!text || !LITERAL_MARKDOWN.test(text) || RICH_HTML.test(html) || html.includes('data-pm-slice') || inCodeBlock(tr.selection)) return false;
  const lead = pasted.includes('\n') ? '' : /^[ \t]+/.exec(pasted)?.[0] ?? '', trail = pasted.includes('\n') ? '' : /[ \t]+$/.exec(pasted)?.[0] ?? '';
  return pasteMarkdown(view, tr, parseMarkdown(editor, pasted), lead, trail);
}

function pastePlainLines(editor: Editor, view: EditorView, tr: Transaction, { pasted, text, html }: Clip): boolean {
  const $from = tr.selection.$from;
  if (!text || !/\n/.test(text) || RICH_HTML.test(html) || html.includes('data-pm-slice') || $from.parent.type.name !== 'paragraph' || inCell($from)) return false;
  const lines = pasted.replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '').split('\n');
  const indent = (ws: string) => ws.replace(/ /g, '&#32;').replace(/\t/g, '&#9;');
  const md = lines.map((l) => (l.trim() ? l.replace(/^[ \t]+/, indent) : BLANK)).join('\n\n');
  return pasteMarkdown(view, tr, parseMarkdown(editor, md));
}

const NoRawNewlines = Extension.create({
  name: 'noRawNewlines',
  addProseMirrorPlugins: () => [new Plugin({
    appendTransaction: (trs, _old, state) => {
      if (!trs.some((t) => t.docChanged)) return null;
      const ranges: [number, number][] = [];
      trs.forEach((t, i) => t.steps.forEach((step, j) => step.getMap().forEach((_a, _b, from, to) => {
        let f = from, e = to;
        for (let k = j + 1; k < t.steps.length; k++) { f = t.steps[k].getMap().map(f, -1); e = t.steps[k].getMap().map(e, 1); }
        for (let n = i + 1; n < trs.length; n++) { f = trs[n].mapping.map(f, -1); e = trs[n].mapping.map(e, 1); }
        ranges.push([f, e]);
      })));
      const fix: { pos: number; text: string; breaks: boolean }[] = [];
      for (const [from, to] of ranges) {
        state.doc.nodesBetween(Math.max(0, from - 1), Math.min(state.doc.content.size, to + 1), (node, pos, parent) => {
          if (!node.isText || !node.text!.includes('\n') || !parent || parent.type.spec.code) return;
          if (!fix.some((x) => x.pos === pos)) fix.push({ pos, text: node.text!, breaks: !!parent.type.contentMatch.matchType(state.schema.nodes.hardBreak) });
        });
      }
      if (!fix.length) return null;
      const tr = state.tr;
      for (const { pos, text, breaks } of fix.sort((a, b) => b.pos - a.pos)) {
        const marks = state.doc.nodeAt(pos)!.marks;
        const parts = text.split('\n');
        const nodes = parts.flatMap((part, i) => [...(i ? [breaks ? state.schema.nodes.hardBreak.create() : state.schema.text(' ', marks)] : []), ...(part ? [state.schema.text(part, marks)] : [])]);
        tr.replaceWith(pos, pos + text.length, nodes);
      }
      return tr;
    },
  })],
});

function selectionClass(node: PMNode): string | null {
  if (node.type.name === 'codeBlock' && node.attrs.language === 'mermaid') return 'in-sel';
  return node.isAtom ? (node.isBlock ? 'in-sel' : 'pm-sel') : null;
}

const PaintSelection = Extension.create({
  name: 'paintSelection',
  addProseMirrorPlugins: () => [new Plugin({
    props: {
      decorations: heldWhileComposing((state) => {
        const sel = state.selection;
        if (sel.empty || sel instanceof NodeSelection) return null;
        const { from, to } = sel;
        const marks: Decoration[] = [];
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isText) return false;
          const cls = selectionClass(node);
          if (!cls) return true;
          if (pos >= from && pos + node.nodeSize <= to) marks.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }));
          return false;
        });
        return marks.length ? DecorationSet.create(state.doc, marks) : null;
      }),
    },
  })],
});

const SelectMediaBeforeDelete = Extension.create({
  name: 'selectMediaFirst',
  priority: 1000,
  addKeyboardShortcuts() {
    const MEDIA = /^(image|pdf|video|bookmark|mathBlock|horizontalRule|table|kanban)$/;
    const select = (dir: -1 | 1) => () => {
      const { state, view } = this.editor;
      const { $from, empty } = state.selection;
      const line = $from.parent;
      if (!empty || !line.isTextblock || $from.parentOffset !== (dir < 0 ? 0 : line.content.size)) return false;
      const next = blockBeside($from, dir, (n) => MEDIA.test(n.type.name));
      if (!next || !MEDIA.test(next.node.type.name)) return false;
      const board = next.node.type.name === 'kanban';
      if (!line.content.size && !(board && dir < 0)) return false;
      if (board) return void deleteBoard(this.editor, next.pos), true;
      view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, next.pos)).scrollIntoView());
      return true;
    };
    return { Backspace: select(-1), Delete: select(1) };
  },
});

function wikiItems(query: string, targets: readonly Note[], self: string | undefined): SuggestItem[] {
  const q = query.toLowerCase();
  const pages: SuggestItem[] = [];
  const sections: SuggestItem[] = [];
  for (const n of targets) {
    const title = titleOf(n);
    const inside = headingsOf(n.body).map((h) => ({ label: h, value: `${title}#${h}`, hint: title, icon: ICONS.section }));
    if (title !== self && typedIn(title.toLowerCase(), q)) {
      pages.push({ label: title, sections: inside, ...(n.icon ? { noteIcon: n.icon } : { icon: ICONS.note }) });
    }
    for (const h of inside) if (typedIn(h.value.toLowerCase(), q)) sections.push(h);
  }
  const items = [...pages, ...sections].slice(0, 8);
  if (query && !query.includes('#') && !pages.some((p) => p.label.toLowerCase() === q)) {
    items.push({ label: query, hint: 'new note', icon: ICONS.page });
  }
  return items;
}

function atNamesADay(state: EditorState, range: { from: number }): boolean {
  const { $head } = state.selection;
  const rest = /^\S+/.exec($head.parent.textBetween($head.parentOffset, $head.parent.content.size, undefined, '￼'))?.[0];
  if (!rest || $head.pos <= range.from) return true;
  const word = state.doc.textBetween(range.from + 1, $head.pos) + rest;
  return !!remindChoices(word) || (dayChoices(word) as { exact?: boolean }[]).some((d) => d.exact);
}

const PHONE_BAR_MARGIN = { top: 16, bottom: 90, left: 0, right: 0 };
const MAC_TOOLBAR_MARGIN = { top: 80, bottom: 48, left: 0, right: 0 };

function cellLines(view: EditorView, content: Fragment, $at: ResolvedPos): Fragment | null {
  const schema = view.state.schema;
  // a block as the note writes it (the editor is on its view's element: tiptap puts it there)
  const written = (b: PMNode) => ((view.dom as any).editor?.storage.markdown.serializer.serialize(schema.nodes.doc.create(null, b)) as string | undefined ?? b.textContent).trim();
  const { paragraph, image, hardBreak } = schema.nodes;
  let fits = true;
  content.forEach((n) => { if (!n.isInline && n.type !== paragraph && n.type !== image) fits = false; });
  if (fits) return null;
  const out: PMNode[] = [];
  let words: PMNode[] = [], lines = $at.parentOffset > 0 ? 1 : 0;
  const line = (front: string, inline: Fragment) => {
    if (lines++) words.push(hardBreak.create());
    if (front) words.push(schema.text(front));
    inline.forEach((n) => { words.push(n); });
  };
  const close = () => { if (words.length) out.push(paragraph.create(null, words)); words = []; lines = 0; };
  const walk = (n: PMNode, front: string) => {
    if (n.type === image) { close(); out.push(n); }
    else if (n.type.spec.code) n.textContent.split('\n').forEach((l, i) => line(i ? '' : front, l ? Fragment.from(schema.text(l)) : Fragment.empty));
    else if (n.isTextblock) line(front, n.content);
    else if (n.isAtom) {
      const src = n.attrs.src || n.attrs.href;
      if (n.type.name === 'mathBlock' && schema.nodes.mathInline) line(front, Fragment.from(schema.nodes.mathInline.create({ latex: n.attrs.latex })));
      else if (src && schema.marks.link) line(front, Fragment.from(schema.text(n.attrs.name || src, [schema.marks.link.create({ href: src })])));
      else written(n).split('\n').forEach((l, i) => line(i ? '' : front, l.trim() ? Fragment.from(schema.text(l)) : Fragment.empty));
    }
    else if (LISTS.test(n.type.name)) {
      n.forEach((item, _o, i) => {
        const mark = n.type.name === 'orderedList' ? `${(n.attrs.start ?? 1) + i}. ` : n.type.name === 'taskList' ? (item.attrs.checked ? '☑ ' : '☐ ') : '• ';
        item.forEach((child, _o2, j) => walk(child, j ? '' : mark));
      });
    } else n.forEach((child, _o, i) => walk(child, i ? '' : front));
  };
  content.forEach((n) => walk(n, ''));
  if (words.length && $at.parentOffset < $at.parent.content.size) words.push(hardBreak.create());
  close();
  return Fragment.from(out);
}

// A link ends where its words do, as in Notion: typed on at its end (or before it), the words were taken into the
// link (stock links grow while autolink is on), and → at its end typed a space into the note each time
const LinkEndsAtItsWords = Link.extend({
  inclusive: () => false, exitable: false,
  // an address with a space in it (a search's ?q=a b, a path) goes in <…>: bare, markdown ends the address at the
  // space, and read back the link was gone and its [words](…) showed as text
  addStorage() {
    const plain = defaultMarkdownSerializer.marks.link;
    const open = (state: any, mark: any, parent: any, index: number) => {
      const w = (plain.open as any)(state, mark, parent, index);
      const node = parent.child(index), next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
      if (state.options.copying && !state.inAutolink && node.isText && mark.attrs.href === `mailto:${node.text}` && !mark.isInSet(next?.marks ?? [])) state.inAutolink = true;
      return state.options.copying && state.inAutolink ? '' : w;
    };
    return { markdown: { serialize: { ...plain, open, close: (state: any, mark: any, parent: any, index: number) => {
      const href = String(mark.attrs.href ?? '');
      if (state.options.copying && state.inAutolink) { state.inAutolink = undefined; return ''; }
      if (state.inAutolink || !/\s/.test(href)) return (plain.close as any)(state, mark, parent, index);
      state.inAutolink = undefined;
      return `](<${href.replace(/[<>]/g, (c) => encodeURIComponent(c))}>${mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : ''})`;
    } } } };
  },
  // Words a link was taken off stay words: autolink linked the last word again at every space or ↩ typed after
  // it. Where a link is removed is kept (mapped as the note changes) and a link autolink puts back there is taken
  // off in the same step; a link put on them by hand clears the place.
  addProseMirrorPlugins() {
    const link = this.type;
    type Span = { from: number; to: number };
    const key = new PluginKey<Span[]>('unlinked');
    const unlinked = new Plugin<Span[]>({
      key,
      state: {
        init: () => [],
        apply(tr, spans) {
          let next = spans.map((s) => ({ from: tr.mapping.map(s.from, 1), to: tr.mapping.map(s.to, -1) })).filter((s) => s.from < s.to);
          if (tr.getMeta('appendedTransaction')) return next;
          tr.steps.forEach((st, i) => {
            if (!(st instanceof RemoveMarkStep || st instanceof AddMarkStep) || st.mark.type !== link) return;
            const rest = tr.mapping.slice(i + 1), from = rest.map(st.from, 1), to = rest.map(st.to, -1);
            next = next.filter((s) => s.to <= from || s.from >= to);
            if (st instanceof RemoveMarkStep && from < to) next.push({ from, to });
          });
          return next;
        },
      },
      appendTransaction(_trs, _old, state) {
        const tr = state.tr;
        for (const s of key.getState(state) ?? []) if (state.doc.rangeHasMark(s.from, s.to, link)) tr.removeMark(s.from, s.to, link);
        return tr.steps.length ? tr : null;
      },
    });
    return [...(this.parent?.() ?? []), unlinked];
  },
}).configure({ openOnClick: false, autolink: true });

// code inside a link ([run `npm i` first](u)) stays in it: stock code shuts out every other mark, so the link
// was cut in two around it. Formatting still goes (nothing in code is bold).
// Inline code all deleted, the next text typed there is not code again. The webview deletes the letters
// itself, and ProseMirror keeps the deleted letters' marks for the next keys (as with bold): after `abc` was
// cleared out (in WebKit), everything typed after it came out as code.
const CodeInsideLinks = Code.extend({
  excludes: 'bold italic strike underline highlight',
  // → at the end of a line ending in code is markExit's, as for every mark. The stock exit typed a space there,
  // one more each time the caret came by
  exitable: false,
  // its spaces as written (`a  b`, `  `): read as any text, a run of them was one space when the note opened,
  // and code of spaces only went altogether
  parseHTML() {
    return [
      {
        tag: 'code',
        getAttrs: (el) => (!el.closest('pre') && [...el.childNodes].every((n) => n.nodeType === 3) ? null : false),
        getContent: (el, schema) => {
          const text = el.textContent!.replace(/\r?\n/g, ' ');
          return text ? Fragment.from(schema.text(text)) : Fragment.empty;
        },
      },
      { tag: 'code' },
    ];
  },
  addStorage() {
    // the fence one backtick longer than any run in the code, with a space inside it where the code has a backtick
    // or a space at both ends (markdown takes one off each: ` x ` read back "x")
    const fence = (n: PMNode, side: -1 | 1) => {
      const text = n.isText ? n.text! : '';
      const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
      const ticks = '`'.repeat(longest + 1), pad = longest || /^ [^]*[^ ][^]* $/.test(text) ? ' ' : '';
      return side < 0 ? ticks + pad : pad + ticks;
    };
    return {
      markdown: {
        serialize: {
          open: (_st: unknown, _m: unknown, parent: PMNode, i: number) => fence(parent.child(i), -1),
          close: (_st: unknown, _m: unknown, parent: PMNode, i: number) => fence(parent.child(i - 1), 1),
          escape: false,
        },
        parse: {},
      },
    };
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), new Plugin({
      key: new PluginKey('codeNotCarried'),
      appendTransaction: (trs, _old, state) => {
        const code = state.schema.marks.code, stored = state.storedMarks, $cur = (state.selection as TextSelection).$cursor;
        if (!stored || !$cur || !trs.some((tr) => tr.docChanged) || !code.isInSet(stored) || code.isInSet($cur.marks())) return null;
        return state.tr.setStoredMarks(code.removeFromSet(stored));
      },
    })];
  },
});

// TipTap runs the markdown rules on Enter too, as if a newline had been typed: "-", "1.", "#" or ">" alone on
// a line and then Enter made a list, heading or toggle instead of a new line. The rules here and below take
// a typed space only (any whitespace but a newline).
const BulletOnTypedSpace = BulletList.extend({
  addStorage: bulletsMarkdown,
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*([-+*])[^\S\n]$/, type: this.type })];
  },
});

// a heading is one line in markdown: a line break in it goes out as `<br>` (as in a table cell), not as the
// usual backslash and newline, which read back as a heading ending in "\" and a paragraph under it
// (six, as markdown has: a note brought in with ###### lost the heading at its first save)
const OneLineHeading = Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }).extend({
  // ⌫ at the start of a heading makes it text, where it is (Notion's); the next ⌫ joins it to the line above.
  // Not the title, which is the note's name whatever it is written as
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || $from.parent.type !== this.type) return false;
        if ($from.depth === 1 && $from.index(0) === 0) return false;
        return this.editor.commands.setNode('paragraph');
      },
    };
  },
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
});

const QuoteJoiningLines = Blockquote.extend({
  // ⌫ at the start of a quote's second (or later) line joins it to the line above, as a callout's and a toggle's
  // do; the stock key lifted the line out and cut the quote in two
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0 || $from.depth < 2 || $from.node(-1).type !== this.type || $from.index(-1) === 0) return false;
        // a list just above: the line's words go on the end of its last line, as in a callout or a toggle. The stock
        // join put the line back into the list as a bullet, which the next ⌫ made text again, round and round
        const above = $from.node(-1).child($from.index(-1) - 1);
        if (/List$/.test(above.type.name) && $from.parent.type.name === 'paragraph') {
          const into = Selection.findFrom(state.doc.resolve($from.before()), -1, true);
          if (into?.$from.parent.inlineContent && !into.$from.parent.type.spec.code) {
            const tr = state.tr.delete($from.before(), $from.after()).insert(into.from, $from.parent.content);
            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, into.from)).scrollIntoView());
            return true;
          }
        }
        return this.editor.commands.joinBackward();
      },
    };
  },
  addInputRules() {
    // "| " as before, and '" ' as Notion makes one (a Mac may have curled it already)
    return [wrappingInputRule({ find: /^\s*[|"“][^\S\n]$/, type: this.type })];
  },
});

export function createEditor(opts: {
  element: HTMLElement;
  content: string;
  onUpdate: (markdown: string) => void;
  onOpenNote: (title: string) => void;
  targets: () => readonly Note[];
  suggestionUI: SuggestionUI;
  calendarUI: CalendarUI;
  emojiUI: EmojiUI;
  cursor?: number;
  onNoteMove?: (dir: -1 | 1, onTitle: boolean) => boolean;
  page?: () => string | null;
}) {
  const WIKI_MENU = new PluginKey('wikiLinkSuggest'), DATE_MENU = new PluginKey('dateMention'), SLASH_MENU = new PluginKey('slashMenu'), PAGE_MENU = new PluginKey('pageMenu');
  // the state being made has a menu's say only once that menu's plugin has run on it, and tiptap runs them in no
  // order to count on; until then, the say it had before this keystroke
  const menuOpen = (ed: Editor, state: EditorState, ...menus: PluginKey[]) =>
    menus.some((k) => (k.getState(state) ?? k.getState(ed.state))?.active);
  const pageOf = (link: string) => notes.byTitle(splitLink(link, (t) => !!notes.byTitle(t))[0]);
  const iconOf = (link: string) => pageOf(link)?.icon ?? '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; dropEdit(flush); };
  const flush = () => { if (timer === undefined) return; cancel(); opts.onUpdate(getMarkdown(editor)); };
  let closing = false;
  function handOverWhenIdle(ed: Editor) {
    if (closing || ed.state.doc.content.size < DEBOUNCE_FROM_SIZE) { cancel(); opts.onUpdate(getMarkdown(ed)); return; }
    clearTimeout(timer);
    timer = setTimeout(flush, 150);
    holdEdit(flush);
  }
  const editor: Editor = new Editor({
    element: opts.element,
    autofocus: false,
    // text pasted is read as markdown already; bold's and italic's own rules read it again, looser than markdown
    // does, and "x * y * z" came out with "y" in italics
    enablePasteRules: ['link', 'code', 'strike', 'highlight'],
    content: opts.content,
    editorProps: {
      attributes: { class: 'prose' },
      ...(isMobile ? { scrollMargin: PHONE_BAR_MARGIN, scrollThreshold: PHONE_BAR_MARGIN } : { scrollMargin: MAC_TOOLBAR_MARGIN, scrollThreshold: MAC_TOOLBAR_MARGIN }),
      clipboardTextSerializer: (slice, view) => copyText(slice, view, copySerializer((editor.storage as any).markdown.serializer)),
      transformPasted: (slice, view) => {
        if (view.state.selection.$from.parent.type.name === 'detailsSummary') return pasteInToggleTitle(view, slice.content, (editor.storage as any).markdown.serializer);
        const fitted = rowsAsTable(view, slice.content) ?? pasteInCell(view, slice.content);
        if (fitted) return fitted;
        const body = unwrapToggleBody(slice);
        return wordsOnly(body) ?? linesIntoList(view, body) ?? body;
      },
      handlePaste: (view, event, slice): boolean => {
        if (insertFiles(editor, event.clipboardData?.files)) return true;
        const tr = view.state.tr;
        clearForPaste(tr);
        const pasted = event.clipboardData?.getData('text/plain') ?? '';
        const clip: Clip = { pasted, text: pasted.trim(), html: event.clipboardData?.getData('text/html') ?? '', vscode: event.clipboardData?.getData('vscode-editor-data') };
        const ours = pasteIntoCode(tr, clip) || linkSelection(tr, clip) || pasteVsCode(editor, view, tr, clip) || pasteIntoOneLine(tr, clip)
          || pasteNotion(editor, view, tr, clip) || pasteMarkdownText(editor, view, tr, clip) || pastePlainLines(editor, view, tr, clip);
        if (!ours) {
          outOfEmptyItem(tr, slice.content.firstChild);
          if (!tr.docChanged) return false;
          tr.replaceSelection(slice).setMeta('uiEvent', 'paste');
        }
        view.dispatch(tr.setMeta('paste', true).scrollIntoView());
        return true;
      },
      // links open in the browser: the editor's own webview must not navigate away from the app
      handleDOMEvents: {
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
        contextmenu: (_view, event) => {
          if (isMobile) return false;
          event.preventDefault(); noteMenu(editor, event as MouseEvent); return true;
        },
        click: (view, event) => {
          if (event.target === view.dom && clickBelow(view, event as MouseEvent)) return true;
          const a = (event.target as HTMLElement | null)?.closest?.('a[href]');
          if (!a || a.closest('.bookmark')) return false;
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
      spellingHelp,
      StarterKit.configure({
        paragraph: false,
        orderedList: false,
        listItem: false,
        heading: false,
        link: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
        text: false,
        code: false,
        bulletList: false,
      }),
      DollarSafeText,
      markExit,
      codeEdges,
      ImeGate,
      hangulKeys,
      LinkEndsAtItsWords,
      CodeInsideLinks,
      BulletOnTypedSpace,
      OneLineHeading,
      MathInline,
      MathBlock,
      QuoteJoiningLines,
      ...Toggle,
      // An image pasted onto an empty list item takes that line. Stock list items are `paragraph block*`, so
      // the image could only go *after* the item's paragraph and the empty line stayed above it.
      BlankLine,
      KeepSpaces,
      CodeBlock,
      Pdf,
      Video,
      ...TableNodes,
      Divider,
      Find,
      ListItemLead,
      NumberedList,
      ListSwitch,
      SelectionLayer,
      ClickTarget,
      ...(isMobile ? [] : [BlockHandle.configure({ run: (id) => runEditorCommand(editor, id) })]),
      ...(isMobile ? [] : [TableHandles]),
      NoRawNewlines,
      PaintSelection,
      Extension.create({
        name: 'moveFlash',
        addProseMirrorPlugins: () => [new Plugin({
          key: FLASH,
          state: {
            init: () => DecorationSet.empty,
            apply: (tr, set) => tr.getMeta(FLASH) ?? set.map(tr.mapping, tr.doc),
          },
          props: { decorations: heldWhileComposing((state) => FLASH.getState(state)) },
        })],
      }),
      SelectMediaBeforeDelete,
      Extension.create({
        name: 'tableKeys',
        priority: 1000,
        addKeyboardShortcuts() {
          const free = () => !suggestionVisible(this.editor);
          return {
            Enter: () => free() && cellEnter(this.editor.view, () => this.editor.commands.setHardBreak()),
            ArrowUp: () => free() && upAboveTable(this.editor.view),
            Backspace: () => cellUnbullet(this.editor.view) || dropEmptyTable(this.editor.view),
          };
        },
        addInputRules() {
          return [new InputRule({ find: /[-+*][^\S\n]$/, handler: ({ state, range }) => (cellBulletRule(state.tr, range.from, range.to) ? undefined : null) })];
        },
      }),
      Extension.create({
        name: 'undoShortcut',
        priority: 1000,
        addKeyboardShortcuts() {
          return { 'Mod-z': () => this.editor.commands.undoInputRule() };
        },
      }),
      JoinNextItem,
      LineIndent,
      JoinLists,
      TaskList.extend({ addStorage: bulletsMarkdown }),
      ListMarkdown,
      ToDoItem,
      Placeholder.configure({ placeholder: ({ node, pos }) => (pos === 0 ? 'Untitled' : node.type.name === 'heading' ? `Heading ${node.attrs.level}` : isMobile ? 'Start writing…' : 'Start typing… # heading, - list, [[ link') }),
      // …and an empty block the caret is in says what it is, as Notion's do (an empty heading was a blank 29px line).
      // Its own small plugin: the stock one's includeChildren put its marks on every block, and a copy took them
      Extension.create({
        name: 'blockHint',
        addProseMirrorPlugins: () => [new Plugin({
          props: {
            decorations: lineAttributes((state) => {
              const { $from, empty } = state.selection;
              const line = $from.parent;
              if (!empty || !line.isTextblock || line.content.size || $from.depth < 2) return null;
              const around = $from.node(-1).type.name;
              const says = line.type.name === 'heading' ? `Heading ${line.attrs.level}` : line.type.name === 'detailsSummary' ? 'Toggle'
                : around === 'taskItem' ? 'To-do' : around === 'listItem' ? 'List' : around === 'blockquote' ? 'Empty quote' : '';
              if (!says) return null;
              return { from: $from.before(), to: $from.after(), attrs: { class: 'is-empty', 'data-placeholder': says } };
            }),
          },
        })],
      }),
      Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true, linkify: true, breaks: false }),
      Extension.create({ name: 'wikiTyped', priority: 1000, addProseMirrorPlugins: () => [wikiTyped] }),
      WikiLink.configure({
        onOpen: opts.onOpenNote,
        iconOf,
        exists: (t) => !!pageOf(t),
        watchTitles: (check) => notes.onTitles(check),
        suggestion: {
          char: PICKERS.wiki.char,
          allowSpaces: true,
          startOfLine: false,
          allowedPrefixes: null,
          pluginKey: WIKI_MENU,
          allow: ({ state, range }) => WIKI_AT.getState(state) === range.from,
          items: ({ query }) => wikiItems(query, opts.targets(), editor.state.doc.firstChild?.textContent.trim()),
          command: ({ editor, range, props }) =>
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: 'wikiLink', attrs: { title: (props as SuggestItem).value ?? (props as SuggestItem).label } }, { type: 'text', text: ' ' }])
              .run(),
          render: () => popup(opts.suggestionUI, PICKERS.wiki),
        },
      }),
      DateMention.configure({
        onChip: chipMenu,
        suggestion: {
          char: PICKERS.date.char,
          allowSpaces: true,
          pluginKey: DATE_MENU,
          allow: ({ editor, state, range }) => !menuOpen(editor, state, WIKI_MENU, SLASH_MENU, PAGE_MENU) && atNamesADay(state, range),
          items: ({ query }) => remindChoices(query) ?? dayChoices(query),
          command: ({ editor, range, props }) => {
            const { value, remind } = props as { value: string; remind?: boolean };
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([{ type: 'dateMention', attrs: { date: value, ...(remind ? { remind: true, time: remindTime(value) } : {}) } }, { type: 'text', text: ' ' }])
              .run();
            if (remind) void askNotify();
          },
          render: () => calendar(opts.calendarUI),
        },
      }),
      Callout,
      CalloutEdges,
      Highlight,
      ...Html,
      Extension.create({
        name: 'singleTilde',
        addInputRules() {
          return [markInputRule({ find: /(?:^|\s)(~(?![\s~])([^~]+?)(?<![\s~])~)$/, type: this.editor.schema.marks.strike })];
        },
      }),
      Extension.create({
        name: 'arrows',
        addInputRules: () => [
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
      opts.page ? DatabaseBlock.configure({ hostNoteId: opts.page }) : DatabaseBlock,
      FootnoteRef,
      FootnoteText,
      Extension.create({
        name: 'slashMenu',
        addProseMirrorPlugins() {
          return [
            slashTyped,
            Suggestion({
              editor: this.editor,
              char: PICKERS.slash.char,
              pluginKey: SLASH_MENU,
              allowSpaces: false,
              allow: ({ state, range }) => {
                if (SLASH_AT.getState(state) !== range.from) return false;
                const $at = state.doc.resolve(range.from);
                if ($at.parent.type.spec.code) return false;
                if ($at.parent.type.name === 'detailsSummary') return false;
                const before = $at.parent.textBetween(Math.max(0, $at.parentOffset - 1), $at.parentOffset, undefined, '\ufffc');
                return !before || /\s/.test(before);
              },
              items: ({ query }) => slashItems(query),
              command: ({ editor, range, props }) => {
                editor.chain().focus().deleteRange(range).run();
                (props as SuggestItem).run?.(editor);
              },
              render: () => popup(opts.suggestionUI, PICKERS.slash),
            }),
          ];
        },
      }),
      Extension.create({
        name: 'pageMenu',
        addProseMirrorPlugins() {
          return [
            pageTyped,
            Suggestion({
              editor: this.editor,
              char: PICKERS.page.char,
              pluginKey: PAGE_MENU,
              allowSpaces: true,
              allow: ({ editor, state, range }) => {
                if (PAGE_AT.getState(state) !== range.from) return false;
                const $at = state.doc.resolve(range.from);
                if ($at.parent.type.spec.code || $at.parent.type.name === 'detailsSummary') return false;
                if (/^\s/.test(state.doc.textBetween(range.from + 1, Math.max(range.from + 1, range.to)))) return false;
                return !menuOpen(editor, state, WIKI_MENU, DATE_MENU, SLASH_MENU);
              },
              items: ({ query }) => pageItems(query, opts.targets(), editor.state.doc.firstChild?.textContent.trim() ?? ''),
              command: ({ editor, range, props }) => {
                const item = props as SuggestItem;
                editor.chain().focus().deleteRange(range).run();
                if (item.run) item.run(editor);
                else editor.chain().focus().insertContent([{ type: 'wikiLink', attrs: { title: item.label } }, { type: 'text', text: ' ' }]).run();
              },
              render: () => popup(opts.suggestionUI, PICKERS.page),
            }),
          ];
        },
      }),
      Extension.create({
        name: 'emojiSuggest',
        addProseMirrorPlugins() {
          return [
            Suggestion({
              editor: this.editor,
              char: PICKERS.emoji.char,
              pluginKey: new PluginKey('emojiSuggest'),
              allowSpaces: false,
              allow: ({ editor, state, range }) => !state.doc.resolve(range.from).parent.type.spec.code && !menuOpen(editor, state, WIKI_MENU, DATE_MENU, SLASH_MENU, PAGE_MENU),
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
    onUpdate: ({ editor }) => handOverWhenIdle(editor),
  });
  // TipTap takes its stylesheet out of the page as its last editor goes and puts it back with the next one: the whole
  // page's style was worked out afresh both times, the list's included, and with 800 notes that was most of opening a
  // note (~150 ms in WebKit). Let go of it here and it stays.
  (editor as unknown as { css: HTMLStyleElement | null }).css = null;
  markStartsAfterPrefix(editor);
  editor.on('blur', flush);
  editor.on('destroy', () => { closing = true; flush(); });
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
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== editor.view.dom && editor.view.dom.contains(a)) requestAnimationFrame(() => a.scrollIntoView({ block: 'center', inline: 'nearest' }));
    };
    window.addEventListener('resize', onResize);
    editor.on('destroy', () => window.removeEventListener('resize', onResize));
  }
  if (import.meta.env.DEV) (window as any).__eve = editor;
  return editor;
}
