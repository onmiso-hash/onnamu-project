#!/usr/bin/env bash
# 공통 판정 규칙 원본(shared/auth_common.py)을 각 서비스 폴더로 내려보낸다.
# 도커가 서비스 폴더 하나만 담아 이미지를 만들기 때문에 사본이 필요하다.
# 사본을 직접 고치면 push가 막힌다 — 원본을 고치고 이것을 돌린다.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
SRC="$ROOT/shared/auth_common.py"
for svc in portal gallery; do
  cp "$SRC" "$ROOT/$svc/auth_common.py"
  echo "내려보냄: $svc/auth_common.py"
done
