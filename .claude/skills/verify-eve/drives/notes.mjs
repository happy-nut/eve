const rows = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].map((r) => r.textContent.trim()));

export default async (t) => {
  await t.key(`${t.mod}+n`);
  await t.ok('note-new', () => t.page.evaluate(() => {
    const doc = window.__editor?.state.doc;
    return doc?.textContent === '' && window.__editor.state.selection.from <= 2 && document.activeElement?.closest('.tiptap');
  }), 'a new note is empty with the caret on its title line');

  await t.type('Trip');
  await t.key('Enter');
  await t.type('Pack bags');
  await t.ok('note-title', async () => (await rows(t)).some((r) => r.endsWith('Trip')), 'the first line names the note in the sidebar');
  await t.shot('new-note');

  await t.ok('note-tree', () => t.page.evaluate(() => {
    const row = (name) => [...document.querySelectorAll('aside [data-row]')].find((r) => r.textContent.trim().endsWith(name));
    const plan = row('Plan'), groceries = row('Groceries');
    return plan && groceries && groceries.getBoundingClientRect().left > plan.getBoundingClientRect().left + 10
      && plan.closest('.row').querySelector('.fold[aria-label="Collapse"]');
  }), 'Groceries sits indented under Plan, which has a fold button');
  await t.shot('tree', 'aside');

  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('note-kept', async () => (await rows(t)).some((r) => r.endsWith('Trip')) && (await t.markdown()).includes('Pack bags'),
    'after a reload Trip is listed and still holds its line');
};
