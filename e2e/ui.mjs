// The UI bounty's sweep (WebKit): every surface a note is written on — a note, a day's page from the calendar, a
// kanban card's page — and each kind of block in it, the pointer over it as a hand brings it there. What is checked
// is what a person sees: the block's + / ⋮⋮ beside the block and off its words, inside what can be seen of the page,
// level with its first line. Each surface again in the dark theme.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:ui
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
const problems = [];
const BODY = '# Blocks\n\nA plain line of text.\n\n## A heading\n\n- a bullet\n- another\n\n1. one\n\n- [ ] to do\n\n> [!tip] A callout\n> its body\n\n| quote | it |\n| --- | --- |\n| a | b |\n\n```js\nlet a = 1\n```\n\nlast line\n';

/** every top-level block in `scope` but the title, hovered, its handle measured against it */
async function sweep(page, surface, scope) {
  const n = await page.locator(`${scope} .tiptap > *:not(.sel-layer)`).count();
  for (let i = 1; i < n; i++) {
    const block = page.locator(`${scope} .tiptap > *:not(.sel-layer)`).nth(i);
    const b = await block.boundingBox();
    if (!b || b.height < 4) continue;
    await page.mouse.move(b.x + Math.min(30, b.width / 2), b.y + Math.min(10, b.height / 2));
    await page.waitForTimeout(90);
    const r = await page.evaluate(([scope, i]) => {
      const host = document.querySelector(`${scope} .editor`) ?? document.querySelector(scope);
      const h = host.querySelector(':scope > .block-handle.on');
      const el = [...host.querySelectorAll('.tiptap > *:not(.sel-layer)')][i];
      if (!h || !el) return { missing: !h, tag: el?.tagName };
      const hr = h.getBoundingClientRect(), er = el.getBoundingClientRect();
      // the words: the first text the block shows
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() && !t.parentElement.closest('[contenteditable="false"], .code-lang, .code-lang-ask, button, select') ? 1 : 2) });
      const t = walk.nextNode();
      const range = t && document.createRange();
      range?.selectNodeContents(t);
      const tr = range?.getClientRects()[0];
      // what of the page can be seen: the box it scrolls in
      let clip = host;
      while (clip && !/(auto|scroll|hidden)/.test(getComputedStyle(clip).overflowX + getComputedStyle(clip).overflowY)) clip = clip.parentElement;
      const cr = (clip ?? document.documentElement).getBoundingClientRect();
      return { tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''), handle: [hr.left, hr.right, hr.top, hr.bottom].map(Math.round), block: Math.round(er.left), text: tr ? [tr.left, tr.top, tr.bottom].map(Math.round) : null, clip: Math.round(cr.left) };
    }, [scope, i]);
    const say = (what) => problems.push(`${surface}: ${r.tag}: ${what}`);
    if (r.missing) { say('no handle came up'); continue; }
    const [hl, hrt, ht, hb] = r.handle;
    if (hl < r.clip - 1) say(`the handle is cut off at the page's left edge (${hl} < ${r.clip})`);
    if (hrt > Math.min(r.block, r.text?.[0] ?? Infinity) + 1) say(`the handle is over the block (it ends at ${hrt}, the block's words start at ${Math.min(r.block, r.text?.[0] ?? Infinity)})`);
    if (r.text && ((ht + hb) / 2 < r.text[1] - 4 || (ht + hb) / 2 > r.text[2] + 4)) say(`the handle is not level with the first line (${ht}-${hb} against ${r.text[1]}-${r.text[2]})`);
  }
}

