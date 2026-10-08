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
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => !document.querySelector('.builder') && document.querySelector('.tiptap .mermaid-view svg'));
  await page.waitForTimeout(300);
  const note = await drawing('.tiptap .mermaid-view');
  assert.deepEqual([note.w, note.h], [preview.w, preview.h], 'the note draws it at the preview\'s size');
  assert.ok(note.svg === preview.svg, 'the note draws the very SVG the preview showed');
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

  await page.evaluate(() => { localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 2\ndeleted: false\norder: 0\n---\n# Plan\n\n\`\`\`mermaid\nflowchart LR\n  subgraph one\n  A --> B\n  end\n\`\`\`\n`); });
  await page.reload();
  await page.waitForSelector('.tiptap .mermaid-view svg');
  await page.locator('.tiptap .mermaid-view').click();
  await page.waitForSelector('.builder textarea');
  assert.match(await page.locator('.builder textarea').inputValue(), /subgraph one/);
  await page.keyboard.press('Escape');
  console.log('ok   hand-written: opens as code');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
