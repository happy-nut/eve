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

export const mathNow = (): MathLive | null => lib;

export function mathMarkup(m: MathLive, latex: string, display: boolean): string {
  try {
    return m.convertLatexToMarkup(latex, { defaultMode: display ? 'math' : 'inline-math' });
  } catch {
    return '';
  }
}
