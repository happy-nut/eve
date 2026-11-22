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
import { ui, under } from './ui.svelte';
import { notes, titleOf } from './notes.svelte';
import { isCustom } from './icons';
import { pickImage, pickVideo } from './platform';
import { hints } from './hints.svelte';
import type { EmojiEntry } from './emoji';
import { outOfEmptyItem, runEditorCommand } from './editor';
import { composing } from './keys';
import { typedIn } from './hangul';
import { appearance } from './appearance.svelte';
import { isPen, penName } from './highlight';
import { COLORS, colorText } from './textColor';
import { ICONS } from './lineIcons';

export interface SuggestItem {
  label: string; value?: string; hint?: string; icon?: string; noteIcon?: string;
  /** a colour drawn in the icon's place (the / menu's colours, as the right-click menu draws them) */
  swatch?: string;
  /** the heading it sits under in the bare / menu ("Basic blocks"); a list found by typing has none */
  group?: string;
  /** found by typing only, not in the bare / menu: what it does to the line, not something it makes */
  typedOnly?: boolean;
  /** more words the / menu finds it by, not shown (하위 페이지 for New note: Korean is searched in as often) */
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

/** A "/" that ⌘/ put in to open the menu, per editor view: where it (and the space put before it) starts. Nothing
 *  was typed, so Esc takes it away again with whatever was typed after it to look for a block; it was left in the line. */
const askedFor = new WeakMap<object, { start: number; slash: number }>();
export function slashAsked(view: object, start: number, slash: number) { askedFor.set(view, { start, slash }); }

/** a popup's life at the caret: it follows the caret, takes its keys as `keys` says, and is drawn by `show` */
function atCaret(uiRef: Driven & { place?(rect: DOMRect): void }, keys: PickerKeys, show: (p: any) => void) {
  const follow = stayAtCaret(uiRef);
  const k = suggestKeys(uiRef, keys);
  const open = (p: any) => { k.shown(p); show(p); };
  const readInWhatIsOnScreen = (view: any): boolean => { const was = view.state.doc; view.domObserver?.flush?.(); return view.state.doc !== was; };
  const pressAgainOnceTheListIsNew = (view: any, e: KeyboardEvent) => setTimeout(() => {
    if (!view.isDestroyed) view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, shiftKey: e.shiftKey, bubbles: true, cancelable: true }));
  }, 0);
  return {
    onStart: (p: any) => {
      const set = popupsOf.get(p.editor) ?? new Set();
      popupsOf.set(p.editor, set.add(uiRef));
      follow.start(p);
      open(p);
    },
    onUpdate: (p: any) => { follow.update(p); open(p); },
    onKeyDown: (p: any) => {
      if ((p.event.key === 'Enter' || p.event.key === 'Tab') && readInWhatIsOnScreen(p.view)) return (pressAgainOnceTheListIsNew(p.view, p.event), true);
      const asked = askedFor.get(p.view);
      const took = k.onKeyDown(p);
      if (took && p.event.key === 'Escape' && asked && asked.slash === p.range?.from) {
        askedFor.delete(p.view);
        p.view.dispatch(p.view.state.tr.delete(asked.start, p.range.to));
      }
      return took;
    },
    onExit: (p: any) => { follow.stop(); uiRef.hide(); if (p?.editor) askedFor.delete(p.editor.view); },
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
  const make: SuggestItem = { label: 'New note', hint: q ? `“${query.trim()}”, under this one` : 'under this one', icon: ICONS.page, run: (e) => newPage(e, query) };
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
  // the colours only typed for ("/red", "/color"): a row at the foot of the bare menu, they were seldom wanted there,
  // and opened they fell below the menu's edge
  if (!query) return SLASH.filter((i) => !i.typedOnly);
  const all = [...SLASH, colors()];
  let q = query.toLowerCase();
  // Notion's "/turn": what the line can be turned into ("/turnh2", "/turnbullet"), plain text among them
  const turn = /^turn(?:into)?/.exec(q);
  if (turn) q = q.slice(turn[0].length);
  // (plain text is one of what the menu makes, "/text" too: it found only the nine colours, and ↩ greyed the line)
  const from = turn ? SLASH.filter((i) => i === TEXT || TURNS.has(i.label)) : all;
  // a word with a space in it ("할 일", "하위 페이지") found typed without it: the / menu ends at a space
  const has = (w: string | undefined) => !!w && (typedIn(w.toLowerCase(), q) || typedIn(w.toLowerCase().replace(/\s+/g, ''), q));
  const finds = (i: SuggestItem) => [i.label, i.hint, i.keywords, koreanOf(i)].some(has);
  // a kind found by its group's name is found too ("/diagram" lists every diagram); not by the group's hint, which
  // names a few kinds ("/flow" is Flowchart alone)
  const named = (i: SuggestItem) => [i.label, i.keywords, koreanOf(i)].some(has);
  const found = from.flatMap((i) => (i.sections ? (named(i) ? i.sections : i.sections.filter(finds)) : finds(i) ? [i] : []));
  // the closest first, as ↩ takes the first: the name itself, then a name that starts so, then a keyword that is the
  // word, then the rest as they come ("/table" took Database, "/red" a bulleted list for the "red" in "unordered")
  const words = (i: SuggestItem) => `${i.keywords ?? ''} ${koreanOf(i)}`.toLowerCase().split(/\s+/);
  // a Korean word half typed starts it too: "/ㅌ" and "/테" put 테이블 before a word with a ㅌ further in
  const starts = (w: string) => typedIn(w.toLowerCase(), q, true);
  const rank = (i: SuggestItem) => {
    const name = i.label.toLowerCase();
    // its Korean name first said as its name ("/테이" is Table before Database tables, which has 테이블 further in)
    return name === q ? 0 : name.startsWith(q) || starts(koreanOf(i).split(' ')[0]) ? 1 : words(i).includes(q) ? 2 : words(i).some(starts) ? 3 : 4;
  };
  return found.map((i, n) => ({ i, n, r: rank(i) })).sort((a, b) => a.r - b.r || a.n - b.n).map((x) => ({ ...x.i, group: undefined }));
}

