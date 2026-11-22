import { history } from './history.svelte';
import type { Box } from './popup';
import { isMobile, memMark } from './platform';
import { shifting, shiftingUntil } from './focusWatch';
export interface MenuItem { label: string; run?: () => void; keys?: string; sep?: boolean; disabled?: boolean; danger?: boolean; hide?: boolean; checked?: boolean;
  swatch?: string;
  icon?: string;
  keywords?: string }

export interface Choice { label: string; icon?: string; value: string }
interface Pending { message: string; input?: string; danger?: boolean; yes?: string; alert?: boolean;
  choices?: (typed: string) => Choice[]; placeholder?: string;
  command?: string; resolve: (v: string | null) => void }

export interface CardReq {
  title: string; body: string;
  note?: string;
  onChange: (c: { title: string; body: string }) => void;
  onDelete?: () => void;
  markdown?: string; onMarkdown?: (md: string) => void;
  page?: () => string | null;
  resolve: () => void;
}

interface EmojiReq { at: DOMRect; current: string; resolve: (v: string | null) => void }

export type LayerId = 'photo' | 'math' | 'sheet' | 'emoji' | 'menu' | 'confirm' | 'diagramView' | 'find' | 'pdf' | 'card' | 'settings' | 'trash' | 'history' | 'present';
export type CloseReason = 'back' | 'esc' | 'putAway';
export interface Layer {
  id: LayerId;
  close(reason: CloseReason): void;
  esc?: boolean;
  keys?: boolean;
  modal?: boolean;
  from: Element | null;
  own?: string;
  yields?: boolean;
  phone?: boolean;
  settle?: number;
}

export function focusBack(from: Element | null, own?: string) {
  const ok = (e: HTMLElement | null) => !!e?.isConnected && e !== document.body && !(own && e.closest(own)) && typeof e.focus === 'function';
  // nowhere to go back to (a button WebKit gave no focus, so <body>): the note, kept where it was read too — the ⋯
  // menu closed on Esc took a note scrolled far down back up to its caret
  const el = ok(from as HTMLElement | null) ? (from as HTMLElement) : isMobile ? null : document.querySelector<HTMLElement>('main .tiptap, main .calendar .day.cursor');
  if (el) {
    // what it is in stays where it was: the note, focused, has the webview bring its caret into sight all the same
    // (preventScroll or not), and a diagram put back from the whole screen left the note at its end
    const kept: [Element, number, number][] = [];
    for (let s = el.parentElement; s; s = s.parentElement) if (s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth) kept.push([s, s.scrollTop, s.scrollLeft]);
    el.focus({ preventScroll: true });
    const put = () => { for (const [s, top, left] of kept) { s.scrollTop = top; s.scrollLeft = left; } };
    put();
    requestAnimationFrame(put);
  }
}

class Layers {
  // the stack itself, and what the page reads of it (state): an effect that opens one (Settings) must not read what
  // it writes, or it runs again for ever
  private items: Layer[] = [];
  private shown = $state.raw<readonly Layer[]>([]);
  private set(list: Layer[]) { this.items = list; this.shown = list; }
  get all(): readonly Layer[] { return this.shown; }
  get top(): Layer | null { return this.shown.at(-1) ?? null; }
  get count() { return this.shown.length; }
  has(id: LayerId) { return this.shown.some((l) => l.id === id); }
  get(id: LayerId) { return this.shown.findLast((l) => l.id === id) ?? null; }
  get grabbing() { return this.shown.some((l) => l.keys); }
  get modal() { return this.shown.some((l) => l.modal); }

