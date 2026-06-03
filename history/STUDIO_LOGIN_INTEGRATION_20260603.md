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

## 4. 추가 개선 조치 (2026-06-03 21:47)
- **통합 로그인 페이지 브랜딩 개편 (`gallery/templates/login.html`)**:
  - 기존 'Media Home'으로 표기되던 통합 로그인 페이지의 타이틀 및 브랜드명을 'onnamu'로 일괄 수정하고, 설명 문구를 '통합 서비스 로그인'으로 수정하여 Chronicle Studio 등 타 서비스에서 리다이렉트되었을 때 이질감이 느껴지지 않도록 통합 브랜드 아이덴티티를 확립함.
- **초기 환영 메시지 깜빡임 해결 (`studio/index.html` & `studio/app.js`)**:
  - Chronicle AI Studio 접속 시 유저 정보를 백엔드에서 fetch 해오기 전에 프로필 영역에 '...님 환영합니다'로 표시되던 UI 문제를 해결하기 위해, 초기에는 프로필 바(`user-profile-bar`)의 CSS display 속성을 `none`으로 차단하고, JS에서 유저 데이터 수신 완료 후 정상 바인딩되었을 때에만 `flex`로 노출되도록 개선함.
- **일반 계정 로그인 시 19금 세션 복구 및 로딩 원천 차단 (`studio/app.js`)**:
  - 기존에 19금 가상 인물(예: 한지수, 릴리스) 및 19금 수위 상태로 대화했던 세션이 브라우저 로컬 스토리지(`localStorage`의 `recent_*` 키)에 보존된 채로 일반 계정(`family` 등)으로 로그인했을 때, 해당 19금 캐릭터가 초기 화면에 로드되는 취약점을 해결했습니다. 
  - 유저 세션 정보를 받아온 즉시 일반 계정일 경우, 복구 대상 수위가 `adult-19`이거나, 캐릭터 정보가 19금 캐릭터(한지수, 릴리스 등)로 확인되면 세션을 안전한 전체이용가 기본 캐릭터(예: '혜린', '서아')로 강제 전환 및 재설정하도록 보안 필터를 적용했습니다. 만약 일반 프리셋이 로컬 스토리지에 없는 경우에는 입력 필드들을 안전하게 공백으로 비워둡니다.
  - 이 보안 필터링은 가상 인물 대화 모드(chat)뿐만 아니라 소설 창작 모드(story)의 캐릭터 인풋 필드(`inputCharacter`)에도 일관되게 적용하여 19금 우회 노출을 원천적으로 차단했습니다.
- **일반 계정(family) 로그인 시 주인공 이름(알렉스) 강제 제거 조치 (`studio/app.js`)**:
  - `family` 등의 일반 계정으로 접속했을 때, 대화 중 나를 부를 유저 이름 필드(`input-chat-user-name`)에 기본 디폴트 값인 '알렉스'가 로드되는 현상을 해결했습니다.
  - 백엔드로부터 `isAdmin=false` 유저 정보가 수신되는 즉시 유저 이름 인풋 필드를 빈 값으로 초기화하고, 내부 주인공 이름 상태 변수(`characterName`)와 메인 화면 HUD에 노출되는 주인공 이름 정보 텍스트(`hud-character`)도 공백 처리하여 노출을 원천 배제하였습니다.

