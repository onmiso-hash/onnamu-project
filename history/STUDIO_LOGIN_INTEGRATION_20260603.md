# Chronicle Studio 로그인 기능 추가 및 Media Home 통합(SSO) 연동

본 문서는 2026년 6월 3일 진행된 Chronicle Studio와 Media Home 간의 로그인 통합(SSO) 연동 및 어드민 권한 제어 작업의 상세 구현 내역을 기록합니다.

## 1. 개요 및 요구사항
- **요구사항**: Chronicle Studio 서비스(`studio`)에 로그인 기능을 도입하되, Media Home(`gallery`)의 로그인 페이지를 그대로 활용하여 Single Sign-On (SSO) 형태로 통합 운영하도록 설계 및 구현.
- **추가 요구사항 (2026-06-03)**: admin 계정으로 로그인했을 때만 19금 수위 설정을 할 수 있도록 하고, 19금 수위 설정이 된 페르소나 역시 admin 계정에서만 노출 및 선택 가능하도록 통제 기능 적용.

## 2. 세부 구현 사항

### A. Media Home 백엔드 (`gallery/app.py`)
- **인증 토큰 발급 유틸리티 (`generate_auth_token`) 확장**:
  - 생성자에 `is_admin=False` 플래그를 추가로 전달받아 토큰 페이로드에 `"is_admin": is_admin` 정보를 포함시킴.
- **로그인 엔드포인트 (`/login`) 수정**:
  - `user.get("is_admin", False)` 값을 `generate_auth_token`에 주입하여 토큰을 생성 및 쿠키로 발급.
- **로그아웃 엔드포인트 (`/logout`) 수정**:
  - `auth_token` 쿠키를 만료(삭제) 시킴.

### B. Chronicle Studio 백엔드 (`studio/server.js`)
- **인증 검사 미들웨어 추가**:
  - `express.static` 및 주요 라우트 실행 전에 인증 토큰(`auth_token`) 유효성을 검사하는 미들웨어 정의.
  - 미인증 요청 시 자동으로 `https://gallery.onnamu.kr/login?next=현재주소` (로컬은 포트 5002)로 리다이렉트 처리.
- **로그아웃 및 사용자 정보 API 추가**:
  - `/logout` 경로 진입 시 토큰을 클리어하고 Media Home의 로그아웃으로 이동.
  - `/api/user-info` API에서 `{ username, isAdmin }` 형태의 객체를 반환하도록 개선하여 프론트엔드가 관리자 권한 여부를 판별할 수 있게 함.

### C. Chronicle Studio 프론트엔드 UI/UX 및 권한 제어 (`studio/index.html` & `studio/app.js`)
- **설정창 프로필 및 로그아웃 추가**:
  - 오버레이 설정 패널 상단에 유저 세션을 표현하는 바와 로그아웃 링크 추가.
  - 메인 워크스페이스 상단 HUD 헤더 버튼 목록에 빨간 톤의 `🚪 로그아웃` 버튼 추가.
- **수위 조절(19금) 제한 구현**:
  - `app.js`에서 `/api/user-info`를 통해 `isAdmin`이 `false`로 식별되면 장르(`select-genre`)의 'adult-19', 분위기(`select-tone`)의 'sensual', 수위 설정(`select-chat-level`)의 'adult-19' 옵션을 DOM 트리에서 완전히 제거(`remove()`)하여 일반 사용자는 선택 불가능하게 원천 차단.
- **19금 페르소나 프리셋 노출 제한 구현**:
  - `loadPersonaPresets()` 실행 시 `isAdmin`이 `false`인 경우, 프리셋 정보의 `level`이 `adult-19`이거나 프리셋 이름에 `19금` 텍스트가 명시된 프리셋을 렌더링 목록에서 제외(스킵) 처리함. (예: 기본 탑재된 '릴리스(계약 악마 - 19금)' 프리셋이 일반 계정에서는 표시되지 않음)

## 3. 로컬 및 배포 도메인 대응 유연성 보장
- `localhost`와 `onnamu.kr` 양쪽 도메인 환경 모두에서 쿠키 설정 및 리다이렉트 주소가 Host 정보에 맞게 가변적으로 설정되도록 구현하여, 개발 단계 및 배포 환경에서 설정 변경 없이 원활히 동작함.
