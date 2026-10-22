/**
 * The parts a formula is built from, put in by a click in its box (MathEdit.svelte): each is MathLive's template, `#@`
 * where what was selected goes, `#?` an empty slot the caret moves through with Tab. `show` is how its button reads.
 */
export interface MathPart {
  tex: string; show?: string; name: string; /** a MathLive command run in place of putting TeX in */ cmd?: string;
  /** what typed in the box puts it in too (MathLive's shortcuts, and MathEdit's own): said on its button */
  keys?: string;
}
export interface MathShelf { id: string; label: string; /** its tab on a phone, where five words ran past the screen */ short: string; parts: MathPart[] }

const sym = (tex: string, name: string, keys?: string): MathPart => ({ tex, name, keys });

export const SHELVES: MathShelf[] = [
  {
    id: 'basic', label: 'Basic', short: 'x²', parts: [
      // \dfrac: as large inside another fraction as outside it (\frac shrank each level, two deep it was hard to read)
      { tex: '\\dfrac{#@}{#?}', show: '\\frac{a}{b}', name: 'Fraction', keys: '/' },
      { tex: '#@^{#?}', show: 'x^{2}', name: 'Power', keys: '^' },
      { tex: '#@_{#?}', show: 'x_{i}', name: 'Subscript', keys: '_' },
      { tex: '\\sqrt{#@}', show: '\\sqrt{x}', name: 'Square root', keys: 'sqrt' },
      { tex: '\\sqrt[#?]{#@}', show: '\\sqrt[n]{x}', name: 'Root' },
      { tex: '\\left(#@\\right)', show: '(x)', name: 'Parentheses' },
      { tex: '\\left|#@\\right|', show: '|x|', name: 'Absolute value' },
      { tex: '\\overline{#@}', show: '\\overline{x}', name: 'Bar' },
      { tex: '\\vec{#@}', show: '\\vec{v}', name: 'Vector' },
      { tex: '\\hat{#@}', show: '\\hat{x}', name: 'Hat' },
      { tex: '\\text{#?}', show: '\\text{abc}', name: 'Text' },
    ],
  },
  {
    id: 'symbols', label: 'Symbols', short: '±≤', parts: [
      sym('\\pm', 'Plus or minus', '+-'), sym('\\times', 'Times', '*'), sym('\\div', 'Divided by', '-:'), sym('\\cdot', 'Dot', '**'),
      sym('\\le', 'Less or equal', '<='), sym('\\ge', 'Greater or equal', '>='), sym('\\ne', 'Not equal', '!='), sym('\\approx', 'Approximately', '~~'),
      sym('\\equiv', 'Equivalent', '-='), sym('\\propto', 'Proportional', 'prop'), sym('\\infty', 'Infinity', 'oo'), sym('^{\\circ}', 'Degrees'),
      sym('\\to', 'Arrow', '->'), sym('\\Rightarrow', 'Implies', '=>'), sym('\\Leftrightarrow', 'If and only if'),
      sym('\\in', 'In', 'in'), sym('\\notin', 'Not in', '!in'), sym('\\subset', 'Subset', 'sub'), sym('\\cup', 'Union', 'uu'), sym('\\cap', 'Intersection', 'nn'),
      sym('\\emptyset', 'Empty set'), sym('\\forall', 'For all', 'AA'), sym('\\exists', 'Exists', 'EE'), sym('\\neg', 'Not', 'not'),
      sym('\\land', 'And', '&&'), sym('\\lor', 'Or', 'or'), sym('\\angle', 'Angle'), sym('\\perp', 'Perpendicular'), sym('\\parallel', 'Parallel'),
      sym('\\therefore', 'Therefore'), sym('\\ldots', 'Dots', '...'),
    ],
  },
  {
    id: 'calculus', label: 'Calculus', short: '∑∫', parts: [
      { tex: '\\sum_{#?}^{#?}', show: '\\sum_{i=1}^{n}', name: 'Sum' },
      { tex: '\\prod_{#?}^{#?}', show: '\\prod_{i=1}^{n}', name: 'Product' },
      { tex: '\\int_{#?}^{#?}', show: '\\int_{a}^{b}', name: 'Integral' },
      { tex: '\\int', show: '\\int', name: 'Indefinite integral' },
      { tex: '\\oint', show: '\\oint', name: 'Contour integral' },
      { tex: '\\lim_{#?\\to#?}', show: '\\lim_{x\\to 0}', name: 'Limit' },
      { tex: '\\frac{d}{d#?}', show: '\\frac{d}{dx}', name: 'Derivative' },
      { tex: '\\frac{\\partial}{\\partial #?}', show: '\\frac{\\partial}{\\partial x}', name: 'Partial derivative' },
      sym('\\partial', 'Partial', 'del'), sym('\\nabla', 'Nabla', 'nabla'),
      { tex: '\\log_{#?}', show: '\\log_{a}', name: 'Logarithm' },
      sym('\\ln', 'Natural log', 'ln'), sym('\\sin', 'Sine', 'sin'), sym('\\cos', 'Cosine', 'cos'), sym('\\tan', 'Tangent', 'tan'),
      { tex: 'e^{#?}', show: 'e^{x}', name: 'Exponential' },
    ],
  },
  {
    id: 'greek', label: 'Greek', short: 'αβ', parts: [
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega',
      'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
    ].map((g) => sym(`\\${g}`, g, g)),
  },
  {
    id: 'matrix', label: 'Matrix', short: '[ ]', parts: [
      { tex: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', show: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', name: '2×2 matrix' },
      { tex: '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}', show: '\\begin{pmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{pmatrix}', name: '3×3 matrix' },
      { tex: '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}', show: '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', name: 'Matrix in brackets' },
      { tex: '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}', show: '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', name: 'Determinant' },
      { tex: '\\begin{pmatrix}#?\\\\#?\\end{pmatrix}', show: '\\begin{pmatrix}x\\\\y\\end{pmatrix}', name: 'Column vector' },
      { tex: '\\begin{cases}#?&#?\\\\#?&#?\\end{cases}', show: '\\begin{cases}a&x>0\\\\b&x\\le0\\end{cases}', name: 'Cases' },
      // in a matrix or cases already: a row or a column more (⌘↵ and ⌘; did it, unseen; a phone had no way)
      { tex: 'row', cmd: 'addRowAfter', show: '\\begin{smallmatrix}\\square\\\\ +\\end{smallmatrix}', name: 'Add a row (in a matrix)' },
      { tex: 'column', cmd: 'addColumnAfter', show: '\\begin{smallmatrix}\\square & +\\end{smallmatrix}', name: 'Add a column (in a matrix)' },
    ],
  },
];

