import { history } from './history.svelte';
import { focusNote } from './popup';
import { isMobile } from './platform';
import { shifting, shiftingUntil } from './focusWatch';
/** One line of a menu. `sep` starts a group above it; a `hide` item never makes the list; `checked` is the current choice. */
export interface MenuItem { label: string; run?: () => void; keys?: string; sep?: boolean; disabled?: boolean; danger?: boolean; hide?: boolean; checked?: boolean;
  /** a colour drawn as a chip before the label (a highlighter's pen) */
  swatch?: string;
  /** other words a menu with a search field finds it by (a language's aliases: py, js) */
  keywords?: string }

/** In-app confirm/prompt (WKWebView has no native JS dialogs). Rendered by Confirm.svelte. */
interface Pending { message: string; input?: string; danger?: boolean; yes?: string; alert?: boolean;
  /** a command to run in Terminal, shown under the message with a Copy button */
  command?: string; resolve: (v: string | null) => void }

/** a kanban card opened as a floating page; edits stream back through onChange */
export interface CardReq {
  title: string; body: string;
  /** a line above the page (a template says what it is) */
  note?: string;
  onChange: (c: { title: string; body: string }) => void;
  /** deletes the card from its board (a phone's way to; the Mac has ⌫ on the focused card) */
  onDelete?: () => void;
  /** a whole note's markdown, edited as it is (a daily note: its first line need not be a title) */
  markdown?: string; onMarkdown?: (md: string) => void;
  /** the note it is (a day's): a database in it keeps its rows under it. None, a card's: no rows of its own */
  page?: () => string | null;
  resolve: () => void;
}

interface EmojiReq { at: DOMRect; current: string; resolve: (v: string | null) => void }

/**
 * Everything that opens over the app and goes away again: a picture shown full size, a formula being edited, a
 * phone's sheet, the emoji picker, a menu, a dialog, a diagram on the whole screen, Find, a PDF, a card's page,
 * Settings. Each was a field of its own once, and every place that closes "whatever is open" (a phone's back, Esc,
 * a note brought up from outside, the window coming back) listed them again by hand: a layer added later was missed
 * by some of them, and each put the focus back its own way. Now they are one stack, in the order they opened —
 * which is the order back and Esc take them away, the newest first.
 */
export type LayerId = 'photo' | 'math' | 'sheet' | 'emoji' | 'menu' | 'confirm' | 'diagramView' | 'find' | 'pdf' | 'card' | 'settings' | 'trash' | 'history' | 'present';
/** what closed it: a phone's back, Esc, or the app putting everything away (a note brought up from outside) */
export type CloseReason = 'back' | 'esc' | 'putAway';
export interface Layer {
  id: LayerId;
  /** close it, as its own ✕ does (it is off the stack already) */
  close(reason: CloseReason): void;
  /** the app's Esc closes it. Left out by the ones that take Esc themselves (a dialog, the picker, Settings) */
  esc?: boolean;
  /** it takes every key while it is up: the app's shortcuts wait (a menu, a dialog, the picker, a diagram) */
  keys?: boolean;
  /** it owns the keyboard: the window coming back puts nothing behind it in focus */
  modal?: boolean;
  /** what had the keyboard as it opened: it goes back there */
  from: Element | null;
  /** its own DOM: focus still in it as it fades out is no one's, and a `from` inside it is no place to go back to */
  own?: string;
  /** not modal, or closed by a click elsewhere: focus that has moved on somewhere else by itself stays there */
  yields?: boolean;
  /** a phone too. Most don't: a phone has no keyboard focus to lose, and focusing a note would raise its keyboard */
  phone?: boolean;
  /** put back this many ms later, and only if it is still nowhere: its callers put the keyboard where they want first */
  settle?: number;
}

/** The keyboard back to `from`; with that gone (taken off the page, <body>, inside what is closing), to the note. */
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
  } // (on a phone the note would raise its keyboard: nothing, there)
}

