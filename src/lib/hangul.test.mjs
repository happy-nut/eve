// What a Korean keyboard puts in a field on its way to a word still finds the word: typing 회의 shows ㅎ, 호, 회, 횡,
// 회으 before 회의, and the list emptied at each of them.
import assert from 'node:assert/strict';
import { typedIn } from './hangul.ts';

// every step of typing 회의록 finds it
for (const q of ['ㅎ', '호', '회', '횡', '회ㅇ', '회으', '회의', '회읠', '회의ㄹ', '회의로', '회의록']) assert.ok(typedIn('회의록', q), `"${q}" finds 회의록`);
// …and of typing 안건 (a final consonant that moves on to the next syllable)
for (const q of ['아', '안', '안ㄱ', '안거', '안건']) assert.ok(typedIn('주간 안건 정리', q), `"${q}" finds 안건`);
// in the middle of a title too, after other words
assert.ok(typedIn('2주차 회의록', '회으'));
// a compound vowel or final half typed
assert.ok(typedIn('과제', '고'), 'ㅘ starts with ㅗ');
assert.ok(typedIn('값', '갑'), 'ㅄ starts with ㅂ');
// what does not lead to the word does not find it
for (const q of ['회외', '회의록x', '해', 'ㄴ', '회의롟']) assert.equal(typedIn('회의록', q), false, `"${q}" does not find 회의록`);
// the syllables before the one being typed must be there as they are
assert.equal(typedIn('호의', '회ㅇ'), false);
// anything else: as plain text
assert.ok(typedIn('meeting notes', 'notes'));
assert.equal(typedIn('meeting notes', 'notez'), false);
assert.ok(typedIn('anything', ''));
console.log('ok   hangul: half-typed syllables find their word');
