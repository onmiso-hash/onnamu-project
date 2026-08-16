#!/usr/bin/env bash
# 배포 명령이 윈도우 명령줄 한계를 넘지 않는지 본다.
#
# 왜: 미니PC는 SSH로 들어온 명령을 윈도우 명령줄로 실행한다. 한 줄이 약
#     8,190자를 넘으면 윈도우가 "명령줄이 너무 깁니다"로 거부한다.
#     2026-08-16 deploy.yml 안의 한 줄이 8,684자가 되어 배포가 8회 연속
#     실패했는데, 깃허브 화면 말고는 아무 데도 티가 나지 않았다.
#     그래서 푸시 자체를 막는다.
#
# 고치는 법: 긴 명령은 scripts/deploy.ps1 처럼 파일로 옮기고,
#            워크플로에는 그 파일을 부르는 짧은 줄만 남긴다.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DIR="$ROOT/.github/workflows"
LIMIT=4000          # 실측 한계 약 8,190자의 절반 — 여유를 크게 둔다
FAIL=0

[ -d "$DIR" ] || exit 0

while IFS= read -r -d '' f; do
  n=0
  # `|| [ -n "$line" ]` 가 없으면 마지막 줄에 줄바꿈이 없을 때 그 줄을 통째로
  # 건너뛴다. 하필 문제의 긴 줄이 파일 맨 끝이라 검사가 헛돌았다.
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    len=${#line}
    if [ "$len" -gt "$LIMIT" ]; then
      echo "[배포 명령 길이 검사] 실패 — ${f#$ROOT/}:$n 이 ${len}자다 (한계 ${LIMIT}자)"
      echo "   미니PC의 윈도우가 약 8,190자부터 실행을 거부한다."
      echo "   긴 명령은 scripts/ 아래 .ps1 파일로 옮기고 워크플로에서는 그 파일만 부를 것."
      FAIL=1
    fi
  done < "$f"
done < <(find "$DIR" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print0)

if [ "$FAIL" -eq 0 ]; then
  echo "[배포 명령 길이 검사] 통과"
fi
exit "$FAIL"