/**
 * Every / item's name in Korean, as it is said (테이블) and as it is meant (표): typed on a Korean keyboard, "/ㅌ"
 * finds Table as "/t" does. A label not here is looked up by its first word (Heading 2 as Heading, Red background as
 * Red); `slashKorean.dom.test.ts` fails on an item with no Korean name.
 */
export const KOREAN: Record<string, string> = {
  Text: '텍스트 글 본문', 'New note': '새 노트 새 페이지 하위 노트', Heading: '헤딩 제목', 'Bulleted list': '글머리 기호 목록 불릿 리스트',
  'Numbered list': '번호 목록 넘버 리스트', 'To-do list': '할 일 투두 체크리스트 체크박스', Quote: '인용 쿼트 인용문',
  Callout: '콜아웃 강조 상자 박스', Toggle: '토글 접기', 'Code block': '코드 블록', Divider: '구분선 디바이더 줄',
  Kanban: '칸반 보드', Database: '데이터베이스 디비', Diagram: '다이어그램 머메이드 차트 도표',
  Flowchart: '플로차트 플로우차트 순서도 흐름도', Swimlanes: '스윔레인 레인 수영 레인', 'Sequence diagram': '시퀀스 다이어그램 순서',
  'Pie chart': '파이 차트 원 그래프', 'Mind map': '마인드맵 마인드 맵', Timeline: '타임라인 연표', 'Gantt chart': '간트 차트 일정',
  'Class diagram': '클래스 다이어그램', 'State diagram': '상태 다이어그램 스테이트', 'Database tables': '데이터베이스 테이블 이알 관계도',
  Equation: '수식 방정식 이퀘이션 수학', 'Inline equation': '인라인 수식 방정식', Table: '테이블 표', Image: '이미지 그림 사진',
  Video: '비디오 동영상 영상', Footnote: '각주 풋노트 주석', 'Link to note': '링크 노트 연결 문서', 'Table of contents': '목차 차례 테이블 오브 콘텐츠',
  Duplicate: '복제 복사 듀플리케이트', 'Move to': '옮기기 이동 무브', Delete: '삭제 지우기 딜리트', Emoji: '이모지 이모티콘',
  Color: '색 색깔 컬러 글자색', Default: '기본 기본색 디폴트', Gray: '회색 그레이', Grey: '회색 그레이', Brown: '갈색 브라운',
  Orange: '주황 주황색 오렌지', Yellow: '노랑 노란색 옐로', Green: '초록 초록색 녹색 그린', Teal: '청록 청록색 틸', Blue: '파랑 파란색 블루',
  Purple: '보라 보라색 퍼플', Pink: '분홍 분홍색 핑크', Red: '빨강 빨간색 레드', White: '흰색 하양 화이트', Black: '검정 검은색 블랙',
};
export const koreanOf = (i: SuggestItem) => KOREAN[i.label] ?? KOREAN[i.label.split(' ')[0]] ?? '';

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
      ...COLORS.map((c) => ({ label: c.label, hint: 'text color', keywords: `color colour text ${c.name} 글자색`, swatch: c.hex, run: (e: Editor) => inkLine(e, c.name) })),
      ...pens.map((c, i) => ({ label: `${penName(c)} background`, hint: 'highlight the line', keywords: 'color colour background highlight 배경 형광펜', swatch: c, run: (e: Editor) => colorLine(e, c, !i) })),
      { label: 'Default', hint: 'no color on the line', keywords: 'color colour none 색 없음', swatch: 'transparent', run: (e: Editor) => { colorLine(e, null, false); inkLine(e, null); } },
    ],
  };
}

