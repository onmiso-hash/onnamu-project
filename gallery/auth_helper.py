"""갤러리의 출입 검사.

판정 규칙 자체(출입증 검사·신분·권한)는 auth_common.py 한 벌에 있다.
여기에는 갤러리에만 있는 것 — 손잡기(SSO)로 받은 출입증 심기, 자기 사본 갈아 끼우기,
올리기 허용 조건 — 만 남긴다.
"""

import urllib.parse
from functools import wraps
from flask import request, redirect, g, current_app, make_response

from auth_common import (
    generate_auth_token,
    verify_token,
    apply_permissions,
    fetch_permissions,
    resolve_user,
    to_portal_login as _to_portal_login,
    shares_portal_cookie as _shares_portal_cookie,
    current_identity as _current_identity,
)

# 갤러리가 따로 들고 있는 사본의 이름. 신분이 아니라 '베껴 둔 것'이다.
PRIVATE_COOKIE = 'gallery_auth_token'


def current_identity(secret, host=None):
    """이 요청의 '누구인가'. 판정은 공통 규칙이 하고, 갤러리는 사본 이름만 알려준다."""
    return _current_identity(secret, host, private_cookie=PRIVATE_COOKIE)


def upload_allowed(user):
    """갤러리에 올릴 수 있는가.
    허락이 켜져 있고, public이 아닌 폴더가 하나라도 있어야 한다.
    뒤쪽 조건이 없으면 올린 것이 결국 public으로 떨어진다(옛 결함)."""
    if not user.get("can_upload", False):
        return False
    return any(f != "public" for f in user.get("folders", []))


def login_required(admin_only=False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            secret = current_app.config.get('SECRET_KEY') or 'change-me-in-production'

            host = request.headers.get('Host', '')

            # (1) URL 파라미터로 넘어온 토큰 우선 검증 및 로컬 쿠키 저장 처리 (SSO 프로토콜)
            url_token = request.args.get('token')
            if url_token:
                payload = verify_token(url_token, secret)
                if payload:
                    g.user = payload
                    # token만 떼고 나머지 칸은 그대로 들고 돌아간다.
                    # 통째로 버리면 sso=1 표시까지 사라져 손잡기를 무한히 되풀이한다.
                    rest = {k: v for k, v in request.args.items() if k != 'token'}
                    clean_url = request.base_url
                    if rest:
                        clean_url = f"{clean_url}?{urllib.parse.urlencode(rest)}"
                    resp = make_response(redirect(clean_url))
                    # HTTP/HTTPS 비보안 환경 간 완벽 동기화를 위해 쿠키 도메인을 지정하지 않고 갤러리 자체 로컬 오리진에 직접 세팅
                    resp.set_cookie(PRIVATE_COOKIE, url_token, httponly=True, max_age=30 * 24 * 3600)
                    return resp

            # (2) '지금 누가 로그인해 있는가'는 포털과 함께 쓰는 출입증만이 답한다.
            payload, refresh_token, unknown = current_identity(secret, host)

            if unknown:
                # 로그인 상태가 아니거나 확인할 수 없다.
                # 갤러리 사본이 남아 있어도 쓰지 않는다 — 쓰면 사고가 그대로 되살아난다.
                if request.args.get('sso') == '1':
                    return ("⛔ 지금 누가 로그인했는지 확인할 수 없습니다. "
                            "onnamu.kr 에서 다시 로그인해 주세요.", 403)
                return _to_portal_login(sso_retry=True)

            if not payload:
                return _to_portal_login()

            # 지금 권한을 포털에 물어 덮어쓴다. 계정이 없어졌거나 잠겼으면 여기서 끝난다.
            user, blocked = resolve_user(payload, secret)
            if blocked:
                return _to_portal_login()

            if admin_only and not user.get('is_admin', False):
                return "⛔ Forbidden: 관리자 권한이 필요합니다.", 403

            # Flask의 글로벌 g 객체에 유저 페이로드 세팅
            g.user = user
            result = fn(*args, **kwargs)
            if refresh_token:
                resp = make_response(result)
                resp.set_cookie(PRIVATE_COOKIE, refresh_token, httponly=True, max_age=30 * 24 * 3600)
                return resp
            return result
        return wrapper
    return decorator
