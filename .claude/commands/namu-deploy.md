---
description: namu-agent 업데이트를 원격 MCP(namu.onnamu.kr)에 반영·배포 — 태그 참조 빌드 승격 절차
argument-hint: "[버전 예:0.1.26 | 비우면 namu-agent manifest에서 자동 감지]"
---

# /namu-deploy — NAMU 원격 MCP 업데이트 반영·배포

namu-agent의 새 기능을 원격 MCP 서비스에 반영한다. 배포는 **태그 참조 빌드**이므로
namu-agent에 새 태그를 만들고, onnamu-project의 고정 참조를 그 태그로 올려야 한다.
(참고 메모리: `project_namu_remote_mcp_service`)

경로 전제:
- namu-agent 로컬 클론: `~/project/namu-agent`
- onnamu-project(이 repo): `~/project/onnamu-project`
- 배포 서버(미니PC)는 로컬 클론 없이 Docker가 `github.com/onmiso-hash/namu-agent.git#<tag>`를 build-time fetch한다.

## 원칙
- **각 push(태그 push, onnamu-project push) 직전에 사용자 확인**을 받는다 — 되돌리기 번거로운 외부 반영이다.
- 어느 단계든 예상과 다르면(동기화 어긋남·테스트 실패·이미 태그 존재 등) **중단하고 보고**한다.
- 커밋 메시지는 반드시 **한글**. 커밋 후 `git push origin main`.

## 절차

### 1. 목표 버전 확정
- 인자 `$ARGUMENTS`가 있으면 그 값을 목표 버전으로 쓴다(형식 `X.Y.Z`).
- 없으면 `~/project/namu-agent/namu-plugin/plugin.json`의 `version`을 목표 버전으로 읽는다.
- 두 manifest 버전 일치 확인: `namu-plugin/plugin.json`과 `namu-plugin/.claude-plugin/plugin.json`.
  어긋나면 `scripts/namu_bump.py <version>`으로 맞춰야 한다고 보고하고 중단.

### 2. namu-agent 동기화 검사
- `cd ~/project/namu-agent && git fetch origin` 후 `git rev-list --left-right --count HEAD...origin/main`.
- `0	0`이 아니면(로컬이 앞서거나 뒤처짐) 상황을 보고하고 중단(맘대로 pull/reset 하지 말 것).
- `git status --short`가 비어있지 않으면(미커밋 변경) 보고하고 중단.

### 3. 테스트 (기본 포함)
- `cd ~/project/namu-agent && NAMU_HOME="$HOME/.namu" uv run --with python-dotenv python3 -m pytest namu-plugin/ -q`
- 실패 시 중단·보고. (사용자가 명시적으로 생략 요청 시에만 건너뜀.)

### 4. 태그 생성·push
- `git tag -l v<version>`로 이미 있는지 확인.
  - 있으면: 이미 태그됨을 알리고, 그 태그가 HEAD를 가리키는지 확인(`git rev-list -n1 v<version>` vs HEAD). 다르면 경고.
  - 없으면: **사용자 확인 후** `git tag -a v<version> -m "release: <요약>" HEAD` → `git push origin v<version>`.
    (pre-push 훅이 두 manifest 버전 일치를 검증한다. `OK: manifest versions match`가 정상.)

### 5. onnamu-project 참조 상향
현재 참조 중인 옛 버전을 찾아 `<version>`으로 치환한다(하드코딩 금지, 실제 파일에서 옛 값 검출):
- `~/project/onnamu-project/namu/docker-compose.yml`: `image: namu-remote-mcp:<옛>` → `<version>` (1곳)
- `~/project/onnamu-project/.github/workflows/deploy.yml`: NAMU build 라인의
  `-t namu-remote-mcp:<옛>` 및 `namu-agent.git#<옛>` → `<version>` (2곳, 같은 줄)
- 치환 후 검증: 두 파일에 옛 버전 0곳, 새 버전 docker-compose 1곳·deploy.yml 2곳.

### 6. 커밋·push (재배포 트리거)
- **사용자 확인 후**:
  ```
  cd ~/project/onnamu-project
  git add namu/docker-compose.yml .github/workflows/deploy.yml
  git commit -m "NAMU 원격 MCP v<version> 승격 (namu-agent <기능요약> 반영)"
  git push origin main
  ```
- 커밋 메시지 끝에 `Co-Authored-By: Claude <현재 모델명> <noreply@anthropic.com>` 포함.
  모델명은 **지금 실행 중인 자기 모델**을 쓴다(예: `Claude Opus 5`). 특정 버전을 적어두면
  모델이 바뀔 때마다 문서가 어긋나므로 고정하지 않는다.

### 7. 배포 확인
- 미니PC deploy.yml이 새 태그로 재빌드(약 1분). `git reset --hard origin/main` 후
  `docker build ... namu-agent.git#v<version>` → `compose up -d`.
