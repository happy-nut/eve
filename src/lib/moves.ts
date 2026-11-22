import { notes, type Note } from './notes.svelte';
import { CALENDAR_NOTE_ID } from './daily';
import { tree } from './tree.svelte';

type NoteSlot = { parent: string; before: string | null };
const shownParent = (n: Note) => notes.shownParent(n);
function noteSlots(me: Note): NoteSlot[] {
  const out: NoteSlot[] = [];
  const pages = (parent: string) => {
    for (const p of notes.visible) {
      if (shownParent(p) !== parent) continue;
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

export function nudgeNote(id: string, dir: 1 | -1, dry = false): boolean {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return false;
  const list = noteSlots(me).filter((s) => me.id !== CALENDAR_NOTE_ID || !s.parent);
  const sibs = notes.visible.filter((n) => shownParent(n) === shownParent(me));
  const i = sibs.findIndex((n) => n.id === id);
  const at = list.findIndex((s) => s.parent === shownParent(me) && s.before === (sibs[i + 1]?.id ?? null));
  const t = list[at + dir];
  if (at < 0 || !t) return false;
  if (dry) return true;
  if (t.parent) tree.unfold(t.parent);
  notes.place(id, t.parent, t.before);
  return true;
}

export function nestNote(id: string, dir: 'in' | 'out', above?: string, dry = false): boolean {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return false;
  if (dir === 'out') {
    const up = shownParent(me);
    const parent = up ? notes.all.find((n) => n.id === up) : null;
    if (!parent) return false;
    if (dry) return true;
    notes.setParent(id, parent.parent ?? null);
  } else {
    const host = above && notes.all.find((n) => n.id === above);
    if (!host || host.id === CALENDAR_NOTE_ID || host.id === me.parent || notes.isAncestor(id, host.id)) return false;
    if (dry) return true;
    tree.unfold(host.id);
    notes.setParent(id, host.id);
  }
  return true;
}