class Layers {
  // the stack itself, and what the page reads of it (state): an effect that opens one (Settings) must not read what
  // it writes, or it runs again for ever
  private items: Layer[] = [];
  private shown = $state.raw<readonly Layer[]>([]);
  private set(list: Layer[]) { this.items = list; this.shown = list; }
  /** open now, the oldest first */
  get all(): readonly Layer[] { return this.shown; }
  get top(): Layer | null { return this.shown.at(-1) ?? null; }
  get count() { return this.shown.length; }
  has(id: LayerId) { return this.shown.some((l) => l.id === id); }
  get(id: LayerId) { return this.shown.findLast((l) => l.id === id) ?? null; }
  /** one is up that takes every key (the app's shortcuts wait) */
  get grabbing() { return this.shown.some((l) => l.keys); }
  /** one is up that owns the keyboard */
  get modal() { return this.shown.some((l) => l.modal); }

  /** Opened: on top, the keyboard's place kept for it. The result takes it off again (closed, or unmounted). */
  push(layer: Omit<Layer, 'from'> & { from?: Element | null }): () => void {
    const l: Layer = { ...layer, from: layer.from !== undefined ? layer.from : document.activeElement };
    this.set([...this.items, l]);
    return () => this.remove(l);
  }
  /** Close the one on top; false when nothing is open. */
  closeTop(reason: CloseReason): boolean {
    const l = this.items.at(-1);
    if (!l) return false;
    this.shut(l, reason);
    return true;
  }
  /** Close everything, the newest first. */
  closeAll(reason: CloseReason) {
    for (let l = this.items.at(-1); l; l = this.items.at(-1)) this.shut(l, reason);
  }
  /** Tab with a modal layer on top goes round its own controls, never out to the list or the note behind it (it
   *  walked out of the Trash and Version history onto the toolbar and the list's search). True when it turned it. */
  trapTab(e: KeyboardEvent): boolean {
    const l = this.items.at(-1), all = l?.modal && l.own ? document.querySelectorAll<HTMLElement>(l.own) : null, box = all?.[all.length - 1];
    if (e.key !== 'Tab' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !box) return false;
    const els = [...box.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !(el as HTMLButtonElement).disabled && (el.checkVisibility?.() ?? true));
    if (!els.length) return false;
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (i >= 0 && (e.shiftKey ? i > 0 : i < els.length - 1)) return false; // inside it, not at its end: as usual
    e.preventDefault();
    els[e.shiftKey ? els.length - 1 : 0].focus();
    return true;
  }
  /** an Esc nothing else took: the layer on top closes, if Esc closes it */
  escape(): boolean {
    return !!this.items.at(-1)?.esc && this.closeTop('esc');
  }
  /** off the stack before it is told to close: what it does as it goes (a sheet slides away before it unmounts)
   *  must not leave it on top, taking the next back that was meant for what is under it */
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
  /** the one way the keyboard goes back as anything closes */
  private giveBack(l: Layer) {
    if (isMobile && !l.phone) return;
    const go = () => {
      const a = document.activeElement;
      // (still in it as it fades out, or on <body>: no one has taken it)
      if (l.yields && a && a !== document.body && a.isConnected && !(l.own && a.closest(l.own))) return;
      focusBack(l.from, l.own);
    };
    if (!l.settle) return go();
    const done = shiftingUntil();
    setTimeout(() => { done(); shifting(go); }, l.settle);
  }
}

class Ui {
  /** what is open over the app, in the order it opened (see Layer) */
  layers = new Layers();

