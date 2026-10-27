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

// ---- no size containers ----
// The note's pane was one (container-type, for 100cqw) and WebKit at times drew none of the note but its white page.
// A width a block needs from around it is set as a variable instead (--pane, Editor.svelte).
const contained = [];
for (const p of all.filter((p) => /\.(svelte|css)$/.test(p))) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\*.*?(\*\/|$)/g, '');
    if (/container-type\s*:\s*(?!normal)|container\s*:|\d(cqw|cqh|cqi|cqb|cqmin|cqmax)\b/.test(code)) contained.push(`${rel(p)}:${i + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(contained, [], 'no container-type / container query units: WebKit left the note blank');

// ---- an opaque window ----
// The window was see-through so the page could fade itself in and out and draw its own rounded corners (#app clipped
// to a radius). The fade is long gone; what stayed was WebKit coming back from another app with only the white page
// drawn, the note missing in part or whole. The window is an ordinary one (macOS rounds its corners), and the page
// clips nothing to a radius at its root.
const conf = JSON.parse(readFileSync(join(SRC, '../src-tauri/tauri.conf.json'), 'utf8'));
assert.ok(!conf.app.windows.some((w) => w.transparent), 'the window is not transparent: WebKit left the page white');
const root = readFileSync(join(SRC, 'app.css'), 'utf8').match(/^#app\s*\{[^}]*\}/m)?.[0] ?? '';
assert.ok(!/border-radius|overflow\s*:\s*hidden/.test(root), '#app clips nothing to rounded corners: ' + root);

// ---- the page's head: laid out in Editor.svelte only ----
// The Mac's, the phone's and tabs' rules for it were in app.css with !important, a cover's in Editor.svelte, and each
// fix for one window broke another (the phone's Add cover over the title; the icon off the cover's edge with tabs).
// A window sets --head-top / --head-side there; nothing else styles the head (e2e/head.mjs checks how it looks).
const heads = [];
for (const p of all.filter((p) => /\.(svelte|css)$/.test(p) && rel(p) !== 'Editor.svelte')) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (/\.(page-head|page-controls)\b/.test(line.replace(/\/\*.*?(\*\/|$)/g, ''))) heads.push(`${rel(p)}:${i + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(heads, [], "the page's head is laid out in Editor.svelte only (a window sets --head-top / --head-side there)");
console.log('z-index, window size, containers, an opaque window and the page\'s head: ok');
