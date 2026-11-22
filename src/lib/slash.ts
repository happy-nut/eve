import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import { closeHistory, undoDepth } from '@tiptap/pm/history';
import { flushPendingEdits } from './pending';
import { insertKanban } from './kanban';
import { insertDatabase } from './databaseNode';
import { insertFootnote } from './footnote';
import { domObserverOf, insertDiagram } from './code';
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
  swatch?: string;
  group?: string;
  typedOnly?: boolean;
  keywords?: string;
  sections?: SuggestItem[];
  folder?: boolean;
  run?: (editor: Editor) => void;
}
export interface SuggestionUI {
  show(items: SuggestItem[], rect: DOMRect | null, pick: (item: SuggestItem) => void): void;
  move(delta: number): void;
  select(): boolean;
  expand(): boolean;
  collapse(): boolean;
  hide(): void;
  visible(): boolean;
  place?(rect: DOMRect): void;
  chosen?(): boolean;
}

export interface CalendarUI {
  show(day: string | null, rect: DOMRect | null, pick: (iso: string) => void, remind?: string): void;
  move(days: number): void;
  month(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
  place?(rect: DOMRect): void;
}

export interface EmojiUI {
  show(items: EmojiEntry[], rect: DOMRect | null, pick: (e: EmojiEntry) => void): void;
  move(delta: number): void;
  select(): boolean;
  hide(): void;
  visible(): boolean;
  place?(rect: DOMRect): void;
  chosen?(): boolean;
}

const POPUPS = '.suggest, .cal, .emoji-row';

function followScroll(ui: { hide(): void; visible(): boolean; place?(rect: DOMRect): void }) {
  let last: any = null;
  const onScroll = (e: Event) => {
    if (!last || !ui.visible() || (e.target instanceof Element && e.target.closest(POPUPS))) return;
    const r: DOMRect | null = last.clientRect?.() ?? null;
    if (!r) return;
    const box = scrollBox(last.editor.view.dom);
    if (r.bottom < box.top || r.top > box.bottom) ui.hide();
    else ui.place?.(r);
  };
  return {
    start(p: any) {
      last = p;
      window.addEventListener('scroll', onScroll, true);
    },
    update(p: any) { last = p; },
    stop() {
      window.removeEventListener('scroll', onScroll, true);
      last = null;
    },
  };
}

function hideOnBlur(ui: { hide(): void }) {
  let watched: Editor | null = null;
  const onBlur = ({ event }: { event: FocusEvent }) => {
    if (event.relatedTarget instanceof Element && event.relatedTarget.closest(POPUPS)) return;
    ui.hide();
  };
  return {
    start(editor: Editor) {
      watched?.off('blur', onBlur);
      watched = editor;
      editor.on('blur', onBlur);
    },
    stop() {
      watched?.off('blur', onBlur);
      watched = null;
    },
  };
}

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

export interface PickerKeys {
  axis: 'vertical' | 'horizontal' | 'grid';
  confirm: 'always' | 'afterNavigate' | ((p: any) => boolean);
  tabPicks?: boolean;
}
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

export function suggestKeys(uiRef: Driven, k: PickerKeys) {
  let sure = k.confirm === 'always';
  const nav = (run: () => void) => (run(), (sure = true));
  return {
    shown(p: any) { sure = k.confirm === 'always' || (k.confirm !== 'afterNavigate' && k.confirm(p)); },
    onKeyDown: ({ event: e }: { event: KeyboardEvent }): boolean => {
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

const popupsOf = new WeakMap<Editor, Set<{ visible(): boolean }>>();
export function suggestionVisible(editor: Editor): boolean {
  for (const u of popupsOf.get(editor) ?? []) if (u.visible()) return true;
  return false;
}

const askedFor = new WeakMap<object, { start: number; slash: number }>();
export function slashAsked(view: object, start: number, slash: number) { askedFor.set(view, { start, slash }); }

function atCaret(uiRef: Driven & { place?(rect: DOMRect): void }, keys: PickerKeys, show: (p: any) => void) {
  const scrolling = followScroll(uiRef), blurring = hideOnBlur(uiRef);
  const k = suggestKeys(uiRef, keys);
  const open = (p: any) => { k.shown(p); show(p); };
  const readInWhatIsOnScreen = (view: any): boolean => { const was = view.state.doc; domObserverOf(view)?.flush?.(); return view.state.doc !== was; };
  const pressAgainOnceTheListIsNew = (view: any, e: KeyboardEvent) => setTimeout(() => {
    if (!view.isDestroyed) view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, shiftKey: e.shiftKey, bubbles: true, cancelable: true }));
  }, 0);
  return {
    onStart: (p: any) => {
      const set = popupsOf.get(p.editor) ?? new Set();
      popupsOf.set(p.editor, set.add(uiRef));
      scrolling.start(p);
      blurring.start(p.editor);
      open(p);
    },
    onUpdate: (p: any) => { scrolling.update(p); open(p); },
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
    onExit: (p: any) => { scrolling.stop(); blurring.stop(); uiRef.hide(); if (p?.editor) askedFor.delete(p.editor.view); },
  };
}

export const PICKERS = {
  slash: {
    char: '/', axis: 'vertical',
    confirm: ({ editor, range, query, items }: any) => {
      const $at = editor.state.doc.resolve(range.from);
      return !$at.parent.textBetween(0, $at.parentOffset, undefined, '￼').trim() || (/\p{L}/u.test(query) && items.length > 0);
    },
  },
  wiki: { char: '[[', axis: 'vertical', confirm: 'always' },
  page: { char: '+', axis: 'vertical', confirm: (p: any) => /\p{L}/u.test(p.query) && p.items.length > 0 },
  date: {
    char: '@', axis: 'grid', tabPicks: true,
    confirm: (p: any) => !p.query || (p.items as { exact?: boolean }[]).some((d) => d.exact),
  },
  emoji: { char: ':', axis: 'horizontal', confirm: 'afterNavigate' },
} as const satisfies Record<string, PickerKeys & { char: string }>;
export type PickerId = keyof typeof PICKERS;

export function emojiRow(uiRef: EmojiUI) {
  return atCaret(uiRef, PICKERS.emoji, (p) => uiRef.show(p.items, p.clientRect?.() ?? null, (e: EmojiEntry) => p.command(e)));
}

export function calendar(uiRef: CalendarUI) {
  const first = (p: any) => (p.items as { iso: string; time?: string }[])[0];
  return atCaret(uiRef, PICKERS.date, (p) => uiRef.show(first(p)?.iso ?? null, p.clientRect?.() ?? null,
    (iso: string) => p.command({ value: iso, remind: !!first(p)?.time }), first(p)?.time ?? ''));
}

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

export function popup(uiRef: SuggestionUI, keys: PickerKeys = PICKERS.wiki) {
  return atCaret(uiRef, keys, (p) => uiRef.show(p.items, p.clientRect?.() ?? null, (i: SuggestItem) => p.command(i)));
}


const withKeyHint = (id: string, run: NonNullable<SuggestItem['run']>): SuggestItem['run'] => (e) => { run(e); hints.action(id); };
const editorCommand = (id: string): SuggestItem['run'] => withKeyHint(id, (e) => runEditorCommand(e, id));

export function slashItems(query: string): SuggestItem[] {
  if (!query) return SLASH.filter((i) => !i.typedOnly);
  const all = [...SLASH, colors()];
  let q = query.toLowerCase();
  const turn = /^turn(?:into)?/.exec(q);
  if (turn) q = q.slice(turn[0].length);
  const from = turn ? SLASH.filter((i) => i === TEXT || TURNS.has(i.label)) : all;
  const has = (w: string | undefined) => !!w && (typedIn(w.toLowerCase(), q) || typedIn(w.toLowerCase().replace(/\s+/g, ''), q));
  const finds = (i: SuggestItem) => [i.label, i.hint, i.keywords, koreanOf(i)].some(has);
  const named = (i: SuggestItem) => [i.label, i.keywords, koreanOf(i)].some(has);
  const found = from.flatMap((i) => (i.sections ? (named(i) ? i.sections : i.sections.filter(finds)) : finds(i) ? [i] : []));
  const words = (i: SuggestItem) => `${i.keywords ?? ''} ${koreanOf(i)}`.toLowerCase().split(/\s+/);
  const starts = (w: string) => typedIn(w.toLowerCase(), q, true);
  const rank = (i: SuggestItem) => {
    const name = i.label.toLowerCase();
    return name === q ? 0 : name.startsWith(q) || starts(koreanOf(i).split(' ')[0]) ? 1 : words(i).includes(q) ? 2 : words(i).some(starts) ? 3 : 4;
  };
  return found.map((i, n) => ({ i, n, r: rank(i) })).sort((a, b) => a.r - b.r || a.n - b.n).map((x) => ({ ...x.i, group: undefined }));
}

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

const TURNS = new Set(['Heading', 'Bulleted list', 'Numbered list', 'To-do list', 'Quote', 'Callout', 'Toggle', 'Code block']);

function colorLine(editor: Editor, pen: string | null, plain: boolean) {
  const { $from } = editor.state.selection;
  const from = $from.start(), to = $from.end();
  if (from === to) return;
  const c = editor.chain().focus().setTextSelection({ from, to });
  (pen === null ? c.unsetMark('highlight') : c.setMark('highlight', { color: plain ? null : pen })).setTextSelection(to).run();
}

function inkLine(editor: Editor, name: string | null) {
  const { $from } = editor.state.selection;
  colorText(editor, $from.start(), $from.end(), name);
  editor.commands.focus();
}

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



const BASIC = 'Basic blocks', MEDIA = 'Media', PAGES = 'Notes and boards', MORE = 'Advanced';
const TEXT: SuggestItem = { label: 'Text', keywords: 'paragraph plain a plain line 텍스트', icon: ICONS.text, group: BASIC, run: editorCommand('paragraph') };
export const SLASH: SuggestItem[] = [
  TEXT,
  {
    label: 'Heading', hint: '#', keywords: 'title 제목', icon: ICONS.h1, folder: true, group: BASIC,
    sections: [1, 2, 3, 4, 5].map((n) => ({ label: `Heading ${n}`, hint: '#'.repeat(n), keywords: `${n === 1 ? 'title ' : ''}h${n} 제목`, icon: ICONS[`h${n}` as 'h1'], run: editorCommand(`h${n}`) })),
  },
  { label: 'Bulleted list', hint: '-', keywords: 'bullet unordered ul 목록', icon: ICONS.bullet, group: BASIC, run: editorCommand('bulletList') },
  { label: 'Numbered list', hint: '1.', keywords: 'ordered ol number 번호', icon: ICONS.numbered, group: BASIC, run: editorCommand('orderedList') },
  { label: 'To-do list', hint: '[ ]', keywords: 'todo task checkbox check 할 일', icon: ICONS.todo, group: BASIC, run: editorCommand('taskList') },
  { label: 'Toggle', hint: '>', keywords: 'folds its content 토글 접기', icon: ICONS.toggle, group: BASIC, run: (e) => e.chain().focus().setDetails().updateAttributes('details', { open: true }).run() },
  { label: 'Quote', hint: '|', keywords: 'blockquote 인용', icon: ICONS.quote, group: BASIC, run: editorCommand('blockquote') },
  { label: 'Callout', keywords: 'highlighted box 💡', icon: ICONS.callout, group: BASIC, run: withKeyHint('callout', (e) => e.chain().focus().toggleWrap('callout').run()) },
  { label: 'Divider', hint: '---', keywords: 'a line across 구분선 hr rule', icon: ICONS.divider, group: BASIC, run: withKeyHint('divider', (e) => e.chain().focus().setHorizontalRule().run()) },
  { label: 'Table', keywords: '3×3 with a header row 표 grid', icon: ICONS.table, group: BASIC, run: (e) => e.chain().focus().command(({ tr }) => { outOfEmptyItem(tr, e.schema.nodes.table.createAndFill()); return true; }).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: 'Code block', hint: '```', keywords: 'code highlighted 코드', icon: ICONS.code, group: BASIC, run: withKeyHint('codeBlock', (e) => { if (!e.isActive('tableCell') && !e.isActive('tableHeader')) e.chain().focus().toggleCodeBlock().run(); }) },
  { label: 'Image', keywords: 'pick a file 이미지 그림 사진 picture photo', icon: ICONS.image, group: MEDIA, run: withKeyHint('image', (e) => { pickImage().then((src) => src && insertImage(e, src)); }) },
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
  { label: 'Link to note', hint: '[[', keywords: 'another note', icon: ICONS.wikiLink, group: PAGES, run: withKeyHint('wikiLink', (e) => e.chain().focus().insertContent('[[').run()) },
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
  { label: 'Table of contents', keywords: 'every section kept up to date toc outline 목차', icon: ICONS.toc, group: MORE, run: (e) => e.chain().focus().insertContent([{ type: 'htmlComment', attrs: { text: ' toc ' } }, { type: 'paragraph' }]).run() },
  { label: 'Duplicate', hint: 'this line', keywords: 'copy again 복제', icon: ICONS.duplicate, typedOnly: true, run: (e) => runEditorCommand(e, 'duplicate') },
  { label: 'Move to', hint: 'this line', keywords: 'another note moveto 옮기기 이동', icon: ICONS.moveTo, typedOnly: true, run: (e) => void moveLine(e) },
  { label: 'Delete', hint: 'this line', keywords: 'remove 삭제', icon: ICONS.trash, typedOnly: true, run: deleteLine },
];

function lineRange(editor: Editor): { from: number; to: number } {
  const { $from } = editor.state.selection;
  const item = $from.depth > 1 && /Item$/.test($from.node(-1).type.name) && $from.index(-1) === 0;
  const d = item ? $from.depth - 1 : $from.depth;
  return { from: $from.before(d), to: $from.after(d) };
}

function deleteLine(editor: Editor): boolean {
  const { from, to } = lineRange(editor);
  if (from === 0) return void editor.commands.focus(), false;
  const tr = editor.state.tr.delete(from, to);
  editor.view.dispatch(tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1)).scrollIntoView());
  editor.commands.focus();
  return true;
}

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
      const first = slice.firstChild;
      if (first && /Item$/.test(first.type.name)) slice = Fragment.from(state.doc.resolve(from).parent.copy(slice));
      const md = (editor.storage as any).markdown.serializer.serialize(state.schema.topNodeType.create(null, slice)).trim();
      const was = n.body;
      notes.update(n.id, `${was.trimEnd()}\n\n${md}\n`);
      const moved = n.body;
      editor.view.dispatch(closeHistory(editor.state.tr));
      const deleted = deleteLine(editor);
      flushPendingEdits();
      const steps = undoDepth(editor.state);
      ui.toast(`Moved to “${titleOf(n)}”`, { label: 'Undo', byKey: true, run: () => {
        if (n.body === moved) notes.update(n.id, was);
        if (deleted && !editor.isDestroyed && undoDepth(editor.state) === steps) editor.commands.undo();
      } });
    } }))
    : [{ label: 'No other note to move it to', disabled: true }]);
}

function untitled(base: string): string {
  const taken = new Set(notes.visible.map((n) => titleOf(n)));
  let title = base;
  for (let i = 2; taken.has(title); i++) title = `${base} ${i}`;
  return title;
}

export function newPage(editor: Editor, named = '') {
  const parent = notes.current;
  const title = untitled(named.trim() || 'Untitled');
  editor.chain().focus().insertContent([{ type: 'wikiLink', attrs: { title } }, { type: 'text', text: ' ' }]).run();
  notes.selectTitle = !named.trim();
  notes.create(`# ${title}\n\n`, parent?.id, { linkedFromParent: true });
}
