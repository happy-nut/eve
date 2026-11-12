// Every button has a name a screen reader (and VoiceOver's rotor) can say. A button that is only an icon, or
// only "×", was read as "button" or "times": the sidebar's delete was one. `aria-label` on each; a `title`
// or a `data-tip` alone is a hover hint, not its name.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : [p]; });

const nameless = [];
for (const p of files(SRC).filter((p) => p.endsWith('.svelte'))) {
  const s = readFileSync(p, 'utf8');
  for (let i = 0; (i = s.indexOf('<button', i)) >= 0; ) {
    // the tag runs to the first > outside { } (an onclick's => is not its end)
    let j = i + 7;
    for (let depth = 0; j < s.length; j++) { const c = s[j]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && !depth) break; }
    const attrs = s.slice(i + 7, j);
    const inner = s.slice(j + 1, s.indexOf('</button>', j));
    const line = s.slice(0, i).split('\n').length;
    i = j;
    if (/aria-label/.test(attrs)) continue;
    const words = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\{[#:/][^}]*\}/g, '').trim();
    if (!words || /^[×⋯+−✕…↑↓←→‹›]$/.test(words)) nameless.push(`${relative(SRC, p)}:${line}`);
  }
}
assert.deepEqual(nameless, [], 'a button of an icon (or ×) alone needs an aria-label');
console.log('button names ok');
