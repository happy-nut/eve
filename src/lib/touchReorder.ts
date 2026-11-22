import { isMobile } from './platform';

export interface Reorder {
  lift(row: HTMLElement): void;
  over(x: number, y: number): void;
  drop(): boolean;
  cancel(): void;
}

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
    ghost.querySelectorAll('.swipe-act').forEach((el) => el.remove());
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
    document.body.append(ghost);
    navigator.vibrate?.(12);
  };
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
      lift(row);
      list.lift(row);
      follow();
    }, 420);
  };
  const move = (e: TouchEvent) => {
    if (!start) return;
    x = e.touches[0].clientX; y = e.touches[0].clientY;
    if (!lifted) {
      if (Math.hypot(x - start.x, y - start.y) > 8) { clearTimeout(timer); start = null; }
      return;
    }
    e.preventDefault();
    if (Math.hypot(x - start.x, y - start.y) > 8) moved = true;
    follow();
    list.over(x, y);
    edge();
  };
  let frame = 0;
  const edge = () => {
    cancelAnimationFrame(frame);
    if (!lifted || !start) return;
    const r = tree.getBoundingClientRect();
    const step = y < r.top + 56 ? -8 : y > r.bottom - 56 ? 8 : 0;
    if (!step) return;
    tree.scrollTop += step;
    list.over(x, y);
    frame = requestAnimationFrame(edge);
  };
  const up = (e: TouchEvent) => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    if (!start) return;
    start = null;
    if (!lifted) return;
    e.preventDefault(); // and no click after a lift
    land();
    if (moved && list.drop()) (document.activeElement as HTMLElement | null)?.blur();
    else list.cancel();
  };
  const cancel = () => { clearTimeout(timer); cancelAnimationFrame(frame); start = null; land(); list.cancel(); };
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
