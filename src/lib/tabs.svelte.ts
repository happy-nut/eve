import { notes, CALENDAR } from './notes.svelte';
import { appearance } from './appearance.svelte';
import { saved, save } from './stored';

export interface Tab { id: string; pinned?: boolean }
const LS = 'eve.tabs';

class Tabs {
  list = $state<Tab[]>(load());
  private closed: Tab[] = [];
  private gone = new Map<string, { at: number; by: string | null }>();

  get front(): number { return this.list.findIndex((t) => t.id === notes.currentId); }

  private restoreDeletedTab(cur: string, back: { at: number; by: string | null }) {
    const i = Math.min(back.at, this.list.length);
    if (back.by && this.list[i]?.id === back.by) this.list[i] = { id: cur };
    else this.list.splice(i, 0, { id: cur });
  }

  private replaceFrontTab(prev: string, at: number, cur: string, live: (id: string) => boolean) {
    if (!live(prev)) this.gone.set(prev, { at, by: cur });
    this.list[at] = { id: cur };
  }

  follow(prev: string | null) {
    const live = (id: string) => (id === CALENDAR && appearance.s.dailyNotes) || id === notes.currentId || notes.exists(id);
    const cur = notes.currentId;
    const at = prev ? this.list.findIndex((t) => t.id === prev && !t.pinned) : -1;
    const back = cur ? this.gone.get(cur) : undefined;
    if (cur && back && !this.list.some((t) => t.id === cur)) this.restoreDeletedTab(cur, back);
    else if (cur && at >= 0 && !this.list.some((t) => t.id === cur)) this.replaceFrontTab(prev!, at, cur, live);
    if (cur) this.gone.delete(cur);
    this.list.forEach((t, i) => { if (!live(t.id)) this.gone.set(t.id, { at: i, by: null }); });
    this.list = this.list.filter((t) => live(t.id));
    if (cur && !this.list.some((t) => t.id === cur)) this.list.push({ id: cur });
    this.save();
  }

  open(id: string) {
    if (!this.list.some((t) => t.id === id)) this.list.push({ id });
    this.save();
    notes.currentId = id;
  }
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
  reopen(): boolean {
    while (this.closed.length) {
      const t = this.closed.pop()!;
      if (t.id !== CALENDAR && !notes.exists(t.id)) continue;
      this.open(t.id);
      return true;
    }
    return false;
  }
  step(d: 1 | -1) {
    if (this.list.length < 2) return;
    notes.currentId = this.list[(this.front + d + this.list.length) % this.list.length].id;
  }
  pin(i: number, on: boolean) {
    const t = this.list[i];
    if (!t) return;
    this.list.splice(i, 1);
    const pins = this.list.filter((x) => x.pinned).length;
    this.list.splice(pins, 0, on ? { ...t, pinned: true } : { id: t.id });
    this.save();
  }
  closeOthers(i: number) {
    const keep = this.list[i];
    for (const t of this.list) if (t !== keep && !t.pinned) this.closed.push(t);
    this.list = this.list.filter((t) => t === keep || t.pinned);
    if (keep) notes.currentId = keep.id;
    this.save();
  }
  private save() {
    save(LS, this.list);
  }
}

function load(): Tab[] {
  const l = saved<unknown>(LS, []);
  return Array.isArray(l) ? l.filter((t) => typeof t?.id === 'string').map((t) => ({ id: t.id, ...(t.pinned ? { pinned: true } : {}) })) : [];
}

export const tabs = new Tabs();
