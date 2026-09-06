/** In-app confirm/prompt (WKWebView has no native JS dialogs). Rendered by Confirm.svelte. */
interface Pending { message: string; input?: string; danger?: boolean; resolve: (v: string | null) => void }

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
export const hooks: { openPlus?: (anchor?: HTMLElement) => void } = {};
