// How much memory the page holds as it is used, in WebKit (the Mac app's engine): 80 notes, a long one with every
// kind of block, one of diagrams and one of formulas, every note opened through the list and typed into, round after
// round. Eve was seen holding gigabytes; a page that only climbs is caught here before it ships.
// After each round it prints the footprint of the process drawing the page (what Activity Monitor calls Memory, not
// its resident size, which leaves compressed pages out) and fails when
//   - the last round holds more than MEM_MAX_MB (700), or
//   - the later rounds climb more than MEM_CLIMB_MB (120) over the second (the first loads every kind of block once;
//     after it a page that is used the same way again should stay where it is)
// Run: npm run e2e:mem   (macOS: `footprint` reads the process; ROUNDS, KEYS and EVE_URL as in the probe)
import { webkit } from 'playwright-core';
import { execSync } from 'node:child_process';

const ROUNDS = Number(process.env.ROUNDS ?? 6), KEYS = Number(process.env.KEYS ?? 150);
const MAX = Number(process.env.MEM_MAX_MB ?? 700), CLIMB = Number(process.env.MEM_CLIMB_MB ?? 120);

const now = Date.now();
const note = (id, body, i) => `---\nid: ${id}\nupdated: ${now - i * 1000}\ndeleted: false\norder: ${i}\n---\n${body}`;
const fence = (k, t) => '```' + k + '\n' + t + '\n```';
const files = {};
for (let i = 0; i < 80; i++) {
  const para = Array.from({ length: 4 + (i % 9) }, (_, j) => `Paragraph ${j} of note ${i}, with **bold**, a link to [[Note ${(i * 7) % 80}]] and \`code\`.`).join('\n\n');
  files[`eve.notes.n${i}`] = note(`n${i}`, `# Note ${i}\n\n${para}\n\n- one\n- [ ] a task\n`, i + 4);
}
const block = (j) => [`## Section ${j}`, '', `A paragraph ${j} with **bold** and \`code\`.`, '', '- a bullet', '- [ ] a task', '',
  fence('js', `const x${j} = ${j};`), '', '| a | b |', '| --- | --- |', `| ${j} | ${j * 2} |`, '', '$$', 'x^2 + y^2', '$$', ''].join('\n');
files['eve.notes.long'] = note('long', `# Long note\n\n${Array.from({ length: 80 }, (_, j) => block(j)).join('\n')}`, 1);
files['eve.notes.diagrams'] = note('diagrams', `# Diagrams\n\n${Array.from({ length: 12 }, (_, j) => fence('mermaid', `flowchart LR\n  A${j}[Start ${j}] --> B${j}{Choose} --> C${j}[Done]\n  B${j} --> D${j}[Other]`)).join('\n\n')}\n`, 2);
files['eve.notes.math'] = note('math', `# Formulas\n\n${Array.from({ length: 30 }, (_, j) => `$$\n\\sum_{k=0}^{${j}} \\frac{x^k}{k!} = \\int_0^1 f_${j}(t)\\,dt\n$$`).join('\n\n')}\n`, 3);

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];

// the page's process: the WebKit content process that was not there before this browser
const pids = () => execSync('pgrep -f WebContent || true').toString().split('\n').filter(Boolean);
const before = new Set(pids());
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(URL_);
await page.evaluate((files) => { localStorage.clear(); for (const [k, v] of Object.entries(files)) localStorage.setItem(k, v); }, files);
await page.reload();
await page.waitForSelector('.tiptap');
await page.waitForTimeout(1500);
const ours = pids().filter((p) => !before.has(p));
const mb = () => Math.max(0, ...ours.map((p) => {
  const m = execSync(`footprint ${p} 2>/dev/null || true`).toString().match(/Footprint: ([\d.]+) (KB|MB|GB)/);
  return m ? Math.round(+m[1] * { KB: 1 / 1024, MB: 1, GB: 1024 }[m[2]]) : 0;
}));
if (!mb()) throw new Error(`the page's process was not found to measure (${ours.join(', ') || 'none new'})`);

const held = [mb()];
console.log(`start ${held[0]} MB`);
for (let round = 1; round <= ROUNDS; round++) {
  const rows = await page.locator('[data-row]').count();
  for (let i = 0; i < rows; i++) {
    await page.locator('[data-row]').nth(i).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(40);
  }
  await page.locator('.tiptap').first().click();
  await page.keyboard.press('Meta+ArrowDown');
  for (let k = 0; k < KEYS; k++) await page.keyboard.type(k % 40 ? 'x' : '\n');
  await page.waitForTimeout(1000);
  held.push(mb());
  console.log(`round ${round}: ${held.at(-1)} MB (${rows} notes opened, ${KEYS} keys)`);
}
await browser.close();
await server?.close();

// the later rounds against the second; the lowest of the last two, as WebKit gives memory back in its own time
const later = Math.min(...held.slice(-2)), second = held[2];
const wrong = [];
if (held.at(-1) > MAX) wrong.push(`the page holds ${held.at(-1)} MB, over ${MAX}`);
if (later - second > CLIMB) wrong.push(`the page climbed ${later - second} MB after round 2 (${second} → ${later}), over ${CLIMB}`);
if (wrong.length) { console.error(wrong.join('\n')); process.exit(1); }
console.log('memory ok');
