import assert from 'node:assert/strict';
import { parseEveLink } from './evelink.ts';

// what mcp.rs's link_to writes (its test: the same strings)
assert.deepEqual(parseEveLink('eve://open?id=p1'), { id: 'p1', section: '' });
assert.deepEqual(parseEveLink('eve://open?id=p1&section=Goals%20%26%20map'), { id: 'p1', section: 'Goals & map' });
assert.deepEqual(parseEveLink('eve://open?id=a%20b%2F%ED%9A%8C&section=x%3Fy%3Dz%23w'), { id: 'a b/회', section: 'x?y=z#w' });
assert.deepEqual(parseEveLink('eve://open?id=daily-2026-09-05'), { id: 'daily-2026-09-05', section: '' });
// only "open", only eve:, only with an id
assert.equal(parseEveLink('eve://delete?id=p1'), null);
assert.equal(parseEveLink('eve://open'), null);
assert.equal(parseEveLink('eve://open?id=%20'), null);
assert.equal(parseEveLink('https://open?id=p1'), null);
assert.equal(parseEveLink('not a url'), null);
console.log('EVELINK_OK');
