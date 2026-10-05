import { isMobile } from './platform';

/**
 * Where a popup at the caret goes (the / and [[ menus, the @ calendar): under the caret when there is
 * room, otherwise over it if that side has more; its height is cut to the room it gets. On a phone the
 * room ends above the formatting bar (the keyboard already shortened the page) and under the note's bar.
 * Returns an inline style.
 */
export function placeAt(rect: DOMRect, want = 300, width = 220): string {
  const bottomEdge = window.innerHeight - (isMobile ? 64 : 8);
  const topEdge = isMobile ? 60 : 8;
  const below = bottomEdge - rect.bottom - 4;
  const above = rect.top - 4 - topEdge;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  if (below >= Math.min(want, 160) || below >= above) return `left:${left}px; top:${rect.bottom + 4}px; max-height:${Math.max(96, below)}px`;
  return `left:${left}px; bottom:${window.innerHeight - rect.top + 4}px; max-height:${above}px`;
}

/**
 * How a sheet comes up from the bottom of a phone, and goes back down. It moves by `translate`, not
 * `transform`: the phone's sheet styles (app.css) pin `transform: none !important` to undo the Mac's
 * centring, and an !important rule wins over an animation of the same property — a sheet animated by
 * transform just appeared. Elsewhere `desktop` runs as before.
 */
export function sheet<T>(node: Element, desktop: (node: Element) => T, pulled = 0): T | { duration: number; css: (t: number, u: number) => string } {
  if (!isMobile) return desktop(node);
  // cubic ease-out, as the menus' sheets; going away it starts from wherever the finger let go (`pulled`)
  return { duration: 260, css: (t, u) => `translate: 0 calc(${(pulled * t).toFixed(1)}px + ${(u * u * u * 100).toFixed(2)}%)` };
}

/**
 * A phone's sheet pulled down: from the top of its scroll (`scroller`, else the sheet itself) a downward drag
 * moves it with the finger (`onpull`); far or fast enough it closes, otherwise it settles back (dy 0).
 * `quick`: only a drag that sets off at once — a finger held still first is selecting text (an editor's sheet).
 */
export function pullDown(node: HTMLElement, o: { onpull: (dy: number, dragging: boolean) => void; onclose: () => void; scroller?: () => HTMLElement | null; quick?: boolean }) {
  let y0 = 0, t0 = 0, dy = 0, armed = false, dragging = false;
  const start = (e: TouchEvent) => {
    const sc = o.scroller?.() ?? node;
    y0 = e.touches[0].clientY; t0 = e.timeStamp; dy = 0; dragging = false;
    armed = e.touches.length === 1 && (!sc.contains(e.target as Node) || sc.scrollTop <= 0);
  };
  const move = (e: TouchEvent) => {
    if (!armed) return;
    const d = e.touches[0].clientY - y0;
    if (!dragging) {
      if (d < 6) { if (d < 0) armed = false; return; } // an upward move scrolls the sheet instead
      if (o.quick && e.timeStamp - t0 > 300) { armed = false; return; }
      dragging = true;
    }
    dy = Math.max(0, d);
    o.onpull(dy, true);
    if (e.cancelable) e.preventDefault();
  };
  const end = (e: TouchEvent) => {
    armed = false;
    if (!dragging) return;
    dragging = false;
    const fast = dy / Math.max(1, e.timeStamp - t0) > 0.5;
    if (dy > Math.min(120, node.offsetHeight / 3) || (fast && dy > 24)) { o.onpull(dy, false); o.onclose(); }
    else o.onpull(0, false);
  };
  node.addEventListener('touchstart', start, { passive: true });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', end);
  node.addEventListener('touchcancel', end);
  return { destroy() {
    node.removeEventListener('touchstart', start);
    node.removeEventListener('touchmove', move);
    node.removeEventListener('touchend', end);
    node.removeEventListener('touchcancel', end);
  } };
}

/** The keyboard back to the note: its editor, or the calendar's day when the calendar is open. The one in <main>,
 *  not a floating page's (a card closing is still in the page while it fades). */
export function focusNote() {
  document.querySelector<HTMLElement>('main .tiptap, main .calendar .day.cursor')?.focus();
}

/** What `get` gave last while it gave something: a popup closing keeps showing what it showed, though its state is
 *  already null while it fades out. `const req = $derived.by(held(() => ui.menu));` */
export function held<T>(get: () => T | null | undefined): () => T {
  let last = get() as T;
  return () => (last = get() ?? last);
}
