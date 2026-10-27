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
const BODY = '# Blocks\n\nA plain line of text.\n\n## A heading\n\n- a bullet\n- another\n\n1. one\n\n- [ ] to do\n\n> [!tip] A callout\n> its body\n\n| quote | it |\n| --- | --- |\n| a | b |\n\n```js\nlet a = 1\n```\n\nabove the rule\n\n---\n\n```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```\n\nlast line\n';

/** every top-level block in `scope` but the title, hovered, its handle measured against it */
async function sweep(page, surface, scope) {
  const n = await page.locator(`${scope} .tiptap > *:not(.sel-layer)`).count();
  for (let i = 1; i < n; i++) {
    const block = page.locator(`${scope} .tiptap > *:not(.sel-layer)`).nth(i);
    await block.scrollIntoViewIfNeeded();
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
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() && t.parentElement.getClientRects().length && !t.parentElement.closest('[contenteditable="false"], .code-lang, .code-lang-ask, button, select, svg, pre:not(:has(code))') ? 1 : 2) });
      const t = walk.nextNode();
      const range = t && document.createRange();
      range?.selectNodeContents(t);
      const tr = range?.getClientRects()[0];
      // what of the page can be seen: the box it scrolls in
      let clip = host;
      while (clip && !/(auto|scroll|hidden)/.test(getComputedStyle(clip).overflowX + getComputedStyle(clip).overflowY)) clip = clip.parentElement;
      const cr = (clip ?? document.documentElement).getBoundingClientRect();
      return { tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''), handle: [hr.left, hr.right, hr.top, hr.bottom].map(Math.round), block: Math.round(er.left), span: [Math.round(er.top), Math.round(er.bottom)], text: tr ? [tr.left, tr.top, tr.bottom].map(Math.round) : null, clip: Math.round(cr.left) };
    }, [scope, i]);
    const say = (what) => problems.push(`${surface}: ${r.tag}: ${what}`);
    if (r.missing) { say('no handle came up'); continue; }
    const [hl, hrt, ht, hb] = r.handle;
    if (hl < r.clip - 1) say(`the handle is cut off at the page's left edge (${hl} < ${r.clip})`);
    if (hrt > Math.min(r.block, r.text?.[0] ?? Infinity) + 1) say(`the handle is over the block (it ends at ${hrt}, the block's words start at ${Math.min(r.block, r.text?.[0] ?? Infinity)})`);
    if ((ht + hb) / 2 < r.span[0] - 4 || (ht + hb) / 2 > r.span[1] + 4) say(`the handle is not beside the block (${ht}-${hb}, the block ${r.span[0]}-${r.span[1]})`);
    else if (r.text && ((ht + hb) / 2 < r.text[1] - 4 || (ht + hb) / 2 > r.text[2] + 4)) say(`the handle is not level with the first line (${ht}-${hb} against ${r.text[1]}-${r.text[2]})`);
  }
}