  push(layer: Omit<Layer, 'from'> & { from?: Element | null }): () => void {
    const l: Layer = { ...layer, from: layer.from !== undefined ? layer.from : document.activeElement };
    this.set([...this.items, l]);
    memMark(l.id);
    return () => this.remove(l);
  }
  closeTop(reason: CloseReason): boolean {
    const l = this.items.at(-1);
    if (!l) return false;
    this.shut(l, reason);
    return true;
  }
  closeAll(reason: CloseReason) {
    for (let l = this.items.at(-1); l; l = this.items.at(-1)) this.shut(l, reason);
  }
  trapTab(e: KeyboardEvent): boolean {
    const l = this.items.at(-1), all = l?.modal && l.own ? document.querySelectorAll<HTMLElement>(l.own) : null, box = all?.[all.length - 1];
    if (e.key !== 'Tab' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !box) return false;
    const els = [...box.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !(el as HTMLButtonElement).disabled && (el.checkVisibility?.() ?? true));
    if (!els.length) return false;
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (i >= 0 && (e.shiftKey ? i > 0 : i < els.length - 1)) return false;
    e.preventDefault();
    els[e.shiftKey ? els.length - 1 : 0].focus();
    return true;
  }
  escape(): boolean {
    return !!this.items.at(-1)?.esc && this.closeTop('esc');
  }
  private shut(l: Layer, reason: CloseReason) {
    shifting(() => {
      this.set(this.items.filter((x) => x !== l));
      l.close(reason);
      this.giveBack(l);
    });
  }
  private remove(l: Layer) {
    if (!this.items.includes(l)) return;
    this.set(this.items.filter((x) => x !== l));
    shifting(() => this.giveBack(l));
  }
  private giveBack(l: Layer) {
    if (isMobile && !l.phone) return;
    const go = () => {
      const a = document.activeElement;
      if (l.yields && a && a !== document.body && a.isConnected && !(l.own && a.closest(l.own))) return;
      focusBack(l.from, l.own);
    };
    if (!l.settle) return go();
    const done = shiftingUntil();
    setTimeout(() => { done(); shifting(go); }, l.settle);
  }
}

class Ui {
  layers = new Layers();

  emoji = $state<EmojiReq | null>(null);
  private emojiOff: (() => void) | undefined;
  pickEmoji(anchor: HTMLElement | DOMRect, current = ''): Promise<string | null> {
    const r = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect();
    this.emojiOff ??= this.layers.push({ id: 'emoji', close: () => this.emojiDone(null), keys: true, modal: true, own: '[aria-label="Choose an icon"]', yields: true, settle: 60 });
    return new Promise((res) => { this.emoji = { at: r, current, resolve: res }; });
  }
  emojiDone(v: string | null) {
    this.emoji?.resolve(v);
    this.emoji = null;
    this.emojiOff?.();
    this.emojiOff = undefined;
  }
  cards = $state<CardReq[]>([]);
  private cardOffs: (() => void)[] = [];
  get card(): CardReq | null { return this.cards.at(-1) ?? null; }
  private pushCard(c: CardReq) {
    this.cards.push(c);
    this.cardOffs.push(this.layers.push({ id: 'card', close: () => this.closeCard(), esc: true, own: '.card-page', phone: true }));
  }
  openCard(c: { title: string; body: string; note?: string }, onChange: CardReq['onChange'], onDelete?: () => void): Promise<void> {
    return new Promise((res) => this.pushCard({ ...c, onChange, onDelete, resolve: res }));
  }
  openPage(markdown: string, onMarkdown: (md: string) => void, note?: string, page?: () => string | null): Promise<void> {
    return new Promise((res) => this.pushCard({ title: '', body: '', markdown, onMarkdown, note, page, onChange: () => {}, resolve: res }));
  }
  closeCard() {
    const c = this.cards.pop();
    if (!c) return;
    c.resolve();
    this.cardOffs.pop()?.();
  }
  diagramView = $state<(() => void) | null>(null);
  private diagramOff: (() => void) | undefined;
  viewDiagram(close: () => void, from: HTMLElement | null = document.activeElement as HTMLElement | null) {
    this.diagramOff ??= this.layers.push({ id: 'diagramView', close: () => this.closeDiagramView(), keys: true, modal: true, from });
    this.diagramView = close;
  }
  closeDiagramView() {
    const close = this.diagramView;
    if (close === null) return;
    this.diagramView = null;
    close();
    this.diagramOff?.();
    this.diagramOff = undefined;
  }
  photo = $state<{ src: string; alt: string; menu?: (at: { clientX: number; clientY: number }) => void } | null>(null);
  private photoOff: (() => void) | undefined;
  viewImage(src: string, alt = '', menu?: (at: { clientX: number; clientY: number }) => void) {
    this.photoOff ??= this.layers.push({ id: 'photo', close: () => this.closeImage(), esc: true, keys: true, modal: true, own: '.viewer', phone: true });
    this.photo = { src, alt, menu };
  }
  closeImage() {
    if (!this.photo) return;
    this.photo = null;
    this.photoOff?.();
    this.photoOff = undefined;
  }
  pdf = $state<{ src: string; name: string } | null>(null);
  private pdfOff: (() => void) | undefined;
  openPdf(src: string, name: string) {
    this.pdfOff ??= this.layers.push({ id: 'pdf', close: () => this.closePdf(), esc: true, own: '.pdf-panel', yields: true });
    this.pdf = { src, name };
  }
  closePdf() {
    this.pdf = null;
    this.pdfOff?.();
    this.pdfOff = undefined;
  }
  pdfGiveBack() {
    if (isMobile) return;
    focusBack(this.layers.get('pdf')?.from ?? null, '.pdf-panel');
  }

