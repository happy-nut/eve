// The three popups typed into a note — `/` blocks, `[[` links, `@` dates — and the `/` menu's items.
import type { Editor } from '@tiptap/core';
import { insertKanban } from './kanban';
import { insertDiagram } from './code';
import { insertMath } from './math';
import { ui } from './ui.svelte';
import { notes, titleOf } from './notes.svelte';
import { isCustom } from './icons';
import { pickImage, pickVideo } from './platform';
import { hints } from './hints.svelte';
import type { EmojiEntry } from './emoji';

export interface SuggestItem {
  label: string; value?: string; hint?: string; icon?: string; noteIcon?: string;
  /** the sections inside this one, for a page the picker can be opened into */
  sections?: SuggestItem[];
  run?: (editor: Editor) => void;
}
export interface SuggestionUI {
  show(items: SuggestItem[], rect: DOMRect | null, pick: (item: SuggestItem) => void): void;
  move(delta: number): void;
  select(): boolean;
  /** open / fold the page under the cursor. False = nothing to do, so the key stays the editor's */
  expand(): boolean;
  collapse(): boolean;
  hide(): void;
  visible(): boolean;
}

/** The `@` calendar, driven the same way but by one day rather than a list of items. */
export interface CalendarUI {
  show(day: string | null, rect: DOMRect | null, pick: (iso: string) => void): void;
  move(days: number): void;
  month(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
}

/** The `:smile` emoji row: one line of the best few, driven like the others. */
export interface EmojiUI {
  show(items: EmojiEntry[], rect: DOMRect | null, pick: (e: EmojiEntry) => void): void;
  move(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
}

/** `:` wiring: the row runs sideways, so ←→ choose; ↑↓ are the editor's (the caret leaves, the row goes). */
export function emojiRow(uiRef: EmojiUI) {
  const open = (p: any) => uiRef.show(p.items, p.clientRect?.() ?? null, (e: EmojiEntry) => p.command(e));
  return {
    onStart: open,
    onUpdate: open,
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!uiRef.visible()) return false;
      if (event.key === 'ArrowLeft') return (uiRef.move(-1), true);
      if (event.key === 'ArrowRight') return (uiRef.move(1), true);
      if (event.key === 'Enter' || event.key === 'Tab') return uiRef.select();
      if (event.key === 'Escape') return (uiRef.hide(), true);
      return false;
    },
    onExit: () => uiRef.hide(),
  };
}

/**
 * `@` wiring: the popup is a month, so the arrows walk days and weeks instead of a list. A query that
 * matches no day at all (`@sarah`) closes it, which is how typing past a date gets out of the way.
 */
export function calendar(uiRef: CalendarUI) {
  const day = (p: any) => (p.items as { iso: string }[])[0]?.iso ?? null;
  const open = (p: any) => uiRef.show(day(p), p.clientRect?.() ?? null, (iso: string) => p.command({ value: iso }));
  return {
    onStart: open,
    onUpdate: open,
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!uiRef.visible()) return false;
      if (event.key === 'ArrowLeft') return (uiRef.move(-1), true);
      if (event.key === 'ArrowRight') return (uiRef.move(1), true);
      if (event.key === 'ArrowUp') return (uiRef.move(-7), true);
      if (event.key === 'ArrowDown') return (uiRef.move(7), true);
      if (event.key === 'PageUp') return (uiRef.month(-1), true);
      if (event.key === 'PageDown') return (uiRef.month(1), true);
      if (event.key === 'Enter' || event.key === 'Tab') return uiRef.select();
      if (event.key === 'Escape') return (uiRef.hide(), true);
      return false;
    },
    onExit: () => uiRef.hide(),
  };
}