/** "/turn"'s plain line: a heading or a list's line back to text */


const BASIC = 'Basic blocks', MEDIA = 'Media', PAGES = 'Notes and boards', MORE = 'Advanced';
const TEXT: SuggestItem = { label: 'Text', keywords: 'paragraph plain a plain line 텍스트', icon: ICONS.text, group: BASIC, run: line('paragraph') };
/** the bare menu in its groups, each row's hint the key that also makes it (Notion's), a few words only where there is none */
export const SLASH: SuggestItem[] = [
  TEXT,
  {
    label: 'Heading', hint: '#', keywords: 'title 제목', icon: ICONS.h1, folder: true, group: BASIC,
    sections: [1, 2, 3, 4, 5].map((n) => ({ label: `Heading ${n}`, hint: '#'.repeat(n), keywords: `${n === 1 ? 'title ' : ''}h${n} 제목`, icon: ICONS[`h${n}` as 'h1'], run: line(`h${n}`) })),
  },
  { label: 'Bulleted list', hint: '-', keywords: 'bullet unordered ul 목록', icon: ICONS.bullet, group: BASIC, run: line('bulletList') },
  { label: 'Numbered list', hint: '1.', keywords: 'ordered ol number 번호', icon: ICONS.numbered, group: BASIC, run: line('orderedList') },
  { label: 'To-do list', hint: '[ ]', keywords: 'todo task checkbox check 할 일', icon: ICONS.todo, group: BASIC, run: line('taskList') },
  { label: 'Toggle', hint: '>', keywords: 'folds its content 토글 접기', icon: ICONS.toggle, group: BASIC, run: (e) => e.chain().focus().setDetails().updateAttributes('details', { open: true }).run() },
  { label: 'Quote', hint: '|', keywords: 'blockquote 인용', icon: ICONS.quote, group: BASIC, run: line('blockquote') },
  { label: 'Callout', keywords: 'highlighted box 💡', icon: ICONS.callout, group: BASIC, run: tip('callout', (e) => e.chain().focus().toggleWrap('callout').run()) },
  { label: 'Divider', hint: '---', keywords: 'a line across 구분선 hr rule', icon: ICONS.divider, group: BASIC, run: tip('divider', (e) => e.chain().focus().setHorizontalRule().run()) },
  { label: 'Table', keywords: '3×3 with a header row 표 grid', icon: ICONS.table, group: BASIC, run: (e) => e.chain().focus().command(({ tr }) => { outOfEmptyItem(tr, e.schema.nodes.table.createAndFill()); return true; }).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: 'Code block', hint: '```', keywords: 'code highlighted 코드', icon: ICONS.code, group: BASIC, run: tip('codeBlock', (e) => { if (!e.isActive('tableCell') && !e.isActive('tableHeader')) e.chain().focus().toggleCodeBlock().run(); }) },
  { label: 'Image', keywords: 'pick a file 이미지 그림 사진 picture photo', icon: ICONS.image, group: MEDIA, run: tip('image', (e) => { pickImage().then((src) => src && insertImage(e, src)); }) },
  { label: 'Video', keywords: 'pick a file movie', icon: ICONS.video, group: MEDIA, run: (e) => { pickVideo().then((src) => src && e.chain().focus().insertContent({ type: 'video', attrs: { src, name: src.split('/').pop() } }).run()); } },
  {
    label: 'Emoji', hint: ':', keywords: 'pick one 😀', icon: ICONS.emoji, group: MEDIA,
    run: (e) => {
      const c = e.view.coordsAtPos(e.state.selection.from);
      ui.pickEmoji(new DOMRect(c.left, c.top, 0, c.bottom - c.top)).then((v) => {
        if (v && !isCustom(v)) e.chain().focus().insertContent(v).run(); else e.commands.focus();
      });
    },
  },
  { label: 'New note', keywords: 'a note under this one 하위 페이지 하위 노트 subpage page', icon: ICONS.page, group: PAGES, run: newPage },
  { label: 'Link to note', hint: '[[', keywords: 'another note', icon: ICONS.wikiLink, group: PAGES, run: tip('wikiLink', (e) => e.chain().focus().insertContent('[[').run()) },
  { label: 'Database', keywords: 'a table of notes under this one table view board 데이터베이스 db', icon: ICONS.database, group: PAGES, run: insertDatabase },
  { label: 'Kanban', keywords: 'board 칸반', icon: ICONS.kanban, group: PAGES, run: insertKanban },
  {
    label: 'Diagram', keywords: 'mermaid chart 다이어그램 차트', icon: ICONS.diagram, folder: true, group: PAGES,
    sections: [
      { label: 'Flowchart', hint: 'boxes and arrows', icon: ICONS.diagram, run: (e) => insertDiagram(e, 'flowchart') },
      { label: 'Swimlanes', hint: 'who does each step, in lanes', icon: ICONS.lanes, run: (e) => insertDiagram(e, swimlaneStarter()) },
      { label: 'Sequence diagram', hint: 'who says what, in order', icon: ICONS.sequence, run: (e) => insertDiagram(e, 'sequence') },
      { label: 'Pie chart', hint: 'parts of a whole', icon: ICONS.pie, run: (e) => insertDiagram(e, 'pie') },
      { label: 'Mind map', hint: 'ideas branching out', icon: ICONS.mindmap, run: (e) => insertDiagram(e, 'mindmap') },
      { label: 'Timeline', hint: 'what happened when', icon: ICONS.timeline, run: (e) => insertDiagram(e, 'timeline') },
      { label: 'Gantt chart', hint: 'tasks on a calendar', icon: ICONS.gantt, run: (e) => insertDiagram(e, 'gantt') },
      { label: 'Class diagram', hint: 'classes and how they relate', icon: ICONS.classes, run: (e) => insertDiagram(e, 'class') },
      { label: 'State diagram', hint: 'states and what moves between them', icon: ICONS.states, run: (e) => insertDiagram(e, 'state') },
      { label: 'Database tables', hint: 'an ER diagram: tables and their keys', icon: ICONS.tables, run: (e) => insertDiagram(e, 'er') },
    ],
  },
  { label: 'Equation', hint: '$$', keywords: 'formula its own line ∑', icon: ICONS.math, group: MORE, run: (e) => insertMath(e, true) },
  { label: 'Inline equation', hint: '$', keywords: 'formula in the line x²', icon: ICONS.mathInline, group: MORE, run: (e) => insertMath(e, false) },
  { label: 'Footnote', hint: '[^1]', keywords: 'a note at the end reference cite 각주 주석', icon: ICONS.footnote, group: MORE, run: insertFootnote },
  // Notion's own, for the line the / was typed on
  { label: 'Table of contents', keywords: 'every section kept up to date toc outline 목차', icon: ICONS.toc, group: MORE, run: (e) => e.chain().focus().insertContent([{ type: 'htmlComment', attrs: { text: ' toc ' } }, { type: 'paragraph' }]).run() }, // the caret on a line under it (left on it, the next key replaced it)
  { label: 'Duplicate', hint: 'this line', keywords: 'copy again 복제', icon: ICONS.duplicate, typedOnly: true, run: (e) => runEditorCommand(e, 'duplicate') },
  { label: 'Move to', hint: 'this line', keywords: 'another note moveto 옮기기 이동', icon: ICONS.moveTo, typedOnly: true, run: (e) => void moveLine(e) },
  { label: 'Delete', hint: 'this line', keywords: 'remove 삭제', icon: ICONS.trash, typedOnly: true, run: deleteLine },
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
  // never the title: it is the note's name (it went, and the note with no name after it)
  if (from === 0) return void editor.commands.focus();
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
    const q = (await ui.prompt(`Move to which note? (${pool.length} to choose from)`, ''))?.trim().toLowerCase();
    if (q === undefined) return void editor.commands.focus();
    pool = pool.filter((n) => titleOf(n).toLowerCase().includes(q)).slice(0, 30);
  }
  const c = editor.view.coordsAtPos(editor.state.selection.from);
  ui.openMenu(under(c), pool.length
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
    : [{ label: 'No other note to move it to', disabled: true }]);
}

/** 'Untitled', 'Untitled 2', … — a fresh page needs a title no other page answers to, because
 *  [[links]] resolve by title. Renaming the page carries its links along (see followRename). */
function untitled(base: string): string {
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
  const page = notes.create(`# ${title}\n\n`, parent?.id);
  // the link to it is written into the page above: left as it was made, it is still that page's, not a stray ⌘N
  notes.touched(page.id);
}
