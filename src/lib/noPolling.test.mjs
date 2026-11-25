// Nothing in the app waits for something to be drawn by trying again on a timer. Code that did (a function that sets a
// timer to call itself until a node shows up, a loop that sleeps and looks again) worked on the machine it was written
// on and lost the key or the click on a slower one: the icon picker's ↓ was fixed four times in four days that way
// (9934395, 18f7cfe, cc84f24, 2feeb55). Wait on what says the thing is there instead: a promise or event of whatever
// draws it (loadEmoji(), mermaid's render, an iframe's load), `await tick()` after a state change of our own, or draw it
// ourselves from state. A wait that something outside truly forces is named here, with why.
//
// The browser checks (e2e/, the feature-map drives) hold the same way: a fixed waitForTimeout passes on a fast machine
// and fails on CI. Each file's count may only go down; wait for what a person would see (locator.waitFor,
// waitForFunction, expect.poll) instead.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const src = join(root, 'src');

/** waits that try again, each with what outside forces it and until when; `at` is the function, `loop`, or `interval` */
const ALLOWED = [
  // timers on a clock or a gesture, not waits for something to be drawn
  { file: 'FlowEditor.svelte', at: 'interval', why: 'a line dragged to the edge scrolls the drawing every 30 ms while it is held there' },
  { file: 'lib/reminder.ts', at: 'interval', why: 'reminders are due by the clock' },
  { file: 'lib/diagramMotion.ts', at: 'interval', why: 'a diagram played step by step, one step every STEP_MS' },
  { file: 'lib/selectionLayer.ts', at: 'interval', why: 'a reflow moves the selected text without an event (ResizeObserver does not see a line moving inside a box that keeps its size)' },
  { file: 'lib/sync.svelte.ts', at: 'interval', why: '"synced 3 min ago" is a clock' },
  { file: 'lib/updates.svelte.ts', at: 'interval', why: 'updates are looked for on a clock' },
  { file: 'lib/focusWatch.ts', at: 'interval', why: "the tests' focus sentinel: jsdom fires no event when a focused node is removed" },
];
const TODAY = new Date().toISOString().slice(0, 10);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|js|mjs|svelte)$/.test(name) && !/\.test\.|testSetup|testEditor|fakeGitHub/.test(name)) yield p;
  }
}

