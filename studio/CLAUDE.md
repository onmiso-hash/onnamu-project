# studio/CLAUDE.md — Chronicle AI Studio

> 공통 규칙: 루트 `CLAUDE.md` 참조.

---

## 구조

- **`server.js`**: Express 백엔드. Gemini API CORS 프록시. 어드민 전용(`adminOnly: true`).
  - 프록시: `/api/generate`, `/api/embed`, `/api/generate-image`, `/api/upload-image`
  - 인물: `GET|POST /api/personas` — **인물 설정만.** 대화(`savedSession`)는 싣지 않는다.
  - 대화: `GET|POST /api/conversations`, `POST /api/conversations/import`,
    `GET|PATCH|DELETE /api/conversations/:id`,
    `POST /api/conversations/:id/turns`, `POST /api/conversations/:id/vectors`
- **`store.js`**: 저장 담당. 서버는 여기만 거쳐 디스크에 닿는다. 경로 안전 검사·19금 판정·옛 데이터 이관도 여기서 한다.
- **`app.js`**: 클라이언트 앱 엔진(`ChronicleApp`). 스토리·캐릭터 채팅 모드, RAG 벡터 저장, 캐릭터 이미지 관리.
- **`index.html` + `style.css`**: 단일 페이지 UI.

---

## 주요 동작 규칙

- **`[BR]` 처리**: AI 응답의 줄바꿈은 `[BR]` 기호로 전달 → `server.js`에서 `\n\n`으로 변환. 클라이언트에서 직접 변환하지 말 것.
- **저장 구조**: `data/users/<username>/` 아래.
  - `characters/<id>.json` — 인물 설정 1명 = 파일 1개
  - `conversations/<convId>/` — 대화 1개 = 폴더 1개
    - `turns.jsonl` — 한 줄 = 한 턴 `{"n":i,"t":{...}}` (append만)
    - `vectors.jsonl` — 한 줄 = 한 벡터 `{"n":i,"v":[...]}` (자리가 아니라 `n`으로 턴을 가리킨다)
    - `meta.json` — 제목·모드·호감도·기억메모·`visibleTurns`·`updatedAt`
  - 목록 파일(index.json)은 **두지 않는다.** 목록은 각 `meta.json`을 훑어 만든다.
- **턴 덧붙이기 규칙**(`POST .../turns`): 현재 위치의 유일한 기준은 `meta.visibleTurns`.
  `n < visibleTurns` → 무시(재전송) / `n = visibleTurns` → 이어쓰기 / `n > visibleTurns` → 400 거부.
  같은 `n`이 여러 줄이면 **마지막 줄이 이긴다.** 되돌리기는 삭제가 아니라 `visibleTurns` 숫자를 줄이는 것.
- **옛 데이터**: `data/personas_<username>.json`은 사용자 폴더를 처음 만들 때 1회 자동 이관되며 **원본은 지우지 않는다.**
  브라우저에만 있던 대화는 `POST /api/conversations/import`로 한 방향 이사(같은 `importKey`면 409, 덮어쓰기 없음).
- **19금**: 판정은 `store.js`의 `isAdult19Character` 하나로 일원화(레벨 `adult-19` 또는 이름에 `19금`).
  일반 계정에는 19금 인물의 대화와 `chatLevel`이 19금인 대화를 감추며, 감춤과 없음의 응답을 404로 통일한다.
  (지금은 `adminOnly` 빗장 때문에 이 갈래가 실행되지 않는다 — 빗장을 풀 때 실측 검증할 것.)
- **RAG**: 임베딩 모델 `gemini-embedding-001` + `outputDimensionality: 768`
  (구모델 `text-embedding-004`는 2026-01-14 구글이 폐기 → 404. 차원 줄이기는 `gemini-embedding` 계열에만 싣는다).
  벡터는 `vectors.jsonl`에 남고 대화를 열 때 `?vectors=1`로 되살아난다. 유사도는 코사인이라 **정규화 불필요.**
  임베딩이 실패하면 삼키지 않고 화면 구석에 "⚠ 기억 검색 꺼짐"을 띄운다.
- **인증**: `authHelper.js`로 포털 SSO 토큰 검증. 어드민 여부(`is_admin`)로 기능 분기.
