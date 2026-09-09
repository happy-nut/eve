// Kanban board file form <-> data self-check: node --experimental-strip-types src/lib/board.test.mjs
import assert from 'node:assert/strict';
import { parseBoard, serializeBoard, moveCard, moveColumn, patchCard } from './board.ts';
import { cardDoc, splitCard, plain } from './markdown.ts';

const strip = (cols) => cols.map((c) => ({ title: c.title, cards: c.cards.map((k) => ({ title: k.title, body: k.body })) }));
const src = { columns: [
  { title: 'To do', cards: [{ title: 'Write spec', body: 'Details, **bold**.\n\n- a list\n## not a column\n```\ncode\n```' }, { title: '', body: '' }] },
  { title: 'Doing', cards: [] },
  { title: 'Done', cards: [{ title: 'Ship', body: '' }] },
] };
const cols = parseBoard(JSON.stringify(src));
assert.deepEqual(strip(cols), src.columns);
assert.equal(serializeBoard(cols), JSON.stringify(src, null, 2));
assert.deepEqual(strip(parseBoard(serializeBoard(cols))), src.columns);
assert.ok(!serializeBoard(cols).split('\n').some((l) => /^\s{0,3}`/.test(l)), 'no line can close the fence');
// ids are fresh per parse and unique
const ids = cols.flatMap((c) => [c.id, ...c.cards.map((k) => k.id)]);
assert.equal(new Set(ids).size, ids.length);
// broken or foreign input is refused, sloppy shapes are tolerated
assert.equal(parseBoard('{"columns": [}'), null);
assert.equal(parseBoard('## To do\n- old line format'), null);
assert.equal(parseBoard('[]'), null);
assert.deepEqual(strip(parseBoard('{"columns":[{"cards":[{"title":5}]},{"title":"x"}]}')), [{ title: '', cards: [{ title: '', body: '' }] }, { title: 'x', cards: [] }]);

// moves
const [a, b, c] = cols;
const ship = c.cards[0], spec = a.cards[0];
let m = moveCard(cols, ship.id, a.id, 1);
assert.deepEqual(m[0].cards.map((k) => k.id), [spec.id, ship.id, a.cards[1].id]);
assert.equal(m[2].cards.length, 0);
m = moveCard(m, ship.id, a.id, 0); // reorder within the column
assert.deepEqual(m[0].cards.map((k) => k.id), [ship.id, spec.id, a.cards[1].id]);
m = moveCard(m, ship.id, b.id, 99); // clamps
assert.deepEqual(m[1].cards.map((k) => k.id), [ship.id]);
assert.equal(moveCard(cols, 'nope', a.id, 0), cols);
assert.deepEqual(moveColumn(cols, c.id, 0).map((x) => x.id), [c.id, a.id, b.id]);
assert.deepEqual(moveColumn(cols, a.id, 5).map((x) => x.id), [b.id, c.id, a.id]);
assert.equal(patchCard(cols, ship.id, { title: 'Shipped' })[2].cards[0].title, 'Shipped');
assert.equal(cols[2].cards[0].title, 'Ship'); // inputs untouched

// card <-> document: the card page edits one document whose first line is the title
assert.deepEqual(splitCard(cardDoc('Ship it', 'Body **bold**\n\n- a')), { title: 'Ship it', body: 'Body **bold**\n\n- a' });
assert.deepEqual(splitCard('# Only a title'), { title: 'Only a title', body: '' }); // no body: not the title again
assert.deepEqual(splitCard('# **1517** \\#1 이슈'), { title: '1517 #1 이슈', body: '' }); // marks and escapes stripped
assert.deepEqual(splitCard(cardDoc('', '')), { title: '', body: '' });
assert.deepEqual(splitCard('plain line\n\nmore'), { title: '', body: 'plain line\n\nmore' }); // heading deleted
assert.deepEqual(splitCard('## Not the title\n\nx'), { title: '', body: '## Not the title\n\nx' });
assert.equal(plain('# **done** [[note]]'), 'done note');

console.log('BOARD_OK');
