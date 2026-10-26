// The ⋮⋮ beside a block (blockHandle.ts), driven as a hand drives it in WebKit: hover a line, press on ⋮⋮, drag it
// down past another line, let go — the line is there now, and one ⌘Z puts it back; ⌥ held, a copy goes and it stays.
// A click on ⋮⋮ (no drag) opens the block's menu.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:handle
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
  const fresh = async () => {
    await page.evaluate(() => window.__editor.commands.setContent('# Drag\n\nfirst line\n\nsecond line\n\nthird line\n', true));
    await page.waitForTimeout(700); // past the editor's 500ms in which edits are one step of ⌘Z
  };
  const lines = () => page.evaluate(() => [...document.querySelectorAll('.tiptap > p')].map((p) => p.textContent).filter(Boolean));
  /** the pointer over a line, then on its ⋮⋮ */
  async function grip(text) {
    const box = await page.locator('.tiptap > p', { hasText: text }).boundingBox();
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.waitForSelector('.block-handle.on');
    await page.waitForTimeout(100);
    return page.locator('.block-handle .grip').boundingBox();
  }
  async function drag(text, below, alt = false) {
    const g = await grip(text);
    const to = await page.locator('.tiptap > p', { hasText: below }).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + g.width / 2 + i, g.y + ((to.y + to.height * 0.8 - g.y) * i) / 8);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
    await page.waitForTimeout(250);
  }

  await fresh();
  await drag('first line', 'third line');
  assert.deepEqual(await lines(), ['second line', 'third line', 'first line'], 'dragged by ⋮⋮ below the third line, the first line is there');
  const focus = await page.evaluate(() => document.activeElement?.className ?? '');
  assert.match(focus, /ProseMirror/, `after the drop the keys are the note's again (focus on: ${focus})`);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(200);
  assert.deepEqual(await lines(), ['first line', 'second line', 'third line'], 'one ⌘Z puts it back');
  console.log('ok   a line dragged by ⋮⋮ goes where it is let go; ⌘Z puts it back');

  await fresh();
  await drag('first line', 'second line', true);
  assert.deepEqual(await lines(), ['first line', 'second line', 'first line', 'third line'], 'let go with ⌥, a copy goes there');
  console.log('ok   let go with ⌥ held, a copy goes there and the line stays');

  await fresh();
  const g = await grip('second line');
  await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
  await page.waitForSelector('.menu', { timeout: 3000 });
  assert.ok(await page.locator('.menu button', { hasText: 'Turn into' }).count() >= 0);
  assert.ok(await page.locator('.menu', { hasText: 'Duplicate' }).count() > 0, 'a click on ⋮⋮ opens the block menu');
  console.log('ok   a click on ⋮⋮ opens the block menu');
} finally {
  await browser.close();
  await server?.close();
}
