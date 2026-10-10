import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchEmoji } from './emoji.ts';

const data = JSON.parse(readFileSync(new URL('../../node_modules/emoji-picker-element-data/en/emojibase/data.json', import.meta.url)));
// compared without U+FE0F, the invisible "draw as emoji" mark some of them carry
const top = (q, n = 5) => searchEmoji(data, q, n).map((e) => e.emoji.replace(/\uFE0F/g, ''));

// the word itself first: a shortcode that is the word, Slack's :smile:, :heart:, :+1:
assert.equal(top('smile')[0], '😄');
assert.equal(top('heart')[0], '❤');
assert.equal(top('+1')[0], '👍');
assert.equal(top('tada')[0], '🎉');
// a name or a tag that is the word comes before a longer shortcode that merely starts with it
assert.equal(top('cat')[0], '🐈');
assert.ok(top('cat').includes('🐱'));
// at most five, none for a word that is nowhere, none for what is not a shortcode's letters
assert.equal(top('he').length, 5);
// one letter is not a search: ":D", ":P", ":O" are faces typed as text, and Enter after them is a new line
assert.deepEqual(top('h'), []);
assert.deepEqual(top('D'), []);
assert.deepEqual(top('p'), []);
assert.deepEqual(top('zzzzqq'), []);
assert.deepEqual(top('30'), []);
assert.deepEqual(top(''), []);
assert.deepEqual(top('a b'), []);
// a prefix finds the obvious one before the rest
assert.equal(top('thu')[0], '👍'); // thumbsup
assert.equal(top('fir')[0], '🔥'); // fire
// under the row, the shortcode the search hit, not the emoji's first one
assert.equal(searchEmoji(data, 'smi')[0].code, 'smile');
// nothing is left out unless the system says it cannot draw it: Emoji 15's shaking face is there by default,
// and gone only below the version it came with
assert.ok(top('shaking').includes('🫨'));
assert.ok(!searchEmoji(data, 'shaking', 5, 14).some((e) => e.emoji === '🫨'));
// case does not matter
assert.deepEqual(top('SMILE'), top('smile'));

console.log('EMOJI_OK');
