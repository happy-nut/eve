// Diagrams edited in the note itself (DiagramBlock.svelte): `/flowchart` puts one in and opens it; a box is typed in
// where it is drawn, its + adds a step or, dragged onto another box, joins them; a line's bar styles it; a click
// elsewhere is done, and the note keeps mermaid code; ⌘Z undoes into the drawing. A pie's parts are rows under it.
// A diagram written by hand with more than these show opens as its code. ⤢ puts the block on the whole screen, where
// it zooms, pans and is edited as in the note.
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
  assert.equal(await page.locator('.tiptap input.rename').count(), 0, 'a click picks the box: no typing yet');
  await page.locator('.layer .bar button[aria-label="Edit the text"]').click(); // ✎ Text in its bar: typed in
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

  // ⤢: the block itself on the whole screen, zoomed, panned and edited there
  await page.locator('.tiptap .dblock .pic').hover();
  await page.locator('.tiptap .mermaid-expand').click();
  await page.waitForSelector('.dblock.full .mermaid-view svg');
  const fullBox = await page.locator('.dblock.full').boundingBox();
  assert.ok(fullBox.width >= 1190 && fullBox.height >= 890, 'it fills the window');
  const svgW = () => page.locator('.dblock.full .mermaid-view svg').evaluate((s) => s.getBoundingClientRect().width);
  const w0 = await svgW();
  await page.locator('.zoombar button[aria-label="Zoom in"]').click();
  assert.ok((await svgW()) > w0 * 1.2, 'zoom in draws it larger');
  await page.keyboard.press('-');
  assert.ok(Math.abs((await svgW()) - w0) < 2, '− zooms back out');
  at = await boxAt(page, 'Write');
  await page.mouse.click(at.x, at.y); // opens the editor on the whole screen, the box picked
  await page.waitForSelector('.dblock.full.active');
  await page.locator('.layer .bar button[aria-label="Edit the text"]').click();
  await page.waitForSelector('.tiptap input.rename');
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Big edit');
  await page.keyboard.press('Enter');
  await settle(page);
  assert.ok((await md(page)).includes('Big edit'), 'an edit on the whole screen is written into the note');
  await page.keyboard.press('Escape'); // lets go of the box
  await page.keyboard.press('Escape'); // done editing
  await page.waitForSelector('.dblock.full:not(.active)');
  // a drag on the empty canvas pans it (zoomed in, so there is somewhere to go)
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  const canvasBox = await page.locator('.dblock.full .mermaid-view').boundingBox();
  const scrolled = () => page.locator('.dblock.full .mermaid-view').evaluate((c) => c.scrollLeft + c.scrollTop);
  const s0 = await scrolled();
  await page.mouse.move(canvasBox.x + 30, canvasBox.y + canvasBox.height - 80);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 230, canvasBox.y + canvasBox.height - 280, { steps: 8 });
  await page.mouse.up();
  assert.ok((await scrolled()) !== s0, 'dragging the empty canvas pans it');
  assert.equal(await page.locator('.dblock.full.active').count(), 0, 'the drag that panned did not open the editor');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.dblock.full'));
  const back = await page.locator('.tiptap .mermaid-view svg').evaluate((s) => s.getBoundingClientRect().width);
  assert.ok(back < 1200, 'back in the note at its own size');
  console.log('ok   full screen: zoom, pan, edit');
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
  await page.locator('aside input').first().focus();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  await settle(page);
  assert.ok((await md(page)).includes(one), 'keys typed elsewhere leave the diagram alone');
  // ⌘Z with the keyboard on nothing (after a box is deleted) undoes into the diagram
  const canvas = await page.locator('.tiptap .mermaid-view').boundingBox();
  await page.mouse.click(canvas.x + 8, canvas.y + 8); // empty space: nothing picked
  at = await boxAt(page, 'One');
  await page.mouse.click(at.x, at.y);
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
  await page.mouse.click(at.x, at.y); // a second click: typed in
  await page.keyboard.type('Z');
  await page.evaluate(() => { const e = window.__editor; e.commands.setContent(e.storage.markdown.getMarkdown().replace('"One"', '"Remote"')); });
  await settle(page);
  assert.ok((await md(page)).includes('"Remote"'), 'what came from elsewhere is not written over');
  console.log('ok   keys and clicks elsewhere, Esc, ⌘Z, a sync meanwhile');

  // ---- a line: picked and deleted with ⌫ (not the note's text); a step put in it; that step deleted, rejoined ----
  page = await open('# Line\n\n```mermaid\nflowchart LR\n  n1("One")\n  n2("Two")\n  n1 --> n2\n```\n\nText after.\n');
  await page.waitForSelector('.tiptap .mermaid-view svg');
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.tiptap .dblock.active');
  const mid = () => page.evaluate(() => {
    const p = document.querySelector('.tiptap .mermaid-view path.hit');
    const m = p.getPointAtLength(p.getTotalLength() / 2), c = p.getScreenCTM();
    return { x: m.x * c.a + m.y * c.c + c.e, y: m.x * c.b + m.y * c.d + c.f };
  });
  let m = await mid();
  await page.mouse.click(m.x, m.y);
  await page.waitForSelector('.layer .bar button[aria-label="Put a step in this line"]');
  await page.keyboard.press('Backspace');
  await settle(page);
  text = await md(page);
  assert.ok(!text.includes('n1 --> n2') && text.includes('Text after.') && text.includes('# Line'), 'the line gone, the note untouched: ' + text);
  await page.keyboard.press('Control+z');
  await settle(page);
  assert.ok((await md(page)).includes('n1 --> n2'), 'undo brings the line back');
  m = await mid();
  await page.mouse.click(m.x, m.y);
  await page.locator('.layer .bar button[aria-label="Put a step in this line"]').click();
  await page.waitForSelector('.tiptap input.rename');
  await page.keyboard.type('Middle');
  await page.keyboard.press('Enter');
  await settle(page);
  text = await md(page);
  const id = text.match(/\n  (\w+)\("Middle"\)/)?.[1];
  assert.ok(id && text.includes(`n1 --> ${id}`) && text.includes(`${id} --> n2`), 'a step in the middle of the line: ' + text);
  const cv = await page.locator('.tiptap .mermaid-view').boundingBox();
  await page.mouse.click(cv.x + 8, cv.y + 8); // nothing picked
  at = await boxAt(page, 'Middle');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Backspace');
  await settle(page);
  text = await md(page);
  assert.ok(!text.includes('Middle') && text.includes('n1 --> n2'), 'the step deleted, its two lines one again: ' + text);
  console.log('ok   a line: ⌫ deletes it, not the note; a step put in it; deleted, the line rejoins');
  await page.close();
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
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.tiptap input.rename').count(), 0, 'a tap picks the box: no keyboard');
    await page.touchscreen.tap(c.x, c.y); // a second tap: typed in
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
    await page.waitForSelector('.layer .plus');
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

  // ---- a phone, swimlanes: the picked box dragged by a finger onto another lane; one not picked scrolls instead ----
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
    page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('eve.notes.a', '---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n# L\n\n```mermaid\nflowchart TD\n  subgraph L1["Customer"]\n    direction TD\n    a("Order")\n  end\n  subgraph L2["Store"]\n    direction TD\n    b("Pack")\n  end\n  a --> b\n```\n'); localStorage.setItem('eve.lastNote', 'a'); });
    await page.goto(URL_);
    await page.waitForSelector('.tiptap svg.lanes');
    await page.locator('.tiptap .mermaid-view').tap();
    await page.waitForSelector('.tiptap .dblock.active');
    const mid = async (sel, text) => { const b = await page.locator(sel, text ? { hasText: text } : {}).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1 }];
    const swipe = async (a, b) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a.x, a.y) });
      for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settle(page);
    };
    const store = await page.locator('.tiptap svg.lanes g.lane[data-lane="L2"] rect.lane-bg').boundingBox();
    const into = { x: store.x + store.width / 2, y: store.y + store.height - 16 };
    let c = await mid('.tiptap svg.lanes g.node', 'Order');
    await swipe(c, into); // not picked: no move
    assert.match(await md(page), /subgraph L1\["Customer"\]\n {4}direction TD\n {4}a\("Order"\)/, 'a box not picked stays in its lane');
    c = await mid('.tiptap svg.lanes g.node', 'Order');
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForSelector('.layer .bar');
    await swipe(c, into);
    assert.match(await md(page), /subgraph L2\["Store"\]\n {4}direction TD\n {4}a\("Order"\)\n {4}b\("Pack"\)/, 'the picked box dragged into Store');
    assert.equal(await page.locator('.tiptap input.rename').count(), 0, 'no typing started by the drag');
    console.log('ok   phone: the picked box dragged by a finger onto another lane');
    await ctx.close();
  }

  // ---- swimlanes: drawn as lanes, a box moved to another lane, a lane renamed, one added, a step added in it ----
  page = await open('# Process\n\nx\n');
  await slash(page, 'swimlanes');
  await page.waitForSelector('.tiptap .dblock.active svg.lanes');
  assert.equal(await page.locator('.tiptap svg.lanes g.lane').count(), 3, 'three lanes');
  const laneBox = async (label) => { const b = await page.locator('.tiptap svg.lanes g.node', { hasText: label }).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  at = await laneBox('Pack');
  await page.mouse.click(at.x, at.y);
  await page.locator('.layer .bar button[aria-label="Lane"]').click();
  await page.locator('.menu button[role="menuitem"]', { hasText: 'Delivery' }).click();
  await settle(page);
  assert.match(await md(page), /subgraph L3\["Delivery"\]\n {4}direction TD\n {4}n4\("Pack"\)\n {4}n5\("Ship"\)\n {2}end/, 'Pack moved to Delivery');
  const head = await page.locator('.tiptap svg.lanes g.lane-head').nth(1).boundingBox();
  await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2);
  await page.locator('.layer .bar button[aria-label="Rename the lane"]').click();
  await page.keyboard.type('Warehouse');
  await page.keyboard.press('Enter');
  await page.locator('.tiptap .dblock .tools button', { hasText: '+ Lane' }).click();
  await page.waitForSelector('.layer input.lane-name');
  await page.keyboard.type('Billing');
  await page.keyboard.press('Enter');
  await settle(page);
  // the new lane is still picked: its bar is up
  await page.locator('.layer .bar button[aria-label="Add a step in this lane"]').click();
  await page.waitForSelector('.tiptap input.rename');
  await page.keyboard.type('Invoice');
  await page.keyboard.press('Enter');
  await settle(page);
  text = await md(page);
  assert.match(text, /subgraph L2\["Warehouse"\]/, 'the lane renamed');
  assert.match(text, /subgraph L4\["Billing"\]\n {4}direction TD\n {4}n7\("Invoice"\)\n {2}end/, 'a lane added, a step in it');
  assert.equal(await page.locator('.tiptap svg.lanes g.lane').count(), 4);
  console.log('ok   swimlanes: lanes drawn; a box moved, a lane renamed, added, a step in it');

  // a box dragged onto another lane goes into it; the arrows go from box to box
  at = await laneBox('Invoice');
  const lane1 = await page.locator('.tiptap svg.lanes g.lane[data-lane="L1"] rect.lane-bg').boundingBox();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 20, at.y + 10, { steps: 3 });
  await page.mouse.move(lane1.x + lane1.width / 2, lane1.y + lane1.height - 20, { steps: 8 });
  assert.equal(await page.locator('.layer .lane-drop').count(), 1, 'the lane under it shown');
  await page.mouse.up();
  await settle(page);
  const laneOf = (t, id) => t.match(new RegExp(`subgraph ${id}\\[[^\\n]*\\n([\\s\\S]*?)\\n  end`))?.[1] ?? '';
  text = await md(page);
  assert.match(laneOf(text, 'L1'), /n7\("Invoice"\)/, 'Invoice dragged into Customer');
  assert.doesNotMatch(laneOf(text, 'L4'), /n7/, 'and out of Billing');
  assert.equal(await page.locator('.layer .ring').count(), 1, 'it stays picked');
  const picked = async () => page.evaluate(() => { const r = document.querySelector('.layer .ring').getBoundingClientRect(); const g = [...document.querySelectorAll('.tiptap svg.lanes g.node')].find((n) => { const b = n.getBoundingClientRect(); return Math.abs(b.left - r.left - 4) < 3 && Math.abs(b.top - r.top - 4) < 3; }); return g?.textContent.trim(); });
  const was = await picked();
  await page.keyboard.press('ArrowDown');
  const now = await picked();
  assert.ok(now && now !== was, `↓ picks another box (${was} → ${now})`);
  console.log('ok   swimlanes: a box dragged onto another lane; the arrows go from box to box');
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
  // Enter: the next row's field, then, in the last, a row more; a value as the note keeps it
  await page.locator('.tiptap .p-slice input.label').first().press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelectorAll('.tiptap .p-slice input.label')[1]), true, 'Enter: on to the next part');
  const parts = await page.locator('.tiptap .p-slice').count();
  await page.locator('.tiptap .p-slice input.label').last().press('Enter');
  assert.equal(await page.locator('.tiptap .p-slice').count(), parts + 1, 'Enter in the last: a part more');
  await page.locator('.tiptap .p-slice input.num').first().fill('-30');
  await page.locator('.tiptap .p-slice input.label').first().click();
  assert.equal(await page.locator('.tiptap .p-slice input.num').first().inputValue(), '0', 'the field shows what the note keeps');
  console.log('ok   pie: its rows in the note; Enter goes on, a row more; a value as the note keeps it');
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
  page = await open('# Plan\n\n```mermaid\nflowchart LR\n  A --> B\n  style A fill:#f9f\n```\n');
  await page.waitForSelector('.tiptap .mermaid-view svg');
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.tiptap .code-block.editing');
  assert.equal(await page.locator('.tiptap .dblock.active').count(), 0);
  assert.match(await page.locator('.tiptap .codebar').textContent(), /style A fill:#f9f.*can't show/s, 'it says why: the line it cannot show');
  await page.locator('.tiptap .codebar .done').click();
  await page.waitForFunction(() => !document.querySelector('.tiptap .code-block.editing'));
  console.log('ok   hand-written: opens as code, saying why; Done leaves it');
  await page.close();

  // ---- readable, its code shown: back to the drawing by a button or ⌘↵ ----
  page = await open('# Plan\n\nAbove\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
  await page.waitForSelector('.tiptap .mermaid-view svg');
  await page.locator('.tiptap .mermaid-view').click();
  await page.locator('.tiptap .dblock .tools button', { hasText: 'Code' }).click();
  await page.waitForSelector('.tiptap .code-block.editing');
  await page.locator('.tiptap .codebar button', { hasText: 'Edit as drawing' }).click();
  await page.waitForSelector('.tiptap .dblock.active');
  assert.equal(await page.locator('.tiptap .code-block.editing').count(), 0, 'the code gone, the drawing open');
  await page.keyboard.press('Escape');
  // the caret into "Above": a click straight after Esc can land as the note puts its caret back where it was, and is
  // undone by that, so it is clicked until the caret is there
  const inAbove = () => page.evaluate(() => window.__editor.state.selection.$from.parent.textContent === 'Above');
  for (let i = 0; i < 5 && !(await inAbove()); i++) { await page.locator('.tiptap p', { hasText: 'Above' }).click(); await page.waitForTimeout(150); }
  assert.ok(await inAbove(), 'the caret in the line above the diagram');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown'); // into its code, by the keyboard
  await page.waitForSelector('.tiptap .code-block.editing');
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('.tiptap .dblock.active');
  console.log('ok   its code shown: "Edit as drawing" or ⌘↵ opens the drawing');
  await page.close();

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
