// A code block whose line is wider than the block scrolls sideways in it, and the caret is followed there: back to the
// start of a long line (⌘←, Home, a click), the block scrolls back with it. The webview moves the caret itself for those
// keys and scrolled only the page, not the block, so the caret was left out of sight at the block's left.
// A selection from the code's first line back to its start (⌘⇧←, ⌘⇧↑) and deleted leaves the caret in the code.
// Inline code deleted letter by letter leaves no code behind for the next keys.
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

  // ⌘⇧← / ⌘⇧↑ (the webview extending the selection to the line's or the note's start) from the code's first line,
  // then deleted: the caret stays in the code and takes the next keys (in WebKit it was left in the language chip
  // ahead of the code, out of sight, and the keys went nowhere)
  for (const unit of ['lineboundary', 'documentboundary', 'line']) {
    await page.evaluate((unit) => {
      const ed = window.__editor;
      let start = 0;
      ed.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') start = p + 1; });
      ed.commands.focus();
      ed.commands.setTextSelection(start + 5);
      getSelection().modify('extend', 'backward', unit);
    }, unit);
    await page.waitForTimeout(100);
    const at = await page.evaluate(() => { const n = getSelection().focusNode; return (n?.nodeType === 1 ? n : n?.parentElement)?.closest('.code-lang') ? 'the language chip' : 'text'; });
    assert.equal(at, 'text', `selection extended by ${unit}: its end is not in the language chip`);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Q');
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => window.__editor.storage.markdown.getMarkdown().includes('Q')), `after deleting a selection extended by ${unit}, the next key is typed`);
    await page.evaluate(() => window.__editor.commands.undo());
    await page.evaluate(() => window.__editor.commands.undo());
  }
  console.log('ok   a selection from the code\'s first line to its start, deleted: the caret stays in the code');

  // inline code backspaced away letter by letter, then typing: plain text, not code again (the webview's own
  // deletions left the deleted code's mark for the next keys, with nothing on screen to show it)
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.commands.setContent('<h1>Code</h1><p>x <code>abc</code></p>');
    ed.commands.focus('end');
  });
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('new');
  await page.waitForTimeout(100);
  assert.equal((await page.evaluate(() => window.__editor.storage.markdown.getMarkdown())).trim(), '# Code\n\nx new', 'typed after the code was all deleted: plain text');
  console.log('ok   inline code all deleted: what is typed next is not code');
} finally {
  await browser.close();
  await server?.close();
}
