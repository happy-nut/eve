import assert from 'node:assert/strict';
import { attachmentCandidates, isKeepNote, keepOrder, keepToNote } from './keep.ts';

const usec = (iso) => Date.parse(iso) * 1000;
const NB = ' ';

// what a Keep note looks like, and what only looks like one
assert.ok(isKeepNote({ title: '', textContent: 'hi', isTrashed: false, userEditedTimestampUsec: 1 }));
assert.ok(isKeepNote({ listContent: [], isTrashed: false }));
assert.ok(!isKeepNote({ title: 'x' }));
assert.ok(!isKeepNote([]));
assert.ok(!isKeepNote(null));

// a text note: its lines stay lines, a blank line stays a blank line, the edit time is kept
let n = keepToNote({ title: 'Groceries', textContent: 'milk\neggs\n\nbread', userEditedTimestampUsec: usec('2024-03-01T10:00:00Z'), isTrashed: false });
assert.equal(n.body, `# Groceries\n\nmilk\n\neggs\n\n${NB}\n\nbread\n`);
assert.equal(n.updatedAt, Date.parse('2024-03-01T10:00:00Z'));
assert.equal(n.sub, '');

// no title: a short first line becomes it; a long one is cut for the title and kept whole in the note
n = keepToNote({ title: '', textContent: 'Call mom\n\nabout Sunday', isTrashed: false });
assert.equal(n.body, '# Call mom\n\nabout Sunday\n');
const long = 'This is a very long first line of a note that goes on and on past sixty characters';
n = keepToNote({ title: '', textContent: long, isTrashed: false });
assert.ok(n.body.startsWith('# This is a very long first line of a note…\n\n' + long));

// a checklist: Eve's to-dos, ticked as they were; untitled, it is named by its day
n = keepToNote({ title: '', listContent: [{ text: 'a', isChecked: false }, { text: 'b', isChecked: true }], createdTimestampUsec: usec('2023-12-24T09:00:00Z'), isTrashed: false });
assert.equal(n.body, '# 2023-12-24\n\n- [ ] a\n- [x] b\n');

// …the day it was written where the user is, not in UTC: 08:30 in Seoul on 5 March is still 4 March in UTC
{
  const tz = process.env.TZ;
  process.env.TZ = 'Asia/Seoul';
  n = keepToNote({ title: '', textContent: '', createdTimestampUsec: usec('2026-03-04T23:30:00Z'), isTrashed: false });
  assert.equal(n.body.split('\n')[0], '# 2026-03-05');
  if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
}

// Keep is plain text: a "#", a ">" or a tag stays as typed
n = keepToNote({ title: 't', textContent: '# not a heading\n> not a quote\na <b> tag', isTrashed: false });
assert.equal(n.body, '# t\n\n\\# not a heading\n\n\\> not a quote\n\na \\<b\\> tag\n');

// labels: the first is the group, the rest stay as tags; archived goes to Archive, every label a tag
n = keepToNote({ title: 't', textContent: 'x', labels: [{ name: 'Work' }, { name: 'Big ideas' }], isTrashed: false });
assert.equal(n.sub, 'Work');
assert.ok(n.body.endsWith('\n\n\\#Big\\_ideas\n'));
n = keepToNote({ title: 't', textContent: 'x', labels: [{ name: 'a/b' }], isArchived: true, isTrashed: false });
assert.equal(n.sub, 'Archive');
assert.ok(n.body.endsWith('\n\n\\#a-b\n'));

// pictures as copied; one that could not be says so; links at the end
n = keepToNote({
  title: 't', textContent: 'x', isTrashed: false,
  attachments: [{ filePath: 'p.jpeg', mimetype: 'image/jpeg' }, { filePath: 'memo.3gp', mimetype: 'audio/3gpp' }],
  annotations: [{ url: 'https://example.com', title: 'Example [site]' }],
}, { 'p.jpeg': 'assets/1.jpg' });
assert.equal(n.body, '# t\n\nx\n\n![](assets/1.jpg)\n\n*(not brought over from Keep: memo.3gp)*\n\n- [Example \\[site\\]](https://example.com)\n');

// trashed: left behind
assert.equal(keepToNote({ title: 't', textContent: 'x', isTrashed: true }), null);

// Takeout's jpg/jpeg mix-up
assert.deepEqual(attachmentCandidates('a.jpeg'), ['a.jpeg', 'a.jpg']);
assert.deepEqual(attachmentCandidates('a.JPG'), ['a.JPG', 'a.jpeg']);
assert.deepEqual(attachmentCandidates('a.png'), ['a.png']);

// Keep's order: pinned first, then newest
const o = [{ pinned: false, updatedAt: 3 }, { pinned: true, updatedAt: 1 }, { pinned: false, updatedAt: 5 }].sort(keepOrder);
assert.deepEqual(o.map((x) => x.updatedAt), [1, 5, 3]);

console.log('KEEP_OK');
