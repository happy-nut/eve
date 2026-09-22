/** One line of a right-click menu. `sep` starts a group above it; a `hide` item never makes the list. */
export interface MenuItem { label: string; run?: () => void; keys?: string; sep?: boolean; disabled?: boolean; danger?: boolean; hide?: boolean }

/** In-app confirm/prompt (WKWebView has no native JS dialogs). Rendered by Confirm.svelte. */
interface Pending { message: string; input?: string; danger?: boolean; resolve: (v: string | null) => void }

/** a kanban card opened as a floating page; edits stream back through onChange */
export interface CardReq { title: string; body: string; onChange: (c: { title: string; body: string }) => void; resolve: () => void }

interface EmojiReq { x: number; y: number; current: string; resolve: (v: string | null) => void }

class Ui {
  /** emoji picker request (EmojiPicker.svelte renders it) */
  emoji = $state<EmojiReq | null>(null);
  /** Pick an emoji near `anchor`. Resolves the emoji, '' to remove, or null when dismissed. */
  pickEmoji(anchor: HTMLElement | DOMRect, current = ''): Promise<string | null> {
    const r = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect();
    return new Promise((res) => { this.emoji = { x: r.left, y: r.bottom + 6, current, resolve: res }; });
  }
  emojiDone(v: string | null) { this.emoji?.resolve(v); this.emoji = null; }
  card = $state<CardReq | null>(null);
  /** Open a card as a floating page; resolves when it closes. */
  openCard(c: { title: string; body: string }, onChange: CardReq['onChange']): Promise<void> {
    return new Promise((res) => { this.card = { ...c, onChange, resolve: res }; });
  }
  closeCard() { this.card?.resolve(); this.card = null; }
  /** a PDF opened from a note, shown by PdfViewer.svelte as a floating panel (nothing modal about it) */
  pdf = $state<{ src: string; name: string } | null>(null);
  openPdf(src: string, name: string) { this.pdf = { src, name }; }
  closePdf() { this.pdf = null; }
  /** how a pasted link should land: a card, plain underlined text, or both */
  link = $state<{ x: number; y: number; resolve: (v: 'card' | 'link' | 'both' | null) => void } | null>(null);
  pickLink(at: DOMRect): Promise<'card' | 'link' | 'both' | null> {
    return new Promise((res) => { this.link = { x: at.left, y: at.bottom + 6, resolve: res }; });
  }
  linkDone(v: 'card' | 'link' | 'both' | null) { this.link?.resolve(v); this.link = null; }

  /** a right-click menu at a point; the app draws its own everywhere, the webview's is suppressed */
  menu = $state<{ x: number; y: number; items: MenuItem[]; hover?: boolean } | null>(null);
  private menuFrom: HTMLElement | null = null;
  private menuCloser?: ReturnType<typeof setTimeout>;
  openMenu(at: { clientX: number; clientY: number }, items: MenuItem[], hover = false) {
    clearTimeout(this.menuCloser);
    // a hover popover takes no focus: the caret stays in the note, and typing goes on
    this.menuFrom = hover ? null : (document.activeElement as HTMLElement | null);
    const shown = items.filter((i) => !i.hide);
    // a group whose items all went away must not leave its divider at the top of the menu
    this.menu = { x: at.clientX, y: at.clientY, hover, items: shown.map((i, n) => (n === 0 && i.sep ? { ...i, sep: false } : i)) };
  }
  /** the pointer moved onto the popover (or back onto what opened it): it stays */
  keepMenu() { clearTimeout(this.menuCloser); }
  /** the pointer left: close, but late enough to cross the gap between the link and the popover */
  closeMenuSoon(ms = 220) {
    clearTimeout(this.menuCloser);
    this.menuCloser = setTimeout(() => { if (this.menu?.hover) this.closeMenu(); }, ms);
  }
  /** Dismissed or picked: whatever had the keyboard gets it back (a picked item may take it again). */
  closeMenu() {
    clearTimeout(this.menuCloser);
    this.menu = null;
    if (this.menuFrom?.isConnected) this.menuFrom.focus();
    this.menuFrom = null;
  }

  /** the find bar over the open note (⌘F) */
  find = $state(false);
  pending = $state<Pending | null>(null);
  /** which pane owns keyboard focus; dialogs don't change it, so focus can return there afterwards */
  focusOwner = $state<'editor' | 'sidebar'>('editor');

  /** Yes/no. `danger` colors the confirm button red. */
  ask(message: string, danger = true): Promise<boolean> {
    return new Promise((res) => { this.pending = { message, danger, resolve: (v) => res(v !== null) }; });
  }
  /** Text input; resolves null on cancel. */
  prompt(message: string, initial = ''): Promise<string | null> {
    return new Promise((res) => { this.pending = { message, input: initial, resolve: res }; });
  }
  done(v: string | null) { this.pending?.resolve(v); this.pending = null; }
}

export const ui = new Ui();

/** Imperative hooks a component registers for others to call (plain object, not state). */
export const hooks: {
  openPlus?: (anchor?: HTMLElement) => void;
  /** append markdown to the open note (a dropped attachment; registered by the editor) */
  attach?: (markdown: string) => void;
  /** put the caret in the middle of the page (the window coming back, not an edit) */
  centerCaret?: () => void;
} = {};
