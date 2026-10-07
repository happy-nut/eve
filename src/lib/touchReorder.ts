import { isMobile } from './platform';

/** What the list does with a row a finger lifts: the gesture is here, where the row lands is the list's. */
export interface Reorder {
  /** its handle touched, reordering: the row is picked up */
  lift(row: HTMLElement): void;
  /** the finger moved to (x, y): point the drop at what is under it */
  over(x: number, y: number): void;
  /** let go after moving: lands it, false when there was nowhere to land */
  drop(): boolean;
  /** held, outside reordering: the row's menu */
  menu(row: HTMLElement): void;
  /** the list is being reordered: a row's handle (.handle) lifts it at a touch, and a long press does nothing */
  reordering(): boolean;
  /** the gesture was taken away (a call, the system) */
  cancel(): void;
}

/**
 * A phone has no mouse to drag with. A long press on a row opens its menu, at once (the finger still down); one
 * of its items puts the list into reordering, where each row has a handle: touched, it lifts the row, and the
 * finger takes it where the mouse would have dropped it. Auto-scrolls near the top and bottom of the list.
 * One gesture, one meaning: a long press used to lift the row and, let go without moving, open the menu, and
 * neither was found.
 *
 * The lifted row rides under the finger (a copy, the row itself left faint in its place) and the list's own
 * drop line says where it will land, so the move is seen while it is made, not only after the finger lifts.
 */
export function touchReorder(tree: HTMLElement, list: Reorder) {
  if (!isMobile) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number; row: HTMLElement } | null = null;
  let lifted = false, moved = false, x = 0, y = 0;
  let ghost: HTMLElement | null = null, liftH = 0;
  const lift = (row: HTMLElement) => {
    const li = row.closest<HTMLElement>('li.row');
    if (!li) return;
    const r = li.getBoundingClientRect();
    liftH = r.height;
    ghost = li.cloneNode(true) as HTMLElement;
    ghost.classList.add('lifted');
    ghost.querySelectorAll('.swipe-act').forEach((el) => el.remove()); // what a sideways pull would do: not this
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
    document.body.append(ghost);
    navigator.vibrate?.(12);
  };
  // it rides just above the fingertip: the finger hides neither the row nor the line it points at
  const follow = () => { if (ghost) ghost.style.top = `${y - liftH - 14}px`; };
  const land = () => { ghost?.remove(); ghost = null; };
  let held = false; // the menu opened under a finger still down
  const down = (e: TouchEvent) => {
    const t = e.target as HTMLElement;
    if (e.touches.length !== 1 || t.closest('.fold, input')) return;
    x = e.touches[0].clientX; y = e.touches[0].clientY;
    held = lifted = moved = false;
    if (list.reordering()) {
      const row = t.closest('.handle')?.closest('li.row')?.querySelector<HTMLElement>('[data-row]');
      if (!row) return;
      e.preventDefault(); // the handle's touch is the reorder's, not a scroll
      start = { x, y, row }; lifted = true;
      lift(row); // copied before the row turns faint
      list.lift(row);
      return;
    }
    const row = t.closest<HTMLElement>('[data-row]');
    if (!row) return;
    start = { x, y, row };
    timer = setTimeout(() => { held = true; navigator.vibrate?.(12); list.menu(row); }, 420);
  };
  const move = (e: TouchEvent) => {
    if (!start) return;
    x = e.touches[0].clientX; y = e.touches[0].clientY;
    if (!lifted) {
      if (Math.hypot(x - start.x, y - start.y) > 8) { clearTimeout(timer); start = null; } // a scroll
      return;
    }
    e.preventDefault(); // the list stays put under a lifted row
    if (Math.hypot(x - start.x, y - start.y) > 8) moved = true;
    follow();
    list.over(x, y);
    const r = tree.getBoundingClientRect();
    if (y < r.top + 56) tree.scrollTop -= 14;
    else if (y > r.bottom - 56) tree.scrollTop += 14;
  };
  const up = (e: TouchEvent) => {
    clearTimeout(timer);
    if (!start) return;
    start = null;
    if (held) { e.preventDefault(); return; } // the menu is up: letting go is no tap on the row
    if (!lifted) return; // a tap: the row's own click handles it
    e.preventDefault(); // and no click after a lift
    land();
    if (moved && list.drop()) (document.activeElement as HTMLElement | null)?.blur(); // no focus ring left behind
    else list.cancel();
  };
  const cancel = () => { clearTimeout(timer); start = null; land(); list.cancel(); };
  tree.addEventListener('touchstart', down, { passive: false });
  tree.addEventListener('touchmove', move, { passive: false });
  tree.addEventListener('touchend', up);
  tree.addEventListener('touchcancel', cancel);
  return {
    destroy() {
      land();
      tree.removeEventListener('touchstart', down);
      tree.removeEventListener('touchmove', move);
      tree.removeEventListener('touchend', up);
      tree.removeEventListener('touchcancel', cancel);
    },
  };
}
