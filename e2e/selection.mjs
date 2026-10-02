// The selection, checked in WebKit (the Mac app's engine): real mouse drags, ⇧ + arrows and ⌘A over a note with
// every kind of block, light and dark. For each: a screenshot before and after, compared pixel by pixel —
//   inside   pixels that changed where the selected text (or a picture, card, empty line it covers) is: > 300
//   outside  pixels that changed anywhere else (a line end lit past the text, a gap between blocks): ≤ 12
//   ink      the text's dark pixels still there under the selection, in % of before: ≥ 80 (it stays readable)
//   and the selection must still be the same after the screenshot (it used to collapse after some drags).
// The table cases also check the selection itself: a cell selection inside the table, a text selection out of it.
// Needs the dev server (npm run dev) and WebKit for Playwright: npx playwright-core install webkit
// Run: npm run e2e:selection   (screenshots go to e2e/out/)
import { webkit } from 'playwright-core';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./out', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const URL_ = process.env.EVE_URL ?? 'http://localhost:5173/';
let page, DARK = false;

/** a test editor over the app: a note with every kind of block, the app's own editor and keymap */
async function setup() {
  const IMG = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 240; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#f4a261'; x.fillRect(0, 0, 240, 60); return c.toDataURL(); });
  const note = [
    '# H1제목 첫 줄',
    '',
    'P1 aaaa 첫 문단은 꽤 긴 문장으로 오른쪽 끝까지 이어지지는 않습니다 P1z',
    '',
    'P2 bbbb 둘째 문단 P2z',
    '',
    '- B1 cccc 불릿 하나 꽤 긴 텍스트 B1z',
    '  - B1a dddd 하위 불릿 B1az',
    '- B2 eeee 불릿 둘 B2z',
    '',
    '- [ ] T1 ffff 할 일 하나 꽤 긴 텍스트 T1z',
    '  - [ ] T1a gggg 하위 할 일 T1az',
    '- [x] T2 hhhh 끝낸 할 일 T2z',
    '',
    '1. N1 iiii 번호 하나 N1z',
    '2. N2 jjjj 번호 둘 N2z',
    '',
    '> [!💡]',
    '> C1 kkkk 콜아웃 안 C1z',
    '',
    '<details open>',
    '<summary>G1 llll 토글 제목 G1z</summary>',
    '',
    'G2 mmmm 토글 안 G2z',
    '',
    '</details>',
    '',
    '> Q1 nnnn 인용 Q1z',
    '',
    '```',
    'K1 oooo code line K1z',
    'K2 pppp code K2z',
    '```',
    '',
    '| X1 qqqq | X2 rrrr |',
    '| --- | --- |',
    '| X3 ssss | X4 tttt |',
    '',
    'I0 before image I0z',
    '',
    `![](${IMG})`,
    '',
    'https://github.com',
    '',
    'I9 after card I9z',
    '',
    ' ',
    '',
    'E1 uuuu 빈 줄 뒤 E1z **굵게 vvvv** `코드 wwww` E1y',
  ].join('\n');
  await page.evaluate(async (md) => {
    const m = await import('/src/lib/editor.ts');
    const noop = () => {}; const ui = { visible: () => false, show: noop, hide: noop, update: noop, key: () => false, move: noop, select: () => false };
    const el = document.createElement('div'); document.body.append(el); el.className = 'editor'; el.id = 'seltest';
    Object.assign(el.style, { position: 'fixed', inset: '0', background: 'var(--bg)', zIndex: 30, padding: '20px 60px', overflow: 'hidden' });
    window.__ed = m.createEditor({ element: el, content: md, onUpdate: noop, onOpenNote: noop, targets: () => [], suggestionUI: ui, calendarUI: ui, emojiUI: ui });
    m.applyKeymap(window.__ed);
  }, note);
  await page.waitForTimeout(600);
}

/** where a token sits on screen: its left edge, right edge and middle line */
const at = (token) => page.evaluate((t) => {
  const w = document.createTreeWalker(document.querySelector('#seltest .tiptap'), NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (n.parentElement.closest('label, [contenteditable="false"]')) continue; // a to-do box's hidden label repeats its text
    const i = n.data.indexOf(t);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length);
    const b = r.getBoundingClientRect();
    return { l: b.left, r: b.right, y: b.top + b.height / 2 };
  }
  throw new Error(`no ${t}`);
}, token);

