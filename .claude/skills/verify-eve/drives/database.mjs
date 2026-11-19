const hour = 3600_000;
const month = new Date().toISOString().slice(0, 7);
const row = (id, order, title, status, day, about) =>
  `---\nid: ${id}\nupdated: ${Date.now() - hour}\ndeleted: false\norder: ${order}\nparent: p\nStatus: ${status}\nDue: ${month}-${day}\n---\n# ${title}\n\n${about}\n`;
const schema = { title: 'Work', props: [{ name: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'] }, { name: 'Due', type: 'date' }], view: 'table' };

export const notes = {
  a: '# Plan\n\nFirst line.\n',
  b: `---\nid: b\nupdated: ${Date.now() - hour}\ndeleted: false\norder: 1\nparent: a\n---\n# Groceries\n\nmilk\n`,
  c: '# Reading list\n\nA book.\n',
  p: `---\nid: p\nupdated: ${Date.now() - hour}\ndeleted: false\norder: 3\n---\n# Projects\n\n\`\`\`database\n${JSON.stringify(schema)}\n\`\`\`\n`,
  r1: row('r1', 0, 'Write spec', 'In progress', '20', 'About the spec.'),
  r2: row('r2', 1, 'Ship app', 'Done', '25', 'About shipping.'),
  r3: row('r3', 2, 'Plan launch', 'Not started', '18', 'About the launch.'),
};

const menu = (label) => `.menu button[role="menuitem"]:has-text("${label}")`;
const sidebar = (t) => t.page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].map((r) => r.textContent.trim()));
const sideRow = (t, name) => t.page.evaluate((n) => {
  const r = [...document.querySelectorAll('aside [data-row]')].find((x) => x.textContent.trim().endsWith(n));
  return r ? r.getBoundingClientRect().left : null;
}, name);
const saved = (t, title) => t.page.evaluate((title) => {
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i));
    if (localStorage.key(i).startsWith('eve.notes.') && new RegExp(`^# ${title}$`, 'm').test(v)) return v;
  }
  return '';
}, title);
const heads = (t) => t.page.evaluate(() => [...document.querySelectorAll('.db thead button.head')].map((b) => b.textContent.trim()));
const names = (t) => t.page.evaluate(() => [...document.querySelectorAll('.db tbody input[aria-label="Title"]')].map((i) => i.value));
const lastRow = '.db tbody tr:last-child';
const rowOf = async (t, title) => `.db tbody tr:nth-child(${(await names(t)).indexOf(title) + 1})`;

async function addProp(t, kind, name) {
  await t.page.locator('.db button[aria-label="Add a property"]').scrollIntoViewIfNeeded();
  await t.click('.db button[aria-label="Add a property"]');
  await t.click(menu(kind));
  await t.page.waitForSelector('.box input');
  await t.key(`${t.mod}+a`);
  await t.type(name);
  await t.key('Enter');
}

async function openPage(t, name) {
  await t.click(`aside [data-row]:has-text("${name}")`);
  await t.page.waitForFunction((n) => document.querySelector('.tiptap')?.firstElementChild?.textContent.trim() === n, name);
}

