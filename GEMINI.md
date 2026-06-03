# Project: onnamu-project

이 파일은 프로젝트의 아키텍처, 규칙, 그리고 중요한 기록들을 담고 있습니다. 다른 환경에서 작업을 시작할 때 이 내용을 참고하여 빠르게 컨텍스트를 파악할 수 있습니다.

## 🏗️ 시스템 아키텍처 (Architecture)

본 프로젝트는 여러 마이크로서비스 및 웹 어플리케이션으로 구성된 통합 관리 시스템입니다.

### 1. Home Hub (Portal)
- **경로**: `/portal`
- **기술 스택**: Python (Flask), SQLite, HTML/CSS (Glassmorphism UI)
- **주요 기능**: 
  - 서버 상태 모니터링 (CPU, RAM, Disk)
  - 전체 운영 서비스(Operational Services) 링크 허브
  - 일일 뉴스 및 작업 이력 히트맵 기록

### 2. RDAP Service
- **경로**: `/rdap`
- **구성**:
  - **Bootstrap Server**: FastAPI 기반. IANA 데이터를 24시간 주기로 동기화하여 리다이렉트 수행. (`https://bootstrap.rdap.kr`)
  - **Web Client**: 다국어(KO/EN) 지원 JavaScript 클라이언트.
  - **Dashboard**: 실시간 통계 및 상태 대시보드.
- **문서**: `rdap/README_BOOTSTRAP.md`, `rdap/rdap_bootstrap_plan.md` 참고.

### 3. Media Gallery
- **경로**: `/gallery`
- **기술 스택**: Python (Flask)
- **기능**: 개인용 미디어 아카이브 및 관리 기능 제공.

### 4. 기타 연동 서비스
- **n8n**: 워크플로우 및 자동화 관리.
- **Jaeseung Bot**: 텔레그램 기반 서버 모니터링 봇.
- **Movie Theater**: 대용량 미디어 스트리밍 서비스.
- **Chronicle AI Studio**: AI와 함께 이야기를 창작하고 대화하는 스튜디오. (경로: `/studio`)

## 🛠️ 개발 및 배포 가이드

- **배포**: Docker & Docker Compose를 사용하며, GitHub Actions를 통해 Mini PC에 자동 배포됩니다.
- **데이터베이스**: 주로 SQLite를 사용하며, 영구 데이터는 각 서비스의 `data/` 폴더에 저장됩니다.

## 📜 작업 규칙 (Conventions)

- **커밋 메시지**: 모든 Git 커밋 메시지는 **한글**로 작성합니다.
- **코드 스타일**: 기존의 관습과 아키텍처 패턴을 엄격히 준수하며, 타입 안정성과 가독성을 최우선으로 합니다.
- **AI 협업**: Gemini CLI와 협업 시, 이 파일을 최우선 지침으로 삼습니다.
- **AI 진행 상황 한글 출력**: 도구 호출 요약 문구(`toolAction`, `toolSummary`)를 포함하여 작업 진행 상태와 설명, 사고 흐름 등은 반드시 **한국어(한글)**로 출력하여 사용자가 진행률 및 상황을 손쉽게 인지할 수 있도록 강력히 배려해야 합니다.
- **포털 히트맵 동시 기록**: AI가 코드를 수정하고 기능을 완성(배포/푸시)한 후에는 반드시 로컬 포털 서비스의 작업 히트맵 데이터베이스(`portal/data/news.db`)에도 오늘 날짜(YYYY-MM-DD)와 상세 작업 이력 데이터를 SQLite 쿼리를 가동해 직접 주입해 두어야 합니다. 이는 매 세션마다 사용자의 별도 지시가 없어도 항상 자동으로 작동해야 하는 기본 행동 지침입니다.
- **사전 작업 승인**: 소스 코드 개발, 수정 또는 설정 변경 등의 실제 액션을 취하기 전, 반드시 사용자에게 분석 내용과 구현 계획에 대해 확인 및 승인을 받은 후 작업에 착수합니다. 독단적으로 선작업을 진행하고 사후에 통보하는 방식은 전면 금지합니다.
- **신중한 보고 및 검증 권유**: 직접 테스트나 런타임 검증을 완벽하게 끝마친 확정적인 사실이 아닌 경우, 단정적으로 "해결되었습니다", "완벽히 수정되었습니다"와 같은 표현의 사용을 전면 금지합니다. 대신 "수정 작업을 완료하였고 확인이 필요합니다"와 같이 사용자에게 정중히 재검증을 권유하는 방식으로 일관되게 보고를 수행합니다.

