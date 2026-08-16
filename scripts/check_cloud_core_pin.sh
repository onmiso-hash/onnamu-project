#!/usr/bin/env bash
# 클라우드 라우팅 배포 전 "안쪽 엔진이 낡지 않았는가" 검사.
#
# 왜 있나: 2026-07-31, namu-cloud-routing v0.1.13이 2주 묵은 코어(namu-agent
# v0.1.29)를 품은 채 라이브로 나갔다. 바깥 버전 네 자리는 전부 정확히 올렸고
# "옛 번호 잔존 0건"까지 통과했지만, 그 네 자리는 모두 껍데기 번호였다.
# 결과: 클라우드로 저장한 기억에 3층(summary/reason/body) 칸이 생기지 않았다.
# 사람의 기억에 의존하는 확인은 이미 한 번 실패했으므로 여기서 막는다.
#
# 판정(두 갈래):
#  (A) 이 푸시가 클라우드 번호 자체를 올리는 경우 — 품은 코어가 namu-agent의
#      **가장 최신 꼬리표**와 같아야 한다. 잣대를 '개인용 서버가 지금 쓰는 번호'로
#      두면, 개인용이 뒤처져 있을 때 클라우드도 함께 뒤처진 채 통과한다.
#      2026-08-01 실측: 개인용 v0.1.43 / 클라우드 엔진 v0.1.45 / 실제 최신 0.1.47
#      → 옛 판정은 "통과"였다. 새 판을 올리는 그 순간이 최신을 요구할 유일한 시점이다.
#  (B) 클라우드 번호를 건드리지 않는 푸시 — 옛 판정(클라우드 엔진 >= 개인용 코어)만
#      본다. 무관한 작업까지 막지 않기 위해서다.
# 낮으면 exit 1(푸시 차단). 확인 자체가 불가능하면(오프라인·클론 없음) exit 0으로
# 조용히 넘어간다 — 검사기 사정으로 사용자의 푸시를 막지는 않는다.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTING_DIR="${NAMU_CLOUD_ROUTING_DIR:-$HOME/project/namu-cloud-routing}"
AGENT_DIR="${NAMU_AGENT_DIR:-$HOME/project/namu-agent}"

COMPOSE="$ROOT/namu-cloud/docker-compose.yml"
# 배포 명령은 2026-08-16에 deploy.yml 에서 이 파일로 옮겼다(윈도우 명령줄
# 한계 초과). 번호(핀)도 같이 옮겨왔으므로 여기를 읽는다.
DEPLOY="$ROOT/scripts/deploy.ps1"

skip() { echo "[클라우드 엔진 검사] 건너뜀 — $1"; exit 0; }
block() {
  echo ""
  echo "  ⛔ 푸시를 막았습니다 — 클라우드가 품은 기억 엔진이 낡았습니다."
  echo ""
  echo "     $1"
  echo ""
  echo "  이대로 올리면 클라우드로 저장한 기억에 요약·원문 칸이 생기지 않습니다."
  echo "  namu-cloud-routing 쪽에서 vendor/namu-agent 를 최신으로 올리고"
  echo "  새 꼬리표를 붙인 뒤 다시 시도하세요."
  echo ""
  echo "  검사를 건너뛰어야 한다면: git push --no-verify"
  echo ""
  exit 1
}

[ -f "$COMPOSE" ] && [ -f "$DEPLOY" ] || skip "설정 파일을 찾을 수 없음"

# 이번 푸시가 클라우드 배포와 무관하면 네트워크를 쓰지 않고 즉시 통과.
#
# 여기 적는 파일은 위 COMPOSE·DEPLOY와 같아야 한다. 2026-08-16에 배포 명령이
# deploy.yml 에서 scripts/deploy.ps1 로 옮겨졌는데 이 걸림목만 옛 이름을 달고
# 있었다 — 클라우드 꼬리표가 박히는 자리가 바로 그 파일이라, deploy.ps1 만 고친
# 푸시는 검사를 통째로 건너뛰었다(막아야 할 바로 그 경우가 안 걸렸다).
CHANGED="$(git -C "$ROOT" diff --name-only origin/main..HEAD 2>/dev/null)"
if [ -n "$CHANGED" ] && ! grep -qE 'namu-cloud/docker-compose\.yml|scripts/deploy\.ps1' <<<"$CHANGED"; then
  exit 0
