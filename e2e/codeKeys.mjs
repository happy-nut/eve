// Diagnostics for a code block edited with the Mac's selection keys (⌘⇧ / ⌥⇧ + arrows) then ⌫ or ⌦: from each line
// of the code and each place in it, every combination; after each, one key is typed and must land where the caret is.
// Reported: any case where the key went nowhere, the page's selection and the editor's disagree, or the selection
// left the note. WebKit on a Mac (CI) for the real keys; elsewhere with CHROMIUM_PATH. Run: node e2e/codeKeys.mjs
import { webkit, chromium } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = process.env.CHROMIUM_PATH ? await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }) : await webkit.launch();
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const code = ['function hello(name) {', '  const greeting = `Hello, ${name}!`;', '  console.log(greeting);', '  return greeting.length;', '}', '', 'hello("world");'].join('\n');
const note = `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n# Code\n\nabove the code\n\n\`\`\`js\n${code}\n\`\`\`\n\nbelow the code\n`;
const bad = [];
let runs = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((note) => { localStorage.clear(); localStorage.setItem('eve.notes.a', note); }, note);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap pre');
  await page.waitForTimeout(800);
  const reset = () => page.evaluate((note) => {
    const ed = window.__editor;
    ed.commands.setContent(note.split('---\n')[2], { emitUpdate: false });
  }, note);
  const place = (line, where) => page.evaluate(([line, where]) => {
    const ed = window.__editor;
    let start = 0, text = '';
    ed.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') { start = p + 1; text = n.textContent; } });
    const lines = text.split('\n');
    let at = start;
    for (let i = 0; i < line; i++) at += lines[i].length + 1;
    const len = lines[line].length;
    at += where === 'start' ? 0 : where === 'end' ? len : Math.floor(len / 2);
    ed.commands.focus();
    ed.commands.setTextSelection(at);
  }, [line, where]);
  const look = () => page.evaluate(() => {
    const ed = window.__editor, s = getSelection();
    const inNote = !!s.focusNode && ed.view.dom.contains(s.focusNode);
    let dom = null;
    try { dom = inNote ? ed.view.posAtDOM(s.focusNode, s.focusOffset) : null; } catch { dom = 'err'; }
    return { pm: ed.state.selection.head, empty: ed.state.selection.empty, dom, inNote, focus: document.activeElement === ed.view.dom };
  });
  const keysets = [`${MOD}+Shift+ArrowLeft`, `${MOD}+Shift+ArrowRight`, `${MOD}+Shift+ArrowUp`, `${MOD}+Shift+ArrowDown`, 'Alt+Shift+ArrowLeft', 'Alt+Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown'];
  for (const line of [0, 1, 4, 5, 6]) {
    for (const where of ['start', 'mid', 'end']) {
      for (const sel of keysets) {
        for (const del of ['Backspace', 'Delete']) {
          await reset();
          await place(line, where);
          await page.keyboard.press(sel);
          await page.keyboard.press(del);
          await page.waitForTimeout(30);
          const before = await look();
          const md0 = await page.evaluate(() => window.__editor.storage.markdown.getMarkdown());
          await page.keyboard.type('Q');
          await page.waitForTimeout(30);
          const md1 = await page.evaluate(() => window.__editor.storage.markdown.getMarkdown());
          runs++;
          const problem = !before.focus ? 'lost focus' : !before.inNote ? 'selection out of the note' : before.dom !== before.pm ? `page caret ${before.dom} ≠ editor ${before.pm}` : md1 === md0 ? 'typed key went nowhere' : '';
          if (problem) bad.push(`line ${line} ${where}, ${sel} then ${del}: ${problem}`);
        }
      }
    }
  }
  for (const e of errors) bad.push(`page error: ${e}`);
} finally {
  await browser.close();
  await server?.close();
}
for (const b of bad) console.log('BAD ', b);
console.log(`${runs - bad.length}/${runs} fine`);
process.exit(bad.length ? 1 : 0);
