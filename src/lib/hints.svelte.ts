import { shortcuts } from './shortcuts.svelte';
import { isMobile } from './platform';
import { saved, save } from './stored';

const LS = 'eve.hints';
const TIMES = 3;
const GAP = 25_000;

interface Saved { off: boolean; seen: Record<string, number> }
function load(): Saved {
  return { off: false, seen: {}, ...saved<Partial<Saved>>(LS, {}) };
}

class Hints {
  saved = $state<Saved>(load());
  current = $state<{ text: string; keys: string[] } | null>(null);
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  get on() { return !this.saved.off; }
  setOn(on: boolean) { this.saved.off = !on; this.persist(); if (!on) this.current = null; }
  private persist() { save(LS, this.saved); }

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
  action(id: string, text?: string) {
    const a = shortcuts.actions.find((x) => x.id === id);
    if (a) this.show(id, text ?? `${a.label.replace(/ \(.*$/, '')} has a shortcut`, a.keys);
  }
  dismiss() { clearTimeout(this.timer); this.current = null; }
  reset() { this.saved.seen = {}; this.persist(); }
}

export const hints = new Hints();
