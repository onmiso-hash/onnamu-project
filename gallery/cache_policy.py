"""브라우저에게 "얼마나 오래 들고 있어라"를 말해 주는 규칙 한 벌.

왜 따로 떼어냈나 (2026-08-20 사고):
  규칙이 "주소가 .mp4로 끝나는가"였다. 그런데 재생 화면 주소가
  /player/영화이름.mp4 라서, 화면(HTML)까지 '30일 동안 안 변하는 파일'로
  분류됐다. 폰은 그 화면을 30일 물고 있으면서 서버에 다시 묻지 않았고,
  화면 안에 얼어붙은 옛 주소(느린 /media 길)로 계속 영상을 받아 갔다.
  서버에는 재생 화면 요청이 27시간 동안 0건이었다 — 그래서 아무도 몰랐다.
  클라우드플레어도 같은 이유로 이 화면을 캐시 대상(MISS)으로 잡고 있었다.

바뀐 판정: 확장자가 아니라 **진짜 미디어 경로인가**로 가른다.
화면(HTML)은 어떤 이름으로 끝나든 여기 들어올 수 없다.

이 파일이 원본이고, 검사(scripts/check_gallery_cache.py)가 이 파일만 본다.
규칙을 다른 곳에 베껴 두지 말 것 — 그러면 한쪽만 고쳐진다.
"""

# 30일 캐시를 걸어도 되는 진짜 미디어 경로.
# 앞부분이 정확히 일치할 때만 인정한다 — '들어 있는가'로 재면
# /player/media_모음.mp4 같은 이름의 화면이 걸린다.
MEDIA_URL_PREFIXES = ('/media/', '/thumbnail/', '/subtitle/')

# 캐시를 걸어도 되는 응답. 로그인으로 돌려보내는 응답(302)이 여기 들어가면
# "로그인하러 가라"는 답이 30일 얼어붙어, 로그인한 뒤에도 계속 튕긴다.
CACHEABLE_STATUS = (200, 206, 304)

IMMUTABLE = 'public, max-age=2592000, immutable'
NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate'


def is_immutable_media(path: str, status_code: int) -> bool:
    """이 응답을 30일 얼려도 되는가. 화면(HTML)은 절대 True가 되면 안 된다."""
    if status_code not in CACHEABLE_STATUS:
        return False
    return path.lower().startswith(MEDIA_URL_PREFIXES)
