// Text stays readable in both themes. The light theme's dim grey read at 3.6:1 on the list's grey and a link at 2.9:1
// on the page, and nothing said so: every colour is a token in app.css (:root), so each pair of text and the ground
// it sits on is worked out here, in both themes, against WCAG's 4.5:1 for text (3:1 for an icon or a bold label).
// - Accent as text or an icon is --accent-text: --accent itself is a fill (a button, a toggle, a ring) and too light
//   to read words in on the light theme.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(SRC, 'app.css'), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));

/** each --token: its light and its dark value, var() followed */
const raw = Object.fromEntries([...root.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
function value(name, theme) {
  const v = raw[name];
  assert.ok(v, `app.css sets no ${name}`);
  const ld = /^light-dark\(\s*(.+?)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*\)$/.exec(v);
  const one = ld ? ld[theme === 'light' ? 1 : 2] : v;
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(one);
  return ref ? value(ref[1], theme) : one;
}
/** a colour as [r, g, b, a] */
function rgba(c) {
  let m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) {
    const h = m[1].length <= 4 ? [...m[1]].map((x) => x + x).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1);
  }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  assert.ok(m, `not a colour this guard reads: ${c}`);
  const p = m[1].split(',').map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
}
/** a translucent colour as it shows over what is under it */
const over = (top, under) => top.slice(0, 3).map((x, i) => x * top[3] + under[i] * (1 - top[3])).concat(1);
const lum = ([r, g, b]) => [r, g, b].map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

/** a ground: a token, a translucent one over the page, or over another ground (`--bg-hover@--bg-side`: a row hovered in the list) */
function ground(name, theme) {
  const [top, under = '--bg'] = name.split('@');
  return over(rgba(value(top, theme)), under === '--bg' ? rgba(value('--bg', theme)) : ground(under, theme));
}

const TEXT = 4.5, ICON = 3;
// [text, grounds it is set on, the least it may read at]
const PAIRS = [
  ['--fg', ['--bg', '--bg-side', '--bg-pop', '--tip-bg', '--bg-active', '--bg-input', '--code-bg', '--sel', '--accent-soft'], TEXT],
  ['--fg-dim', ['--bg', '--bg-side', '--bg-pop', '--tip-bg', '--bg-hover', '--bg-hover@--bg-side', '--bg-input'], TEXT],
  ['--tip-fg', ['--tip-bg'], TEXT],
  ['--accent-text', ['--bg', '--bg-side', '--bg-pop', '--bg-hover', '--bg-hover@--bg-side'], TEXT],
  ...['--hl-key', '--hl-str', '--hl-num', '--hl-fn', '--hl-var'].map((h) => [h, ['--code-bg'], TEXT]),
  // a button's label on the accent: short, bold words, read as a label (Turtle and Toss keep white on their blue too)
  ['--on-accent', ['--accent'], ICON],
];

const low = [];
for (const theme of ['light', 'dark']) {
  for (const [fg, grounds, min] of PAIRS) {
    for (const g of grounds) {
      const r = ratio(over(rgba(value(fg, theme)), ground(g, theme)), ground(g, theme));
      if (r < min) low.push(`${theme}: ${fg} on ${g} reads at ${r.toFixed(2)}:1, under ${min}:1`);
    }
  }
}
assert.deepEqual(low, [], 'text that does not stand out enough from what it sits on (app.css :root)');

// ---- the accent drawn as words or an icon: --accent-text ----
const files = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const asText = [];
for (const p of files(SRC).filter((p) => /\.(svelte|css)$/.test(p))) {
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    // `color:` alone (not background-color, border-color, caret-color…), fill and stroke draw text and icons
    if (/(^|[\s;{])(color|fill|stroke)\s*:\s*var\(--accent\)/.test(line)) asText.push(`${relative(SRC, p)}:${i + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(asText, [], 'the accent as text or an icon is var(--accent-text): --accent is for fills');
