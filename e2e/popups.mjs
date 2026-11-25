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
  await check(page, 'emoji picker', '.panel', () => page.locator('aside .note-row').last().locator('.ico-slot').click(), esc);
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
  // gone before it is typed for again: brought back while it still goes, Svelte turns that going round from where it
  // is, and a row only just going comes back with no animation of its own to count
  await page.waitForFunction(() => !document.querySelector('.emoji-row'), null, { timeout: 10_000 });
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
    const a = document.activeElement;
    const pop = a?.closest('.menu, [role="listbox"], [aria-label="Choose an icon"]');
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
  await dropdown('emoji picker', async () => {
    await page.locator('aside .note-row').last().locator('.ico-slot').click();
    await page.waitForSelector('[aria-label="Choose an icon"] .grid .cell', { timeout: 10_000 });
  });
  {
    // ↓ pressed the moment it opens, before its emoji are loaded (a first open on a slow machine): it lands on the first
    // one once they are, rather than being lost
    await page.route('**/emojibase/data.json*', async (r) => { await new Promise((w) => setTimeout(w, 1500)); await r.continue(); });
    await page.reload();
    await page.waitForSelector('.tiptap');
    await page.locator('aside .note-row').last().locator('.ico-slot').click();
    await page.waitForFunction(() => document.activeElement?.matches('[aria-label="Choose an icon"] input.search'), null, { timeout: 10_000 }).catch(() => {});
    const early = await page.locator('[aria-label="Choose an icon"] .grid .cell').count() === 0;
    await page.keyboard.press('ArrowDown');
    const onCell = await page.waitForFunction(() => document.activeElement?.matches('[aria-label="Choose an icon"] .grid .cell'), null, { timeout: 10_000 }).then(() => true, () => false);
    await page.unroute('**/emojibase/data.json*');
    const r = { name: 'emoji picker, ↓ at once', opened: true, in: early && onCell, out: true, closed: true, focus: true };
    results.push(r);
    console.log(`${ok(r) ? 'pass' : 'FAIL'} ${r.name.padEnd(28)} ↓ ${early ? 'before' : 'NOT before'} the emoji were loaded ${onCell ? 'went to the first one' : 'was LOST'}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  }
  await page.locator('button[data-tip="Settings"]').first().click();
  await page.waitForTimeout(400);
  await page.getByText('Appearance', { exact: true }).click();
  await page.waitForTimeout(300);
  for (const label of ['Theme', 'Editor font', 'Code colors']) await dropdown(`a setting's choices (${label})`, () => page.locator(`button.select[aria-label="${label}"]`).click());
  await page.close();
}

// ---- the document panel: a document that takes the keyboard as it loads gives it back to the note; one clicked into
// keeps it ----
// (the give-back watched the first 2.5 s and took the keyboard from a person who had clicked into the document to type
// or search in it, a press inside the frame never reaching the panel.) Playwright's WebKit draws no PDF in a frame, so
// a page stands in for WebKit's PDF view: the same iframe, the same keyboard.
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => errors.push(`document panel: ${e.message}`));
  const doc = (takes) => `<!doctype html><body style="margin:0"><textarea style="width:100%;height:300px"></textarea>${takes ? '<script>addEventListener("load", () => { document.querySelector("textarea").focus(); window.took = true; })</script>' : ''}`;
  await page.route('**/*.pdf', (r) => r.fulfill({ body: doc(r.request().url().includes('takes')), contentType: 'text/html' }));
  await page.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); },
    '# Doc\n\n[takes.pdf](takes.pdf)\n\n[clicked.pdf](clicked.pdf)\n\nAfter.\n');
  await page.goto(URL_);
  const note = () => page.evaluate(() => window.__editor.getText());
  const inDoc = () => page.frameLocator('.pdf-panel iframe').locator('textarea');
  await page.click('.tiptap p:has-text("After.")');
  await page.keyboard.press('End');

  let name = 'document panel, taken on load';
  try {
    await page.click('.tiptap .pdf-card:has-text("takes.pdf")');
    await inDoc().waitFor();
    await page.frames().find((f) => f.url().includes('takes.pdf')).waitForFunction(() => window.took);
    const back = await page.waitForFunction(() => !!document.activeElement?.closest('.tiptap'), null, { timeout: 5000 }).then(() => true, () => false);
    await page.keyboard.type(' typed');
    const typed = (await note()).includes('typed') && (await inDoc().inputValue()) === '';
    await page.keyboard.press('Escape');
    const closed = await page.locator('.pdf-panel').waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
    const r = { name, opened: true, in: back, out: typed, closed, focus: await focused(page) };
    results.push(r);
    console.log(`${ok(r) ? 'pass' : 'FAIL'} ${name.padEnd(28)} keyboard ${back ? 'back in the note' : 'LEFT in the document'}, typing ${typed ? 'into the note' : 'NOT into the note'}, Esc ${closed ? 'closed it' : 'did NOT close it'}`);
  } catch (e) {
    results.push({ name, opened: false });
    console.log(`FAIL ${name.padEnd(28)} ${e.message.split('\n')[0]}`);
  }

  name = 'document panel, clicked into';
  try {
    await page.click('.tiptap .pdf-card:has-text("clicked.pdf")');
    await inDoc().click();
    const before = await note();
    await page.keyboard.type('hello', { delay: 60 }); // a person's pace: the old give-back looked every 100 ms
    const kept = (await inDoc().inputValue()) === 'hello', untouched = (await note()) === before;
    await page.click('.pdf-panel button[aria-label="Close"]');
    const closed = await page.locator('.pdf-panel').waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
    const r = { name, opened: true, in: kept, out: untouched, closed, focus: await focused(page) };
    results.push(r);
    console.log(`${ok(r) ? 'pass' : 'FAIL'} ${name.padEnd(28)} typing ${kept ? 'into the document' : 'NOT all into the document'}, the note ${untouched ? 'untouched' : 'TYPED INTO'}`);
  } catch (e) {
    results.push({ name, opened: false });
    console.log(`FAIL ${name.padEnd(28)} ${e.message.split('\n')[0]}`);
  }
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
