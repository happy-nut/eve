// The three popups typed into a note — `/` blocks, `[[` links, `@` dates — and the `/` menu's items.
import type { Editor } from '@tiptap/core';
import { insertKanban } from './kanban';
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
  {
    label: 'Diagram', hint: 'Mermaid: flowchart, sequence…', icon: ICONS.diagram,
    run: (e) => e.chain().focus().insertContent({ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A' }] }).run(),
  },
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
