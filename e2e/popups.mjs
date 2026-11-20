// Every popup animates in and out, on the Mac (WebKit) and on a phone (a phone's user agent): menus, the "+" menu,
// a code block's language menu,
// a setting's choices, Settings, the confirm dialog, the emoji picker, the / menu, the :emoji row, the @ calendar,
// Find, and the phone's sheets. A transition that silently stopped playing (a local transition inside an {#if}
// made with its parent, say) shows up here as "no".
// For each: it must open, be given an animation (Element.animate with a duration, which is how Svelte runs a
// transition) as it opens and again as it closes, and be gone after. Counted from the calls, not from how it looks
// at some moment, so a slow machine (CI) that is late to look still sees them.
// On the Mac the keyboard must be somewhere after each closes, never left on <body> (where the keys typed next go
// nowhere); a phone leaves it there on purpose, its keyboard down.
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
/** where the keyboard is: false when it is on <body> */
const focused = (page) => page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body);
let keyboard = true; // the Mac's; a phone has no keyboard focus to keep

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
  await page.waitForTimeout(150); // (the emoji picker puts the keyboard back a moment after it closes)
  Object.assign(r, { out: await animated(page, sel, from), closed: !(await present(page, sel)), focus: !keyboard || (await focused(page)) });
  results.push(r);
  console.log(`${ok(r) ? 'pass' : 'FAIL'} ${name.padEnd(28)} opened ${r.opened ? 'yes' : 'no '}  in ${r.in ? 'yes' : 'no '}  out ${r.out ? 'yes' : 'no '}  closed ${r.closed ? 'yes' : 'no '}  focus ${keyboard ? (r.focus ? 'kept' : 'LOST to <body>') : '-'}`);
}

const ok = (r) => r.opened && r.in && r.out && r.closed && r.focus;

async function newNote(page, mobile) {
  await page.locator(mobile ? 'button[aria-label="New note"]:visible' : 'button[data-tip="New note"]:visible').first().click().catch(() => {});
  await page.waitForTimeout(400);
  // a phone's + asks: a note (or today's note)
  if (mobile) await page.getByRole('menuitem', { name: 'New note' }).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
  if (!(await page.locator('.tiptap').count())) { await page.keyboard.press('ControlOrMeta+n'); await page.waitForTimeout(400); }
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
  await check(page, '"+" menu', '.menu, .plus-menu', async () => { await row().focus(); await page.keyboard.press('ControlOrMeta+n'); }, esc);
  await check(page, 'emoji picker', '.panel', () => row().locator('.ico-slot').click(), esc);
  await check(page, 'confirm', '.box', async () => { await row().focus(); await page.keyboard.press('Backspace'); }, esc);
  await page.locator('.tiptap').click();
  await page.keyboard.press('End');
  await check(page, 'find', '.find', () => page.keyboard.press('ControlOrMeta+f'), esc);
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
  // a picture chosen by the keyboard, shown by Space: one Esc puts it away (it took two once)
  await page.evaluate(() => { const e = window.__editor; e.commands.insertContentAt(e.state.doc.content.size, { type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } }); });
  await page.evaluate(() => { const e = window.__editor; let at = -1; e.state.doc.descendants((n, p) => { if (n.type.name === 'image') at = p; }); e.commands.setNodeSelection(at); e.commands.focus(); });
  await check(page, 'picture (Space)', 'div.viewer', () => page.keyboard.press('Space'), esc);
  await check(page, 'settings', '.panel', () => page.locator('button[data-tip="Settings"]').first().click(), esc);
  await page.locator('button[data-tip="Settings"]').first().click();
  await page.waitForTimeout(400);
  await page.getByText('Appearance', { exact: true }).click();
  await check(page, "a setting's choices", '.pop', () => page.locator('button.select').first().click(), esc);
  await page.close();
}

