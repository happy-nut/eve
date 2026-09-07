# GitHub private repo sync — plan (2026-09-07)

Node 서버(`server/`) 대신 GitHub private 저장소를 동기화 백엔드로 쓴다.
사용자는 저장소 하나와 fine-grained PAT 하나만 준비한다. 서버 운영 없음.

## 결정

1. **GitHub REST API를 webview에서 직접 호출.** `git` 바이너리도, Rust 변경도 없다 (1단계).
   지금 `sync.svelte.ts`의 구조(변경분 push → 이후 변경분 pull → LWW)가 그대로 유지되고, `npm run dev` 브라우저 모드에서도 동작한다.
   - 기각: 로컬 `notes/`를 git clone으로 만들고 `git` 셸아웃. git 설치·자격증명 의존, 3-way merge는 우리가 원하는 LWW가 아님.
   - 기각: `git2` crate. 바이너리 수 MB 증가, merge 문제 동일.
2. **저장소는 사용자가 만든다.** `gh repo create eve-notes --private`. 앱은 `owner/repo` + PAT(Contents: Read and write, 그 repo만)를 받는다.
   앱에서 repo 생성은 안 한다 (Administration 권한이 더 필요, YAGNI).
3. **원격 레이아웃 = 로컬과 동일.** `notes/<id>.md`, 내용은 `serialize()` 그대로(frontmatter 포함). 삭제는 tombstone 파일 유지(`deleted: true`).
   2단계에서 `notes/assets/*` 추가.
4. **충돌 = 지금과 같은 노트 단위 LWW(updatedAt).** 커밋 원자성은 Git Data API의 fast-forward 강제로 보장: `PATCH refs`는 `force` 없이 호출하면 남이 먼저 push한 경우 422 → 다시 pull 후 재시도.
5. **변경 감지는 blob sha로.** 노트마다 git blob sha(`sha1("blob <len>\0" + content)`)를 `crypto.subtle`로 계산해 마지막으로 원격에서 본 sha(`known`)와 비교한다.
   지금의 메모리 `pushedAt` Map(재시작마다 전부 다시 push하던 것)은 없앤다. `known`이 유일한 진실.
6. **`server/`는 1단계 완료 후 삭제.** 백엔드 두 개 유지는 코드 2배. → 열린 질문 1.

## 프로토콜 (한 라운드 = `sync.now()`)

상태(localStorage `eve.sync`): `{ repo, token, head: sha | '', known: { [path]: blobSha }, lastSynced }`. 브랜치는 `main` 고정.

1. **head 조회** `GET /repos/{repo}/git/ref/heads/main` (`If-None-Match` ETag → 304면 rate limit 소모 없음).
   404 → 빈 repo → 초기화(4).
2. **pull** head가 저장된 값과 다르면 `GET /git/trees/{sha}?recursive=1` → `notes/*.md` 중 sha가 `known`과 다른 것만 `GET /git/blobs/{sha}`
   (항상 base64 → `Uint8Array` → `TextDecoder`, `atob` 결과를 그대로 쓰면 한글 깨짐) → `parse()` → `notes.mergeRemote()`. `known`·head 갱신.
3. **push** `changed = notes.all.filter(n => !n.path && blobSha(serialize(n)) !== known[path])`. 있으면
   - `POST /git/blobs` × N (`encoding: "utf-8"`, base64 불필요)
   - `POST /git/trees { base_tree: <head tree>, tree: [{ path, mode: "100644", type: "blob", sha }] }`
   - `POST /git/commits { message: "eve: N notes", tree, parents: [head] }`
   - `PATCH /git/refs/heads/main { sha }` → 200이면 head·`known` 갱신. 422면 1부터 재시도(최대 3회).
4. **빈 repo 초기화** Git Data API는 빈 repo에서 409를 낸다. `PUT /repos/{repo}/contents/notes/.keep`(Contents API는 빈 repo에서 브랜치를 만든다) 후 1부터.

