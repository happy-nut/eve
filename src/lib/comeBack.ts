let pressed = -Infinity;
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => (pressed = performance.now()), true);

const CLICKED = 400;
export const WAIT = 80;

export function cameBack(restore: () => void) {
  const at = performance.now();
  if (at - pressed < CLICKED) return;
  setTimeout(() => { if (pressed < at) restore(); }, WAIT);
}
