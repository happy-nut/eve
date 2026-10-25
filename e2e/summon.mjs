// Coming back to Eve (⌘⇧E, ⌘Tab, the Dock): the caret is where it was, and so is the page. Summoned by the hotkey,
// the page was scrolled to put the caret's line in the middle of the window every time, so the line being written
// at the bottom jumped up under the eyes; now the page only moves when the caret is out of sight.
// Leaving and coming back are the window's blur and focus (and the hotkey's eve-summon), as the app hears them.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:summon
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(URL_);
  await page.waitForSelector('.tiptap');
  await page.locator('button[data-tip="New note"]:visible').first().click().catch(() => {});
  await page.waitForTimeout(400);
  const body = '# Long\n\n' + Array.from({ length: 80 }, (_, i) => `line ${i} some words to write after`).join('\n\n');
  await page.evaluate((b) => window.__editor.commands.setContent(b, true), body);
  await page.waitForTimeout(300);

  /** the caret: where it is in the note, and how far down the window it is drawn */
  const caret = () => page.evaluate(() => {
    const ed = window.__editor, head = ed.state.selection.head;
    return { at: head, y: Math.round(ed.view.coordsAtPos(head).top) };
  });
  /** the page scrolled so line `n` sits `fromBottom` px above the window's bottom edge, the caret at its end */
  async function writeAt(n, fromBottom) {
    await page.evaluate(([n, fromBottom]) => {
      const sc = document.querySelector('.scroll');
      const l = [...document.querySelectorAll('.tiptap p')].find((p) => p.textContent.startsWith(`line ${n} `));
      sc.scrollTop += l.getBoundingClientRect().top - (sc.clientHeight - fromBottom);
    }, [n, fromBottom]);
    await page.locator('.tiptap p', { hasText: `line ${n} ` }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' x');
  }
  const leave = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const back = (hotkey) => page.evaluate((hotkey) => { window.dispatchEvent(new Event('focus')); if (hotkey) window.dispatchEvent(new Event('eve-summon')); }, hotkey);

  for (const [how, hotkey] of [['⌘Tab', false], ['the hotkey', true]]) {
    await writeAt(40, 60);
    const was = await caret();
    await leave();
    await page.waitForTimeout(150);
    await back(hotkey);
    await page.waitForTimeout(300);
    const now = await caret();
    assert.equal(now.at, was.at, `back by ${how}: the caret is where it was in the note`);
    assert.ok(Math.abs(now.y - was.y) <= 2, `back by ${how}: the line being written stays where it was on screen (${was.y} → ${now.y})`);
    await page.keyboard.type('Y');
    assert.match(await page.evaluate(() => window.__editor.state.selection.$head.parent.textContent), /xY$/, `back by ${how}: what is typed goes on at the caret`);
    console.log(`ok   back by ${how}: caret and page where they were`);
  }

  // the caret scrolled out of sight while away (the list, a search): summoned, it is brought back into view
  await writeAt(10, 60);
  await page.evaluate(() => { document.querySelector('.scroll').scrollTop += 2000; });
  await leave();
  await page.waitForTimeout(150);
  await back(true);
  await page.waitForTimeout(300);
  const seen = await caret();
  const height = await page.evaluate(() => document.querySelector('.scroll').getBoundingClientRect().bottom);
  assert.ok(seen.y > 72 && seen.y < height - 20, `summoned with the caret out of sight, it is brought into view (y ${seen.y})`);
  console.log('ok   summoned with the caret out of sight, it is brought into view');
} finally {
  await browser.close();
  await server?.close();
}
