
function compared(s: string): { text: string; from: number[]; to: number[] } {
  let text = '';
  const from: number[] = [], to: number[] = [];
  const put = (c: string, a: number, b: number) => { text += c; from.push(a); to.push(b); };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\r') { i++; continue; }
    if (c === '\\' && i + 1 < s.length && /[!-/:-@[-`{-~\n]/.test(s[i + 1])) { put(s[i + 1], i, i + 2); i += 2; continue; }
    const entity = /^&(#32|#9|#160|nbsp);/.exec(s.slice(i, i + 6));
    // a run of spaces (or the entities the note writes for kept spaces): one, none at a line's end or by a table's |
    if (entity || c === ' ' || c === '\t' || c === ' ') {
      let j = i;
      for (let m; j < s.length; ) {
        if (s[j] === ' ' || s[j] === '\t' || s[j] === ' ') j++;
        else if ((m = /^&(#32|#9|#160|nbsp);/.exec(s.slice(j, j + 6)))) j += m[0].length;
        else break;
      }
      const next = s[j] === '\r' ? s[j + 1] : s[j];
      if (next !== undefined && next !== '\n' && next !== '|' && text[text.length - 1] !== '|' && text.length && text[text.length - 1] !== '\n') put(' ', i, j);
      i = j;
      continue;
    }
    // a run of backticks, of dashes (a table's rule, a divider): one, three
    if (c === '`' || c === '-') {
      let j = i;
      while (s[j] === c) j++;
      if (c === '`') put('`', i, j);
      else if (j - i >= 3) for (let k = 0; k < 3; k++) put('-', i, j); // three, each standing for the whole run
      else for (let k = i; k < j; k++) put('-', k, k + 1);
      i = j;
      continue;
    }
    put(c === '“' || c === '”' ? '"' : c === '‘' || c === '’' ? "'" : c, i, i + 1);
    i++;
  }
  return { text, from, to };
}

export type Found = { at: number; end: number } | 'none' | 'many';

/** where `passage` is in `body`: exactly as written if it is there, else as compared; once, or not at all */
export function findPassage(body: string, passage: string): Found {
  const at = passage ? body.indexOf(passage) : -1;
  if (at >= 0) return body.indexOf(passage, at + 1) >= 0 ? 'many' : { at, end: at + passage.length };
  const b = compared(body), p = compared(passage).text.replace(/^\s+|\s+$/g, '');
  if (!p) return 'none';
  const k = b.text.indexOf(p);
  if (k < 0) return 'none';
  if (b.text.indexOf(p, k + 1) >= 0) return 'many';
  return { at: b.from[k], end: b.to[k + p.length - 1] };
}

/** the note's line most like the passage's first one, to copy from when it was not found */
export function nearestLine(body: string, passage: string): string | undefined {
  const words = compared(passage.split('\n').find((l) => l.trim()) ?? '').text.split(/[\s|]+/).filter(Boolean); // (a table's cells, words too)
  const lines = body.split('\n').filter((l) => l.trim());
  let best: string | undefined, most = 0;
  for (const line of lines) {
    const has = compared(line).text;
    const n = words.filter((w) => has.includes(w)).length;
    if (n > most) { most = n; best = line; }
  }
  return most ? best : undefined;
}
