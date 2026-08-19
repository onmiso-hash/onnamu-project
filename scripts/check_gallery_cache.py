#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""갤러리 캐시 검사 — 화면(HTML)이 브라우저에 얼어붙지 않는가.

왜 있나 (2026-08-20 사고):
  캐시 규칙이 "주소가 .mp4 로 끝나는가"였다. 재생 화면 주소가
  /player/영화이름.mp4 라서 화면까지 '30일 동안 안 변하는 파일'로 분류됐다.
  폰은 그 화면을 30일 물고 서버에 다시 묻지 않았고, 화면 안에 얼어붙은
  옛 주소(느린 /media 길)로 계속 영상을 받아 미니PC CPU가 100%를 쳤다.
  서버에 재생 화면 요청이 27시간 동안 0건이라 아무도 알아채지 못했다.
  클라우드플레어도 같은 이유로 이 화면을 캐시 대상으로 잡고 있었다.

  눈으로 봐서는 안 보이는 자리다. 그래서 검사로 막는다.

배포 전에 자동으로 돈다. 하나라도 깨지면 push가 막힌다.
파이썬 기본 기능만 쓴다(flask·Pillow 없이 돌아야 한다).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'gallery'))

from cache_policy import is_immutable_media  # noqa: E402

FAILS = []


def check(label, got, want):
    if got != want:
        FAILS.append(f"{label}\n      기대: {want} / 실제: {got}")


# ── 1. 무엇을 얼려도 되는가 ────────────────────────────────
# 화면(HTML)은 주소가 무엇으로 끝나든 얼면 안 된다.
for path in [
    "/watch/private/fc2-ppv-1699384.mp4",   # 재생 화면 — 이번 사고의 자리
    "/player/private/fc2-ppv-1699384.mp4",  # 옛 재생 주소(새 주소로 보내는 길)
    "/movies",
    "/",
    "/manage",
    "/upload",
    "/login",
    "/media_모음.mp4",                       # '들어 있는가'로 재던 시절의 함정
]:
    check(f"화면이 얼어붙는다: {path}", is_immutable_media(path, 200), False)

# 진짜 미디어 파일은 얼려도 된다(그래야 부드럽게 재생된다).
for path in [
    "/media/private/movies/fc2-ppv-1699384.mp4",
    "/thumbnail/private/movies/fc2-ppv-1699384.mp4",
    "/subtitle/private/fc2-ppv-1699384.vtt",
]:
    check(f"미디어가 안 얼어붙는다: {path}", is_immutable_media(path, 200), True)
    check(f"부분전송이 안 얼어붙는다: {path}", is_immutable_media(path, 206), True)

# 로그인으로 돌려보내는 답(302)이 얼면, 로그인한 뒤에도 계속 튕긴다.
check("로그인 안내(302)가 얼어붙는다",
      is_immutable_media("/media/private/movies/x.mp4", 302), False)
check("오류(404)가 얼어붙는다",
      is_immutable_media("/media/private/movies/없는파일.mp4", 404), False)


# ── 2. 규칙이 두 벌이 되지 않았는가 ────────────────────────
# 갤러리 코드가 확장자로 캐시를 판정하는 자리를 다시 만들면 막는다.
app_src = open(os.path.join(ROOT, 'gallery', 'app.py'), encoding='utf-8').read()
# 응답 후처리 함수 하나만 떼어낸다 — 들여쓰기가 풀리는 줄에서 끊는다.
# (다음 @app. 까지 잡으면 아래 함수들이 통째로 딸려 들어와 헛짚는다)
lines = app_src.splitlines()
body_lines, inside = [], False
for i, line in enumerate(lines):
    if line.startswith('@app.after_request'):
        inside = True
        continue
    if inside:
        if line.strip() and not line[0].isspace() and not line.startswith('def '):
            break
        if line.startswith('def ') and body_lines:
            break
        body_lines.append(line)
if not body_lines:
    FAILS.append("갤러리 app.py 에서 응답 후처리(@app.after_request)를 못 찾았습니다.")
else:
    # 주석은 빼고 실제 코드만 본다 — 사고 경위를 주석에 적으면 확장자가 나온다.
    body = re.sub(r'#.*', '', '\n'.join(body_lines))
    if '.mp4' in body or 'endswith' in body:
        FAILS.append("응답 후처리가 다시 확장자로 캐시를 판정하고 있습니다.\n"
                     "      판정은 gallery/cache_policy.py 한 곳에만 두세요.")
    if 'is_immutable_media' not in body:
        FAILS.append("응답 후처리가 cache_policy 의 판정을 쓰지 않습니다.\n"
                     "      규칙이 두 벌이 되면 한쪽만 고쳐집니다.")


# ── 3. 화면 링크가 옛 재생 주소를 가리키지 않는가 ──────────
for name in ('movies.html', 'gallery.html', 'manage.html'):
    p = os.path.join(ROOT, 'gallery', 'templates', name)
    if not os.path.exists(p):
        continue
    src = open(p, encoding='utf-8').read()
    if "'/player/" in src or '"/player/' in src:
        FAILS.append(f"{name} 이 옛 재생 주소(/player/)를 가리킵니다 — /watch/ 로 바꾸세요.")


# ── 4. 직행 통로 값이 비어도 조용히 넘어가지 않는가 ────────
compose = open(os.path.join(ROOT, 'gallery', 'docker-compose.yml'), encoding='utf-8').read()
for var in ('STREAM_BASE_URL', 'STREAM_SECRET'):
    if re.search(r'\$\{' + var + r':-', compose):
        FAILS.append(f"{var} 가 비어도 조용히 넘어가게 되어 있습니다(${{{var}:-}}).\n"
                     f"      값이 빠진 채 배포되면 재생이 느린 길로 내려앉고,\n"
                     f"      그때 열린 화면이 폰에 얼어붙습니다. ${{{var}:?...}} 로 막으세요.")
    elif not re.search(r'\$\{' + var + r':\?', compose):
        FAILS.append(f"{var} 를 gallery/docker-compose.yml 에서 못 찾았습니다.")


# ── 결과 ───────────────────────────────────────────────────
if FAILS:
    print("[갤러리 캐시 검사] 막음 — 아래를 고친 뒤 다시 push 하세요.")
    for i, f in enumerate(FAILS, 1):
        print(f"  {i}. {f}")
    sys.exit(1)

print("[갤러리 캐시 검사] 통과 — 화면은 안 얼고, 미디어만 얼립니다.")
sys.exit(0)
