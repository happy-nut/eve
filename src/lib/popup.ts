import { isMobile } from './platform';

/** What each side of the window keeps for itself, so nothing floating lands under it. */
export type Insets = { top: number; right: number; bottom: number; left: number };
/** A box on the screen, as getBoundingClientRect gives it (a DOMRect is one); a side may be ±Infinity. */
export type Box = { left: number; top: number; right: number; bottom: number };
export type Side = 'below' | 'above' | 'left' | 'right' | 'inside';

/** The window's size. What the person moves or sizes themselves (the PDF panel) is kept on it with this; anything
 *  placed for them goes through floatAt. */
export function viewSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * The window's own furniture, in one place: on the Mac the strip along the top with the traffic lights and the
 * toolbar (the emoji picker kept clear of it on its own), on a phone the note's bar along the top and the formatting
 * bar along the bottom, and under that whatever an on-screen keyboard covers that the page was not shortened for
 * (visualViewport: Android shortens the page, a keyboard laid over it does not). 8px off the window's sides.
 */
export function screenInsets(): Insets {
  if (!isMobile) return { top: 44, right: 8, bottom: 8, left: 8 };
  const vv = window.visualViewport;
  const keyboard = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  return { top: 60, right: 8, bottom: 64 + keyboard, left: 8 };
}

/**
 * Where something floating goes beside what it is for (`anchor`, a box or a point): every menu, list, bar and tip.
 * It tries the `prefer`red side, then the opposite one ('side': right, left, then under, over), and takes the first
 * where all of it fits, `gap` off the anchor — less when the room is a little short, down to a pixel (as far off as
 * the room lets it be, the table's bar found). Across, it lines up with the anchor (`align`) and is pulled back
 * inside. Fitting nowhere:
 * - kept `within` a container (a bar in a diagram's canvas, the table's bar between the lines around it): smaller,
 *   in the anchor's own top-right corner ('inside'), the one time it covers what it is for;
 * - otherwise (a list that scrolls) on the side with more room, its height cut to that room.
 * The room is the window less `avoid` (screenInsets() unless given), less what is outside `within`. `maxHeight` is
 * the room it got; a box taller than that scrolls.
 */
export function floatAt(
  anchor: Box | { x: number; y: number },
  size: { w: number; h: number },
  o: { prefer?: 'below' | 'above' | 'side'; avoid?: Insets; gap?: number; within?: Box; align?: 'start' | 'center' | 'end' } = {},
): { left: number; top: number; maxHeight: number; side: Side } {
  const a: Box = 'left' in anchor ? anchor : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const ins = o.avoid ?? screenInsets(), gap = o.gap ?? 4, { w, h } = size;
  const view = viewSize(), win = o.within;
  const b: Box = {
    left: Math.max(ins.left, win?.left ?? -Infinity), right: Math.min(view.w - ins.right, win?.right ?? Infinity),
    top: Math.max(ins.top, win?.top ?? -Infinity), bottom: Math.min(view.h - ins.bottom, win?.bottom ?? Infinity),
  };
  const room = { below: b.bottom - a.bottom, above: a.top - b.top, right: b.right - a.right, left: a.left - b.left };
  const along = (side: Side) => (side === 'left' || side === 'right' ? w : h);
  // all of it with a few pixels to spare; then as far off as that room lets it be, up to the gap
  const fits = (r: number, len: number) => r >= len + Math.min(gap, 3);
  const off = (r: number, len: number) => Math.max(0, Math.min(gap, r - len - 1));
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const across = () => clamp(o.align === 'center' ? (a.left + a.right - w) / 2 : o.align === 'end' ? a.right - w : a.left, b.left, b.right - w);
  const put = (side: 'below' | 'above' | 'left' | 'right', r: number) => {
    // (one that does not fit anyway scrolls: the whole gap, its height cut instead)
    const d = fits(r, along(side)) ? off(r, along(side)) : gap;
    if (side === 'below') return { left: across(), top: a.bottom + d, maxHeight: Math.max(0, r - d), side };
    if (side === 'above') { const mh = Math.max(0, r - d); return { left: across(), top: a.top - d - Math.min(h, mh), maxHeight: mh, side }; }
    const top = clamp(a.top, b.top, b.bottom - h);
    return { left: side === 'right' ? a.right + d : a.left - d - w, top, maxHeight: Math.max(0, b.bottom - top), side };
  };
  const order = o.prefer === 'above' ? (['above', 'below'] as const) : o.prefer === 'side' ? (['right', 'left', 'below', 'above'] as const) : (['below', 'above'] as const);
  for (const side of order) if (fits(room[side], along(side))) return put(side, room[side]);
  if (win) {
    // in its own corner: on the anchor, as much of it as is inside the room
    const d = Math.min(gap, 4), top = clamp(Math.max(a.top, b.top) + d, b.top, b.bottom - h);
    return { left: clamp(Math.min(a.right, b.right) - w - d, b.left, b.right - w), top, maxHeight: Math.max(0, b.bottom - top), side: 'inside' };
  }
  // under it when that side has more room: going under with less room than the other side cut the @ calendar's last
  // week off; and the room is all it gets (more ran under the phone's bar)
  return room.below >= room.above ? put('below', room.below) : put('above', room.above);
}

/**
 * Where a popup at the caret goes (the / and [[ menus, the @ calendar): floatAt's, under the caret when there is
 * room, otherwise over it if that side has more; its height is cut to the room it gets. On a phone the
 * room ends above the formatting bar (the keyboard already shortened the page) and under the note's bar.
 * Returns an inline style.
 */
export function placeAt(rect: DOMRect, want = 300, width = 220): string {
  const H = viewSize().h, ins = screenInsets();
  // a phone on its side with the keyboard up has a strip of a screen: over or under the caret the menu got a row and a
  // half, laid over the note's back button. There is room beside the caret instead: the whole strip's height
  if (isMobile && Math.max(H - ins.bottom - rect.bottom, rect.top - ins.top) - 4 < 140) {
    const f = floatAt(rect, { w: width, h: want }, { prefer: 'side', gap: 12, avoid: { top: 4, right: 0, bottom: 4, left: 0 } });
    if (f.side === 'left' || f.side === 'right') return `left:${f.left}px; top:${f.top}px; max-height:${f.maxHeight}px`;
  }
  const f = floatAt(rect, { w: width, h: want });
  // with little room either side (a phone on its side, the keyboard up) it may reach over a bar to show two rows,
  // but never past the window
  const floor = (room: number, edge: number) => Math.max(room, Math.min(72, edge));
  // over the caret it is held by its bottom: a list shorter than it might be stays against the line
  if (f.side === 'above') return `left:${f.left}px; bottom:${H - rect.top + 4}px; max-height:${floor(f.maxHeight, rect.top - 8)}px`;
  return `left:${f.left}px; top:${f.top}px; max-height:${floor(f.maxHeight, H - f.top - 4)}px`;
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
