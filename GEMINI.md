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

## 🛠️ 개발 및 배포 가이드

- **배포**: Docker & Docker Compose를 사용하며, GitHub Actions를 통해 Mini PC에 자동 배포됩니다.
- **데이터베이스**: 주로 SQLite를 사용하며, 영구 데이터는 각 서비스의 `data/` 폴더에 저장됩니다.

## 📜 작업 규칙 (Conventions)

- **커밋 메시지**: 모든 Git 커밋 메시지는 **한글**로 작성합니다.
- **코드 스타일**: 기존의 관습과 아키텍처 패턴을 엄격히 준수하며, 타입 안정성과 가독성을 최우선으로 합니다.
- **AI 협업**: Gemini CLI와 협업 시, 이 파일을 최우선 지침으로 삼습니다.

## 📅 주요 히스토리
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