fi

CLOUD_TAG="$(grep -oE 'namu-cloud-routing:v[0-9]+\.[0-9]+\.[0-9]+' "$COMPOSE" | head -1 | cut -d: -f2)"
CORE_TAG="$(grep -oE 'namu-remote-mcp:v[0-9]+\.[0-9]+\.[0-9]+' "$DEPLOY" | head -1 | cut -d: -f2)"

[ -n "$CLOUD_TAG" ] && [ -n "$CORE_TAG" ] || skip "버전 표기를 읽지 못함"
[ -d "$ROUTING_DIR/.git" ] && [ -d "$AGENT_DIR/.git" ] || skip "로컬 클론이 없어 대조 불가"

GIT_TERMINAL_PROMPT=0 git -C "$ROUTING_DIR" fetch -q --tags origin 2>/dev/null || skip "깃허브에 닿지 못함(오프라인)"
GIT_TERMINAL_PROMPT=0 git -C "$AGENT_DIR"  fetch -q --tags origin 2>/dev/null || skip "깃허브에 닿지 못함(오프라인)"

PIN="$(git -C "$ROUTING_DIR" ls-tree "$CLOUD_TAG" vendor/namu-agent 2>/dev/null | awk '{print $3}')"
[ -n "$PIN" ] || block "꼬리표 $CLOUD_TAG 를 깃허브에서 찾지 못했습니다(아직 안 올렸거나 이름이 틀림)."

# --contains 는 그 커밋을 품은 꼬리표를 전부 준다(옛 커밋은 최신 꼬리표에도 들어 있다).
# 그러므로 "가장 처음 그 커밋을 담은 꼬리표" = sort -V 의 맨 앞을 골라야 한다.
# tail(맨 뒤)을 고르면 2주 묵은 커밋도 최신으로 보여 검사가 통째로 무력해진다(실측 확인).
ENGINE="$(git -C "$AGENT_DIR" tag --contains "$PIN" 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | head -1)"
[ -n "$ENGINE" ] || block "$CLOUD_TAG 가 품은 엔진 커밋(${PIN:0:8})이 어느 버전인지 확인되지 않습니다."

older() { printf '%s\n%s\n' "$1" "$2" | sort -V | head -1; }

# 이 푸시가 클라우드 번호를 올리는가(작업 트리 값 vs 깃허브 main 값).
PREV_CLOUD="$(git -C "$ROOT" show origin/main:namu-cloud/docker-compose.yml 2>/dev/null \
  | grep -oE 'namu-cloud-routing:v[0-9]+\.[0-9]+\.[0-9]+' | head -1 | cut -d: -f2)"

if [ "$CLOUD_TAG" != "$PREV_CLOUD" ]; then
  # (A) 새 판을 올리는 중 — 잣대는 namu-agent의 가장 최신 꼬리표다.
  LATEST="$(git -C "$AGENT_DIR" tag -l 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)"
  [ -n "$LATEST" ] || skip "namu-agent 꼬리표를 읽지 못함"
  if [ "$ENGINE" != "$LATEST" ] && [ "$(older "$ENGINE" "$LATEST")" = "$ENGINE" ]; then
    block "$CLOUD_TAG 가 품은 엔진은 $ENGINE 인데, 나무 본체의 최신 꼬리표는 $LATEST 입니다."
  fi
  echo "[클라우드 엔진 검사] 통과 — $CLOUD_TAG 가 품은 엔진 $ENGINE (본체 최신 $LATEST)"
  exit 0
fi

# (B) 클라우드 번호는 그대로 — 옛 판정만 본다.
if [ "$ENGINE" != "$CORE_TAG" ] && [ "$(older "$ENGINE" "$CORE_TAG")" = "$ENGINE" ]; then
  block "$CLOUD_TAG 가 품은 엔진은 $ENGINE 인데, 개인용 서버는 $CORE_TAG 를 씁니다."
fi

echo "[클라우드 엔진 검사] 통과 — $CLOUD_TAG 가 품은 엔진 $ENGINE (개인용 $CORE_TAG, 클라우드 번호 변경 없음)"
exit 0
