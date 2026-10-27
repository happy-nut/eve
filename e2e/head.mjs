// The page's head in every state it can be in, in every window it is drawn in (WebKit). Its rules were spread over
// the Mac's, the phone's, tabs' and a cover's, each written for the case in front of it, and one kept breaking
// another: the icon over the title in a phone's PDF, Add cover beside the icon, the crumbs through the icon with tabs
// open, the phone's Add cover over the title. So: every window × icon × cover × links here × a page under another,
// and in each, top to bottom: (the cover,) the icon, the row of what can be added, the title — none over another,
// none under the window's own bars, in sight, in line with the title.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:head
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
const problems = [];
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const WINDOWS = [
  { name: 'Mac', viewport: { width: 1100, height: 700 } },
  { name: 'Mac, tabs open', viewport: { width: 1100, height: 700 }, tabs: true },
  { name: 'Mac, sidebar closed', viewport: { width: 900, height: 640 }, noSidebar: true },
  { name: 'phone', viewport: { width: 360, height: 740 }, phone: true },
  { name: 'wide phone', viewport: { width: 412, height: 900 }, phone: true },
];

/** where each part of the head is, and the window's own bars it must stay clear of */
const measure = (page) => page.evaluate(() => {
  const R = (el) => { const r = el?.getBoundingClientRect(); return r && r.width && r.height ? { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right } : null; };
  const q = (s) => document.querySelector(s);
  return {
    cover: R(q('main .scroll > .cover')),
    icon: R(q('.page-head .big-icon')),
    controls: [...document.querySelectorAll('.page-controls > button')].map((b) => ({ cls: b.className, ...R(b) })).filter((b) => b.w),
    title: q('main .tiptap > :first-child') && { ...R(q('main .tiptap > :first-child')), text: q('main .tiptap > :first-child').textContent },
    bars: [['crumbs', q('.crumbs')], ['toolbar', q('main .toolbar, .toolbar')], ['phone bar', q('.mhead')], ['tabs', q('.tabbar')]]
      .map(([name, el]) => ({ name, ...R(el) })).filter((b) => b.w),
    // the crumbs as words: their box spans the row, only what is in it can sit over the head
    crumbs: [...document.querySelectorAll('.crumbs .crumb')].map((c) => ({ name: 'crumbs', ...R(c) })).filter((b) => b.w),
    head: (() => { const h = q('.page-head'); return h && { over: h.scrollHeight - h.clientHeight }; })(),
    vw: innerWidth,
  };
});

const meet = (a, b) => a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;

function check(m, say) {
  if (!m.title) return say('no title to measure');
  if (m.head?.over > 1) say(`the head holds ${m.head.over}px more than its box: it runs over what follows`);
  const parts = [['icon', m.icon], ...m.controls.map((c) => [c.cls.includes('add-cover') ? 'Add cover' : c.cls.includes('backlinks') ? 'links here' : 'Add icon', c]), ['title', m.title]];
  // top to bottom, none over the next
  const row = m.controls.length ? { y: Math.min(...m.controls.map((c) => c.y)), b: Math.max(...m.controls.map((c) => c.b)) } : null;
  if (m.icon && row && row.y < m.icon.b - 1) say(`the row (${Math.round(row.y)}) starts above the icon's foot (${Math.round(m.icon.b)})`);
  if (row && m.title.y < row.b - 1) say(`the title (${Math.round(m.title.y)}) starts above the row's foot (${Math.round(row.b)})`);
  if (m.icon && m.title.y < m.icon.b - 1) say(`the title (${Math.round(m.title.y)}) starts above the icon's foot (${Math.round(m.icon.b)})`);
  // nothing left between them to read as a gap: the icon close over its title
  if (m.icon && m.title.y - m.icon.b > 56) say(`${Math.round(m.title.y - m.icon.b)}px between the icon and the title`);
  // a cover: the icon half over its lower edge, the rest under it
  if (m.cover) {
    if (m.icon && Math.abs(m.icon.y + m.icon.h / 2 - m.cover.b) > 14) say(`the icon's middle (${Math.round(m.icon.y + m.icon.h / 2)}) is not on the cover's lower edge (${Math.round(m.cover.b)})`);
    for (const [name, r] of parts) if (name !== 'icon' && r && r.y < m.cover.b - 1) say(`${name} lies on the cover`);
  }
  // clear of the window's bars, in sight across
  for (const [name, r] of parts) {
    if (!r) continue;
    for (const bar of [...m.bars.filter((b) => b.name !== 'crumbs'), ...m.crumbs]) if (meet(r, bar)) say(`${name} lies under the ${bar.name}`);
    if (r.x < 0 || r.r > m.vw + 0.5) say(`${name} runs off the window (${Math.round(r.x)}–${Math.round(r.r)} of ${m.vw})`);
  }
  // in line with the title: the icon's glyph and the first button's words start where the title does
  if (m.icon && Math.abs(m.icon.x + 4 - m.title.x) > 3) say(`the icon (${Math.round(m.icon.x + 4)}) is not in line with the title (${Math.round(m.title.x)})`);
  const first = m.controls[0];
  if (first && !first.cls.includes('backlinks') && Math.abs(first.x + 6 - m.title.x) > 3) say(`the row (${Math.round(first.x + 6)}) is not in line with the title (${Math.round(m.title.x)})`);
}

