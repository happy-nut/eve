/**
 * A phone's splash (index.html): Eve wakes and smiles while the notes load, then it fades into the app. It stays at
 * least as long as the smile takes, and never longer than the notes take past that: a splash that outlives the
 * app is in the way.
 */
const SMILE_DONE = 1150; // ms from the page's start: the eyes have closed into a smile and held it a moment

export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, SMILE_DONE - performance.now());
  setTimeout(() => {
    // painted underneath first, so what the splash fades into is the note, not its first empty frame
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }));
  }, wait);
}

// never left over the app: notes that fail to load still take the splash away
if (typeof window !== 'undefined') setTimeout(hideSplash, 5000);
