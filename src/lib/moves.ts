// Moving notes and groups one step at a time through the sidebar's outline (⌥ + arrows, the row menu).
import { notes, type Note } from './notes.svelte';
import { groups, parentOf } from './groups.svelte';

/**
 * Every spot the moving note could take, in the order the sidebar stacks them: before each page,
 * inside an unfolded page as a sub-page, at the end of each list, and on through the groups. ⌥↑ / ⌥↓
 * step through this list, so a page slides *into* the one above instead of hopping over it.
 */
type NoteSlot = { group: string; parent: string; before: string | null };
function noteSlots(me: Note): NoteSlot[] {
  const out: NoteSlot[] = [];
  const pages = (group: string, parent: string) => {
    for (const p of notes.visible) {
      if (p.group !== group || (p.parent ?? '') !== parent) continue;
      if (p.id === me.id || notes.isAncestor(me.id, p.id)) continue; // itself and its own sub-pages
      out.push({ group, parent, before: p.id });
      if (!groups.isFolded(p.id)) pages(group, p.id); // an open page can take it in
    }
    out.push({ group, parent, before: null });
  };
  const walk = (g: string) => {
    for (const c of groups.children(g)) if (!groups.isCollapsed(c)) walk(c); // subgroups first, as the tree shows them
    pages(g, '');
  };
  walk('');
  return out;
}

/** ⌥↑ / ⌥↓ on a note: one slot up/down — past a page, into it, or on into the next group. */
export function nudgeNote(id: string, dir: 1 | -1): boolean {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return false;
  const list = noteSlots(me);
  const sibs = notes.visible.filter((n) => n.group === me.group && (n.parent ?? '') === (me.parent ?? ''));
  const i = sibs.findIndex((n) => n.id === id);
  const at = list.findIndex((s) => s.group === me.group && s.parent === (me.parent ?? '') && s.before === (sibs[i + 1]?.id ?? null));
  const t = list[at + dir];
  if (at < 0 || !t) return false;
  if (t.parent) groups.unfold(t.parent); // show where it landed
  notes.place(id, t.group, t.parent, t.before);
  return true;
}

/** ⌥→ tucks a note under `above` (the row over it) (a sub-page); ⌥← lifts it back out to its parent's level. */
export function nestNote(id: string, dir: 'in' | 'out', above?: string): boolean {
  const me = notes.all.find((n) => n.id === id);
  if (!me) return false;
  if (dir === 'out') {
    const parent = me.parent ? notes.all.find((n) => n.id === me.parent) : null;
    if (!parent) return false;
    notes.setParent(id, parent.parent ?? null);
  } else {
    // only a page of the same group can take it in, and never one of its own sub-pages
    const host = above && notes.all.find((n) => n.id === above);
    if (!host || host.group !== me.group || host.id === me.parent || notes.isAncestor(id, host.id)) return false;
    groups.unfold(host.id);
    notes.setParent(id, host.id);
  }
  return true;
}

/**
 * ⌥↑ / ⌥↓ walk a group through every visible slot in outline order — past siblings, out of its
 * parent, into (expanded) groups above — like dragging it one row at a time. Collapsed groups are
 * skipped as targets and the moved group keeps its own fold state. ⌥← / ⌥→ un-nest / nest directly.
 */
type Slot = { parent: string; before: string | null };
function slots(g: string, parent: string): Slot[] {
  const out: Slot[] = [];
  for (const c of groups.children(parent)) {
    if (c === g) continue;
    out.push({ parent, before: c });
    if (!groups.isCollapsed(c) && groups.canPlace(g, c)) out.push(...slots(g, c));
  }
  out.push({ parent, before: null });
  return out.filter((s) => groups.canPlace(g, s.parent));
}
/** The group's new path, or null when it could not move that way. */
export function nudgeGroup(g: string, key: string): string | null {
  let np: string | null = null;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const list = slots(g, '');
    const cur: Slot = { parent: parentOf(g), before: groups.nextSibling(g) };
    const i = list.findIndex((s) => s.parent === cur.parent && s.before === cur.before);
    const t = list[i + (key === 'ArrowDown' ? 1 : -1)];
    if (t) np = groups.move(g, t.parent, t.before);
  }
  if (key === 'ArrowLeft' && parentOf(g)) { const par = parentOf(g); np = groups.move(g, parentOf(par), groups.nextSibling(par)); }
  if (key === 'ArrowRight') { const prev = groups.prevSibling(g); if (prev) np = groups.move(g, prev, null); }
  return np;
}
