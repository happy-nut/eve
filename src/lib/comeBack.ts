let pressed = -Infinity;
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => (pressed = performance.now()), true);

const CLICK_BROUGHT_BACK_MS = 400;
export const CLICK_WAIT_MS = 80;

export function cameBack(restore: () => void) {
  const at = performance.now();
  if (at - pressed < CLICK_BROUGHT_BACK_MS) return;
  setTimeout(() => { if (pressed < at) restore(); }, CLICK_WAIT_MS);
}
