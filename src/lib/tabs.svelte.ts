import { notes, CALENDAR } from './notes.svelte';

/**
 * Notes open side by side in tabs (Notion's desktop tabs), on the Mac. The tab in front is always the open note
 * (notes.currentId): opening a note any way (the list, a link, back) changes what the front tab shows, as a
 * browser's tab follows its links, and choosing a tab opens its note. ⌘T a new one, ⌘W closes, ⌘⇧T brings back the
 * last closed, ⌃Tab steps through; a pinned tab stays at the front of the row and ⌘W leaves it. Kept per device.
 * ponytail: one back/forward history for all tabs, not one per tab; give each tab its own if it is missed.
 */
export interface Tab { id: string; pinned?: boolean }
const LS = 'eve.tabs';

class Tabs {
  list = $state<Tab[]>(load());
  /** the closed ones, newest last, for ⌘⇧T */
  private closed: Tab[] = [];

  /** the front tab's index: the one showing the open note */
  get front(): number { return this.list.findIndex((t) => t.id === notes.currentId); }

  /** The open note changed: the front tab shows it (made the first tab when there is none). A tab whose note was
   *  deleted closes. Called from App's effect, and by the methods here. */
  follow(prev: string | null) {
    const live = (id: string) => id === CALENDAR || id === notes.currentId || notes.all.some((n) => n.id === id && !n.deleted);
    const cur = notes.currentId;
    // the note now open takes the place of the one before it, a deleted one's too: looked up after the deleted tab was
    // dropped, the new note went to the end of the row (and Undo put the first tab back last)
    const at = prev ? this.list.findIndex((t) => t.id === prev && !t.pinned) : -1;
    if (cur && at >= 0 && !this.list.some((t) => t.id === cur)) this.list[at] = { id: cur };
    this.list = this.list.filter((t) => live(t.id));
    if (cur && !this.list.some((t) => t.id === cur)) this.list.push({ id: cur });
    this.save();
  }

  /** ⌘T, or a note ⌘-clicked: `id` in a new tab, in front (a note already in a tab just comes to front) */
  open(id: string) {
    if (!this.list.some((t) => t.id === id)) this.list.push({ id });
    this.save();
    notes.currentId = id;
  }
  /** ⌘W: the front tab closed (a pinned one stays), the one beside it in front. False with one tab left, or none */
  close(i = this.front): boolean {
    const t = this.list[i];
    if (!t || t.pinned || this.list.length < 2) return false;
    const wasFront = notes.currentId === t.id;
    this.closed.push(t);
    this.list.splice(i, 1);
    if (wasFront) notes.currentId = this.list[Math.min(i, this.list.length - 1)].id;
    this.save();
    return true;
  }
  /** ⌘⇧T: the last tab closed, whose note is still there */
  reopen(): boolean {
    while (this.closed.length) {
      const t = this.closed.pop()!;
      if (t.id !== CALENDAR && !notes.all.some((n) => n.id === t.id && !n.deleted)) continue;
      this.open(t.id);
      return true;
    }
    return false;
  }
  /** ⌃Tab / ⌃⇧Tab: the next tab (or the one before), round the row */
  step(d: 1 | -1) {
    if (this.list.length < 2) return;
    notes.currentId = this.list[(this.front + d + this.list.length) % this.list.length].id;
  }
  /** pinned tabs go to the front of the row, in the order they were pinned */
  pin(i: number, on: boolean) {
    const t = this.list[i];
    if (!t) return;
    this.list.splice(i, 1);
    const pins = this.list.filter((x) => x.pinned).length;
    this.list.splice(pins, 0, on ? { ...t, pinned: true } : { id: t.id }); // unpinned: the first after the pinned ones
    this.save();
  }
  /** every tab but `i` (and the pinned ones) closed */
  closeOthers(i: number) {
    const keep = this.list[i];
    for (const t of this.list) if (t !== keep && !t.pinned) this.closed.push(t);
    this.list = this.list.filter((t) => t === keep || t.pinned);
    if (keep) notes.currentId = keep.id;
    this.save();
  }
  private save() {
    try { localStorage.setItem(LS, JSON.stringify(this.list)); } catch { /* kept for this run only */ }
  }
}

function load(): Tab[] {
  try {
    const l = JSON.parse(localStorage.getItem(LS) ?? '[]');
    return Array.isArray(l) ? l.filter((t) => typeof t?.id === 'string').map((t) => ({ id: t.id, ...(t.pinned ? { pinned: true } : {}) })) : [];
  } catch { return []; }
}

export const tabs = new Tabs();
