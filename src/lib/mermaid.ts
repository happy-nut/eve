/**
 * Mermaid diagrams (a ```mermaid code block drawn as its picture). The library is the biggest thing the app could
 * load, so it comes only with the first diagram shown, as the code grammars do (code.ts).
 */
type Mermaid = typeof import('mermaid').default;
let lib: Promise<Mermaid> | null = null;
let theme = '';
let seq = 0;

const dark = () => {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
};

function load(): Promise<Mermaid> {
  lib ??= import('mermaid').then((m) => m.default, (e) => { lib = null; throw e; }); // failed: the next diagram tries again
  return lib.then((m) => {
    // in the note's colours, light or dark; strict: a diagram's labels are text, never script or a link that runs
    const want = dark() ? 'dark' : 'neutral';
    if (want !== theme) {
      theme = want;
      m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: want as 'dark' | 'neutral', fontFamily: 'inherit' });
    }
    return m;
  });
}

/** One drawing at a time: mermaid's render is not made to run beside another (a note with three diagrams left the
 *  third undrawn). */
let queue: Promise<unknown> = Promise.resolve();
export function renderMermaid(code: string): Promise<{ svg: string } | { error: string }> {
  const next = queue.then(() => draw(code));
  queue = next.catch(() => {});
  return next;
}

/** The diagram's SVG, or the reason it could not be drawn. */
async function draw(code: string): Promise<{ svg: string } | { error: string }> {
  if (!code.trim()) return { error: 'An empty diagram' };
  try {
    const m = await load();
    const { svg } = await m.render(`eve-mermaid-${++seq}`, code);
    return { svg };
  } catch (e) {
    // mermaid leaves its error drawing in the page when a render fails
    document.querySelectorAll(`#deve-mermaid-${seq}, #eve-mermaid-${seq}`).forEach((el) => el.remove());
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.split('\n').slice(0, 3).join('\n') };
  }
}

/** the theme to draw in changed (Settings, or the system's dark mode): diagrams drawn again */
export const themeKey = () => (dark() ? 'dark' : 'light');