요청 수: 변경 없음 1회/분(304), 노트 1개 수정 ≈ 5회. 한도 5000/h.
pull → push 순서라 원격이 더 새로우면 로컬을 덮고, 로컬이 더 새로우면 `mergeRemote`가 건너뛰고 push한다.

## 1단계 작업 (파일별)

| 파일 | 작업 |
| --- | --- |
| `src/lib/github.ts` (신규) | 순수 함수, `fetch` 주입. `pull(state, fetch) → { state, notes }`, `push(state, notes, fetch) → state`, `blobSha(text)`. Svelte 의존 없음 → Node에서 테스트 가능. ~150줄 |
| `src/lib/sync.svelte.ts` | `Settings` 타입 교체(url/token/cursor → repo/token/head/known). `now()`가 github.ts 호출. `pushedAt` 삭제. schedule/start/status는 그대로. ~40줄 변경 |
| `src/Settings.svelte` Sync 탭 | URL → Repository(`owner/name`), Token 유지. 안내문: repo 만드는 명령, PAT 링크(`github.com/settings/personal-access-tokens/new`), 필요한 권한. Sync now/상태 그대로. ~20줄 |
| `src/lib/github.test.mjs` (신규) | 메모리 가짜 GitHub(ref/trees/blobs/commits/refs/contents, ~80줄)로 두 클라이언트 시나리오: push, pull, LWW, tombstone, 동시 push → 422 재시도, 빈 repo 초기화, `serialize(parse(x)) === x`. 성공 시 `SYNC_OK`. `npm test` |
| `package.json` | `"test": "node --experimental-strip-types src/lib/github.test.mjs"` (Node 버전 확인 필요: 22.6+ 플래그, 24는 기본) |
| `README.md` | Sync 섹션·Layout 교체 |
| `server/`, `GATES.md` G3 | 삭제 / ABANDON 기록 |

마이그레이션: 기존 `eve.sync`에 `url`이 있으면 무시하고 새 필드로 초기화. 사용자가 한 명이므로 충분.

## 2단계 (별도): 이미지 동기화

- Rust 커맨드 3개: `list_assets() → [name]`, `read_asset(name) → bytes`, `write_asset(name, bytes)`. ~50줄
- github.ts: `notes/assets/*`도 tree diff 대상. blob은 `encoding: "base64"`.
- 이미지는 immutable(타임스탬프 이름, 덮어쓰기 없음) → 이름만으로 diff. `known`에 없는 로컬 파일 = push, 로컬에 없는 원격 파일 = pull. 삭제 없음. ~40줄

## 3단계 (선택): 토큰을 Keychain에

localStorage 평문 → `security add-generic-password` 셸아웃. 지금 서버 토큰도 평문이라 급하지 않음.

## 열린 질문 (2026-09-07 답: 1 삭제, 2 유지, 3 유지, 4 고정 — 1·2단계 구현됨)

1. `server/` 삭제해도 되나? (유지하면 백엔드 2개, 코드 2배)
2. 파일명 `notes/<id>.md` 유지? 제목 기반은 rename 처리가 생김. → id 유지 제안.
3. 삭제 노트: tombstone 파일 유지? 실제 삭제하면 git history엔 남지만 updatedAt 비교가 안 된다. → tombstone 제안.
4. 브랜치 `main` 고정, 설정 없음. OK?

## 크기

- 1단계: 반나절. 코드 ~250줄 + 테스트 ~150줄, 삭제 ~200줄.
- 2단계: 2~3시간.

## Gates (1단계)

- G10 `npm run check && npm run build` → `built in`
- G11 `npm test` → `SYNC_OK`
- G12 manual: 실제 private repo(`happy-nut/eve-notes-test`)로 브라우저 dev 2개(포트 5173/5174 = 다른 origin = 분리된 localStorage) 왕복, 동시 편집 시 나중 것이 이김, 삭제 전파, 빈 repo에서 시작.
- G13 `grep -rn "server/" README.md src` → 결과 없음
