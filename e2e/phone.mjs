// A phone (an Android user agent): the formatting bar over the keyboard, a board, the swipe that brings the list in,
// the back key, and tables. Each part is a bug once found by hand on a phone.
// Chromium: CHROMIUM_PATH=/path/to/chromium, else Playwright's own. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:phone
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
