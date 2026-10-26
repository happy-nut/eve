// The popups typed into a note — `/` blocks, `[[` links, `@` dates, `:` emoji — and the `/` menu's items.
import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import { insertKanban } from './kanban';
import { insertDatabase } from './databaseNode';
import { insertFootnote } from './footnote';
import { insertDiagram } from './code';
import { swimlaneStarter } from './diagram';
import { insertMath } from './math';
import { insertImage } from './image';
import { ui } from './ui.svelte';
import { notes, titleOf } from './notes.svelte';
import { isCustom } from './icons';
import { pickImage, pickVideo } from './platform';
import { hints } from './hints.svelte';
import type { EmojiEntry } from './emoji';
import { runEditorCommand } from './editor';
import { composing } from './keys';
import { typedIn } from './hangul';
import { appearance } from './appearance.svelte';
import { isPen, penName } from './highlight';
import { COLORS, colorText } from './textColor';

export interface SuggestItem {
  label: string; value?: string; hint?: string; icon?: string; noteIcon?: string;
  /** more words the / menu finds it by, not shown (하위 페이지 for New page: Korean is searched in as often) */
  keywords?: string;
  /** the sections inside this one, for a page the picker can be opened into */
  sections?: SuggestItem[];
  /** a row that only opens into its sections (the / menu's Heading, Diagram): ↩ or a click opens it, picks nothing */
  folder?: boolean;
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
  /** put it at the caret again, as it is (the note scrolled under it) */
  place?(rect: DOMRect): void;
  /** the pointer chose a row since it was last shown */
  chosen?(): boolean;
}

