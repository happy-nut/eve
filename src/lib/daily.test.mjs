import assert from 'node:assert/strict';
import { dayKey, dailyId, isDailyId, keyOfDaily, fillTemplate, dailyBody, isWritten, monthGrid, DEFAULT_TEMPLATE } from './daily.ts';

assert.equal(dayKey(new Date(2026, 8, 7)), '2026-09-07');
assert.equal(dailyId('2026-09-27'), 'daily-2026-09-27');
assert.equal(isDailyId('daily-2026-09-27'), true);
assert.equal(isDailyId('daily-notes'), false); // an ordinary note that happens to start that way
assert.equal(isDailyId('mfx0a1b2c3'), false);
assert.equal(keyOfDaily('daily-2026-09-27'), '2026-09-27');

assert.equal(fillTemplate(DEFAULT_TEMPLATE, '2026-09-27', 'en-US'), '# 2026-09-27 Sunday\n\n');
assert.equal(fillTemplate('{{date}} / {{date}}', '2026-01-02', 'en-US'), '2026-01-02 / 2026-01-02');
assert.equal(fillTemplate('{{weekday}}', '2026-09-28', 'ko-KR'), '월요일');

// a template ending on its title gets a line to write on; one ending in text is left as it is
assert.equal(dailyBody(DEFAULT_TEMPLATE, '2026-09-27', 'en-US'), '# 2026-09-27 Sunday\n\n\u00a0');
assert.equal(dailyBody('## Plan\n- [ ] ', '2026-09-27'), '## Plan\n- [ ]\n');

// written = a line the template did not put there
const fresh = dailyBody(DEFAULT_TEMPLATE, '2026-09-27', 'en-US');
assert.equal(isWritten(fresh, DEFAULT_TEMPLATE, '2026-09-27', 'en-US'), false);
assert.equal(isWritten(fresh + '\nbought milk', DEFAULT_TEMPLATE, '2026-09-27', 'en-US'), true);
const tpl = '# {{date}}\n\n## Plan\n- [ ] \n\n## Notes\n';
assert.equal(isWritten(dailyBody(tpl, '2026-09-27'), tpl, '2026-09-27'), false);
assert.equal(isWritten('# 2026-09-27\n\n## Plan\n- [ ] call mom\n', tpl, '2026-09-27'), true);

// September 2026 starts on a Tuesday: two August days lead, 42 cells, the 30th is in the month
const g = monthGrid(2026, 8);
assert.equal(g.length, 42);
assert.deepEqual(g.slice(0, 3).map((c) => [c.key, c.inMonth]), [['2026-08-30', false], ['2026-08-31', false], ['2026-09-01', true]]);
assert.equal(g.find((c) => c.key === '2026-09-30')?.inMonth, true);
assert.equal(g.filter((c) => c.inMonth).length, 30);
// across a year's end
assert.equal(monthGrid(2026, 11).find((c) => !c.inMonth && c.key.startsWith('2027'))?.key, '2027-01-01');

console.log('DAILY_OK');
