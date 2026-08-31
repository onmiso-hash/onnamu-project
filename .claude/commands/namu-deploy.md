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

## 자동 검사 — 낡은 핀은 push가 막는다

`.githooks/pre-push`가 두 검사를 돌린다(설치는 클론마다 한 번: `git config core.hooksPath .githooks`).

| 검사기 | 무엇을 보나 | 언제 도나 |
|---|---|---|
| `scripts/check_core_pin.sh` | 개인용 서버 핀 3자리 vs namu-agent 최신 태그 | **이 저장소의 모든 push** |
| `scripts/check_cloud_core_pin.sh` | 클라우드가 품은 코어 vs 최신/개인용 | 클라우드 관련 파일을 건드린 push |

- **왜 개인용은 모든 push에서 보나**: 이 저장소는 무엇을 올리든 미니PC가 전 서비스를
  재빌드한다. 포털만 고쳐 올려도 개인용 서버는 그 순간 낡은 핀으로 다시 세워진다.
  막혀도 푸는 값이 싸다 — 어차피 push 중이니 핀 3자리만 같이 실으면 된다.
- **왜 생겼나**: 2026-08-02, 개인용 서버가 v0.1.43에 머문 채 나흘이 지났다(본체는
  v0.1.44·45·47을 냈다). 그 사이 이 저장소에 **push가 8번** 있었으므로 볼 기회는
  8번 있었는데 아무도 안 봤다. 발견은 사용자의 육안 질문이었다. 플러그인(브랜치 소스)과
  클라우드(자동 검사)는 멀쩡했고 **개인용 서버만 방벽이 없었다.**
- 핀 3자리가 **서로 다르면** 어느 것이 세워질지 알 수 없으므로 그것도 막는다.
- 오프라인·클론 없음이면 조용히 통과한다. 비상구는 `git push --no-verify`.

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

> **번호가 박힌 곳은 `scripts/deploy.ps1`이지 `.github/workflows/deploy.yml`이 아니다.**
> 2026-08-16에 배포 명령을 파일로 분리했다 — 명령이 윈도우 명령줄 한계(8,191자)를 넘어
> 배포가 8회 연속 실패했기 때문이다. 지금 `deploy.yml`은 SSH로 들어와 `deploy.ps1`을
> 부르기만 하고 버전 문자열이 하나도 없다. 검사기(`scripts/check_core_pin.sh`)도
> `deploy.ps1`을 본다.

현재 참조 중인 옛 버전을 찾아 `<version>`으로 치환한다(하드코딩 금지, 실제 파일에서 옛 값 검출):
- `~/project/onnamu-project/namu/docker-compose.yml`: `image: namu-remote-mcp:<옛>` → `<version>` (1곳)
- `~/project/onnamu-project/scripts/deploy.ps1`: `--- Deploy NAMU ---` 줄의
  `-t namu-remote-mcp:<옛>` 및 `namu-agent.git#<옛>` → `<version>` (2곳, 같은 줄)
- 치환 후 검증: 두 파일에 옛 버전 0곳, 새 버전 docker-compose 1곳·deploy.ps1 2곳.
  (`scripts/check_core_pin.sh`를 손으로 돌려 세 자리가 같은지 확인하면 더 확실하다.)

### 6. 커밋·push (재배포 트리거)
- **사용자 확인 후**:
  ```
  cd ~/project/onnamu-project
  git add namu/docker-compose.yml scripts/deploy.ps1
  git commit -m "NAMU 원격 MCP v<version> 승격 (namu-agent <기능요약> 반영)"
  git push origin main
  ```
- 커밋 메시지 끝에 `Co-Authored-By: Claude <현재 모델명> <noreply@anthropic.com>` 포함.
  모델명은 **지금 실행 중인 자기 모델**을 쓴다(예: `Claude Opus 5`). 특정 버전을 적어두면
  모델이 바뀔 때마다 문서가 어긋나므로 고정하지 않는다.

### 7. 배포 확인
- 깃허브 Actions가 SSH로 미니PC에 들어가 `scripts/deploy.ps1`을 돌린다(약 1분).
  `git reset --hard origin/main` 후 `docker build ... namu-agent.git#v<version>` → `compose up -d`.
