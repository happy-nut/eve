// While an input method puts a syllable together, nothing the app draws itself changes the note around it (ime.ts). A
// change there split 한글 into jamo, lost it or put it in front, fixed eight times one place at a time: code's colours
// redrawn mid-word (dc6592e), a to-do's label rewritten at every key (58f4611), a caret node of its own at the caret
// (a966b2f), a composition told to end that the input method had not ended (749ebf6). So:
//   - a plugin's decorations are heldWhileComposing(…), or lineAttributes(…) (a line's attributes, which may follow);
//   - no Decoration.widget: a node of the app's own in the text took the arrow and left the input method nowhere to write;
//   - a node view's update keeps its own record of the node and draws through whenComposed(view, draw), nothing else;
//     a stock node view spread into one of Eve's gets an update of Eve's that does so;
//   - no CompositionEvent made by the app: the input method alone says when its syllable ends.
// IME_SRC=<a src folder> runs it over another tree (an old commit's, to see it catch what was fixed there).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.env.IME_SRC ?? fileURLToPath(new URL('..', import.meta.url));

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|js|mjs|svelte)$/.test(name) && !/\.test\.|testSetup|testEditor|fakeGitHub|keyMatrix\.harness/.test(name)) yield p;
  }
}

/** the code of a file with strings, comments and (in a .svelte) the markup blanked out, so brackets can be counted */
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

const OPEN = { '(': ')', '[': ']', '{': '}' };
/** where the bracket opened at `at` closes */
function closing(code, at) {
  const stack = [];
  for (let i = at; i < code.length; i++) {
    const c = code[i];
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === ')' || c === ']' || c === '}') { stack.pop(); if (!stack.length) return i; }
  }
  return code.length;
}
/** each `{…}` block: where it opens and closes */
function blocks(code) {
  const open = [], all = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') open.push(i);
    else if (code[i] === '}' && open.length) all.push({ from: open.pop(), to: i });
  }
  return all;
}
/** a block's own level: what is nested inside it blanked */
function ownLevel(code, from, to) {
  let out = '', depth = 0;
  for (let i = from + 1; i < to; i++) {
    const c = code[i];
    if (OPEN[c]) { if (depth === 0) out += c; depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) out += c; continue; }
    out += depth ? ' ' : c;
  }
  return out;
}
const isNodeView = (level) => /(^|[\s,{])(dom|contentDOM)\s*[,:}]|(^|[\s,{])(dom|contentDOM)\s*$/m.test(level) || /\.\.\.[\w$]/.test(level);

/** the body of the function written at `at` (after its name or key): its `{…}`, or the expression an arrow gives */
function bodyAfter(code, at) {
  let i = at;
  while (/\s/.test(code[i])) i++;
  if (code[i] === ':') { i++; while (/\s/.test(code[i])) i++; }
  if (code.startsWith('async', i)) i += 5;
  while (/\s/.test(code[i])) i++;
  if (code.startsWith('function', i)) { i += 8; while (/[\s\w$]/.test(code[i])) i++; }
  if (code[i] === '(') i = closing(code, i) + 1;
  else while (/[\w$]/.test(code[i])) i++;
  while (/\s/.test(code[i])) i++;
  if (code[i] === ':') { while (i < code.length && code[i] !== '{' && !code.startsWith('=>', i)) i++; } // a return type
  if (code.startsWith('=>', i)) { i += 2; while (/\s/.test(code[i])) i++; }
  if (code[i] === '{') return { from: i, to: closing(code, i) };
  let j = i, depth = 0;
  for (; j < code.length; j++) {
    const c = code[j];
    if (OPEN[c]) depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) break;
  }
  return { from: i, to: j };
}

/** what a node view's update may call: whenComposed, and what only reads */
const READS = new Set(['whenComposed', 'some', 'every', 'find', 'findIndex', 'includes', 'eq', 'sameMarkup', 'hasMarkup', 'isInSet', 'startsWith', 'endsWith', 'trim', 'getMeta', 'String', 'Number', 'Boolean']);
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'catch', 'function', 'await', 'void', 'in', 'of', 'new', 'as']);

