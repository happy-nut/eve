// The diagram builder end to end: `/diagram` → pick a kind → fill it in → Insert, and the note draws exactly what
// the preview showed (the same SVG, to the byte, at the same size); clicking the diagram opens it again with its
// parts read back; Esc leaves the note as it was. Then a hand-written diagram opens as code, not a form.
// Chromium: CHROMIUM_PATH=/path/to/chromium, else Playwright's own. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:diagrams
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const seed = (body) => page.addInitScript((body) => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); }, body);
const md = () => page.evaluate(() => window.__editor.storage.markdown.getMarkdown());
/** how two pictures differ: the share of pixels not the same, compared in the page. A copy at a fractional
 *  position is smoothed a little differently along its edges, so a few hundredths are the same picture. */
const differ = (a, b) => page.evaluate(async ([a, b]) => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + src; });
  const [x, y] = await Promise.all([load(a), load(b)]);
  // the same size, give or take the row a fractional position adds; compared over what both cover
  if (Math.abs(x.width - y.width) > 1 || Math.abs(x.height - y.height) > 1) return 1;
  const w = Math.min(x.width, y.width), h = Math.min(x.height, y.height);
  const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const [p, q] = [px(x), px(y)];
  let off = 0;
  for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) off++;
  return off / (p.length / 4);
}, [a.toString('base64'), b.toString('base64')]);
const drawing = (sel) => page.evaluate((sel) => {
  const c = document.querySelector(sel), s = c.querySelector('svg'), r = s.getBoundingClientRect();
  return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, svg: s.outerHTML.replace(/eve-mermaid-\d+/g, 'ID') };
}, sel);

try {
  await seed('# Plan\n\nHow a note becomes published.\n\n');
  await page.goto(URL_);
  await page.waitForSelector('.tiptap p');
  await page.locator('.tiptap p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/diagram');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.locator('.card', { hasText: 'Flowchart' }).click();
  await page.waitForSelector('.builder .preview svg');
  const steps = page.locator('.f-node input');
  await steps.nth(0).fill('Draft');
  await steps.nth(1).fill('Reviewed?');
  await steps.nth(2).fill('Publish');
  await page.locator('.add', { hasText: 'Add step' }).click();
  await page.keyboard.type('Share "it"');
  await page.waitForTimeout(800);
  const preview = await drawing('.builder .preview');
  const previewShot = await page.locator('.builder .preview').screenshot();
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => !document.querySelector('.builder') && document.querySelector('.tiptap .mermaid-view svg'));
  await page.waitForTimeout(300);
  const note = await drawing('.tiptap .mermaid-view');
  assert.deepEqual([note.w, note.h], [preview.w, preview.h], 'the note draws it at the preview\'s size');
  assert.ok(note.svg === preview.svg, 'the note draws the very SVG the preview showed');
  await page.mouse.move(0, 0);
  const noteShot = await page.locator('.tiptap .mermaid-view').screenshot();
  assert.ok(await differ(previewShot, noteShot) < 0.03, 'and they look the same, pixel for pixel');
  assert.match(await md(), /```mermaid\nflowchart LR\n {2}n1\(\["Draft"\]\)[\s\S]*n4\("Share #34;it#34;"\)[\s\S]*n3 --> n4\n```/);
  assert.equal(await page.locator('.code-block.editing').count(), 0, 'the caret is under the diagram, not in its code');
  console.log('ok   insert: preview and note draw the same');

  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.builder .f-node');
  assert.deepEqual(await page.locator('.f-node input').evaluateAll((els) => els.map((e) => e.value)), ['Draft', 'Reviewed?', 'Publish', 'Share "it"']);
  await page.locator('.kinds-bar button', { hasText: 'Pie chart' }).click();
  await page.waitForTimeout(400);
  const before = await md();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.builder'));
  assert.equal(await md(), before, 'Esc changes nothing');
  console.log('ok   reopen: its parts read back; Esc changes nothing');

  // a pie: drawn by Eve itself (charts.ts), the same in the preview and the note
  await page.locator('.tiptap p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/diagram');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.locator('.card', { hasText: 'Pie chart' }).click();
  await page.waitForSelector('.builder .preview .chart-pie');
  await page.locator('.p-slice input.label').first().fill('Writing <b>&');
  await page.waitForTimeout(500);
  const pieShot = await page.locator('.builder .preview').screenshot();
  const pieHtml = await page.locator('.builder .preview').innerHTML();
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => !document.querySelector('.builder') && document.querySelectorAll('.tiptap .mermaid-view .chart-pie').length === 1);
  await page.mouse.move(0, 0);
  const pieNote = await page.locator('.tiptap .mermaid-view').nth(1).screenshot();
  assert.ok(await differ(pieShot, pieNote) < 0.03, 'the pie looks the same in the note');
  assert.equal(await page.locator('.tiptap .mermaid-view').nth(1).innerHTML(), pieHtml.replace(/<!---->/g, ''), 'the same markup');
  assert.equal(await page.locator('.tiptap .chart-pie .lbl').first().textContent(), 'Writing <b>&', 'a label is text, not markup');
  console.log('ok   pie: drawn by Eve, the same in the note');

  // a fresh page: the one above saves its note on the way out, over anything seeded under it
  const hand = await browser.newPage({ viewport: { width: 1200, height: 860 } });
  hand.on('pageerror', (e) => errors.push(e.message));
  await hand.addInitScript(() => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 2\ndeleted: false\norder: 0\n---\n# Plan\n\n\`\`\`mermaid\nflowchart LR\n  subgraph one\n  A --> B\n  end\n\`\`\`\n`); });
  await hand.goto(URL_);
  await hand.waitForSelector('.tiptap .mermaid-view svg');
  await hand.locator('.tiptap .mermaid-view').click();
  await hand.waitForSelector('.builder textarea');
  assert.match(await hand.locator('.builder textarea').inputValue(), /subgraph one/);
  await hand.keyboard.press('Escape');
  console.log('ok   hand-written: opens as code');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
