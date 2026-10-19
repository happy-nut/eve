/**
 * The window came back to the front, and the caret is to go back where it was — unless it was a click in the window
 * that brought it back: that click puts the caret, where it was aimed. Put back over it (the window's focus event
 * lands a beat before or after the click), the caret went to where it had been instead, and the click was lost.
 */
let pressed = -Infinity;
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => (pressed = performance.now()), true);

/** a press this recent is what brought the window back */
const CLICKED = 400;
/** how long the click that may have brought the window back is waited for */
export const WAIT = 80;

export function cameBack(restore: () => void) {
  const at = performance.now();
  if (at - pressed < CLICKED) return;
  setTimeout(() => { if (pressed < at) restore(); }, WAIT);
}
