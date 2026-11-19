const rows = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row][data-note]')]
  .map((r) => (r.classList.contains('enter') ? '>' : '') + r.textContent.trim()));
const titles = async (t) => (await rows(t)).filter((r) => /Plan|Groceries|Reading list/.test(r));
const heading = (t) => t.page.evaluate(() => document.querySelector('.tiptap')?.textContent ?? '');

export default async (t) => {
  await t.click('.tiptap');
  await t.key(`${t.mod}+p`);
  await t.ok('search-open', () => t.page.evaluate(() => document.activeElement?.matches('aside .search input')
    && document.activeElement.placeholder.startsWith('Search')), 'the keyboard is in the sidebar Search box');
  await t.shot('open', 'aside');

  await t.type('groc');
  await t.ok('search-narrow', async () => {
    const r = await titles(t);
    return r.length === 1 && r[0].startsWith('>') && r[0].endsWith('Groceries');
  }, 'only Groceries is listed, marked as the one Enter opens');
  await t.shot('narrowed');

  await t.key('Enter');
  await t.ok('search-enter', async () => (await heading(t)).startsWith('Groceries') && (await t.markdown()).includes('milk')
    && (await titles(t)).length === 3, 'Enter opens Groceries, and the whole list is back');
  await t.shot('opened');

  await t.click('aside .search input');
  await t.type('read');
  await t.ok('search-narrow', async () => {
    const r = await titles(t);
    return r.length === 1 && r[0].endsWith('Reading list');
  }, 'a click in the box and typing lists Reading list alone');
  await t.key('Escape');
  await t.ok('search-clear', async () => (await titles(t)).length === 3
    && await t.page.evaluate(() => document.querySelector('aside .search input').value === '' && !!document.activeElement?.closest('.tiptap')),
  'Esc empties the box, brings back all three notes and puts the keyboard back in the note');

  await t.click('aside .search input');
  await t.type('plan');
  await t.ok('search-narrow', async () => (await titles(t)).length === 1, 'typing plan narrows the list to one note');
  await t.click('aside .search button[aria-label="Clear search"]');
  await t.ok('search-clear', async () => (await titles(t)).length === 3
    && await t.page.evaluate(() => document.activeElement === document.querySelector('aside .search input') && document.activeElement.value === ''),
  'the × empties the box, brings back all three notes and keeps the keyboard in the box');
  await t.shot('cleared', 'aside');
};