try {
  for (const win of WINDOWS) {
    const ctx = await browser.newContext({ viewport: win.viewport, ...(win.phone ? { userAgent: PHONE_UA, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    await page.goto(URL_);
    // a note to look at, opened as a person opens one; a note to hold it as a page, and one to link to it
    if (win.phone) {
      await page.waitForSelector('html.mobile');
      await page.locator('button.fab[aria-label="New note"]').click();
      await page.locator('.sheet button', { hasText: 'New note' }).click();
    } else {
      await page.waitForSelector('.tiptap');
      await page.locator('.toolbar .icon').last().click();
      await page.locator('.menu button', { hasText: 'New note' }).click();
    }
    await page.waitForSelector('.tiptap');
    await page.evaluate(() => {
      window.__editor.commands.setContent('# The page in question\n\nwords under the title\n', true);
      const n = window.__notes.current;
      window.__head = { id: n.id, holder: window.__notes.addImported('# A holder\n\nits words\n').id, linker: window.__notes.addImported('# A linker\n\nnothing yet\n').id };
    });
    // tabs: the holder ⌘-clicked into a tab of its own, then back to the note's
    if (win.tabs) {
      await page.locator('aside [data-row]', { hasText: 'A holder' }).click({ modifiers: ['Meta'] });
      await page.waitForSelector('.tabbar');
      await page.locator('.tabbar [role="tab"]', { hasText: 'The page in question' }).click();
    }
    if (win.noSidebar) await page.locator('.toolbar button[aria-label="Sidebar"]').click();
    await page.waitForTimeout(400);
    for (const icon of [false, true]) for (const cover of [false, true]) for (const links of [false, true]) for (const under of [false, true]) {
      await page.evaluate(([icon, cover, links, under]) => {
        const { id, holder, linker } = window.__head, s = window.__notes;
        s.setIcon(id, icon ? '😍' : '');
        s.setLook(id, { cover: cover ? 'sea' : undefined });
        s.update(linker, links ? '# A linker\n\nsee [[The page in question]]\n' : '# A linker\n\nnothing yet\n');
        s.setParent(id, under ? holder : null);
      }, [icon, cover, links, under]);
      await page.waitForTimeout(250);
      // a Mac shows the row as the page is hovered
      if (!win.phone) await page.mouse.move(win.viewport.width - 40, win.viewport.height / 2);
      await page.waitForTimeout(200);
      const state = [icon && 'icon', cover && 'cover', links && 'links here', under && 'a page under another'].filter(Boolean).join(', ') || 'bare';
      const m = await measure(page);
      if (m.title?.text !== 'The page in question') problems.push(`${win.name}, ${state}: measured another note (${m.title?.text})`);
      check(m, (what) => problems.push(`${win.name}, ${state}: ${what}`));
    }
    await ctx.close();
  }
  if (problems.length) { console.log(problems.map((p) => 'FAIL ' + p).join('\n')); assert.fail(`${problems.length} things out of place`); }
  console.log(`ok   the page's head in ${WINDOWS.length} windows × 16 states: cover, icon, row, title in order, clear of the bars, in line`);
} finally {
  await browser.close();
  await server?.close();
}
