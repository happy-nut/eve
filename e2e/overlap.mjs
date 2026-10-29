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
  // a design doc's architecture (as a user drew it): long numbered labels on lines that cross, a box with a lot to say
  architecture: `flowchart TD\n  LIB[마스킹 라이브러리 + JVM agent]\n  SW["Swagger 통합기<br>(x-masking: AutoConfiguration)"]\n  SD["Self-Diagnostics (기동 시 @Masking 클래스 전수 검증, 원문 검출 시 기동 실패 → readiness 롤백)"]\n  SVC["각 어드민 서비스 (DTO 프로퍼티에 @Masking 선언)"]\n  SPEC["OpenAPI 스펙 (각 서비스 api-docs)"]\n  KAFKA[pay-log-kafka]\n  SONAR["소나큐브 정적 분석 (민감 data class의 @Masking 없는 필드, 모듈 미포함 서비스, logback %msg 패턴 탐지)"]\n  ADMIN["통합 어드민 (어느 리소스가 중요정보를 다루는지 자동 파악)"]\n  CONS["pay-log-kafka Consumer (탐지기)"]\n  LIB -->|"① 의존성만 추가하면 toString 자동 마스킹(상속·추가 코드 불필요)"| SVC\n  LIB -->|"② Jackson 직렬화 마스킹"| SVC\n  LIB -->|"③ 모든 로그에 자동 적용(SQL 파라미터 포함)"| KAFKA\n  SW --> SVC\n  SD -.-> SVC\n  SVC -->|"④ /v3/api-docs 제공(스키마에 x-masking 표시)"| SPEC\n  SVC -->|"⑤ 로그 적재"| KAFKA\n  SVC -->|"⑦ 빌드/PR 시점 검사"| SONAR\n  SPEC -->|"⑥ 주기적 수집 후 리소스 목록화"| ADMIN\n  SPEC -->|"조인: (service, path)와 x-masking 매핑"| CONS\n  KAFKA -->|"⑧ 1차 정밀 검증 통과 패턴 스캔"| CONS\n  KAFKA -->|"미적용 탐지"| SONAR\n  CONS -->|"⑨ 위반 시 담당자 알림"| SVC\n  SONAR -->|"⑩ 위반 시 PR 차단"| SVC`,
  // lanes (Eve draws these, lanes.ts) with long labels: each stood at its line's bend in a 40px gap, on top of the
  // others there and of the boxes either side; a design doc's architecture, and Eve's own modules (npm run map) in three lanes
  'lanes, long labels': "flowchart LR\n  subgraph lib[\"\ub77c\uc774\ube0c\ub7ec\ub9ac\"]\n    LIB[\ub9c8\uc2a4\ud0b9 \ub77c\uc774\ube0c\ub7ec\ub9ac + JVM agent]\n    SW[\"Swagger \ud1b5\ud569\uae30 (x-masking: AutoConfiguration)\"]\n    SD[\"Self-Diagnostics (\uae30\ub3d9 \uc2dc @Masking \ud074\ub798\uc2a4 \uc804\uc218 \uac80\uc99d)\"]\n  end\n  subgraph svc[\"\uc11c\ube44\uc2a4\"]\n    SVC[\"\uac01 \uc5b4\ub4dc\ubbfc \uc11c\ube44\uc2a4 (DTO \ud504\ub85c\ud37c\ud2f0\uc5d0 @Masking \uc120\uc5b8)\"]\n    SPEC[\"OpenAPI \uc2a4\ud399 (\uac01 \uc11c\ube44\uc2a4 api-docs)\"]\n  end\n  subgraph ops[\"\ud0d0\uc9c0\uc640 \uc6b4\uc601\"]\n    KAFKA[pay-log-kafka]\n    CONS[\"pay-log-kafka Consumer (\ud0d0\uc9c0\uae30)\"]\n    SONAR[\"\uc18c\ub098\ud050\ube0c \uc815\uc801 \ubd84\uc11d\"]\n    ADMIN[\"\ud1b5\ud569 \uc5b4\ub4dc\ubbfc (\uc5b4\ub290 \ub9ac\uc18c\uc2a4\uac00 \uc911\uc694\uc815\ubcf4\ub97c \ub2e4\ub8e8\ub294\uc9c0 \uc790\ub3d9 \ud30c\uc545)\"]\n  end\n  LIB -->|\"\u2460 \uc758\uc874\uc131\ub9cc \ucd94\uac00\ud558\uba74 toString \uc790\ub3d9 \ub9c8\uc2a4\ud0b9\"| SVC\n  LIB -->|\"\u2461 Jackson \uc9c1\ub82c\ud654 \ub9c8\uc2a4\ud0b9\"| SVC\n  LIB -->|\"\u2462 \ubaa8\ub4e0 \ub85c\uadf8\uc5d0 \uc790\ub3d9 \uc801\uc6a9(SQL \ud30c\ub77c\ubbf8\ud130 \ud3ec\ud568)\"| KAFKA\n  SW --> SVC\n  SD -.-> SVC\n  SVC -->|\"\u2463 /v3/api-docs \uc81c\uacf5(\uc2a4\ud0a4\ub9c8\uc5d0 x-masking \ud45c\uc2dc)\"| SPEC\n  SVC -->|\"\u2464 \ub85c\uadf8 \uc801\uc7ac\"| KAFKA\n  SVC -->|\"\u2466 \ube4c\ub4dc/PR \uc2dc\uc810 \uac80\uc0ac\"| SONAR\n  SPEC -->|\"\u2465 \uc8fc\uae30\uc801 \uc218\uc9d1 \ud6c4 \ub9ac\uc18c\uc2a4 \ubaa9\ub85d\ud654\"| ADMIN\n  SPEC -->|\"\uc870\uc778: (service, path)\uc640 x-masking \ub9e4\ud551\"| CONS\n  KAFKA -->|\"\u2467 1\ucc28 \uc815\ubc00 \uac80\uc99d \ud1b5\uacfc \ud328\ud134 \uc2a4\uce94\"| CONS\n  CONS -->|\"\u2468 \uc704\ubc18 \uc2dc \ub2f4\ub2f9\uc790 \uc54c\ub9bc\"| SVC\n  SONAR -->|\"\u2469 \uc704\ubc18 \uc2dc PR \ucc28\ub2e8\"| SVC",
  'lanes, a module map': "flowchart LR\n  subgraph g1[\"\ucc3d\uacfc \ud654\uba74\"]\n    m_App[\"App\"]\n    m_main[\"main\"]\n    m_Sidebar[\"Sidebar\"]\n    m_Editor[\"Editor\"]\n    m_CardPage[\"CardPage\"]\n    m_CalendarPage[\"CalendarPage\"]\n    m_TabBar[\"TabBar\"]\n    m_MobileBar[\"MobileBar\"]\n    m_Settings[\"Settings\"]\n    m_TrashPanel[\"TrashPanel\"]\n    m_HistoryPanel[\"HistoryPanel\"]\n    m_Outline[\"Outline\"]\n    m_Find[\"Find\"]\n  end\n  subgraph g2[\"\ub178\ud2b8 \uc800\uc7a5\uc18c\"]\n    m_notes[\"notes\"]\n    m_groups[\"groups\"]\n    m_daily[\"daily\"]\n    m_history[\"history\"]\n    m_tabs[\"tabs\"]\n    m_pending[\"pending\"]\n    m_moves[\"moves\"]\n    m_takeBody[\"takeBody\"]\n    m_comeBack[\"comeBack\"]\n    m_reminder[\"reminder\"]\n    m_inbox[\"inbox\"]\n    m_handoff[\"handoff\"]\n    m_paths[\"paths\"]\n  end\n  subgraph g3[\"\ub3d9\uae30\ud654\uc640 \uac00\uc838\uc624\uae30\"]\n    m_sync[\"sync\"]\n    m_github[\"github\"]\n    m_merge3[\"merge3\"]\n    m_update[\"update\"]\n    m_updates[\"updates\"]\n    m_transfer[\"transfer\"]\n    m_importTree[\"importTree\"]\n    m_keep[\"keep\"]\n    m_hwp[\"hwp\"]\n    m_pdf[\"pdf\"]\n    m_evelink[\"evelink\"]\n    m_platform[\"platform\"]\n  end\n  m_App -->|\"notes, CALENDAR \uc678 2\"| m_notes\n  m_App -->|\"isDailyId, DAILY_TEMPLATE_ID\"| m_daily\n  m_App -->|\"startReminder, syncPhoneReminder\"| m_reminder\n  m_App -->|\"CalendarPage\"| m_CalendarPage\n  m_App -->|\"sync\"| m_sync\n  m_App -->|\"groups, leafOf \uc678 1\"| m_groups\n  m_App -->|\"setGlobalHotkey, win \uc678 11\"| m_platform\n  m_App -->|\"Sidebar\"| m_Sidebar\n  m_App -->|\"Editor\"| m_Editor\n  m_App -->|\"MobileBar\"| m_MobileBar\n  m_App -->|\"updates\"| m_updates\n  m_App -->|\"importTree\"| m_importTree\n  m_App -->|\"importPaths, exportCurrent\"| m_transfer\n  m_App -->|\"tabs\"| m_tabs\n  m_App -->|\"TabBar\"| m_TabBar\n  m_App -->|\"parseTicket\"| m_handoff\n  m_App -->|\"parseEveLink\"| m_evelink\n  m_App -->|\"applyAll\"| m_inbox\n  m_App -->|\"cameBack\"| m_comeBack\n  m_App -->|\"flushEdits\"| m_pending\n  m_App -->|\"(lazy)\"| m_Settings\n  m_App -->|\"(lazy)\"| m_CardPage\n  m_App -->|\"(lazy)\"| m_TrashPanel\n  m_App -->|\"(lazy)\"| m_HistoryPanel\n  m_CalendarPage -->|\"notes\"| m_notes\n  m_CalendarPage -->|\"dailyId, dayKey \uc678 2\"| m_daily\n  m_CardPage -->|\"isMobile\"| m_platform\n  m_CardPage -->|\"notes\"| m_notes\n  m_CardPage -->|\"Outline\"| m_Outline\n  m_Editor -->|\"takeBody\"| m_takeBody\n  m_Editor -->|\"isMobile, pickImage\"| m_platform\n  m_Editor -->|\"notes, titleOf\"| m_notes\n  m_Editor -->|\"groups, leafOf\"| m_groups\n  m_Editor -->|\"Outline\"| m_Outline\n  m_Editor -->|\"Find\"| m_Find\n  m_Editor -->|\"nudgeNote, openedFromList\"| m_moves\n  m_Find -->|\"isMobile\"| m_platform\n  m_HistoryPanel -->|\"notes, titleOf\"| m_notes\n  m_HistoryPanel -->|\"sync\"| m_sync\n  m_Settings -->|\"sync\"| m_sync\n  m_Settings -->|\"storage, autostart \uc678 7\"| m_platform\n  m_Settings -->|\"normHost, webBase\"| m_github\n  m_Settings -->|\"updates\"| m_updates\n  m_Settings -->|\"findUpdate\"| m_update\n  m_Settings -->|\"askNotify\"| m_reminder\n  m_Sidebar -->|\"isMobile\"| m_platform\n  m_Sidebar -->|\"updates\"| m_updates\n  m_Sidebar -->|\"notes, nested \uc678 3\"| m_notes\n  m_Sidebar -->|\"isDailyId, DAILY_TEMPLATE_ID \uc678 1\"| m_daily\n  m_Sidebar -->|\"groups, parentOf \uc678 3\"| m_groups\n  m_Sidebar -->|\"sync\"| m_sync\n  m_Sidebar -->|\"importFromFinder, importFromFolder\"| m_transfer\n  m_Sidebar -->|\"*\"| m_moves\n  m_Sidebar -->|\"history\"| m_history\n  m_Sidebar -->|\"tabs\"| m_tabs\n  m_TabBar -->|\"notes, titleOf \uc678 1\"| m_notes\n  m_TabBar -->|\"tabs\"| m_tabs\n  m_TrashPanel -->|\"notes, titleOf\"| m_notes\n  m_TrashPanel -->|\"isDailyId\"| m_daily\n  m_main -->|\"App\"| m_App\n  m_main -->|\"isMobile\"| m_platform\n  m_groups -->|\"notes, nested\"| m_notes\n  m_groups -->|\"history, undoSource\"| m_history\n  m_hwp -->|\"assetName, assets\"| m_platform\n  m_importTree -->|\"notes, titleOf\"| m_notes\n  m_importTree -->|\"groups, MAX_DEPTH\"| m_groups\n  m_importTree -->|\"dirOf, nameOf \uc678 2\"| m_paths\n  m_importTree -->|\"attachmentCandidates, isKeepNote \uc678 2\"| m_keep\n  m_inbox -->|\"notes, titleOf\"| m_notes\n  m_inbox -->|\"depthOf, MAX_DEPTH\"| m_groups\n  m_moves -->|\"notes\"| m_notes\n  m_moves -->|\"CALENDAR_NOTE_ID\"| m_daily\n  m_moves -->|\"groups, parentOf\"| m_groups\n  m_notes -->|\"storage\"| m_platform\n  m_notes -->|\"flushEdits\"| m_pending\n  m_notes -->|\"history, undoSource\"| m_history\n  m_notes -->|\"CALENDAR_NAME, CALENDAR_NOTE_ID \uc678 7\"| m_daily\n  m_pdf -->|\"assetUrl, pdfThumb\"| m_platform\n  m_reminder -->|\"notes, titleOf\"| m_notes\n  m_reminder -->|\"dailyId, dayKey \uc678 1\"| m_daily\n  m_reminder -->|\"isMobile, isTauri \uc678 1\"| m_platform\n  m_sync -->|\"notes, parse \uc678 1\"| m_notes\n  m_sync -->|\"groups\"| m_groups\n  m_sync -->|\"flushEdits\"| m_pending\n  m_sync -->|\"assets, github \uc678 6\"| m_platform\n  m_sync -->|\"Repo, FileHashes \uc678 5\"| m_github\n  m_sync -->|\"seal, open \uc678 1\"| m_handoff\n  m_sync -->|\"merge3\"| m_merge3\n  m_tabs -->|\"notes, CALENDAR\"| m_notes\n  m_transfer -->|\"notes, titleOf\"| m_notes\n  m_transfer -->|\"importTree\"| m_importTree\n  m_transfer -->|\"files, importAsset \uc678 8\"| m_platform\n  m_transfer -->|\"commonDir, dirOf\"| m_paths\n  m_transfer -->|\"flushEdits\"| m_pending\n  m_updates -->|\"findUpdate\"| m_update\n  m_updates -->|\"isMobile, isTauri \uc678 2\"| m_platform\n  m_updates -->|\"(lazy)\"| m_sync",
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
    // …and on the whole screen: its bar clear of a Mac window's traffic lights (x 0–78, y 0–40), which stay over it
    if (!opts.isMobile) {
      await page.locator('.tiptap .dblock.active .mermaid-expand').click({ force: true });
      await page.waitForSelector('.dblock.full.active .tools');
      const under = await page.evaluate(() => [...document.querySelectorAll('.dblock.full :is(.tools, .codebar, .foldchips) > *')]
        .map((el) => [el.textContent.trim().slice(0, 20), el.getBoundingClientRect()]).filter(([, r]) => r.width && r.left < 78 && r.top < 40).map(([t]) => t));
      if (under.length) failed.push(`${where}, on the whole screen, under the traffic lights: ${under.join(', ')}`);
      else console.log(`ok   ${where}: on the whole screen, its bar clear of the traffic lights`);
      await page.keyboard.press('Escape');
    }
    await ctx.close();
  }
  assert.deepEqual(failed, [], `drawn over one another:\n  ${failed.join('\n  ')}`);
} finally {
  await browser.close();
  await server?.close();
}