/** the bounty's finds about blocks, each where it was found */
async function blockFinds(page) {
  const say = (what) => problems.push(`blocks: ${what}`);
  const set = async (body) => { await page.evaluate((b) => window.__editor.commands.setContent(b, true), body); await page.waitForTimeout(600); };
  // a long list: the line under the pointer has the handle, not the list's first line far above
  await set('# List\n\n' + Array.from({ length: 40 }, (_, i) => `- item ${i}`).join('\n') + '\n');
  const item = page.locator('.tiptap li', { hasText: /^item 30$/ });
  await item.scrollIntoViewIfNeeded();
  const ib = await item.boundingBox();
  await page.mouse.move(ib.x + 20, ib.y + ib.height / 2);
  await page.waitForTimeout(120);
  const hb = await page.locator('main .block-handle.on').boundingBox();
  if (!hb || Math.abs(hb.y + hb.height / 2 - (ib.y + ib.height / 2)) > 6) say(`a long list's line has its handle elsewhere (${hb && Math.round(hb.y)} for a line at ${Math.round(ib.y)})`);
  // ⋮⋮ on a heading far from the caret: the page stays put, and its menu opens by ⋮⋮, in the window
  await set('# H\n\nfirst line\n\n## A heading here\n\n' + 'filler\n\n'.repeat(40) + 'bottom para\n');
  await page.locator('.tiptap p', { hasText: 'bottom para' }).click();
  await page.keyboard.type(' x');
  await page.evaluate(() => { document.querySelector('main .scroll').scrollTop = 0; });
  await page.waitForTimeout(150);
  const h2 = await page.locator('.tiptap h2').boundingBox();
  await page.mouse.move(h2.x + 20, h2.y + h2.height / 2);
  await page.waitForTimeout(120);
  const grip = await page.locator('main .block-handle.on .grip').boundingBox();
  await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.waitForSelector('.menu');
  const [scrollTop, menu] = await page.evaluate(() => [document.querySelector('main .scroll').scrollTop, document.querySelector('.menu').getBoundingClientRect().top]);
  if (scrollTop > 2 || menu < 0) say(`⋮⋮ far from the caret scrolled the note (${scrollTop}px) or put its menu off the window (top ${Math.round(menu)})`);
  await page.keyboard.press('Escape');
  // a table: the row's ⋮⋮ clear of the first cell's words; a wide one in a callout keeps its words whole
  await set('# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> [!warning] Box\n> | ' + Array.from({ length: 12 }, (_, i) => `column number ${i}`).join(' | ') + ' |\n> |' + ' --- |'.repeat(12) + '\n> | ' + Array.from({ length: 12 }, () => 'v').join(' | ') + ' |\n');
  const cell = page.locator('.tiptap > .tableWrapper td', { hasText: '1' });
  const cb = await cell.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForTimeout(120);
  const rg = await page.locator('.tbl-grip.row.on').boundingBox();
  const textLeft = await page.evaluate(() => { const td = [...document.querySelectorAll('.tiptap > .tableWrapper td')].find((t) => t.textContent.trim() === '1'); const r = document.createRange(); r.selectNodeContents(td.querySelector('p') ?? td); return r.getClientRects()[0].left; });
  if (rg && rg.x + rg.width > textLeft - 2) say(`a row's ⋮⋮ touches the first cell's words (ends ${Math.round(rg.x + rg.width)}, words at ${Math.round(textLeft)})`);
  const thin = await page.evaluate(() => [...document.querySelectorAll('.callout th')].filter((th) => th.getBoundingClientRect().width < 60).length);
  if (thin) say(`a wide table in a callout squeezes ${thin} columns too narrow for their words`);
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
    if (theme === 'light') await blockFinds(page);
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

  // ---- around the note (the bounty's finds): tabs, a cover, Settings, toasts, Find, a group renamed ----
  for (const [w, h] of [[1200, 850], [800, 600]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL_);
    await page.waitForSelector('.tiptap');
    const say = (what) => problems.push(`chrome ${w}×${h}: ${what}`);
    const box = async (sel) => ((await page.locator(sel).count()) ? page.locator(sel).first().boundingBox() : null);
    const meet = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    await page.locator('.toolbar .icon').last().click();
    await page.locator('.menu button', { hasText: 'New note' }).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__editor.commands.setContent('# Parent page\n\nwords\n', true));
    await page.waitForTimeout(300);
    // a page under it, so the crumbs show (a note at the top level has none)
    await page.locator('.toolbar .icon').last().click();
    await page.locator('.menu button', { hasText: 'New page in' }).first().click();
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__editor.commands.setContent('# A page with a cover\n\nwords\n', true));
    await page.waitForTimeout(300);
    if (!(await page.locator('.crumbs').count())) say('a page under another shows no crumbs');
    // a cover: the crumbs and the toolbar on the page's colour, above it; the icon close over the title
    // (a new note has an icon already: Eve gives it one)
    await page.mouse.move(w / 2, 200);
    if (!(await page.locator('.big-icon').count())) await page.locator('.add-icon:not(.add-cover)').click();
    await page.waitForTimeout(200);
    await page.mouse.move(w / 2, 200);
    await page.locator('.add-cover').click();
    await page.waitForTimeout(300);
    const cover = await box('.cover'), icon = await box('.big-icon'), title = await box('.tiptap > :first-child');
    const tb = await box('.toolbar');
    if (tb && cover && tb.y + tb.height > cover.y + 1) say(`the toolbar is drawn over the cover (${Math.round(tb.y + tb.height)} > ${Math.round(cover.y)})`);
    if (icon && title && title.y - (icon.y + icon.height) > 24) say(`a ${Math.round(title.y - icon.y - icon.height)}px gap between the icon and the title under a cover`);
    // tabs: the crumbs off the page's head
    await page.keyboard.press('Meta+t');
    await page.waitForTimeout(500);
    const crumbs = await box('.crumbs'), head = await box('.page-head');
    if (meet(crumbs, head)) say('with tabs open, the crumbs lie over the page\'s head');
    await page.keyboard.press('Meta+w');
    await page.waitForTimeout(300);
    // Find open: the crumbs end before it
    await page.keyboard.press('Meta+f');
    await page.waitForSelector('.find');
    if (meet(await box('.crumbs'), await box('.find'))) say('Find lies over the crumbs');
    await page.keyboard.press('Escape');
    // Settings: the tabs stay put as one is switched; Esc on an open choice closes the choice, not Settings
    await page.keyboard.press('Meta+,');
    await page.waitForSelector('.panel');
    const tabsAt = [];
    for (const name of ['Appearance', 'Sync', 'General']) {
      const t = page.locator('.panel .seg button', { hasText: name }).first();
      if (!(await t.count())) continue;
      await t.click();
      await page.waitForTimeout(200);
      tabsAt.push(Math.round((await t.boundingBox()).y));
    }
    if (new Set(tabsAt).size > 1) say(`Settings' tabs move as one is switched (${tabsAt})`);
    await page.locator('.panel .seg button', { hasText: 'Appearance' }).first().click();
    await page.waitForTimeout(200);
    const choice = page.locator('.panel button[aria-haspopup], .panel .select').first();
    if (await choice.count()) {
      await choice.click();
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (!(await page.locator('.panel').count())) say('Esc on an open choice in Settings closed Settings');
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // a toast clear of the list's buttons
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.keyboard.press('Meta+Shift+Backspace');
    await page.waitForTimeout(400);
    const toast = await box('.toast');
    for (const b of ['aside .foot button', 'aside button[aria-label="Trash"]', 'aside button[aria-label="Settings"]']) if (meet(toast, await box(b))) { say(`a toast lies over the list's ${b}`); break; }
    await page.close();
  }

  // ---- how a note looks under Settings' extremes (round 2): line heights, a large text in a narrow column, small text ----
  for (const look of [{ lineHeight: 1.2 }, { lineHeight: 2.2 }, { size: 28, width: 520, font: 'mono' }, { size: 12 }]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    await page.addInitScript((l) => localStorage.setItem('eve.appearance', JSON.stringify({ ...JSON.parse(localStorage.getItem('eve.appearance') ?? '{}'), ...l })), look);
    await page.goto(URL_);
    await page.waitForSelector('.tiptap');
    const say = (what) => problems.push(`look ${JSON.stringify(look)}: ${what}`);
    await page.locator('.toolbar .icon').last().click();
    await page.locator('.menu button', { hasText: 'New note' }).click();
    await page.waitForTimeout(400);
    await page.evaluate((b) => window.__editor.commands.setContent(b, true), '# Look\n\n- [ ] a to-do\n\n<details open><summary>a toggle</summary>\n\nbody\n\n</details>\n\n> [!tip] a callout\n> body\n\n' + Array.from({ length: 10 }, (_, i) => `${i + 1}. item`).join('\n') + '\n');
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const mid = (r) => (r.top + r.bottom) / 2;
      const line = (el) => { const r = document.createRange(); const t = [...el.querySelectorAll('*')].concat(el).flatMap((e) => [...e.childNodes]).find((n) => n.nodeType === 3 && n.textContent.trim()); r.selectNodeContents(t); return r.getClientRects()[0]; };
      const todo = document.querySelector('.tiptap li[data-checked] input'), todoText = line(document.querySelector('.tiptap li[data-checked] p'));
      const arrow = document.querySelector('.tiptap [data-type="details"] > button'), title = line(document.querySelector('.tiptap summary'));
      const emoji = document.querySelector('.tiptap .callout-emoji'), call = line(document.querySelector('.tiptap .callout-body p'));
      const ol = document.querySelector('.tiptap ol'), ten = ol.children[9], col = document.querySelector('.tiptap').getBoundingClientRect().left + parseFloat(getComputedStyle(document.querySelector('.tiptap')).paddingLeft);
      return { todo: mid(todo.getBoundingClientRect()) - mid(todoText), arrow: mid(arrow.getBoundingClientRect()) - mid(title), emoji: mid(emoji.getBoundingClientRect()) - mid(call),
        number: ol.getBoundingClientRect().left - col, ten: Math.round(parseFloat(getComputedStyle(ten, '::before').width) || 0), size: parseFloat(getComputedStyle(document.querySelector('.tiptap p')).fontSize) };
    });
    for (const k of ['todo', 'arrow', 'emoji']) if (Math.abs(m[k]) > 2.5) say(`the ${k}'s marker is ${m[k].toFixed(1)}px off its first line`);
    // the numbers' room: the list's own box starts at the text column, and "10." fits in its padding
    const room = await page.evaluate(() => { const ol = document.querySelector('.tiptap ol'); const li = ol.children[9]; const pad = parseFloat(getComputedStyle(ol).paddingLeft); const r = document.createRange(); const c = getComputedStyle(li, '::before'); return { pad, size: parseFloat(c.fontSize) }; });
    if (look.font !== 'mono' && room.pad < room.size * 1.6) say(`a numbered list keeps ${room.pad}px for its numbers, "10." needs more`);
    await page.close();
  }

  // ---- how far a block reaches, as Notion's: code, a diagram and a picture keep to the text column (scrolling inside
  // it); a table starts where the text does and may run on to the right, short of the pane's edge ----
  for (const w of [1600, 1000]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1000 } });
    await page.goto(URL_);
    await page.waitForSelector('.tiptap');
    await page.locator('.toolbar .icon').last().click();
    await page.locator('.menu button', { hasText: 'New note' }).click();
    await page.waitForTimeout(400);
    const wide = '| ' + Array.from({ length: 12 }, (_, i) => `column number ${i}`).join(' | ') + ' |\n|' + ' --- |'.repeat(12) + '\n| ' + Array.from({ length: 12 }, () => 'some words').join(' | ') + ' |';
    await page.evaluate((b) => window.__editor.commands.setContent(b, true), '# Reach\n\nA line of text.\n\n```js\nconst aVeryLongLine = "this line is long enough to run well past the width of the editor column and on";\n```\n\n```mermaid\nflowchart LR\n  A[Start here] --> B[Second step] --> C[Third step] --> D[Fourth step] --> E[Fifth step] --> F[The end]\n```\n\n' + wide + '\n\nend\n');
    await page.waitForSelector('main .tiptap .diagram-canvas svg', { timeout: 10000 });
    const m = await page.evaluate(() => {
      const R = (e) => e.getBoundingClientRect(), t = document.querySelector('main .tiptap');
      return { pane: R(t.parentElement).right, p: R(t.querySelector(':scope > p')), code: R(t.querySelector(':scope > .code-block:not(.mermaid)')), dia: R(t.querySelector(':scope > .code-block.mermaid')), table: R(t.querySelector(':scope > .tableWrapper')) };
    });
    const say = (what) => problems.push(`reach at ${w}: ${what}`);
    for (const k of ['code', 'dia']) if (Math.abs(m[k].left - m.p.left) > 1 || Math.abs(m[k].right - m.p.right) > 1) say(`${k} is ${Math.round(m[k].left)}–${Math.round(m[k].right)}, not the text column ${Math.round(m.p.left)}–${Math.round(m.p.right)}`);
    if (Math.abs(m.table.left - m.p.left) > 1) say(`a wide table starts at ${Math.round(m.table.left)}, not where the text does (${Math.round(m.p.left)})`);
    if (m.table.right <= m.p.right + 1 || m.table.right > m.pane - 55) say(`a wide table ends at ${Math.round(m.table.right)}: past the column (${Math.round(m.p.right)}), short of the pane's edge (${Math.round(m.pane)}) by 56`);
    await page.close();
  }

  // ---- the page's head, as Notion's: its icon, then the row of what can be added, then the title ("Add cover" sat beside
  // the icon, at its top corner) ----
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await page.goto(URL_);
    await page.waitForSelector('.tiptap');
    await page.locator('.toolbar .icon').last().click();
    await page.locator('.menu button', { hasText: 'New note' }).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__editor.commands.setContent('# A page title\n\nwords', true); const n = window.__notes.current; window.__notes.setIcon(n.id, '🌱'); });
    await page.waitForTimeout(400);
    const h = await page.evaluate(() => { const R = (s) => document.querySelector(s)?.getBoundingClientRect(); return { icon: R('.big-icon'), add: R('.add-cover'), title: R('main .tiptap > :first-child') }; });
    if (!h.add || h.add.top < h.icon.bottom - 1 || h.add.bottom > h.title.top + 1 || Math.abs(h.add.left + 6 - h.title.left) > 3) problems.push(`the head's Add cover is not between the icon and the title, in line with it: ${JSON.stringify(h)}`);
    await page.close();
  }

  // ---- a phone (the bounty's finds): an Android phone's page in WebKit ----
  {
    const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 360, height: 740 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('eve.appearance', JSON.stringify({ ...JSON.parse(localStorage.getItem('eve.appearance') ?? '{}'), dailyNotes: true })));
    await page.goto(URL_);
    await page.waitForSelector('html.mobile');
    const say = (what) => problems.push(`phone: ${what}`);
    const small = (r, n = 40) => !r || r.width < n || r.height < n;
    // a note: a formula's tabs and Done a finger's size; the formatting bar's end fading where it goes on
    await page.evaluate(() => document.querySelector('button.fab[aria-label="New note"]')?.click());
    await page.waitForSelector('.tiptap');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__editor.commands.setContent('# P\n\ntext here\n\n$$\nx^2\n$$\n\n| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n', true));
    await page.waitForTimeout(400);
    await page.evaluate(() => { const ed = window.__editor; let at = 0; ed.state.doc.descendants((n, p) => { if (!at && n.isText && n.text.includes('text here')) at = p + 4; }); ed.commands.focus(at); });
    await page.waitForTimeout(400);
    const bar = await page.evaluate(() => { const t = document.querySelector('.mbar .tools, .tools'); return t && { over: t.scrollWidth - t.clientWidth > 2, faded: t.classList.contains('more-r') }; });
    if (bar?.over && !bar.faded) say('the formatting bar runs past the screen with nothing to say it goes on');
    // (a phone's first tap chooses the formula, the next opens it)
    const mb = await page.locator('.tiptap .math-block').boundingBox();
    for (let i = 0; i < 3 && !(await page.locator('.tabs button').count()); i++) { await page.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.waitForSelector('.tabs button', { timeout: 900 }).catch(() => {}); }
    await page.waitForTimeout(500);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.tabs button, .texb, .done')].filter((b) => b.offsetParent).length);
    if (!shown) say('a formula tapped opened no editor (this check saw nothing)');
    const mathSmall = await page.evaluate(() => [...document.querySelectorAll('.tabs button, .texb, .done')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 40).length);
    if (mathSmall) say(`${mathSmall} of a formula's tabs and buttons are under a finger's size`);
    await page.evaluate(() => document.querySelector('.done')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(400);
    // a table's bar at 360 wide: what does not fit fades at the end
    await page.evaluate(() => { const ed = window.__editor; let at = 0; ed.state.doc.descendants((n, p) => { if (!at && n.isText && n.text === '2') at = p + 1; }); ed.commands.focus(at); });
    await page.waitForTimeout(500);
    const tb = await page.evaluate(() => { const t = document.querySelector('.tbl-tools'); return t && { over: t.scrollWidth - t.clientWidth > 2, faded: t.classList.contains('more-r'), right: t.getBoundingClientRect().right }; });
    if (!tb) say('a table cell chosen showed no table bar (this check saw nothing)');
    // the bar never over the cell being written in
    const over = await page.evaluate(() => { const b = document.querySelector('.tbl-tools')?.getBoundingClientRect(); const c = [...document.querySelectorAll('.tiptap td')].find((t) => t.textContent.trim() === '2')?.getBoundingClientRect(); return b && c && b.left < c.right && c.left < b.right && b.top < c.bottom && c.top < b.bottom; });
    if (over) say('the table\'s bar lies over the cell being written in');
    if (tb && tb.over && !tb.faded) say('the table\'s bar runs past the screen with nothing to say it goes on');
    if (tb && tb.right > 361) say(`the table's bar runs off the screen (${Math.round(tb.right)})`);
    // the calendar on its side: each week tall enough for its day's number
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => (document.activeElement)?.blur?.());
    const back = await page.locator('.mhead button[aria-label="Back"]').first().boundingBox();
    await page.touchscreen.tap(back.x + back.width / 2, back.y + back.height / 2);
    await page.waitForSelector('aside [data-row]');
    await page.waitForTimeout(400);
    await page.evaluate(() => [...document.querySelectorAll('aside [data-row]')].find((r) => r.textContent.includes('Daily notes'))?.click());
    await page.waitForSelector('.day');
    await page.waitForTimeout(300);
    const weeks = await page.evaluate(() => [...document.querySelectorAll('.day')].map((d) => d.getBoundingClientRect().height));
    if (!weeks.length) say('the calendar did not open (this check saw nothing)');
    else if (Math.min(...weeks) < 40) say(`a week of the calendar on its side is ${Math.round(Math.min(...weeks))}px, its numbers run into each other`);
    const navs = await page.evaluate(() => [...document.querySelectorAll('.nav')].map((n) => n.getBoundingClientRect()));
    if (navs.some((r) => small(r))) say('the calendar\'s month arrows are under a finger\'s size');
    await ctx.close();
  }

  if (problems.length) { console.log(problems.map((p) => 'FAIL ' + p).join('\n')); assert.fail(`${problems.length} things out of place`); }
  console.log('ok   every block\'s handle beside it, off its words, in sight, level with its first line — notes and day pages, both themes');
  console.log('ok   a phone: formulas, the formatting and table bars (never over the cell written in), the calendar on its side');
  console.log('ok   Settings\' extremes: markers level at line heights 1.2 and 2.2, numbers with room, a large text in a narrow column');
  console.log('ok   around the note: the toolbar off a cover, the crumbs clear of tabs and Find, Settings still, a toast clear of the list');
  console.log('ok   the calendar, databases and boards at 800×600: rows aligned, menus off their buttons, weeks apart, days as words, keys kept, a card over a day');
} finally {
  await browser.close();
  await server?.close();
}
