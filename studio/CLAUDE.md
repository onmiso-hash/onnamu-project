# studio/CLAUDE.md — Chronicle AI Studio

> 공통 규칙: 루트 `CLAUDE.md` 참조.

---

## 구조

- **`server.js`**: Express 백엔드. Gemini API CORS 프록시. **로그인한 사람은 누구나 들어온다**(빗장 해제, 2026-08-18).
  - 관리용 통로만 관리자 전용: `DELETE /api/admin/user-data/:username` (포털의 계정 지우기가 부른다)
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
    - `meta.json` — 제목·모드·`charId`·`charName`·호감도·기억메모·`visibleTurns`·`updatedAt`
  - 목록 파일(index.json)은 **두지 않는다.** 목록은 각 `meta.json`을 훑어 만든다.
- **턴 덧붙이기 규칙**(`POST .../turns`): 현재 위치의 유일한 기준은 `meta.visibleTurns`.
  `n < visibleTurns` → 무시(재전송) / `n = visibleTurns` → 이어쓰기 / `n > visibleTurns` → 400 거부.
  같은 `n`이 여러 줄이면 **마지막 줄이 이긴다.** 되돌리기는 삭제가 아니라 `visibleTurns` 숫자를 줄이는 것.
- **옛 데이터**: `data/personas_<username>.json`은 사용자 폴더를 처음 만들 때 1회 자동 이관되며 **원본은 지우지 않는다.**
  브라우저에만 있던 대화는 `POST /api/conversations/import`로 한 방향 이사(같은 `importKey`면 409, 덮어쓰기 없음).
- **19금**: 판정은 `store.js`의 `isAdult19Character` 하나로 일원화(레벨 `adult-19` 또는 이름에 `19금`).
  일반 계정에는 19금 인물의 대화와 `chatLevel`이 19금인 대화를 감추며, 감춤과 없음의 응답을 404로 통일한다.
  **열람 여부는 `canAdult`가 판정한다 — `isAdmin`이 아니다.** 둘은 2026-08-18에 갈렸다:
  `isAdmin`은 관리자인가(관리용 통로 전용), `canAdult`는 19금을 볼 수 있는가(`adult_ok` 또는 관리자).
  화면(`app.js`)에도 `this.canAdult`로 들어간다 — 여기서 `isAdmin`을 다시 쓰지 말 것.
  안 보이던 19금 인물은 그 계정이 인물을 저장해도 **지워지지 않는다**(교체 대상에서 뺀다).
- **RAG**: 임베딩 모델 `gemini-embedding-001` + `outputDimensionality: 768`
  (구모델 `text-embedding-004`는 2026-01-14 구글이 폐기 → 404. 차원 줄이기는 `gemini-embedding` 계열에만 싣는다).
  벡터는 `vectors.jsonl`에 남고 대화를 열 때 `?vectors=1`로 되살아난다. 유사도는 코사인이라 **정규화 불필요.**
  임베딩이 실패하면 삼키지 않고 화면 구석에 "⚠ 기억 검색 꺼짐"을 띄운다.
- **대화 목록**(왼쪽 서랍): **인물별로 묶어** 그린다 — 인물 이름은 머리글에 한 번만, 줄에는 제목·말 개수·날짜.
  묶는 기준은 `charId`(이름이 같은 다른 인물이 섞이지 않게), 없으면 `charName`. 소설은 묶지 않는다.
  제목 앞에 붙은 인물 이름은 떼고 보여주며, 떼면 남는 게 없으면 `(제목 없음)`.
  줄은 `div` + 안쪽 `.conv-open` 버튼 + 연필·휴지통(`.conv-action`) 구조다 — **버튼 안에 버튼을 넣지 말 것**(클릭이 겹친다).
  줄에는 `data-conv-id`가 붙어 있다. **줄을 제목 글자로 찾지 말고 이 값으로 찾을 것.**
- **제목 자동 생성**: 사용자가 건넨 **첫 마디**(30자 초과 시 자름). 첫 두 턴에서만, 그리고 제목이 아직 자동으로
  붙은 것일 때만 짓는다(연필로 고친 제목은 덮지 않는다). **AI 대사는 제목으로 쓰지 않는다**(지문 섞인 긴
  문장이 올라온다). 소설만 예외로 챕터 제목을 쓴다.
- **수위(`chatLevel`)의 주인은 대화다.** 인물 설정(`characters/<id>.json`의 `level`)은 **기본값일 뿐**이며,
  새 대화를 만들 때 한 번 물려줄 뿐 이미 있는 대화를 덮지 않는다. 지금 대화의 수위는 사이드바
  `btn-toggle-chat-level`로만 바꾸고 `PATCH /api/conversations/:id`로 그 대화에만 저장한다.
  - 설정창 표시값을 `savedSession.chatLevel`에서 끌어오지 말 것 — 기본값을 고쳐도 옛 대화 값이
    화면을 덮어 고칠 수 없게 된다(실제 결함, `history/TASK_20260818.md` 참조).
  - 대화를 열 때 인물 수위를 얹은 뒤 `conv.chatLevel`로 덮는 순서가 **의도된 동작**이다. 뒤집지 말 것.
  - 같은 인물의 대화끼리 수위가 다를 수 있다(실데이터에 이미 있다). "인물 값으로 통일"은 데이터를 덮는다.
- **대화의 주인 판정**: `charId` → `charName` 순으로 본다. **`title`로 판정하지 말 것** — 제목은 사용자가
  자유롭게 바꾸는 값이라 식별에 쓰면 대화가 주인을 잃는다(실제 결함, `history/TASK_20260817.md` 참조).
- **대화 지우기**: 보고 있던 대화를 지우면 같은 인물의 다른 대화로 옮겨가고, 없으면 빈 화면으로 떨어진다
  (서버에 새 대화를 만들지 않는다 — 빈 껍데기가 쌓인다). `last_conv_chat_*` 기억도 함께 뗀다.
- **인증**: `authHelper.js`로 포털 SSO 토큰 검증. **출입증은 '누구인가'만 담는다** —
  권한(`is_admin`·`adult_ok`·`folders`·`can_upload`·`locked`)은 포털의
  `GET /api/auth/permissions/<아이디>`에 물어 온다(60초 캐시, `X-API-Key`=`SECRET_KEY`).
  출입증이 30일짜리라 그 안의 값은 발급 시점의 사실일 뿐이다.
  포털에 못 물으면 마지막에 들은 답으로, 그것도 없으면 출입증 값으로 버티되
  **새 권한(`adult_ok`)은 꺼진 쪽으로 둔다 — 모르면 열지 않는다.**
