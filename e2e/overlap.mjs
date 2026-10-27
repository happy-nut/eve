// Nothing in a diagram drawn over anything else, as WebKit draws it: no two boxes, line labels, a line's ends (an
// arrowhead, a crow's foot, a "1" or "*") or lane names on one another; a box's words inside it; a diagram not over
// the text above or below it, nor its bar (open for editing) over the drawing. A Mac window and a phone, Korean words.
// Needs WebKit for Playwright: npx playwright-core install webkit. It starts its own dev server, or uses EVE_URL.
// Run: npm run e2e:overlap
import assert from 'node:assert/strict';
import { webkit } from 'playwright-core';

const server = process.env.EVE_URL ? null : await (await import('vite')).createServer({ server: { port: 0 }, logLevel: 'error' }).then((v) => v.listen());
const URL_ = process.env.EVE_URL ?? server.resolvedUrls.local[0];
const browser = await webkit.launch();
const F = '```';
const DIAGRAMS = {
  flowchart: `flowchart TD\n  A[사용자 로그인 요청] -->|아이디 비밀번호| B{인증 성공?}\n  B -->|예| C[메인 화면으로 이동]\n  B -->|아니오| D[오류 메시지 표시]\n  D --> A\n  C --> E((끝))`,
  'long words': `flowchart TD\n  A["첫 줄<br>두 번째 줄<br>세 번째 줄"] --> C[아주아주 긴 라벨이 여러 줄로 감겨야 하는 경우를 시험해 봅니다 이렇게 길게]\n  C --> D{결정 상자 안에도 긴 글을 넣어 봅니다}\n  D -->|아주 긴 선 라벨이 붙어 있는 경우| E[끝]\n  D -->|짧게| F[다른 끝]`,
  'many lines': `flowchart TD\n  A[시작] --> B[하나] & C[둘] & D[셋] & E[넷]\n  B --> F[다섯]\n  C --> F\n  D --> G[여섯]\n  E --> G\n  F --> H[일곱]\n  G --> H\n  B -->|라벨1| G\n  C -->|라벨2| H\n  E -->|라벨3| B`,
  groups: `flowchart TB\n  subgraph 프론트엔드\n    direction LR\n    A[웹 앱] --> B[모바일 앱]\n  end\n  subgraph 백엔드\n    C[API 서버] --> D[(데이터베이스)]\n  end\n  A -->|REST 요청| C\n  B -->|GraphQL| C`,
  lanes: `flowchart LR\n  subgraph 고객\n    A[주문하기] --> B[결제하기]\n    G[상품 받기]\n  end\n  subgraph 가게\n    C[주문 확인] --> D[포장]\n  end\n  subgraph 배송\n    E[픽업] --> F[배달 완료]\n  end\n  B -->|주문서 전달| C\n  D -->|포장 완료 알림| E\n  F --> G`,
  sequence: `sequenceDiagram\n  actor 사용자\n  participant 클라이언트 애플리케이션\n  participant 서버\n  사용자->>클라이언트 애플리케이션: 버튼을 누른다\n  loop 세 번까지\n    클라이언트 애플리케이션->>서버: 데이터를 요청한다\n    서버-->>클라이언트 애플리케이션: 결과\n  end\n  alt 성공\n    클라이언트 애플리케이션-->>사용자: 화면에 보여준다\n  else 실패\n    클라이언트 애플리케이션-->>사용자: 오류 코드와 함께 아주 긴 실패 사유를 돌려준다\n  end\n  Note over 클라이언트 애플리케이션,서버: 인증 토큰을 함께 보낸다`,
  class: `classDiagram\n  class 주문 {\n    +int 주문번호\n    +List~상품~ 상품목록\n    +취소하기(사유: String) bool\n  }\n  class 상품 {\n    +String 이름\n  }\n  class 고객 {\n    +String 이메일주소가아주길다\n  }\n  고객 "1" --> "*" 주문 : 주문한다\n  주문 "*" o-- "*" 상품 : 담는다\n  주문 <|-- 특별주문`,
  state: `stateDiagram-v2\n  [*] --> 작성중\n  작성중 --> 검토중: 제출\n  state 검토중 {\n    [*] --> 1차검토\n    1차검토 --> 2차검토: 통과\n  }\n  검토중 --> 승인됨: 최종 승인\n  검토중 --> 반려됨: 반려 사유와 함께\n  반려됨 --> 작성중: 수정\n  승인됨 --> [*]`,
  er: `erDiagram\n  CUSTOMER ||--o{ ORDER : "주문한다"\n  ORDER ||--|{ LINE_ITEM : "포함한다"\n  PRODUCT ||--o{ LINE_ITEM : "담긴다"\n  CUSTOMER {\n    string name "고객 이름"\n    string email UK\n  }\n  ORDER {\n    int id PK\n    date created_at\n  }`,
  mindmap: `mindmap\n  root((프로젝트))\n    기획\n      요구사항 정리\n      일정\n    개발\n      프론트엔드\n      백엔드\n    출시`,
};
const names = Object.keys(DIAGRAMS);
const body = '# Diagrams\n\n' + names.map((k) => `${k}\n\n${F}mermaid\n${DIAGRAMS[k]}\n${F}`).join('\n\n') + '\n\nThe end.\n';