/** where the selected things are: every selected piece of text, every picture or card taken whole, every empty line */
const expected = () => page.evaluate(() => {
  const root = document.querySelector('#seltest .tiptap');
  const sel = getSelection(); if (!sel.rangeCount) return { rects: [], text: '' };
  const range = sel.getRangeAt(0); const rects = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    if (!range.intersectsNode(n) || !n.data.length || n.parentElement.closest('label, [contenteditable="false"]')) continue;
    const r = document.createRange();
    r.setStart(n, n === range.startContainer ? range.startOffset : 0);
    r.setEnd(n, n === range.endContainer ? range.endOffset : n.data.length);
    for (const b of r.getClientRects()) if (b.width > 0) rects.push([b.left, b.top, b.right, b.bottom]);
  }
  const atoms = [];
  for (const e of root.querySelectorAll('.in-sel, .pm-sel-empty, .pm-sel, .selectedCell')) { const b = e.getBoundingClientRect(); const r = [b.left - 4, b.top - 4, b.right + 4, b.bottom + 4]; rects.push(r); if (!e.matches('.pm-sel-empty')) atoms.push(r); }
  const painted = [...root.querySelectorAll('.pm-sel')].map((e) => { const b = e.getBoundingClientRect(); const top = document.elementFromPoint(b.left + 3, b.top + b.height / 2); return e.textContent.slice(0, 12) + '@' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' top=' + top?.tagName + '.' + (top?.className || '') + ' vis=' + getComputedStyle(e).visibility + ' op=' + getComputedStyle(e).opacity; });
  // an inline code chip taken whole: its grey box takes the blend too, a little beyond the letters
  for (const c of root.querySelectorAll('code')) { if (c.closest('pre') || !range.intersectsNode(c)) continue; if (range.comparePoint(c, 0) >= 0 && range.comparePoint(c, c.childNodes.length) <= 0) { const b = c.getBoundingClientRect(); rects.push([b.left - 2, b.top - 2, b.right + 2, b.bottom + 2]); } }
  const layer = document.querySelectorAll('#seltest .sel-layer > div').length;
  return { rects, atoms, layer, text: String(sel), pm: window.__ed.state.selection.from + '-' + window.__ed.state.selection.to, painted };
});

/** what the selection changed on screen: a screenshot before it and one after, compared pixel by pixel */
let BASE = null;
async function base() {
  // nothing selected, the note focused, the pointer out of the way
  await page.evaluate(() => { window.__ed.view.focus(); window.__ed.commands.setTextSelection(1); });
  await page.mouse.move(5, 1090); await page.waitForTimeout(350);
  BASE = PNG.sync.read(await page.screenshot());
}
async function measure(name) {
  await page.mouse.move(5, 1090); await page.waitForTimeout(450); // no hover effects in the comparison
  const exp = await expected();
  const buf = await page.screenshot();
  writeFileSync(`${OUT}/${name}.png`, buf);
  const after = await page.evaluate(() => window.__ed.state.selection.from + '-' + window.__ed.state.selection.to);
  // the selection's kind and ends, and where the table is
  const sel = await page.evaluate(() => {
    const { state } = window.__ed; const s = state.selection; let table;
    state.doc.descendants((n, pos) => { if (n.type.name === 'table') table = [pos, pos + n.nodeSize]; return !table; });
    return { kind: '$anchorCell' in s ? 'cell' : s.constructor.name === 'TextSelection' ? 'text' : s.constructor.name, from: s.from, to: s.to, table };
  });
  const png = PNG.sync.read(buf);
  const S = 2, PAD = 2;
  const inRects = (x, y) => exp.rects.some(([l, t, r, b]) => x >= (l - PAD) * S && x <= (r + PAD) * S && y >= (t - PAD) * S && y <= (b + PAD) * S);
  const inAtoms = (x, y) => exp.atoms.some(([l, t, r, b]) => x >= l * S && x <= r * S && y >= t * S && y <= b * S);
  const dark = (d, i) => { const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; return DARK ? lum > 170 : lum < 90; };
  let inside = 0, outside = 0, inkBefore = 0, inkAfter = 0; const stray = [];
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, a = png.data, b = BASE.data;
    const changed = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24;
    const inside_ = inRects(x, y);
    if (inside_ && !inAtoms(x, y)) { if (dark(b, i)) inkBefore++; if (dark(a, i)) inkAfter++; } // text only: an overlay on a card is meant to tint it
    if (!changed) continue;
    if (inside_) inside++; else { outside++; if (stray.length < 4) stray.push([Math.round(x / S), Math.round(y / S)]); }
  }
  return { name, sel, layer: exp.layer, pm: exp.pm === after ? exp.pm : exp.pm + '→' + after, text: exp.text.replace(/\s+/g, ' ').slice(0, 40), inside, outside, ink: inkBefore ? Math.round((100 * inkAfter) / inkBefore) : 100, stray };
}

async function drag(a, b, opts = {}) {
  const A = await at(a), B = await at(b);
  const ax = opts.fromEnd ? A.r - 1 : A.l + 1, bx = opts.before ? B.l - opts.before : opts.pastEnd ? B.r + (opts.pastEnd) : opts.toEnd ? B.r - 1 : B.l + 1;
  await page.mouse.move(ax, A.y); await page.mouse.down();
  await page.mouse.move(bx, B.y, { steps: 16 }); await page.mouse.up();
  await page.waitForTimeout(500);
}
async function keys(start, seq) {
  const A = await at(start);
  await page.mouse.click(A.l + 1, A.y);
  for (const k of seq) await page.keyboard.press(k);
  await page.waitForTimeout(500);
}

