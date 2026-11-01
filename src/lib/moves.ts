// Moving pages one step at a time through the sidebar's outline (⌥ + arrows, the row menu).
import { notes, type Note } from './notes.svelte';
import { CALENDAR_NOTE_ID } from './daily';
import { tree } from './tree.svelte';

/**
 * Every spot the moving note could take, in the order the sidebar stacks them: before each page,
 * inside an unfolded page as a sub-page, at the end of each list. ⌥↑ / ⌥↓
 * step through this list, so a page slides *into* the one above instead of hopping over it.
 */
type NoteSlot = { parent: string; before: string | null };
/** the page a note shows under in the list: its parent while that is there, else none (a sub-page whose page was
 *  deleted is shown at the top level, and ⌥↑ / ⌥↓ looked for it under the deleted page and found nothing to step to) */
const shownParent = (n: Note) => (n.parent && notes.visible.some((p) => p.id === n.parent) ? n.parent : '');
function noteSlots(me: Note): NoteSlot[] {
  const out: NoteSlot[] = [];
  const pages = (parent: string) => {
    for (const p of notes.visible) {
      if (shownParent(p) !== parent) continue;
      if (p.id === me.id || notes.isAncestor(me.id, p.id)) continue; // itself and its own sub-pages
      out.push({ parent, before: p.id });
      if (!tree.isFolded(p.id)) pages(p.id); // an open page can take it in
    }
    out.push({ parent, before: null });
  };
  pages('');
  return out;
}

/**
 * The note just opened from the list, until its editor is clicked or typed in: ⌥↑ / ⌥↓ then still move it
 * in the list, as they would have with the row focused (the click put the caret in the note to write).
 */
export const openedFromList = { id: '' };

/** ⌥↑ / ⌥↓ on a note: one slot up/down — past a page, or into it. `dry`: only whether it could. */
export function nudgeNote(id: string, dir: 1 | -1, dry = false): boolean {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return false;
  // the calendar's row is never a sub-page: it steps past pages, never into them
  const list = noteSlots(me).filter((s) => me.id !== CALENDAR_NOTE_ID || !s.parent);
  const sibs = notes.visible.filter((n) => shownParent(n) === shownParent(me));
  const i = sibs.findIndex((n) => n.id === id);
  const at = list.findIndex((s) => s.parent === shownParent(me) && s.before === (sibs[i + 1]?.id ?? null));
  const t = list[at + dir];
  if (at < 0 || !t) return false;
  if (dry) return true;
  if (t.parent) tree.unfold(t.parent); // show where it landed
  notes.place(id, t.parent, t.before);
  return true;
}

/** ⌥→ tucks a note under `above` (the row over it) (a sub-page); ⌥← lifts it back out to its parent's level. */
export function nestNote(id: string, dir: 'in' | 'out', above?: string, dry = false): boolean {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return false;
  if (dir === 'out') {
    const parent = me.parent ? notes.all.find((n) => n.id === me.parent) : null;
    if (!parent) return false;
    if (dry) return true;
    notes.setParent(id, parent.parent ?? null);
  } else {
    // never one of its own sub-pages
    const host = above && notes.all.find((n) => n.id === above);
    if (!host || host.id === me.parent || notes.isAncestor(id, host.id)) return false;
    if (dry) return true;
    tree.unfold(host.id);
    notes.setParent(id, host.id);
  }
  return true;
}
