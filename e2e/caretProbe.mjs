// Diagnostic: where the webview paints the caret against where the editor's selection is, as blocks that draw
// themselves (a code block, an image) are added around it. The caret is drawn magenta and found in screenshots.
// WebKit when installed, else Chromium (CHROMIUM_PATH). Run: node e2e/caretProbe.mjs
import { webkit, chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = process.env.CHROMIUM_PATH ? await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }) : await webkit.launch();
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1600 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n# Caret\n\nhello world\n`); });
  await page.goto(URL_);
  await page.waitForSelector('.tiptap');
  await page.addStyleTag({ content: '.tiptap, .tiptap * { caret-color: #ff00ff !important; } *:focus { outline: none !important; }' });
  await page.waitForTimeout(400);

  /** the caret as painted: magenta pixels in a few screenshots (it blinks) */
  const painted = async () => {
    for (let i = 0; i < 12; i++) {
      const png = PNG.sync.read(await page.screenshot({ caret: 'initial' }));
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const k = (y * png.width + x) * 4, r = png.data[k], g = png.data[k + 1], b = png.data[k + 2];
        if (r > 200 && g < 80 && b > 200) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      if (x1 >= 0) return { x: x0, top: y0, h: y1 - y0 + 1 };
      await page.waitForTimeout(90);
    }
    return null;
  };
  /** the caret as the selection has it: the collapsed range's box, and the text line's around it */
  const expected = () => page.evaluate(() => {
    const ed = window.__editor, sel = getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0).getClientRects()[0] : null;
    const c = ed.view.coordsAtPos(ed.state.selection.head);
    const el = (sel.focusNode?.nodeType === 1 ? sel.focusNode : sel.focusNode?.parentElement);
    const cs = el ? getComputedStyle(el) : null;
    return { range: r ? { x: Math.round(r.left), top: Math.round(r.top), h: Math.round(r.height) } : null, pm: { x: Math.round(c.left), top: Math.round(c.top), h: Math.round(c.bottom - c.top) },
      in: el?.tagName + '.' + (el?.className || ''), font: cs ? `${cs.fontSize}/${cs.lineHeight}` : '' };
  });
  // at once, and again half a second on: a caret drawn in the wrong place for a frame is not one left there
  const probe = async (label) => {
    for (const when of ['now', 'settled']) {
      if (when === 'settled') await page.waitForTimeout(500);
      const e = await expected(), p = await painted();
      const ref = e.range ?? e.pm;
      const off = p ? { dx: p.x - ref.x, dy: p.top - ref.top, dh: p.h - ref.h } : null;
      rows.push({ label: `${label} (${when})`, painted: p, range: e.range, pm: e.pm, in: e.in, font: e.font, off });
      console.log(`${(label + ' ' + when).padEnd(54)} painted ${JSON.stringify(p)} range ${JSON.stringify(e.range)} pm ${JSON.stringify(e.pm)} ${e.in} ${e.font} OFF ${JSON.stringify(off)}`);
    }
  };

  await page.click('.tiptap p');
  await page.keyboard.press('End');
  await probe('1 paragraph end');
  await page.keyboard.press('Enter');
  await page.keyboard.type('```js');
  await page.keyboard.press('Enter');
  await page.keyboard.type('const x = 1;');
  await probe('2 code block, just typed');
  await page.waitForTimeout(1500);
  await probe('3 code block, highlighting in');
  await page.keyboard.type(' let y');
  await probe('4 code block, typed more');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await probe('5 out of the block, empty line');
  await page.keyboard.type('after the code');
  await probe('6 typed under the block');
  // an image above the caret: it loads after it is put in, and the page moves down under the caret
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="260"><rect width="500" height="260" fill="#8ac"/></svg>').toString('base64');
  await page.evaluate((src) => {
    const ed = window.__editor;
    const head = ed.state.selection.head;
    ed.chain().insertContentAt(ed.state.doc.child(0).nodeSize, { type: 'image', attrs: { src } }).run();
    ed.commands.setTextSelection(ed.state.selection.head > head ? ed.state.selection.head : head);
  }, svg);
  await probe('7 image put in above, at once');
  await page.waitForTimeout(800);
  await probe('8 image put in above, loaded');
  await page.evaluate(() => { const ed = window.__editor; ed.commands.focus('end'); });
  await probe('9 caret set again at the end');
  await page.keyboard.type(' x');
  await probe('10 typed under the image');
  // an image that takes a while to come: put in above the caret, it pushes the line down only when it arrives,
  // with nothing typed in between (a picture from the web, or a big one)
  await page.route('**/slow.svg', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200"><rect width="500" height="200" fill="#c8a"/></svg>' });
  });
  await page.evaluate((src) => {
    const ed = window.__editor, head = ed.state.selection.head;
    const at = ed.state.doc.child(0).nodeSize;
    ed.chain().insertContentAt(at, { type: 'image', attrs: { src } }).run();
    ed.commands.setTextSelection(head + (ed.state.doc.content.size - head > 0 ? ed.state.doc.nodeAt(at).nodeSize : 0));
  }, new URL('slow.svg', URL_).href);
  await probe('10b slow image above, at once');
  await page.waitForTimeout(1500);
  await probe('10c slow image above, arrived');
  await page.keyboard.type('k');
  await probe('10d typed after it arrived');
  // a diagram drawn above: mermaid lays it out after it is put in
  await page.evaluate(() => {
    const ed = window.__editor, head = ed.state.selection.head, at = ed.state.doc.child(0).nodeSize;
    ed.chain().insertContentAt(at, { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'flowchart TD\n  A --> B\n  B --> C' }] }).run();
    ed.commands.setTextSelection(head + ed.state.doc.nodeAt(at).nodeSize);
  });
  await probe('10e diagram above, at once');
  await page.waitForTimeout(2500);
  await probe('10f diagram above, drawn');
  await page.keyboard.press('Enter');
  await page.keyboard.type('see `code` y');
  await probe('11 after inline code');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await probe('12 just after inline code');
  await page.keyboard.press('ArrowLeft');
  await probe('13 inside inline code end');
  await page.evaluate(() => { const ed = window.__editor; ed.commands.focus('end'); ed.commands.insertContent([{ type: 'paragraph', content: [{ type: 'text', text: 'plain line' }] }]); });
  await probe('14 a plain line under it');
  await page.evaluate(() => { const ed = window.__editor; ed.commands.insertContent([{ type: 'paragraph', content: [{ type: 'text', text: 'area ' }, { type: 'mathInline', attrs: { latex: 'x^2' } }, { type: 'text', text: ' z' }] }]); });
  await page.waitForTimeout(800);
  await probe('15 a line with a formula');
  const worst = rows.filter((r) => r.off && (Math.abs(r.off.dx) > 2 || Math.abs(r.off.dy) > 2 || Math.abs(r.off.dh) > 3));
  console.log(`${rows.length} probes, ${worst.length} off by more than 2px: ${worst.map((r) => r.label).join(' | ') || 'none'}`);
  console.log(`not painted: ${rows.filter((r) => !r.painted).map((r) => r.label).join(' | ') || 'none'}`);
} finally {
  await browser.close();
  await server?.close();
}
