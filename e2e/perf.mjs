// How fast Eve is with a big library, in WebKit (the Mac app's engine): 800 notes in 20 groups linking to each
// other, and one long note with every kind of block. It times
//   start   the page loaded until a note is open and editable
//   key     one keystroke until the next frame is painted, in a short note and in the long one (median and worst)
//   switch  opening another note until it is painted
// Prints the numbers; with PERF_MAX_SWITCH_MS set, fails when opening a note takes longer (median).
// Run: npm run e2e:perf   (it starts its own dev server, or uses EVE_URL: a built app, `npx vite preview`, is the
// one to judge by — the dev server's numbers are several times slower)
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const N = 800;

function seed(n) {
  const files = {};
  const now = Date.now();
  const note = (id, body, i, group) => `---\nid: ${id}\nupdated: ${now - i * 1000}\ndeleted: false\norder: ${i}${group ? `\ngroup: ${group}` : ''}\n---\n${body}`;
  for (let i = 0; i < n; i++) {
    const body = `# Note ${i}\n\nSome text about [[Note ${(i * 7) % n}]] and **bold** words, a list:\n\n- one\n- two [[Note ${(i * 13) % n}]]\n- [ ] a task\n`;
    files[`eve.notes.n${i}`] = note(`n${i}`, body, i + 1, i % 2 ? `Group ${i % 20}` : '');
  }
  const block = (j) => [
    `## Section ${j}`, '', `A paragraph ${j} with **bold**, _italic_, \`code\` and a link to [[Note ${j}]].`, '',
    '- a bullet', '  - nested bullet', '- [ ] a task', '', '1. first', '2. second', '',
    '> [!💡]', '> a callout', '', '```js', `const x${j} = ${j};`, 'console.log(x);', '```', '',
    '| a | b |', '| --- | --- |', `| ${j} | ${j * 2} |`, '', '$$', 'x^2 + y^2', '$$', '',
  ].join('\n');
  files['eve.notes.long'] = note('long', `# Long note\n\n${Array.from({ length: 60 }, (_, j) => block(j)).join('\n')}`, 0, '');
  return files;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const fmt = (a) => `median ${median(a).toFixed(1)} ms, worst ${Math.max(...a).toFixed(1)} ms`;

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(URL_);
await page.evaluate((files) => { localStorage.clear(); for (const [k, v] of Object.entries(files)) localStorage.setItem(k, v); localStorage.setItem('eve.lastNote', 'n0'); }, seed(N));

const starts = [];
for (let r = 0; r < 3; r++) {
  await page.reload();
  await page.waitForSelector('.tiptap');
  starts.push(await page.evaluate(() => performance.now()));
}
await page.waitForTimeout(500);

/** keystrokes into the open note, each timed from its keydown to the frame after it */
async function typing(count) {
  await page.evaluate(() => {
    window.__keyTimes = [];
    window.addEventListener('keydown', () => {
      const t0 = performance.now();
      requestAnimationFrame(() => setTimeout(() => window.__keyTimes.push(performance.now() - t0), 0));
    }, { capture: true });
  });
  for (let i = 0; i < count; i++) { await page.keyboard.press('KeyA'); await page.waitForTimeout(20); }
  await page.waitForTimeout(400);
  return page.evaluate(() => window.__keyTimes.slice(5)); // the first few warm the code paths up
}

/** a click on the note's row in the list, timed until the frame after it */
async function open(title) {
  return page.evaluate(async (title) => {
    const row = [...document.querySelectorAll('aside .row button')].find((b) => b.textContent.trim() === title);
    if (!row) throw new Error(`no row for ${title}`);
    const t0 = performance.now();
    row.click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t0;
  }, title);
}

await open('Note 1');
await page.click('.tiptap p');
await page.keyboard.press('End');
const short = await typing(60);

const switches = [];
for (let i = 2; i < 22; i++) switches.push(await open(`Note ${i}`));
const toLong = await open('Long note');
await page.click('.tiptap h2');
await page.keyboard.press('End');
const long = await typing(60);

console.log(`start   ${fmt(starts)}`);
console.log(`key     short note: ${fmt(short)}`);
console.log(`key     long note:  ${fmt(long)}`);
console.log(`switch  ${fmt(switches)}; into the long note ${toLong.toFixed(1)} ms`);

await browser.close();
await server?.close();
const max = Number(process.env.PERF_MAX_SWITCH_MS);
if (max && median(switches) > max) { console.error(`opening a note takes over ${max} ms`); process.exit(1); }
