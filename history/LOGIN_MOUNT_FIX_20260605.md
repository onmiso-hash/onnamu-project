# 작업 상세 내역: 통합 로그인 포털 users.json 마운트 경로 수정 및 배포 안정화

- **작업 일시**: 2026-06-05
- **수정 목적**: 502 Bad Gateway 에러 발생 원인 해결 및 배포 환경 안전성 향상

## 🔍 이슈 현상 및 원인 분석
- **현상**: SSO 통합 로그인 연동 배포 이후 `onnamu.kr` 및 하위 서비스 접속 시 502 Bad Gateway 에러가 지속해서 보고됨.
- **원인**:
  - `portal/docker-compose.yml` 내 마운트 설정인 `- ../gallery/users.json:/app/users.json:ro`가 Windows Host(Mini PC) 배포 시 상대 경로 매핑 이슈로 인해 정상 파일을 로드하지 못함.
  - 경로에 파일이 존재하지 않는다고 인식한 Docker Desktop이 `users.json`을 **디렉토리(폴더)**로 임시 자동 생성한 뒤 컨테이너에 마운트함.
  - 포털(Flask) 애플리케이션 기동 시 `users.json`을 열어 사용자를 로드하려 할 때 `IsADirectoryError` 등이 발생해 컨테이너가 즉시 Crash 및 Stop 됨.
  - 포털 및 갤러리 컨테이너의 비정상 종료로 인해 Nginx/Cloudflare가 502 에러를 노출함.

## 🛠️ 조치 내용
1. **포털 마운트 단순화 (`portal/docker-compose.yml`)**:
   - 상대 경로 마운트(`../gallery/users.json`)를 제거하고 포털 내부 로컬 파일 마운트(`./users.json:/app/users.json:ro`)로 단순화하여 배포 안정성을 확보함.
2. **갤러리 설정 정리 (`gallery/docker-compose.yml`)**:
   - 더 이상 `users.json` 파일을 직접 조회하지 않고 공통 토큰 검증 로직으로 완결된 갤러리 서비스에서 미사용 환경 변수(`USERS_CONF_PATH`)를 완전 삭제 및 정리함.
3. **호스트 수동 복구 (사용자 수행)**:
   - 미니 PC 윈도우 환경에서 자동 생성된 `users.json` 빈 디렉토리를 제거하고 올바른 `users.json` 설정 파일을 `portal/` 내부로 수동 배치하도록 안내 및 수행 완료.

## 📅 향후 과제
- 차후 서비스 분리 시 포털이 인증(IDP) 역할을 완전히 전담하며, 타 마이크로서비스는 `auth_helper.py` 및 `authHelper.js` 모듈을 이용한 서명 검증 방식만 유지하도록 코드 복잡도를 지속 관리함.
