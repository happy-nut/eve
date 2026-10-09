/**
 * MathLive, loaded with the first formula shown: it draws a formula in the note and is the box a formula is typed in,
 * so what is typed looks exactly as it will in the note. Its own font files come from its static style sheet (bundled
 * here); it loads none itself, and plays no sounds.
 */
type MathLive = typeof import('mathlive');
let lib: MathLive | null = null;
let loading: Promise<MathLive> | null = null;

export function loadMath(): Promise<MathLive> {
  if (lib) return Promise.resolve(lib);
  loading ??= Promise.all([import('mathlive'), import('mathlive/static.css')]).then(([m]) => {
    m.MathfieldElement.fontsDirectory = null;
    m.MathfieldElement.soundsDirectory = null;
    m.MathfieldElement.keypressSound = null;
    m.MathfieldElement.plonkSound = null;
    lib = m;
    return m;
  }, (e) => { loading = null; throw e; });
  return loading;
}

/** already loaded: drawn at once, with no frame of raw TeX */
export const mathNow = (): MathLive | null => lib;

/** a formula as HTML: display (a block of its own) or inline (in a line of text) */
export function mathMarkup(m: MathLive, latex: string, display: boolean): string {
  try {
    return m.convertLatexToMarkup(latex, { defaultMode: display ? 'math' : 'inline-math' });
  } catch {
    return '';
  }
}
