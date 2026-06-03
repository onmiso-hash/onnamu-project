# Chronicle Studio 로그인 기능 추가 및 Media Home 통합(SSO) 연동

본 문서는 2026년 6월 3일 진행된 Chronicle Studio와 Media Home 간의 로그인 통합(SSO) 연동 작업의 상세 구현 내역을 기록합니다.

## 1. 개요 및 요구사항
- **요구사항**: Chronicle Studio 서비스(`studio`)에 로그인 기능을 도입하되, Media Home(`gallery`)의 로그인 페이지를 그대로 활용하여 Single Sign-On (SSO) 형태로 통합 운영하도록 설계 및 구현.
- **아키텍처**: 
  - `gallery.onnamu.kr` (Flask)와 `studio.onnamu.kr` (Express) 간의 세션 공유를 위해 쿠키를 매개체로 사용.
  - 로그인 성공 시 Flask 세션과 별개로 NodeJS에서도 쉽게 복호화 및 검증할 수 있는 공통 인증 쿠키(`auth_token`)를 생성함.
  - 보안 강화를 위해 암호학적으로 안전한 HMAC-SHA256 기반 서명을 페이로드 뒤에 덧붙여 전송하는 구조 설계.

## 2. 세부 구현 사항

### A. Media Home 백엔드 (`gallery/app.py`)
- **인증 토큰 발급 유틸리티 (`generate_auth_token`) 추가**:
  - `username`과 `expiration_timestamp`를 JSON 형태로 묶어 Base64Url 인코딩 후, Flask의 `SECRET_KEY`를 사용한 HMAC-SHA256 서명을 생성.
- **로그인 엔드포인트 (`/login`) 수정**:
  - 로그인에 성공하면 `generate_auth_token`을 통해 쿠키 값을 생성.
  - 브라우저가 서브도메인 간 공유할 수 있도록 Host 헤더에 `onnamu.kr`이 포함되어 있으면 `Domain=.onnamu.kr`로 설정, 로컬 개발 환경(localhost)에서는 도메인을 명시하지 않고 호스트로 전송되게 처리.
- **로그아웃 엔드포인트 (`/logout`) 수정**:
  - 로그아웃 처리 시 `auth_token` 쿠키를 만료(삭제) 시킴.

### B. Chronicle Studio 백엔드 (`studio/server.js`)
- **인증 검사 미들웨어 추가**:
  - `express.static` 및 주요 라우트 실행 전에 인증 토큰(`auth_token`) 유효성을 검사하는 미들웨어 정의.
  - 미인증 요청(쿠키 검증 실패) 시 자동으로 `https://gallery.onnamu.kr/login?next=현재주소` (로컬의 경우 `http://localhost:5002/login?next=현재주소`)로 리다이렉트 처리.
  - `/api/*` 경로의 요청도 마찬가지로 인증 검사하여 무단 API 접근 시 `401 Unauthorized` 에러 반환.
- **로그아웃 라우트 (`/logout`) 추가**:
  - `auth_token` 쿠키를 삭제하고, `gallery` 서비스의 로그아웃 엔드포인트로 최종 리다이렉트하여 Flask 세션까지 완벽히 소거.
- **유저 정보 조회 API (`/api/user-info`) 추가**:
  - 현재 인증된 사용자명을 프론트엔드로 안전하게 반환.

### C. Chronicle Studio 프론트엔드 UI/UX (`studio/index.html` & `studio/app.js`)
- **설정 오버레이 수정**:
  - 설정창 상단에 유저 프로필 영역을 추가하여 `[사용자명]님 환영합니다 | 🚪 로그아웃` UI를 배치.
- **HUD 헤더 수정**:
  - 메인 워크스페이스 상단 HUD 헤더 버튼 목록에 스타일리시한 빨간 톤의 `🚪 로그아웃` 버튼을 추가.
- **앱 로직 (`app.js`) 연동**:
  - DOM 로드가 완료되면 `/api/user-info`를 통해 현재 로그인 정보를 비동기로 로드하고 화면에 반영.
  - 로그아웃 버튼 클릭 시 확인 메시지 창(`confirm`)을 띄우고 수락 시 `/logout`으로 유도.

## 3. 로컬 및 배포 도메인 대응 유연성 보장
- `localhost`와 `onnamu.kr` 양쪽 도메인 환경 모두에서 쿠키 설정 및 리다이렉트 주소가 Host 정보에 맞게 가변적으로 설정되도록 구현하여, 개발 단계 및 배포 환경에서 설정 변경 없이 원활히 동작함.
