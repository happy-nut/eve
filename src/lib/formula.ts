/**
 * Notion's formulas, the part a note's table needs: `prop("Price") * 2`, `if(prop("Done"), "✓", "")`,
 * `dateBetween(prop("Due"), now(), "days")`, `concat(prop("Name"), " (", prop("Status"), ")")`. Read by a small parser
 * of its own and worked out over the row's values: nothing is run as code (a note's formula is no script).
 *
 * Values are numbers, words, true/false, or nothing (null). A date is words, `2026-11-01`.
 */
export type Val = number | string | boolean | null;
type Node =
  | { k: 'lit'; v: Val }
  | { k: 'call'; f: string; args: Node[] }
  | { k: 'op'; op: string; a: Node; b: Node }
  | { k: 'neg'; a: Node };

export class FormulaError extends Error {}

function tokens(src: string): string[] {
  const out: string[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|>=|<=|&&|\|\||[-+*/%(),<>!]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`can't read “${src.slice(i).trim().slice(0, 12)}”`);
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
    i = re.lastIndex;
  }
  return out;
}

/** the formula read, or an error saying where it went wrong */
export function parseFormula(src: string): Node {
  const t = tokens(src);
  let i = 0;
  const peek = () => t[i], next = () => t[i++];
  const expect = (s: string) => { if (next() !== s) throw new FormulaError(`expected “${s}”`); };
  // lowest first: || && == != < > <= >= + - * / % unary
  const levels = [['||', 'or'], ['&&', 'and'], ['==', '!=', '<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
  const binary = (lvl: number): Node => {
    if (lvl === levels.length) return unary();
    let a = binary(lvl + 1);
    while (levels[lvl].includes(peek())) { const op = next(); a = { k: 'op', op: op === 'or' ? '||' : op === 'and' ? '&&' : op, a, b: binary(lvl + 1) }; }
    return a;
  };
  const unary = (): Node => {
    if (peek() === '-') { next(); return { k: 'neg', a: unary() }; }
    if (peek() === '!' || peek() === 'not') { next(); return { k: 'call', f: 'not', args: [unary()] }; }
    return atom();
  };
  const atom = (): Node => {
    const s = next();
    if (s === undefined) throw new FormulaError('it ends too soon');
    if (s === '(') { const e = binary(0); expect(')'); return e; }
    if (/^\d/.test(s)) return { k: 'lit', v: Number(s) };
    if (s[0] === '"') return { k: 'lit', v: JSON.parse(s) };
    if (s === 'true' || s === 'false') return { k: 'lit', v: s === 'true' };
    if (/^[A-Za-z_]/.test(s)) {
      expect('(');
      const args: Node[] = [];
      if (peek() !== ')') { do args.push(binary(0)); while (peek() === ',' && next()); }
      expect(')');
      if (!(s in FNS)) throw new FormulaError(`no function “${s}”`);
      return { k: 'call', f: s, args };
    }
    throw new FormulaError(`unexpected “${s}”`);
  };
  const e = binary(0);
  if (i < t.length) throw new FormulaError(`unexpected “${t[i]}”`);
  return e;
}

const num = (v: Val): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : v === null || v === '' ? 0 : Number(v));
const str = (v: Val): string => (v === null ? '' : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v));
const truthy = (v: Val) => !(v === null || v === false || v === 0 || v === '');
const day = (v: Val) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v)); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; };
const pad = (n: number) => String(n).padStart(2, '0');

const FNS: Record<string, (a: Val[], prop: (name: string) => Val) => Val> = {
  prop: ([n], prop) => prop(str(n)),
  if: ([c, a, b]) => (truthy(c) ? a ?? null : b ?? null),
  not: ([a]) => !truthy(a),
  and: (a) => a.every(truthy),
  or: (a) => a.some(truthy),
  empty: ([a]) => !truthy(a),
  concat: (a) => a.map(str).join(''),
  length: ([a]) => str(a).length,
  contains: ([a, b]) => str(a).includes(str(b)),
  lower: ([a]) => str(a).toLowerCase(),
  upper: ([a]) => str(a).toUpperCase(),
  format: ([a]) => str(a),
  toNumber: ([a]) => { const x = Number(str(a)); return isNaN(x) ? null : x; },
  round: ([a, d]) => { const k = 10 ** num(d ?? 0); return Math.round(num(a) * k) / k; },
  floor: ([a]) => Math.floor(num(a)),
  ceil: ([a]) => Math.ceil(num(a)),
  abs: ([a]) => Math.abs(num(a)),
  min: (a) => Math.min(...a.map(num)),
  max: (a) => Math.max(...a.map(num)),
  sum: (a) => a.map(num).reduce((x, y) => x + y, 0),
  now: () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
  // whole days (or weeks, months, years) from b to a, as Notion's dateBetween
  dateBetween: ([a, b, unit]) => {
    const x = day(a), y = day(b);
    if (isNaN(x) || isNaN(y)) return null;
    const days = Math.round((x - y) / 86_400_000);
    const u = str(unit ?? 'days');
    return u.startsWith('week') ? Math.trunc(days / 7) : u.startsWith('month') ? Math.trunc(days / 30.44) : u.startsWith('year') ? Math.trunc(days / 365.25) : days;
  },
};

function run(n: Node, prop: (name: string) => Val): Val {
  switch (n.k) {
    case 'lit': return n.v;
    case 'neg': return -num(run(n.a, prop));
    case 'call': return FNS[n.f](n.args.map((a) => run(a, prop)), prop);
    case 'op': {
      const a = run(n.a, prop), b = run(n.b, prop);
      switch (n.op) {
        // words joined when either side is words that are no number, as Notion's +
        case '+': return typeof a === 'string' && isNaN(Number(a)) || typeof b === 'string' && isNaN(Number(b)) ? str(a) + str(b) : num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': return num(b) === 0 ? null : num(a) / num(b);
        case '%': return num(b) === 0 ? null : num(a) % num(b);
        case '==': return str(a) === str(b);
        case '!=': return str(a) !== str(b);
        case '<': return cmp(a, b) < 0;
        case '>': return cmp(a, b) > 0;
        case '<=': return cmp(a, b) <= 0;
        case '>=': return cmp(a, b) >= 0;
        case '&&': return truthy(a) && truthy(b);
        case '||': return truthy(a) || truthy(b);
      }
    }
  }
  return null;
}
const cmp = (a: Val, b: Val) => (typeof a === 'number' || typeof b === 'number' ? num(a) - num(b) : str(a).localeCompare(str(b)));

/** The formula worked out over a row (`prop` gives its values), as the words a cell shows; an error says so. */
export function evaluate(src: string, prop: (name: string) => Val): { value: string; error?: string } {
  if (!src.trim()) return { value: '' };
  try {
    const v = run(parseFormula(src), prop);
    return { value: v === true ? '✓' : v === false ? '' : str(v) };
  } catch (e) {
    return { value: '', error: e instanceof FormulaError ? e.message : 'it could not be worked out' };
  }
}
