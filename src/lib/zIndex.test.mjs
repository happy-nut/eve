// What floats, and over what: two rules that ~20 fixes kept finding broken one place at a time (a menu under the full-size
// picture, the / menu off the window's right edge, a box's bar over its +, the table's bar over the line above it).
// - Every z-index is one of the --z-* layers set on :root in app.css, where their order is written down once. A number
//   anywhere else was how a menu ended up under a picture: each component guessed its own.
// - Nothing in a component reads the window's size to place itself: placement goes through popup.ts (floatAt), which
//   knows the Mac's title strip, a phone's bars and its keyboard. The few reads left are not placement, and say why.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const all = files(SRC);
const rel = (p) => relative(SRC, p).replaceAll('\\', '/');

// ---- z-index: tokens only ----
const literal = /z-index\s*:\s*-?\d/;
const bad = [];
let defined = 0;
for (const p of all.filter((p) => /\.(svelte|css)$/.test(p))) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (literal.test(line)) bad.push(`${rel(p)}:${i + 1}: ${line.trim()}`);
    if (rel(p) === 'app.css') defined += (line.match(/--z-[a-z-]+\s*:\s*-?\d+/g) ?? []).length;
  });
}
assert.deepEqual(bad, [], 'a z-index is a --z-* token from app.css (:root), not a number');
assert.ok(defined >= 10, 'the --z-* layers are set in app.css');
// every token used is one that is set
const set = new Set(readFileSync(join(SRC, 'app.css'), 'utf8').match(/--z-[a-z-]+(?=\s*:)/g));
const unknown = [];
for (const p of all.filter((p) => /\.(svelte|css)$/.test(p))) {
  for (const m of readFileSync(p, 'utf8').matchAll(/z-index\s*:\s*var\((--z-[a-z-]+)\)/g)) if (!set.has(m[1])) unknown.push(`${rel(p)}: ${m[1]}`);
}
assert.deepEqual(unknown, [], 'a z-index token that app.css does not set');

// ---- the window's size: through popup.ts ----
/** file → why it may read the window's size itself */
const ALLOWED = {
  // a phone's keyboard told apart from a rotation: the tallest the window has been at each width (not placement)
  'MobileBar.svelte': 5,
  // a chart drawn as HTML on the whole screen is given a width to lay itself out at (its size, not where it goes)
  'DiagramBlock.svelte': 1,
};
const reads = {};
for (const p of all.filter((p) => p.endsWith('.svelte'))) {
  const n = (readFileSync(p, 'utf8').match(/window\.inner(Width|Height)/g) ?? []).length;
  if (n) reads[rel(p).split('/').pop()] = n;
}
const over = Object.entries(reads).filter(([f, n]) => n > (ALLOWED[f] ?? 0)).map(([f, n]) => `${f}: ${n} read(s) of window.innerWidth/innerHeight`);
assert.deepEqual(over, [], 'placement goes through popup.ts (floatAt, screenInsets, viewSize), not window.innerWidth/innerHeight');
console.log('z-index and window size: ok');
