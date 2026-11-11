// One word for one thing: what the user writes in is a note, wherever it sits — at the top of the list or under
// another note. The menus said "New note" in one place and "New page inside" in another, the / menu "a page under
// this one", the shortcut list "The page this one is under", for the same thing. Words shown to the user (strings
// and markup text, not comments) say note; "page" is left only where it means something else (a PDF's or a slide's
// page, a web page).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const shown = files(SRC).filter((p) => /\.(svelte|ts)$/.test(p) && !/\.test\.|test[A-Z]|testSetup|\.harness\./.test(p));
// "page" meaning something other than a note
const other = /Page turn|GitHub page|on that page|a light page|PDF page|web ?page/i;
const word = /\b(sub-?)?pages?\b/i;

const bad = [];
for (const p of shown) {
  const text = readFileSync(p, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/keywords: '[^']*'/g, ''); // the / menu's search words, never shown, find it by "page" too
  text.split('\n').forEach((line, i) => {
    // words in quotes, or between tags; prose only (a space in it), so ids, classes and keys are not taken
    const runs = [...line.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
    for (const r of runs) if (/\s/.test(r) && word.test(r) && !other.test(r) && !/^[.#\[:]|\.(tiptap|page)|querySelector/.test(r)) bad.push(`${relative(SRC, p)}:${i + 1}: ${r.trim()}`);
  });
}
assert.deepEqual(bad, [], 'a note is called a note on the screen, not a page');
console.log('wording ok');