/** Shared suggestion popup wiring for [[ and / menus. */
export function popup(uiRef: SuggestionUI) {
  return {
    onStart: (p: any) => uiRef.show(p.items, p.clientRect?.() ?? null, (i: SuggestItem) => p.command(i)),
    onUpdate: (p: any) => uiRef.show(p.items, p.clientRect?.() ?? null, (i: SuggestItem) => p.command(i)),
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (!uiRef.visible()) return false;
      if (event.key === 'ArrowDown') return (uiRef.move(1), true);
      if (event.key === 'ArrowUp') return (uiRef.move(-1), true);
      // → opens the highlighted page into its sections, ← folds it back; when there is nothing to
      // open the key falls through and moves the caret, as it always did
      if (event.key === 'ArrowRight') return uiRef.expand();
      if (event.key === 'ArrowLeft') return uiRef.collapse();
      if (event.key === 'Enter' || event.key === 'Tab') return uiRef.select();
      if (event.key === 'Escape') return (uiRef.hide(), true);
      return false;
    },
    onExit: () => uiRef.hide(),
  };
}

/** 16x16 line icons for the menu, drawn in the sidebar's stroke style. */
export const ICONS = {
  page: '<path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5"/><path d="M6.2 10h3.6M8 8.2v3.6"/>',
  note: '<path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5"/><path d="M5.9 8.6h4.2M5.9 11h4.2"/>',
  callout: '<circle cx="8" cy="6.6" r="4"/><path d="M6.3 11.6h3.4M6.9 13.6h2.2"/>',
  toggle: '<path d="M5.5 4.5 10 8l-4.5 3.5z"/>',
  kanban: '<rect x="2.5" y="3.5" width="3.2" height="9" rx="1"/><rect x="6.4" y="3.5" width="3.2" height="6" rx="1"/><rect x="10.3" y="3.5" width="3.2" height="7.6" rx="1"/>',
  image: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><circle cx="6" cy="6.8" r="1"/><path d="M3.2 11.8 6.4 8.7l2.3 2.1 2.1-2 2.5 2.8"/>',
  video: '<rect x="1.5" y="3.5" width="9" height="9" rx="1.5"/><path d="M10.5 7.4l4-2.2v5.6l-4-2.2z"/>',
  wikiLink: '<path d="M6.4 3.5H4.3v9h2.1M11.7 3.5H9.6v9h2.1"/>',
  diagram: '<rect x="1.5" y="2.5" width="5" height="4" rx="1"/><rect x="9.5" y="9.5" width="5" height="4" rx="1"/><path d="M4 6.5v5h5.5"/>',
  sequence: '<rect x="1.5" y="2" width="4.5" height="3" rx="1"/><rect x="10" y="2" width="4.5" height="3" rx="1"/><path d="M3.75 5v9M12.25 5v9M3.75 8.5h7.5M9.5 7l1.75 1.5L9.5 10"/>',
  pie: '<circle cx="8" cy="8" r="5.8"/><path d="M8 8V2.2A5.8 5.8 0 0 1 13.6 9.4z"/>',
  mindmap: '<circle cx="8" cy="8" r="2"/><path d="M6.3 7 3.6 4.6M9.7 7l2.7-2.4M6.3 9l-2.7 2.4M9.7 9l2.7 2.4"/><circle cx="2.8" cy="3.9" r="1.2"/><circle cx="13.2" cy="3.9" r="1.2"/><circle cx="2.8" cy="12.1" r="1.2"/><circle cx="13.2" cy="12.1" r="1.2"/>',
  timeline: '<path d="M1.5 8h13"/><circle cx="4" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="12" cy="8" r="1.6"/><path d="M4 4.5v1.5M12 4.5v1.5M8 10v1.5"/>',
  gantt: '<path d="M2 2v12h12"/><rect x="4" y="3.5" width="5" height="2" rx="1"/><rect x="7" y="7" width="5" height="2" rx="1"/><rect x="9.5" y="10.5" width="4" height="2" rx="1"/>',
  math: '<path d="M2.5 8.5h1.6l1.7 4L9 3.5h4.5"/><path d="M9.8 8.3l3 3.4M12.8 8.3l-3 3.4"/>',
  mathInline: '<path d="M4.5 3.5c-1 0-1.5.6-1.5 1.5v1.5c0 .8-.5 1.5-1.2 1.5.7 0 1.2.7 1.2 1.5V11c0 .9.5 1.5 1.5 1.5M11.5 3.5c1 0 1.5.6 1.5 1.5v1.5c0 .8.5 1.5 1.2 1.5-.7 0-1.2.7-1.2 1.5V11c0 .9-.5 1.5-1.5 1.5"/><path d="M6.2 6.2l3.6 3.6M9.8 6.2l-3.6 3.6"/>',
  table: '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M2.5 6.6h11M6.5 6.6v5.9M10 6.6v5.9"/>',
  section: '<path d="M6.4 2.9 4.8 13.1M11.2 2.9 9.6 13.1M3.3 6.1h9.4M2.8 9.9h9.4"/>',
  emoji: '<circle cx="8" cy="8" r="6"/><path d="M5.8 9.4c.6.9 1.3 1.4 2.2 1.4s1.6-.5 2.2-1.4"/><path d="M6.3 6.4h.01M9.7 6.4h.01"/>',
};

