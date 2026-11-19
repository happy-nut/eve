const hour = 3600_000;
export const notes = {
  a: '# Plan\n\nFirst line.\n',
  b: `---\nid: b\nupdated: ${Date.now() - hour}\ndeleted: false\norder: 1\nparent: a\n---\n# Groceries\n\nmilk\n`,
  c: '# Reading list\n\nA book.\n',
  d: `---\nid: d\nupdated: ${Date.now()}\ndeleted: false\norder: 3\nicon: 🌱\n---\n# Garden\n\nSeeds.\n`,
};

const list = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')]
  .map((r) => getComputedStyle(r.closest('li')).getPropertyValue('--d').trim() + '|' + r.textContent.replace(/\s+/g, ' ').trim()));
const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);
const listIs = (t, want) => async () => same(await list(t), want);
const focusedRow = (t) => t.page.evaluate(() => document.activeElement?.closest('[data-row]')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
const inNote = (t) => t.page.evaluate(() => !!document.activeElement?.closest('.tiptap'));

export default async (t) => {
  await t.ok('sidebar-drag-reorder', listIs(t, ['0|Plan', '1|Groceries', '0|Reading list', '0|🌱 Garden']), 'the list starts Plan, Groceries under Plan, Reading list, Garden');
  await t.page.dragAndDrop('aside [data-note="c"]', 'aside [data-note="a"]', { targetPosition: { x: 40, y: 3 } });
  await t.ok('sidebar-drag-reorder', listIs(t, ['0|Reading list', '0|Plan', '1|Groceries', '0|🌱 Garden']), 'Reading list dragged onto the top half of Plan lands just before it, at the top level');
  await t.shot('drag-reorder', 'aside');

  await t.page.dragAndDrop('aside [data-note="d"]', 'aside [data-note="a"]', { targetPosition: { x: 40, y: 25 } });
  await t.ok('sidebar-drag-nest', listIs(t, ['0|Reading list', '0|Plan', '1|🌱 Garden', '1|Groceries']), 'Garden dragged onto the bottom half of Plan becomes its first sub-page');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('sidebar-drag-nest', async () => same(await list(t), ['0|Reading list', '0|Plan', '1|🌱 Garden', '1|Groceries'])
    && /\nparent: a\n/.test(await t.page.evaluate(() => localStorage.getItem('eve.notes.d'))), 'after a reload Garden is still under Plan and saved with parent: a');
  await t.shot('drag-nest-kept', 'aside');

  await t.click('aside [data-note="c"] .ico-slot');
  await t.page.waitForSelector('[aria-label="Choose an icon"] emoji-picker button.emoji');
  // the grid is drawn once the picker's emoji data is read; its favourites row before it (a slower CI clicked then)
  await t.page.waitForFunction(() => { const tab = document.querySelector('emoji-picker')?.shadowRoot?.querySelector('.tabpanel'); return !!tab && !tab.classList.contains('gone') && !!tab.querySelector('button.emoji'); });
  await t.ok('sidebar-icon', () => t.page.locator('[aria-label="Choose an icon"]').isVisible(), 'a click on the row icon opens the Choose an icon picker');
  const emoji = '😀';
  await t.click(`emoji-picker .tabpanel [id="emo-${emoji}"]`);
  await t.ok('sidebar-icon', async () => (await list(t))[0] === `0|${emoji} Reading list`, `the picked emoji (${emoji}) shows before Reading list on its row`);
  await t.click('aside [data-note="c"]');
  await t.ok('sidebar-icon', () => t.page.evaluate((e) => [...document.querySelectorAll('.page-head *')].some((el) => el.children.length === 0 && el.textContent.trim() === e && el.getBoundingClientRect().height >= 40), emoji),
    'the same emoji shows big on the open page head');
  await t.shot('icon-set');

  await t.click('aside [data-note="a"]');
  await t.click('.tiptap');
  await t.page.keyboard.down('Meta');
  await t.ok('sidebar-jump', () => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].map((r) => r.querySelector('.num')?.textContent ?? '-').join('') === '1234'),
    'holding the command key shows 1 to 4 on the rows in list order, sub-pages included');
  await t.shot('cmd-held', 'aside');
  await t.page.keyboard.press('Digit3');
  await t.page.keyboard.up('Meta');
  await t.ok('sidebar-jump', () => t.page.evaluate(() => document.querySelector('aside [data-note="d"]').classList.contains('active')
    && !!document.activeElement?.closest('.tiptap') && document.querySelector('.tiptap h1')?.textContent === 'Garden'),
    'command 3 opens the third row, Garden, with the caret in it');
  await t.shot('cmd-3');

  await t.key(`${t.mod}+Backslash`);
  await t.ok('sidebar-keys', async () => (await focusedRow(t)) === '🌱 Garden', 'command backslash puts the keyboard on the open note row');
  await t.key('ArrowDown');
  await t.ok('sidebar-keys', async () => (await focusedRow(t)) === 'Groceries', 'arrow down walks to Groceries');
  await t.key('Alt+ArrowDown');
  await t.ok('sidebar-keys', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|🌱 Garden', '0|Groceries']), 'option down on the last sub-page moves Groceries out after Plan');
  await t.key('Alt+ArrowRight');
  await t.ok('sidebar-keys', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|🌱 Garden', '2|Groceries']), 'option right nests Groceries under the row above, Garden');
  await t.key('Alt+ArrowLeft');
  await t.ok('sidebar-keys', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|🌱 Garden', '1|Groceries']), 'option left moves Groceries out of Garden, back under Plan');
  await t.key('Alt+ArrowUp');
  await t.ok('sidebar-keys', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|🌱 Garden', '2|Groceries']), 'option up moves Groceries one slot up, into the open page above, Garden');
  await t.key('Alt+ArrowUp');
  await t.ok('sidebar-keys', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|Groceries', '1|🌱 Garden']), 'option up again moves Groceries one more slot, above Garden');
  await t.shot('keys-moved', 'aside');
  await t.key('ArrowUp');
  await t.key('ArrowLeft');
  await t.ok('sidebar-keys', async () => same(await list(t), [`0|${emoji} Reading list`, '0|Plan']) && (await focusedRow(t)) === 'Plan', 'left on Plan folds its sub-pages away');
  await t.shot('keys-folded', 'aside');
  await t.key(' ');
  await t.ok('sidebar-keys', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|Groceries', '1|🌱 Garden']), 'space unfolds Plan again');
  await t.key('Escape');
  await t.ok('sidebar-keys', () => inNote(t), 'escape puts the keyboard back in the note');

  await t.key(`${t.mod}+Backslash`);
  await t.key(`${t.mod}+Backslash`);
  await t.ok('sidebar-toggle', async () => (await t.page.locator('aside [data-row]').count()) === 0 && await inNote(t),
    'command backslash twice closes the sidebar and the note keeps the keyboard');
  await t.shot('sidebar-closed');
  await t.click('button[aria-label="Sidebar"]');
  await t.ok('sidebar-toggle', async () => (await list(t)).length === 4, 'the toolbar Sidebar button brings the list back');
  await t.click('button[aria-label="Sidebar"]');
  await t.ok('sidebar-toggle', async () => (await t.page.locator('aside [data-row]').count()) === 0, 'the Sidebar button closes it again');
  await t.click('button[aria-label="Sidebar"]');
  await t.ok('sidebar-toggle', async () => (await list(t)).length === 4, 'and opens it once more');

  await t.click('aside [data-note="c"]');
  await t.click('aside button[aria-label="Collapse"]');
  await t.ok('sidebar-fold', listIs(t, [`0|${emoji} Reading list`, '0|Plan']), 'the Collapse chevron hides Plan sub-pages');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('sidebar-fold', async () => same(await list(t), [`0|${emoji} Reading list`, '0|Plan'])
    && (await t.page.locator('aside button[aria-label="Expand"]').count()) === 1, 'after a reload Plan is still folded with an Expand chevron');
  await t.shot('fold-kept', 'aside');
  await t.click('aside button[aria-label="Expand"]');
  await t.ok('sidebar-fold', listIs(t, [`0|${emoji} Reading list`, '0|Plan', '1|Groceries', '1|🌱 Garden']), 'Expand shows the sub-pages again');
};