  menu = $state<{ x: number; y: number; from?: Box; items: MenuItem[]; search?: string } | null>(null);
  private menuOff: (() => void) | undefined;
  private menuClosed: (() => void) | undefined;
  openMenu(at: { clientX: number; clientY: number; from?: Box }, items: MenuItem[], onclose?: () => void, search?: string) {
    this.menuClosed?.();
    this.menuClosed = onclose;
    this.menuOff ??= this.layers.push({ id: 'menu', close: () => this.closeMenu(), esc: true, keys: true, modal: true, own: '.menu', phone: true });
    const shown: MenuItem[] = [];
    let sep = false;
    for (const i of items) {
      sep ||= !!i.sep;
      if (i.hide) continue;
      shown.push({ ...i, sep: sep && shown.length > 0 });
      sep = false;
    }
    this.menu = { x: at.clientX, y: at.clientY, from: at.from, items: shown, search };
  }
  closeMenu() {
    this.menu = null;
    this.menuClosed?.();
    this.menuClosed = undefined;
    this.menuOff?.();
    this.menuOff = undefined;
  }

  openedSheet(close: () => void) {
    return this.layers.push({ id: 'sheet', close, modal: true });
  }
  closeSheet(): boolean {
    if (this.layers.top?.id !== 'sheet') return false;
    return this.layers.closeTop('back');
  }
  editingMath(close: () => void) {
    return this.layers.push({ id: 'math', close, esc: true, own: '.math-edit', yields: true });
  }
  openedSettings(close: () => void) {
    return this.layers.push({ id: 'settings', close, keys: true, modal: true, own: '[role="dialog"][aria-label="Settings"]', yields: true });
  }

