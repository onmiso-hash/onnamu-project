# Chronicle AI Studio 대화창 UI 대대적 개편 (Gemini.google.com 스타일)

- **작성일**: 2026-06-04
- **작성자**: Antigravity (AI)
- **작업 목적**: 2분할 레이아웃이었던 창작 스튜디오 UI를 Google Gemini 스타일의 단일 피드 인터페이스로 대대적으로 통합 및 리팩토링하여 웹/모바일 반응형 경험을 상향시킴.

---

## 🎨 주요 변경 내용

### 1. 상단 고정 통합 헤더 (`#studio-fixed-header`)
- **설정 정보 배지**: 장르, 서사 분위기, 주인공, AI 모델 정보를 미니멀한 배지로 묶어 고정 노출.
- **캐릭터 요약 정보 Pill (`#char-profile-summary-pill`)**: 챗 모드일 때 캐릭터 아바타, 이름, 💖 호감도 수치가 실시간 갱신되는 컴팩트한 알약 모양 Pill 추가.
- **상세 프로필 및 메모리 드롭다운 패널 (`#header-detail-panel`)**: `ℹ️ 정보` 버튼을 클릭하면 상세 정보와 RAG 연동 "주요 기억 메모리"를 일목요연하게 표시.

### 2. 중앙 단일 대화 피드 스트림 (`#story-scroll-area`)
- 기존의 좌측 책(Codex) 및 우측 오라클 예언자 로그의 2분할을 **단일 피드**로 일원화.
- `app.js`에서 챗 로그(`chatLogArea`)를 스토리 스크롤 영역(`storyScrollArea`)에 동일하게 통합 바인딩하여 오작동 없는 안전장치 확보.
- **렌더링 방식 최적화**: 실시간 생성 및 답변 수신 단계에서는 `isGenerating` 플래그를 활용하여 캔버스를 싹 지우지 않고 메시지 버블을 순차적으로 덧붙임으로써 번쩍임 제거 및 타이핑 애니메이션 보존. 세션 복구 및 Undo 시에만 캔버스를 초기화하고 처음부터 끝까지 정렬하여 리렌더링.

### 3. 하단 고정 제어 영역 (`#studio-bottom-controls`)
- **추천 선택지 칩**: 가로 스크롤이 매끄럽게 동작하는 칩 카드 형태로 추천 행동 3가지를 배치.
- **Gemini 스타일 텍스트 상자**: 둥근 코너와 글로우 그림자 효과를 입혔으며, 여러 줄 입력 시 `textarea` 높이가 실시간으로 늘어나는 자동 높이 조절 스크립트 바인딩.

### 4. 반응형 모바일 최적화
- 모바일(768px 이하)에서 비필수 정보들을 감추는 `.mobile-hide` 도입.
- 모바일 가상 키보드가 켜졌을 때 레이아웃 무너짐을 방지하기 위해 뷰포트 높이 단위를 `100dvh`로 설정하고 CSS Flex 기반 정교한 상하 배치 구조 설계.

---

## 📂 변경 파일 목록

1. **[index.html](file:///home/onmiso/project/onnamu-project/studio/index.html)**: `app-container` 내부 레이아웃을 상단 헤더, 중앙 피드, 하단 컨트롤 구조로 재조립.
2. **[style.css](file:///home/onmiso/project/onnamu-project/studio/style.css)**: 신규 UI 요소들의 Glassmorphism 디자인, 모바일 반응형 쿼리 및 칩 슬라이드 애니메이션 적용.
3. **[app.js](file:///home/onmiso/project/onnamu-project/studio/app.js)**: DOM 바인딩 통합, 텍스트 가변 높이 제어, 상단 상세 패널 토글, 챗/소설 모드 별 렌더링 최적화 및 세션 복구 이중 렌더링 제거.

---

## ⚙️ 적용 및 배포

- **Git Commit**: `[main d0baa13] Chronicle AI Studio 대화창 UI gemini.google.com 스타일 단일 피드로 대대적 개편`
- **Git Push**: `origin main` (완료)
- **포털 히트맵 기록**: `portal/data/news.db` 내 `work_history` 테이블에 오늘 날짜와 개발 요약 기록 수동 SQL 인서트 완료.
