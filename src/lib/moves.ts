import { notes, type Note } from './notes.svelte';
import { CALENDAR_NOTE_ID } from './daily';
import { tree } from './tree.svelte';

type NoteSlot = { parent: string; before: string | null };
function noteSlots(me: Note): NoteSlot[] {
  const out: NoteSlot[] = [];
  const pages = (parent: string) => {
    for (const p of notes.visible) {
      if (notes.shownParent(p) !== parent) continue;
      if (p.id === me.id || notes.isAncestor(me.id, p.id)) continue;
      out.push({ parent, before: p.id });
      if (p.id !== CALENDAR_NOTE_ID && !tree.isFolded(p.id)) pages(p.id);
    }
    out.push({ parent, before: null });
  };
  pages('');
  return out;
}

export const openedFromList = { id: '' };

function nudgeSlot(id: string, dir: 1 | -1): NoteSlot | null {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return null;
  const list = noteSlots(me).filter((s) => me.id !== CALENDAR_NOTE_ID || !s.parent);
  const sibs = notes.visible.filter((n) => notes.shownParent(n) === notes.shownParent(me));
  const i = sibs.findIndex((n) => n.id === id);
  const at = list.findIndex((s) => s.parent === notes.shownParent(me) && s.before === (sibs[i + 1]?.id ?? null));
  const t = list[at + dir];
  return at < 0 || !t ? null : t;
}

export const canNudge = (id: string, dir: 1 | -1): boolean => nudgeSlot(id, dir) !== null;

export function nudgeNote(id: string, dir: 1 | -1): boolean {
  const t = nudgeSlot(id, dir);
  if (!t) return false;
  if (t.parent) tree.unfold(t.parent);
  notes.place(id, t.parent, t.before);
  return true;
}

function nestParent(id: string, dir: 'in' | 'out', above?: string): { parent: string | null } | null {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return null;
  if (dir === 'out') {
    const up = notes.shownParent(me);
    const parent = up ? notes.all.find((n) => n.id === up) : null;
    return parent ? { parent: parent.parent ?? null } : null;
  }
  const host = above && notes.all.find((n) => n.id === above);
  if (!host || host.id === CALENDAR_NOTE_ID || host.id === me.parent || notes.isAncestor(id, host.id)) return null;
  return { parent: host.id };
}

export const canNest = (id: string, dir: 'in' | 'out', above?: string): boolean => nestParent(id, dir, above) !== null;

export function nestNote(id: string, dir: 'in' | 'out', above?: string): boolean {
  const to = nestParent(id, dir, above);
  if (!to) return false;
  if (dir === 'in' && to.parent) tree.unfold(to.parent);
  notes.setParent(id, to.parent);
  return true;
}
