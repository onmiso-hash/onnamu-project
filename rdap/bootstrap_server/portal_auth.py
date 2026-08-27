"""로그인했는지를 포털에 물어본다 — 이 서버는 출입증을 스스로 검사하지 않는다.

왜 물어보기만 하는가
--------------------
출입증을 만들고 검사하는 규칙은 저장소에 **한 벌만** 두기로 되어 있다(shared/auth_common.py).
"같은 규칙이 두 벌이라 한쪽만 고쳐진다"가 2026-08-18 갤러리 사고의 원인이었고,
그 뒤로 사본이 원본과 한 글자라도 다르면 push가 막힌다.

이 서버는 파이썬 웹틀이 달라(FastAPI) 그 규칙 파일을 그대로 가져다 쓸 수 없다.
그래서 규칙을 옮겨 적는 대신, 받은 출입증을 포털에 그대로 건네 '누구인가'만
돌려받는다. 검사하는 자리는 여전히 포털 한 곳뿐이다.

왜 출입증이 따로 필요한가
-------------------------
포털이 심는 출입증은 onnamu.kr 밑에서만 함께 온다. 이 서비스는 rdap.kr 이라
다른 집이라서 그 출입증이 도착하지 않는다. 그래서 갤러리가 우회 포트에서 쓰는
방법과 같이, 포털이 로그인 뒤 주소 끝에 붙여 보내는 출입증을 받아
이 서비스의 쿠키에 담아 둔다.

담아 둔 쿠키는 **12시간만 산다.** 포털 쪽 출입증은 30일을 살지만, 그 사이
같은 브라우저에서 다른 사람이 로그인해도 이쪽 사본은 옛 이름을 그대로 들고 있다
(갤러리 사고가 정확히 그 모양이었다). 이 서비스에서 이 쿠키로 열리는 것은
'접속 주소를 가리지 않고 보기' 하나뿐이지만, 그래도 오래 들고 있지 않는다.
"""

import json
import os
import threading
import time
import urllib.parse
import urllib.request

# 이 서비스가 따로 들고 있는 사본의 이름. 포털의 것(auth_token)과 이름이 달라야
# 한 브라우저에서 서로 덮어쓰지 않는다.
COOKIE_NAME = "rdap_auth_token"
COOKIE_MAX_AGE = 12 * 3600

PORTAL_INTERNAL_URL = os.environ.get("PORTAL_INTERNAL_URL", "http://host.docker.internal:5001")
PORTAL_PUBLIC_URL = os.environ.get("PORTAL_URL", "https://onnamu.kr")

# 포털에 물어본 답을 잠시 들고 있는다. 통계 화면이 주기적으로 부르므로 매번
# 물으면 포털에 쓸데없는 짐이 된다. 짧게 잡아 계정이 잠기면 곧 반영되게 한다.
_TTL = 60
_cache = {}
_lock = threading.Lock()


def secret_key():
    """서비스끼리 부를 때 쓰는 열쇠. 배포가 .env 파일로 넣어 준다."""
    return (os.environ.get("SECRET_KEY") or "").strip("\"'- \r\n")


def identity(token):
    """출입증의 주인. 로그인 상태가 아니거나 못 물었으면 None.

    못 물었을 때 '로그인한 것으로 쳐 주는' 일은 하지 않는다 — 포털이 멈춘 것이
    남의 접속 주소를 열어 주는 이유가 될 수는 없다.
    """
    token = (token or "").strip()
    if not token:
        return None

    key = secret_key()
    if not key:
        return None

    now = time.time()
    with _lock:
        cached = _cache.get(token)
        if cached and now - cached[0] < _TTL:
            return cached[1]

    body = json.dumps({"token": token}).encode("utf-8")
    req = urllib.request.Request(
        PORTAL_INTERNAL_URL.rstrip("/") + "/api/auth/whoami",
        data=body,
        headers={"Content-Type": "application/json", "X-API-Key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            answer = json.loads(res.read().decode("utf-8"))
    except Exception:
        return None

    who = None
    if answer.get("ok"):
        who = {"username": answer.get("username", ""), "is_admin": bool(answer.get("is_admin"))}

    with _lock:
        _cache[token] = (now, who)
        # 오래된 것은 버린다 — 브라우저마다 다른 출입증이 쌓이면 계속 는다.
        if len(_cache) > 500:
            for old in [k for k, v in _cache.items() if now - v[0] > _TTL]:
                _cache.pop(old, None)
    return who


def login_url(back_to):
    """포털 로그인 화면 주소. 로그인하면 back_to 로 돌아오며 출입증이 붙어 온다."""
    return "%s/login?next=%s" % (
        PORTAL_PUBLIC_URL.rstrip("/"),
        urllib.parse.quote(back_to, safe=""),
    )
