// Diagrams pasted in as other apps write them open in the editor, not as code: a sequence diagram with notes, groups and
// activations, a Gantt chart whose tasks start after others, and class, state and table (ER) diagrams. A change made
// in the rows is written into the note, and every line the rows do not show stays in it. The / menu makes each kind.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:forms
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
const F = '```';
const errors = [];

async function open(code, rows = true) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); }, `# Diagram\n\n${F}mermaid\n${code}\n${F}\n\nThe end.\n`);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap .mermaid-view svg, .tiptap .mermaid-view .chart', { timeout: 30000 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.tiptap .code-block.mermaid-error').count(), 0, 'drawn');
  await page.locator('.tiptap .mermaid-view').first().click({ position: { x: 6, y: 6 } });
  await page.waitForSelector('.tiptap .dblock.active .tools', { timeout: 5000 });
  if (!rows) return page;
  await page.locator('.tiptap .dblock.active .tools button', { hasText: 'List' }).click(); // every part as a row
  await page.waitForSelector('.tiptap .dblock.active .form', { timeout: 5000 });
  return page;
}
const md = async (page) => { await page.waitForTimeout(450); return page.evaluate(() => window.__editor.storage.markdown.getMarkdown()); };
const has = (text, lines) => { for (const l of lines) assert.ok(text.includes(l), `"${l}" in\n${text}`); };

