import assert from 'node:assert/strict';
import { rows, expand, collapse } from './suggest.ts';

const page = (label, ...sections) => ({ label, sections: sections.map((s) => ({ label: s })) });
const items = [page('OLAP', '스타 스키마', '큐브'), page('Lock'), page('DB', '인덱스')];
const labels = (open) => rows(items, open).map((r) => (r.child ? `  ${r.item.label}` : r.item.label));

// closed: one row per page, sections included or not
assert.deepEqual(labels(new Set()), ['OLAP', 'Lock', 'DB']);

// → on the first page drops its sections under it, and the cursor stays on the page
const a = expand(items, new Set(), 0);
assert.deepEqual(a, { open: new Set([0]), sel: 0 });
assert.deepEqual(labels(a.open), ['OLAP', '  스타 스키마', '  큐브', 'Lock', 'DB']);

// a page with no sections has nothing to open, and neither has a section itself
assert.equal(expand(items, new Set(), 1), null);
assert.equal(expand(items, a.open, 2), null, 'a section row cannot be opened');
assert.equal(expand(items, a.open, 0), null, 'an open page does not open twice');

// a second page opens without disturbing the first, and rows stay in page order
const b = expand(items, a.open, 4); // 'DB' has moved down to 4
assert.deepEqual(labels(b.open), ['OLAP', '  스타 스키마', '  큐브', 'Lock', 'DB', '  인덱스']);

// ← from a section closes the page it belongs to and lands the cursor on that page
const c = collapse(items, b.open, 2); // on '큐브'
assert.deepEqual(c.sel, 0);
assert.deepEqual(labels(c.open), ['OLAP', 'Lock', 'DB', '  인덱스']);

// ← from a page further down still lands on that page after the rows above it shrink
const d = collapse(items, b.open, 5); // on '인덱스', below two open sections
assert.deepEqual(rows(items, d.open)[d.sel].item.label, 'DB');
assert.deepEqual(labels(d.open), ['OLAP', '  스타 스키마', '  큐브', 'Lock', 'DB']);

// ← with nothing open is not ours: the key goes back to the editor
assert.equal(collapse(items, new Set(), 1), null);

// an empty list answers neither key rather than throwing
assert.equal(expand([], new Set(), 0), null);
assert.equal(collapse([], new Set(), 0), null);

console.log('SUGGEST_OK');
