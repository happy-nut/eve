import { isMobile } from './platform';

export interface SwipeActions {
  /** pulled far enough to the left (the action shows on the right) */
  left?: () => void;
  /** pulled far enough to the right */
  right?: () => void;
  /** false while the list is being reordered: the finger is the reorder's */
  enabled?: () => boolean;
}

/**
 * A phone's row pulled sideways, as in a mail app: it follows the finger, the action it will take shows behind it,
 * and let go past the mark (a third of the row) the action runs; short of it the row settles back. Up and down is
 * the list's scroll, untouched (the row is touch-action: pan-y). The sideways move is marked handled
 * (preventDefault), so the drawer does not slide off with it and a long press does not lift the row.
 *
 * The row is moved through --sx and the classes swiping / armed / to-left / to-right; the CSS draws the rest.
 */
export function swipeRow(node: HTMLElement, actions: SwipeActions) {
  if (!isMobile) return;
  let start: { x: number; y: number; axis: '' | 'x' | 'y' } | null = null;
  let dx = 0, armed = false, swallow = false, settle: ReturnType<typeof setTimeout> | undefined;
  const mark = () => Math.min(140, node.offsetWidth / 3);
  const set = (x: number) => {
    dx = x;
    node.style.setProperty('--sx', `${x}px`);
    // the side stays shown while the row eases back home, and goes once it is there
    clearTimeout(settle);
    if (x) { node.classList.toggle('to-left', x < 0); node.classList.toggle('to-right', x > 0); }
    else settle = setTimeout(() => node.classList.remove('to-left', 'to-right'), 240);
    const on = Math.abs(x) >= mark();
    if (on && !armed) navigator.vibrate?.(8); // the mark is felt as it is crossed
    armed = on;
    node.classList.toggle('armed', on);
  };
  const down = (e: TouchEvent) => {
    if (e.touches.length !== 1 || actions.enabled?.() === false) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: '' };
  };
  const move = (e: TouchEvent) => {
    if (!start) return;
    const x = e.touches[0].clientX - start.x, y = e.touches[0].clientY - start.y;
    if (!start.axis && Math.hypot(x, y) > 10) start.axis = Math.abs(x) > Math.abs(y) * 1.4 ? 'x' : 'y';
    if (start.axis === 'y') { start = null; return; }
    if (start.axis !== 'x') return;
    e.preventDefault();
    node.classList.add('swiping');
    // only a side with an action moves freely; the other gives a little and stops
    const has = x < 0 ? actions.left : actions.right;
    set(has ? x : Math.sign(x) * Math.min(24, Math.abs(x) / 4));
  };
  const up = () => {
    if (!start) return;
    const wasX = start.axis === 'x';
    start = null;
    if (!wasX) return;
    const run = armed ? (dx < 0 ? actions.left : actions.right) : undefined;
    swallow = true; // the tap the lifted finger would make is not a tap on the row
    setTimeout(() => (swallow = false), 350);
    node.classList.remove('swiping'); // the CSS eases it back
    set(0);
    if (run) setTimeout(run, 120);
  };
  const cancel = () => { if (!start) return; start = null; node.classList.remove('swiping'); set(0); }; // taken away: nothing runs
  const click = (e: MouseEvent) => { if (swallow) { e.preventDefault(); e.stopPropagation(); } };
  node.addEventListener('touchstart', down, { passive: true });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', up);
  node.addEventListener('touchcancel', cancel);
  node.addEventListener('click', click, true);
  return {
    update(next: SwipeActions) { actions = next; },
    destroy() {
      node.removeEventListener('touchstart', down);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', up);
      node.removeEventListener('touchcancel', cancel);
      node.removeEventListener('click', click, true);
    },
  };
}