/** what an update body does besides keeping its record and calling whenComposed */
function writesIn(body) {
  let b = body;
  for (const m of body.matchAll(/\bwhenComposed\s*\(/g)) {
    const open = m.index + m[0].length - 1, close = closing(body, open);
    b = b.slice(0, open + 1) + ' '.repeat(Math.max(0, close - open - 1)) + b.slice(close);
  }
  const out = [];
  for (const m of b.matchAll(/(\.\s*[\w$]+|\])\s*(\+|-|\|\||&&|\?\?)?=(?![=>])/g)) out.push(`sets ${m[1].replace(/\s/g, '')}`);
  for (const m of b.matchAll(/\bdelete\s+[\w$.[\]]+/g)) out.push(m[0]);
  for (const m of b.matchAll(/(?<![\w$])([\w$]+)\s*(?:\?\.\s*)?\(/g)) if (!READS.has(m[1]) && !KEYWORDS.has(m[1])) out.push(`calls ${m[1]}()`);
  return out;
}

const line = (text, at) => text.slice(0, at).split('\n').length;

export function check(rel, text) {
  const code = codeOf(text, rel.endsWith('.svelte'));
  const found = [];
  const at = (i, what) => found.push(`${rel}:${line(text, i)}  ${what}`);

  for (const m of code.matchAll(/(?<![.\w$])decorations\s*([:(])/g)) {
    const after = code.slice(m.index + m[0].length);
    if (m[1] === '(' || !/^\s*(heldWhileComposing|lineAttributes)\s*\(/.test(after)) at(m.index, 'decorations not through heldWhileComposing(…) or lineAttributes(…) (ime.ts): drawn anew under a syllable being put together');
  }
  for (const m of code.matchAll(/\bDecoration\s*\.\s*widget\s*\(/g)) at(m.index, 'Decoration.widget: a node of its own in the text takes the arrow and leaves the input method nowhere to write');
  for (const m of code.matchAll(/\bnew\s+CompositionEvent\s*\(/g)) at(m.index, 'a CompositionEvent made by the app: ProseMirror then draws under a syllable the input method still holds');

  const bs = blocks(code);
  const objectAt = (i) => bs.filter((b) => b.from < i && i < b.to).sort((x, y) => y.from - x.from)[0];
  for (const m of code.matchAll(/(?<![.\w$])update\s*(?=[:(])/g)) {
    const before = code.slice(0, m.index).trimEnd();
    if (code[m.index + m[0].length] === '(' && !/[{,]$/.test(before)) continue; // a call, not a method
    const obj = objectAt(m.index);
    if (!obj || !isNodeView(ownLevel(code, obj.from, obj.to))) continue;
    const body = bodyAfter(code, m.index + m[0].length);
    for (const w of writesIn(code.slice(body.from, body.to + 1))) at(m.index, `a node view's update ${w}: draw through whenComposed(view, draw) (ime.ts)`);
  }
  for (const nv of code.matchAll(/\baddNodeView\s*\(/g)) {
    const body = bodyAfter(code, nv.index + 'addNodeView'.length);
    for (const b of bs.filter((x) => x.from > body.from && x.to < body.to)) {
      const level = ownLevel(code, b.from, b.to);
      if (/\.\.\.[\w$]/.test(level) && /(^|[\s,{])(ignoreMutation|stopEvent|contentDOM|dom)\b/.test(level) && !/(^|[\s,{])update\s*[:(]/.test(level)) {
        at(b.from, "a stock node view spread here keeps its own update, which draws at every key: give it one through whenComposed(view, draw) (ime.ts)");
      }
    }
  }
  return found;
}

// the check itself finds what it is for
const probe = (text) => check('probe.ts', text);
assert.equal(probe('const p = new Plugin({ props: { decorations(state) { return null; } } });').length, 1, 'a decorations method');
assert.equal(probe('const p = new Plugin({ props: { decorations: (s) => KEY.getState(s) } });').length, 1, 'decorations drawn anew');
assert.deepEqual(probe('const p = new Plugin({ props: { decorations: heldWhileComposing((s) => KEY.getState(s)) } });'), []);
assert.equal(probe('Decoration.widget(at, caret)').length, 1, 'a widget');
assert.equal(probe("el.dispatchEvent(new CompositionEvent('compositionend', { data: '' }))").length, 1, 'a composition ended by the app');
const nodeView = (update) => `addNodeView() { return ({ node, editor }) => { const dom = el(); return { dom, contentDOM: code, ${update} }; }; }`;
assert.deepEqual(probe(nodeView('update: (n, d) => { if (n.type !== node.type) return false; shown = d.some((x) => x.spec.editing); drawn = n; whenComposed(editor.view, draw); return true; }')), []);
assert.equal(probe(nodeView('update: (n) => { if (n.type !== node.type) return false; chip.textContent = labelOf(n.attrs.language); return true; }')).length, 2, 'a label written in update');
assert.equal(probe(nodeView('update(n) { show(n.attrs.open); return true; }')).length, 1, 'a helper that draws, called from update');
assert.equal(probe(nodeView('update: (n) => { delete figure.dataset.align; return true; }')).length, 1, 'an attribute taken off in update');
assert.deepEqual(probe(nodeView('update: (n) => { drawn = n; whenComposed(editor.view, () => { chip.textContent = n.attrs.x; }); return true; }')), []);
assert.equal(probe('addNodeView() { return (props) => { const view = stock(props); return { ...view, ignoreMutation: () => true }; }; }').length, 1, 'a stock view spread with its own update');
assert.deepEqual(probe('view: (v) => ({ update: (v, prev) => { soon(); }, destroy: () => frame.cancel() })'), [], "a plugin's view is not a node view");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = [];
  for (const p of files(src)) {
    const rel = relative(src, p).split('\\').join('/');
    found.push(...check(rel, readFileSync(p, 'utf8')));
  }
  assert.deepEqual(found, [], `drawn in the note while a syllable may be half typed:\n  ${found.join('\n  ')}`);
  console.log('ok   what the app draws in the note waits for the syllable being typed (ime.ts)');
}
