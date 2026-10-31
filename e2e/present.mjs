// A note presented (⋯ → Present), in WebKit: a slide at each of its biggest headings, one longer than the screen
// cut onto the next under its heading again (and cut again as the window changes size), no slide scrolled, the text a size up and clear of
// the window's edges; a flowchart that draws itself walked a box a press, the lines into a box with it, before → turns
// the page; ← the same way back; a divider no place to cut; Esc gives the note back.
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
  const total = () => count().then((c) => Number(c.split(' / ')[1]));
  assert.equal(v.h, 'Talk'); assert.equal(await count(), `1 / ${await total()}`);
  assert.ok(await total() >= 5, `the long section cut onto slides of its own (${await count()})`);
  assert.ok(v.size > 22, `the text a size up (${v.size}px)`);
  assert.ok(v.box[0] > 0 && v.box[1] > 0 && v.box[2] < 1280 && v.box[3] < 800, `the slide inside the window (${v.box})`);
  assert.ok(v.box[2] - v.box[0] > 0.85 * 1280, `the slide the window's width, as a slide is (${v.box})`);
  await page.screenshot({ path: 'e2e/out/present-1.png' });

  // the page turns: the slide leaving drawn going while the next comes in, then gone, the new one still and whole
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(110);
  const mid = await page.evaluate(() => ({ leaving: document.querySelectorAll('.present .leaving').length, t: getComputedStyle(document.querySelector('.present .slide')).transform }));
  await page.screenshot({ path: 'e2e/out/present-turn.png' });
  assert.equal(mid.leaving, 1, 'the slide that was up drawn leaving');
  assert.notEqual(mid.t, 'none', 'the next one on its way in');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => { const s = document.querySelector('.present .slide'); return { leaving: document.querySelectorAll('.present .leaving').length, t: getComputedStyle(s).transform, o: [...s.children].map((b) => getComputedStyle(b).opacity) }; });
  assert.equal(after.leaving, 0, 'the leaving copy gone');
  assert.ok(after.t === 'none' && after.o.every((o) => o === '1'), `the slide still and whole (${after.t}, ${after.o})`);
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

  // the long section: slide after slide, each under its heading, none scrolled, the divider not a cut
  const seen = [];
  for (let i = 0; i < 12 && !(await page.textContent('.present .slide')).includes('The end.'); i++) {
    await press('ArrowRight');
    v = await look();
    assert.equal(v.h, 'Long'); assert.ok(!v.tall, `slide ${await count()} fits the screen`);
    seen.push(await page.evaluate(() => [...document.querySelectorAll('.present .slide p')].map((p) => p.textContent)));
  }
  assert.equal(await count(), `${await total()} / ${await total()}`);
  assert.ok(seen.at(-1).includes('Line 39') || seen.at(-1)[0] === 'The end.', 'the end with the lines before it, or right after them');
  assert.deepEqual(seen.flat().filter((t) => t.startsWith('Line')), Array.from({ length: 40 }, (_, i) => `Line ${i}`), 'every line once, in order');
  await page.screenshot({ path: 'e2e/out/present-3.png' });

  // a narrower window, its words smaller: cut again, and still on the words that were up
  await press('ArrowLeft');
  const first = await page.textContent('.present .slide p');
  const before = await total();
  await page.setViewportSize({ width: 700, height: 800 });
  await page.waitForTimeout(800);
  assert.ok((await total()) !== before, `cut again for a narrower window (${before} → ${await total()})`);
  assert.ok((await page.textContent('.present .slide')).includes(first), `still on "${first}"`);
  assert.ok(!(await look()).tall);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(800);

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
  console.log('ok   a note presented: slides at its headings, a long section cut to the screen (and again for a smaller window), a flowchart a step a press, back into the note');
} finally {
  await browser.close();
  await server?.close();
}
