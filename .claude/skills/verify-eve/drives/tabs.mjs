const bar = (t) => t.page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')]
  .map((x) => (x.classList.contains('on') ? '*' : '') + (x.classList.contains('pinned') ? '[pin]' : '') + x.querySelector('.pick').title).join(' | '));
const is = (t, want) => async () => (await bar(t)) === want;
const front = (t) => t.page.evaluate(() => document.querySelector('.tiptap')?.textContent ?? '');
const activeRow = (t) => t.page.evaluate(() => document.querySelector('aside [data-row].active')?.textContent.trim() ?? '');

export default async (t) => {
  const noBarAtStart = await t.page.evaluate(() => !document.querySelector('.tabbar'));
  await t.click('.tiptap');
  await t.key(`${t.mod}+t`);
  await t.type('Trip');
  await t.ok('tabs-new', async () => noBarAtStart && (await bar(t)) === 'Plan | *Trip' && (await front(t)).startsWith('Trip')
    && await t.page.evaluate(() => document.querySelector('.tabbar[role="tablist"][aria-label="Open notes"]') && !!document.activeElement?.closest('.tiptap')),
  'with no bar before, ⌘T shows the bar with Plan then a front tab whose new note holds what was typed');
  await t.shot('new-tab');

  await t.page.keyboard.down('Meta');
  await t.click('aside [data-note="c"]');
  await t.page.keyboard.up('Meta');
  await t.ok('tabs-open-row', is(t, 'Plan | Trip | *Reading list'), '⌘-click on Reading list opens it in a new front tab');
  await t.page.click('aside [data-note="b"]', { button: 'right' });
  await t.click('.menu button[role="menuitem"]:has-text("Open in new tab")');
  await t.ok('tabs-open-row', async () => (await bar(t)) === 'Plan | Trip | Reading list | *Groceries' && (await front(t)).startsWith('Groceries')
    && (await t.page.evaluate(() => [...document.querySelectorAll('nav.crumbs .crumb')].map((c) => c.textContent.trim()).join(' / '))) === 'Plan / Groceries',
  'Open in new tab from the row menu adds Groceries in front, its crumbs Plan / Groceries');
  await t.shot('open-row');

  await t.click('.tabbar .tab:nth-child(1) .pick');
  await t.ok('tabs-switch', async () => (await bar(t)) === '*Plan | Trip | Reading list | Groceries' && (await front(t)).startsWith('Plan')
    && (await activeRow(t)).endsWith('Plan'), 'a click on the Plan tab shows Plan and marks its sidebar row');
  await t.key('Control+Tab');
  await t.ok('tabs-switch', async () => (await bar(t)) === 'Plan | *Trip | Reading list | Groceries' && (await front(t)).startsWith('Trip'),
    '⌃Tab steps to Trip');
  await t.key('Control+Shift+Tab');
  await t.ok('tabs-switch', async () => (await bar(t)) === '*Plan | Trip | Reading list | Groceries' && (await front(t)).startsWith('Plan'),
    '⌃⇧Tab steps back to Plan');
  await t.key('Control+Tab');
  await t.ok('tabs-switch', is(t, 'Plan | *Trip | Reading list | Groceries'), '⌃Tab again comes to Trip');
  await t.shot('switched');

  await t.page.hover('.tabbar .tab:nth-child(3)');
  await t.click('.tabbar .tab:nth-child(3) button[aria-label="Close tab"]');
  await t.ok('tabs-close', is(t, 'Plan | *Trip | Groceries'), 'the × on Reading list closes that tab and Trip stays in front');
  await t.key(`${t.mod}+w`);
  await t.ok('tabs-close', async () => (await bar(t)) === 'Plan | *Groceries' && (await front(t)).startsWith('Groceries'),
    '⌘W closes the front Trip and Groceries beside it comes to front');
  await t.shot('closed');

  await t.key(`${t.mod}+Shift+t`);
  await t.ok('tabs-reopen', async () => (await bar(t)) === 'Plan | Groceries | *Trip' && (await front(t)).startsWith('Trip'),
    '⌘⇧T brings Trip back, in front');
  await t.shot('reopened');

  await t.page.click('.tabbar .tab:nth-child(1)', { button: 'right' });
  await t.click('.menu button[role="menuitem"]:has-text("Pin tab")');
  const pinned = () => t.page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tabbar .tab')];
    const first = tabs[0], other = tabs[1];
    return first.querySelector('.pick').textContent.trim() === 'P' && !first.querySelector('button[aria-label="Close tab"]')
      && first.getBoundingClientRect().width < other.getBoundingClientRect().width / 2;
  });
  await t.ok('tabs-pin', async () => (await bar(t)) === '[pin]Plan | Groceries | *Trip' && await pinned(),
    'Pin tab shrinks Plan to a narrow P at the front with no ×');
  await t.shot('pinned', '.tabbar');

  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('tabs-kept', async () => (await bar(t)) === '[pin]Plan | Groceries | *Trip' && (await front(t)).startsWith('Trip') && await pinned(),
    'after a reload the bar is still the pinned P, Groceries and Trip in front');
  await t.shot('reloaded');
};
