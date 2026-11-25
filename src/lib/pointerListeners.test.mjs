// A gesture follows the pointer through followPointer (src/lib/followPointer.ts): from the press it listens on the
// window, and it stops at the release or when the gesture is taken away (pointercancel). Each part that listened by
// hand could forget one of those, and its drag went on after the button was let go or stuck to the pointer after a
// finger was taken away (fb4a973 gathered six of them). So nothing else listens for the pointer moving or being let go
// on the window or the document, and nothing else takes the pointer for an element (setPointerCapture), which is how
// a part followed it from an element of its own. A hover listener (on an element of a part's own) is fine; one on the
// whole app, for as long as it runs, is named here with why.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('..', import.meta.url));
const OWN = 'lib/followPointer.ts';

/** listeners on the whole app that are not a gesture's, each with why */
const ALLOWED = [
  { file: 'App.svelte', on: 'window', event: 'mousemove', why: 'that a mouse is there at all (data-hover, for hover-only buttons): as long as the app runs, no gesture' },
  { file: 'Tooltip.svelte', on: 'document', event: 'mousemove', why: 'a tip goes once the pointer is off what it is for: hover, as long as the app runs, no gesture' },
  { file: 'lib/table.ts', on: 'view.root', event: 'mousemove', why: "a drag out of a table is ProseMirror's and prosemirror-tables' own, which listen on view.root's mousemove and mouseup: this one comes just before theirs and ends when they do" },
  { file: 'lib/table.ts', on: 'view.root', event: 'mouseup', why: 'as above' },
];
const MOVES = 'pointermove|pointerup|pointercancel|mousemove|mouseup|touchmove|touchend|touchcancel';
const GLOBAL = /^(window|document|document\.body|document\.documentElement|globalThis|self|top|parent|(this\.)?view\.root|[\w$.]+\.ownerDocument)$/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|js|mjs|svelte)$/.test(name) && !/\.test\.|testSetup|testEditor|fakeGitHub/.test(name)) yield p;
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

/** what in one file's source follows the pointer by hand: [{ at, on, event }] */
function byHand(text) {
  const found = [];
  for (const t of specialTags(text)) {
    for (const m of t.tag.matchAll(new RegExp(`\\son(${MOVES})(capture)?\\s*=`, 'g'))) found.push({ at: t.at, on: t.kind, event: m[1] });
  }
  for (const m of text.matchAll(new RegExp(`([\\w$.]+)\\s*\\.\\s*addEventListener\\(\\s*['"\`](${MOVES})['"\`]`, 'g'))) {
    if (GLOBAL.test(m[1])) found.push({ at: m.index, on: m[1].replace(/^this\./, ''), event: m[2] });
  }
  for (const m of text.matchAll(new RegExp(`(^|[^.\\w$])addEventListener\\(\\s*['"\`](${MOVES})['"\`]`, 'g'))) found.push({ at: m.index, on: 'window', event: m[2] });
  for (const m of text.matchAll(new RegExp(`\\bon\\(\\s*(window|document)\\s*,\\s*['"\`](${MOVES})['"\`]`, 'g'))) found.push({ at: m.index, on: m[1], event: m[2] });
  for (const m of text.matchAll(/\.setPointerCapture\(/g)) found.push({ at: m.index, on: 'an element', event: 'setPointerCapture' });
  return found;
}

const found = [];
const used = new Set();
for (const p of files(src)) {
  const rel = relative(src, p).split('\\').join('/');
  if (rel === OWN) continue;
  const text = readFileSync(p, 'utf8');
  for (const f of byHand(text)) {
    const ok = ALLOWED.find((a) => a.file === rel && a.on === f.on && a.event === f.event);
    if (ok) { used.add(ok); continue; }
    found.push(`${rel}:${line(text, f.at)}  ${f.event} on ${f.on}`);
  }
}
assert.deepEqual(found, [], `the pointer followed by hand: a gesture goes through followPointer (src/lib/followPointer.ts), which stops at the release or a gesture taken away (pass it the press to keep the pointer on its element); a listener on the whole app that is no gesture's is named in this file, with why:\n  ${found.join('\n  ')}`);
// an entry nothing needs any more goes, or the list stops saying what is true
const stale = ALLOWED.filter((a) => !used.has(a)).map((a) => `${a.file} (${a.event} on ${a.on})`);
assert.deepEqual(stale, [], `allowed pointer listeners that are no longer there: ${stale.join(', ')}`);

// the check itself finds what it is for: a drag that listened on the window by hand (FlowEditor before fb4a973), one
// that took the pointer for its own element (the size grip before followPointer), one written as a Svelte tag
assert.equal(byHand("window.addEventListener('pointermove', pMove);\nwindow.addEventListener('pointerup', pUp);").length, 2, 'finds a drag on the window');
assert.equal(byHand("grip.setPointerCapture(e.pointerId);\ngrip.addEventListener('pointermove', move);").length, 1, "finds a drag on an element's own captured pointer");
assert.equal(byHand('<svelte:window onblur={() => a > b} onpointerup={end} />').length, 1, 'finds one on <svelte:window>, past a > in a handler');
assert.equal(byHand("host.addEventListener('pointermove', onHostMove);").length, 0, "leaves hover on a part's own element");

console.log('pointer followed through followPointer only');