export default async (t) => {
  await t.key(`${t.mod}+n`);
  await t.type('Tasks');
  await t.key('Enter');
  await t.type('/database');
  await t.key('Enter');
  await t.ok('db-new', async () => JSON.stringify(await heads(t)) === JSON.stringify(['Name', 'Status', 'Due', '+'])
    && await t.page.locator('.db input.db-title').getAttribute('placeholder') === 'Untitled database'
    && await t.page.locator('.db button.new').isVisible()
    && (await t.markdown()).includes('```database'),
  'an Untitled database table with heads Name, Status, Due and + and a + New, saved as a ```database block');
  await t.shot('db-new');

  await t.click('.db button.new');
  await t.ok('db-row', () => t.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Title'), 'a new row has the keyboard in its Title field');
  await t.type('Draft brief');
  await t.key('Enter');
  await t.ok('db-row', async () => {
    const page = await sideRow(t, 'Tasks'), child = await sideRow(t, 'Draft brief');
    return page !== null && child !== null && child > page + 10 && (await saved(t, 'Draft brief')).includes('parent: ');
  }, 'the row named Draft brief is listed in the sidebar under Tasks');
  await t.shot('db-row');

  await t.click(`${lastRow} button.chips[aria-label="Status"]`);
  await t.ok('db-cells', async () => JSON.stringify(await t.page.locator('.menu button[role="menuitem"]').allTextContents().then((l) => l.map((x) => x.trim()).slice(0, 3)))
    === JSON.stringify(['Not started', 'In progress', 'Done']), 'the Status cell opens a menu of Not started, In progress, Done');
  await t.shot('db-cells-menu');
  await t.click(menu('In progress'));
  await t.page.fill(`${lastRow} input[type=date][aria-label="Due"]`, `${month}-20`);
  await t.ok('db-cells', async () => {
    const f = await saved(t, 'Draft brief');
    return /^Status: In progress$/m.test(f) && new RegExp(`^Due: ${month}-20$`, 'm').test(f)
      && (await t.page.locator(`${lastRow} button.chips[aria-label="Status"]`).textContent()).includes('In progress');
  }, 'the row shows In progress and its file says Status: In progress and the Due day');
  await t.shot('db-cells');

  await addProp(t, 'Number', 'Hours');
  await t.ok('db-props', async () => (await heads(t)).includes('Hours'), 'Number Hours is a new column');
  await t.page.fill(`${lastRow} input[aria-label="Hours"]`, '3');
  await t.key('Enter');
  await addProp(t, 'Formula', 'Cost');
  await t.ok('db-props', () => t.page.evaluate(() => document.activeElement?.closest('.box') && document.activeElement.tagName === 'INPUT'
    && document.querySelector('.box p')?.textContent.startsWith('Formula')), 'after its name the Formula field has the keyboard');
  await t.shot('db-props-formula');
  await t.type('prop("Hours") * 10');
  await t.key('Enter');
  await t.ok('db-props', async () => (await t.page.locator(`${lastRow} .computed`).textContent()).trim() === '30'
    && !/^Cost:/m.test(await saved(t, 'Draft brief')), 'Cost reads 30 for 3 hours and is not written in the row');
  await addProp(t, 'Checkbox', 'Paid');
  await t.page.locator(`${lastRow} input[type=checkbox][aria-label="Paid"]`).scrollIntoViewIfNeeded();
  await t.click(`${lastRow} input[type=checkbox][aria-label="Paid"]`);
  await t.ok('db-props', async () => /^Paid: true$/m.test(await saved(t, 'Draft brief')), 'ticking Paid writes Paid: true');
  await addProp(t, 'Tags', 'Tags');
  await t.page.locator(`${lastRow} button.chips[aria-label="Tags"]`).scrollIntoViewIfNeeded();
  await t.click(`${lastRow} button.chips[aria-label="Tags"]`);
  await t.click(menu('New choice…'));
  await t.page.waitForSelector('.box input');
  await t.type('home');
  await t.key('Enter');
  await t.ok('db-props', async () => /^Tags: \["home"\]$/m.test(await saved(t, 'Draft brief')), 'a new tag home is set: Tags: ["home"]');
  await addProp(t, 'Relation', 'See');
  await t.click(menu('Any note'));
  await t.page.locator(`${lastRow} button.chips[aria-label="See"]`).scrollIntoViewIfNeeded();
  await t.click(`${lastRow} button.chips[aria-label="See"]`);
  await t.click(menu('Groceries'));
  await t.ok('db-props', async () => /^See: \["\[\[Groceries\]\]"\]$/m.test(await saved(t, 'Draft brief'))
    && (await t.page.locator(`${lastRow} button.chips[aria-label="See"]`).textContent()).includes('↗ Groceries'),
  'a relation to Groceries reads ↗ Groceries and is saved as See: ["[[Groceries]]"]');
  await t.shot('db-props');

  await openPage(t, 'Projects');
  await t.click('.db thead button.head:has-text("Due")');
  await t.click(menu('Sort ascending'));
  await t.ok('db-sort-filter', async () => JSON.stringify(await names(t)) === JSON.stringify(['Plan launch', 'Write spec', 'Ship app']),
    'sorted by Due ascending: Plan launch, Write spec, Ship app');
  await t.click('.db thead button.head:has-text("Status")');
  await t.click(menu('Only “Done”'));
  await t.ok('db-sort-filter', async () => JSON.stringify(await names(t)) === JSON.stringify(['Ship app'])
    && (await t.page.locator('.db .note').textContent()).includes('Only rows whose Status is “Done”'), 'Only “Done” leaves Ship app with a note saying so');
  await t.shot('db-filtered');
  await t.click('.db .note button.link');
  await t.ok('db-sort-filter', async () => (await names(t)).length === 3, 'show all brings back the three rows');
  await t.click('.db thead button.head:has-text("Status")');
  await t.click(menu('Only “Done”'));
  await t.click('.db thead button.head:has-text("Status")');
  await t.click(menu('Show all rows'));
  await t.ok('db-sort-filter', async () => (await names(t)).length === 3, 'Show all rows in the head menu brings them back too');

  const board = (t) => t.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.db .col[role="group"]')]
    .map((c) => [c.getAttribute('aria-label'), [c.querySelector('.count').textContent.trim(), ...[...c.querySelectorAll('.card-title')].map((x) => x.textContent)].join(',')])));
  await t.click('.db .views button[role="tab"]:has-text("Board")');
  await t.ok('db-board', async () => JSON.stringify(await board(t)) === JSON.stringify({ 'Not started': '1,Plan launch', 'In progress': '1,Write spec', Done: '1,Ship app' }),
    'the board has columns Not started, In progress, Done, each with its count and card');
  await t.shot('db-board');
  await t.page.dragAndDrop('.db button.card:has-text("Plan launch")', '.db .col[aria-label="Done"]');
  await t.ok('db-board', async () => (await board(t)).Done === '2,Plan launch,Ship app' && /^Status: Done$/m.test(await saved(t, 'Plan launch')),
    'Plan launch dragged to Done sits there and its file says Status: Done');
  await t.shot('db-board-dragged');
  await t.key(`${t.mod}+z`);
  await t.ok('db-board', async () => (await board(t))['Not started'] === '1,Plan launch' && /^Status: Not started$/m.test(await saved(t, 'Plan launch')),
    '⌘Z puts Plan launch back in Not started');
  await t.page.reload();
  await t.page.waitForSelector('.db .col[role="group"]');
  await t.ok('db-board', async () => (await board(t))['Not started'] === '1,Plan launch', 'after a reload Plan launch is still in Not started');

  const day = (d) => t.page.locator(`.db .day[aria-label="${month}-${d}"] .day-row`).allTextContents();
  await t.click('.db .views button[role="tab"]:has-text("Calendar")');
  await t.ok('db-calendar', async () => (await day('18')).includes('Plan launch') && (await day('20')).includes('Write spec') && (await day('25')).includes('Ship app')
    && (await t.page.locator('.db .cal-bar .note').textContent()).trim() === 'by Due', 'each row is on its Due day, the bar saying by Due');
  await t.shot('db-calendar');

  await t.click('.db .views button[role="tab"]:has-text("Gallery")');
  await t.ok('db-gallery', () => t.page.evaluate(() => {
    const cards = [...document.querySelectorAll('.db .g-card:not(.g-new)')].map((c) => c.textContent);
    const spec = cards.find((c) => c.includes('Write spec')) ?? '';
    return cards.length === 3 && spec.includes('About the spec.') && spec.includes('Status: In progress') && spec.includes('Due: ')
      && document.querySelector('.db .g-new')?.textContent.trim() === '+ New';
  }), 'a card per row with its first line, Status and Due, and a + New');
  await t.shot('db-gallery');

  await t.click('.db .views button[role="tab"]:has-text("Table")');
  const spec = await rowOf(t, 'Write spec');
  await t.page.hover(spec);
  await t.click(`${spec} button[aria-label="Open"]`);
  await t.ok('db-open-row', () => t.page.evaluate(() => [...document.querySelectorAll('nav.crumbs .crumb')].map((c) => c.textContent.trim()).join(' / ') === 'Projects / Write spec'
    && document.querySelector('.tiptap')?.textContent.includes('About the spec.')), 'Open shows the row page Write spec, crumbs Projects / Write spec');
  await t.shot('db-open-row');

  await openPage(t, 'Projects');
  const ship = await rowOf(t, 'Ship app');
  await t.page.hover(ship);
  await t.click(`${ship} button[aria-label="Row menu"]`);
  await t.click(menu('Delete row'));
  await t.ok('db-delete-row', async () => !(await names(t)).includes('Ship app') && !(await sidebar(t)).some((r) => r.endsWith('Ship app'))
    && /^deleted: true$/m.test(await saved(t, 'Ship app')) && !(await t.page.locator('.box').count()),
  'Delete row asks nothing: Ship app leaves the table and the sidebar and is marked deleted');
  await t.shot('db-delete-row');
};
