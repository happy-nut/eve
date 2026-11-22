
let moving = 0;
export function shifting<T>(run: () => T): T {
  moving++;
  try { return run(); } finally { moving--; }
}
export function shiftingUntil(): () => void {
  moving++;
  let done = false;
  return () => { if (!done) { done = true; moving--; } };
}

let meant = false;
export function letGo(el: Element | null = document.activeElement) {
  meant = true;
  try { (el as HTMLElement | null)?.blur?.(); } finally { queueMicrotask(() => (meant = false)); }
}

let allowed = false, era = 0;
export function allowFocusLoss() { allowed = true; }
export const focusLossAllowed = () => allowed;

export function watchFocus(report: (what: string) => void): () => void {
  let pressed = false, pressTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFocused: Element | null = null;
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const later = (look: () => void) => { const t = setTimeout(() => { pending.delete(t); look(); }); pending.add(t); };
  let focusinCount = 0;
  const describe = (el: Element | null) => {
    if (!el) return 'nothing';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const label = el.getAttribute('aria-label');
    return `<${el.tagName.toLowerCase()}${cls}${label ? ` "${label}"` : ''}>${el.isConnected ? '' : ' (removed)'}`;
  };
  const check = (from: Element | null, how: string, at: number) => {
    if (at !== era || moving || !document.hasFocus()) return;
    if (document.activeElement !== document.body) return;
    report(`focus lost to <body> (${how}) from ${describe(from)}`);
  };
  const out = (e: FocusEvent) => {
    const from = e.target as Element;
    if (lastFocused === from) lastFocused = null;
    if (meant || pressed) return;
    const at = era, n = focusinCount;
    later(() => { if (focusinCount === n) check(from, 'blur', at); });
  };
  let lastFocusedEra = 0;
  const into = (e: FocusEvent) => { lastFocused = e.target as Element; lastFocusedEra = era; focusinCount++; };
  const press = () => {
    pressed = true;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => (pressed = false));
  };
  // a focused element taken off the page fires no blur (Chrome, WebKit, jsdom alike): the keyboard simply ends
  // up on <body>. That is the commonest loss of all, so removals are looked for too: polled, not observed (a
  // MutationObserver over the whole page made a 3000-line note's tests twice as slow in jsdom)
  const probe = () => {
    if (lastFocused && lastFocusedEra !== era) lastFocused = null;
    if (!lastFocused || lastFocused.isConnected || document.activeElement !== document.body || pressed) return;
    const from = lastFocused, at = era, n = focusinCount;
    lastFocused = null;
    later(() => { if (focusinCount === n) check(from, 'removed', at); });
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
    for (const t of pending) clearTimeout(t);
    pending.clear();
  };
}

const probes = new Set<() => void>();
export function probeFocus() { for (const p of probes) p(); }

export function resetFocusWatch() { allowed = false; era++; }