// ---- every dropdown opened by the pointer: the keyboard is in it at once, and ↓ moves through it ----
// (the pickers that come up as you type, / [[ @ :, leave the keyboard in the text so typing narrows them: their ↑↓ are
// held by pickerKeys.dom.test.ts)
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.on('pageerror', (e) => errors.push(`dropdowns: ${e.message}`));
  await page.goto(URL_);
  await page.waitForSelector('.tiptap');
  await newNote(page, false);
  await page.keyboard.type('A line');
  await page.evaluate(() => {
    const e = window.__editor;
    e.commands.insertContentAt(e.state.doc.content.size, '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><pre><code class="language-js">let x = 1;</code></pre>');
  });
  await page.waitForTimeout(400);
  const where = () => page.evaluate(() => {
    let a = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    const up = (n) => n.parentElement ?? n.getRootNode().host ?? null;
    let pop = null;
    for (let n = a; n && !pop; n = up(n)) if (n.matches?.('.menu, [role="listbox"], emoji-picker')) pop = n;
    if (pop) { a.dataset.probe ??= String(Math.random()); }
    return { inside: !!pop, id: a?.dataset?.probe ?? null, what: a ? `<${a.tagName.toLowerCase()}> ${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 24)}` : 'nothing' };
  });
  const hoverOn = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + 2, b.y + b.height / 2); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300); };
  const dropdown = async (name, open) => {
    let r;
    try {
      await open();
      await page.waitForTimeout(500);
      const a = await where();
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120);
      const b = await where();
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120);
      const c = await where();
      r = { name, opened: true, in: a.inside, out: b.inside && c.inside && b.id !== a.id && c.id !== b.id, closed: true, focus: true };
      console.log(`${ok(r) ? 'pass' : 'FAIL'} ${name.padEnd(28)} opened, keyboard on ${a.inside ? '' : 'NOT '}it: ${a.what}  ↓ ${b.what}  ↓ ${c.what}`);
    } catch (e) {
      r = { name, opened: false };
      console.log(`FAIL ${name.padEnd(28)} did not open: ${e.message.split('\n')[0]}`);
    }
    results.push(r);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  };
  await dropdown('block menu (⋮⋮)', async () => { await hoverOn('.tiptap p'); await page.locator('.block-handle button.grip').click(); });
  await dropdown('table row menu', async () => { await hoverOn('.tiptap td'); await page.locator('.tbl-grip.row').click(); });
  await dropdown('table column menu', async () => { await hoverOn('.tiptap th'); await page.locator('.tbl-grip.col').click(); });
  await dropdown('code language menu', async () => { await hoverOn('.code-block'); await page.locator('.code-lang').click(); });
  await dropdown('note menu (…)', () => page.locator('button.note-more').click());
  await dropdown('sidebar row menu', () => page.locator('aside [data-note]').last().click({ button: 'right' }));
  await dropdown('emoji picker', () => page.locator('aside [data-note]').last().locator('.ico-slot').click());
  {
    // ↓ pressed the moment it opens, before its emoji are drawn (a first open on a slow machine): it lands on the first
    // one once they are, rather than being lost
    await page.evaluate(() => indexedDB.databases?.().then((dbs) => dbs.forEach((d) => indexedDB.deleteDatabase(d.name))));
    await page.reload();
    await page.waitForSelector('.tiptap');
    await page.locator('aside [data-note]').last().locator('.ico-slot').click();
    await page.waitForFunction(() => document.querySelector('emoji-picker')?.shadowRoot?.activeElement?.matches('input'), null, { timeout: 10_000 }).catch(() => {});
    await page.keyboard.press('ArrowDown');
    const onCell = await page.waitForFunction(() => document.querySelector('emoji-picker')?.shadowRoot?.activeElement?.matches('button.emoji'), null, { timeout: 10_000 }).then(() => true, () => false);
    const r = { name: 'emoji picker, ↓ at once', opened: true, in: onCell, out: true, closed: true, focus: true };
    results.push(r);
    console.log(`${ok(r) ? 'pass' : 'FAIL'} ${r.name.padEnd(28)} ↓ before the emoji were drawn ${onCell ? 'went to the first one' : 'was LOST'}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  }
  await page.locator('button[data-tip="Settings"]').first().click();
  await page.waitForTimeout(400);
  await page.getByText('Appearance', { exact: true }).click();
  await page.waitForTimeout(300);
  for (const label of ['Theme', 'Editor font', 'Code colors']) await dropdown(`a setting's choices (${label})`, () => page.locator(`button.select[aria-label="${label}"]`).click());
  await page.close();
}

// ---- a phone ----
keyboard = false;
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
const bad = results.filter((r) => !ok(r));
for (const e of errors) console.log(`page error: ${e}`);
console.log(`${results.length - bad.length}/${results.length} pass, ${errors.length} page errors`);
process.exit(bad.length || errors.length ? 1 : 0);
