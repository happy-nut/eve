import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { isoDay, dayFrom, daysFrom, dateLabel, typedDay, dayChoices, dateMarkdown } from './date.ts';

// a fixed "now", late enough in the day that a UTC-based answer would land on the next date
const now = new Date(2026, 8, 24, 23, 30); // 2026-09-24, local

assert.equal(isoDay(now), '2026-09-24', 'the local day, not the UTC one');
assert.equal(dayFrom(0, now), '2026-09-24');
assert.equal(dayFrom(-1, now), '2026-09-23');
assert.equal(dayFrom(1, now), '2026-09-25');
assert.equal(dayFrom(-24, now), '2026-08-31', 'stepping back over a month boundary');

assert.equal(daysFrom('2026-09-24', now), 0);
assert.equal(daysFrom('2026-09-23', now), -1);
assert.equal(daysFrom('2026-09-25', now), 1);
assert.equal(daysFrom('2026-10-01', now), 7);
assert.equal(daysFrom('not a date', now), null);
assert.equal(daysFrom('2026-02-31', now), null, 'a day that does not exist is not a day');

// the same stored day reads differently as the days pass — the whole point of storing the day
const written = '2026-09-24';
assert.equal(dateLabel(written, now, 'en'), 'today');
assert.equal(dateLabel(written, new Date(2026, 8, 25, 9, 0), 'en'), 'yesterday');
assert.equal(dateLabel(written, new Date(2026, 8, 23, 9, 0), 'en'), 'tomorrow');
assert.equal(dateLabel(written, new Date(2026, 8, 26, 9, 0), 'en'), '2026.09.24', 'further out: the date');

assert.equal(dateLabel(written, now, 'ko'), '오늘');
assert.equal(dateLabel(written, new Date(2026, 8, 25, 9, 0), 'ko'), '어제');
assert.equal(dateLabel(written, new Date(2026, 8, 23, 9, 0), 'ko'), '내일');

assert.equal(typedDay('2026-09-24'), '2026-09-24');
assert.equal(typedDay('2026.9.4'), '2026-09-04', 'dots and single digits');
assert.equal(typedDay('2026/09/24'), '2026-09-24');
assert.equal(typedDay('2026-13-01'), null);
assert.equal(typedDay('hello'), null);

const isos = (q, at = now, loc = 'en') => dayChoices(q, at, loc).map((d) => d.iso);
assert.deepEqual(isos(''), ['2026-09-24', '2026-09-23', '2026-09-25'], 'today first');
assert.deepEqual(isos('yes'), ['2026-09-23'], 'the English name');
assert.deepEqual(isos('어제', now, 'ko'), ['2026-09-23'], "the reader's own language");
assert.deepEqual(isos('yes', now, 'ko'), ['2026-09-23'], 'the English name works in any language');
assert.deepEqual(isos('2026-09-25'), ['2026-09-25'], 'a day typed out that is also on the list, once');
assert.deepEqual(isos('2001-01-01'), ['2001-01-01'], 'a day typed out that is not');
assert.deepEqual(isos('zzz'), [], 'nothing matches, so the popup does not open');

assert.equal(dayChoices('', now, 'ko')[0].label, '오늘');

// the markdown rule, against a real markdown-it: what becomes a chip on the way back in
const md = new MarkdownIt();
dateMarkdown(md);
const html = (src) => md.render(src);

assert.match(html('마감 @2026-09-24 입니다'), /<span data-date="2026-09-24">/, 'a date mid-sentence');
assert.match(html('@2026-09-24'), /<span data-date="2026-09-24">/, 'a date on its own');
assert.match(html('(@2026-09-24)'), /<span data-date="2026-09-24">/, 'a date in brackets');

assert.doesNotMatch(html('write to compensation@toss.im'), /data-date/, 'an address is not a date');
assert.doesNotMatch(html('2026@2026-09-24'), /data-date/, 'an @ inside a word is not a date');
assert.doesNotMatch(html('@2026-13-01'), /data-date/, 'a month that does not exist');
assert.doesNotMatch(html('@2026-09-240'), /data-date/, 'a longer run of digits is not a date');
assert.doesNotMatch(html('@today'), /data-date/, 'only the stored form is a date; the word is not');

console.log('DATE_OK');
