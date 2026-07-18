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
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 포함.

### 7. 배포 확인
- 미니PC deploy.yml이 새 태그로 재빌드(약 1분). `git reset --hard origin/main` 후
  `docker build ... namu-agent.git#v<version>` → `compose up -d`.
- `curl -s -o /dev/null -w "%{http_code}" https://namu.onnamu.kr/`가 **404면 정상**
  (비밀 경로 전용, 502/타임아웃이 아니면 컨테이너 생존).
- 원격에서 이미지 스왑 100% 확증은 불가함을 명시. 확증하려면 미니PC
  `C:\Users\onmis\project\deploy.log`에서 `Successfully tagged namu-remote-mcp:v<version>` 확인 안내.
- 히트맵은 이 머신에 `gallery/.env`가 없어 deploy.yml 자동 기록에 위임(수동 기록 불필요).

## 완료 보고
"완료되었습니다" 대신 **"수정을 완료했으며 확인이 필요합니다"** 형식으로, 단계별 ✅/한계를 표로 보고한다.