/** what overlaps in the diagram at `i` (and around it), as words */
const overlaps = (page, i) => page.evaluate((i) => {
  const PAD = 5; // a line label's chip reaches 5px past its words (mermaid.ts themeCSS: box-shadow 4px + 1px)
  const block = document.querySelectorAll('.tiptap .code-block.mermaid')[i];
  const svg = block?.querySelector('.mermaid-view svg');
  if (!svg) return ['not drawn'];
  const out = [];
  const name = (e) => `${e.getAttribute('class')?.split(' ')[0] ?? e.tagName}「${e.textContent.trim().slice(0, 12)}」`;
  const grow = (r, by) => ({ left: r.left - by, right: r.right + by, top: r.top - by, bottom: r.bottom + by });
  const cross = (a, b) => Math.min(Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const things = [];
  const add = (sel, by = 0, kind = 'box') => svg.querySelectorAll(sel).forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) things.push({ e, r: grow(r, by), kind });
  });
  add('g.node:not(.cluster), rect.actor, rect.note, .mindmap-node, g.lane-node');
  add('g.edgeLabel .labelBkg:not(:has(.edgeLabel:empty))', PAD, 'label');
  add('.edgeTerminals', 0, 'end');
  add('g.edgeLabel text, text.messageText, text.labelText, .cluster-label, .lane-name', 0, 'label');
  // a line's drawn ends (an arrowhead, a crow's foot, a diamond): a square at each end that has one
  const m = svg.getScreenCTM();
  svg.querySelectorAll('path[marker-end], path[marker-start]').forEach((p) => {
    const len = p.getTotalLength?.();
    if (!len || !m) return;
    const pm = p.getScreenCTM() ?? m;
    for (const [attr, at] of [['marker-start', 0], ['marker-end', len]]) {
      if (!p.getAttribute(attr) || p.getAttribute(attr) === 'none') continue;
      const q = new DOMPoint(p.getPointAtLength(at).x, p.getPointAtLength(at).y).matrixTransform(pm);
      // the part of the end clear of the box it points into: 7px back along the line
      const back = new DOMPoint(p.getPointAtLength(Math.abs(at - 9)).x, p.getPointAtLength(Math.abs(at - 9)).y).matrixTransform(pm);
      const x = back.x, y = back.y;
      things.push({ e: p, r: { left: x - 4, right: x + 4, top: y - 4, bottom: y + 4 }, kind: 'end' });
    }
  });
  for (let a = 0; a < things.length; a++) for (let b = a + 1; b < things.length; b++) {
    const x = things[a], y = things[b];
    if (x.e.contains(y.e) || y.e.contains(x.e) || (x.kind === 'end' && y.kind === 'end') || (x.kind === 'end' && y.kind === 'box') || (x.kind === 'box' && y.kind === 'end')) continue;
    const by = cross(x.r, y.r);
    if (by > 1) out.push(`${name(x.e)} over ${name(y.e)} by ${by.toFixed(1)}px`);
  }
  // a box's words inside the box
  svg.querySelectorAll('g.node').forEach((g) => {
    const shape = g.querySelector(':scope > rect, :scope > polygon, :scope > circle, :scope > path, :scope > g > path'), words = g.querySelector('.nodeLabel');
    if (!shape || !words) return;
    const s = shape.getBoundingClientRect(), w = words.getBoundingClientRect();
    if (w.right > s.right + 1 || w.left < s.left - 1 || w.bottom > s.bottom + 1 || w.top < s.top - 1) out.push(`${name(words)} out of its box`);
  });
  // the block between the text above and below it
  const r = block.getBoundingClientRect(), up = block.previousElementSibling?.getBoundingClientRect(), down = block.nextElementSibling?.getBoundingClientRect();
  if (up && r.top < up.bottom - 1) out.push(`over the text above by ${(up.bottom - r.top).toFixed(1)}px`);
  if (down && down.top < r.bottom - 1) out.push(`over the text below by ${(r.bottom - down.top).toFixed(1)}px`);
  // open for editing: its bars clear of the drawing
  const canvas = block.querySelector('.mermaid-view').getBoundingClientRect();
  block.querySelectorAll('.dblock > .tools, .dblock > .dtip, .dblock > .foot').forEach((t) => {
    const tr = t.getBoundingClientRect();
    if (tr.height && cross(tr, canvas) > 1) out.push(`${t.className} over the drawing`);
  });
  return out;
}, i);

