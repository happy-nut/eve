import { focusNote } from './popup';
import { isMobile } from './platform';
/** One line of a menu. `sep` starts a group above it; a `hide` item never makes the list; `checked` is the current choice. */
export interface MenuItem { label: string; run?: () => void; keys?: string; sep?: boolean; disabled?: boolean; danger?: boolean; hide?: boolean; checked?: boolean }

/** In-app confirm/prompt (WKWebView has no native JS dialogs). Rendered by Confirm.svelte. */
interface Pending { message: string; input?: string; danger?: boolean; yes?: string; alert?: boolean; resolve: (v: string | null) => void }

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
  resolve: () => void;
}

interface EmojiReq { x: number; y: number; current: string; resolve: (v: string | null) => void }

class Ui {
  /** emoji picker request (EmojiPicker.svelte renders it) */
  emoji = $state<EmojiReq | null>(null);
  /** Pick an emoji near `anchor`. Resolves the emoji, '' to remove, or null when dismissed. */
  pickEmoji(anchor: HTMLElement | DOMRect, current = ''): Promise<string | null> {
    const r = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect();
    this.emojiFrom = document.activeElement as HTMLElement | null;
    return new Promise((res) => { this.emoji = { x: r.left, y: r.bottom + 6, current, resolve: res }; });
  }
  private emojiFrom: HTMLElement | null = null;
  /** Closed however (picked, removed, dismissed). Each caller puts the keyboard back where the picker was
   *  opened from (the list's row, the note); should the focus still be nowhere after that, it goes back to
   *  where it was when the picker opened, so it is never simply lost. */
  emojiDone(v: string | null) {
    this.emoji?.resolve(v);
    this.emoji = null;
    const from = this.emojiFrom;
    this.emojiFrom = null;
    if (isMobile) return; // a phone has no keyboard focus to lose, and focusing a note would raise its keyboard
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected) return;
      if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true }); else focusNote();
    }, 60);
  }
  card = $state<CardReq | null>(null);
  /** Open a card as a floating page; resolves when it closes. */
  openCard(c: { title: string; body: string; note?: string }, onChange: CardReq['onChange'], onDelete?: () => void): Promise<void> {
    this.cardFrom = document.activeElement as HTMLElement | null;
    return new Promise((res) => { this.card = { ...c, onChange, onDelete, resolve: res }; });
  }
  /** A note's markdown as a floating page (a day from the calendar, the daily template); resolves when it closes. */
  openPage(markdown: string, onMarkdown: (md: string) => void, note?: string): Promise<void> {
    this.cardFrom = document.activeElement as HTMLElement | null;
    return new Promise((res) => { this.card = { title: '', body: '', markdown, onMarkdown, note, onChange: () => {}, resolve: res }; });
  }
  private cardFrom: HTMLElement | null = null;
  /** Closed however (Esc, a click outside, a phone's back): the keyboard goes back where it was. Opened by a
   *  click (the template buttons take no focus) it was nowhere, so it goes to the note, or the calendar's day. */
  closeCard() {
    if (!this.card) return;
    this.card.resolve();
    this.card = null;
    const from = this.cardFrom;
    this.cardFrom = null;
    if (from?.isConnected && from !== document.body && !from.closest('.card-page')) from.focus({ preventScroll: true });
    else focusNote();
  }
  /** a diagram block filling the screen, to zoom into and edit there (DiagramBlock.svelte): how to put it back */
  diagramView = $state<(() => void) | null>(null);
  private diagramViewFrom: HTMLElement | null = null;
  viewDiagram(close: () => void, from: HTMLElement | null = document.activeElement as HTMLElement | null) { this.diagramViewFrom = from; this.diagramView = close; }
  closeDiagramView() {
    const close = this.diagramView;
    if (close === null) return;
    this.diagramView = null;
    close();
    const from = this.diagramViewFrom;
    this.diagramViewFrom = null;
    if (!isMobile && from?.isConnected && from !== document.body) from.focus({ preventScroll: true });
  }
  /** a picture shown full size over everything (ImageViewer.svelte): a double-click on it, or ↩ with it selected */
  photo = $state<{ src: string; alt: string; menu?: (at: { clientX: number; clientY: number }) => void } | null>(null);
  private photoFrom: HTMLElement | null = null;
  /** `menu`: the picture's own menu, opened by a click (or right-click) on it as it is shown */
  viewImage(src: string, alt = '', menu?: (at: { clientX: number; clientY: number }) => void) { this.photoFrom = document.activeElement as HTMLElement | null; this.photo = { src, alt, menu }; }
  /** the keyboard goes back to where it was: the note (or the card) with the picture still selected */
  closeImage() {
    if (!this.photo) return;
    this.photo = null;
    const from = this.photoFrom;
    this.photoFrom = null;
    if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true }); else focusNote();
  }
  /** a PDF opened from a note, shown by PdfViewer.svelte as a floating panel (nothing modal about it) */
  pdf = $state<{ src: string; name: string } | null>(null);
  openPdf(src: string, name: string) {
    const a = document.activeElement as HTMLElement | null;
    if (!a?.closest('.pdf-panel')) this.pdfFrom = a; // another PDF opened over the first keeps where the first came from
    this.pdf = { src, name };
  }
  private pdfFrom: HTMLElement | null = null;
  /** The keyboard goes back to where it was when the panel opened (the note, the list), unless it has moved on
   *  somewhere else since: it is not modal, a click in the note while it is open is the note's. */
  closePdf() {
    this.pdf = null;
    const from = this.pdfFrom;
    this.pdfFrom = null;
    if (isMobile) return; // a phone has no keyboard focus to lose, and focusing a note would raise its keyboard
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && !a.closest('.pdf-panel')) return;
    if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true }); else focusNote();
  }
  /** The document took the keyboard by itself as it loaded: back to where it was (the panel is not modal). */
  pdfGiveBack() {
    if (isMobile) return;
    const from = this.pdfFrom;
    if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true }); else focusNote();
  }

  /** every menu (a right click, the list's "+", a code block's language) at a point; the app draws its own
   *  everywhere, the webview's is suppressed. Menu.svelte draws it: a popup on the Mac, a sheet on a phone. */
  menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  private menuFrom: HTMLElement | null = null;
  private menuClosed: (() => void) | undefined;
  openMenu(at: { clientX: number; clientY: number }, items: MenuItem[], onclose?: () => void) {
    this.menuClosed?.();
    this.menuClosed = onclose;
    this.menuFrom = document.activeElement as HTMLElement | null;
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
    this.menu = { x: at.clientX, y: at.clientY, items: shown };
  }
  /** Dismissed or picked: whatever had the keyboard gets it back (a picked item may take it again). */
  closeMenu() {
    this.menu = null;
    this.menuClosed?.();
    this.menuClosed = undefined;
    if (this.menuFrom?.isConnected) this.menuFrom.focus({ preventScroll: true });
    this.menuFrom = null;
  }

  /** A phone's sheets open now (BottomSheet: a menu, a setting's choices), newest last: Android's back closes the
   *  top one first. A setting's choices keep their open state to themselves, so back closed all of Settings. */
  private sheets: (() => void)[] = [];
  sheetsOpen = $state(0);
  openedSheet(close: () => void) {
    this.sheets.push(close);
    this.sheetsOpen = this.sheets.length;
    return () => { this.sheets = this.sheets.filter((c) => c !== close); this.sheetsOpen = this.sheets.length; };
  }
  /** close the newest sheet; false when none is open */
  closeSheet(): boolean {
    const close = this.sheets.at(-1);
    close?.();
    return !!close;
  }

  /** the find bar over the open note (⌘F) */
  find = $state(false);
  pending = $state<Pending | null>(null);
  /** which pane owns keyboard focus; dialogs don't change it, so focus can return there afterwards */
  focusOwner = $state<'editor' | 'sidebar'>('editor');

  /** Yes/no. `danger` is a deletion: a bin, a red "Delete". Anything else confirms with `yes` (default "OK"). */
  ask(message: string, danger = true, yes?: string): Promise<boolean> {
    return new Promise((res) => { this.pending = { message, danger, yes, resolve: (v) => res(v !== null) }; });
  }
  /** Something to know, not a choice: one OK, no Cancel. */
  tell(message: string): Promise<void> {
    return new Promise((res) => { this.pending = { message, danger: false, alert: true, resolve: () => res() }; });
  }
  /** Text input; resolves null on cancel. */
  prompt(message: string, initial = ''): Promise<string | null> {
    return new Promise((res) => { this.pending = { message, input: initial, resolve: res }; });
  }
  done(v: string | null) { this.pending?.resolve(v); this.pending = null; }

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

  /** what is typed in the list's search box: the list shows only what it finds while there is any */
  search = $state('');
}

export const ui = new Ui();

/** Imperative hooks a component registers for others to call (plain object, not state). */
export const hooks: {
  openPlus?: (anchor?: HTMLElement) => void;
  /** append markdown to the open note (a dropped attachment; registered by the editor) */
  attach?: (markdown: string) => void;
  /** put the caret in the middle of the page (the window coming back, not an edit) */
  centerCaret?: () => void;
  /** run an editor action by id on the open note (the phone's formatting bar) */
  command?: (id: string) => void;
  /** the same on the sheet over it (a card, a day, a template), while one is open */
  cardCommand?: (id: string) => void;
  /** go to one of the open note's headings (an eve:// link into the note already open) */
  section?: (heading: string) => void;
} = {};