/**
 * A formula as it is drawn and edited: every fraction as large as the text around it. \frac shrinks what is in it at
 * each level, and two deep a fraction was hard to read; notes written before keep their \frac, drawn this way.
 */
export const fullSize = (tex: string): string => tex.replace(/\\frac(?![a-zA-Z])/g, '\\dfrac');

/**
 * TeX as the note keeps it: MathLive's empty slots left out (`\\frac{1}{}` draws anywhere, `\\placeholder` only in
 * MathLive), and every fraction's and root's parts in braces, as people write them: MathLive shortens `\\frac{1}{2}` to
 * `\\frac12`, which other apps draw too but reads as twelve.
 */
export function tidyTex(tex: string): string {
  let s = tex.replace(/\\placeholder(?:\[[^\]]*\])?\{\}/g, '');
  let out = '';
  for (let i = 0; i < s.length; ) {
    const m = /^\\(?:[dt]?frac|binom)(?![a-zA-Z])/.exec(s.slice(i));
    if (!m) { out += s[i++]; continue; }
    out += m[0];
    i += m[0].length;
    for (let k = 0; k < 2; k++) {
      while (s[i] === ' ') i++;
      if (s[i] === '{') {
        let depth = 0, j = i;
        for (; j < s.length; j++) {
          if (s[j] === '\\') { j++; continue; }
          if (s[j] === '{') depth++;
          else if (s[j] === '}' && --depth === 0) break;
        }
        out += tidyTex(s.slice(i, j + 1));
        i = j + 1;
      } else if (s[i] === '\\') {
        const c = /^\\(?:[a-zA-Z]+|.)/.exec(s.slice(i))![0];
        out += `{${c}}`;
        i += c.length;
      } else if (i < s.length) {
        out += `{${s[i]}}`;
        i++;
      }
    }
  }
  return out;
}
