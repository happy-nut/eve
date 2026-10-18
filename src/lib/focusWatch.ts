/**
 * A watch on the keyboard's place, for development and the tests: the keyboard left on <body> with nothing to
 * show for it. That is how ~a tenth of the app's fixes started — a layer closed and the keys typed next went
 * nowhere, or the focus went back to something that had since left the page. Nothing here runs in a build.
 *
 * Only what no one meant is reported. Not:
 *  - a layer closing (ui.layers): it puts the keyboard back itself, a moment later for some (`moving`)
 *  - a press on something that takes no focus (the dragbar, a picture's dim page): the user put it on <body>
 *  - the window itself losing focus (⌘Tab): document.hasFocus() is false then
 *  - focus let go of on purpose (`letGo`): a diagram taking its own keys, a phone putting its keyboard away
 */

/** layer transitions under way (ui.layers): the focus is between places, and is put back when they end */
let moving = 0;
export function shifting<T>(run: () => T): T {
  moving++;
  try { return run(); } finally { moving--; }
}
/** a transition that ends later (a layer that puts the keyboard back after a delay): call the result when it has */
export function shiftingUntil(): () => void {
  moving++;
  let done = false;
  return () => { if (!done) { done = true; moving--; } };
}

let meant = false;
/** The keyboard put away on purpose: the element (the focused one by default) lets go of it, and that is no loss. */
export function letGo(el: Element | null = document.activeElement) {
  meant = true;
  try { (el as HTMLElement | null)?.blur?.(); } finally { queueMicrotask(() => (meant = false)); }
}

let allowed = false, era = 0;
/** A test that leaves the keyboard on <body> on purpose (it blurs, it removes what had it) says so. */
export function allowFocusLoss() { allowed = true; }
export const focusLossAllowed = () => allowed;

/** Start watching; `report` hears each loss (a line saying where the keyboard was). Returns the way to stop. */
export function watchFocus(report: (what: string) => void): () => void {
  let pressed = false, pressTimer: ReturnType<typeof setTimeout> | undefined;
  let last: Element | null = null; // what had the keyboard last
  let moves = 0; // focusins so far: a blur followed by one handed the keyboard on (what happens to it next is its own)
  const describe = (el: Element | null) => {
    if (!el) return 'nothing';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const label = el.getAttribute('aria-label');
    return `<${el.tagName.toLowerCase()}${cls}${label ? ` "${label}"` : ''}>${el.isConnected ? '' : ' (removed)'}`;
  };
  const check = (from: Element | null, how: string, at: number) => {
    if (at !== era || moving || !document.hasFocus()) return; // (reset since: a test that has ended)
    if (document.activeElement !== document.body) return;
    report(`focus lost to <body> (${how}) from ${describe(from)}`);
  };
  const out = (e: FocusEvent) => {
    const from = e.target as Element;
    if (last === from) last = null; // it let go with a blur: no removal can take the keyboard from it now
    // (a press, or letGo: decided now, as the blur happens; both are over by the time it is looked at)
    if (meant || pressed) return;
    // looked at a moment later (after this step's microtasks): a layer closing in this same step has put the
    // keyboard back by then, and so has whatever moves it on by itself (a caller's then(), a component that
    // focuses itself as it mounts)
    const at = era, n = moves;
    setTimeout(() => { if (moves === n) check(from, 'blur', at); });
  };
  let lastAt = 0; // the era it was focused in: one from before a reset (a test since ended) is not looked for
  const into = (e: FocusEvent) => { last = e.target as Element; lastAt = era; moves++; };
  const press = () => {
    pressed = true;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => (pressed = false));
  };
  // a focused element taken off the page fires no blur (Chrome, WebKit, jsdom alike): the keyboard simply ends
  // up on <body>. That is the commonest loss of all, so removals are looked for too: polled, not observed (a
  // MutationObserver over the whole page made a 3000-line note's tests twice as slow in jsdom)
  const probe = () => {
    if (last && lastAt !== era) last = null;
    if (!last || last.isConnected || document.activeElement !== document.body || pressed) return;
    const from = last, at = era, n = moves;
    last = null;
    // (as a blur is, looked at again a moment later: what re-renders it may focus it again just after)
    setTimeout(() => { if (moves === n) check(from, 'removed', at); });
  };
  const poll = setInterval(probe, 25);
  probes.add(probe);
  document.addEventListener('focusout', out, true);
  document.addEventListener('focusin', into, true);
  document.addEventListener('pointerdown', press, true);
  document.addEventListener('mousedown', press, true);
  document.addEventListener('touchstart', press, true);
  return () => {
    document.removeEventListener('focusout', out, true);
    document.removeEventListener('focusin', into, true);
    document.removeEventListener('pointerdown', press, true);
    document.removeEventListener('mousedown', press, true);
    document.removeEventListener('touchstart', press, true);
    clearInterval(poll);
    probes.delete(probe);
    clearTimeout(pressTimer);
  };
}

const probes = new Set<() => void>();
/** look for a removal now rather than at the next poll (the tests' setup, as a test ends) */
export function probeFocus() { for (const p of probes) p(); }

/** for the tests' setup: a new test starts with nothing allowed */
export function resetFocusWatch() { allowed = false; era++; }
