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

  // mid-drag: a line where the block will land (under the third line), across the text, before it is let go
  await fresh();
  {
    const g = await grip('first line');
    const to = await page.locator('.tiptap > p', { hasText: 'third line' }).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + g.width / 2 + i, g.y + ((to.y + to.height * 0.8 - g.y) * i) / 8);
    await page.waitForTimeout(150);
    const line = await page.evaluate(() => { const l = document.querySelector('.block-drop'); const r = l?.getBoundingClientRect(); return l && { on: l.classList.contains('on') && getComputedStyle(l).display !== 'none', y: r.top + r.height / 2, w: r.width, h: r.height }; });
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.ok(line?.on && line.h >= 2 && line.w > 200, `while dragging, a line shows where the block will go (${JSON.stringify(line)})`);
    assert.ok(Math.abs(line.y - (to.y + to.height)) < 12, `…under the line it will go below (line at ${Math.round(line.y)}, the third line ends at ${Math.round(to.y + to.height)})`);
    console.log('ok   while a block is dragged, a line shows where it will land');
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
  // a list's line dragged by its own ⋮⋮ moves among its list's lines
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__editor.commands.setContent('# Drag\n\n- one\n- two\n- three\n', true));
  await page.waitForTimeout(700);
  {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const one = await page.locator('.tiptap li', { hasText: 'one' }).boundingBox();
    await page.mouse.move(one.x + 20, one.y + one.height / 2);
    await page.waitForTimeout(120);
    const g = await page.locator('.block-handle.on .grip').boundingBox();
    const three = await page.locator('.tiptap li', { hasText: 'three' }).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + g.width / 2 + i, g.y + ((three.y + three.height * 0.8 - g.y) * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const items = await page.evaluate(() => [...document.querySelectorAll('.tiptap li')].map((l) => l.textContent.trim()));
    assert.deepEqual(items, ['two', 'three', 'one'], `a list's line dragged by ⋮⋮ moves within its list (${errors.join('; ')})`);
    console.log('ok   a list\'s line dragged by its ⋮⋮ moves within its list');
  }
  // ⋮⋮'s menu on a divider and on a table acts on that block, not on the lines around it; the only line of a list
  // deleted takes its list
  const menuOn = async (sel, label) => {
    const b = await page.locator(sel).first().boundingBox();
    await page.mouse.move(b.x + 20, b.y + b.height / 2);
    await page.waitForTimeout(120);
    const g = await page.locator('.block-handle.on .grip').boundingBox();
    await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
    await page.waitForSelector('.menu');
    await page.locator('.menu button', { hasText: label }).first().click();
    await page.waitForTimeout(250);
  };
  const md = () => page.evaluate(() => window.__editor.storage.markdown.getMarkdown().trim());
  await page.evaluate(() => window.__editor.commands.setContent('# M\n\nfirst\n\n---\n\nlast\n', true));
  await page.waitForTimeout(700);
  await menuOn('.tiptap hr', 'Duplicate');
  assert.equal(await md(), '# M\n\nfirst\n\n---\n\n---\n\nlast', '⋮⋮ Duplicate on a divider copies the divider');
  await page.evaluate(() => window.__editor.commands.setContent('# M\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nlast\n', true));
  await page.waitForTimeout(700);
  await menuOn('.tiptap .tableWrapper', 'Duplicate');
  assert.equal((await md()).split('| a | b |').length - 1, 2, '⋮⋮ Duplicate on a table copies the table');
  await page.evaluate(() => window.__editor.commands.setContent('# M\n\nabove\n\n- only\n\nbelow\n', true));
  await page.waitForTimeout(700);
  await menuOn('.tiptap li', 'Delete');
  assert.equal(await md(), '# M\n\nabove\n\nbelow', 'the only line of a list deleted takes its list');
  console.log('ok   ⋮⋮\'s menu acts on a divider and a table themselves; the only line of a list deleted takes its list');
} finally {
  await browser.close();
  await server?.close();
}
