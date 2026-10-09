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

  // ---- keys and clicks meant for something else (found in the bug hunt) ----
  page = await open('# Keys\n\nAbove.\n\n```mermaid\nflowchart LR\n  n1("One")\n  n2("Two")\n  n1 --> n2\n```\n\n- [ ] a task below\n');
  await page.waitForSelector('.tiptap .mermaid-view svg');
  const one = '```mermaid\nflowchart LR\n  n1("One")\n  n2("Two")\n  n1 --> n2\n```';
  // Esc right after opening it (the keyboard still in the note's text) lets go of it
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.tiptap .dblock.active');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tiptap .dblock.active').count(), 0, 'Esc lets go of the diagram');
  // a box selected, then keys typed in the list's search: the box is not deleted
  await page.locator('.tiptap .mermaid-view').click();
  at = await boxAt(page, 'One');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await page.locator('aside input').first().focus();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  await settle(page);
  assert.ok((await md(page)).includes(one), 'keys typed elsewhere leave the diagram alone');
  // ⌘Z with the keyboard on nothing (after a box is deleted) undoes into the diagram
  at = await boxAt(page, 'One');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await settle(page);
  assert.ok(!(await md(page)).includes('One'), 'the box deleted');
  await page.keyboard.press('Control+z');
  await settle(page);
  assert.ok((await md(page)).includes('"One"'), 'undo brings it back');
  // with it open, a click on the task under it toggles the task (the tools folding away moved it from under the press)
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.tiptap .dblock.active');
  await page.locator('.tiptap ul[data-type="taskList"] input[type="checkbox"]').click();
  await settle(page);
  assert.match(await md(page), /- \[x\] a task below/, 'the click lands on the task');
  // a change waiting to be written is dropped when the note changes it first (a sync)
  await page.locator('.tiptap .mermaid-view').click();
  at = await boxAt(page, 'Two');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type('Z');
  await page.evaluate(() => { const e = window.__editor; e.commands.setContent(e.storage.markdown.getMarkdown().replace('"One"', '"Remote"')); });
  await settle(page);
  assert.ok((await md(page)).includes('"Remote"'), 'what came from elsewhere is not written over');
  console.log('ok   keys and clicks elsewhere, Esc, ⌘Z, a sync meanwhile');
  await page.close();

  // ---- a phone: two boxes joined by taps (Connect, then the other box), and by dragging the + with a finger ----
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
    page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('eve.notes.a', '---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n# F\n\n```mermaid\nflowchart TD\n  n1(["Start"])\n  n2("Middle")\n  n3(["Done"])\n  n1 --> n2\n```\n'); localStorage.setItem('eve.lastNote', 'a'); });
    await page.goto(URL_);
    await page.waitForSelector('.tiptap .mermaid-view svg');
    const mid = async (sel, text) => { const b = await page.locator(sel, text ? { hasText: text } : {}).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    await page.locator('.tiptap .mermaid-view').tap();
    await page.waitForSelector('.tiptap .dblock.active');
    let c = await mid('.tiptap .mermaid-view g.node', 'Middle');
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForSelector('.tiptap input.rename');
    assert.equal(await page.locator('.layer .plus').count(), 1, 'the box being typed in has its + too');
    await page.locator('.layer .bar button[aria-label="Connect to another box"]').tap();
    await page.waitForSelector('.layer .pickhint');
    c = await mid('.tiptap .mermaid-view g.node', 'Done');
    await page.touchscreen.tap(c.x, c.y);
    await settle(page);
    assert.match(await md(page), /n2 --> n3/, 'joined by taps');
    // Start, at the top: its bar opens under it, below its + (it sat over the +, and a press there changed the shape)
    c = await mid('.tiptap .mermaid-view g.node', 'Start');
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForSelector('.tiptap input.rename');
    const plus = await mid('.layer .plus');
    const to = await mid('.tiptap .mermaid-view g.node', 'Done');
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(plus.x, plus.y) });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(plus.x + ((to.x - plus.x) * i) / 10, plus.y + ((to.y - plus.y) * i) / 10) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(page);
    const text = await md(page);
    assert.match(text, /n1 --> n3/, 'joined by dragging the + with a finger');
    assert.match(text, /n1\(\["Start"\]\)/, 'its shape untouched');
    console.log('ok   phone: joined by Connect and a tap, and by dragging the +');
    await ctx.close();
  }

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

  // ---- a Gantt chart's date emptied: the last one stays ----
  page = await open('# G\n\nx\n');
  await slash(page, 'gantt');
  await page.waitForSelector('.tiptap .dblock.active .g-task');
  await page.locator('.tiptap .g-task input.date').first().fill('');
  await page.locator('.tiptap .g-phase .add').first().click();
  await settle(page);
  assert.doesNotMatch(await md(page), /: , |NaN/, 'no task without a date');
  console.log('ok   gantt: an emptied date keeps the last one');
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
