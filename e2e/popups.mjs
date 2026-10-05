// Every popup animates in and out, on the Mac (WebKit) and on a phone (a phone's user agent): menus, the "+" menu,
// a code block's language menu,
// a setting's choices, Settings, the confirm dialog, the emoji picker, the / menu, the :emoji row, the @ calendar,
// Find, and the phone's sheets. A transition that silently stopped playing (a local transition inside an {#if}
// made with its parent, say) shows up here as "no".
// For each: it must open, be given an animation (Element.animate with a duration, which is how Svelte runs a
// transition) as it opens and again as it closes, and be gone after. Counted from the calls, not from how it looks
// at some moment, so a slow machine (CI) that is late to look still sees them.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:popups
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
const results = [];
const errors = [];

/** every Element.animate with a duration, as it is called: Svelte's transitions run through it */
const RECORD = () => {
  const seen = (window.__animated = []);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const ms = typeof options === 'number' ? options : options?.duration;
    if (ms > 0) seen.push(this);
    return animate.call(this, keyframes, options);
  };
};
const mark = (page) => page.evaluate(() => window.__animated.length);
/** was an element matching `sel` animated since `from`? */
const animated = (page, sel, from) => page.evaluate(([sel, from]) => window.__animated.slice(from).some((el) => el.matches(sel)), [sel, from]);
const present = (page, sel) => page.locator(sel).count().then((n) => n > 0);

/** opens it, checks it animated in, closes it, checks it animated out and went; `open` and `close` drive the page */
async function check(page, name, sel, open, close) {
  let from = await mark(page);
  await open();
  // until it is there (a popup loaded on first use, as the emoji picker is, takes a while on a slow machine)
  await page.locator(sel).last().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
  const r = { name, opened: await present(page, sel), in: await animated(page, sel, from) };
  from = await mark(page);
  await close();
  await page.waitForFunction((sel) => !document.querySelector(sel), sel, { timeout: 10_000 }).catch(() => {});
  Object.assign(r, { out: await animated(page, sel, from), closed: !(await present(page, sel)) });
  results.push(r);
  console.log(`${r.opened && r.in && r.out && r.closed ? 'pass' : 'FAIL'} ${name.padEnd(28)} opened ${r.opened ? 'yes' : 'no '}  in ${r.in ? 'yes' : 'no '}  out ${r.out ? 'yes' : 'no '}  closed ${r.closed ? 'yes' : 'no'}`);
}

async function newNote(page, mobile) {
  await page.locator(mobile ? 'button[aria-label="New note"]:visible' : 'button[data-tip="New note"]:visible').first().click().catch(() => {});
  await page.waitForTimeout(400);
  if (!(await page.locator('.tiptap').count())) { await page.keyboard.press('Meta+n'); await page.waitForTimeout(400); }
  await page.locator('.tiptap').click();
  await page.keyboard.type('Popups');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

// ---- the Mac ----
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(RECORD);
  page.on('pageerror', (e) => errors.push(`mac: ${e.message}`));
  await page.goto(URL_);
  await page.waitForSelector('.tiptap');
  await newNote(page, false);
  const esc = () => page.keyboard.press('Escape');
  const row = () => page.locator('aside [data-note]').last();

  await check(page, 'menu (right click)', '.menu', () => row().click({ button: 'right' }), esc);
  await check(page, '"+" menu', '.menu, .plus-menu', async () => { await row().focus(); await page.keyboard.press('Meta+n'); }, esc);
  await check(page, 'emoji picker', '.panel', () => row().locator('.ico-slot').click(), esc);
  await check(page, 'confirm', '.box', async () => { await row().focus(); await page.keyboard.press('Backspace'); }, esc);
  await page.locator('.tiptap').click();
  await page.keyboard.press('End');
  await check(page, 'find', '.find', () => page.keyboard.press('Meta+f'), esc);
  await page.locator('.tiptap').click();
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('Enter');
  await check(page, '/ menu', '.suggest', () => page.keyboard.type('/'), async () => { await esc(); await page.keyboard.press('Backspace'); });
  await page.keyboard.type(':sm');
  await page.waitForTimeout(300); // the emoji list loads once; after that the row comes up as you type
  await esc();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await check(page, ':emoji row', '.emoji-row', () => page.keyboard.type(':sm'), async () => { await esc(); for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace'); });
  await check(page, '@ calendar', '.cal', () => page.keyboard.type('@'), async () => { await esc(); await page.keyboard.press('Backspace'); });
  await page.keyboard.type('```');
  await page.keyboard.press('Enter');
  await page.keyboard.type('const x = 1');
  await page.locator('.code-block').hover();
  await check(page, 'code language menu', '.menu', () => page.locator('.code-lang').click(), esc);
  await check(page, 'settings', '.panel', () => page.locator('button[data-tip="Settings"]').first().click(), esc);
  await page.locator('button[data-tip="Settings"]').first().click();
  await page.waitForTimeout(400);
  await page.getByText('Appearance', { exact: true }).click();
  await check(page, "a setting's choices", '.pop', () => page.locator('button.select').first().click(), esc);
  await page.close();
}

// ---- a phone ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile' });
  const page = await ctx.newPage();
  await page.addInitScript(RECORD);
  page.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await page.goto(URL_);
  await page.waitForTimeout(1500);
  await newNote(page, true);
  const tapOut = () => page.mouse.click(200, 60);
  await check(page, 'phone: note menu sheet', '.sheet', () => page.locator('button[aria-label="More"]:visible').first().click(), tapOut);
  await check(page, 'phone: confirm sheet', '.box', () => page.locator('button[aria-label="Delete note"]:visible').first().click(),
    () => page.locator('.box button', { hasText: 'Cancel' }).click());
  await page.locator('button[aria-label="Back"]:visible').first().click();
  await page.waitForTimeout(400);
  await page.locator('button[aria-label="Settings"]:visible').first().click();
  await page.waitForTimeout(400);
  await page.getByText('Appearance', { exact: true }).click();
  await check(page, "phone: a setting's sheet", '.sheet', () => page.locator('button.select').first().click(), tapOut);
  await ctx.close();
}

await browser.close();
await server?.close();
const bad = results.filter((r) => !(r.opened && r.in && r.out && r.closed));
for (const e of errors) console.log(`page error: ${e}`);
console.log(`${results.length - bad.length}/${results.length} pass, ${errors.length} page errors`);
process.exit(bad.length || errors.length ? 1 : 0);
