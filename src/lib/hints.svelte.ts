import { shortcuts } from './shortcuts.svelte';
import { isMobile } from './platform';

/**
 * Shortcut tips from what the user just did: something done the long way (a button, a menu, the "/"
 * list, cut then paste) that a key does in one go. Each tip shows a few times at most, never two in a
 * row too close together, and not at all when turned off in Settings or on a phone (no keys there).
 */
const LS = 'eve.hints';
const TIMES = 3; // a tip stops once it has been seen this many times
const GAP = 25_000; // ms between any two tips

interface Saved { off: boolean; seen: Record<string, number> }
function load(): Saved {
  try { return { off: false, seen: {}, ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; }
  catch { return { off: false, seen: {} }; }
}

class Hints {
  saved = $state<Saved>(load());
  /** the tip on screen */
  current = $state<{ text: string; keys: string[] } | null>(null);
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  get on() { return !this.saved.off; }
  setOn(on: boolean) { this.saved.off = !on; this.persist(); if (!on) this.current = null; }
  private persist() { localStorage.setItem(LS, JSON.stringify(this.saved)); }

  /** A tip for `key` (a stable id), saying `text`, with the keys that do it. Quietly skipped when due. */
  show(key: string, text: string, keys: string | string[]) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
    if (isMobile || this.saved.off || !list.length) return;
    if ((this.saved.seen[key] ?? 0) >= TIMES || Date.now() - this.last < GAP) return;
    this.saved.seen[key] = (this.saved.seen[key] ?? 0) + 1;
    this.persist();
    this.last = Date.now();
    this.current = { text, keys: list };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.current = null), 5000);
  }
  /** a tip for an action in the shortcut store, named by its label */
  action(id: string, text?: string) {
    const a = shortcuts.actions.find((x) => x.id === id);
    if (a) this.show(id, text ?? `${a.label.replace(/ \(.*$/, '')} has a shortcut`, a.keys);
  }
  dismiss() { clearTimeout(this.timer); this.current = null; }
  reset() { this.saved.seen = {}; this.persist(); }
}

export const hints = new Hints();
