# studio/CLAUDE.md — Chronicle AI Studio

> 공통 규칙: 루트 `CLAUDE.md` 참조.

---

## 구조

- **`server.js`**: Express 백엔드. Gemini API CORS 프록시. 어드민 전용(`adminOnly: true`).
  - 엔드포인트: `/api/generate`, `/api/embed`, `/api/generate-image`, `/api/personas`
- **`app.js`**: 클라이언트 앱 엔진(`ChronicleApp`). 스토리·캐릭터 채팅 모드, RAG 벡터 저장, 캐릭터 이미지 관리.
- **`index.html` + `style.css`**: 단일 페이지 UI.

---

## 주요 동작 규칙

- **`[BR]` 처리**: AI 응답의 줄바꿈은 `[BR]` 기호로 전달 → `server.js`에서 `\n\n`으로 변환. 클라이언트에서 직접 변환하지 말 것.
- **페르소나**: `data/personas_<username>.json`에 저장. 일반 계정은 `adult-19` 레벨 프리셋 접근 차단.
- **RAG**: 벡터 저장소는 `app.js` 내 인메모리. 세션 종료 시 초기화됨.
- **인증**: `authHelper.js`로 포털 SSO 토큰 검증. 어드민 여부(`is_admin`)로 기능 분기.
