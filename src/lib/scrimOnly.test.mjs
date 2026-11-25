// A click catcher (a box over the whole window that draws nothing, there to be pressed so what is open closes) is
// <Scrim> (src/Scrim.svelte). Drawn by hand, one stayed live while what it sat beside faded out and took the next
// click: a menu's took the click meant to open the next menu (d0c0d17), a setting's list's the next click anywhere
// (31a392f). Scrim has an outro of its own, so it lets go of the pointer the moment it starts to go, wherever it sits.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const OWN = 'Scrim.svelte';
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const rel = (p) => relative(SRC, p).replaceAll('\\', '/');

const zero = (side) => new RegExp(`(^|[;{\\s])${side}\\s*:\\s*0(px)?\\s*(;|$|!)`);
/** declarations that make a box cover the whole window and take the pointer */
const wholeWindow = (decls) => /position\s*:\s*fixed/.test(decls) && !/pointer-events\s*:\s*none/.test(decls)
  && (zero('inset').test(decls) || ['top', 'right', 'bottom', 'left'].every((s) => zero(s).test(decls)));

/** the class lists (all of each on one element) whose rules in `css` cover the whole window */
function coveringClasses(css) {
  const out = [];
  for (const [, selectors, decls] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!wholeWindow(decls)) continue;
    for (const sel of selectors.split(',')) {
      const last = sel.trim().replace(/:global\(([^)]*)\)/g, '$1').split(/[\s>+~]+/).pop();
      const classes = [...last.replace(/::?[\w-]+(\([^)]*\))?/g, '').matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (classes.length) out.push(classes);
    }
  }
  return out;
}

const blank = (s) => s.replace(/[^\n]/g, ' ');
/** each element tag in a component's markup, whole (its handlers hold `=>` and `>`), and whether it holds nothing */
function* tags(markup) {
  const open = /<([a-z][\w-]*)\b/g;
  for (let m; (m = open.exec(markup)); ) {
    let depth = 0, quote = '', i = m.index + m[0].length;
    for (; i < markup.length; i++) {
      const c = markup[i];
      if (quote) { if (c === quote && markup[i - 1] !== '\\') quote = ''; continue; }
      if (depth === 0 && (c === '"' || c === "'")) quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const tag = markup.slice(m.index, i + 1);
    const empty = tag.endsWith('/>') || new RegExp(`^\\s*</${m[1]}\\s*>`).test(markup.slice(i + 1));
    yield { tag, empty, at: m.index };
  }
}

const classesOf = (tag) => [
  ...(/\sclass="([^"]*)"/.exec(tag)?.[1] ?? '').replace(/\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean),
  ...[...tag.matchAll(/\sclass:([\w-]+)/g)].map((m) => m[1]),
];
const inlineWhole = (tag) => wholeWindow(/\sstyle="([^"]*)"/.exec(tag)?.[1] ?? '')
  || (/\sstyle:position="fixed"/.test(tag) && /\sstyle:inset="0(px)?"/.test(tag));

/** the click catchers drawn in a component's source, with `global` the rules of the app's own stylesheets */
function catchers(text, global) {
  const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const covering = [...coveringClasses(global), ...coveringClasses(styles)];
  const markup = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, blank).replace(/<!--[\s\S]*?-->/g, blank);
  const found = [];
  for (const t of tags(markup)) {
    if (!t.empty) continue;
    const has = classesOf(t.tag);
    if (inlineWhole(t.tag) || covering.some((cs) => cs.every((c) => has.includes(c)))) {
      found.push({ line: markup.slice(0, t.at).split('\n').length, tag: t.tag.replace(/\s+/g, ' ') });
    }
  }
  return found;
}

const all = files(SRC);
const global = all.filter((p) => p.endsWith('.css')).map((p) => readFileSync(p, 'utf8')).join('\n');
const bad = all.filter((p) => p.endsWith('.svelte') && rel(p) !== OWN)
  .flatMap((p) => catchers(readFileSync(p, 'utf8'), global).map((c) => `${rel(p)}:${c.line}  ${c.tag.slice(0, 110)}`));
assert.deepEqual(bad, [], `a click catcher is <Scrim> (src/Scrim.svelte), which lets go of the pointer as it starts to go; one drawn by hand stays live while its neighbours fade out and takes the next click:\n${bad.join('\n')}`);

// Scrim's own: it is a catcher, and its outro is its own and plays wherever it sits (|global)
const own = readFileSync(join(SRC, OWN), 'utf8');
const mine = catchers(own, global);
assert.equal(mine.length, 1, 'Scrim.svelte draws one catcher');
assert.match(mine[0].tag, /\stransition:\w+\|global=/, "Scrim's box has a |global transition of its own: Svelte makes an element inert only as its own outro starts");

// the check itself finds what it is for: the menu's catcher before d0c0d17, and one placed by an inline style
const before = `<div class="backdrop" onmousedown={() => ui.closeMenu()} oncontextmenu={(e) => { e.preventDefault(); ui.closeMenu(); }}></div>
<ul class="menu" transition:scale|global={popIn}></ul>
<style>
  .backdrop { position: fixed; inset: 0; z-index: var(--z-menu-scrim); }
  .menu { position: fixed; z-index: var(--z-menu); }
</style>`;
assert.equal(catchers(before, '').length, 1, "the check finds a menu's hand-drawn catcher");
assert.equal(catchers('<div style="position: fixed; inset: 0" onclick={x}></div>', '').length, 1, 'the check finds a catcher placed by an inline style');
assert.equal(catchers('<div class="viewer" onclick={x}><img src="a.png" alt="" /></div><style>.viewer { position: fixed; inset: 0; }</style>', '').length, 0, 'a box over the window that shows something is not a catcher');

console.log('click catchers: <Scrim> only');