- `curl -s -o /dev/null -w "%{http_code}" https://namu.onnamu.kr/`가 **404면 정상**
  (비밀 경로 전용 = 컨테이너 생존).
  - **502를 한 번 봤다고 실패로 단정하지 말 것.** `compose up -d`가 컨테이너를 교체하는
    동안에는 502가 정상적으로 나온다(502는 "죽었다"가 아니라 "프록시가 지금 백엔드에
    못 붙었다"). 실측 두 건 — 2026-07-25 v0.1.35: push 100초 후 502 → 재확인 시 404 404 404.
    2026-07-25 v0.1.36: push 90초·120초 후 **2연속 502** → 150초 후 404. 즉 60초 간격
    2연속 502도 아직 정상 범위다. 502·타임아웃이 나오면 **30초 간격으로 3회 재확인**해
    값이 안정됐는지 보고 나서 판정한다.
  - 502가 계속되면 **대조군을 같이 재서 범위를 가른다.** 단 대조군은 **이 배포가 건드리지
    않거나 훨씬 먼저 교체가 끝나는 서비스**여야 한다. deploy.yml의 교체 순서는
    갤러리 → 포털 → 게임 → RDAP → **NAMU → NAMU 클라우드** → 스튜디오이므로:
    - ✅ `https://onnamu.kr/`(포털, 200 기대) — 앞쪽에서 이미 교체가 끝나 유효한 대조군.
    - ❌ `https://namu-cloud.onnamu.kr/` — NAMU 바로 다음에 교체돼 **같은 창에서 함께 502**가
      된다(2026-07-25 v0.1.36 실측: namu 502·cloud 502 → 동시에 404·404). 둘 다 502인 것은
      아무것도 구분해주지 않으므로 판단 근거로 쓰지 말 것.
    포털이 200인데 NAMU만 502면 이 서비스의 교체 창이고, 포털까지 502면 터널·미니PC
    전체 문제다.
- **배포 로그를 원격에서 보는 진짜 주소는 `https://onnamu.kr/api/debug/deploy-log`다**(portal/app.py의
  `get_deploy_log` — 컨테이너에 읽기 전용으로 붙은 `C:\`에서 `deploy.log`를 그대로 뿌린다).
  - **`https://onnamu.kr/images/deploy.log`는 존재한 적 없는 주소다.** 2026-07-27·07-31 두 번에 걸쳐
    이 주소가 404인 것을 "증거 채널 고장"으로 오진했으나, 실제로는 그런 라우트가 만들어진 적이 없다.
    `C:\Users\onmis\media\public\images`는 **갤러리** 컨테이너에만 붙어 있고 갤러리의 미디어 라우트는
    로그인 필수라, 이 경로로는 애초에 공개 URL이 나오지 않는다.
  - **관리자 로그인이 필요하다**(`@login_required(admin_only=True)`). 따라서 **브라우저로만 확인 가능**하며,
    로그인 세션이 없는 곳에서 `curl`로 부르면 302(로그인 화면)가 돌아온다 — 이걸 실패로 읽지 말 것.
    hp에는 `gallery/.env`가 없어 토큰을 만들 수 없으므로 **사용자에게 브라우저로 열어달라고 요청**한다.
- 원격에서 이미지 스왑 100% 확증은 불가함을 명시. 확증은 미니PC에서만 가능하므로
  **사용자에게 미니PC(Chrome Remote Desktop)에 접속 중인지 먼저 묻고**, 접속했다면 아래 두 줄을
  복붙하도록 안내한다:
  ```powershell
  Get-Content C:\Users\onmis\project\deploy.log -Encoding UTF8 | Select-String "namu-remote-mcp:v0.1"
  docker inspect -f '{{.Config.Image}}' namu-remote-mcp
  ```
  - **`Successfully tagged`를 찾지 말 것.** deploy.yml은 NAMU 빌드 전에 `DOCKER_BUILDKIT=0`을
    설정하지 않으므로(그 설정은 Studio 직전에만 있음) BuildKit이 쓰이고, 로그에는
    `#NN naming to docker.io/library/namu-remote-mcp:v<version> ... done`으로 찍힌다
    (2026-07-25 v0.1.34 실측). 태그 문자열로 검색해야 두 빌더 모두 잡힌다.
  - **결정적 증거는 `docker inspect`의 실행 중 이미지**다. 로그는 "빌드했다"까지만 말하고
    컨테이너가 실제로 새 이미지로 교체됐는지는 말해주지 않는다.
- 히트맵은 이 머신에 `gallery/.env`가 없어 deploy.yml 자동 기록에 위임(수동 기록 불필요).

## 완료 보고
"완료되었습니다" 대신 **"수정을 완료했으며 확인이 필요합니다"** 형식으로, 단계별 ✅/한계를 표로 보고한다.
