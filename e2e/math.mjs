// Formulas (math.ts, MathEdit.svelte): made from the / menu, by typing $x$ or $$, edited in place by clicks on the
// row of parts or by typing as the formula looks; Done, Esc or a click elsewhere finish; an emptied one goes; the
// note keeps $…$ and $$…$$; ⌘Z undoes into it; its TeX can be edited too; dollars that are money stay text.
// Chromium: CHROMIUM_PATH=/path/to/chromium, else Playwright's own. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:math
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function open(body) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); }, body);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap p');
  return page;
}
const md = (page) => page.evaluate(() => window.__editor.storage.markdown.getMarkdown());
const field = (page) => page.waitForSelector('.tiptap math-field', { timeout: 15000 }).then(() => page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD'));
const settle = (page) => page.waitForTimeout(250); // MathLive's input event comes a moment after the key
async function slash(page, item) {
  await page.locator('.tiptap > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/' + item);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
}

try {
  // ---- a block from the / menu, built by clicks ----
  let page = await open('# Sums\n\nHalf:\n');
  await slash(page, 'equation');
  await field(page);
  await page.locator('.tiptap .math-edit .part[aria-label="Fraction"]').click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await page.keyboard.press('Tab'); // out of the fraction
  await page.keyboard.type('+');
  await page.locator('.tiptap .math-edit button[role="tab"]', { hasText: 'Greek' }).click();
  await page.locator('.tiptap .math-edit .part[aria-label="pi"]').click();
  await settle(page);
  await page.locator('.tiptap .math-edit .done').click();
  await page.waitForFunction(() => !document.querySelector('.tiptap math-field'));
  assert.match(await md(page), /\$\$\n\\frac\{1\}\{2\}\+\\pi\n\$\$/, 'the block, as TeX in the note');
  assert.equal(await page.locator('.tiptap .math-block .ML__latex').count(), 1, 'drawn');
  console.log('ok   / menu: a block made by clicks, in the note as $$…$$');

  // ⌘Z from the note undoes into it
  await page.locator('.tiptap h1').click();
  await page.keyboard.press('Control+z');
  await settle(page);
  assert.doesNotMatch(await md(page), /\\pi/, 'undo reaches the formula');
  await page.keyboard.press('Control+Shift+z');
  await settle(page);
  assert.match(await md(page), /\\frac\{1\}\{2\}\+\\pi/, 'and redo brings it back');
  console.log('ok   undo and redo: into the formula');

  // its TeX, edited
  await page.locator('.tiptap .math-block').click();
  await field(page);
  await page.locator('.tiptap .math-edit .texb').click();
  await page.locator('.tiptap .math-edit .texin').fill('\\sqrt{x}');
  await settle(page);
  assert.match(await md(page), /\$\$\n\\sqrt\{x\}\n\$\$/, 'TeX typed reaches the note');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.tiptap math-field'));
  console.log('ok   TeX: edited as text');
  await page.close();

  // ---- in a line: the / menu, typing as it looks, Esc back to the text ----
  page = await open('# Line\n\nIt costs $5 and $10.\n');
  await page.locator('.tiptap > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Area ');
  await page.keyboard.type('/inline');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await field(page);
  await page.keyboard.type('pi r^2');
  await settle(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.tiptap math-field'));
  await page.keyboard.type(' done');
  let text = await md(page);
  assert.match(text, /It costs \$5 and \$10\. Area \$\\pi r\^\{?2\}?\$ done/, 'the formula in the line, the caret after it, money untouched');
  console.log('ok   inline: typed as it looks; Esc puts the caret after it');

  // ---- typed with dollars ----
  await page.keyboard.type(' and $a+b$ too');
  await settle(page);
  text = await md(page);
  assert.match(text, / and \$a\+b\$ too/);
  assert.equal(await page.locator('.tiptap .math-inline').count(), 2, '$a+b$ became a formula');
  await page.keyboard.press('Enter');
  await page.keyboard.type('$$ ');
  await field(page);
  await page.keyboard.type('x');
  await settle(page);
  await page.locator('.tiptap h1').click(); // elsewhere: done
  await page.waitForFunction(() => !document.querySelector('.tiptap math-field'));
  assert.match(await md(page), /\$\$\nx\n\$\$/, '$$ and a space: a block');
  console.log('ok   typed: $a+b$ in a line, $$ for a block; a click elsewhere is done');

  // ---- emptied: gone ----
  await page.locator('.tiptap .math-block').click();
  await field(page);
  await page.keyboard.press('Backspace');
  await settle(page);
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => !document.querySelector('.tiptap .math-block'));
  await slash(page, 'equation');
  await field(page);
  await page.locator('.tiptap h1').click();
  await page.waitForFunction(() => !document.querySelector('.tiptap .math-block'));
  assert.doesNotMatch(await md(page), /\$\$/);
  console.log('ok   an emptied formula, or one left empty, is not kept');
  await page.close();

  // ---- a note not in the editor's own spelling, a formula in a table ----
  page = await open('Title\n=====\n\n* one\n* two\n\n| a | b |\n|---|---|\n| $x$ | 2 |\n');
  // the note read anew, as a sync does: the editor keeps the formula's view for the equal node it now holds
  await page.evaluate(() => { const e = window.__editor; e.commands.setContent(e.storage.markdown.getMarkdown()); });
  await page.locator('.tiptap td .math-inline').click();
  await field(page);
  const pop = await page.locator('.tiptap .math-edit .tools.pop').boundingBox();
  assert.ok(pop && pop.height > 40 && pop.y + pop.height <= 900 && pop.x >= 0, 'its row shows whole, not cut by the table');
  await page.keyboard.press('End');
  await page.keyboard.type('+a');
  await page.locator('.tiptap .math-edit .part[aria-label="Fraction"]').click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await settle(page);
  assert.match(await md(page), /\| \$x\+a\\frac\{1\}\{2\}\$ \| 2 \|/, 'kept in the note: an empty part, the term before it left alone');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.tiptap math-field'));
  console.log('ok   a note read anew (a sync): changes kept; in a table its row shows; a part does not take the term before it');

  // a matrix, a row more; ↓ out of a block leaves without an error
  await slash(page, 'equation');
  await field(page);
  await page.locator('.tiptap .math-edit button[role="tab"]', { hasText: 'Matrix' }).click();
  await page.locator('.tiptap .math-edit .part').first().click();
  await page.keyboard.type('a');
  await page.locator('.tiptap .math-edit .part[aria-label="Add a row (in a matrix)"]').click();
  await page.waitForFunction(() => ((window.__editor.storage.markdown.getMarkdown().match(/\$\$\n([\s\S]*?)\n\$\$/)?.[1] ?? '').match(/\\\\/g) ?? []).length >= 2, null, { timeout: 5000 }).catch(() => {});
  const rows = (await md(page)).match(/\$\$\n([\s\S]*?)\n\$\$/)?.[1] ?? '';
  assert.equal((rows.match(/\\\\/g) ?? []).length >= 2, true, 'a row added: ' + rows);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => !document.querySelector('.tiptap math-field'));
  console.log('ok   matrix: a row added from the row of parts; ↓ leaves the formula');
  await page.close();

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