/** The `@` calendar, driven the same way but by one day rather than a list of items. */
export interface CalendarUI {
  /** `remind`: the time a reminder picked here rings at ("09:00"), said under the month; '' for a plain day */
  show(day: string | null, rect: DOMRect | null, pick: (iso: string) => void, remind?: string): void;
  move(days: number): void;
  month(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
  place?(rect: DOMRect): void;
}

/** The `:smile` emoji row: one line of the best few, driven like the others. */
export interface EmojiUI {
  show(items: EmojiEntry[], rect: DOMRect | null, pick: (e: EmojiEntry) => void): void;
  move(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
  place?(rect: DOMRect): void;
  /** the pointer chose one since it was last shown */
  chosen?(): boolean;
}

/** the popups at the caret, as drawn (Suggest, DateMenu, EmojiRow) */
const POPUPS = '.suggest, .cal, .emoji-row';

/**
 * A popup at the caret that stays with it. It stayed where it was drawn while the note scrolled under it, over
 * other lines and pointing at nothing, and it stayed up when the note lost the keyboard (a click in the list), where
 * Enter in the list then still picked from it. Now it follows the caret as the note scrolls, goes away while the caret
 * is scrolled out of sight, and goes away when the note loses the keyboard; the next key typed there brings it back.
 * A press inside the popup itself keeps the keyboard in the note (its buttons act on mousedown), so it is not a blur.
 */
function stayAtCaret(ui: { hide(): void; visible(): boolean; place?(rect: DOMRect): void }) {
  let last: any = null;
  const onScroll = (e: Event) => {
    if (!last || !ui.visible() || (e.target instanceof Element && e.target.closest(POPUPS))) return; // its own list scrolling
    const r: DOMRect | null = last.clientRect?.() ?? null;
    if (!r) return;
    const box = scrollBox(last.editor.view.dom);
    if (r.bottom < box.top || r.top > box.bottom) ui.hide();
    else ui.place?.(r);
  };
  const onBlur = ({ event }: { event: FocusEvent }) => {
    if (event.relatedTarget instanceof Element && event.relatedTarget.closest(POPUPS)) return;
    ui.hide();
  };
  return {
    start(p: any) {
      if (last) this.stop();
      last = p;
      window.addEventListener('scroll', onScroll, true);
      p.editor.on('blur', onBlur);
    },
    update(p: any) { last = p; },
    stop() {
      window.removeEventListener('scroll', onScroll, true);
      last?.editor.off('blur', onBlur);
      last = null;
    },
  };
}

/** the part of the window `el` is seen through: its nearest scrolling ancestor, or the window */
function scrollBox(el: Element): { top: number; bottom: number } {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) {
      const r = p.getBoundingClientRect();
      return { top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom) };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

/** How a popup at the caret takes its keys (suggestKeys). */
export interface PickerKeys {
  /**
   * Which arrows walk it. 'vertical': ↑↓ a list, and ←→ open and fold a page's sections where it has them (with
   * nothing to open the key falls through and moves the caret, as it always did). 'horizontal': ←→ a row, ↑↓ stay
   * the editor's (the caret leaves, the row goes). 'grid': a month of days, ←→ a day, ↑↓ a week, PageUp/PageDown a
   * month.
   */
  axis: 'vertical' | 'horizontal' | 'grid';
  /**
   * Whether ↩ and ⇥ pick the highlighted one as the popup stands: 'always'; 'afterNavigate', once the arrows or the
   * pointer chose one; or asked of the popup as it is drawn (its query, its items, where it was typed), again at each
   * letter. Until they do, they put the popup away and are the editor's keys again (a new line, an indent).
   */
  confirm: 'always' | 'afterNavigate' | ((p: any) => boolean);
  /** ⇥ picks whatever is under the cursor all the same (only ↩ is a key the line wants for itself) */
  tabPicks?: boolean;
}
/** what suggestKeys drives: SuggestionUI, CalendarUI, EmojiUI */
interface Driven {
  move(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
  chosen?(): boolean;
  expand?(): boolean;
  collapse?(): boolean;
  month?(delta: number): void;
}

/**
 * The one way a popup at the caret takes its keys. There were three copies of this, one per popup, each with its own
 * idea of when ↩ picks: a fix to one (↩ after "a /" in a sentence made a new page) was missing from the others for
 * a while ("items :ok" ↩ put 🆗 in place of the words). `shown` is told each time the popup is drawn.
 */
export function suggestKeys(uiRef: Driven, k: PickerKeys) {
  let sure = k.confirm === 'always';
  const nav = (run: () => void) => (run(), (sure = true));
  return {
    shown(p: any) { sure = k.confirm === 'always' || (k.confirm !== 'afterNavigate' && k.confirm(p)); },
    onKeyDown: ({ event: e }: { event: KeyboardEvent }): boolean => {
      // (the Enter that ends a Korean word is the word's, not a pick)
      if (!uiRef.visible() || composing(e)) return false;
      const key = e.key;
      if (k.axis === 'vertical') {
        if (key === 'ArrowDown') return nav(() => uiRef.move(1));
        if (key === 'ArrowUp') return nav(() => uiRef.move(-1));
        if (key === 'ArrowRight') return uiRef.expand?.() ?? false;
        if (key === 'ArrowLeft') return uiRef.collapse?.() ?? false;
      } else {
        if (key === 'ArrowLeft') return nav(() => uiRef.move(-1));
        if (key === 'ArrowRight') return nav(() => uiRef.move(1));
      }
      if (k.axis === 'grid') {
        if (key === 'ArrowUp') return nav(() => uiRef.move(-7));
        if (key === 'ArrowDown') return nav(() => uiRef.move(7));
        if (key === 'PageUp') return nav(() => uiRef.month?.(-1));
        if (key === 'PageDown') return nav(() => uiRef.month?.(1));
      }
      if (key === 'Enter' || key === 'Tab') {
        if (!sure && !uiRef.chosen?.() && !(key === 'Tab' && k.tabPicks)) return (uiRef.hide(), false);
        return uiRef.select();
      }
      if (key === 'Escape') return (uiRef.hide(), true);
      return false;
    },
  };
}

/**
 * The popups each editor has up, for `suggestionVisible`: told by the popups themselves as they open, so a new one
 * is never left out of it (the editor's keys that a popup wants for its own list asked a list of them, by hand).
 */
const popupsOf = new WeakMap<Editor, Set<{ visible(): boolean }>>();
/** A popup at the caret is up in this editor: ↩, ⇥, ↑ and the app's shortcuts are its keys, not the note's. Per
 *  editor: the note and an open card page each have their own, and the note asking the closed card's popups left
 *  Esc hiding the window rather than closing the calendar. */
export function suggestionVisible(editor: Editor): boolean {
  for (const u of popupsOf.get(editor) ?? []) if (u.visible()) return true;
  return false;
}

/** a popup's life at the caret: it follows the caret, takes its keys as `keys` says, and is drawn by `show` */
function atCaret(uiRef: Driven & { place?(rect: DOMRect): void }, keys: PickerKeys, show: (p: any) => void) {
  const follow = stayAtCaret(uiRef);
  const k = suggestKeys(uiRef, keys);
  const open = (p: any) => { k.shown(p); show(p); };
  return {
    onStart: (p: any) => {
      const set = popupsOf.get(p.editor) ?? new Set();
      popupsOf.set(p.editor, set.add(uiRef));
      follow.start(p);
      open(p);
    },
    onUpdate: (p: any) => { follow.update(p); open(p); },
    onKeyDown: k.onKeyDown,
    onExit: () => { follow.stop(); uiRef.hide(); },
  };
}

/**
 * Every popup typed into a note: what opens it, and how it takes its keys. A new one is added here, and to the
 * table in pickerKeys.dom.test.ts, which fails until it is.
 */
export const PICKERS = {
  // a "/" after words is mostly the sentence's own ("Root dir is /", "A / B"), and ↩ there made a new page and went to
  // it. There ↩ and ⇥ pick once a letter typed after it found something (or the arrows or the pointer chose a row);
  // a "/" opening its line is a block asked for, and ↩ takes the first.
  slash: {
    char: '/', axis: 'vertical',
    confirm: ({ editor, range, query, items }: any) => {
      const $at = editor.state.doc.resolve(range.from);
      return !$at.parent.textBetween(0, $at.parentOffset, undefined, '￼').trim() || (/\p{L}/u.test(query) && items.length > 0);
    },
  },
  // a title being typed: ↩ links the page it found, or a new one by that name
  wiki: { char: '[[', axis: 'vertical', confirm: 'always' },
  // Notion's "+": a new page under this one first, then pages to link. "+" is also a sum's or a list's ("1 + 2", "+1"):
  // ↩ picks once a letter is typed after it, or the arrows chose a row; "+ " (a space after it) never opens it
  page: { char: '+', axis: 'vertical', confirm: (p: any) => /\p{L}/u.test(p.query) && p.items.length > 0 },
  // the calendar comes up over the start of a name too ("ask @Tom" is "tomorrow" so far), and ↩ there put a date in
  // place of the name and ate the new line. It picks after a bare @, a day named in full (@today, @2026-09-24), or
  // once the arrows chose one; ⇥ picks whatever is under the cursor.
  date: {
    char: '@', axis: 'grid', tabPicks: true,
    confirm: (p: any) => !p.query || (p.items as { exact?: boolean }[]).some((d) => d.exact),
  },
  // the row comes up after any colon and two letters, and "items :ok" then ↩ put 🆗 in place of the words and ate the
  // new line. ↩ / ⇥ pick once ←→ or the pointer chose one; a click always does
  emoji: { char: ':', axis: 'horizontal', confirm: 'afterNavigate' },
} as const satisfies Record<string, PickerKeys & { char: string }>;
export type PickerId = keyof typeof PICKERS;

/** `:` wiring: the best few emoji in a row */
export function emojiRow(uiRef: EmojiUI) {
  return atCaret(uiRef, PICKERS.emoji, (p) => uiRef.show(p.items, p.clientRect?.() ?? null, (e: EmojiEntry) => p.command(e)));
}

/**
 * `@` wiring: the popup is a month, so the arrows walk days and weeks instead of a list. A query that
 * matches no day at all (`@sarah`) closes it, which is how typing past a date gets out of the way.
 */
export function calendar(uiRef: CalendarUI) {
  const first = (p: any) => (p.items as { iso: string; time?: string }[])[0];
  // `@remind`: the day picked is a reminder, at the time its first choice says (the calendar's day may be moved to
  // another, which rings at that one's time: 09:00, or the next hour today)
  return atCaret(uiRef, PICKERS.date, (p) => uiRef.show(first(p)?.iso ?? null, p.clientRect?.() ?? null,
    (iso: string) => p.command({ value: iso, remind: !!first(p)?.time }), first(p)?.time ?? ''));
}

/**
 * What "+" offers for `query`: a new page under this one by that name first, as Notion does, then the pages it
 * finds to link (not the page being written: a link to itself goes nowhere).
 */
export function pageItems(query: string, pages: readonly { body: string; icon?: string }[], self: string): SuggestItem[] {
  const q = query.trim().toLowerCase();
  const make: SuggestItem = { label: 'New page', hint: q ? `“${query.trim()}”, under this one` : 'under this one', icon: ICONS.page, run: (e) => newPage(e, query) };
  const found: SuggestItem[] = [];
  for (const n of pages) {
    const title = titleOf(n);
    if (title === self || !typedIn(title.toLowerCase(), q)) continue;
    found.push({ label: title, hint: 'link', ...(n.icon ? { noteIcon: n.icon } : { icon: ICONS.note }) });
    if (found.length === 7) break;
  }
  return [make, ...found];
}

/** The [[ and / menus' wiring: a list, its keys as `keys` says (PICKERS.wiki, PICKERS.slash). */
export function popup(uiRef: SuggestionUI, keys: PickerKeys = PICKERS.wiki) {
  return atCaret(uiRef, keys, (p) => uiRef.show(p.items, p.clientRect?.() ?? null, (i: SuggestItem) => p.command(i)));
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
  lanes: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 6.2h13M1.5 9.8h13M4.5 2.5v11"/><rect x="6.5" y="3.6" width="3" height="1.6" rx=".6"/><rect x="9.5" y="10.9" width="3" height="1.6" rx=".6"/>',
  sequence: '<rect x="1.5" y="2" width="4.5" height="3" rx="1"/><rect x="10" y="2" width="4.5" height="3" rx="1"/><path d="M3.75 5v9M12.25 5v9M3.75 8.5h7.5M9.5 7l1.75 1.5L9.5 10"/>',
  pie: '<circle cx="8" cy="8" r="5.8"/><path d="M8 8V2.2A5.8 5.8 0 0 1 13.6 9.4z"/>',
  mindmap: '<circle cx="8" cy="8" r="2"/><path d="M6.3 7 3.6 4.6M9.7 7l2.7-2.4M6.3 9l-2.7 2.4M9.7 9l2.7 2.4"/><circle cx="2.8" cy="3.9" r="1.2"/><circle cx="13.2" cy="3.9" r="1.2"/><circle cx="2.8" cy="12.1" r="1.2"/><circle cx="13.2" cy="12.1" r="1.2"/>',
  timeline: '<path d="M1.5 8h13"/><circle cx="4" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="12" cy="8" r="1.6"/><path d="M4 4.5v1.5M12 4.5v1.5M8 10v1.5"/>',
  gantt: '<path d="M2 2v12h12"/><rect x="4" y="3.5" width="5" height="2" rx="1"/><rect x="7" y="7" width="5" height="2" rx="1"/><rect x="9.5" y="10.5" width="4" height="2" rx="1"/>',
  math: '<path d="M2.5 8.5h1.6l1.7 4L9 3.5h4.5"/><path d="M9.8 8.3l3 3.4M12.8 8.3l-3 3.4"/>',
  mathInline: '<path d="M4.5 3.5c-1 0-1.5.6-1.5 1.5v1.5c0 .8-.5 1.5-1.2 1.5.7 0 1.2.7 1.2 1.5V11c0 .9.5 1.5 1.5 1.5M11.5 3.5c1 0 1.5.6 1.5 1.5v1.5c0 .8.5 1.5 1.2 1.5-.7 0-1.2.7-1.2 1.5V11c0 .9-.5 1.5-1.5 1.5"/><path d="M6.2 6.2l3.6 3.6M9.8 6.2l-3.6 3.6"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  divider: '<path d="M2 8h12"/><path d="M5 4.5h6M5 11.5h6" opacity=".45"/>',
  table: '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M2.5 6.6h11M6.5 6.6v5.9M10 6.6v5.9"/>',
  section: '<path d="M6.4 2.9 4.8 13.1M11.2 2.9 9.6 13.1M3.3 6.1h9.4M2.8 9.9h9.4"/>',
  h1: '<path d="M2.5 3.5v9M7.5 3.5v9M2.5 8h5"/><path d="M10.5 6l2-1.5v8"/>',
  h2: '<path d="M2.5 3.5v9M7.5 3.5v9M2.5 8h5"/><path d="M10 6.2c.3-1 1-1.6 2-1.6s1.8.7 1.8 1.7c0 1.6-3.8 3.6-3.8 6.2h3.9"/>',
  h3: '<path d="M2.5 3.5v9M7.5 3.5v9M2.5 8h5"/><path d="M10.1 5.2c.4-.5 1-.7 1.7-.7 1 0 1.8.6 1.8 1.6s-.8 1.6-1.9 1.6c1.2 0 2.1.7 2.1 1.8s-.9 1.9-2 1.9c-.8 0-1.4-.3-1.8-.9"/>',
  h4: '<path d="M2.5 3.5v9M7.5 3.5v9M2.5 8h5"/><path d="M12.8 12.5v-8l-3.3 5.6h4.6"/>',
  h5: '<path d="M2.5 3.5v9M7.5 3.5v9M2.5 8h5"/><path d="M13.6 4.5h-3.2l-.4 3.4c.4-.4 1-.6 1.6-.6 1.1 0 2 .9 2 2.1s-.9 2.1-2.1 2.1c-.8 0-1.4-.3-1.8-.9"/>',
  bullet: '<circle cx="3.5" cy="4.5" r=".9"/><circle cx="3.5" cy="8" r=".9"/><circle cx="3.5" cy="11.5" r=".9"/><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"/>',
  numbered: '<path d="M2.6 3.4l1-.6v3.4M2.4 8.6c.2-.5.6-.8 1.1-.8.6 0 1 .4 1 .9 0 .8-2.1 1.6-2.1 2.7h2.2"/><path d="M7 4.5h6.5M7 8h6.5M7 11.5h6.5"/>',
  todo: '<rect x="2" y="2.5" width="4.5" height="4.5" rx="1"/><path d="M3 9.8l1.1 1.1 2-2.2"/><path d="M8.5 4.75h5.5M8.5 10h5.5"/>',
  quote: '<path d="M3 2.5v11"/><path d="M6 4.5h7.5M6 8h7.5M6 11.5h5"/>',
  color: '<path d="M9.5 2.5l4 4-5.5 5.5H4v-4z"/><path d="M2.5 14h11"/>',
  text: '<path d="M3 3.5h10M8 3.5v9"/>',
  emoji: '<circle cx="8" cy="8" r="6"/><path d="M5.8 9.4c.6.9 1.3 1.4 2.2 1.4s1.6-.5 2.2-1.4"/><path d="M6.3 6.4h.01M9.7 6.4h.01"/>',
};

/** The "/" block menu, Notion-style. ``` and --- also make a code block / divider as you type. */
/** a "/" item that a key also inserts: after it runs, say which key */
const tip = (id: string, run: NonNullable<SuggestItem['run']>): SuggestItem['run'] => (e) => { run(e); hints.action(id); };
/** a "/" item that is the editor's own command `id` (a heading, a list), its key told after as with `tip` */
const line = (id: string): SuggestItem['run'] => tip(id, (e) => runEditorCommand(e, id));

/**
 * What the / menu finds for `query`: by name, hint or keyword. With nothing typed, the menu as it is, its kinds of
 * heading and of diagram each one row that opens into them (a dozen rows of them pushed the rest out of sight); with
 * something typed, every match as a row of its own, wherever it sits ("/flow" finds Flowchart, not "Diagram").
 */
export function slashItems(query: string): SuggestItem[] {
  const all = [...SLASH, colors()];
  if (!query) return all;
  let q = query.toLowerCase();
  // Notion's "/turn": what the line can be turned into ("/turnh2", "/turnbullet"), plain text among them
  const turn = /^turn(?:into)?/.exec(q);
  if (turn) q = q.slice(turn[0].length);
  const from = turn ? [TEXT, ...SLASH.filter((i) => TURNS.has(i.label))] : all;
  const finds = (i: SuggestItem) => [i.label, i.hint, i.keywords].some((w) => w && typedIn(w.toLowerCase(), q));
  // a kind found by its group's name is found too ("/diagram" lists every diagram); not by the group's hint, which
  // names a few kinds ("/flow" is Flowchart alone)
  const named = (i: SuggestItem) => [i.label, i.keywords].some((w) => w && typedIn(w.toLowerCase(), q));
  return from.flatMap((i) => (i.sections ? (named(i) ? i.sections : i.sections.filter(finds)) : finds(i) ? [i] : []));
}

/** the kinds of line "/turn" offers, by label */
const TURNS = new Set(['Heading', 'Bulleted list', 'Numbered list', 'To-do list', 'Quote', 'Callout', 'Toggle', 'Code block']);

/** the whole line coloured with a highlighter pen, as Notion's "/color" colours a block; `null` takes it off */
function colorLine(editor: Editor, pen: string | null, plain: boolean) {
  const { $from } = editor.state.selection;
  const from = $from.start(), to = $from.end();
  if (from === to) return;
  const c = editor.chain().focus().setTextSelection({ from, to });
  (pen === null ? c.unsetMark('highlight') : c.setMark('highlight', { color: plain ? null : pen })).setTextSelection(to).run();
}

/** the line's words in a text colour, or none (null), as Notion's "/red" colours the block */
function inkLine(editor: Editor, name: string | null) {
  const { $from } = editor.state.selection;
  colorText(editor, $from.start(), $from.end(), name);
  editor.commands.focus();
}

/** Notion's "/color", "/red", "/default": text colours, then the pens Settings → Highlighter has, each for the line */
function colors(): SuggestItem {
  const pens = appearance.s.highlights.filter(isPen);
  return {
    label: 'Color', hint: 'the line: its words, or a highlighter', keywords: 'colour text background highlight 색 글자색 형광펜', icon: ICONS.color, folder: true,
    sections: [
      ...COLORS.map((c) => ({ label: c.label, hint: 'text color', keywords: `color colour text ${c.name} 글자색`, icon: ICONS.color, run: (e: Editor) => inkLine(e, c.name) })),
      ...pens.map((c, i) => ({ label: `${penName(c)} background`, hint: 'highlight the line', keywords: 'color colour background highlight 배경 형광펜', icon: ICONS.color, run: (e: Editor) => colorLine(e, c, !i) })),
      { label: 'Default', hint: 'no color on the line', keywords: 'color colour none 색 없음', icon: ICONS.color, run: (e: Editor) => { colorLine(e, null, false); inkLine(e, null); } },
    ],
  };
}

/** "/turn"'s plain line: a heading or a list's line back to text */
const TEXT: SuggestItem = { label: 'Text', hint: 'a plain line', keywords: 'paragraph plain 텍스트', icon: ICONS.text, run: line('paragraph') };

export const SLASH: SuggestItem[] = [
  { label: 'New page', hint: 'a page under this one', keywords: '하위 페이지 subpage', icon: ICONS.page, run: newPage },
  // the lines a key makes as well, the key as the hint: as their own shortcuts do them (a list's lines change kind)
  {
    label: 'Heading', hint: '# to #####', keywords: 'title 제목', icon: ICONS.h1, folder: true,
    sections: [1, 2, 3, 4, 5].map((n) => ({ label: `Heading ${n}`, hint: '#'.repeat(n), keywords: `${n === 1 ? 'title ' : ''}h${n} 제목`, icon: ICONS[`h${n}` as 'h1'], run: line(`h${n}`) })),
  },
  { label: 'Bulleted list', hint: '-', keywords: 'bullet unordered ul 목록', icon: ICONS.bullet, run: line('bulletList') },
  { label: 'Numbered list', hint: '1.', keywords: 'ordered ol number 번호', icon: ICONS.numbered, run: line('orderedList') },
  { label: 'To-do list', hint: '[ ]', keywords: 'todo task checkbox check 할 일', icon: ICONS.todo, run: line('taskList') },
  { label: 'Quote', hint: '|', keywords: 'blockquote 인용', icon: ICONS.quote, run: line('blockquote') },
  { label: 'Callout', hint: '💡 highlighted box', icon: ICONS.callout, run: tip('callout', (e) => e.chain().focus().toggleWrap('callout').run()) },
  { label: 'Toggle', hint: '> folds its content', icon: ICONS.toggle, run: (e) => e.chain().focus().setDetails().updateAttributes('details', { open: true }).run() },
  // as ``` and --- make them as you type
  { label: 'Code block', hint: '``` code, highlighted', icon: ICONS.code, run: tip('codeBlock', (e) => { if (!e.isActive('tableCell') && !e.isActive('tableHeader')) e.chain().focus().toggleCodeBlock().run(); }) },
  { label: 'Divider', hint: '--- a line across', icon: ICONS.divider, run: tip('divider', (e) => e.chain().focus().setHorizontalRule().run()) },
  { label: 'Kanban', hint: 'board', keywords: '칸반', icon: ICONS.kanban, run: insertKanban },
  { label: 'Database', hint: 'a table of pages under this one', keywords: 'table view board 데이터베이스 표 db', icon: ICONS.table, run: insertDatabase },
  {
    label: 'Diagram', hint: 'flowchart, sequence, pie…', keywords: 'mermaid chart 다이어그램 차트', icon: ICONS.diagram, folder: true,
    sections: [
      { label: 'Flowchart', hint: 'boxes and arrows', icon: ICONS.diagram, run: (e) => insertDiagram(e, 'flowchart') },
      { label: 'Swimlanes', hint: 'who does each step, in lanes', icon: ICONS.lanes, run: (e) => insertDiagram(e, swimlaneStarter()) },
      { label: 'Sequence diagram', hint: 'who says what, in order', icon: ICONS.sequence, run: (e) => insertDiagram(e, 'sequence') },
      { label: 'Pie chart', hint: 'parts of a whole', icon: ICONS.pie, run: (e) => insertDiagram(e, 'pie') },
      { label: 'Mind map', hint: 'ideas branching out', icon: ICONS.mindmap, run: (e) => insertDiagram(e, 'mindmap') },
      { label: 'Timeline', hint: 'what happened when', icon: ICONS.timeline, run: (e) => insertDiagram(e, 'timeline') },
      { label: 'Gantt chart', hint: 'tasks on a calendar', icon: ICONS.gantt, run: (e) => insertDiagram(e, 'gantt') },
    ],
  },
  { label: 'Equation', hint: '∑ formula, its own line ($$)', icon: ICONS.math, run: (e) => insertMath(e, true) },
  { label: 'Inline equation', hint: 'x² formula, in the line ($)', icon: ICONS.mathInline, run: (e) => insertMath(e, false) },
  { label: 'Table', hint: '3×3, with a header row', icon: ICONS.table, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: 'Image', hint: 'Pick a file', icon: ICONS.image, run: tip('image', (e) => { pickImage().then((src) => src && insertImage(e, src)); }) },
  { label: 'Video', hint: 'Pick a file', icon: ICONS.video, run: (e) => { pickVideo().then((src) => src && e.chain().focus().insertContent({ type: 'video', attrs: { src, name: src.split('/').pop() } }).run()); } },
  { label: 'Footnote', hint: '[^1] a note at the end', keywords: 'reference cite 각주 주석', icon: ICONS.text, run: insertFootnote },
  { label: 'Link to note', hint: '[[ another note', icon: ICONS.wikiLink, run: tip('wikiLink', (e) => e.chain().focus().insertContent('[[').run()) },
  // Notion's own, for the line the / was typed on
  { label: 'Table of contents', hint: 'every section, kept up to date', keywords: 'toc outline 목차', icon: ICONS.text, run: (e) => e.chain().focus().insertContent({ type: 'htmlComment', attrs: { text: ' toc ' } }).run() },
  { label: 'Duplicate', hint: 'this line again under it', keywords: 'copy 복제', icon: ICONS.text, run: (e) => runEditorCommand(e, 'duplicate') },
  { label: 'Move to', hint: 'this line to another page', keywords: 'moveto 옮기기 이동', icon: ICONS.page, run: (e) => void moveLine(e) },
  { label: 'Delete', hint: 'this line', keywords: 'remove 삭제', icon: ICONS.text, run: deleteLine },
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

/** The block the caret is in, as Notion means it: a list's item (with what is under it), or the line itself */
function lineRange(editor: Editor): { from: number; to: number } {
  const { $from } = editor.state.selection;
  const item = $from.depth > 1 && /Item$/.test($from.node(-1).type.name) && $from.index(-1) === 0;
  const d = item ? $from.depth - 1 : $from.depth;
  return { from: $from.before(d), to: $from.after(d) };
}

/** "/delete": the line goes, the caret to the end of the one above */
function deleteLine(editor: Editor) {
  const { from, to } = lineRange(editor);
  const tr = editor.state.tr.delete(from, to);
  editor.view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1)).scrollIntoView());
  editor.commands.focus();
}

/** "/moveto": the line (an item with what is under it) to the end of another page, gone from here.
 *  (ponytail: the other page's half is not part of ⌘Z here; the page itself keeps its own versions) */
async function moveLine(editor: Editor) {
  const here = notes.current;
  let pool = notes.pages.filter((n) => n.id !== here?.id);
  if (pool.length > 30) {
    const q = (await ui.prompt(`Move to which page? (${pool.length} to choose from)`, ''))?.trim().toLowerCase();
    if (q === undefined) return void editor.commands.focus();
    pool = pool.filter((n) => titleOf(n).toLowerCase().includes(q)).slice(0, 30);
  }
  const c = editor.view.coordsAtPos(editor.state.selection.from);
  ui.openMenu({ clientX: Math.round(c.left), clientY: Math.round(c.bottom + 4) }, pool.length
    ? pool.map((n) => ({ label: titleOf(n), run: () => {
      const { from, to } = lineRange(editor);
      const { state } = editor;
      let slice = state.doc.slice(from, to).content;
      // an item alone is no block of a note: in a list of its own kind
      const first = slice.firstChild;
      if (first && /Item$/.test(first.type.name)) slice = Fragment.from(state.doc.resolve(from).parent.copy(slice));
      const md = (editor.storage as any).markdown.serializer.serialize(state.schema.topNodeType.create(null, slice)).trim();
      notes.update(n.id, `${n.body.trimEnd()}\n\n${md}\n`);
      deleteLine(editor);
      ui.toast(`Moved to “${titleOf(n)}”`);
    } }))
    : [{ label: 'No other page to move it to', disabled: true }]);
}

/** 'Untitled', 'Untitled 2', … — a fresh page needs a title no other page answers to, because
 *  [[links]] resolve by title. Renaming the page carries its links along (see followRename). */
function untitled(base = 'Untitled'): string {
  const taken = new Set(notes.visible.map((n) => titleOf(n)));
  let title = base;
  for (let i = 2; taken.has(title); i++) title = `${base} ${i}`;
  return title;
}

/**
 * Notion-style sub-page: a [[link]] lands at the cursor and the new page opens straight away,
 * nested under this one in the sidebar, with its title selected so the first keystroke names it
 * (or named already: the title typed after "+").
 */
export function newPage(editor: Editor, named = '') {
  const parent = notes.current;
  const title = untitled(named.trim() || 'Untitled');
  editor.chain().focus().insertContent([{ type: 'wikiLink', attrs: { title } }, { type: 'text', text: ' ' }]).run();
  if (parent) notes.flush(parent.id); // creating the page navigates away from this editor
  notes.selectTitle = !named.trim();
  const page = notes.create(`# ${title}\n\n`, parent?.group ?? '', parent?.id);
  // the link to it is written into the page above: left as it was made, it is still that page's, not a stray ⌘N
  notes.touched(page.id);
}
