"""출입증·신분·권한 — 모든 서비스가 같이 쓰는 판정 규칙 한 벌.

이 파일의 원본은 저장소 뿌리의 shared/auth_common.py 다.
서비스 폴더(portal/·gallery/)에도 같은 파일이 놓여 있는데, 도커가 서비스 폴더
하나만 담아 이미지를 만들기 때문이다. 사본과 원본이 한 글자라도 다르면
scripts/check_identity_common.py 가 push를 막는다 — 2026-08-18 사고가
"같은 규칙이 두 벌이라 한쪽만 고쳐졌다"에서 났기 때문이다.
사본을 고치지 말 것. 원본을 고치고 scripts/sync_auth_common.sh 로 내려보낸다.

여기 있는 것 : 출입증 만들기·검사, '지금 누구인가'(신분), '무엇을 할 수 있나'(권한) 적용.
여기 없는 것 : 권한을 어디서 가져오는가 — 포털은 자기 표를 직접 보고, 나머지
               서비스는 포털에 물어본다. 가져온 뒤의 판정은 이 파일 하나가 정한다.
"""

import hmac
import hashlib
import base64
import json
import os
import time
import urllib.parse
import urllib.request
from flask import request, redirect, current_app

# 포털이 심는 공용 출입증. '지금 누가 로그인해 있는가'는 오직 이것만이 답한다.
SHARED_COOKIE = 'auth_token'

# 기계끼리 부르는 출입증의 아이디 앞머리. 계정표에 없는 것이 정상이다.
# (포털이 스튜디오에 자료 정리를 시킬 때, 배포 스크립트가 기록을 남길 때 쓴다.)
MACHINE_PREFIX = 'system_'


def is_machine_identity(username):
    """사람이 아니라 기계의 출입증인가.

    이 출입증은 SECRET_KEY를 가진 쪽만 만들 수 있어 서명 검사가 곧 신원 확인이다.
    계정표에 없으므로 권한을 물으면 '없는 계정'으로 막힌다 — 그래서 묻지 않는다.
    사람이 이 앞머리로 계정을 만들지 못하게 포털이 따로 막는다."""
    return bool(username) and username.startswith(MACHINE_PREFIX)


# ---------------------------------------------------------------------------
# 출입증 만들기 · 검사
# ---------------------------------------------------------------------------

