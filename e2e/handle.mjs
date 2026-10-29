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

/** from (x, y) over a block in `scope` to its ⋮⋮, as a hand goes there — not jumped onto it. On a day's page ⋮⋮ sat past
 *  the editor's edge, and the pointer left the editor on its way: the handle went before it could be taken */
async function walkTo(page, scope, x, y) {
  await page.mouse.move(x, y);
  await page.waitForSelector(`${scope} .block-handle.on`);
  await page.waitForTimeout(100);
  const g = await page.locator(`${scope} .block-handle .grip`).boundingBox();
  const tx = g.x + g.width / 2, ty = g.y + g.height / 2;
  for (let i = 1; i <= 16; i++) {
    const px = x + ((tx - x) * i) / 16, py = y + ((ty - y) * i) / 16;
    await page.mouse.move(px, py);
    await page.waitForTimeout(25);
    assert.ok(await page.locator(`${scope} .block-handle.on`).count(), `${scope}: ⋮⋮ went away as the pointer went to it (at ${Math.round(px)}, ${Math.round(py)}; ⋮⋮ at ${Math.round(tx)})`);
  }
  return g;
}

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
    return walkTo(page, 'main', box.x + 20, box.y + box.height / 2);
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

  // a block into a toggle and out of it, as Notion's: let go over the toggle's title (its lower half), it goes first in
  // the toggle's body; a line in the body is a block of its own, its ⋮⋮ beside it, dragged out under the toggle
  {
    await page.evaluate(() => window.__editor.commands.setContent('# Drag\n\n<details open>\n<summary>The toggle</summary>\n\ninside line\n\n</details>\n\nloose line\n\nlast line\n', true));
    await page.waitForTimeout(700);
    const md = () => page.evaluate(() => window.__editor.storage.markdown.getMarkdown());
    const g = await grip('loose line');
    const title = await page.locator('.tiptap summary').boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + g.width / 2 + i, g.y + ((title.y + title.height * 0.75 - g.y) * i) / 8);
    await page.waitForTimeout(150);
    const line = await page.evaluate(() => { const l = document.querySelector('.block-drop'), r = l.getBoundingClientRect(), body = document.querySelector('.tiptap [data-type="detailsContent"]').getBoundingClientRect(); return { left: r.left, body: body.left }; });
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.ok(Math.abs(line.left - line.body) < 4, `the drop line starts at the toggle's body (${Math.round(line.left)} vs ${Math.round(line.body)})`);
    assert.match(await md(), /<summary>The toggle<\/summary>\n\nloose line\n\ninside line\n\n<\/details>\n\nlast line/, `dropped over the toggle's title, the line is first in its body:\n${await md()}`);
    await page.waitForTimeout(600); // past the 500ms in which edits are one step of ⌘Z
    // out again: the line in the body has its own ⋮⋮, and goes under the last line
    const inner = await page.locator('.tiptap [data-type="detailsContent"] p', { hasText: 'inside line' }).boundingBox();
    await page.mouse.move(inner.x + 20, inner.y + inner.height / 2);
    await page.waitForSelector('.block-handle.on');
    await page.waitForTimeout(100);
    const g2 = await page.locator('.block-handle .grip').boundingBox();
    assert.ok(g2.x + g2.width <= inner.x + 2 && Math.abs(g2.y + g2.height / 2 - (inner.y + inner.height / 2)) < 10, 'a line in a toggle has its ⋮⋮ beside it');
    const last = await page.locator('.tiptap > p', { hasText: 'last line' }).boundingBox();
    await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(g2.x + g2.width / 2 + i, g2.y + ((last.y + last.height * 0.8 - g2.y) * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.match(await md(), /<summary>The toggle<\/summary>\n\nloose line\n\n<\/details>\n\nlast line\n\ninside line/, `the line dragged out of the toggle, under the last line:\n${await md()}`);
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(200);
    assert.match(await md(), /loose line\n\ninside line\n\n<\/details>/, 'one ⌘Z puts it back in the toggle');
    console.log('ok   a block dragged into a toggle (over its title) and out of it; a line in a toggle has its own ⋮⋮');
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
    // …and out of it, as Notion's: under the line below the list, as a list of its own (it could only stay in its list)
    await page.evaluate(() => window.__editor.commands.setContent('# Drag\n\n- one\n- two\n\nbelow\n', true));
    await page.waitForTimeout(700);
    const two = await page.locator('.tiptap li', { hasText: 'two' }).boundingBox();
    await page.mouse.move(two.x + 20, two.y + two.height / 2);
    await page.waitForTimeout(120);
    const g2 = await page.locator('.block-handle.on .grip').boundingBox();
    const below = await page.locator('.tiptap > p', { hasText: 'below' }).boundingBox();
    await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(g2.x + g2.width / 2 + i, g2.y + ((below.y + below.height * 0.8 - g2.y) * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const out = (await page.evaluate(() => window.__editor.storage.markdown.getMarkdown())).trimEnd();
    assert.equal(out, '# Drag\n\n- one\n\nbelow\n\n- two', `a list's line dragged out of its list goes there (${errors.join('; ')})`);
    console.log('ok   a list\'s line dragged out of its list goes there, a list of its own');
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

  // a day's page from the calendar (a page over the note, its ⋮⋮ in the room around its editor): reached, and dragged
  {
    const day = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await day.addInitScript(() => localStorage.setItem('eve.appearance', JSON.stringify({ dailyNotes: true })));
    await day.goto(URL_);
    await day.waitForSelector('.tiptap');
    await day.locator('aside [data-row]', { hasText: 'Daily notes' }).first().click();
    await day.locator('.day.today').click();
    await day.waitForSelector('.card-page .tiptap');
    await day.waitForTimeout(400);
    await day.evaluate(() => document.querySelector('.card-page .tiptap').editor.commands.setContent('# A day\n\nfirst line\n\nsecond line\n\n- a bullet\n\n> quoted\n', true));
    await day.waitForTimeout(700);
    for (const sel of ['p:nth-child(2)', 'p:nth-child(3)', 'ul', 'blockquote']) {
      const b = await day.locator(`.card-page .tiptap > ${sel}`).boundingBox();
      await walkTo(day, '.card-page', b.x + 30, b.y + Math.min(10, b.height / 2));
    }
    // taken, and moved: the first line dragged below the second
    const g = await walkTo(day, '.card-page', (await day.locator('.card-page .tiptap > p', { hasText: 'first line' }).boundingBox()).x + 30, (await day.locator('.card-page .tiptap > p', { hasText: 'first line' }).boundingBox()).y + 10);
    const to = await day.locator('.card-page .tiptap > p', { hasText: 'second line' }).boundingBox();
    await day.mouse.down();
    for (let i = 1; i <= 8; i++) await day.mouse.move(g.x + g.width / 2 + i, g.y + ((to.y + to.height * 0.8 - g.y) * i) / 8);
    await day.waitForTimeout(150);
    await day.mouse.up();
    await day.waitForTimeout(300);
    const order = await day.evaluate(() => [...document.querySelectorAll('.card-page .tiptap > p')].map((p) => p.textContent).filter(Boolean));
    assert.deepEqual(order.slice(-2), ['second line', 'first line'], `a day's page: a line dragged by its ⋮⋮ moves (${JSON.stringify(order)})`);
    await day.close();
    console.log('ok   a day\'s page: ⋮⋮ stays as the pointer goes to it, and a line dragged by it moves');
  }
} finally {
  await browser.close();
  await server?.close();
}
