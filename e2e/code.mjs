// A code block whose line is wider than the block scrolls sideways in it, and the caret is followed there: back to the
// start of a long line (⌘←, Home, a click), the block scrolls back with it. The webview moves the caret itself for those
// keys and scrolled only the page, not the block, so the caret was left out of sight at the block's left.
// WebKit (the Mac app's engine) when installed (npx playwright-core install webkit), else Chromium (CHROMIUM_PATH).
// It starts its own dev server, or uses EVE_URL. Run: npm run e2e:code
import { webkit, chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = process.env.CHROMIUM_PATH ? await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }) : await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const long = 'const x = ' + Array.from({ length: 40 }, (_, i) => `item${i}`).join(' + ') + ';';
  await page.addInitScript((long) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n# Code\n\n\`\`\`js\n${long}\nshort\n\`\`\`\n`); }, long);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap pre');
  const pre = page.locator('.tiptap pre').first();
  const scrolled = () => pre.evaluate((p) => p.scrollLeft);
  /** the caret put at `where` in the long line by itself, as the webview's own keys put it (no scrolling asked for) */
  const caretAt = (where) => page.evaluate((where) => {
    const ed = window.__editor;
    let start = 0, len = 0;
    ed.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') { start = p + 1; len = n.textContent.indexOf('\n'); } });
    ed.commands.focus();
    ed.view.dispatch(ed.state.tr.setSelection(ed.state.selection.constructor.create(ed.state.doc, where === 'end' ? start + len : start)));
  }, where);

  await caretAt('end');
  await page.waitForTimeout(100);
  assert.ok((await scrolled()) > 0, 'the end of a long line: the block scrolls to it');
  await caretAt('start');
  await page.waitForTimeout(100);
  assert.equal(await scrolled(), 0, 'back to the line start: the block scrolls back to its left');
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  assert.equal(await scrolled(), 0, 'Home: the line start in sight, not cut off at the edge');
  console.log('ok   a long code line: the block follows the caret to either end');
} finally {
  await browser.close();
  await server?.close();
}
