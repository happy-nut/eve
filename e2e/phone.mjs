// A phone (an Android user agent): the formatting bar over the keyboard, a board, the swipe that brings the list in,
// the back key, and tables. Each part is a bug once found by hand on a phone.
// Chromium: CHROMIUM_PATH=/path/to/chromium, else Playwright's own. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:phone
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
// no swipe back a page of the test browser's own: a finger dragged to the right where nothing scrolls left the app
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--disable-features=OverscrollHistoryNavigation'] });
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const errors = [];
const note = (id, body, order = 0) => `---\nid: ${id}\nupdated: 1\ndeleted: false\norder: ${order}\n---\n${body}`;

// notes by id, the first one open; w × h the page, kbd() shrinks it as the keyboard does (MainActivity)
async function phone(notes, { w = 390, h = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, userAgent: UA });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((notes) => {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    localStorage.clear();
    for (const [id, t] of Object.entries(notes)) localStorage.setItem('eve.notes.' + id, t);
    localStorage.setItem('eve.lastNote', Object.keys(notes)[0]);
  }, Object.fromEntries(Object.entries(notes).map(([id, body], i) => [id, note(id, body, i)])));
  await page.goto(URL_);
  await page.waitForSelector('.tiptap');
  await page.waitForTimeout(500);
  page.kbd = async (on) => { await page.setViewportSize({ width: w, height: on ? h - 300 : h }); await page.waitForTimeout(250); };
  page.close = () => ctx.close();
  return page;
}
const bar = (page) => page.evaluate(() => !!document.querySelector('.mbar'));
// a finger dragged to the right from (x, y), quickly, as a swipe is
async function swipeRight(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 22, y }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}
const listShown = (page) => page.evaluate(() => !!document.querySelector('aside'));
const body = (page, id = 'a') => page.evaluate((id) => localStorage.getItem('eve.notes.' + id).split('---\n').pop(), id);