const CASES = [
  ['01-same-line', () => drag('aaaa', '오른쪽')],
  ['02-para-to-para', () => drag('aaaa', '둘째')],
  ['03-para-to-bullet', () => drag('bbbb', '불릿 하나')],
  ['04-bullet-to-bullet', () => drag('cccc', '불릿 둘')],
  ['05-nested-up', () => drag('B2z', 'dddd')],
  ['06-bullet-to-todo', () => drag('eeee', '할 일 하나')],
  ['07-todo-to-todo', () => drag('ffff', '끝낸')],
  ['08-subtodo-to-number', () => drag('gggg', '번호 둘')],
  ['09-heading-to-para', () => drag('제목', 'aaaa')],
  ['10-callout-out', () => drag('kkkk', '토글 제목')],
  ['11-toggle-in-out', () => drag('mmmm', '인용')],
  ['12-quote-to-code', () => drag('nnnn', 'line')],
  ['13-code-inside', () => drag('oooo', 'pppp')],
  ['14-table-cells', () => drag('qqqq', 'ssss'), cells],
  ['15-over-image-card', () => drag('tttt', '빈 줄 뒤'), outDown],
  ['16-drag-past-line-end', () => drag('cccc', 'B2z', { pastEnd: 300 })],
  ['17-into-line-end-todo', () => drag('ffff', 'T1az', { pastEnd: 260 })],
  ['18-reverse-long', () => drag('E1z', 'bbbb')],
  ['19-marks-inline', () => drag('uuuu', 'wwww')],
  ['20-shift-arrows', () => keys('cccc', ['Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowRight', 'Shift+ArrowRight'])],
  ['21-shift-arrows-up', () => keys('hhhh', ['Shift+ArrowUp', 'Shift+ArrowUp', 'Shift+ArrowLeft'])],
  ['22-select-all', () => keys('aaaa', ['Meta+a'])],
  ['23-within-cell', () => drag('qqqq', 'qqqq', { toEnd: true })],
  ['24-across-image-card', () => drag('before', 'after')],
  ['25-heading-partial', () => drag('제목', '줄', { toEnd: true })],
  ['26-callout-inside', () => drag('kkkk', '콜아웃 안', { toEnd: true })],
  ['27-across-empty-line', () => drag('after', '빈 줄')],
  ['28-table-down-out', () => drag('ssss', 'before'), outDown],
  ['29-table-up-out', () => drag('rrrr', '인용'), outUp],
  ['30-over-table', () => drag('인용', 'before'), over],
  ['31-table-across-cells', () => drag('rrrr', 'tttt'), cells],
  ['32-table-out-and-back', async () => {
    const A = await at('ssss'), B = await at('before'), C = await at('tttt');
    await page.mouse.move(A.l + 1, A.y); await page.mouse.down();
    await page.mouse.move(B.l + 1, B.y, { steps: 12 }); await page.mouse.move(C.l + 1, C.y, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(500);
  }, cells],
  ['33-shift-down-out-of-table', () => keys('ssss', ['Shift+ArrowDown', 'Shift+ArrowDown']), outDown],
  ['34-shift-down-over-table', () => keys('pppp', ['Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown']), over],
  ['35-shift-up-out-of-table', () => keys('qqqq', ['Shift+ArrowUp', 'Shift+ArrowUp']), outUp],
  ['36-shift-cells-then-out', () => keys('qqqq', ['Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowDown']), outDown],
  ['37-table-to-line-start', () => drag('ssss', 'I0', { before: 30 }), outDown],
];
// what the selection must be, for the table cases
function cells({ kind, from, to, table: [a, b] }) { return kind === 'cell' && from > a && to < b; }
function outDown({ kind, from, to, table: [a, b] }) { return kind === 'text' && from > a && from < b && to > b; }
function outUp({ kind, from, to, table: [a, b] }) { return kind === 'text' && from < a && to > a && to < b; }
function over({ kind, from, to, table: [a, b] }) { return kind === 'text' && from < a && to > b; }

const browser = await webkit.launch();
const results = [];
for (const dark of [false, true]) {
  DARK = dark;
  page = await browser.newPage({ viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
  await page.goto(URL_);
  await page.waitForTimeout(1500);
  await setup();
  for (const [name, act, check] of CASES) {
    await base();
    await act();
    const r = await measure((dark ? 'dark-' : '') + name);
    r.wrong = check && !check(r.sel);
    results.push(r);
  }
  await page.close();
}
await browser.close();

let failed = 0;
for (const r of results) {
  const collapsed = r.pm.includes('→');
  const ok = r.inside > 300 && r.outside <= 12 && r.ink >= 80 && !collapsed && !r.wrong;
  if (!ok) failed++;
  console.log(ok ? 'pass' : 'FAIL', r.name.padEnd(30), `inside ${r.inside}`.padEnd(15), `outside ${r.outside}`.padEnd(13), `ink ${r.ink}%`.padEnd(10), r.pm, collapsed ? '(collapsed after the drag)' : '', r.wrong ? `(wrong selection: ${r.sel.kind} ${r.sel.from}-${r.sel.to}, table ${r.sel.table})` : '');
}
console.log(`${results.length - failed}/${results.length} pass — screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
