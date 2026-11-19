const dialog = '[role="dialog"][aria-label="Settings"]';
const tabs = (t) => t.page.evaluate((d) => [...document.querySelectorAll(`${d} button[role="tab"]`)].map((b) => b.textContent.trim()).join(','), dialog);
const selectedTab = (t) => t.page.evaluate((d) => document.querySelector(`${d} button[role="tab"][aria-selected="true"]`)?.textContent.trim(), dialog);
const searchFocused = (t) => t.page.evaluate(() => document.activeElement?.matches('aside input'));
const inNote = (t) => t.page.evaluate(() => !!document.activeElement?.closest('.tiptap'));
const theme = (t) => t.page.evaluate(() => `${document.documentElement.dataset.theme}|${getComputedStyle(document.body).backgroundColor}`);
const noteFont = (t) => t.page.evaluate(() => { const s = getComputedStyle(document.querySelector('.tiptap p')); return `${s.fontSize}|${s.lineHeight}`; });
const sub = (t, label) => t.page.evaluate((l) => document.querySelector(`input[aria-label="${l}"]`)?.closest('label.row')?.querySelector('.sub')?.textContent.trim(), label);
const noteWidth = (t) => t.page.evaluate(() => Math.round(document.querySelector('.tiptap').getBoundingClientRect().width));

