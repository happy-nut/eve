// A note presented (⋯ → Present), in WebKit: a slide at each of its biggest headings, the text a size up and clear of
// the window's edges; a flowchart that draws itself walked a box a press, the lines into a box with it, before → turns
// the page; ← the same way back; Esc gives the note back.
// Run: npm run e2e:present (starts its own dev server, or uses EVE_URL)
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
const BODY = '# Talk\n\nWhat this is about.\n\n## The flow\n\n```mermaid\nflowchart LR\n  A[Write] --> B[Sync]\n  B --> C[Read]\n```\n\n## Long\n\n' +
  Array.from({ length: 40 }, (_, i) => `Line ${i}`).join('\n\n') + '\n\n---\n\nThe end.\n';
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript((b) => { localStorage.clear(); localStorage.setItem('eve.notes.p', `---\nid: p\nupdated: 1\ndeleted: false\norder: 0\n---\n${b}`); }, BODY);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap .mermaid-view svg g.node');
  await page.waitForTimeout(3000); // the note's own diagram has drawn itself in
  await page.click('.note-more');
  await page.getByRole('menuitem', { name: 'Present' }).click();
  await page.waitForSelector('.present .slide h1');
  await page.waitForTimeout(300); // faded in, the menu gone
  const count = () => page.textContent('.present .count');
  const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(500); };
  const look = () => page.evaluate(() => {
    const s = document.querySelector('.present .slide'), r = s.getBoundingClientRect();
    const on = (sel) => [...s.querySelectorAll(sel)].filter((e) => getComputedStyle(e).opacity !== '0').length;
    return { h: s.querySelector('h1, h2')?.textContent, size: parseFloat(getComputedStyle(s).fontSize), box: [r.left, r.top, r.right, r.bottom], nodes: on('g.node'), lines: on('path.flowchart-link'), scrolled: s.scrollTop, tall: s.scrollHeight > s.clientHeight };
  });

  let v = await look();
  assert.equal(v.h, 'Talk'); assert.equal(await count(), '1 / 4');
  assert.ok(v.size > 22, `the text a size up (${v.size}px)`);
  assert.ok(v.box[0] > 0 && v.box[1] > 0 && v.box[2] < 1280 && v.box[3] < 800, `the slide inside the window (${v.box})`);
  await page.screenshot({ path: 'e2e/out/present-1.png' });

  await press('ArrowRight');
  v = await look();
  assert.deepEqual([v.h, v.nodes, v.lines], ['The flow', 1, 0], 'a flowchart starts with its first box only');
  await press('ArrowRight');
  v = await look();
  assert.deepEqual([v.nodes, v.lines], [2, 1], 'the next box, with the line into it');
  await page.screenshot({ path: 'e2e/out/present-2.png' });
  const big = await page.evaluate(() => document.querySelector('.present .slide svg').getBoundingClientRect().width);
  assert.ok(big > 700, `the diagram larger than in the note (${big}px wide)`);
  await press('Space');
  v = await look();
  assert.deepEqual([v.h, v.nodes, v.lines], ['The flow', 3, 2]);

  await press('ArrowRight');
  v = await look();
  assert.equal(v.h, 'Long'); assert.ok(v.tall, 'a slide longer than the screen');
  await press('ArrowRight');
  v = await look();
  assert.equal(v.h, 'Long'); assert.ok(v.scrolled > 100, 'scrolled through before the page turns');
  for (let i = 0; i < 6 && (await count()) !== '4 / 4'; i++) await press('ArrowRight');
  assert.equal(await count(), '4 / 4');
  assert.equal(await page.textContent('.present .slide'), 'The end.');

  await press('Home');
  await press('ArrowRight');
  await press('ArrowRight');
  await press('ArrowLeft');
  v = await look();
  assert.deepEqual([v.h, v.nodes], ['The flow', 1], '← takes a step back');
  await press('ArrowLeft');
  assert.equal((await look()).h, 'Talk');
  await press('ArrowRight');
  assert.deepEqual([(await look()).nodes], [1], 'come to again going forward, the flowchart starts over');

  await press('Escape');
  assert.equal(await page.locator('.present').count(), 0);
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('.tiptap')), 'the keyboard back in the note');
  // the note's own diagram is whole: the slides were copies
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.tiptap g.node')].filter((g) => getComputedStyle(g).opacity === '0').length), 0);
  console.log('ok   a note presented: slides at its headings, a flowchart a step a press, a long slide scrolled, back into the note');
} finally {
  await browser.close();
  await server?.close();
}