const WINDOWS = [
  { name: 'Mac', viewport: { width: 1200, height: 900 } },
  // big type, airy lines and a serif in Settings: the note's text changes, a diagram's words were measured without it
  { name: 'Mac, 24px serif type', viewport: { width: 1200, height: 900 }, appearance: { size: 24, lineHeight: 2.1, font: 'serif' } },
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' },
];
const failed = [];
try {
  for (const { name: where, appearance = {}, ...opts } of WINDOWS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.addInitScript(([body, look]) => {
      localStorage.clear();
      localStorage.setItem('eve.notes.a', `---\nid: a\nupdated: 1\ndeleted: false\norder: 0\n---\n${body}`);
      localStorage.setItem('eve.appearance', JSON.stringify(look));
    }, [body, appearance]);
    await page.goto(URL_);
    await page.waitForSelector('.tiptap p');
    if (opts.isMobile) await page.locator('button[data-note="a"]').first().click(); // the phone starts on the list
    await page.waitForFunction((n) => document.querySelectorAll('.tiptap .code-block.mermaid .mermaid-view svg').length === n, names.length, { timeout: 30000 });
    await page.waitForTimeout(500);
    for (let i = 0; i < names.length; i++) {
      const got = await overlaps(page, i);
      if (got.length) failed.push(`${where}, ${names[i]}:\n    ${got.join('\n    ')}`);
      else console.log(`ok   ${where}: ${names[i]}`);
    }
    // a flowchart open for editing: its bar and tip above and below the drawing, not on it, the note pushed down
    const first = page.locator('.tiptap .code-block.mermaid .mermaid-view').first();
    await first.scrollIntoViewIfNeeded();
    await first.click({ position: { x: 8, y: 8 } });
    await page.waitForSelector('.tiptap .dblock.active');
    await page.waitForTimeout(400);
    const open = await overlaps(page, 0);
    if (open.length) failed.push(`${where}, flowchart open for editing:\n    ${open.join('\n    ')}`);
    else console.log(`ok   ${where}: a flowchart open for editing`);
    await ctx.close();
  }
  assert.deepEqual(failed, [], `drawn over one another:\n  ${failed.join('\n  ')}`);
} finally {
  await browser.close();
  await server?.close();
}
