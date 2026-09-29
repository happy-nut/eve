import assert from 'node:assert/strict';
import { headingsOf, splitLink, plain, splitAlias } from './markdown.ts';
import { calloutKind } from './calloutKind.ts';

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

// Obsidian's alias: the link opens the title, reads as the alias; in a table the bar is escaped
assert.deepEqual(splitAlias('DB|데이터베이스'), ['DB', '데이터베이스']);
assert.deepEqual(splitAlias('DB#인덱스|인덱스 얘기'), ['DB#인덱스', '인덱스 얘기']);
assert.deepEqual(splitAlias('DB\\|db'), ['DB', 'db']);
assert.deepEqual(splitAlias(' DB '), ['DB', '']);
assert.deepEqual(splitAlias('a|b|c'), ['a', 'b|c']);
assert.equal(plain('- see [[DB|데이터베이스]] and [[Plan]]'), 'see 데이터베이스 and Plan');
assert.equal(plain('| [[DB\\|db]] |'), '| db |');
// ==highlight== reads as its text; a lone == stays
assert.equal(plain('# ==Important== plan'), 'Important plan');
assert.equal(plain('a == b'), 'a == b');

// callout types: the word picks icon and colour, any case; an emoji is its own
assert.deepEqual(calloutKind('warning'), { icon: '⚠️', color: 'orange' });
assert.deepEqual(calloutKind('TIP'), { icon: '🔥', color: 'cyan' });
assert.equal(calloutKind('faq')?.color, 'orange');
assert.equal(calloutKind('💡'), null);
assert.equal(calloutKind('nonsense'), null);

console.log('MARKDOWN_OK');
