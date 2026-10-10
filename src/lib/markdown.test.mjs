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
// a title holding "#" is a title, whole, when a note has it; its own sections still split off after it
{
  const titles = new Set(['c# notes', 'issue #12', 'db']);
  const is = (t) => titles.has(t.toLowerCase());
  assert.deepEqual(splitLink('C# notes', is), ['C# notes', '']);
  assert.deepEqual(splitLink('C# notes#Setup', is), ['C# notes', 'Setup']);
  assert.deepEqual(splitLink('Issue #12', is), ['Issue #12', '']);
  assert.deepEqual(splitLink('DB#인덱스', is), ['DB', '인덱스']);
  assert.deepEqual(splitLink('Nowhere#x', is), ['Nowhere', 'x']); // no such note: split as written
}
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
// a link reads as its words (so [[Meeting with Bob]] finds the page titled with one), a picture as its alt text
assert.equal(plain('# Meeting with [Bob](https://bob.example.com/profile)'), 'Meeting with Bob');
assert.equal(plain('[**Docs**](https://x.dev/a_b_c "the docs") page'), 'Docs page');
assert.equal(plain('[](https://x.dev)'), 'https://x.dev'); // a link with no words reads as where it goes
assert.equal(plain('![](https://example.com/photo.png)'), ''); // nothing to read: the note is "Untitled"
assert.equal(plain('![Trip to Jeju](trip.png) notes'), 'Trip to Jeju notes');
assert.equal(plain('\\[not](a link)'), '[not](a link)');
// marks come off, but an escaped character or a "_" inside a word is text
assert.equal(plain('call my_func_name and my\\_var \\*now\\*'), 'call my_func_name and my_var *now*');
assert.equal(plain('__bold__ _it_ ~~gone~~ `code`'), 'bold it gone code');
// a formula reads as what is written in it; an escaped dollar is a dollar
assert.equal(plain('# Energy $E=mc^2$'), 'Energy E=mc^2');
assert.equal(plain('$x$ and $$y + 1$$'), 'x and y + 1');
assert.equal(plain('costs \\$5 or \\$10'), 'costs $5 or $10');

// callout types: the word picks icon and colour, any case; an emoji is its own
assert.deepEqual(calloutKind('warning'), { icon: '⚠️', color: 'orange' });
assert.deepEqual(calloutKind('TIP'), { icon: '🔥', color: 'cyan' });
assert.equal(calloutKind('faq')?.color, 'orange');
assert.equal(calloutKind('💡'), null);
assert.equal(calloutKind('nonsense'), null);

console.log('MARKDOWN_OK');

// a phone's list: what a note says under its title, in one line
{
  const { previewOf } = await import('./markdown.ts');
  assert.equal(previewOf('# Plan\n\nFirst **thing**\n\n- [ ] second\n'), 'First thing second');
  assert.equal(previewOf('<div align="center">\n\n# Title\n\nbody\n'), 'body', 'HTML before the title is no title');
  assert.equal(previewOf('# T\n\n```kanban\n{"columns":[]}\n```\nafter\n'), 'after', 'code and boards are passed over');
  assert.equal(previewOf('# T\n\n````\n```\nx\n````\nafter\n'), 'after', 'a longer fence is closed only by one as long');
  assert.equal(previewOf('# T\n\n![](assets/a.png)\n[site](https://x.y) and ---\n\n---\n'), 'site and ---');
  assert.equal(previewOf('# T\n\n| a | b |\n|---|:-:|\n| 1 | 2 |\n'), 'a b 1 2');
  assert.equal(previewOf('# T\n'), '');
  assert.equal(previewOf('# T\n\n' + 'word '.repeat(60), 20), 'word word word word…');
}

// a search reads what shows, and code as written, and a link's address too
{
  const { searchText, rawQuery } = await import('./markdown.ts');
  const t = searchText('# T\n\nthe **main office** tomorrow\n\n```c\nList<String> names;\n```\n\nuse `Vec<u8>` and [docs](https://example.com/guide)\n').toLowerCase();
  for (const q of ['main office tomorrow', 'list<string>', 'vec<u8>', 'example.com', 'docs']) assert.ok(t.includes(q), q);
  assert.ok(!t.includes('**'), 'no markdown marks');
  assert.ok(!t.includes('#'), 'no heading marks');
  assert.ok(rawQuery('a*b') && rawQuery('~/projects') && !rawQuery('hello world') && !rawQuery('#'));
}

// a [[link]] written before titles read links, formulas and "_" as on screen still finds its page by the old title
{
  const { legacyPlain, plain } = await import('./markdown.ts');
  assert.equal(legacyPlain('# my_func'), 'myfunc');
  assert.equal(plain('# my_func'), 'my_func');
  assert.equal(legacyPlain('# Energy $E=mc^2$'), 'Energy $E=mc^2$');
  assert.equal(legacyPlain('# ![logo](a.png) Home'), '![logo](a.png) Home');
}
