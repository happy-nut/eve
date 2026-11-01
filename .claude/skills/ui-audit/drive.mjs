// Drives Eve in WebKit the way a person would, and screenshots each step.
//   node .claude/skills/ui-audit/drive.mjs <note.md> <steps.mjs> <out-dir> [--phone]
// <note.md> is the body of the one open note (markdown). <steps.mjs> default-exports `async (t) => {...}`.
// t.page (Playwright page), t.shot(label, locator?), t.click(selector), t.spot(key) (a diagram part by data-spot),
// t.type(text), t.key(name), t.mod ('Meta' on a Mac host, else 'Control'), t.wait(ms), t.markdown() (the note as it would be saved).
// Prints the saved markdown, page errors and console errors at the end, and screenshots where a step threw.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [noteFile, stepsFile, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PHONE = process.argv.includes('--phone');
if (!noteFile || !stepsFile || !outDir) { console.error('usage: drive.mjs <note.md> <steps.mjs> <out-dir> [--phone]'); process.exit(2); }
const REPO = resolve(import.meta.dirname, '../../..');
const req = createRequire(`${REPO}/package.json`);
const { webkit } = req('playwright-core');
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href);
const body = readFileSync(noteFile, 'utf8');
const steps = (await import(pathToFileURL(resolve(stepsFile)).href)).default;
mkdirSync(outDir, { recursive: true });

process.chdir(REPO);
const server = await createServer({ root: REPO, server: { port: 0 }, logLevel: 'error' }).then((s) => s.listen());
const browser = await webkit.launch();
const ctx = await browser.newContext(PHONE
  ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' }
  : { viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
// seeded once, so a reload in the steps keeps what was typed; the note opens on start (the phone's list too)
await page.addInitScript((b) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${b}`);
  localStorage.setItem('eve.lastNote', 'a');
}, body);
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.tiptap', { timeout: 20000 });
await page.waitForTimeout(1000);

let n = 0;
const t = {
  page,
  mod: process.platform === 'darwin' ? 'Meta' : 'Control', // WebKit takes the host's keys, a phone window too
  wait: (ms = 300) => page.waitForTimeout(ms),
  shot: async (label, locator) => {
    await page.waitForTimeout(300);
    const path = `${outDir}/${PHONE ? 'phone' : 'mac'}-${String(++n).padStart(2, '0')}-${label}.png`;
    await (locator ? page.locator(locator).first().screenshot({ path }) : page.screenshot({ path }));
    console.log('shot', path);
  },
  // by mouse at the element's centre: Playwright's own click misplaces SVG text and arcs
  click: async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`nothing at ${selector}`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
  },
  spot: async (key) => {
    const at = await page.evaluate((k) => {
      const all = [...document.querySelectorAll(`.tiptap [data-spot="${k}"]`)];
      const el = all.find((e) => e.textContent.trim()) ?? all[0];
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, key);
    if (!at) throw new Error(`no spot ${key}`);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(400);
  },
  type: (text) => page.keyboard.type(text),
  key: (name) => page.keyboard.press(name),
  markdown: () => page.evaluate(() => window.__editor?.storage.markdown.getMarkdown() ?? ''),
};

let failed = false;
try { await steps(t); } catch (e) {
  failed = true;
  console.log('STOPPED', e.message.split('\n').slice(0, 4).join(' | '));
  await page.screenshot({ path: `${outDir}/${PHONE ? 'phone' : 'mac'}-99-stopped.png` });
}
console.log(`--- saved markdown ---\n${await t.markdown()}\n--- errors: ${errors.length} ---\n${errors.join('\n')}`);
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
