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

async function open(code) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((body) => { localStorage.clear(); localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`); }, `# Diagram\n\n${F}mermaid\n${code}\n${F}\n\nThe end.\n`);
  await page.goto(URL_);
  await page.waitForSelector('.tiptap .mermaid-view svg, .tiptap .mermaid-view .chart', { timeout: 30000 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.tiptap .code-block.mermaid-error').count(), 0, 'drawn');
  await page.locator('.tiptap .mermaid-view').first().click({ position: { x: 6, y: 6 } });
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
  await page.locator('.form button.add', { hasText: 'Group' }).click();
  const seq = await md(page);
  has(seq, ['Note over 앱,서버: TLS로 암호화']);
  assert.match(seq, /\n {2}loop\n {4}사용자->>앱:\n {2}end\n/, `a group added, a message in it\n${seq}`);
  console.log('ok   a pasted sequence diagram edits in its rows: notes, groups, activations and its own lines kept');
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
    await page.waitForSelector('.tiptap .dblock.active .form', { timeout: 15000 });
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