  /** emoji picker request (EmojiPicker.svelte renders it) */
  emoji = $state<EmojiReq | null>(null);
  private emojiOff: (() => void) | undefined;
  /** Pick an emoji near `anchor`. Resolves the emoji, '' to remove, or null when dismissed. */
  pickEmoji(anchor: HTMLElement | DOMRect, current = ''): Promise<string | null> {
    const r = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect();
    // Closed however (picked, removed, dismissed), each caller puts the keyboard back where the picker was opened
    // from (the list's row, the note); should the focus still be nowhere after that, it goes back to where it was
    // when the picker opened, so it is never simply lost.
    this.emojiOff ??= this.layers.push({ id: 'emoji', close: () => this.emojiDone(null), keys: true, modal: true, own: '[aria-label="Choose an icon"]', yields: true, settle: 60 });
    return new Promise((res) => { this.emoji = { at: r, current, resolve: res }; });
  }
  emojiDone(v: string | null) {
    this.emoji?.resolve(v);
    this.emoji = null;
    this.emojiOff?.();
    this.emojiOff = undefined;
  }
  /** the floating pages open, the newest on top: a board's card opened from a day's page goes over that page (with
   *  one slot the card took the day's place, and the page shown stayed the day's: the card never opened) */
  cards = $state<CardReq[]>([]);
  private cardOffs: (() => void)[] = [];
  /** the floating page on top */
  get card(): CardReq | null { return this.cards.at(-1) ?? null; }
  /** Closed however (Esc, a click outside, a phone's back): the keyboard goes back where it was. Opened by a
   *  click (the template buttons take no focus) it was nowhere, so it goes to the note, or the calendar's day. */
  private pushCard(c: CardReq) {
    this.cards.push(c);
    this.cardOffs.push(this.layers.push({ id: 'card', close: () => this.closeCard(), esc: true, own: '.card-page', phone: true }));
  }
  /** Open a card as a floating page; resolves when it closes. */
  openCard(c: { title: string; body: string; note?: string }, onChange: CardReq['onChange'], onDelete?: () => void): Promise<void> {
    return new Promise((res) => this.pushCard({ ...c, onChange, onDelete, resolve: res }));
  }
  /** A note's markdown as a floating page (a day from the calendar, the daily template); resolves when it closes. */
  openPage(markdown: string, onMarkdown: (md: string) => void, note?: string, page?: () => string | null): Promise<void> {
    return new Promise((res) => this.pushCard({ title: '', body: '', markdown, onMarkdown, note, page, onChange: () => {}, resolve: res }));
  }
  /** the page on top closes; the one under it, if any, is the page again */
  closeCard() {
    const c = this.cards.pop();
    if (!c) return;
    c.resolve();
    this.cardOffs.pop()?.();
  }
  /** a diagram block filling the screen, to zoom into and edit there (DiagramBlock.svelte): how to put it back */
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
  /** a picture shown full size over everything (ImageViewer.svelte): a double-click on it, or ↩ with it selected */
  photo = $state<{ src: string; alt: string; menu?: (at: { clientX: number; clientY: number }) => void } | null>(null);
  private photoOff: (() => void) | undefined;
  /** `menu`: the picture's own menu, opened by a click (or right-click) on it as it is shown. Closed, the keyboard
   *  goes back to where it was: the note (or the card) with the picture still selected. */
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
  /** a PDF opened from a note, shown by PdfViewer.svelte as a floating panel (nothing modal about it). Closed, the
   *  keyboard goes back to where it was when the panel opened (the note, the list), unless it has moved on
   *  somewhere else since: a click in the note while it is open is the note's. */
  pdf = $state<{ src: string; name: string } | null>(null);
  private pdfOff: (() => void) | undefined;
  openPdf(src: string, name: string) {
    // another PDF opened over the first keeps where the first came from
    this.pdfOff ??= this.layers.push({ id: 'pdf', close: () => this.closePdf(), esc: true, own: '.pdf-panel', yields: true });
    this.pdf = { src, name };
  }
  closePdf() {
    this.pdf = null;
    this.pdfOff?.();
    this.pdfOff = undefined;
  }
  /** The document took the keyboard by itself as it loaded: back to where it was (the panel is not modal). */
  pdfGiveBack() {
    if (isMobile) return;
    focusBack(this.layers.get('pdf')?.from ?? null, '.pdf-panel');
  }