/** the code of a file with strings, comments and (in a .svelte) the markup blanked out, so braces can be counted */
function codeOf(text, svelte) {
  let out = '';
  let i = 0;
  const script = svelte ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => [m.index + m[0].indexOf(m[1]), m.index + m[0].indexOf(m[1]) + m[1].length]) : [[0, text.length]];
  const inScript = (k) => script.some(([a, b]) => k >= a && k < b);
  while (i < text.length) {
    const c = text[i], d = text[i + 1];
    if (!inScript(i)) { out += c === '\n' ? '\n' : ' '; i++; continue; }
    if (c === '/' && d === '/') { while (i < text.length && text[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { out += text[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < text.length && text[i] !== c) { if (text[i] === '\\') { out += '  '; i += 2; continue; } out += text[i] === '\n' ? '\n' : ' '; i++; }
      out += c; i++; continue;
    }
    if (c === '/' && /[=(,:!&|?{};]\s*$/.test(out.slice(-20)) && d !== '/' && d !== '*') {
      out += '/'; i++;
      let cls = false;
      while (i < text.length && text[i] !== '\n' && (cls || text[i] !== '/')) { if (text[i] === '\\') { out += '  '; i += 2; continue; } if (text[i] === '[') cls = true; if (text[i] === ']') cls = false; out += ' '; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** for each `{`, where its block ends and the code just before it (a loop's or a function's head) */
function blocks(code) {
  const open = [], all = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') open.push(i);
    else if (code[i] === '}' && open.length) { const a = open.pop(); all.push({ from: a, to: i, head: code.slice(Math.max(0, a - 200), a) }); }
  }
  return all;
}
const around = (bs, at) => bs.filter((b) => b.from < at && at < b.to).sort((x, y) => y.from - x.from);
const fnName = (head) => /(?:function\s+([\w$]+)\s*\([^)]*\)|(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>)\s*$/.exec(head)?.slice(1).find(Boolean);
const isLoop = (head) => /\b(for|while)\s*\([^{}]*\)\s*$|\bdo\s*$/.test(head);
const line = (text, at) => text.slice(0, at).split('\n').length;

const found = [];
for (const p of files(src)) {
  const rel = relative(src, p).split('\\').join('/');
  const text = readFileSync(p, 'utf8');
  const code = codeOf(text, p.endsWith('.svelte'));
  const bs = blocks(code);
  // a timer set to call the function it is set from: that function tries again until something shows up
  for (const m of code.matchAll(/\b(?:setTimeout|requestAnimationFrame)\(\s*([\w$]+)\s*[,)]/g)) {
    const self = around(bs, m.index).map((b) => fnName(b.head)).find((n) => n === m[1]);
    const statement = code.slice(code.lastIndexOf('\n', m.index), m.index);
    if (self && /(\+\+\s*[\w$.]+|[\w$.]+\s*\+\+)\s*<|<\s*[\w$.]+\s*\)?\s*$/.test(statement)) found.push({ file: rel, at: self, where: `${rel}:${line(text, m.index)}`, what: `${self} sets a timer to call itself` });
  }
  // a loop that sleeps and looks again
  for (const m of code.matchAll(/\bawait\s+new\s+Promise\(\s*\(?\s*[\w$]*\s*\)?\s*=>\s*(?:setTimeout|requestAnimationFrame)\(/g)) {
    if (around(bs, m.index).some((b) => isLoop(b.head))) found.push({ file: rel, at: 'loop', where: `${rel}:${line(text, m.index)}`, what: 'a loop sleeps on a timer and looks again' });
  }
  // a timer on an interval: a clock or a gesture is named in ALLOWED; looking again and again for something drawn is not
  for (const m of code.matchAll(/\bsetInterval\(/g)) found.push({ file: rel, at: 'interval', where: `${rel}:${line(text, m.index)}`, what: 'a timer on an interval' });
}

const allowedOf = (f) => ALLOWED.find((a) => a.file === f.file && a.at === f.at);
const wrong = found.filter((f) => !allowedOf(f));
assert.deepEqual(wrong.map((f) => `${f.where}  ${f.what}`), [],
  'Wait on what says it is there (a promise or event of what draws it, await tick() after our own state change), or draw it from state; a wait something outside forces goes in ALLOWED in src/lib/noPolling.test.mjs with why');
const expired = ALLOWED.filter((a) => a.until && a.until < TODAY);
assert.deepEqual(expired.map((a) => `${a.file} ${a.at} (until ${a.until}): ${a.why}`), [], 'these waits were let stay until a date that has passed: wait on a signal instead, or ask the owner for a new date');
const gone = ALLOWED.filter((a) => !found.some((f) => f.file === a.file && f.at === a.at));
assert.deepEqual(gone.map((a) => `${a.file} ${a.at}`), [], 'these waits are gone from the code: take them out of ALLOWED in src/lib/noPolling.test.mjs');

/** fixed sleeps in the browser checks, per file: may only go down */
const SLEEPS = {
  'e2e/code.mjs': 23,
  'e2e/diagramForms.mjs': 45,
  'e2e/diagrams.mjs': 10,
  'e2e/handle.mjs': 31,
  'e2e/head.mjs': 4,
  'e2e/math.mjs': 5,
  'e2e/mem.mjs': 3,
  'e2e/overlap.mjs': 2,
  'e2e/perf.mjs': 3,
  'e2e/phone.mjs': 14,
  'e2e/popups.mjs': 20,
  'e2e/present.mjs': 14,
  'e2e/selection.mjs': 8,
  'e2e/summon.mjs': 6,
  'e2e/table.mjs': 17,
  'e2e/ui.mjs': 58,
};
const sleeps = {};
for (const dir of ['e2e', '.claude/skills/verify-eve/drives', '.claude/skills/verify-eve/scripts']) {
  let names = [];
  try { names = readdirSync(join(root, dir)); } catch { continue; }
  for (const name of names.filter((n) => /\.m?js$/.test(n))) {
    const n = (readFileSync(join(root, dir, name), 'utf8').match(/\bwaitForTimeout\(/g) ?? []).length;
    if (n) sleeps[`${dir}/${name}`] = n;
  }
}
if (process.env.SLEEPS_PRINT) console.log(JSON.stringify(sleeps, null, 2));
const more = Object.entries(sleeps).filter(([f, n]) => n > (SLEEPS[f] ?? 0)).map(([f, n]) => `${f}: ${n} waitForTimeout (was ${SLEEPS[f] ?? 0})`);
assert.deepEqual(more, [], 'a fixed sleep passes on a fast machine and fails on CI: wait for what a person would see (locator.waitFor, waitForFunction, expect.poll)');
const fewer = Object.entries(SLEEPS).filter(([f, n]) => (sleeps[f] ?? 0) < n).map(([f, n]) => `${f}: ${sleeps[f] ?? 0} (SLEEPS says ${n})`);
assert.deepEqual(fewer, [], 'fewer fixed sleeps than SLEEPS in src/lib/noPolling.test.mjs says: lower its number to this');
console.log(`ok   no waits that try again (${ALLOWED.length} named), fixed sleeps in browser checks not growing`);