- `curl -s -o /dev/null -w "%{http_code}" https://namu.onnamu.kr/`가 **404면 정상**
  (비밀 경로 전용 = 컨테이너 생존).
  - **502를 한 번 봤다고 실패로 단정하지 말 것.** `compose up -d`가 컨테이너를 교체하는
    동안에는 502가 정상적으로 나온다(502는 "죽었다"가 아니라 "프록시가 지금 백엔드에
    못 붙었다"). 실측 두 건 — 2026-07-25 v0.1.35: push 100초 후 502 → 재확인 시 404 404 404.
    2026-07-25 v0.1.36: push 90초·120초 후 **2연속 502** → 150초 후 404. 즉 60초 간격
    2연속 502도 아직 정상 범위다. 502·타임아웃이 나오면 **30초 간격으로 3회 재확인**해
    값이 안정됐는지 보고 나서 판정한다.
  - 502가 계속되면 **대조군을 같이 재서 범위를 가른다.** 단 대조군은 **이 배포가 건드리지
    않거나 훨씬 먼저 교체가 끝나는 서비스**여야 한다. `scripts/deploy.ps1`의 교체 순서는
    갤러리 → 포털 → 게임 → RDAP → **NAMU → NAMU 클라우드** → 스튜디오 → 스트림이므로:
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
  - **`Successfully tagged`를 찾지 말 것.** `deploy.ps1`은 NAMU 빌드 전에 `DOCKER_BUILDKIT=0`을
    설정하지 않으므로(그 설정은 Studio 직전에만 있음) BuildKit이 쓰이고, 로그에는
    `#NN naming to docker.io/library/namu-remote-mcp:v<version> ... done`으로 찍힌다
    (2026-07-25 v0.1.34 실측). 태그 문자열로 검색해야 두 빌더 모두 잡힌다.
  - **결정적 증거는 `docker inspect`의 실행 중 이미지**다. 로그는 "빌드했다"까지만 말하고
    컨테이너가 실제로 새 이미지로 교체됐는지는 말해주지 않는다.
- 히트맵은 이 머신에 `gallery/.env`가 없어 `deploy.ps1` 자동 기록에 위임(수동 기록 불필요).

---

## 부록 — 클라우드 라우팅(namu-cloud.onnamu.kr) 배포

위 절차는 **개인용** 원격 MCP(namu.onnamu.kr) 것이다. 공용 클라우드는 다른 저장소
(`onmiso-hash/namu-cloud-routing`)이고 배포 방식도 다르다 — 그쪽은 **서브모듈을 품은
로컬 빌드**라 `#tag` 참조 빌드가 안 된다.

### C0. 무엇을 올려야 하는지 먼저 가른다

바뀐 자리에 따라 필요한 일이 다르다. 셋을 다 올려야 하는 배포도 있고 한 곳만 올리면
되는 배포도 있다 — **범위를 좁히는 것과 원래 그 범위인 것은 다르므로** 이 표로 가른다.

| 바뀐 것 | 본체 꼬리표 | 클라우드 꼬리표 | 배포 저장소 |
|---|---|---|---|
| 코어 코드(`namu-plugin/`) | 필요 | 코어를 품으므로 함께 | 3자리 + 4자리 |
| 클라우드 코드(`src/`) | 불필요 | 필요 | 4자리 |
| 안내서(`docs/*.html`·README) | **불필요** | 불필요 | 불필요 |

- **안내서는 꼬리표와 무관하다.** GitHub Pages가 `main` 브랜치를 그대로 게시하므로
  push만으로 반영된다(2026-08-08 실측 — 살아 있는 페이지를 받아 보니 직전 커밋의
  문구가 이미 떠 있었다. `gh`가 없어 저장소 설정 대신 이 방법으로 판정했다).
- 코어 코드가 안 바뀌었는데도 판올림하면 **연쇄만 생긴다** — 새 꼬리표가 생기는 순간
  개인용 핀 3자리와 클라우드가 품은 코어까지 그 번호로 올려야 검사를 통과한다.
  이미지 내용은 그대로이므로 얻는 것이 없다.
- 헷갈리면 `git status`로 **바뀐 파일이 어느 칸에 드는지**부터 본다. 커밋 이력에서
  관례를 역추적하지 말 것(그 방식으로 지난 사고들이 났다).

### C1. 착수 전 — 안쪽 엔진 검사 (가장 중요)
클라우드는 기억 엔진(`vendor/namu-agent`)을 **통째로 품고** 배포된다. 바깥 버전을
올려도 안쪽은 따라오지 않는다. 2026-07-31에 이걸 놓쳐 v0.1.13이 2주 묵은 코어
(v0.1.29)를 실은 채 라이브로 나갔고, 클라우드로 저장한 기억에 3층 칸이 생기지 않았다.

```bash
./scripts/check_cloud_core_pin.sh
```
- 이 검사는 **push 직전 자동으로도 돈다**(`.githooks/pre-push`). 설치는 클론마다 한 번:
  `git config core.hooksPath .githooks`
- 판정은 두 갈래다(2026-08-01 보강):
  - **클라우드 번호를 올리는 푸시** — 품은 코어가 namu-agent의 **가장 최신 꼬리표**여야 한다.
    낮으면 **push 차단**.
  - **클라우드 번호를 안 건드리는 푸시** — 옛 판정(클라우드 코어 >= 개인용 서버 코어)만 본다.
- **왜 바꿨나**: 잣대가 '개인용 서버가 지금 쓰는 번호'뿐이면, 개인용이 뒤처져 있을 때
  클라우드도 함께 뒤처진 채 "통과"가 나온다. 2026-08-01 실측 — 개인용 v0.1.43 /
  클라우드 v0.1.16이 품은 엔진 v0.1.45 / 본체 실제 최신 0.1.47 → 옛 검사는 통과였다.
  새 판을 올리는 순간이 최신을 요구할 유일한 시점이다.
- **개인용 서버(namu.onnamu.kr)를 먼저 올리면 클라우드가 막힌다** — 이때는 클라우드
  쪽 vendor 갱신이 먼저다. 검사가 옳게 막는 것이니 `--no-verify`로 뚫지 말 것.
- 오프라인·클론 없음이면 조용히 통과한다(검사기 사정으로 사용자를 막지 않는다).
- **주의**: `git tag --contains <커밋>`은 그 커밋을 품은 꼬리표를 **전부** 준다. 옛 커밋도
  최신 꼬리표에 들어 있으므로 **맨 앞(sort -V | head -1)**을 골라야 한다. 맨 뒤를 고르면
  검사가 통째로 무력해진다(2026-07-31 실측으로 발견).

### C2. 클라우드 저장소 판올림·꼬리표 (`namu-cloud-routing`)

**클라우드에는 버전 파일이 없다.** `pyproject.toml`의 `version = "0.1.0"`은 쓰이지 않는
값이고 코드 어디에도 자기 버전을 적어 두지 않는다(2026-08-08 확인). 즉 **버전은 git
꼬리표 그 자체**이고, 판올림이란 곧 꼬리표를 다는 일이다. 본체처럼 `namu_bump.py`로
고칠 파일이 없으니 찾지 말 것.

1. **품은 코어 올리기** — 코어를 새로 냈을 때만 한다. 안 냈으면 건너뛴다.
   ```bash
   cd ~/project/namu-cloud-routing
   git -C vendor/namu-agent fetch --tags
   git -C vendor/namu-agent checkout v<코어버전>
   git add vendor/namu-agent
   ```
2. **커밋** — 메시지는 한글.
3. **`git push origin main`** — 사용자 확인 후.
4. **꼬리표** — 메시지 꼴을 지난 판들과 맞춘다. `<종류>: <우리말 요약> + 코어 핀 v<코어버전>`
   ```bash
   git tag -a v<클라우드버전> -m "fix: <요약> + 코어 핀 v<코어버전>"
   git push origin v<클라우드버전>
   ```
   실제 예(v0.1.37) — `fix: 홈페이지가 되는 일을 안 된다고 말하던 것을 고친다 + 코어 핀 v0.1.63`
5. **이 저장소에는 push 훅이 없다**(2026-08-08 확인 — `.githooks` 없음, `core.hooksPath`
   미설정). 낡은 핀을 막아 주는 자동 검사는 **배포 저장소 쪽에서만** 돈다. 그러니
   C1의 `check_cloud_core_pin.sh`를 **손으로 먼저 돌리고** 넘어올 것.

### C3. 번호 치환 — 네 자리
`grep -rn "v0\.1\.[0-9]"`로 찾는다. onnamu-project엔 서브모듈이 없으므로
`git submodule` 명령으로 찾지 말 것.
1. `scripts/deploy.ps1` — `clone --recurse-submodules --branch v<X>`
2. `scripts/deploy.ps1` — `-t namu-cloud-routing:v<X>` (같은 줄)
   (5단계 머리말 참조 — 번호는 `deploy.yml`이 아니라 이 파일에 박힌다)
3. `namu-cloud/docker-compose.yml` — `image: namu-cloud-routing:v<X>`
4. `server_architecture_specs.md` 사양표

치환 후 **옛 번호 잔존 0건**을 다시 센다. 단, `server_architecture_specs.md`에는
`"v0.1.11부터 접속 주소가 …"` 같은 **연혁 서술**이 섞여 있으니 전역 치환 금지 —
남은 건수가 의도적으로 남긴 것인지 확인한다.

### C4. 배포 확인 — 화면이 아니라 저장된 파일로
- 대문(`/`)은 **200이고 공개 화면이 뜬다.** 사용자에게 도메인을 그대로 줘도 되고,
  가입 입구는 그 화면의 [시작하기]다(직통 주소는 `/auth/github/login`).
  - 여기 예전에 **"원래 없는 주소라 404가 정상"**이라고 적혀 있었다. v0.1.20에서 공개
    화면 5장이 생기면서 틀린 말이 되었는데 이 줄이 따라오지 않았다(2026-09-01 실측 200).
    **404를 기대하고 재면 멀쩡한 배포를 실패로 읽는다** — 반대 방향의 오진이라 특히 위험하다.
- 내 페이지(`/auth/me`)는 로그인 필수(401)라 그 주소로는 버전을 가릴 수 없다.
  - **새 버전에만 있는 공개 경로가 생긴 배포라면 그것이 가장 확실한 판정 기준이다** —
    로그인 없이 curl 한 번으로 밖에서 갈린다. 실측 예(2026-09-01, v0.1.65): 영어 화면
    `/en`이 교체 전 404 → 교체 후 200. 옛 판과 새 판이 **다른 값을 내는** 주소라야
    증거가 되므로, 양쪽 모두 200인 주소를 골라 재지 말 것.
  - 그런 경로가 없는 배포에서는 새 버전에만 있는 동작을 사용자가 브라우저로 확인한다.
- **이미지 교체는 미니PC에 SSH로 들어가 직접 확증한다** — 원격에서 못 한다고 적힌 것은
  개인용 절차(7단계)의 옛 서술이고, 지금은 hp에서 열쇠로 바로 들어간다.
  ```bash
  ssh minipc "docker inspect -f '{{.Config.Image}}' namu-cloud-routing"
  ```
  로그는 "빌드했다"까지만 말하므로, **실행 중인 컨테이너의 이미지**를 봐야 교체가
  끝난 것이 증명된다. 위 curl 판정과 이 값이 **같은 시각에 함께 넘어가는지**를 보면
  둘이 서로를 뒷받침한다(2026-09-01 실측 — 02:17에 v0.1.64→v0.1.65와 `/en` 404→200이
  같이 넘어갔다). 교체까지 걸린 시간은 push로부터 약 3분이었다.
- 기억 저장 기능을 고쳤다면 **사용자 저장소(`onmiso-hash/namu-memory`)를 직접 열어
  저장된 항목의 칸 구성을 본다.** 화면이나 AI의 자기보고를 증거로 삼지 말 것 —
  "도착했는가"와 "올바른 모양인가"는 다른 질문이다.

## 완료 보고
"완료되었습니다" 대신 **"수정을 완료했으며 확인이 필요합니다"** 형식으로, 단계별 ✅/한계를 표로 보고한다.
