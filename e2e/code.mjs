// A code block whose line is wider than the block scrolls sideways in it, and the caret is followed there: back to the
// start of a long line (⌘←, Home, a click), the block scrolls back with it. The webview moves the caret itself for those
// keys and scrolled only the page, not the block, so the caret was left out of sight at the block's left.
// A selection from the code's first line back to its start (⌘⇧←, ⌘⇧↑) and deleted leaves the caret in the code.
// Inline code deleted letter by letter leaves no code behind for the next keys.
// The caret on a line with inline code is as tall as on one without (WebKit drew it as tall as the code's padded box).
// WebKit (the Mac app's engine) when installed (npx playwright-core install webkit), else Chromium (CHROMIUM_PATH).
// It starts its own dev server, or uses EVE_URL. Run: npm run e2e:code
import { webkit, chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

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

  // the caret as painted (drawn magenta, found in a screenshot; it blinks, so a few tries), on a plain line and on a
  // line with inline code, the same font: the same height
  await page.addStyleTag({ content: '.tiptap, .tiptap * { caret-color: #ff00ff !important; }' });
  const caretHeight = async () => {
    let best = 0;
    for (let i = 0; i < 16; i++) {
      const png = PNG.sync.read(await page.screenshot({ caret: 'initial' }));
      let y0 = 1e9, y1 = -1;
      for (let k = 0; k < png.data.length; k += 4) {
        if (png.data[k] > 200 && png.data[k + 1] < 80 && png.data[k + 2] > 200) { const y = Math.floor(k / 4 / png.width); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      best = Math.max(best, y1 - y0 + 1);
      await page.waitForTimeout(60);
    }
    return best;
  };
  await page.evaluate(() => { const ed = window.__editor; ed.commands.setContent('<h1>Code</h1><p>plain words here</p><p>run <code>npm install</code> then go</p>'); });
  await page.evaluate(() => { const ed = window.__editor; let p = 0; ed.state.doc.descendants((n, q) => { if (!p && n.isText && n.text.includes('words')) p = q + 5; }); ed.commands.focus(); ed.commands.setTextSelection(p); });
  await page.waitForTimeout(300);
  const plain = await caretHeight();
  await page.evaluate(() => { const ed = window.__editor; let p = 0; ed.state.doc.descendants((n, q) => { if (!p && n.isText && n.text.includes('then')) p = q + 3; }); ed.commands.setTextSelection(p); });
  await page.waitForTimeout(300);
  const withCode = await caretHeight();
  assert.ok(plain > 0 && Math.abs(withCode - plain) <= 1, `caret on a line with inline code ${withCode}px, on a plain line ${plain}px`);
  console.log(`ok   the caret on a line with inline code is as tall as on a plain one (${withCode}px / ${plain}px)`);
  // A diagram on the whole screen (⤢) is the whole window, whatever the note around it is (a block that breaks out
  // past the text, a pane that is a size container); zoomed in, it scrolls under the trackpad. Put back, the note is
  // where it was and scrolls as before (it was left at the note's end, the caret's place).
  const tall = Array.from({ length: 24 }, (_, i) => `  N${i}[Step ${i}] --> N${i + 1}[Step ${i + 1}]`).join('\n');
  const lines = (w) => Array.from({ length: 30 }, (_, i) => `${w} ${i}`).join('\n\n');
  await page.evaluate(([tall, a, b]) => { const ed = window.__editor; ed.commands.setContent(ed.storage.markdown.parser.parse(`# D\n\n${a}\n\n\`\`\`mermaid\nflowchart TD\n${tall}\n\`\`\`\n\n${b}\n`)); ed.commands.focus('end'); }, [tall, lines('before'), lines('after')]);
  await page.waitForSelector('.dblock svg', { timeout: 15000 });
  const pane = () => page.evaluate(() => { let e = document.querySelector('.tiptap'); while (e && !(e.scrollHeight > e.clientHeight && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement; return e ? e.scrollTop : -1; });
  await page.locator('.dblock').evaluate((d) => d.scrollIntoView({ block: 'center' }));
  await page.locator('.dblock').hover();
  await page.locator('.dblock button[aria-label="Full screen"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const at = await pane();
  await page.locator('.dblock button[aria-label="Full screen"]').click();
  await page.waitForTimeout(600);
  const box = await page.locator('.dblock.full').evaluate((d) => { const r = d.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });
  assert.deepEqual(box, [0, 0, 1000, 700], 'the whole screen is the window');
  for (let i = 0; i < 4; i++) await page.locator('.dblock.full button[aria-label="Zoom in"]').click();
  await page.waitForTimeout(300);
  const canvasTop = () => page.locator('.dblock.full .diagram-canvas').evaluate((c) => c.scrollTop);
  const top0 = await canvasTop();
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
  assert.ok((await canvasTop()) > top0, `zoomed in, the trackpad scrolls the diagram (${top0} → ${await canvasTop()})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.ok(Math.abs((await pane()) - at) <= 2, `put back, the note is where it was (${at} → ${await pane()})`);
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
  assert.ok((await pane()) < at, 'and it scrolls');
  console.log('ok   a diagram on the whole screen fills the window, scrolls zoomed in, and gives the note back where it was');
  // a diagram's right-click menu copies it as a picture (in the note's colours, its labels drawn, at twice its size)
  // and as the markdown the note keeps; a chart Eve draws as HTML (a pie) comes out as a picture too
  const clipPage = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await clipPage.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('eve.notes.c', '---\nid: c\nupdated: 1\ndeleted: false\norder: 0\n---\n# Copy\n\n```mermaid\nflowchart TD\n  A[Write the plan] --> B[Ship it]\n```\n\n```mermaid\npie title Time\n  "Work" : 60\n  "Rest" : 40\n```\n');
    window.__clip = [];
    navigator.clipboard.write = async (items) => { for (const it of items) window.__clip.push({ type: 'image', bytes: [...new Uint8Array(await (await it.getType('image/png')).arrayBuffer())] }); };
    navigator.clipboard.writeText = async (text) => void window.__clip.push({ type: 'text', text });
  });
  await clipPage.goto(URL_);
  await clipPage.waitForSelector('.tiptap .mermaid-view svg g.node');
  await clipPage.waitForSelector('.tiptap .mermaid-view .chart');
  const copyFrom = async (i, label) => {
    await clipPage.evaluate(() => (window.__clip = []));
    await clipPage.locator('.tiptap .mermaid-view').nth(i).click({ button: 'right' });
    await clipPage.locator('[role=menuitem]', { hasText: label }).click();
    await clipPage.waitForFunction(() => window.__clip.length > 0, null, { timeout: 10000 });
    return clipPage.evaluate(() => window.__clip[0]);
  };
  for (const [i, what, w] of [[0, 'flowchart', 'svg'], [1, 'pie', '.chart']]) {
    const got = await copyFrom(i, 'Copy image');
    assert.equal(got.type, 'image', `${what}: a picture on the clipboard`);
    const png = PNG.sync.read(Buffer.from(got.bytes));
    const drawn = await clipPage.locator('.tiptap .mermaid-view').nth(i).locator(w).first().evaluate((el) => el instanceof SVGSVGElement && el.viewBox.baseVal.width ? el.viewBox.baseVal.width : el.scrollWidth);
    assert.ok(Math.abs(png.width - 2 * (drawn + 32)) <= 4, `${what}: at twice its size, in a margin (${png.width} for ${drawn})`);
    // its words are there: the text's dark ink, not only the boxes' and the lines' light greys
    let ink = 0;
    for (let p = 0; p < png.data.length; p += 4) if (png.data[p] + png.data[p + 1] + png.data[p + 2] < 300 && png.data[p + 3] > 200) ink++;
    assert.ok(ink > 200, `${what}: its labels are drawn in the picture (${ink} dark pixels)`);
  }
  const text = await copyFrom(0, 'Copy markdown');
  assert.deepEqual(text, { type: 'text', text: '```mermaid\nflowchart TD\n  A[Write the plan] --> B[Ship it]\n```' });
  console.log('ok   a diagram copies from its menu as a picture, labels and all, and as its markdown');
  // "// 주석" typed into code with a Korean input method: every key, even a "/", comes through the input method, and
  // the line went uncoloured as it became a comment; in WebKit the block's colours stayed wrong even once the comment
  // was deleted. Drawn again as each word goes in, the comment is coloured, and deleted, the code is as it was.
  const imePage = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await imePage.addInitScript(() => { localStorage.clear(); localStorage.setItem('eve.notes.i', '---\nid: i\nupdated: 1\ndeleted: false\norder: 0\n---\n# Code\n\n```typescript\nconst a: number = 1;\n```\n'); });
  await imePage.goto(URL_);
  await imePage.waitForSelector('.tiptap pre .hljs-keyword');
  const colours = () => imePage.evaluate(() => [...document.querySelectorAll('.tiptap pre [class^=hljs]')].map((e) => `${e.className}:${e.textContent}`).join(' | '));
  const plainColours = await colours();
  // each key a composition of its own, as a Korean input method sends even a "/"; the line's text after each, to
  // tell a letter lost by the input method's way in from one lost by the colours drawn again
  const composeKeys = () => imePage.evaluate(async () => {
    const el = document.querySelector('.tiptap');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const steps = [];
    for (const ch of ['/', '/', ' ', '주']) {
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      el.dispatchEvent(new CompositionEvent('compositionupdate', { data: ch }));
      document.execCommand('insertText', false, ch);
      await wait(30);
      el.dispatchEvent(new CompositionEvent('compositionend', { data: ch }));
      await wait(120);
      steps.push(window.__editor.state.selection.$from.parent.textContent);
    }
    return steps;
  });
  // the same keys into a line of text first, where nothing is coloured
  await imePage.evaluate(() => { const ed = window.__editor; ed.commands.focus(); ed.commands.setTextSelection(1); });
  await imePage.keyboard.press('Home');
  console.log('     (a line of text:', JSON.stringify(await composeKeys()) + ')');
  await imePage.locator('.tiptap pre .hljs-keyword', { hasText: 'const' }).click();
  await imePage.keyboard.press('Home');
  console.log('     (the code:', JSON.stringify(await composeKeys()) + ')');
  await imePage.waitForTimeout(300);
  assert.equal(await colours(), 'hljs-comment:// 주const a: number = 1;', 'the line typed into a comment is coloured as one');
  for (let i = 0; i < 4; i++) await imePage.keyboard.press('Backspace');
  await imePage.waitForTimeout(300);
  assert.equal(await colours(), plainColours, 'the comment deleted, the code is coloured as it was');
  console.log('ok   a comment typed through an input method is coloured, and deleted, the code is again');
} finally {
  await browser.close();
  await server?.close();
}
