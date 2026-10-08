import { isMobile } from './platform';

/** What the list does with a row a finger lifts: the gesture is here, where the row lands is the list's. */
export interface Reorder {
  /** held: the row is picked up */
  lift(row: HTMLElement): void;
  /** the finger moved to (x, y): point the drop at what is under it */
  over(x: number, y: number): void;
  /** let go after moving: lands it, false when there was nowhere to land */
  drop(): boolean;
  /** the gesture was taken away (a call, the system) */
  cancel(): void;
}

/**
 * A phone has no mouse to drag with: a long press on a row lifts it, and the finger takes it where the mouse would
 * have dropped it. Let go without moving, nothing happens. Auto-scrolls near the top and bottom of the list. (It
 * used to open a menu of the row's commands, one of them a reorder mode with a handle on every row: a long press
 * that only moves is what a list on a phone does.)
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
  const down = (e: TouchEvent) => {
    const t = e.target as HTMLElement;
    if (e.touches.length !== 1 || t.closest('.fold, input')) return;
    x = e.touches[0].clientX; y = e.touches[0].clientY;
    lifted = moved = false;
    const row = t.closest<HTMLElement>('[data-row]');
    if (!row) return;
    start = { x, y, row };
    timer = setTimeout(() => {
      if (!start) return;
      lifted = true;
      lift(row); // copied before the row turns faint
      list.lift(row);
      follow();
    }, 420);
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
