import assert from 'node:assert/strict';
import { tidyTex, SHELVES } from './mathParts.ts';

// MathLive's shortened fractions get their braces back; its empty slots are left out
assert.equal(tidyTex('\\frac12+\\pi'), '\\frac{1}{2}+\\pi');
assert.equal(tidyTex('\\frac1{x+1}'), '\\frac{1}{x+1}');
assert.equal(tidyTex('\\frac{x+1}2'), '\\frac{x+1}{2}');
assert.equal(tidyTex('\\dfrac\\alpha\\beta'), '\\dfrac{\\alpha}{\\beta}');
assert.equal(tidyTex('\\frac{\\frac12}{3}'), '\\frac{\\frac{1}{2}}{3}');
assert.equal(tidyTex('\\sqrt{\\placeholder{}}+\\frac{\\placeholder{}}{2}'), '\\sqrt{}+\\frac{}{2}');
assert.equal(tidyTex('\\binom n k'), '\\binom{n}{k}');
// written as it was otherwise
for (const t of ['x^2+y_i', '\\fraction', '\\frac{a}{b}', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\text{a {b} c}']) assert.equal(tidyTex(t), t);
// every part has a name (its button's label) and is a template MathLive reads
for (const s of SHELVES) for (const p of s.parts) { assert.ok(p.name); assert.ok(p.tex); }
console.log('math parts ok');
