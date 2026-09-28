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