## 📅 주요 히스토리
- 2026-06-04: Chronicle AI Studio 아바타 이미지 추가 2배 확대(130px) 및 마이크로 인터랙션 개선. 상세 내용은 `history/STUDIO_CHARACTER_IMAGES_20260604.md` 참조.
- 2026-06-04: Chronicle AI Studio 아바타 이미지 확대 및 텍스트 가독성(말풍선/선택지) 대폭 상향. 상세 내용은 `history/STUDIO_CHARACTER_IMAGES_20260604.md` 참조.
- 2026-06-04: Chronicle AI Studio 수동 이미지 업로드 용량 제한(localStorage 한도 초과) 해결 및 대화창 아바타 노출 보완. 기존 프리셋 덮어쓰기 시 대화 세션 보존 패치 적용. 상세 내용은 `history/STUDIO_CHARACTER_IMAGES_20260604.md` 참조.
- 2026-06-04: Chronicle AI Studio 설정창 캐릭터 이미지 생성(평온, 기쁨, 슬픔, 화남, 부끄러움) 및 대화 응답(emotion) 이미지 자동 매핑 시스템 구축. 상세 내용은 `history/STUDIO_CHARACTER_IMAGES_20260604.md` 참조.
- 2026-06-03: Windows SSH 배포 자동화 Docker 자격 증명 오류 우회 조치 및 배포 로그 절대 경로 단일화. 상세 내용은 `history/CI_DEPLOY_FIX_20260603.md` 참조.
- 2026-06-03: 통합 로그인 페이지 명칭 개편(Media Home -> onnamu) 및 스튜디오 내 환영 메시지 UI 로딩 깜빡임 개선. 일반 유저(family) 로그인 시 로컬 스토리지 19금 세션 복구 차단 패치 적용. 상세 내용은 `history/STUDIO_LOGIN_INTEGRATION_20260603.md` 참조.
- 2026-06-03: Chronicle Studio 로그인 기능 추가 및 Media Home 통합(SSO) 연동 완료 (공통 서명 토큰 auth_token 발행/검증, 어드민 권한에 따른 19금 콘텐츠 차단 및 페르소나 필터링, 연동 로그아웃 및 UI 컴포넌트 추가). 상세 내용은 `history/STUDIO_LOGIN_INTEGRATION_20260603.md` 참조.
- 2026-06-03: Chronicle AI Studio 마이크로서비스 추가 및 포털 연동 완료 (소설 메이커 및 대화형 롤플레이 모드, Web Audio API 사운드, RAG 임베딩 검색 적용 및 docker-compose 빌드 버그 수정).
- 2026-06-02: RDAP 부트스트랩 API 표준 리다이렉트(HTTP 307) 응답 복구 및 CORS 우회용 프록시 쿼리 파라미터 적용. 상세 내용은 `history/RDAP_REDIRECT_FIX_20260602.md` 참조.
- 2026-05-31: RDAP 서비스 프론트-백엔드 아키텍처 통합 및 Cloudflare/브라우저 캐시 문제 근본적 해결. 상세 내용은 `history/RDAP_UNIFICATION_20260531.md` 참조.
- 2026-05-31: 하이퍼 스네이크(Hyper Snake) 모던 웹게임 개편 및 로비 연동 (가속도 시스템, localStorage 랭킹 대시보드, Web Audio API 효과음, 파티클 폭발 연출 추가). 상세 내용은 `history/GAMES_HYPER_SNAKE_20260531.md` 참조.
- 2026-05-30: 매치-3 퍼즐 게임 'Cloud Crush' 추가 및 포털 연동 (스테이지 난이도 밸런싱 및 누적 점수 구조 개선). 상세 내용은 `history/GAMES_CLOUD_CRUSH_20260530.md` 참조.
- 2026-05-23: Media Home 갤러리 뷰어(Lightbox) 내비게이션 기능 추가 (버튼, 키보드, 스와이프). 상세 내용은 `history/MEDIA_NAVIGATION_20260523.md` 참조.
- 2026-05-23: Games 마이크로서비스 추가 및 포털 연동 (Snake, 2048, Pong, Flappy Clone). 상세 내용은 `history/GAMES_INTEGRATION_20260523.md` 참조.
- 2026-05-23: 1943 스타일 슈팅 게임 '1943 Retro' 추가. 상세 내용은 `history/GAMES_1943_ADDITION_20260523.md` 참조.
- 2026-05-23: 모든 게임에 시작 버튼 추가 및 Snake 게임 버그 수정. 상세 내용은 `history/GAMES_START_BUTTON_20260523.md` 참조.
- 2026-05-17: 미디어 서비스 통합 및 디자인 개편 (Media Gallery + Movie Theater -> Media Home). 상세 내용은 `history/MEDIA_MERGE_20260517.md` 참조.
- 2026-05-17: 포털 뉴스 헤더 인식 로직 단순화 (이모지 기반). 상세 내용은 `history/PORTAL_NEWS_LOGIC_20260517.md` 참조.
- 2026-05-11: 프로젝트 통합 가이드 `GEMINI.md` 생성 및 히스토리 관리 체계 수립.
- 2026-05-10: 커밋 메시지 한글 작성 규칙 추가.
- **2026-05-05**: [[RDAP_REDESIGN_20260505]] RDAP 서비스 디자인 개편 (Eco-Tech Modern 테마 적용). 상세 내용은 `history/` 폴더 참조.

## 📝 히스토리 기록 규칙
- **중요 마일스톤**: `GEMINI.md`의 '주요 히스토리' 섹션에 한 줄 요약 기록.
- **상세 작업 내역**: `history/` 폴더 내에 별도 `.md` 파일을 생성하여 기록 (예: `history/TASK_NAME_YYYYMMDD.md`).
- **기억 참조**: 과거 작업의 구체적인 맥락이 필요할 때 `history/` 폴더의 문서를 우선적으로 참조함.

