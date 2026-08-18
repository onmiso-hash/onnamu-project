# Project: onnamu-project

이 파일은 프로젝트의 아키텍처, 규칙, 그리고 중요한 기록들을 담고 있습니다. 다른 환경에서 작업을 시작할 때 이 내용을 참고하여 빠르게 컨텍스트를 파악할 수 있습니다.

## 🏗️ 시스템 아키텍처 (Architecture)

본 프로젝트는 여러 마이크로서비스 및 웹 어플리케이션으로 구성된 통합 관리 시스템입니다. 전체 서버 인프라의 공인/사설 IP 구성, 도커 컨테이너 내부 포트 맵, 외부 공유기 포트포워딩 및 HTTP/HTTPS 크로스 스킴 SSO 연동 규격 등 상세 인프라 사양은 프로젝트 루트의 [server_architecture_specs.md](file:///home/onmiso/project/onnamu-project/server_architecture_specs.md) 사양서에 실시간 관리되고 있으므로 이를 함께 교차 참조하십시오.

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
- **원격 배포 의무화**: 소스 코드를 수정하고 로컬 커밋 및 포털 히트맵 데이터 주입을 완료한 후에는, 별도의 추가 지시가 없더라도 반드시 즉시 `git push origin main`을 실행하여 원격 배포를 트리거하고, 이를 확인한 후에 최종 완료 보고를 수행해야 합니다. push가 누락된 채 성급하게 완료 보고를 올리는 행위를 엄격히 금지합니다.
- **사전 작업 승인**: 소스 코드 개발, 수정 또는 설정 변경 등의 실제 액션을 취하기 전, 반드시 사용자에게 분석 내용과 구현 계획에 대해 확인 및 승인을 받은 후 작업에 착수합니다. 독단적으로 선작업을 진행하고 사후에 통보하는 방식은 전면 금지합니다.
- **자의적 판단 배제**: AI의 자의적 판단으로 추가 로직을 구현하거나 임의의 기본값 및 편의 설정을 덧붙여 코드를 수정하는 행위를 일절 금지합니다. 필요하다고 여겨지는 수정안이나 개선안이 있더라도 절대 독단적으로 기동하지 않으며, 반드시 사전에 명확한 구현 계획을 상세히 보고하여 사용자의 승인을 득한 뒤에만 작업을 진행합니다.
- **영향도 분석 의무화**: 코드 수정, 추가, 변경을 수행하기 전, 해당 변경 사항이 연관된 다른 기능(예: 계정 전환 세션 복구, 실시간 백그라운드 자동 저장, 서버 양방향 동기화, UI 드롭다운 바인딩 등) 및 소스 코드에 미칠 영향도를 면밀히 추적하고 사전 분석해야 합니다. 자의적으로 특정 지점만 수정하여 연관 모듈에서 정보가 유출되거나 오작동하는 일이 없도록 영향도 분석 및 확인 과정을 의무적으로 수행합니다. **특히 작업을 진행하기 전에 변경 사항이 연관된 다른 기능 및 전체 소스 코드 파일들에 미칠 구체적인 영향을 분석하여 정리하는 영향도 확인 단계를 반드시 선행하여 수행해야 합니다.**
- **신중한 보고 및 검증 권유**: 직접 테스트나 런타임 검증을 완벽하게 끝마친 확정적인 사실이 아닌 경우, 단정적으로 "해결되었습니다", "완벽히 수정되었습니다"와 같은 표현의 사용을 전면 금지합니다. 대신 "수정 작업을 완료하였고 확인이 필요합니다"와 같이 사용자에게 정중히 재검증을 권유하는 방식으로 일관되게 보고를 수행합니다.
- **안드레이 카파시 AI 코딩 4원칙 (Andrej Karpathy's 4 Principles)**:
  1. **Think Before Coding (코딩 전 생각)**: 가정을 자의적으로 설정하지 않고 사전 분석 및 영향도 검토 후 사용자 확인을 거친 계획에 따라 움직집니다.
  2. **Simplicity First (단순함 우선)**: 오버 엔지니어링이나 사용자가 요청하지 않은 추가 편의 설정 등을 배제하고 요구사항 해결을 위한 최소한의 코드만을 작성합니다.
  3. **Surgical Changes (수술처럼 정밀한 변경)**: 수정이 필요한 부분을 정밀 타격하여 변경 범위를 국소화하고 주변 코드의 정렬, 주석, 미관련 스타일 등의 무분별한 훼손을 방지합니다.
  4. **Goal-Driven Execution (목표 중심 실행)**: 성공적인 완료 기준을 사전에 확정하고 변경 사항의 작동 상태를 끝까지 자체 검증한 후 보고합니다.

## 📅 주요 히스토리
- 2026-08-18: 포털 **계정 관리 화면 신설**(계정관리 2묶음) — `/admin/accounts`에서 계정 만들기·권한 변경·잠그기·비밀번호 초기화·지우기를, `/account`에서 본인 비밀번호 바꾸기를 한다. 핵심은 **계정 관리 통로만은 30일 출입증을 믿지 않고 표를 직접 본다**는 것 — 출입증의 `is_admin`은 발급 시점의 사실이라 이미 지워지거나 잠긴 관리자가 계속 관리 화면을 쓰게 된다. 같은 이유로 이 통로만 `X-API-Key` 우회를 끊었다(`login_required(allow_api_key=False)` 신설, 배포 자동화의 다른 통로는 그대로). 안전장치로 자기 자신·마지막 관리자는 잠그거나 지울 수 없고 **잠긴 관리자는 머릿수에 넣지 않는다**. 계정 지우기는 아이디 직접 입력 확인을 받고, Chronicle AI 자료 동반 삭제는 체크칸·기본 꺼짐이며(사용자 확정) 스튜디오에 `DELETE /api/admin/user-data/:username`을 새로 내 포털이 스스로 만든 관리자 출입증으로 부른다. 갤러리 파일은 올린 사람 기록이 없어 남으며 그 사실을 지우는 창에 적었다. 검사 88건 통과(포털 47·스튜디오 14·1묶음 재실행 27) + 배포 후 실물 20건. 상세는 `history/TASK_20260818.md` 참조.
- 2026-08-18: 포털 **계정을 파일에서 저장소로 옮기고 비밀번호를 해시로 잠갔다**(계정관리 1묶음) — 계정 2개가 `portal/users.json`에 평문으로 있었고 이 저장소는 공개다. 포털이 이미 쓰는 `portal_news_data` 볼륨 안 SQLite에 `accounts` 표를 신설하고(`adult_ok`·`can_upload`·`locked`·`perm_version` 신설), 첫 기동 때 파일을 1회 읽어 그 자리에서 해시해 옮긴 뒤 로그인이 표를 보게 했다. `users.json`이 읽기 전용 마운트라 원본에 이관 표시를 쓸 수 없어 **"표가 비어 있는가"를 이관 판정**으로 삼았다. 해시는 Flask에 딸려오는 werkzeug 표준 방식이라 새 의존성 0개(컨테이너 안에서 실행해 확인). 로컬 검사 27건 통과, 배포 후 미니PC 실계정 2개가 **쓰던 비밀번호 그대로 로그인**되는 것을 해시 대조와 실제 HTTP 로그인으로 확인. 설계는 `history/DESIGN_ACCOUNTS_20260818.md`, 상세는 `history/TASK_20260818.md` 참조.
- 2026-08-18: Chronicle AI Studio **수위(`chatLevel`)의 주인을 대화로 확정** — "설정에서 수위를 바꿔도 대화에 들어가면 되돌아간다"는 신고의 원인은 같은 값이 세 곳(인물 설정 `level`·대화 `meta.chatLevel`·브라우저 옛 세션 `savedSession.chatLevel`)에 살며 서로를 덮은 것이었다. 대화를 열 때 인물 수위를 얹은 **직후** `conv.chatLevel`이 덮어써 설정 변경이 항상 무시됐고, 설정창 표시값마저 옛 세션에서 끌어오고 있었다. 역할을 갈랐다 — 인물 설정 = **기본값**(새 대화에만 물려줌), 대화 = **실제 수위**. 사이드바에 '이 대화 수위' 항목을 신설해 그 대화에만 저장(`PATCH chatLevel`)하고, 새 대화는 기본값을 물려받으며, 설정창은 기본값만 보여준다. 미니PC 실측에서 **같은 인물의 대화끼리 수위가 이미 갈려 있음**(박민정 대화 2개)을 확인해 "인물 값으로 통일" 안을 배제했다. 검사 27건(화면 22·저장 5) 실행 통과. 상세 내용은 `history/TASK_20260818.md` 참조.
- 2026-08-17: Chronicle AI Studio **대화 목록 정리 4종** — 목록을 인물별로 묶고(인물 이름을 머리글로 한 번만, 줄마다 말 개수+날짜), 사용자가 건넨 **첫 마디로 제목을 자동 생성**하고, **제목 바꾸기(연필)·지우기(휴지통)** 버튼을 붙였다. 같은 이름이 목록에 반복되던 문제와 정리할 방법이 없던 문제를 함께 해소. 구현 중 **대화의 주인을 `title`로 판정하던 결함**이 드러났다(제목이 자유로운 글이 되자 대화가 주인을 잃고 접속마다 새 대화가 생성됨) — `meta.json`에 `charName`을 따로 남기도록 수정. 검사 164건 통과(목록정리 24건 신설), 미니PC 실데이터로 8묶음·13대화 확인. 상세 내용은 `history/TASK_20260817.md` 참조.
- 2026-08-17: Chronicle AI Studio 저장 구조를 **기록장(JSONL append-only) 방식**으로 전면 교체 — 대화 1개 = 폴더 1개(`turns.jsonl`·`vectors.jsonl`·`meta.json`). 종전에는 화면이 전체 스냅샷을 보내고 서버가 무엇이 새것인지 되짚었으며, 메시지 1건마다 3.2MB를 통째로 다시 썼다(실측). 한 턴 쓰기량 **3.2MB → 1,276바이트**. 한 인물로 여러 대화, 소설 모드 서버 저장(종전 유실), 되돌리기·취소 되돌리기, 옛 데이터 1회 이사(`import`, 중복은 409)를 함께 도입. 아울러 **RAG가 2026-01-14부터 죽어 있던 것**을 발견·복구(구글이 `text-embedding-004`를 폐기 → 404가 `console.warn`으로 삼켜짐). 모델을 `gemini-embedding-001`(768차원)로 교체하고 실패를 화면에 표시. 상세 내용은 `history/TASK_20260817.md` 참조.
- 2026-08-16: 배포 명령을 `scripts/deploy.ps1`로 분리 — `deploy.yml`의 한 줄이 8,684자가 되어 미니PC 윈도우 명령줄 한계(실측 약 8,190자)를 넘겨 **배포 8회 연속 실패**했다. 워크플로에는 206자짜리 호출만 남기고, 4,000자를 넘으면 push를 막는 `scripts/check_deploy_cmd_len.sh`를 추가. 핀 검사 두 개도 새 파일을 읽도록 수정(그전까지 "건너뜀"으로 조용히 통과하던 상태). 상세 내용은 `history/TASK_20260816.md` 참조.
- 2026-08-16: 영화관 2단계 — 영상 직행 통로(`stream/`) 신설. stream.onnamu.kr:50443에서 nginx가 서명된 주소로만 영상 바이트를 직접 전송(Cloudflare 우회), 인증서는 certbot DNS-01 자동 갱신. 설정이 없으면 종전 `/media` 경로로 자동 폴백. 상세 내용은 `history/TASK_20260816.md` 참조.
- 2026-08-16: 영화관 썸네일이 2026-07-09부터 한 장도 생성되지 않던 문제 수정 — ffmpeg 출력 확장자가 `.tmp`라 muxer를 정하지 못해 항상 실패. 상세 내용은 `history/TASK_20260816.md` 참조.
- 2026-08-16: 영화관 첫 화면 성능 개선 1단계 — 목록 생성 O(N²) 자막 탐색 제거(디렉터리 1회 스캔), `/movies` 페이지네이션(24개/쪽), 썸네일 캐시 named volume 영속화, ffmpeg 동시 2개 제한, 미사용 `/stream` 라우트 제거. 상세 내용은 `history/TASK_20260816.md` 참조.
- 2026-07-17: NAMU 원격 MCP 서버(`namu/`) 신규 서비스 배포 — GitHub 참조 빌드(namu-agent v0.1.25), namu.onnamu.kr→8765 라우팅, deploy.yml 자동 배포 편입. 상세 내용은 `history/TASK_20260717.md` 참조.
- 2026-07-09: 영화관 썸네일 ffmpeg 전환(06-21) 버그 리뷰 — 3건 수정 (빈 img src, ffmpeg 캐시 원자적 쓰기, 썸네일 에러 응답 30일 캐싱 제외). 상세 내용은 `history/TASK_20260709.md` 참조.
- 2026-06-21: 영화관 썸네일 ffmpeg JPG 정적 캐싱 전환, 히트맵 API 방식 수정, GitHub Actions SSH 키 인증 전환 및 타임아웃 연장. 상세 내용은 `history/TASK_20260621.md` 참조.
- 2026-06-19: 안드레이 카파시 AI 코딩 4원칙을 작업 규칙(Conventions)에 공식 반영 및 통합. 상세 내용은 `history/KARPATHY_PRINCIPLES_GEMINI_20260619.md` 참조.
- 2026-06-14: 미디어 갤러리 대용량 청크 분할 업로드 및 영화관(movies) 경로 도커 볼륨 rw 권한, 캐시 오폭 오류 패치. 상세 내용은 `history/MEDIA_UPLOAD_CHUNK_20260614.md` 참조.
- 2026-06-08: Chronicle AI Studio 어드민 전용 접근 제한 및 포털 연동 강화. 상세 내용은 `history/STUDIO_ADMIN_LIMIT_20260608.md` 참조.
- 2026-06-08: 일반 계정(family 등) 로그인 시 19금 세션 및 프리셋 접근 원천 차단 필터 강화. 상세 내용은 `history/STUDIO_ADULT_PREVENT_20260608.md` 참조.
- 2026-06-05: 배포 프로세스 최적화 (이력 내 무거운 디버그 로그 제거 및 커밋 정보만 영구 보존).
- 2026-06-05: 통합 로그인 포털 users.json 마운트 경로 수정 및 배포 안정화. 상세 내용은 `history/LOGIN_MOUNT_FIX_20260605.md` 참조.
- 2026-06-05: Chronicle AI Studio 설정창 내 GEMINI API KEY 확인용 눈 모양 아이콘 추가. 상세 내용은 `history/STUDIO_API_KEY_TOGGLE_20260605.md` 참조.
- 2026-06-05: Chronicle AI Studio 무부하 이벤트 기반 기기 간 동기화 및 500ms 전송 디바운스 적용. 상세 내용은 `history/STUDIO_CHARACTER_IMAGES_20260604.md` 참조.
- 2026-06-04: Chronicle AI Studio 새로고침 시 설정 이탈 현상 제어 및 모바일 프로필 아바타 2배(144px) 확대. 상세 내용은 `history/STUDIO_CHARACTER_IMAGES_20260604.md` 참조.
- 2026-06-04: Chronicle AI Studio 대화창 UI gemini.google.com 스타일 단일 피드, 좌측 사이드바 및 3단 고정 HUD로 대대적 개편. 상세 내용은 `history/STUDIO_UI_REDESIGN_20260604.md` 참조.
- 2026-06-04: Chronicle AI Studio 페르소나 및 RAG 세션 데이터 서버 동기화 API 구축 (기기 간 이동 시 데이터 유실 방지, 오프라인 폴백 오류 패치, 구조화된 출력(Structured Outputs) 도입). 상세 내용은 `history/STUDIO_PERSONA_SYNC_20260604.md` 참조.
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
- **서버 사양서 최신화**: 네트워크 포트 맵, 마운트 볼륨 권한 격리 등 서버 인프라 스펙에 물리적 변화가 생기는 수정을 가할 때는 반드시 프로젝트 루트의 [server_architecture_specs.md](file:///home/onmiso/project/onnamu-project/server_architecture_specs.md) 사양서 정보도 함께 최신화해 두어야 합니다.
- **기억 참조**: 과거 작업의 구체적인 맥락이 필요할 때 `history/` 폴더의 문서를 우선적으로 참조함.