  /** every menu (a right click, the list's "+", a code block's language) at a point; the app draws its own
   *  everywhere, the webview's is suppressed. Menu.svelte draws it: a popup on the Mac, a sheet on a phone. */
  menu = $state<{ x: number; y: number; from?: Edge; items: MenuItem[]; search?: string } | null>(null);
  private menuOff: (() => void) | undefined;
  private menuClosed: (() => void) | undefined;
  /** `search`: a field over the items, its placeholder; what is typed narrows them (a long list: a code block's languages) */
  openMenu(at: { clientX: number; clientY: number; from?: Edge }, items: MenuItem[], onclose?: () => void, search?: string) {
    this.menuClosed?.();
    this.menuClosed = onclose;
    // dismissed or picked: whatever had the keyboard gets it back (a picked item may take it again). One opened over
    // another keeps where the first came from: the keyboard is on the first one's items by then
    this.menuOff ??= this.layers.push({ id: 'menu', close: () => this.closeMenu(), esc: true, keys: true, modal: true, own: '.menu', phone: true });
    // a hidden item that started a group hands its divider on to the next one shown, and a group whose items
    // all went away must not leave its divider at the top of the menu
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

  /** A phone's sheet (BottomSheet: a setting's choices; a menu's sheet is the menu's layer). A setting's choices
   *  keep their open state to themselves, so they must be layers too, or back closed all of Settings under them. */
  openedSheet(close: () => void) {
    return this.layers.push({ id: 'sheet', close, modal: true });
  }
  /** close the newest sheet; false when none is open */
  closeSheet(): boolean {
    if (this.layers.top?.id !== 'sheet') return false;
    return this.layers.closeTop('back');
  }
  /** a formula being edited in place (MathEdit.svelte), finished as Esc finishes it: a phone's back closes it before
   *  what is under it, and its keyboard with it (it stayed up over the list). It puts the caret back itself. */
  editingMath(close: () => void) {
    return this.layers.push({ id: 'math', close, esc: true, own: '.math-edit', yields: true });
  }
  /** Settings (App's): it takes nothing from the keyboard's place. Closed however (Esc, ✕, a click beside it), the
   *  keyboard is back where it was — the list's row, the note — unless something has taken it meanwhile. */
  openedSettings(close: () => void) {
    return this.layers.push({ id: 'settings', close, keys: true, modal: true, own: '[role="dialog"][aria-label="Settings"]', yields: true });
  }

  /** the find bar over the open note (⌘F); closed however, the caret is back in the note */
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
  /** the trash, open (TrashPanel.svelte) */
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
  /** the note whose versions are shown (HistoryPanel.svelte), or null */
  /** the open note shown a slide at a time over everything (Present.svelte): its page's blocks are what is shown */
  present = $state<HTMLElement | null>(null);
  private presentOff: (() => void) | undefined;
  openPresent(page: HTMLElement) {
    this.presentOff ??= this.layers.push({ id: 'present', close: () => this.closePresent(), esc: true, keys: true, modal: true, own: '.present', phone: true });
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
  /** focus goes back to where it was (sidebar row, editor) the moment the dialog closes — synchronously, before its
   *  answer is heard and any list re-renders, so a later focusRow() can still override it */
  private asking(p: Pending) {
    this.pendingOff ??= this.layers.push({ id: 'confirm', close: () => this.done(null), keys: true, modal: true, own: '.box[role="dialog"]', phone: true });
    this.pending = p;
  }
  /** which pane owns keyboard focus; dialogs don't change it, so focus can return there afterwards */
  focusOwner = $state<'editor' | 'sidebar'>('editor');

  /** Yes/no. `danger` is a deletion: a bin, a red "Delete". Anything else confirms with `yes` (default "OK"). */
  ask(message: string, danger = true, yes?: string): Promise<boolean> {
    return new Promise((res) => this.asking({ message, danger, yes, resolve: (v) => res(v !== null) }));
  }
  /** Something to know, not a choice: one OK, no Cancel (and a command to copy, when that is what to do next). */
  tell(message: string, command?: string): Promise<void> {
    return new Promise((res) => this.asking({ message, command, danger: false, alert: true, resolve: () => res() }));
  }
  /** Text input; resolves null on cancel. */
  prompt(message: string, initial = ''): Promise<string | null> {
    return new Promise((res) => this.asking({ message, input: initial, resolve: res }));
  }
  done(v: string | null) {
    const p = this.pending;
    this.pending = null;
    this.pendingOff?.();
    this.pendingOff = undefined;
    p?.resolve(v);
  }

  /** A line at the bottom of the window that says what just happened (a note deleted), with one thing to do about it
   *  (Undo). Toast.svelte draws it. A newer one takes its place; on its own it goes after a few seconds. */
  toastMsg = $state<{ message: string; action?: { label: string; run: () => void }; id: number } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastSeq = 0;
  toast(message: string, action?: { label: string; run: () => void }, ms = 6000) {
    clearTimeout(this.toastTimer);
    const id = ++this.toastSeq;
    this.toastMsg = { message, action, id };
    this.toastTimer = setTimeout(() => { if (this.toastMsg?.id === id) this.toastMsg = null; }, ms);
  }
  /** its button: what it offers is done once, and the toast goes with it */
  toastAction() {
    const run = this.toastMsg?.action?.run;
    this.dismissToast();
    run?.();
  }
  dismissToast() { clearTimeout(this.toastTimer); this.toastMsg = null; }

  /** ⌘Z (not ⇧⌘Z) with the keyboard outside a note, a field or a popup's input: the newest thing done to the notes or
   *  the groups taken back (history.svelte.ts). True when it took something back, and the key is spent. */
  undoKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
    const t = e.target as Element | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"], .tiptap')) return false;
    // the keyboard nowhere (a click took it off a board's card, a database's checkbox): not the list's either. Taken
    // for it, ⌘Z after a card dragged in a new note undid the ⌘N, and the note went to the Trash with the board in it
    if (!t || t === document.body || t === document.documentElement) return false;
    if (!history.undo()) return false;
    this.dismissToast();
    return true;
  }

  /** what is typed in the list's search box: the list shows only what it finds while there is any */
  search = $state('');
}

/** a box on screen (a DOMRect, a caret's coordsAtPos) */
type Edge = { left: number; right: number; top: number; bottom: number };
/**
 * Where a menu opened from a button (or the caret) goes: under it, or over it when there is no room under it. Given
 * only the point under it, a menu turned upwards was drawn up from that point and lay over the button it came from
 * (a database's column, its + and its tags, near the window's foot).
 */
export function under(el: Element | Edge): { clientX: number; clientY: number; from: Edge } {
  const r = el instanceof Element ? el.getBoundingClientRect() : el;
  return { clientX: Math.round(r.left), clientY: Math.round(r.bottom + 4), from: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
}

export const ui = new Ui();

/** Imperative hooks a component registers for others to call (plain object, not state). */
export const hooks: {
  openPlus?: (anchor?: HTMLElement) => void;
  /** a diagram being edited: one step out of it, as Esc does (a phone's back) */
  diagramBack?: () => void;
  /** append markdown to the open note (a dropped attachment; registered by the editor) */
  attach?: (markdown: string) => void;
  /** the caret in sight, the page moved only if it was not (the window coming back, not an edit) */
  caretIntoView?: () => void;
  /** run an editor action by id on the open note (the phone's formatting bar) */
  command?: (id: string) => void;
  /** the same on the sheet over it (a card, a day, a template), while one is open */
  cardCommand?: (id: string) => void;
  /** go to one of the open note's headings (an eve:// link into the note already open) */
  section?: (heading: string) => void;
  /** the open note's page, the blocks a presentation shows (registered by the editor) */
  page?: () => HTMLElement | null;
} = {};
