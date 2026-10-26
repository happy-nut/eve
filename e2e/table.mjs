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
} finally {
  await browser.close();
  await server?.close();
}
