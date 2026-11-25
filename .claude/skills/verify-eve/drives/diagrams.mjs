const put = async (t, item) => {
  await t.click('.tiptap > p >> nth=-1');
  await t.key('End');
  await t.key('Enter');
  await t.type(item);
  await t.page.waitForSelector('.suggest li');
  await t.key('Enter');
  await t.wait(900);
};
const md = (t) => t.markdown();
const has = async (t, ...parts) => { const m = await md(t); return parts.every((p) => m.includes(p)); };
const drawn = (t, text) => t.page.locator(`.tiptap .dblock.active svg :text-is("${text}")`).count().then((n) => n > 0);
const dock = (t, label) => t.click(`.tiptap .dblock.active .dock button[aria-label="${label}"]`);
const more = async (t, item) => {
  await dock(t, 'More');
  await t.click(`[role="menu"] [role="menuitem"]:has-text("${item}")`);
};
const edit = async (t, field, text) => {
  await t.page.locator(field).first().scrollIntoViewIfNeeded();
  await t.click(field);
  await t.key(`${t.mod}+a`);
  await t.type(text);
};

export default async (t) => {
  await put(t, '/flowchart');
  await t.page.waitForSelector('.tiptap .mermaid-view svg');
  await t.ok('diagram-new', async () => await drawn(t, 'Start') && await drawn(t, 'Ready?') && await drawn(t, 'Done')
    && await t.page.locator('.tiptap .dblock.active .dock button[aria-label="Full screen"]').isVisible()
    && await has(t, '```mermaid', 'flowchart LR'), '/flowchart draws Start, Ready? and Done, open with its dock, saved as a mermaid flowchart');
  await t.shot('flowchart');

  await t.click('.tiptap .mermaid-view g.node:has-text("Start")');
  await t.ok('diagram-edit', () => t.page.locator('.layer .bar').isVisible(), 'a clicked box is picked, its bar shown');
  await t.type('Begin');
  await t.key('Escape');
  await t.ok('diagram-edit', async () => await drawn(t, 'Begin') && !(await drawn(t, 'Start')), 'typing replaces the picked box words: Begin');
  await t.ok('diagram-kept', () => has(t, 'n1(["Begin"])'), 'the saved mermaid block has the renamed box n1(["Begin"])');
  await t.shot('edited');

  await t.click('.tiptap .mermaid-view g.node:has-text("Done")');
  await t.click('.layer button.plus');
  await t.ok('diagram-edit', () => has(t, 'n4("New step")'), 'the blue + beside Done adds a step after it, saved as n4("New step")');
  await t.type('Ship');
  await t.key('Escape');
  await t.ok('diagram-edit', () => drawn(t, 'Ship'), 'the blue + beside Done adds a step drawn as Ship');
  await t.ok('diagram-kept', () => has(t, 'n4("Ship")', 'n3 --> n4'), 'the saved block has the new step n4("Ship") joined by n3 --> n4');
  await t.wait(800);
  await t.shot('added');

  await dock(t, 'Undo');
  await t.ok('diagram-undo', () => has(t, 'n4("New step")'), 'the first undo takes back the typed words: the step reads New step again');
  await dock(t, 'Undo');
  await t.ok('diagram-undo', async () => { const m = await md(t); return !m.includes('n4') && !m.includes('n3 --> n4'); },
    'the second undo takes back the added step and its line');
  await t.shot('undone');
  await t.ok('diagram-undo', async () => (await t.page.locator('.layer button.plus').count()) === 0, 'with the added step taken back no + is left beside a box');
  await t.click('.tiptap .mermaid-view g.node:has-text("Ready?")');
  await t.key(`${t.mod}+z`);
  await t.ok('diagram-undo', () => has(t, 'n1(["Start"])'), 'with a box picked, ⌘Z takes back the change before: Begin reads Start again');
  await t.key(`${t.mod}+Shift+z`);
  await t.ok('diagram-undo', () => has(t, 'n1(["Begin"])'), 'and ⇧⌘Z brings Begin back');
  await t.key('Escape');

  const back = () => t.page.evaluate(() => !document.querySelector('.dblock.full') && !!document.activeElement?.closest('.tiptap'));
  await dock(t, 'Full screen');
  await t.page.waitForSelector('.dblock.full[role="dialog"]');
  await t.key('Escape');
  await t.wait();
  await t.key('Escape');
  await t.ok('diagram-full', back, 'right after the undos, Esc twice on the whole screen puts it back in the note with the keyboard in the note');

  await t.click('.tiptap .mermaid-view g.node:has-text("Ready?")');
  await t.page.waitForSelector('.tiptap .dblock.active .dock');
  await dock(t, 'Full screen');
  await t.ok('diagram-full', async () => await t.page.locator('.dblock.full[role="dialog"]').isVisible()
    && (await t.page.locator('.dblock.full').textContent()).includes('200%')
    && await t.page.locator('button[aria-label="Back to the note"]').isVisible(), 'Full screen shows the diagram as a dialog at 200% with a close button');
  await t.shot('full');
  await t.click('button[aria-label="Back to the note"]');
  await t.ok('diagram-full', back, 'the close button puts it back in the note with the keyboard in the note');
  await t.shot('back');

  await put(t, '/pie');
  await t.page.waitForSelector('.tiptap .dblock.active svg');
  await t.spot('slice:0');
  await t.type('Rent');
  await t.ok('diagram-chart', () => t.page.evaluate(() => [...document.querySelectorAll('.tiptap .dblock.active .pie-legend, .tiptap .dblock.active svg')].some((e) => e.textContent.includes('Rent'))),
    'typing over a clicked pie slice renames it in the drawing at once: Rent');
  await edit(t, '.layer .bar input[aria-label="Value"]', '70');
  await t.key('Enter');
  await t.ok('diagram-chart', async () => await has(t, '"Rent" : 70')
    && await t.page.evaluate(() => document.querySelector('.tiptap .dblock.active')?.textContent.includes('58.3%')),
    'its Value set to 70 redraws the pie with Rent at 58.3% and saves "Rent" : 70');
  await t.shot('pie-part');

  await more(t, 'List');
  await t.page.waitForSelector('.tiptap .dblock.active .form');
  await edit(t, '.tiptap .p-slice input.label >> nth=1', 'Food');
  await edit(t, '.tiptap .p-slice input.num >> nth=1', '20');
  await t.ok('diagram-list', async () => await has(t, '"Food" : 20')
    && (await t.page.locator('.tiptap .dblock.active .pie-legend').textContent()).includes('Food'),
    'in List a pie row renamed Food with 20 is drawn in the legend and saved as "Food" : 20');
  await t.shot('pie-list');

  await put(t, '/sequence');
  await t.page.waitForSelector('.tiptap .dblock.active svg');
  await more(t, 'List');
  await t.page.waitForSelector('.tiptap .dblock.active .form');
  await edit(t, '.tiptap .form input[aria-label="Message"]', 'Sign in');
  await t.page.locator('.tiptap .dblock.active .form button.add:has-text("Add message")').scrollIntoViewIfNeeded();
  await t.click('.tiptap .dblock.active .form button.add:has-text("Add message")');
  await t.type('Welcome');
  await t.ok('diagram-list', async () => await has(t, 'p1->>p2: Sign in', 'p1->>p2: Welcome')
    && await t.page.evaluate(() => [...document.querySelectorAll('.tiptap .dblock.active svg text')].some((e) => e.textContent.trim() === 'Welcome')),
    'in a sequence List the first message renamed Sign in and an added Welcome are drawn and saved');
  await t.shot('sequence-list');

  await put(t, '/swimlanes');
  await t.page.waitForSelector('.tiptap .dblock.active svg.lanes');
  await t.ok('diagram-lanes', async () => {
    const text = await t.page.locator('.tiptap .dblock.active svg.lanes').textContent();
    return ['Customer', 'Store', 'Delivery', 'Order', 'Receive'].every((w) => text.includes(w))
      && await has(t, 'flowchart TD', 'subgraph L1["Customer"]', 'L3["Delivery"]');
  }, '/swimlanes draws Customer, Store and Delivery lanes from Order to Receive, saved as subgraphs');
  await t.wait(800);
  await t.shot('swimlanes', '.tiptap .dblock.active');

  await t.page.reload();
  await t.page.waitForSelector('.tiptap .mermaid-view svg');
  await t.ok('diagram-kept', async () => await has(t, 'n1(["Begin"])', '"Food" : 20', 'p1->>p2: Welcome', 'subgraph L2["Store"]')
    && await t.page.locator('.tiptap .dblock').count() === 4, 'after a reload the four diagrams are drawn again and the note keeps every edit');
  await t.wait(800);
  await t.shot('reloaded');
};