/** The "/" block menu, Notion-style. ``` and --- still make a code block / divider as you type. */
/** a "/" item that a key also inserts: after it runs, say which key */
const tip = (id: string, run: NonNullable<SuggestItem['run']>): SuggestItem['run'] => (e) => { run(e); hints.action(id); };

export const SLASH: SuggestItem[] = [
  { label: 'New page', hint: '📄 하위 페이지', icon: ICONS.page, run: newPage },
  { label: 'Callout', hint: '💡 highlighted box', icon: ICONS.callout, run: tip('callout', (e) => e.chain().focus().toggleWrap('callout').run()) },
  { label: 'Toggle', hint: '> folds its content', icon: ICONS.toggle, run: (e) => e.chain().focus().setDetails().updateAttributes('details', { open: true }).run() },
  { label: 'Kanban', hint: '칸반 board', icon: ICONS.kanban, run: insertKanban },
  { label: 'Flowchart', hint: 'Diagram: boxes and arrows', icon: ICONS.diagram, run: (e) => insertDiagram(e, 'flowchart') },
  { label: 'Sequence diagram', hint: 'Diagram: who says what, in order', icon: ICONS.sequence, run: (e) => insertDiagram(e, 'sequence') },
  { label: 'Pie chart', hint: 'Diagram: parts of a whole', icon: ICONS.pie, run: (e) => insertDiagram(e, 'pie') },
  { label: 'Mind map', hint: 'Diagram: ideas branching out', icon: ICONS.mindmap, run: (e) => insertDiagram(e, 'mindmap') },
  { label: 'Timeline', hint: 'Diagram: what happened when', icon: ICONS.timeline, run: (e) => insertDiagram(e, 'timeline') },
  { label: 'Gantt chart', hint: 'Diagram: tasks on a calendar', icon: ICONS.gantt, run: (e) => insertDiagram(e, 'gantt') },
  { label: 'Equation', hint: '∑ formula, its own line ($$)', icon: ICONS.math, run: (e) => insertMath(e, true) },
  { label: 'Inline equation', hint: 'x² formula, in the line ($)', icon: ICONS.mathInline, run: (e) => insertMath(e, false) },
  { label: 'Table', hint: '3×3, with a header row', icon: ICONS.table, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: 'Image', hint: 'Pick a file', icon: ICONS.image, run: tip('image', (e) => { pickImage().then((src) => src && e.chain().focus().setImage({ src }).run()); }) },
  { label: 'Video', hint: 'Pick a file', icon: ICONS.video, run: (e) => { pickVideo().then((src) => src && e.chain().focus().insertContent({ type: 'video', attrs: { src, name: src.split('/').pop() } }).run()); } },
  { label: 'Link to note', hint: '[[ another note', icon: ICONS.wikiLink, run: tip('wikiLink', (e) => e.chain().focus().insertContent('[[').run()) },
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
