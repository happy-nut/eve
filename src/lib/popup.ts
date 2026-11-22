import { isMobile } from './platform';

export type Insets = { top: number; right: number; bottom: number; left: number };
export type Box = { left: number; top: number; right: number; bottom: number };
export type Side = 'below' | 'above' | 'left' | 'right' | 'inside';

export function viewSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * The window's own furniture, in one place: on the Mac the strip along the top with the traffic lights and the
 * toolbar (the emoji picker kept clear of it on its own), on a phone the note's bar along the top and the formatting
 * bar along the bottom, and under that whatever an on-screen keyboard covers that the page was not shortened for
 * (visualViewport: Android shortens the page, a keyboard laid over it does not). 8px off the window's sides.
 */
const MAC_TOOLBAR = 44, PHONE_NOTE_BAR = 60, PHONE_FORMAT_BAR = 64, WINDOW_EDGE = 8;

export function screenInsets(): Insets {
  if (!isMobile) return { top: MAC_TOOLBAR, right: WINDOW_EDGE, bottom: WINDOW_EDGE, left: WINDOW_EDGE };
  const vv = window.visualViewport;
  const keyboard = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  return { top: PHONE_NOTE_BAR, right: WINDOW_EDGE, bottom: PHONE_FORMAT_BAR + keyboard, left: WINDOW_EDGE };
}

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
  const fits = (r: number, len: number) => r >= len + Math.min(gap, 3);
  const off = (r: number, len: number) => Math.max(0, Math.min(gap, r - len - 1));
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const across = () => clamp(o.align === 'center' ? (a.left + a.right - w) / 2 : o.align === 'end' ? a.right - w : a.left, b.left, b.right - w);
  const put = (side: 'below' | 'above' | 'left' | 'right', r: number) => {
    const d = fits(r, along(side)) ? off(r, along(side)) : gap;
    if (side === 'below') return { left: across(), top: a.bottom + d, maxHeight: Math.max(0, r - d), side };
    if (side === 'above') { const mh = Math.max(0, r - d); return { left: across(), top: a.top - d - Math.min(h, mh), maxHeight: mh, side }; }
    const top = clamp(a.top, b.top, b.bottom - h);
    return { left: side === 'right' ? a.right + d : a.left - d - w, top, maxHeight: Math.max(0, b.bottom - top), side };
  };
  const order = o.prefer === 'above' ? (['above', 'below'] as const) : o.prefer === 'side' ? (['right', 'left', 'below', 'above'] as const) : (['below', 'above'] as const);
  for (const side of order) if (fits(room[side], along(side))) return put(side, room[side]);
  if (win) {
    const d = Math.min(gap, 4), top = clamp(Math.max(a.top, b.top) + d, b.top, b.bottom - h);
    return { left: clamp(Math.min(a.right, b.right) - w - d, b.left, b.right - w), top, maxHeight: Math.max(0, b.bottom - top), side: 'inside' };
  }
  return room.below >= room.above ? put('below', room.below) : put('above', room.above);
}

function besideCaret(rect: DOMRect, want: number, width: number): string | null {
  const H = viewSize().h, ins = screenInsets();
  if (!isMobile || Math.max(H - ins.bottom - rect.bottom, rect.top - ins.top) - 4 >= 140) return null;
  const f = floatAt(rect, { w: width, h: want }, { prefer: 'side', gap: 12, avoid: { top: 4, right: 0, bottom: 4, left: 0 } });
  return f.side === 'left' || f.side === 'right' ? `left:${f.left}px; top:${f.top}px; max-height:${f.maxHeight}px` : null;
}

export function placeAt(rect: DOMRect, want = 300, width = 220): string {
  const beside = besideCaret(rect, want, width);
  if (beside) return beside;
  const H = viewSize().h;
  const f = floatAt(rect, { w: width, h: want });
  const floor = (room: number, edge: number) => Math.max(room, Math.min(72, edge));
  if (f.side === 'above') return `left:${f.left}px; bottom:${H - rect.top + 4}px; max-height:${floor(f.maxHeight, rect.top - 8)}px`;
  return `left:${f.left}px; top:${f.top}px; max-height:${floor(f.maxHeight, H - f.top - 4)}px`;
}

export function sheet<T>(node: Element, desktop: (node: Element) => T, pulled = 0): T | { duration: number; css: (t: number, u: number) => string } {
  if (!isMobile) return desktop(node);
  return { duration: 260, css: (t, u) => `translate: 0 calc(${(pulled * t).toFixed(1)}px + ${(u * u * u * 100).toFixed(2)}%)` };
}

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
      if (d < 6) { if (d < 0) armed = false; return; }
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

export function focusNote() {
  document.querySelector<HTMLElement>('main .tiptap, main .calendar .day.cursor')?.focus();
}

export function lastShown<T>(get: () => T | null | undefined): () => T {
  let last = get() as T;
  return () => (last = get() ?? last);
}
