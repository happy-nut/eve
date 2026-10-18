// Nothing but keys.ts listens for keys on the window (or the document). Each listener there was a rule of its own
// about who hears a key first, kept by the order they were added in; keys went to the wrong one (Settings recording
// ⌘N while the app made a note of it, a diagram's Esc hiding the window). A part that wants keys claims them
// (claimKeys); a key listener on an element of its own is fine, but it is named here, with why.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('..', import.meta.url));
const ME = 'lib/keyListeners.test.mjs';
const KEYS = 'lib/keys.ts';

/** key listeners on an element of a part's own, each with why it is not a claim */
const ALLOWED = [
  { file: 'MathEdit.svelte', on: 'f', why: "the formula's own math-field: its Esc, Enter, Tab and ⌫ before MathLive's, inside it only" },
  { file: 'lib/code.ts', on: 'field', why: "a code block's language box: its keys are its own, kept from the note and the app" },
  { file: 'lib/image.ts', on: 'cap', why: "a picture's caption while it is written in: ⌘A selects the caption, not the note" },
  { file: 'lib/keys.dom.test.ts', on: 'box', why: "the test's own input, to see a capture claim come before it" },
];
const GLOBAL = /^(window|document|document\.body|document\.documentElement|globalThis|self|top|parent)$/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|js|mjs|svelte)$/.test(name)) yield p;
  }
}

/** the `<svelte:window …>` tags in a file, whole: their handlers hold `=>` and `>` comparisons */
function* specialTags(text) {
  const open = /<svelte:(window|document|body)\b/g;
  for (let m; (m = open.exec(text)); ) {
    let depth = 0, quote = '', i = m.index + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote && text[i - 1] !== '\\') quote = ''; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    yield { kind: m[1], tag: text.slice(m.index, i + 1), at: m.index };
  }
}

const line = (text, at) => text.slice(0, at).split('\n').length;
const found = [];
const usedAllowed = new Set();
for (const p of files(src)) {
  const rel = relative(src, p).split('\\').join('/');
  if (rel === ME || rel === KEYS) continue;
  const text = readFileSync(p, 'utf8');
  for (const t of specialTags(text)) {
    if (/\sonkey(down|up|press)(capture)?\s*=/.test(t.tag)) found.push(`${rel}:${line(text, t.at)}  <svelte:${t.kind} onkey…>: claimKeys (keys.ts) instead`);
  }
  // x.addEventListener('keydown', …), and svelte/events' on(window, 'keydown', …)
  const add = /([\w$.]+)\s*\.\s*addEventListener\(\s*['"`](keydown|keyup|keypress)['"`]/g;
  for (let m; (m = add.exec(text)); ) {
    const on = m[1].replace(/^\(|\)$/g, '');
    const ok = !GLOBAL.test(on) && ALLOWED.find((a) => a.file === rel && a.on === on);
    if (ok) { usedAllowed.add(ok); continue; }
    found.push(`${rel}:${line(text, m.index)}  ${on}.addEventListener('${m[2]}'): ${GLOBAL.test(on) ? 'claimKeys (keys.ts) instead' : 'not in the allowed list here (an element of its own? add it, with why)'}`);
  }
  const bare = /(^|[^.\w$])addEventListener\(\s*['"`](keydown|keyup|keypress)['"`]/g; // window's, unnamed
  for (let m; (m = bare.exec(text)); ) found.push(`${rel}:${line(text, m.index)}  addEventListener('${m[2]}') on the window: claimKeys (keys.ts) instead`);
  const on = /\bon\(\s*(window|document)\s*,\s*['"`](keydown|keyup|keypress)['"`]/g;
  for (let m; (m = on.exec(text)); ) found.push(`${rel}:${line(text, m.index)}  on(${m[1]}, '${m[2]}'): claimKeys (keys.ts) instead`);
}
assert.deepEqual(found, [], `keys listened for outside keys.ts:\n  ${found.join('\n  ')}`);
// an entry nothing needs any more goes, or the list stops saying what is true
const stale = ALLOWED.filter((a) => !usedAllowed.has(a)).map((a) => `${a.file} (${a.on})`);
assert.deepEqual(stale, [], `allowed key listeners that are no longer there: ${stale.join(', ')}`);

// the check itself finds what it is for
const probe = [...specialTags('<svelte:window onblur={() => a > b} onkeydown={(e) => go(e)} />')][0];
assert.ok(/\sonkeydown\s*=/.test(probe.tag), 'a handler with a > in it does not end the tag early');

console.log('key listeners: keys.ts only');
