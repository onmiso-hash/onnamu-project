#!/usr/bin/env bash
# 개인용 원격 MCP(namu.onnamu.kr)가 낡은 번호로 다시 세워지는 것을 막는 검사.
#
# 왜 있나: 2026-08-02, 개인용 서버가 v0.1.43에 머문 채 나흘이 지났다. 본체는
# v0.1.44·v0.1.45·v0.1.47을 냈고, 그 사이 이 저장소에는 8번 푸시가 있었다.
# 즉 볼 기회가 8번 있었는데 아무도 안 봤다. 발견은 사용자의 육안 질문이었다.
#
# 왜 다른 갈래는 멀쩡한데 여기만 뒤처졌나:
#  - 이 컴퓨터의 플러그인은 브랜치 소스라 늘 최신을 따라간다.
#  - 클라우드는 check_cloud_core_pin.sh 가 낡은 엔진을 막는다.
#  - 개인용 서버만 사람이 손으로 번호를 올려야 하고, 안 올려도 아무 일도 없었다.
#    게다가 바깥에서 버전을 물어볼 주소가 없어 뒤처짐이 화면에 드러나지도 않는다.
#
# 왜 '모든 푸시'에서 보나(클라우드 검사와 다른 점):
#  이 저장소는 무엇을 올리든 미니PC가 전 서비스를 다시 만든다. 포털만 고쳐
#  올려도 개인용 서버는 그 순간 낡은 번호로 다시 세워진다. 그러니 매번 볼 자격이
#  있다. 막혀도 푸는 값은 싸다 — 어차피 올리는 중이니 번호만 같이 고치면 된다.
#
# 낮으면 exit 1(푸시 차단). 확인 자체가 불가능하면(오프라인·클론 없음) exit 0으로
# 조용히 넘어간다 — 검사기 사정으로 사용자의 푸시를 막지는 않는다.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${NAMU_AGENT_DIR:-$HOME/project/namu-agent}"

COMPOSE="$ROOT/namu/docker-compose.yml"
DEPLOY="$ROOT/.github/workflows/deploy.yml"

skip() { echo "[개인용 서버 검사] 건너뜀 — $1"; exit 0; }
block() {
  echo ""
  echo "  ⛔ 푸시를 막았습니다 — 개인용 원격 서버가 낡은 번호로 다시 세워집니다."
  echo ""
  echo "     $1"
  echo ""
  echo "  이 저장소는 무엇을 올리든 미니PC가 전 서비스를 다시 만듭니다."
  echo "  지금 올리면 namu.onnamu.kr 이 낡은 번호 그대로 다시 세워집니다."
  echo ""
  echo "  푸는 법 — 아래 세 자리를 최신 번호로 고쳐 이번 푸시에 같이 실으세요."
  echo "     namu/docker-compose.yml           image: namu-remote-mcp:v...   (1곳)"
  echo "     .github/workflows/deploy.yml      -t namu-remote-mcp:v... 와"
  echo "                                       namu-agent.git#v...          (2곳, 같은 줄)"
  echo "  절차 전문은 /namu-deploy 를 보세요."
  echo ""
  echo "  검사를 건너뛰어야 한다면: git push --no-verify"
  echo ""
  exit 1
}

[ -f "$COMPOSE" ] && [ -f "$DEPLOY" ] || skip "설정 파일을 찾을 수 없음"

# 번호는 세 자리에 흩어져 있다. 하나라도 어긋나면 어느 것이 실제로 세워질지
# 알 수 없으므로 대조 자체가 무의미하다 — 먼저 셋이 같은지 본다.
PINS="$( { grep -oE 'namu-remote-mcp:v[0-9]+\.[0-9]+\.[0-9]+' "$COMPOSE" | cut -d: -f2
           grep -oE 'namu-remote-mcp:v[0-9]+\.[0-9]+\.[0-9]+' "$DEPLOY"  | cut -d: -f2
           grep -oE 'namu-agent\.git#v[0-9]+\.[0-9]+\.[0-9]+' "$DEPLOY"  | cut -d'#' -f2
         } )"
COUNT="$(wc -l <<<"$PINS")"
UNIQ="$(sort -u <<<"$PINS")"

[ "$COUNT" -eq 3 ] || skip "번호 표기를 세 자리에서 읽지 못함(읽은 것 ${COUNT}개)"
[ "$(wc -l <<<"$UNIQ")" -eq 1 ] || block "세 자리의 번호가 서로 다릅니다: $(tr '\n' ' ' <<<"$PINS")"

PIN="$UNIQ"

[ -d "$AGENT_DIR/.git" ] || skip "namu-agent 클론이 없어 대조 불가"
GIT_TERMINAL_PROMPT=0 git -C "$AGENT_DIR" fetch -q --tags origin 2>/dev/null || skip "깃허브에 닿지 못함(오프라인)"

LATEST="$(git -C "$AGENT_DIR" tag -l 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)"
[ -n "$LATEST" ] || skip "namu-agent 꼬리표를 읽지 못함"

older() { printf '%s\n%s\n' "$1" "$2" | sort -V | head -1; }

if [ "$PIN" != "$LATEST" ] && [ "$(older "$PIN" "$LATEST")" = "$PIN" ]; then
  block "지금 박힌 번호는 $PIN 인데, 나무 본체의 최신 꼬리표는 $LATEST 입니다."
fi

echo "[개인용 서버 검사] 통과 — 박힌 번호 $PIN (본체 최신 $LATEST)"
exit 0
