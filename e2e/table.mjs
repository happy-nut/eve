// A table's columns stay as wide as they are while its cells are written in (Notion's way): opened, a table is laid
// out by what its cells hold, and from then on a cell's words wrap inside it instead of pushing its column wider and
// the others narrower under the caret. A window made wider or narrower lays it out again.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:table
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(URL_);
  await page.waitForSelector('.tiptap');
  await page.locator('button[data-tip="New note"]:visible').first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__editor.commands.setContent('# Table\n\n| Name | Kind | Note |\n| --- | --- | --- |\n| a | b | c |\n| d | e | f |\n', true));
  await page.waitForTimeout(400);
  const widths = () => page.evaluate(() => [...document.querySelector('.tiptap table tr').children].map((c) => Math.round(c.getBoundingClientRect().width)));
  const was = await widths();
  await page.locator('.tiptap td', { hasText: 'a' }).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and a good many more words typed into this one cell, on and on');
  await page.waitForTimeout(200);
  const now = await widths();
  for (let i = 0; i < was.length; i++) assert.ok(Math.abs(now[i] - was[i]) <= 1, `column ${i + 1} stays as wide as it was while a cell is written in (${was} → ${now})`);
  console.log('ok   writing in a cell leaves every column as wide as it was');
  // the window resized: laid out afresh for the room there is now
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(400);
  const narrow = await widths();
  assert.ok(narrow.reduce((a, b) => a + b) <= 900, `a narrower window lays the table out again (${narrow})`);
  console.log('ok   a narrower window lays the table out again');

  // Notion's handles on a table (tableHandles.ts), the pointer driving them as a hand does
  await page.setViewportSize({ width: 1200, height: 800 });
  const set = async (body) => { await page.evaluate((b) => window.__editor.commands.setContent(b, true), body); await page.waitForTimeout(700); };
  const grid = () => page.evaluate(() => [...document.querySelector('.tiptap table').rows].map((r) => [...r.cells].map((c) => c.textContent.trim())));
  const hover = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(120); return b; };
  const box = (sel) => page.locator(sel).first().boundingBox();

  // a table wider than the text: the block's ⋮⋮ is left of the table, not over its first cells
  const wide = '| ' + Array.from({ length: 9 }, (_, i) => `column number ${i}`).join(' | ') + ' |\n|' + ' --- |'.repeat(9) + '\n| ' + Array.from({ length: 9 }, (_, i) => `v${i}`).join(' | ') + ' |';
  await set(`# Wide\n\n${wide}\n`);
  await hover('.tiptap td');
  const tbl = await box('.tiptap table'), handle = await box('.block-handle.on');
  assert.ok(handle && handle.x + handle.width <= tbl.x + 2, `the block's handle is left of a wide table (handle ends at ${Math.round(handle?.x + handle?.width)}, the table starts at ${Math.round(tbl.x)})`);
  console.log('ok   a wide table\'s block handle is left of it, not over its cells');

  await set('# Grid\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n');
  // a row's ⋮⋮ on the table's left edge, a column's ⋯ on its top edge
  const cell = await hover('.tiptap td >> text=1');
  const t = await box('.tiptap table'), rowGrip = await box('.tbl-grip.row.on'), colGrip = await box('.tbl-grip.col.on');
  assert.ok(rowGrip && Math.abs(rowGrip.x + rowGrip.width / 2 - t.x) <= 2 && rowGrip.y < cell.y + cell.height && rowGrip.y + rowGrip.height > cell.y, `a row's ⋮⋮ sits on the table's left edge by that row (${JSON.stringify(rowGrip)})`);
  assert.ok(colGrip && Math.abs(colGrip.y + colGrip.height / 2 - t.y) <= 2 && colGrip.x > cell.x - 1 && colGrip.x + colGrip.width < cell.x + cell.width + 1, `a column's ⋯ sits on the table's top edge over that column (${JSON.stringify(colGrip)})`);
  console.log('ok   ⋮⋮ on the row\'s left edge, ⋯ on the column\'s top edge');

  // a click: that row chosen, its menu; Insert below
  await page.mouse.click(rowGrip.x + rowGrip.width / 2, rowGrip.y + rowGrip.height / 2);
  await page.waitForSelector('.menu');
  await page.locator('.menu button', { hasText: 'Insert below' }).click();
  await page.waitForTimeout(200);
  assert.deepEqual(await grid(), [['A', 'B'], ['1', '2'], ['', ''], ['3', '4']], 'the row\'s menu: Insert below');
  console.log('ok   a click on ⋮⋮ opens the row\'s menu, and Insert below puts a row under it');

  // a drag of ⋮⋮: the row carried below the last one
  await set('# Grid\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n');
  async function dragGrip(grip, to) {
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(grip.x + grip.width / 2 + ((to.x - grip.x) * i) / 8, grip.y + grip.height / 2 + ((to.y - grip.y) * i) / 8);
    await page.waitForTimeout(80);
    const line = await page.evaluate(() => document.querySelector('.tbl-drop.on') !== null);
    await page.mouse.up();
    await page.waitForTimeout(250);
    return line;
  }
  await hover('.tiptap td >> text=1');
  const g1 = await box('.tbl-grip.row.on'), last = await box('.tiptap td >> text=3');
  assert.ok(await dragGrip(g1, { x: g1.x, y: last.y + last.height * 0.85 }), 'while a row is dragged, a line shows where it goes');
  assert.deepEqual(await grid(), [['A', 'B'], ['3', '4'], ['1', '2']], 'a row dragged by ⋮⋮ below the last one goes there');
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(200);
  assert.deepEqual(await grid(), [['A', 'B'], ['1', '2'], ['3', '4']], 'one ⌘Z puts it back');
  console.log('ok   a row dragged by its ⋮⋮ moves, a line showing where; ⌘Z puts it back');

  // a column dragged by its ⋯ to the other side
  await page.waitForTimeout(600);
  await hover('.tiptap th >> text=A');
  const gc = await box('.tbl-grip.col.on'), b = await box('.tiptap th >> text=B');
  await dragGrip(gc, { x: b.x + b.width * 0.85, y: gc.y });
  assert.deepEqual(await grid(), [['B', 'A'], ['2', '1'], ['4', '3']], 'a column dragged by ⋯ past the next one goes there');
  console.log('ok   a column dragged by its ⋯ moves');

  // the + along the foot adds a row, the + on the right a column
  await set('# Grid\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  await hover('.tiptap td >> text=2');
  const addRow = await box('.tbl-add.row.on');
  await page.mouse.click(addRow.x + addRow.width / 2, addRow.y + addRow.height / 2);
  await page.waitForTimeout(200);
  await page.keyboard.type('new');
  assert.deepEqual(await grid(), [['A', 'B'], ['1', '2'], ['new', '']], 'the + under the table adds a row, the caret in its first cell');
  await hover('.tiptap td >> text=2');
  const addCol = await box('.tbl-add.col.on');
  await page.mouse.click(addCol.x + addCol.width / 2, addCol.y + addCol.height / 2);
  await page.waitForTimeout(200);
  assert.equal((await grid())[0].length, 3, 'the + on the right adds a column');
  console.log('ok   + under the table adds a row, + on its right a column');
} finally {
  await browser.close();
  await server?.close();
}