try {
  // ---- the formatting bar is the note's text only: not a board's column being renamed, nor a picture's caption ----
  {
    const board = JSON.stringify({ columns: [{ title: 'To do', cards: ['Card one'] }, { title: 'Done', cards: [] }] });
    const page = await phone({ a: '# Board\n\nintro line\n\n```kanban\n' + board + '\n```\n\nend\n' });
    await page.locator('.kb-head', { hasText: 'To do' }).tap();
    await page.waitForSelector('.kb-rename');
    await page.kbd(true);
    assert.equal(await bar(page), false, 'no formatting bar while a column is renamed');
    await page.kbd(false);
    await page.locator('.tiptap p', { hasText: 'end' }).tap(); // done renaming
    await page.locator('.tiptap p', { hasText: 'intro line' }).tap();
    await page.kbd(true);
    assert.equal(await bar(page), true, 'the bar is there for the note\'s own text');
    await page.close();
  }
  {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC';
    const page = await phone({ a: `# Pic\n\nintro line\n\n![](${png})\n\nend\n` });
    await page.locator('.img-cap').tap();
    await page.waitForTimeout(200);
    await page.kbd(true);
    assert.equal(await bar(page), false, 'no formatting bar while a caption is written');
    await page.close();
  }
  console.log('ok   the formatting bar only for the note\'s own text');

  // ---- a board: the column's × is seen before it takes a tap; a card is deleted from its page ----
  {
    const board = JSON.stringify({ columns: [{ title: 'Doing', cards: [] }, { title: 'To do', cards: ['Card one', 'Card two'] }] });
    const page = await phone({ a: '# Board\n\n```kanban\n' + board + '\n```\n\nend\n' });
    const del = await page.locator('.kb-del').first().evaluate((b) => { const r = b.getBoundingClientRect(); return { opacity: +getComputedStyle(b).opacity, w: r.width, h: r.height }; });
    assert.ok(del.opacity === 1 && del.w >= 40 && del.h >= 40, `the column's × is shown, finger-sized (${JSON.stringify(del)})`);
    await page.locator('.kb-card', { hasText: 'Card one' }).tap();
    await page.waitForSelector('.card-page .cdel');
    await page.locator('.card-page .cdel').tap();
    await page.locator('.box button.danger').tap();
    await page.waitForFunction(() => !document.querySelector('.card-page'));
    await page.waitForTimeout(400);
    const b = await body(page);
    assert.ok(!b.includes('Card one') && b.includes('Card two'), 'the card is deleted from its page');
    await page.close();
  }
  console.log('ok   a board on a phone: the column × shown, a card deleted from its page');

  // ---- Android's back to the list (focus left where it was, as the native key does): nothing of the note's over it ----
  {
    const page = await phone({ a: '# Groceries\n\nmilk\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', b: '# Other' });
    await page.locator('.tiptap p', { hasText: 'milk' }).tap();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.waitForSelector('.suggest');
    await page.evaluate(() => document.querySelector('.mback').click()); // what the native key runs: phoneBack()
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.suggest').count(), 0, 'the / menu is gone with the note');
    await page.close();
  }
  {
    const page = await phone({ a: '# Plans\n\n| a | b |\n|---|---|\n| 1 | 2 |\n', b: '# Other' });
    await page.locator('.tiptap td').first().tap();
    await page.waitForSelector('.tbl-tools');
    await page.evaluate(() => document.querySelector('.mback').click());
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.tbl-tools').count(), 0, 'the table\'s tools are gone with the note');
    await page.close();
  }
  console.log('ok   back to the list leaves nothing of the note over it');

  // ---- a swipe to the right brings the list in, but not while scrolling something wide back, nor over Find or a
  // diagram on the whole screen ----
  {
    const flow = '```mermaid\nflowchart LR\n' + Array.from({ length: 8 }, (_, i) => `  n${i}("Step number ${i}")`).join('\n') + '\n' + Array.from({ length: 7 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n') + '\n```\n';
    const tex = Array.from({ length: 30 }, (_, i) => `x_{${i}}^2`).join(' + ');
    const page = await phone({ a: '# Wide\n\nintro text\n\n' + flow + '\n$$\n' + tex + '\n$$\n\nafter\n', b: '# Other' });
    await page.waitForSelector('.tiptap .mermaid-view svg');
    await page.waitForSelector('.tiptap .math-block');
    for (const sel of ['.tiptap .mermaid-view', '.tiptap .math-block']) {
      await page.evaluate((sel) => { document.querySelector(sel).scrollLeft = 600; }, sel);
      const r = await page.locator(sel).boundingBox();
      await swipeRight(page, 60, r.y + r.height / 2);
      assert.equal(await listShown(page), false, `scrolling ${sel} back keeps the note`);
    }
    // the diagram on the whole screen: a finger to the right pans it
    await page.locator('.mermaid-expand').tap();
    await page.waitForSelector('.dblock.full .diagram-canvas');
    // zoomed in and panned along, so there is somewhere for the finger to pan it back to
    for (let i = 0; i < 6; i++) await page.locator('.zoombar button[aria-label="Zoom in"]').tap();
    await page.evaluate(() => { document.querySelector('.dblock.full .diagram-canvas').scrollLeft = 400; });
    await swipeRight(page, 60, 400);
    assert.equal(await listShown(page), false, 'a full-screen diagram keeps the swipe');
    await page.locator('.full-close').tap();
    await page.waitForFunction(() => !document.querySelector('.dblock.full'));
    const at = async () => { const r = await page.locator('.tiptap p', { hasText: 'intro text' }).boundingBox(); return r.y + r.height / 2; };
    await page.locator('.mhead button[aria-label="More"]').tap();
    await page.locator('button[role="menuitem"]', { hasText: 'Find & replace' }).tap();
    await page.waitForSelector('.find');
    await swipeRight(page, 30, await at());
    assert.equal(await listShown(page), false, 'no list under Find\'s bar');
    await page.evaluate(() => document.querySelector('.find button[aria-label="Close"]').click());
    await page.waitForFunction(() => !document.querySelector('.find'));
    await swipeRight(page, 30, await at());
    assert.equal(await listShown(page), true, 'a swipe on the text brings the list in');
    await page.close();
  }
  console.log('ok   the swipe to the list leaves wide things, Find and a full-screen diagram alone');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