try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: theme });
    await page.addInitScript(() => localStorage.setItem('eve.appearance', JSON.stringify({ ...JSON.parse(localStorage.getItem('eve.appearance') ?? '{}'), dailyNotes: true })));
    await page.goto(URL_);
    await page.waitForSelector('.tiptap');
    // a note
    await page.locator('button[data-tip="New note"]:visible').first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((b) => window.__editor.commands.setContent(b, true), BODY);
    await page.waitForTimeout(600);
    await sweep(page, `${theme} note`, 'main');
    // a day's page, from the calendar
    await page.locator('aside [data-row]', { hasText: 'Daily notes' }).first().click();
    await page.waitForSelector('.day');
    await page.locator('.day.today').click();
    await page.waitForSelector('.card-page .tiptap');
    await page.waitForTimeout(400);
    await page.evaluate((b) => { const pm = document.querySelector('.card-page .tiptap'); pm.editor.commands.setContent(b, true); }, BODY.replace('# Blocks', '# A day'));
    await page.waitForTimeout(500);
    await sweep(page, `${theme} day page`, '.card-page');
    await page.keyboard.press('Escape');
    await page.close();
  }
  // ---- the calendar, databases and boards (the bounty's finds), at an 800×600 window ----
  {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.addInitScript(() => localStorage.setItem('eve.appearance', JSON.stringify({ ...JSON.parse(localStorage.getItem('eve.appearance') ?? '{}'), dailyNotes: true })));
    await page.goto(URL_);
    await page.waitForSelector('.tiptap');
    const say = (what) => problems.push(`800×600: ${what}`);
    // a new note from the toolbar's + (at this width the list's own button is not shown), then a line to type a / on
    const fresh = async (body) => {
      await page.locator('.toolbar .icon').last().click();
      await page.locator('.menu button', { hasText: 'New note' }).click();
      await page.waitForTimeout(400);
      await page.evaluate((b) => window.__editor.commands.setContent(b, true), body);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__editor.commands.focus('end'));
      await page.keyboard.press('Enter');
    };
    // a database: its rows' cells line up; a header's menu opens off the header; ↩ in a field keeps the keyboard there
    await fresh('# DB\n\none\n\ntwo\n\nthree\n\nfour\n\nfive\n\nsix');
    await page.keyboard.type('/database');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.db');
    for (let i = 0; i < 2; i++) { await page.locator('.db .new').first().click(); await page.waitForTimeout(250); await page.keyboard.type(`row ${i}`); await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
    const focus = await page.evaluate(() => document.activeElement?.tagName);
    if (focus !== 'INPUT') say(`↩ in a database field left the keyboard on ${focus}`);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.db tbody tr')].map((tr) => [...tr.children].map((c) => Math.round(c.getBoundingClientRect().bottom))));
    for (const r of rows) if (Math.max(...r) - Math.min(...r) > 1) say(`a database row's cells end at different heights (${r})`);
    const head = page.locator('.db thead th button, .db .head').first();
    if (await head.count()) {
      await page.evaluate(() => document.querySelector('.db').scrollIntoView({ block: 'end' }));
      await page.waitForTimeout(200);
      const hb = await head.boundingBox();
      await head.click();
      await page.waitForSelector('.menu');
      const mb = await page.locator('.menu').boundingBox();
      if (mb && hb && mb.y < hb.y + hb.height - 1 && mb.y + mb.height > hb.y + 1) say(`a database header's menu lies over the header (${Math.round(mb.y)}–${Math.round(mb.y + mb.height)} over ${Math.round(hb.y)}–${Math.round(hb.y + hb.height)})`);
      await page.keyboard.press('Escape');
    }
    // a new board at this width: every column in sight, or its edge fading to say there is more
    await fresh('# Board');
    await page.keyboard.type('/kanban');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.kb');
    await page.waitForTimeout(300);
    const kb = await page.evaluate(() => { const k = document.querySelector('.kb'); return { cut: k.scrollWidth - k.clientWidth > 2, faded: k.classList.contains('more-r') }; });
    if (kb.cut && !kb.faded) say('a new board is cut off with nothing to say it goes on');
    // the calendar: weeks never overlap; a day reads as words; ‹ › leave the arrows working; a card opens over a day
    await page.locator('aside [data-row]', { hasText: 'Daily notes' }).first().click();
    await page.waitForSelector('.day');
    await page.locator('.day.today').click();
    await page.waitForSelector('.card-page .tiptap');
    await page.evaluate(() => document.querySelector('.card-page .tiptap').editor.commands.setContent('# Today\n\n| Name | Kind |\n| --- | --- |\n| a | b |\n', true));
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const line = await page.evaluate(() => document.querySelector('.day.today .line')?.textContent ?? '');
    if (/[|`#[\]]/.test(line)) say(`a day in the calendar reads as markdown: "${line}"`);
    const days = await page.evaluate(() => [...document.querySelectorAll('.day')].map((d) => { const r = d.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }));
    const tops = [...new Set(days.map((d) => d[0]))].sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) { const above = days.filter((d) => d[0] === tops[i - 1]).map((d) => d[1]); if (Math.max(...above) > tops[i] + 1) { say(`a week of the calendar runs over the week under it (${Math.max(...above)} > ${tops[i]})`); break; } }
    await page.locator('button[aria-label="Next month"]').click();
    await page.waitForTimeout(200);
    const where = await page.evaluate(() => document.activeElement?.className ?? '');
    if (!/day/.test(where)) say(`after ›, the keyboard is not on a day (on: "${where}")`);
    await page.locator('button[aria-label="Previous month"]').click();
    await page.waitForTimeout(200);
    await page.locator('.day.today').click();
    await page.waitForSelector('.card-page .tiptap');
    await page.evaluate(() => document.querySelector('.card-page .tiptap').editor.commands.focus('end'));
    await page.keyboard.press('Enter');
    await page.keyboard.type('/kanban');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.card-page .kb');
    await page.keyboard.type('my card');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.evaluate(() => [...document.querySelectorAll('.card-page .kb-card')].find((c) => c.textContent.includes('my card'))?.click());
    await page.waitForTimeout(500);
    const pages = await page.evaluate(() => [...document.querySelectorAll('.card-page .tiptap')].map((t) => t.textContent.slice(0, 20)));
    if (!pages.some((t) => t.includes('my card'))) say(`a board's card opened on a day's page does not show (pages: ${JSON.stringify(pages)})`);
    await page.close();
  }

  if (problems.length) { console.log(problems.map((p) => 'FAIL ' + p).join('\n')); assert.fail(`${problems.length} things out of place`); }
  console.log('ok   every block\'s handle beside it, off its words, in sight, level with its first line — notes and day pages, both themes');
  console.log('ok   the calendar, databases and boards at 800×600: rows aligned, menus off their buttons, weeks apart, days as words, keys kept, a card over a day');
} finally {
  await browser.close();
  await server?.close();
}
