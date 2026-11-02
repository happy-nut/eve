// A note presented (⋯ → Present), in WebKit: a slide at each of its biggest headings, one longer than the screen
// scrolled through a screen a press (not cut onto the next), the text a size up and clear of the window's edges; a flowchart that draws itself walked a box a press, the lines into a box with it, before → turns
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
  const look = () => page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))); // its lines all in
    const s = document.querySelector('.present .slide'), r = s.getBoundingClientRect();
    const on = (sel) => [...s.querySelectorAll(sel)].filter((e) => getComputedStyle(e).opacity !== '0').length;
    return { h: s.querySelector('h1, h2')?.textContent, size: parseFloat(getComputedStyle(s).fontSize), box: [r.left, r.top, r.right, r.bottom], nodes: on('g.node'), lines: on('path.flowchart-link'), scrolled: s.scrollTop, tall: s.scrollHeight > s.clientHeight };
  });

  let v = await look();
  const total = () => count().then((c) => Number(c.split(' / ')[1]));
  assert.equal(v.h, 'Talk'); assert.equal(await count(), `1 / ${await total()}`);
  assert.equal(await total(), 3, `a slide a section, the long one too (${await count()})`);
  assert.ok(v.size > 22, `the text a size up (${v.size}px)`);
  assert.ok(v.box[0] > 0 && v.box[1] > 0 && v.box[2] < 1280 && v.box[3] < 800, `the slide inside the window (${v.box})`);
  assert.ok(v.box[2] - v.box[0] > 0.85 * 1280, `the slide the window's width, as a slide is (${v.box})`);
  // the cover's title a cover's size, well over a heading's on the slides after it
  const cover = await page.evaluate(() => { const s = document.querySelector('.present .slide'); return parseFloat(getComputedStyle(s.querySelector('h1')).fontSize) / parseFloat(getComputedStyle(s).fontSize); });
  assert.ok(cover >= 2 && cover <= 2.4, `the cover's title a cover's, not a shout (${cover.toFixed(2)}× the slide's words)`);
  // the whole screen, from its button or F, and back
  const full = () => page.evaluate(() => !!document.fullscreenElement);
  await page.click('.present .whole');
  await page.waitForTimeout(400);
  assert.equal(await full(), true, 'its button puts it on the whole screen');
  assert.equal(await page.getAttribute('.present .whole', 'aria-label'), 'Exit full screen');
  await press('f');
  assert.equal(await full(), false, 'F takes it off the whole screen');
  assert.equal(await page.locator('.present').count(), 1, 'and the presentation goes on');
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
  const big = await page.evaluate(() => { const r = document.querySelector('.present .slide svg').getBoundingClientRect(); return [r.width, r.height]; });
  assert.ok(big[0] > 0.85 * 1280 || big[1] > 0.55 * 800, `the diagram as big as its slide holds it (${big.map(Math.round)})`);
  await press('Space');
  v = await look();
  assert.deepEqual([v.h, v.nodes, v.lines], ['The flow', 3, 2]);
  // a click on the drawing looks at it close up, about the point clicked; a drag moves around it; Esc back to the whole
  {
    const tf = () => page.evaluate(() => getComputedStyle(document.querySelector('.present .slide .mermaid-view > svg')).transform);
    const box = await page.locator('.present .slide g.node', { hasText: 'Sync' }).boundingBox();
    const was = await count();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    const z = await tf();
    assert.match(z, /^matrix\(2\.5, 0, 0, 2\.5,/, `a click on the diagram zooms it (${z})`);
    assert.equal(await count(), was, 'and turns no page');
    const after = await page.locator('.present .slide g.node', { hasText: 'Sync' }).boundingBox();
    assert.ok(Math.abs(after.x + after.width / 2 - (box.x + box.width / 2)) < 4, 'the box clicked stays under the pointer');
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(540, 350, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const moved = await tf();
    assert.notEqual(moved, z, 'a drag moves around it');
    assert.match(moved, /^matrix\(2\.5,/, 'and lets go still close up');
    await page.screenshot({ path: 'e2e/out/present-zoom.png' });
    await press('Escape');
    assert.equal(await tf(), 'none', 'Esc: the whole diagram again');
    assert.equal(await page.locator('.present').count(), 1, 'the presentation still up');
    console.log('ok   a diagram clicked, close up; dragged around; Esc the whole again');
  }

  // the long section: one slide, → scrolling it a screen at a time, its heading at the top first; then the last line
  await press('ArrowRight');
  v = await look();
  assert.deepEqual([v.h, v.tall, v.scrolled], ['Long', true, 0], 'one slide, taller than the screen, from its top');
  const pinned = () => page.evaluate(() => { const p = document.querySelector('.present .pinned'); return p && getComputedStyle(p).opacity !== '0' ? p.textContent.replace(/\s+/g, ' ').trim() : ''; });
  assert.equal(await pinned(), '', 'its heading in sight: no header over it');
  const counted = await count();
  let scrolls = 0;
  for (let last = -1; scrolls < 20; scrolls++) {
    await press('ArrowRight');
    await page.waitForTimeout(300); // (a smooth scroll)
    v = await look();
    if (v.scrolled === last || (await page.locator('.present .end').count())) break;
    last = v.scrolled;
    assert.equal(await count(), counted, 'still the same slide while it scrolls');
    // its heading scrolled away, a header says which section this is, over the top of the words
    if (v.scrolled > 200) {
      assert.equal(await pinned(), 'Long', `scrolled ${v.scrolled}px, the section's heading pinned at the top`);
      // its words up in the room over the slide's words, where a slide's own crumbs are, not on their first line
      const [pt, wt] = await page.evaluate(() => { const s = document.querySelector('.present .slide'), r = document.createRange(); r.selectNodeContents(document.querySelector('.present .pinned span')); return [r.getBoundingClientRect().bottom, s.getBoundingClientRect().top + parseFloat(getComputedStyle(s).paddingTop)]; });
      assert.ok(pt <= wt + 4, `the header's words over the slide's, not on them (${Math.round(pt)} > ${Math.round(wt)})`);
    }
  }
  assert.ok(scrolls >= 2, `scrolled through, a screen a press (${scrolls})`);
  if (await page.locator('.present .end').count()) await press('ArrowLeft'); // (the press past its foot was the end's)
  assert.equal(await count(), `${await total()} / ${await total()}`);
  assert.equal(await page.locator('.present .end').count(), 0, 'the last slide is still a slide');
  assert.ok(await page.evaluate(() => { const s = document.querySelector('.present .slide'); const r = [...s.querySelectorAll('p')].find((p) => p.textContent === 'The end.').getBoundingClientRect(); return r.bottom <= s.getBoundingClientRect().bottom + 1; }), 'scrolled to its last line');
  await page.screenshot({ path: 'e2e/out/present-3.png' });
  // past the last: a screen that says it is the end, not a press that does nothing; ← back to the last slide
  await press('ArrowRight');
  assert.equal(await page.locator('.present .end').count(), 1, 'past the last slide, the end says so');
  assert.match(await page.textContent('.present .end'), /End/);
  await page.screenshot({ path: 'e2e/out/present-end.png' });
  await press('ArrowRight');
  assert.equal(await page.locator('.present').count(), 1, 'another press at the end does not leave by itself');
  await press('ArrowLeft');
  assert.equal(await page.locator('.present .end').count(), 0, '← from the end, back to the last slide');
  assert.equal(await count(), `${await total()} / ${await total()}`);

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
  // ⇧⌘↩ from the note presents it too (Settings → Shortcuts can change it), and Esc leaves again
  await page.keyboard.press('Meta+Shift+Enter');
  await page.waitForSelector('.present .slide h1');
  assert.equal(await count(), `1 / ${await total()}`, 'from the first slide');
  await press('Escape');
  assert.equal(await page.locator('.present').count(), 0);
  console.log('ok   a note presented: slides at its headings, a long one scrolled through, the end said, the whole screen and back, a flowchart a step a press, back into the note; ⇧⌘↩ presents it');

  // ---- a diagram beside words: a slide of its own; a table the slide's width; inline code clear of the next line;
  // ⌥⌘↩ from the caret's slide ----
  {
    const NOTE = '# Deck\n\nCover words.\n\n## Mixed\n\nWords before it.\n\n```mermaid\nflowchart LR\n  A[One] --> B[Two]\n```\n\nWords after it.\n\n## Table\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
      Array.from({ length: 3 }, () => 'Some `inline code` in a line long enough to wrap onto the next line, and `more code` there, and on and on until it wraps once more.').join(' ') + '\n\n## Last\n\nThe last words.\n';
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p2.addInitScript((b) => { localStorage.clear(); localStorage.setItem('eve.notes.p', `---\nid: p\nupdated: 1\ndeleted: false\norder: 0\n---\n${b}`); }, NOTE);
    await p2.goto(URL_);
    await p2.waitForSelector('.tiptap .mermaid-view svg');
    await p2.waitForTimeout(1500);
    await p2.locator('.tiptap p', { hasText: 'Some' }).click();
    await p2.keyboard.press('Meta+Alt+Enter');
    await p2.waitForSelector('.present .slide');
    await p2.waitForTimeout(700);
    assert.equal(await p2.locator('.present .slide table').count(), 1, '⌥⌘↩ starts on the slide the caret is on');
    const t = await p2.evaluate(() => { const s = document.querySelector('.present .slide'); return [document.querySelector('.present .slide table').getBoundingClientRect().width, s.getBoundingClientRect().width]; });
    assert.ok(t[0] > 0.9 * t[1], `the table the slide's width (${t.map(Math.round)})`);
    const gap = await p2.evaluate(() => {
      // each inline code's tinted chip against the line under it: they must not meet
      const codes = [...document.querySelectorAll('.present .slide p code')].map((c) => c.getBoundingClientRect());
      const lh = parseFloat(getComputedStyle(document.querySelector('.present .slide p')).lineHeight), fs = parseFloat(getComputedStyle(document.querySelector('.present .slide p')).fontSize);
      return { ratio: lh / fs, tall: Math.max(...codes.map((r) => r.height)) / lh };
    });
    assert.ok(gap.ratio >= 1.7 && gap.tall < 0.85, `lines apart, an inline code's chip clear of the next line (${JSON.stringify(gap)})`);
    await p2.screenshot({ path: 'e2e/out/present-table.png' });
    await p2.keyboard.press('Home');
    await p2.waitForTimeout(500);
    const kinds = [];
    for (let i = 0; i < 8 && !(await p2.locator('.present .end').count()); i++) {
      kinds.push(await p2.evaluate(() => { const s = document.querySelector('.present .slide'); return s.querySelector('svg[aria-roledescription], .mermaid-view svg') ? 'chart' : s.textContent.trim().slice(0, 12); }));
      await p2.keyboard.press('ArrowRight'); await p2.waitForTimeout(450);
      while (await p2.evaluate(() => document.querySelector('.present .slide .mermaid-view svg g.node[style*="opacity: 0"]'))) { await p2.keyboard.press('ArrowRight'); await p2.waitForTimeout(300); }
    }
    assert.deepEqual(kinds.slice(0, 4), ['DeckCover wo', 'MixedWords b', 'chart', 'MixedWords a'], `the diagram a slide of its own, the words before and after it on theirs (${kinds})`);
    await p2.close();
  }
  console.log('ok   a diagram a slide of its own, as big as it goes; a table the slide\'s width; inline code clear of the next line; ⌥⌘↩ from the caret');
} finally {
  await browser.close();
  await server?.close();
}
