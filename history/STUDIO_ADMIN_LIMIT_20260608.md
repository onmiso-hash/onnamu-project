# 🔮 Chronicle Studio 어드민(admin) 전용 접근 제한 및 포털 연동 강화 (2026-06-08)

본 문서는 스튜디오 서비스의 보안을 강화하여 일반 계정(family 등)의 진입을 원천적으로 차단하고, 포털 허브 메인 페이지에서 어드민인 경우에만 해당 링크를 노출하도록 연동한 작업의 상세 내역을 기록합니다.

---

## 🛠️ 1. 변경 및 보완 내역

### 1) 스튜디오 백엔드 서버 권한 강제화 (`studio/server.js`)
* **수정 파일**: [server.js](file:///home/onmiso/project/onnamu-project/studio/server.js)
* **상세**: 
  - `authMiddleware` 미들웨어를 초기화하고 주입하는 과정에서 `{ adminOnly: true }` 옵션을 강제 주입했습니다.
  - 이로써 일반 사용자 계정(family 등 `is_admin=false` 유저)이 `https://studio.onnamu.kr`에 직접 접근을 시도하거나 스튜디오 관련 API를 임의로 호출할 경우, `403 Forbidden` 응답과 에러 메시지가 반환되어 진입이 서버 사이드에서 철저히 차단됩니다.
  - 로그아웃(`/logout`) 및 파비콘(`/favicon.ico`)과 같은 특수 요청 경로는 여전히 미들웨어 인증 절차를 우회하도록 설계되어 있어 SSO 전체 로그아웃 메커니즘은 매끄럽게 작동합니다.

### 2) 포털 허브 메인 페이지 UI의 스튜디오 링크 숨김 연동 (`portal/app.py`)
* **수정 파일**: [app.py](file:///home/onmiso/project/onnamu-project/portal/app.py)
* **상세**:
  - Flask Jinja 템플릿의 `HTML_TEMPLATE` 내 `Operational Services` 섹션에서 `Chronicle Studio` 바로가기 카드 항목을 `{% if is_admin %}` 조건절로 감싸도록 수정했습니다.
  - 어드민 계정으로 로그인한 상태일 때만 메인 대시보드에 스튜디오 링크 카드가 노출되어, 불필요한 노출을 제거하고 직관적인 보안 관리를 달성했습니다.

---

## 📅 2. 후속 검증 및 컨벤션 완료 보고
1. **작업 히트맵 등록**: 로컬 포털 서비스의 히트맵 데이터베이스(`portal/data/news.db`)에 `2026-06-08` 날짜로 이력 데이터를 정상적으로 수동 주입했습니다.
2. **코드 릴리즈**: 변경된 모든 소스 코드를 스테이징하고 한글 커밋 메시지와 함께 `git push origin main`으로 전송하여 Mini PC 배포를 트리거했습니다.