  #find = $state(false);
  get find() { return this.#find; }
  private findOff: (() => void) | undefined;
  openFind() {
    this.findOff ??= this.layers.push({ id: 'find', close: () => this.closeFind(), esc: true, own: '.find', phone: true, from: document.querySelector('main .tiptap') });
    this.#find = true;
  }
  closeFind() {
    this.#find = false;
    this.findOff?.();
    this.findOff = undefined;
  }
  trash = $state(false);
  private trashOff: (() => void) | undefined;
  openTrash() {
    this.trashOff ??= this.layers.push({ id: 'trash', close: () => this.closeTrash(), esc: true, keys: true, modal: true, own: '.rpanel[data-panel="trash"]', phone: true });
    this.trash = true;
  }
  closeTrash() {
    this.trash = false;
    this.trashOff?.();
    this.trashOff = undefined;
  }
  present = $state<HTMLElement | null>(null);
  presentFrom: Element | null = null;
  private presentOff: (() => void) | undefined;
  openPresent(page: HTMLElement, from: Element | null = null) {
    this.presentOff ??= this.layers.push({ id: 'present', close: () => this.closePresent(), esc: true, keys: true, modal: true, own: '.present', phone: true });
    this.presentFrom = from;
    this.present = page;
  }
  closePresent() {
    if (!this.present) return;
    this.present = null;
    this.presentOff?.();
    this.presentOff = undefined;
  }
  historyOf = $state<string | null>(null);
  private historyOff: (() => void) | undefined;
  openHistory(id: string) {
    this.historyOff ??= this.layers.push({ id: 'history', close: () => this.closeHistory(), esc: true, keys: true, modal: true, own: '.rpanel[data-panel="history"]', phone: true });
    this.historyOf = id;
  }
  closeHistory() {
    this.historyOf = null;
    this.historyOff?.();
    this.historyOff = undefined;
  }

  pending = $state<Pending | null>(null);
  private pendingOff: (() => void) | undefined;
  private asking(p: Pending) {
    this.pendingOff ??= this.layers.push({ id: 'confirm', close: () => this.done(null), keys: true, modal: true, own: '.box[role="dialog"]', phone: true });
    this.pending = p;
  }
  focusOwner = $state<'editor' | 'sidebar'>('editor');

  ask(message: string, danger = true, yes?: string): Promise<boolean> {
    return new Promise((res) => this.asking({ message, danger, yes, resolve: (v) => res(v !== null) }));
  }
  tell(message: string, command?: string): Promise<void> {
    return new Promise((res) => this.asking({ message, command, danger: false, alert: true, resolve: () => res() }));
  }
  prompt(message: string, initial = '', more: { choices?: (typed: string) => Choice[]; placeholder?: string } = {}): Promise<string | null> {
    return new Promise((res) => this.asking({ message, input: initial, ...more, resolve: res }));
  }
  done(v: string | null) {
    const p = this.pending;
    this.pending = null;
    this.pendingOff?.();
    this.pendingOff = undefined;
    p?.resolve(v);
  }

  toastMsg = $state<{ message: string; action?: ToastAction; id: number } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastSeq = 0;
  toast(message: string, action?: ToastAction, ms = 6000) {
    clearTimeout(this.toastTimer);
    const id = ++this.toastSeq;
    this.toastMsg = { message, action, id };
    this.toastTimer = setTimeout(() => { if (this.toastMsg?.id === id) this.toastMsg = null; }, ms);
  }
  toastAction() {
    const run = this.toastMsg?.action?.run;
    this.dismissToast();
    run?.();
  }
  dismissToast() { clearTimeout(this.toastTimer); this.toastMsg = null; }
  typed() { if (this.toastMsg?.action?.byKey) this.toastMsg.action.byKey = false; }
  toastUndoKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
    if (!this.toastMsg?.action?.byKey) return false;
    const t = e.target as Element | null;
    if (!t?.closest?.('.tiptap') || t.closest('input, textarea, select')) return false;
    this.toastAction();
    return true;
  }

  undoKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
    const t = e.target as Element | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"], .tiptap')) return false;
    if (!t || t === document.body || t === document.documentElement) return false;
    if (!history.undo()) return false;
    this.dismissToast();
    return true;
  }

  search = $state('');
}

export interface ToastAction { label: string; run: () => void; byKey?: boolean }

export function under(el: Element | Box): { clientX: number; clientY: number; from: Box } {
  const r = el instanceof Element ? el.getBoundingClientRect() : el;
  return { clientX: Math.round(r.left), clientY: Math.round(r.bottom + 4), from: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
}

export const ui = new Ui();

export function errorText(e: unknown): string {
  const s = (e instanceof Error ? e.message : String(e ?? '')).replace(/^\w*Error:\s*/, '').trim();
  if (!s) return 'Something went wrong.';
  return s[0].toUpperCase() + s.slice(1) + (/[.!?…]$/.test(s) ? '' : '.');
}

export const hooks: {
  openPlus?: (anchor?: HTMLElement) => void;
  diagramBack?: () => void;
  attach?: (markdown: string) => void;
  caretIntoView?: () => void;
  command?: (id: string) => void;
  cardCommand?: (id: string) => void;
  section?: (heading: string) => void;
  page?: () => HTMLElement | null;
} = {};
