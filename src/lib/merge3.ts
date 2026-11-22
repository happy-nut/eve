
function kept(a: string[], b: string[]): Int32Array {
  const n = a.length, m = b.length, w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i * w + j] = a[i] === b[j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    }
  }
  const to = new Int32Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) { to[i] = j; i++; j++; }
    else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) i++;
    else j++;
  }
  return to;
}

const withoutFinalNewlines = (text: string) => text.replace(/\n+$/, '');

const same = (x: string[], y: string[]) => x.length === y.length && x.every((l, i) => l === y[i]);

export function merge3(...versions: [base: string, ours: string, theirs: string]): string | null {
  const [base, ours, theirs] = versions.map(withoutFinalNewlines);
  if (ours === theirs) return ours;
  if (ours === base) return theirs;
  if (theirs === base) return ours;
  const lines = merge(base.split('\n'), ours.split('\n'), theirs.split('\n'), (b, o, t) => {
    const words = (l: string) => l.split(/(\s+)/);
    const w = merge(words(b), words(o), words(t));
    return w && w.join('');
  });
  return lines && lines.join('\n');
}

const MAX_TABLE_CELLS = 4_000_000;

function merge(b: string[], o: string[], t: string[], line?: (b: string, o: string, t: string) => string | null): string[] | null {
  if ((b.length + 1) * Math.max(o.length + 1, t.length + 1) > MAX_TABLE_CELLS) return null;
  const bo = kept(b, o), bt = kept(b, t);
  const out: string[] = [];
  let bi = 0, oi = 0, ti = 0;
  for (let s = 0; s <= b.length; s++) {
    if (s < b.length && (bo[s] < 0 || bt[s] < 0)) continue;
    const oe = s < b.length ? bo[s] : o.length, te = s < b.length ? bt[s] : t.length;
    const bc = b.slice(bi, s), oc = o.slice(oi, oe), tc = t.slice(ti, te);
    const one = line && bc.length === 1 && oc.length === 1 && tc.length === 1 ? line(bc[0], oc[0], tc[0]) : null;
    if (same(oc, bc)) out.push(...tc);
    else if (same(tc, bc) || same(oc, tc)) out.push(...oc);
    else if (!bc.length) out.push(...oc, ...tc);
    else if (one !== null) out.push(one);
    else if (same(tc.slice(0, bc.length), bc)) out.push(...oc, ...tc.slice(bc.length));
    else if (same(oc.slice(0, bc.length), bc)) out.push(...tc, ...oc.slice(bc.length));
    else if (same(tc.slice(tc.length - bc.length), bc)) out.push(...tc.slice(0, tc.length - bc.length), ...oc);
    else if (same(oc.slice(oc.length - bc.length), bc)) out.push(...oc.slice(0, oc.length - bc.length), ...tc);
    else return null;
    if (s < b.length) out.push(b[s]);
    bi = s + 1; oi = oe + 1; ti = te + 1;
  }
  return out;
}