export default async (t) => {
  await t.key(`${t.mod}+Comma`);
  await t.ok('settings-open', async () => (await t.page.locator(dialog).isVisible()) && (await selectedTab(t)) === 'General'
    && (await tabs(t)) === 'General,Appearance,Sync,Shortcuts', 'command comma opens Settings on General with General, Appearance, Sync, Shortcuts');
  await t.shot('open-general');
  await t.key('Escape');
  await t.ok('settings-open', async () => (await t.page.locator(dialog).count()) === 0, 'escape closes Settings');
  await t.click('aside button[aria-label="Settings"]');
  await t.ok('settings-open', async () => (await t.page.locator(dialog).isVisible()) && (await selectedTab(t)) === 'General', 'the sidebar gear opens Settings on General too');

  await t.click(`${dialog} button[role="tab"]:has-text("Shortcuts")`);
  const row = `${dialog} .row:has(.label:text-is("Search notes"))`;
  await t.click(`${row} .chip`);
  await t.key(`${t.mod}+n`);
  await t.ok('settings-conflict', () => t.page.evaluate((d) => /⌘N is already used by “New note”/.test(document.querySelector(`${d} .alert`)?.textContent ?? ''), dialog),
    'command N on Search notes is refused: ⌘N is already used by “New note”');
  await t.shot('conflict');
  await t.key(`${t.mod}+j`);
  await t.ok('settings-conflict', async () => (await t.page.locator(`${dialog} .alert`).count()) === 0, 'the chip kept waiting and took the next free combo, the warning gone');
  await t.ok('settings-rebind', async () => (await t.page.locator(`${row} .chip`).first().textContent()).replace(/\s+/g, '') === '⌘J', 'the Search notes chip reads ⌘J');
  await t.shot('rebound');
  await t.key('Escape');
  await t.ok('settings-rebind', async () => (await t.page.locator(dialog).count()) === 0, 'escape closes Settings after the chip took its key');

  await t.click('.tiptap');
  await t.key(`${t.mod}+p`);
  await t.ok('settings-rebind', async () => (await inNote(t)) && !(await searchFocused(t)), 'the old command P no longer opens search');
  await t.key(`${t.mod}+j`);
  await t.ok('settings-rebind', async () => (await searchFocused(t)) && (await t.page.getAttribute('aside input', 'placeholder')).replace(/\s+/g, ' ') === 'Search ⌘J',
    'command J puts the keyboard in the search box, which reads Search ⌘J');
  await t.shot('search-by-new-key');
  await t.key('Escape');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.click('.tiptap');
  await t.key(`${t.mod}+p`);
  await t.ok('settings-rebind', async () => !(await searchFocused(t)), 'after a reload command P still does not open search');
  await t.key(`${t.mod}+j`);
  await t.ok('settings-rebind', () => searchFocused(t), 'after a reload command J still opens search');
  await t.key('Escape');

  await t.click('.tiptap');
  await t.key(`${t.mod}+Comma`);
  await t.click(`${dialog} button[role="tab"]:has-text("Appearance")`);
  await t.click('button[aria-label="Theme"]');
  await t.click('[role="listbox"] [role="option"]:has-text("Dark")');
  await t.ok('settings-theme', async () => (await theme(t)) === 'dark|rgb(11, 12, 16)', 'Theme Dark turns the whole window dark at once');
  await t.shot('dark');
  await t.key('Escape');
  await t.ok('settings-theme', async () => (await t.page.locator(dialog).count()) === 0, 'escape closes Settings, the window still dark');
  await t.click('.tiptap');
  await t.key(`${t.mod}+Shift+l`);
  await t.ok('settings-theme', async () => (await theme(t)) === 'light|rgb(255, 255, 255)', 'command shift L flips the window to light');
  await t.key(`${t.mod}+Shift+l`);
  await t.ok('settings-theme', async () => (await theme(t)) === 'dark|rgb(11, 12, 16)', 'command shift L again flips it back to dark');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('settings-theme', async () => (await theme(t)) === 'dark|rgb(11, 12, 16)', 'after a reload the window is still dark');
  await t.shot('dark-kept');
  await t.click('.tiptap');
  await t.key(`${t.mod}+Shift+l`);
  await t.ok('settings-theme', async () => (await theme(t)) === 'light|rgb(255, 255, 255)', 'and light again for the sliders');

  await t.ok('settings-slider', async () => (await noteFont(t)).startsWith('15px|'), 'the note starts at 15 px');
  await t.key(`${t.mod}+Comma`);
  await t.click(`${dialog} button[role="tab"]:has-text("Appearance")`);
  const s = t.page.locator('input[aria-label="Size"]');
  await s.scrollIntoViewIfNeeded();
  const b = await s.boundingBox();
  await t.page.mouse.click(b.x + b.width - 4, b.y + b.height / 2);
  await t.ok('settings-slider', async () => (await sub(t, 'Size')) === '28px' && (await noteFont(t)).startsWith('28px|'),
    'a click at the right end of Size makes it 28px, and the note text 28 px at once');
  await t.page.mouse.move(b.x + b.width - 4, b.y + b.height / 2);
  await t.page.mouse.down();
  await t.page.mouse.move(b.x + b.width * 0.5, b.y + b.height / 2, { steps: 6 });
  await t.page.mouse.up();
  await t.ok('settings-slider', async () => (await sub(t, 'Size')) === '20px' && (await noteFont(t)).startsWith('20px|'),
    'dragging Size to the middle makes it 20px, the note following');
  await t.shot('size-mouse');
  for (let i = 0; i < 40 && !(await t.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Line height')); i++) await t.key('Tab');
  await t.ok('settings-slider', async () => (await sub(t, 'Line height')) === '1.6', 'tab reaches Line height, at 1.6');
  await t.key('ArrowRight');
  await t.key('ArrowRight');
  await t.ok('settings-slider', async () => (await sub(t, 'Line height')) === '1.7' && (await noteFont(t)) === '20px|34px',
    'two right arrows make Line height 1.7, the note line 34 px at 20 px');
  await t.shot('lineheight-keys');
  const wide = await noteWidth(t);
  const width = Number((await sub(t, 'Width')).replace('px', ''));
  await t.key('Tab');
  await t.ok('settings-slider', () => t.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Width'), 'tab goes on to Width');
  await t.key('ArrowLeft');
  await t.key('ArrowLeft');
  await t.ok('settings-slider', async () => (await sub(t, 'Width')) === `${width - 40}px` && (await noteWidth(t)) === wide - 40,
    'two left arrows make Width 40 px less, and the note column 40 px narrower');
  await t.shot('width-keys');
  await t.key('Escape');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('settings-slider', async () => (await noteFont(t)) === '20px|34px' && (await noteWidth(t)) === wide - 40, 'after a reload the note is still 20 px with 34 px lines and 40 px narrower');
  await t.shot('slider-kept');
};
