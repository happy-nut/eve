const board = (t) => t.page.evaluate(() => [...document.querySelectorAll('.kb-col')]
  .map((c) => c.querySelector('.kb-title').textContent + ': ' + [...c.querySelectorAll('.kb-card .kb-ctitle')].map((x) => x.textContent).join(', ')).join(' | '));
const card = (title) => `.kb-card:has(.kb-ctitle:text-is("${title}"))`;

async function newCard(t, title, body) {
  await t.click('.kb-col:nth-child(1) .kb-add');
  await t.page.waitForSelector('.card-page');
  await t.type(title);
  await t.key('Enter');
  await t.type(body);
  await t.key('Escape');
  await t.page.waitForSelector('.card-page', { state: 'detached' });
}

export default async (t) => {
  await t.key(`${t.mod}+n`);
  await t.type('Chores');
  await t.key('Enter');
  await t.type('/kanban');
  await t.key('Enter');
  await t.ok('kanban-new', async () => await board(t) === 'To do:  | In progress:  | Done: ' && (await t.markdown()).includes('```kanban'),
    'a board with columns To do, In progress and Done, saved as a ```kanban block');
  await t.shot('kanban-new');

  await t.click('.kb-col:nth-child(1) .kb-add');
  await t.ok('kanban-card', () => t.page.evaluate(() => !!document.activeElement?.closest('.card-page')), 'a column\'s + New opens a card page with the keyboard in it');
  await t.type('Buy milk');
  await t.key('Enter');
  await t.type('Two bottles.');
  await t.shot('kanban-card-page');
  await t.key('Escape');
  await t.ok('kanban-card', async () => !(await t.page.locator('.card-page').count())
    && (await t.page.locator(`${card('Buy milk')} .kb-cbody`).textContent()) === 'Two bottles.',
  'Esc closes the card page and the card in To do shows Buy milk over Two bottles.');
  await t.shot('kanban-card');

  await newCard(t, 'Fix tap', 'Kitchen.');
  await t.page.dragAndDrop(card('Fix tap'), '.kb-col:nth-child(2)');
  await t.ok('kanban-move', async () => await board(t) === 'To do: Buy milk | In progress: Fix tap | Done: ', 'Fix tap dragged to In progress sits there');
  await t.shot('kanban-dragged');
  await t.click(card('Fix tap'));
  await t.click('.card-page button[aria-label="Move to another column"]');
  await t.shot('kanban-move-menu');
  await t.click('.menu button[role="menuitem"]:has-text("Done")');
  await t.key('Escape');
  await t.ok('kanban-move', async () => await board(t) === 'To do: Buy milk | In progress:  | Done: Fix tap', 'Move to another column → Done moves Fix tap to Done');

  await t.click(card('Buy milk'));
  await t.click('.card-page button[aria-label="Delete card"]');
  await t.ok('kanban-delete', async () => (await t.page.locator('.box p').textContent()) === 'Delete “Buy milk”?', 'the bin asks Delete “Buy milk”?');
  await t.shot('kanban-delete-ask');
  await t.key('Enter');
  await t.ok('kanban-delete', async () => await board(t) === 'To do:  | In progress:  | Done: Fix tap' && !(await t.markdown()).includes('Buy milk'), 'Enter deletes Buy milk');
  await t.key(`${t.mod}+z`);
  await t.ok('kanban-delete', async () => await board(t) === 'To do: Buy milk | In progress:  | Done: Fix tap', '⌘Z brings Buy milk back');
  await t.shot('kanban-undone');
};
