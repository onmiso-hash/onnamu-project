# Games Integration (2026-05-23)

## 작업 개요
포털 시스템에 가벼운 웹 게임을 즐길 수 있는 `Games` 마이크로서비스를 추가하고 연동함.

## 구현 상세

### 1. Games Microservice (`/games`)
- **기술 스택**: Python (Flask), HTML5 Canvas, CSS (Glassmorphism UI)
- **컨테이너화**: Docker 및 Docker Compose 적용 (포트 5004)
- **제공 게임**:
  - **Snake**: 고전 스네이크 게임 (Canvas)
  - **2048**: 숫자 합치기 퍼즐 (Grid/JS)
  - **Pong**: AI와 대결하는 탁구 게임 (Canvas)
  - **Flappy Clone**: 타이밍 기반 장애물 피하기 게임 (Canvas)

### 2. Portal Integration
- `/portal/app.py`의 `HTML_TEMPLATE`를 수정하여 `Operational Services` 섹션에 `Games Hub` 링크 추가.
- `renewal_*.html` 파일들은 요청에 따라 수정 대상에서 제외함.

## 주요 파일
- `games/app.py`: 서비스 라우팅 로직
- `games/templates/index.html`: 게임 로비 UI
- `games/templates/*.html`: 각 게임별 구현 파일
- `games/Dockerfile` & `games/docker-compose.yml`: 배포 설정
- `portal/app.py`: 포털 연동 업데이트
