import { isMobile } from './platform';

export interface SwipeActions {
  left?: () => void;
  right?: () => void;
  enabled?: () => boolean;
}

const ARM_DISTANCE = 140;
const SETTLE_MS = 240;
const STRETCH_WITHOUT_ACTION = 24;
const SWALLOW_CLICK_MS = 350;
const RUN_AFTER_MS = 120;

export function swipeRow(node: HTMLElement, actions: SwipeActions) {
  if (!isMobile) return;
  let start: { x: number; y: number; axis: '' | 'x' | 'y' } | null = null;
  let dx = 0, armed = false, swallowNextClick = false, settle: ReturnType<typeof setTimeout> | undefined;
  const mark = () => Math.min(ARM_DISTANCE, node.offsetWidth / 3);
  const set = (x: number) => {
    dx = x;
    node.style.setProperty('--sx', `${x}px`);
    clearTimeout(settle);
    if (x) { node.classList.toggle('to-left', x < 0); node.classList.toggle('to-right', x > 0); }
    else settle = setTimeout(() => node.classList.remove('to-left', 'to-right'), SETTLE_MS);
    const on = Math.abs(x) >= mark();
    if (on && !armed) navigator.vibrate?.(8);
    armed = on;
    node.classList.toggle('armed', on);
  };
  const down = (e: TouchEvent) => {
    if (e.touches.length !== 1 || actions.enabled?.() === false) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: '' };
  };
  const move = (e: TouchEvent) => {
    if (!start) return;
    if (actions.enabled?.() === false) { cancel(); return; }
    const x = e.touches[0].clientX - start.x, y = e.touches[0].clientY - start.y;
    if (!start.axis && Math.hypot(x, y) > 10) start.axis = Math.abs(x) > Math.abs(y) * 1.4 ? 'x' : 'y';
    if (start.axis === 'y') { start = null; return; }
    if (start.axis !== 'x') return;
    e.preventDefault();
    node.classList.add('swiping');
    const has = x < 0 ? actions.left : actions.right;
    set(has ? x : Math.sign(x) * Math.min(STRETCH_WITHOUT_ACTION, Math.abs(x) / 4));
  };
  const up = () => {
    if (!start) return;
    const wasX = start.axis === 'x';
    start = null;
    if (!wasX) return;
    const run = armed ? (dx < 0 ? actions.left : actions.right) : undefined;
    swallowNextClick = true;
    setTimeout(() => (swallowNextClick = false), SWALLOW_CLICK_MS);
    node.classList.remove('swiping');
    set(0);
    if (run) setTimeout(run, RUN_AFTER_MS);
  };
  const cancel = () => { if (!start) return; start = null; node.classList.remove('swiping'); set(0); };
  const click = (e: MouseEvent) => { if (swallowNextClick) { e.preventDefault(); e.stopPropagation(); } };
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
