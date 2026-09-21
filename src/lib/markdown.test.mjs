import assert from 'node:assert/strict';
import { headingsOf, splitLink, plain } from './markdown.ts';

// the first line is the note's title, not one of its sections
assert.deepEqual(headingsOf('# DB\n\n## 인덱스\n본문\n### 지역성\n'), ['인덱스', '지역성']);
// a `#` inside a code fence is a comment
assert.deepEqual(headingsOf('# N\n\n```bash\n# not a heading\n```\n## real\n'), ['real']);
// `#hashtag` and `#` with nothing after it are not headings; marks come off the text
assert.deepEqual(headingsOf('# N\n\n#tag\n#\n## **Bold** bit\n'), ['Bold bit']);
assert.deepEqual(headingsOf('# N\n\nno headings at all\n'), []);

assert.deepEqual(splitLink('DB'), ['DB', '']);
assert.deepEqual(splitLink('DB#인덱스'), ['DB', '인덱스']);
assert.deepEqual(splitLink(' DB # 인덱스 '), ['DB', '인덱스']);
// a section with a `#` of its own: only the first one splits
assert.deepEqual(splitLink('DB#C# 이야기'), ['DB', 'C# 이야기']);

// the section text matches what a heading reads as on screen
assert.equal(plain('## 1. 송금 시스템 설계'), '1. 송금 시스템 설계');

console.log('MARKDOWN_OK');