try {
  // ---- a sequence diagram: its notes, groups and activations are rows; a line they do not show, a line of code ----
  let page = await open('sequenceDiagram\n  actor 사용자\n  participant 앱\n  사용자->>+앱: 로그인\n  loop 세 번까지\n    앱->>서버: 확인\n  end\n  Note over 앱,서버: 암호화\n  activate 서버\n  앱-->>-사용자: 끝');
  await page.locator('.form input[aria-label="Message"]').first().fill('로그인 요청');
  has(await md(page), ['사용자->>+앱: 로그인 요청', 'loop 세 번까지', '앱->>서버: 확인', 'Note over 앱,서버: 암호화', 'activate 서버', '앱-->>-사용자: 끝']);
  await page.locator('.form input[aria-label="Note"]').fill('TLS로 암호화');
  await page.locator('.form .adds button.add', { hasText: 'Group' }).click();
  const seq = await md(page);
  has(seq, ['Note over 앱,서버: TLS로 암호화']);
  assert.match(seq, /\n {2}loop\n {4}사용자->>앱:\n {2}end\n/, `a group added, a message in it\n${seq}`);
  console.log('ok   a pasted sequence diagram edits in its rows: notes, groups, activations and its own lines kept');
  await page.close();

  // ---- a sequence diagram's groups: a row added inside one, an else, rows moved in and out; arrows and bars ----
  page = await open('sequenceDiagram\n  A->>B: one\n  loop again\n    A->>B: two\n  end\n  alt ok\n    B->>A: yes\n  end\n  A->>B: three');
  const endRow = (n) => page.locator('.form .s-step').filter({ has: page.locator('span.end') }).nth(n);
  await endRow(0).getByRole('button', { name: 'Message', exact: true }).click();
  assert.match(await md(page), /loop again\n {4}A->>B: two\n {4}A->>B:\n {2}end/, 'a message added in the loop, above its end');
  await endRow(1).getByRole('button', { name: 'Else', exact: true }).click();
  assert.match(await md(page), /alt ok\n {4}B->>A: yes\n {2}else\n {2}end/, 'an else added in the if');
  await page.locator('.form input[aria-label="Message"]').last().focus();
  await page.keyboard.press('Alt+ArrowUp');
  assert.match(await md(page), /else\n {4}A->>B: three\n {2}end\n?$/m, '⌥↑ takes the last message into the group above');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Message', 'the keyboard goes with the row');
  const before = await md(page);
  await endRow(0).getByRole('button', { name: 'Group', exact: true }).focus();
  for (let k = 0; k < 4; k++) await page.keyboard.press('Alt+ArrowUp'); // up past the loop's own start: refused there
  assert.match(await md(page), /loop again[\s\S]*end/, `the loop still closes\n${await md(page)}`);
  assert.notEqual(before, null);
  const first = page.locator('.form .s-msg').first();
  await first.getByRole('button', { name: 'Sends or replies' }).click();
  await page.getByRole('option', { name: /no wait/ }).first().click();
  await first.getByRole('button', { name: 'Activation' }).click();
  await page.getByRole('option', { name: 'Bar starts' }).click();
  assert.match(await md(page), /\n {2}A-\)\+B: one\n/, 'a message sent without waiting, starting a bar');
  console.log('ok   a sequence diagram: rows go into a group, an else, rows move in and out, arrows and bars chosen');
  await page.close();

  // ---- a Gantt chart: two statuses at once, a milestone of no length, a task after two, weekends skipped ----
  page = await open('gantt\n  dateFormat YYYY-MM-DD\n  section 개발\n    설계 :a1, 2026-01-05, 3d\n    구현 :a2, 2026-01-08, 2d\n    리뷰 :after a1, 2d');
  const task = (n) => page.locator('.form .g-task').nth(n);
  const choose = async (row, label, option) => { await row.getByRole('button', { name: label }).click(); await page.getByRole('listbox').last().getByRole('option', { name: option, exact: true }).click(); await page.waitForTimeout(150); };
  await choose(task(1), 'Status', 'Active, critical');
  await choose(task(0), 'Status', 'Milestone');
  await choose(task(2), 'And after', 'And “구현”');
  await page.getByRole('checkbox', { name: 'Skip weekends' }).check();
  has(await md(page), ['설계 : milestone, a1, 2026-01-05, 0d', '구현 : active, crit, a2, 2026-01-08, 2d', '리뷰 : after a1 a2, 2d', 'excludes weekends']);
  assert.equal(await page.locator('.form textarea').filter({ hasText: 'excludes' }).count(), 0, 'a setting ticked is not shown again as code kept');
  console.log('ok   a Gantt chart: active and critical, a milestone of no length, a task after two, weekends skipped');
  await page.close();

  // ---- a mind map's shapes, a timeline's sections, a state diagram's states in states, choices and notes ----
  page = await open('mindmap\n  root((제품))\n    편집기\n    동기화');
  await choose(page.locator('.form .m-item').first(), 'Shape', '☁ Cloud');
  await choose(page.locator('.form .m-item').nth(1), 'Shape', '○ Circle');
  await page.waitForTimeout(600);
  const fill = await page.evaluate(() => getComputedStyle(document.querySelector('.tiptap .mermaid-view [data-spot="branch:1"] > circle')).fill);
  assert.ok(!['rgb(242, 244, 246)', 'rgb(255, 255, 255)'].includes(fill), `a circle branch in its branch's colour, not ${fill}`);
  await choose(page.locator('.form'), 'Centre shape', '▢ Square');
  has(await md(page), ['root[제품]', ')편집기(']);
  await page.close();
  page = await open('timeline\n  2020 : 시작\n  2021 : 첫 고객');
  await page.locator('.form .adds button.add', { hasText: 'Section' }).click();
  assert.match(await md(page), /section Section 1\n {2}2020 : 시작\n {2}2021 : 첫 고객/, 'the first section is around the periods there are');
  assert.equal(await page.locator('.tiptap .mermaid-view .tl-sec').count(), 1, 'the section is drawn');
  await page.locator('.form .t-period').first().getByRole('button', { name: 'Move down' }).click();
  assert.match(await md(page), /section Section 1\n {2}2021 : 첫 고객\n {2}2020 : 시작/, 'a period moved down');
  await page.close();
  page = await open('timeline\n  section 창업기\n    2020 : 시작');
  await page.locator('.form .adds button.add', { hasText: 'Section' }).click();
  has(await md(page), ['section 창업기', 'section Section 2']);
  await page.close();
  page = await open('stateDiagram-v2\n  [*] --> 대기\n  대기 --> 분기\n  분기 --> 검토\n  검토 --> [*]');
  const st = (n) => page.locator('.form .st-state').nth(n);
  await choose(st(1), 'Kind', '◇ Choice');
  await choose(st(0), 'Inside', 'In “검토”');
  await st(2).getByRole('textbox', { name: 'Note' }).fill('사람이 본다');
  const sd = await md(page);
  has(sd, ['state 분기 <<choice>>', 'state 검토 {', 'note right of 검토 : 사람이 본다', '[*] --> 대기']);
  assert.match(sd, /\n {2}\[\*\] --> 대기/, `the chart's start stays the chart's\n${sd}`);
  await page.locator('.form button.add', { hasText: 'Add transition' }).click();
  const tr = page.locator('.form .st-link').last();
  await choose(tr, 'From', '● Start in “검토”');
  await choose(tr, 'To', '대기');
  assert.match(await md(page), /state 검토 \{\n {4}\[\*\] --> 대기/, `a start inside the state of states\n${await md(page)}`);
  console.log('ok   a mind map\'s shapes, a timeline\'s sections, a state in a state, a choice and a note');
  await page.close();

  // ---- a Gantt chart: a task after another, or after the one before it; a setting it cannot show kept ----
  page = await open('gantt\n  dateFormat YYYY-MM-DD\n  excludes weekends\n  section 개발\n    설계 :a1, 2026-01-05, 3d\n    구현 :crit, a2, after a1, 2w\n    리뷰 : 2d');
  await page.locator('.form input[aria-label="Task"]').nth(2).fill('코드 리뷰');
  has(await md(page), ['설계 : a1, 2026-01-05, 3d', '구현 : crit, a2, after a1, 14d', '코드 리뷰 : 2d', 'excludes weekends']);
  console.log('ok   a pasted Gantt chart with tasks after others edits in its rows');
  await page.close();

  // ---- a class diagram: a class renamed, its lines follow; a note kept ----
  page = await open('classDiagram\n  class 동물 {\n    +String 이름\n  }\n  동물 <|-- 개\n  주인 "1" --> "*" 개 : 산책시킨다\n  note for 개 "충성스럽다"');
  await page.locator('.form input[aria-label="Class name"]').nth(1).fill('강아지');
  const cls = await md(page);
  has(cls, ['동물 <|-- 강아지', '주인 "1" --> "*" 강아지 : 산책시킨다', '+String 이름', 'note for 개 "충성스럽다"']);
  assert.ok(!/ 개\b(?! ")/.test(cls.replace('note for 개', '')), `no line to the old name\n${cls}`);
  console.log('ok   a pasted class diagram: a class renamed takes its relations with it');
  await page.close();

  // ---- a state diagram: a transition added; a state of states kept ----
  page = await open('stateDiagram-v2\n  [*] --> 대기\n  대기 --> 처리 : 요청\n  state 검토 {\n    [*] --> 1차\n  }\n  처리 --> [*]');
  await page.locator('.form button.add', { hasText: 'Add transition' }).click();
  await page.locator('.form input[aria-label="When"]').last().fill('다시');
  has(await md(page), ['[*] --> 대기', '대기 --> 처리 : 요청', 'state 검토 {\n    [*] --> 1차\n  }', ' : 다시']);
  console.log('ok   a pasted state diagram: a transition added, its composite state kept');
  await page.close();

  // ---- tables: a column added, a relation's label changed ----
  page = await open('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name "고객 이름"\n  }');
  await page.locator('.form input[aria-label="Label"]').fill('주문한다');
  await page.locator('.e-table').first().locator('button.add').click();
  await page.locator('.e-table').first().locator('input[aria-label="Column"]').last().fill('email');
  has(await md(page), ['CUSTOMER ||--o{ ORDER : 주문한다', 'string name "고객 이름"', 'string email']);
  console.log('ok   a pasted ER diagram: a column added, a relation renamed');
  await page.close();

  // ---- Esc in an open list closes the list, not the diagram; a row's × leaves the keyboard in the rows ----
  page = await open('classDiagram\n  A <|-- B\n  B --> C');
  await page.locator('.c-link').first().getByRole('button', { name: 'Kind' }).click();
  await page.waitForSelector('[role=listbox]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[role=listbox]').count(), 0, 'the list closed');
  assert.equal(await page.locator('.tiptap .dblock.active .form').count(), 1, 'the diagram is still open');
  await page.locator('.c-link').first().getByRole('button', { name: 'Remove relation' }).click();
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('.dblock.active .form')), 'the keyboard stays in the rows');
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('x');
  has(await md(page), ['# Diagram', 'The end.', 'B --> C']);
  console.log('ok   Esc in a list closes only it; after a row\'s × the keyboard is still in the rows, and ⌘A there leaves the note');
  await page.close();

  // ---- a click in the margin beside an open diagram (where a box drawn past the block's edge is): the note's caret
  // does not go into the diagram's hidden code, which then showed in its place ----
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); },
    `# Flow\n\n${F}mermaid\nflowchart LR\n  a[One] --> b[Two] --> c[Three] --> d[Four] --> e[Five] --> f[Six] --> g[Seven] --> h[Eight]\n${F}\n\n`);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap .mermaid-view svg', { timeout: 30000 });
  await page.locator('.tiptap .mermaid-view').first().click({ position: { x: 6, y: 6 } });
  await page.waitForSelector('.tiptap .dblock.active');
  const blk = await page.locator('.tiptap .mermaid-host').boundingBox();
  const inCode = () => page.evaluate(() => { const s = window.__editor.state.selection; return !s.node && s.$from.parent.type.name === 'codeBlock'; });
  for (const x of [blk.x + blk.width + 28, blk.x - 28]) {
    await page.mouse.click(x, blk.y + 74);
    await page.waitForTimeout(300);
    assert.equal(await inCode(), false, `a click beside the diagram (x ${Math.round(x)}) does not put the caret in its code`);
    await page.locator('.tiptap .mermaid-view').first().click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(300);
  }
  console.log('ok   a click beside an open diagram does not open its code');

  // ---- a step added past the card's edge is brought into it; a picked line's bar covers no box ----
  const card = () => page.locator('.tiptap .dblock.active .mermaid-view').boundingBox();
  const boxAt = (label) => page.locator('.tiptap .dblock.active g.node').filter({ hasText: label }).first().boundingBox();
  await page.locator('.tiptap .dblock.active .mermaid-view').evaluate((h) => { h.scrollLeft = h.scrollWidth; });
  await page.waitForTimeout(300);
  let h8 = await boxAt('Eight');
  await page.mouse.click(h8.x + h8.width / 2, h8.y + h8.height / 2);
  await page.getByRole('button', { name: 'Add a step after this, or drag onto another box to connect' }).click();
  await page.keyboard.type('Nine'); await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const c = await card(), n9 = await boxAt('Nine');
  assert.ok(n9.x + n9.width <= c.x + c.width + 1 && n9.x >= c.x - 1, `the new step is inside the card (${Math.round(n9.x)}–${Math.round(n9.x + n9.width)} in ${Math.round(c.x)}–${Math.round(c.x + c.width)})`);
  await page.locator('.tiptap .dblock.active .mermaid-view').evaluate((h) => { h.scrollLeft = 0; });
  await page.waitForTimeout(300);
  const mid = await page.locator('.tiptap .dblock.active path.flowchart-link').first().evaluate((el) => { const q = el.getPointAtLength(el.getTotalLength() / 2), m = el.getScreenCTM(); return { x: q.x * m.a + m.e, y: q.y * m.d + m.f }; });
  await page.mouse.click(mid.x, mid.y);
  await page.waitForSelector('textarea.edge-label');
  const bar = await page.locator('textarea.edge-label').locator('xpath=..').boundingBox();
  for (const g of await page.locator('.tiptap .dblock.active g.node').all()) {
    const b = await g.boundingBox();
    const over = Math.min(bar.x + bar.width, b.x + b.width) > Math.max(bar.x, b.x) && Math.min(bar.y + bar.height, b.y + b.height) > Math.max(bar.y, b.y);
    assert.ok(!over, `the line's bar covers no box (${await g.textContent()})`);
  }
  // its end moved to another box: label and look kept
  await page.locator('textarea.edge-label').fill('go');
  await page.getByRole('button', { name: 'Move its end' }).click();
  const five = await boxAt('Five');
  await page.mouse.click(five.x + five.width / 2, five.y + five.height / 2);
  const moved = await md(page);
  assert.match(moved, /a[^\n]*go[^\n]*e\b|a -->\|go\| e/, `the line from One now ends at Five\n${moved}`);
  await page.locator('.tiptap .dblock.active .mermaid-view').evaluate((h) => { h.scrollLeft = h.scrollWidth; });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.tiptap .mermaid-view').first().evaluate((h) => h.scrollLeft), 0, 'done, the picture from its start');
  console.log('ok   a flowchart: a new step past the edge is brought into view, a line\'s bar covers no box, its end moves');

  // ---- on a phone, a picked box's + is where a finger can take it: not under the box's bar, not over a line ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
    const ph = await ctx.newPage();
    ph.on('pageerror', (e) => errors.push(e.message));
    await ph.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); },
      `# Flow\n\n${F}mermaid\nflowchart LR\n  a[주문] --> b[결제] --> c[배송] --> d[도착] --> e[마감 정산]\n${F}\n\n`);
    await ph.goto(URL_);
    await ph.waitForSelector('html.mobile');
    await ph.locator('.note-item, .list .item, [data-note]').first().click().catch(() => {});
    await ph.waitForSelector('.tiptap .mermaid-view svg', { timeout: 30000 });
    await ph.locator('.tiptap .mermaid-view').first().click({ position: { x: 6, y: 6 } });
    await ph.waitForSelector('.tiptap .dblock.active');
    for (const label of ['결제', '마감 정산']) {
      // the last box at the picture's end, the card scrolled to it as a finger would
      if (label === '마감 정산') { await ph.locator('.tiptap .dblock.active .mermaid-view').evaluate((h) => { h.scrollLeft = h.scrollWidth; }); await ph.waitForTimeout(300); }
      const g = await ph.locator('.tiptap .dblock.active g.node').filter({ hasText: label }).first().boundingBox();
      await ph.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
      await ph.waitForTimeout(400);
      const plus = ph.getByRole('button', { name: 'Add a step after this, or drag onto another box to connect' });
      const p = await plus.boundingBox();
      const hit = await ph.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), [p.x + p.width / 2, p.y + p.height / 2]);
      assert.equal(hit, 'Add a step after this, or drag onto another box to connect', `"${label}": a tap on its + takes the + (not ${hit})`);
    }
    await ctx.close();
  }
  console.log('ok   on a phone, a picked box\'s + is not under its bar');
  {
    // a timeline period on a phone: its events have room to be read and written
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
    const ph = await ctx.newPage();
    await ph.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); },
      `# T\n\n${F}mermaid\ntimeline\n  2021 : 정식 출시\n  2023 : 해외 진출\n${F}\n\n`);
    await ph.goto(URL_);
    // a note made as a person on a phone makes one (the list is what a phone opens on)
    await ph.waitForSelector('html.mobile');
    await ph.locator('button.fab[aria-label="New note"]').click();
    await ph.locator('.sheet button', { hasText: 'New note' }).click();
    await ph.waitForSelector('.tiptap');
    await ph.evaluate((md) => window.__editor.commands.setContent(md, true), `# T\n\n${F}mermaid\ntimeline\n  2021 : 정식 출시\n  2023 : 해외 진출\n${F}\n`);
    await ph.waitForSelector('.tiptap .mermaid-view .chart', { timeout: 30000 });
    await ph.locator('.tiptap .mermaid-view').first().click({ position: { x: 6, y: 6 } });
    await ph.locator('.tiptap .dblock.active .tools button', { hasText: 'List' }).click();
    await ph.waitForSelector('.tiptap .dblock.active .form');
    const w = (await ph.locator('.form input[aria-label="Event"]').first().boundingBox()).width;
    assert.ok(w >= 150, `an event's box is ${Math.round(w)}px wide on a phone`);
    await ctx.close();
  }
  console.log('ok   on a phone, a timeline\'s events have room');
  await page.close();

  // ---- a sequence diagram's numbers are drawn so they can be read ----
  page = await open('sequenceDiagram\n  autonumber\n  A->>B: hi\n  B-->>A: ok');
  const num = await page.evaluate(() => {
    const t = document.querySelector('.tiptap .mermaid-view text.sequenceNumber');
    const c = document.querySelector('.tiptap .mermaid-view marker[id$="-sequencenumber"] circle');
    return t && c && [getComputedStyle(t).fill, getComputedStyle(c).fill];
  });
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [hi, lo] = num ? [lum(num[0]), lum(num[1])].sort((a, b) => b - a) : [0, 0];
  assert.ok(num && (hi + 0.05) / (lo + 0.05) >= 4.5, `a number reads on its circle (4.5:1): ${num}`);
  console.log('ok   a sequence diagram\'s numbers read on their circles');
  await page.close();

  // ---- any chart's parts are clicked and typed in where they are drawn: Tab adds the next one, Enter is done, Esc puts
  // back what was there; the field sits on its part ----
  const spot = async (page, key) => {
    const at = await page.evaluate((k) => {
      const all = [...document.querySelectorAll(`.tiptap .mermaid-view [data-spot="${k}"]`)];
      const box = all.find((e) => e.textContent.trim()) ?? all[0];
      if (!box) return null;
      const el = box.querySelector(':scope > g.label-group, :scope > g.label.name') ?? box; // a class's, a table's name line
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, key);
    assert.ok(at, `${key} is drawn to be clicked`);
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector('.tiptap .dblock.active .layer input.field');
    const f = await page.locator('.tiptap .layer input.field').boundingBox();
    assert.ok(Math.abs(f.y + f.height / 2 - at.y) < 6, `${key}'s field is on it`);
  };
  const typeIn = async (page, key, words, after = 'Enter') => {
    await spot(page, key);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.tiptap .layer input.field').count(), 1, `${key}: Tab types in the one it added`);
    await page.keyboard.type(words);
    await page.keyboard.press(after);
    return md(page);
  };
  const clicked = [
    ['pie title Pets\n  "Dogs" : 40\n  "Cats" : 30', 'slice:1', 'Birds', /"Cats" : 30\n {2}"Birds" : 10/],
    ['mindmap\n  root((Plan))\n    Design\n    Build', 'branch:0', 'Sketch', /Design\n {6}Sketch\n {4}Build/],
    ['timeline\n  2001 : Founded\n  2005 : Series A', 'event:0:0', 'First hire', /2001 : Founded : First hire/],
    ['gantt\n  dateFormat YYYY-MM-DD\n  section Build\n  Design :d1, 2026-01-05, 4d', 'task:0:0', 'Test', /Design : d1, 2026-01-05, 4d\n {4}Test : 2d/],
    ['sequenceDiagram\n  participant A\n  participant B\n  A->>B: Hello', 'step:0', 'Hi back', /A->>B: Hello\n {2}B-->>A: Hi back/],
    ['stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy', 'state:Idle', 'Done', /Idle --> Done/],
    ['erDiagram\n  USER {\n    int id PK\n    string name\n  }', 'col:USER:1', 'email', /string name\n {4}string email/],
    ['classDiagram\n  class Animal\n  class Dog\n  Animal <|-- Dog', 'class:Dog', 'Puppy', /Dog --> Puppy/],
  ];
  for (const [code, key, words, want] of clicked) {
    page = await open(code, false);
    if (key === 'branch:0') assert.equal(await page.locator('.tiptap .mermaid-view svg.mindmap').count(), 1, 'a mind map drawn by Eve');
    assert.match(await typeIn(page, key, words), want, `${key}: added after it`);
    await page.close();
  }
  // typed over and put back: Esc
  page = await open('pie title Pets\n  "Dogs" : 40\n  "Cats" : 30', false);
  await spot(page, 'slice:0');
  await page.keyboard.type('Wolves');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.tiptap .pie-legend .lbl').first().textContent(), 'Wolves', 'the drawing follows the typing');
  await page.keyboard.press('Escape');
  assert.match(await md(page), /"Dogs" : 40/, 'Esc puts it back');
  assert.equal(await page.locator('.tiptap .dblock.active').count(), 1, 'Esc lets go of the part, not of the chart');
  // a class renamed: once typed (its id, and its lines, follow it)
  await page.close();
  page = await open('classDiagram\n  class Animal\n  class Dog\n  Animal <|-- Dog', false);
  await spot(page, 'class:Dog');
  await page.keyboard.type('Puppy');
  await page.keyboard.press('Enter');
  assert.match(await md(page), /Animal <\|-- Puppy/, 'a class renamed where it is drawn, its line with it');
  // Esc on a rename keeps the old name (the field going had renamed it anyway)
  await spot(page, 'class:Animal');
  await page.keyboard.type('Beast');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.match(await md(page), /class Animal\b/, 'Esc on a rename keeps the name');
  assert.doesNotMatch(await md(page), /Beast/, 'Esc on a rename keeps the name');
  await page.close();
  // a class added with the chart's own + is kept, though nothing is in it yet
  page = await open('classDiagram\n  class Animal {\n    +eat()\n  }', false);
  await page.locator('.tiptap .dblock.active .tools button', { hasText: '+ Class' }).click();
  await page.waitForTimeout(800);
  await page.keyboard.type('Cat');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  assert.match(await md(page), /class Cat\b/, 'a class just added is kept');
  await page.close();
  console.log('ok   every kind: a part clicked is typed in where it is drawn; Tab adds the next, Enter is done, Esc puts it back');

  // ---- one part, then another: the keyboard goes with the field (it stayed behind, and typing went into the note) ----
  page = await open('pie title Pets\n  "Dogs" : 40\n  "Cats" : 30', false);
  await spot(page, 'slice:0');
  await spot(page, 'slice:1');
  await page.keyboard.type('Fish');
  await page.keyboard.press('Enter');
  let after = await md(page);
  assert.match(after, /"Dogs" : 40\n {2}"Fish" : 30/, 'the second part clicked is the one typed in');
  assert.match(after, /The end\./, 'nothing typed into the note');
  await page.close();
  // Esc right after Tab added a part takes the adding back
  page = await open('mindmap\n  root((Plan))\n    Design\n    Build', false);
  await spot(page, 'branch:0');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  after = await md(page);
  assert.match(after, /Design\n {4}Build/, 'Esc takes back the idea just added');
  assert.doesNotMatch(after, /Idea/, 'Esc takes back the idea just added');
  await page.close();
  // a sequence's people are each their own (mermaid draws them last to first: a click edited the mirror one)
  page = await open('sequenceDiagram\n  actor Ann\n  participant Web\n  participant DB\n  Ann->>Web: Hi', false);
  for (const who of ['Ann', 'Web', 'DB']) {
    await spot(page, `person:${who}`);
    assert.equal(await page.locator('.tiptap .layer input.field').inputValue(), who, `${who} clicked, ${who} typed in`);
  }
  await page.keyboard.type('Database');
  await page.keyboard.press('Enter');
  assert.match(await md(page), /participant DB as Database\n/, 'the one clicked renamed');
  assert.match(await md(page), /actor Ann\n {2}participant Web\n/, 'the others written as they were');
  await page.close();
  console.log('ok   another part clicked takes the keyboard; Esc takes back what Tab added; each person is their own');

  // ---- the / menu makes each new kind, drawn and open ----
  page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('eve.notes.a', '---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n# Diagram\n\nabove\n'); });
  await page.goto(URL_);
  await page.waitForSelector('.tiptap p');
  for (const [item, down] of [['class', 0], ['state', 0], ['database', 1]]) { // "database" finds the Database first
    await page.locator('.tiptap > p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(`/${item}`);
    await page.waitForTimeout(300);
    if (down) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.tiptap .dblock.active .tools', { timeout: 15000 });
    await page.waitForSelector('.tiptap .dblock.active .mermaid-view svg', { timeout: 30000 });
    assert.equal(await page.locator('.tiptap .code-block.mermaid-error').count(), 0, `${item} drawn`);
    await page.locator('.tiptap .dblock.active .tools button.done').click();
    await page.waitForTimeout(300);
  }
  const made = await md(page);
  has(made, ['classDiagram', 'stateDiagram-v2', 'erDiagram']);
  console.log('ok   the / menu makes a class, a state and a table diagram, drawn and open to edit');
  assert.deepEqual(errors, [], 'no errors in the page');
} finally {
  await browser.close();
  await server?.close();
}
