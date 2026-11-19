import { notes as mac } from './database.mjs';

export const notes = { p: mac.p, r1: mac.r1, r2: mac.r2, r3: mac.r3 };

const titles = (t, sel) => t.page.locator(sel).evaluateAll((els) => els.map((e) => e.value ?? e.textContent));

export default async (t) => {
  await t.page.waitForSelector('.db');
  await t.ok('db-phone', async () => JSON.stringify(await t.page.locator('.db .views button[role="tab"]').allTextContents()) === JSON.stringify(['Table', 'Board', 'Calendar', 'Gallery'])
    && (await titles(t, '.db tbody input[aria-label="Title"]')).length === 3, 'on a phone the database has the same Table, Board, Calendar, Gallery tabs and its three rows');
  await t.shot('db-phone-table');

  await t.click('.db .views button[role="tab"]:has-text("Board")');
  const add = '.db .col[aria-label="Not started"] button.new';
  await t.page.locator(add).scrollIntoViewIfNeeded();
  await t.click(add);
  await t.ok('db-phone', () => t.page.evaluate(() => document.querySelector('.box p')?.textContent === 'Name' && document.activeElement === document.querySelector('.box input')),
    '+ New on the board asks Name in a sheet with the keyboard in it');
  await t.type('Write docs');
  await t.shot('db-phone-name');
  await t.click('.box button.primary');
  await t.ok('db-phone', async () => (await titles(t, '.db .col[aria-label="Not started"] .card-title')).includes('Write docs'), 'Write docs is a card in Not started');
  await t.shot('db-phone-board');

  const card = '.db button.card:has-text("Write docs")';
  await t.page.locator(card).scrollIntoViewIfNeeded();
  await t.click(card);
  await t.ok('db-phone', () => t.page.evaluate(() => !document.querySelector('.db') && document.querySelector('.tiptap')?.firstElementChild?.textContent.trim() === 'Write docs'),
    'tapping the card opens the Write docs page');
  await t.shot('db-phone-row');
};