def generate_auth_token(username, secret_key, is_admin=False, folders=None):
    if folders is None:
        folders = []
    # 만료시간: 현재 시간 + 30일
    exp = int(time.time()) + (30 * 24 * 3600)
    payload_data = {
        "username": username,
        "exp": exp,
        "is_admin": is_admin,
        "folders": folders
    }
    payload_json = json.dumps(payload_data)
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode('utf-8')).decode('utf-8').rstrip('=')

    signature = hmac.new(
        secret_key.encode('utf-8'),
        payload_b64.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return f"{payload_b64}.{signature}"


def verify_token(token, secret_key):
    try:
        if not token:
            return None
        parts = token.split('.')
        if len(parts) != 2:
            return None

        payload_b64, signature = parts

        # 서명 검증
        expected_sig = hmac.new(
            secret_key.encode('utf-8'),
            payload_b64.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_sig):
            return None

        # 디코딩 (Padding 복구)
        padding = '=' * (4 - len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(payload_b64 + padding).decode('utf-8')
        payload = json.loads(payload_json)

        # 만료 시간 확인
        if time.time() > payload.get('exp', 0):
            return None

        return payload
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 신분 — 지금 누가 로그인해 있는가
# ---------------------------------------------------------------------------

def shares_portal_cookie(host):
    """포털과 출입증을 같이 쓰는 구역인가.

    onnamu.kr 밑에서는 포털이 심은 공용 출입증이 다른 서비스에도 함께 온다.
    집 안에서 IP:포트로 바로 들어오는 경우에는 오지 않으므로 옛 방식을 그대로 둔다."""
    return 'onnamu.kr' in (host or '')


def shared_token():
    """공용 출입증의 원문 글자.

    신분 판정에 쓰라고 있는 것이 아니다 — 그 판정은 current_identity 하나가 한다.
    출입증을 그대로 다른 서비스에 건네줄 때(손잡기)처럼 원문이 필요한 자리에서만 쓴다.
    쿠키 이름을 아는 곳을 이 파일 하나로 묶어 두려는 것이다."""
    return request.cookies.get(SHARED_COOKIE)


def current_identity(secret, host=None, private_cookie=None):
    """이 요청의 '누구인가'를 정한다.

    private_cookie : 그 서비스가 따로 들고 있는 사본의 이름(없으면 None).
                     갤러리만 가지고 있다.

    돌려주는 값: (신분, 갈아 끼울 출입증, 확인불가 여부)
      · 신분        : 없으면 None
      · 갈아 끼울 표: 서비스 사본이 낡았으면 새로 심을 값
      · 확인불가    : True면 사본이 남아 있어도 절대 쓰면 안 된다(로그아웃 상태)

    자기 사본을 30일 들고 있으면서 그것을 신분으로 믿었더니, guest1로 로그인한
    브라우저가 앞서 쓰던 admin으로 갤러리에 들어가 남의 사진을 전부 봤다
    (2026-08-18 사고). 그래서 사본은 '신분'이 아니라 '베껴 둔 것'으로 격하한다.
    """
    if host is None:
        host = request.headers.get('Host', '')

    # 사본이 아예 없는 서비스(포털·스튜디오)는 공용 출입증이 곧 신분이다.
    if not private_cookie:
        return verify_token(request.cookies.get(SHARED_COOKIE), secret), None, False

    payload = verify_token(request.cookies.get(private_cookie), secret)
    refresh_token = None

    if shares_portal_cookie(host):
        shared_token = request.cookies.get(SHARED_COOKIE)
        shared = verify_token(shared_token, secret)
        if not shared:
            return None, None, True
        if not payload or payload.get('username') != shared.get('username'):
            payload = shared
            refresh_token = shared_token

    return payload, refresh_token, False


# ---------------------------------------------------------------------------
# 권한 — 지금 무엇을 할 수 있는가
# ---------------------------------------------------------------------------

# 출입증에도 권한이 적혀 있지만 그것은 발급 시점(최대 30일 전)의 사실이다.
# 권한을 바꾸거나 계정을 잠근 것이 곧바로 듣게 하려면 그때그때 물어야 한다.
# 매 요청마다 묻지는 않는다 — 60초 동안은 마지막에 들은 답을 쓴다.
PERM_TTL_SECONDS = 60
_perm_cache = {}   # 아이디 -> (물어본 시각, 답)


def portal_internal_url():
    # 서비스끼리는 바깥 주소(https://onnamu.kr)를 돌지 않고 기계 안에서 바로 부른다.
    return os.environ.get("PORTAL_INTERNAL_URL", "http://host.docker.internal:5001")


def fetch_permissions(username, secret):
    """포털에 지금 권한을 묻는다. 못 물으면 마지막에 들은 답, 그것도 없으면 None."""
    now = time.time()
    cached = _perm_cache.get(username)
    if cached and now - cached[0] < PERM_TTL_SECONDS:
        return cached[1]

    url = f"{portal_internal_url()}/api/auth/permissions/{urllib.parse.quote(username)}"
    try:
        req = urllib.request.Request(url, headers={"X-API-Key": secret})
        with urllib.request.urlopen(req, timeout=3) as res:
            perms = json.loads(res.read().decode('utf-8'))
    except Exception:
        # 포털이 멈춰 있어도 부르는 쪽이 같이 멈추면 안 된다 — 옛 답으로 버틴다.
        return cached[1] if cached else None

    _perm_cache[username] = (now, perms)
    return perms


def apply_permissions(payload, perms):
    """가져온 권한을 신분 위에 덮어쓴다 — 어디서 가져왔든 판정은 여기 하나뿐이다.

    돌려주는 값: (사용자 정보, 막아야 하는 이유 or None)"""
    user = dict(payload)

    if is_machine_identity(user.get("username", "")):
        # 기계 출입증은 계정표에 없는 것이 정상이다. 물으면 '없는 계정'으로 막힌다.
        return user, None

    if perms is None:
        # 못 물었고 기억해 둔 답도 없다 — 출입증에 적힌 값으로 버틴다.
        # 이때 새 권한(올리기·19금)은 꺼진 쪽으로 둔다. 모르면 열지 않는다.
        user.setdefault("can_upload", False)
        user.setdefault("adult_ok", False)
        return user, None

    if not perms.get("exists"):
        return user, "gone"
    if perms.get("locked"):
        return user, "locked"

    user["is_admin"] = bool(perms.get("is_admin"))
    user["folders"] = perms.get("folders", [])
    user["can_upload"] = bool(perms.get("can_upload"))
    user["adult_ok"] = bool(perms.get("adult_ok"))
    user["perm_version"] = perms.get("perm_version")
    return user, None


def resolve_user(payload, secret):
    """출입증에서 '누구인가'를 얻고, '무엇을 할 수 있는가'는 포털에 물어 덮어쓴다.
    포털 자신은 이것 대신 자기 표를 보고 apply_permissions를 직접 부른다."""
    username = payload.get("username", "")
    if is_machine_identity(username):
        return apply_permissions(payload, None)
    return apply_permissions(payload, fetch_permissions(username, secret))


# ---------------------------------------------------------------------------
# 로그인 화면으로 돌려보내기
# ---------------------------------------------------------------------------

def to_portal_login(sso_retry=False):
    """로그인 화면으로 보낸다 — 출입증이 없을 때도, 계정이 없어지거나 잠겼을 때도 같은 길이다.

    sso_retry: 돌아올 주소에 sso=1을 달아 둔다. '한 번은 손잡기를 시켜봤다'는 표시로,
    이것이 붙은 채 또 실패하면 무한 왕복 대신 멈춘다."""
    portal_url = current_app.config.get('PORTAL_URL')
    if not portal_url:
        # 포털 자체일 수도 있으므로, 상대경로 fallback 또는 호스트명 기반
        host = request.headers.get('Host', '')
        if 'localhost' in host or '127.0.0.1' in host:
            portal_url = f"http://{host.split(':')[0]}:5001"
        else:
            portal_url = "https://onnamu.kr"
    target = request.url
    if sso_retry and request.args.get('sso') != '1':
        target = f"{target}{'&' if '?' in target else '?'}sso=1"
    # next 값은 통째로 감싼다 — 감싸지 않으면 target 안의 &가 포털의 다른 칸으로 잘려 나간다.
    return redirect(f"{portal_url}/login?next={urllib.parse.quote(target, safe='')}")
