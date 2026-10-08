// Diagrams edited in the note itself (DiagramBlock.svelte): `/flowchart` puts one in and opens it; a box is typed in
// where it is drawn, its + adds a step or, dragged onto another box, joins them; a line's bar styles it; a click
// elsewhere is done, and the note keeps mermaid code; ⌘Z undoes into the drawing. A pie's parts are rows under it.
// A diagram written by hand with more than these show opens as its code. ⤢ opens one full screen.
// Chromium: CHROMIUM_PATH=/path/to/chromium, else Playwright's own. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:diagrams
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function open(body) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); }, body);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap p');
  return page;
}
const md = (page) => page.evaluate(() => window.__editor.storage.markdown.getMarkdown());
const settle = (page) => page.waitForTimeout(700); // drawn, and written into the note
async function slash(page, item) {
  await page.locator('.tiptap > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/' + item);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
}
const boxAt = async (page, label) => {
  const b = await page.locator('.tiptap .mermaid-view g.node', { hasText: label }).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

try {
  // ---- a flowchart, drawn by hand in the note ----
  let page = await open('# Plan\n\nHow a note gets out.\n');
  await slash(page, 'flowchart');
  await page.waitForSelector('.tiptap .dblock.active .mermaid-view svg');
  assert.equal(await page.locator('.builder').count(), 0, 'no panel: it opens in the note');
  let at = await boxAt(page, 'Start');
  await page.mouse.click(at.x, at.y);
  await page.waitForSelector('.tiptap input.rename');
  await page.keyboard.type('Draft');
  await settle(page);
  assert.equal(await page.locator('.tiptap .mermaid-view g.node', { hasText: 'Draft' }).count(), 1, 'the box shows the text as it is typed');
  await page.keyboard.press('Enter');
  await page.locator('.layer .plus').first().click();
  await page.waitForSelector('.tiptap input.rename');
  await page.keyboard.type('Write');
  await page.keyboard.press('Enter');
  await settle(page);
  at = await boxAt(page, 'Write');
  await page.mouse.move(at.x, at.y);
  const plus = await page.locator('.layer .plus').last().boundingBox();
  const done = await boxAt(page, 'Done');
  await page.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2);
  await page.mouse.down();
  await page.mouse.move(done.x, done.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('.layer .bar .edge-label');
  await page.locator('.layer .bar button[aria-label="Dotted"]').click();
  await page.locator('.layer .bar .edge-label').fill('later');
  await page.keyboard.press('Escape');
  await settle(page);
  at = await boxAt(page, 'Write');
  await page.mouse.click(at.x, at.y);
  await page.locator('.layer .bar button[aria-label="Database"]').click();
  await page.keyboard.press('Enter');
  await page.locator('.tiptap h1').click(); // elsewhere in the note: done
  await settle(page);
  assert.equal(await page.locator('.tiptap .dblock.active').count(), 0, 'a click elsewhere is done with it');
  let text = await md(page);
  assert.match(text, /n1\(\["Draft"\]\)/, 'the box typed in');
  assert.match(text, /n4\[\("Write"\)\]/, 'the new step, as a database');
  assert.match(text, /n1 --> n4\n/, 'joined after the box whose + made it');
  assert.match(text, /n4 -\.->\|"later"\| n3/, 'the line dragged onto Done, dotted, labelled');
  console.log('ok   flowchart: typed in its boxes, + and drag, the bars; the note keeps the code');

  await page.locator('.tiptap p').first().click();
  await page.keyboard.press('Control+z');
  await settle(page);
  assert.ok((await md(page)) !== text, 'undo reaches the diagram');
  await page.keyboard.press('Control+Shift+z');
  await settle(page);
  console.log('ok   undo: into the drawing');

  // ⤢: full screen
  await page.locator('.tiptap .dblock .pic').hover();
  await page.locator('.tiptap .mermaid-expand').click();
  await page.waitForSelector('.viewer svg');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.viewer'));
  console.log('ok   full screen');
  await page.close();

  // ---- a pie: its parts as rows under it, in the note ----
  page = await open('# Week\n\nx\n');
  await slash(page, 'pie');
  await page.waitForSelector('.tiptap .dblock.active .p-slice');
  await page.locator('.tiptap .p-slice input.label').first().fill('Writing <b>&');
  await page.locator('.tiptap .p-slice input.num').first().fill('70');
  await settle(page);
  assert.equal(await page.locator('.tiptap .chart-pie .lbl').first().textContent(), 'Writing <b>&', 'a label is text, not markup');
  assert.match(await md(page), /pie\n {2}"Writing <b>&" : 70\n/);
  console.log('ok   pie: its rows in the note');
  await page.close();

  // ---- written by hand, readable: left exactly as written until it is changed ----
  page = await open('# Plan\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForSelector('.tiptap .mermaid-view svg');
  await page.waitForTimeout(1200);
  assert.match(await md(page), /```mermaid\nflowchart LR\n {2}A --> B\n```/, 'opening the note changes nothing');
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.tiptap .dblock.active');
  await page.locator('.tiptap .dblock .tools .done').click();
  await settle(page);
  assert.match(await md(page), /```mermaid\nflowchart LR\n {2}A --> B\n```/, 'nor opening it for editing and closing it');
  console.log('ok   hand-written, readable: untouched until changed');
  await page.close();

  // ---- written by hand: opens as its code ----
  page = await open('# Plan\n\n```mermaid\nflowchart LR\n  subgraph one\n  A --> B\n  end\n```\n');
  await page.waitForSelector('.tiptap .mermaid-view svg');
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.tiptap .code-block.editing');
  assert.equal(await page.locator('.tiptap .dblock.active').count(), 0);
  console.log('ok   hand-written: opens as code');
  await page.close();

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
