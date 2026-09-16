import assert from 'node:assert/strict';
import { commonDir, groupFor, stem, nameOf } from './paths.ts';

// one file: no structure to keep
assert.equal(commonDir(['/a/b/note.md']), '/a/b');
assert.equal(commonDir([]), '');
// several: the deepest shared folder, and never half a folder name
assert.equal(commonDir(['/a/b/x.md', '/a/b/c/y.md']), '/a/b');
assert.equal(commonDir(['/a/bee/x.md', '/a/bells/y.md']), '/a');
assert.equal(commonDir(['/a/x.md', '/b/y.md']), '');

// the folders under the common root become the group path
assert.equal(groupFor('/a/b/x.md', '/a/b', 3), '');
assert.equal(groupFor('/a/b/c/x.md', '/a/b', 3), 'c');
assert.equal(groupFor('/a/b/c/d/x.md', '/a/b', 3), 'c/d');
// deeper than groups go: the top of the tree is what survives
assert.equal(groupFor('/a/b/c/d/e/f/x.md', '/a/b', 3), 'c/d/e');

assert.equal(nameOf('/a/b/Report v2.final.pdf'), 'Report v2.final.pdf');
assert.equal(stem('Report v2.final.pdf'), 'Report v2.final');
assert.equal(stem('Makefile'), 'Makefile');

console.log('PATHS_OK');
