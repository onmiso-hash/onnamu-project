# 2026-09-26: 타워 디펜스 게임 '성벽의 노래' 추가 및 로비 연동

## 🎮 게임 개요
- **게임명**: 성벽의 노래 (wallsong)
- **종류**: 길을 따라 몰려오는 괴물을 탑·영웅·주문으로 막는 판타지 타워 디펜스. 세 장, 열두 스테이지, 보스 3종.
- **기술**: Phaser 3 + TypeScript + Vite. 원본 저장소는 `defense-game/`(별도 폴더) — 여기에는 **빌드 결과만** 둔다.
- **위치**: `/wallsong/` (게임 마이크로서비스의 `games/wallsong/` 폴더를 그대로 내준다)

## 🏗️ 구현 상세

### 1. Flask 라우트 및 로비 연결
- `games/app.py`: `/wallsong`은 `/wallsong/`로 넘기고, `/wallsong/<파일>`은 `send_from_directory`로 `games/wallsong/`에서 내준다(없으면 `index.html`).
- `games/templates/index.html`: 로비 마지막 칸에 🏰🏹 카드와 NEW 배지(Night Grove 카드와 같은 인라인 스타일). 기존 카드는 손대지 않음.

### 2. 빌드 결과 바꾸는 법
- 게임 폴더에서 `npm run build` → `rsync -a --delete dist/ <온나무>/games/wallsong/` → 커밋·푸시.
- 빌드는 상대 주소(`base: "./"`)라 `/wallsong/` 아래에서 그대로 동작한다. 오프라인 실행 파일(`sw.js`)도 같은 폴더에 있다.
- 크기: 약 5.2MB(그림 104장 포함).

### 3. 확인 (2026-09-26, 로컬 Flask)
- `/wallsong` 302, `/wallsong/`·`sw.js`·`manifest.webmanifest`·게임 코드·그림 200, 로비에 카드 1개.
