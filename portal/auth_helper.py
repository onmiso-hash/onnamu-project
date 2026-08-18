"""포털의 출입 검사.

판정 규칙 자체(출입증 검사·신분·권한)는 auth_common.py 한 벌에 있다 —
갤러리·스튜디오와 같은 규칙이다. 여기에는 포털에만 있는 것만 남긴다:
배포 스크립트용 열쇠 우회와, 권한을 자기 표에서 직접 읽는 통로.
"""

from functools import wraps
from flask import request, g, current_app

from auth_common import (
    generate_auth_token,
    verify_token,
    apply_permissions,
    is_machine_identity,
    shared_token,
    to_portal_login as _to_portal_login,
    current_identity as _current_identity,
)

# 포털은 권한이 적힌 표를 직접 들고 있다. 자기 자신에게 HTTP로 묻지 않고
# app.py가 여기에 '표를 읽는 함수'를 꽂아 준다(서로 부르는 고리를 피하려고).
_permission_source = None


def set_permission_source(fn):
    """app.py가 부른다. fn(아이디) -> 권한 꾸러미(없으면 {"exists": False})."""
    global _permission_source
    _permission_source = fn


def current_identity(secret, host=None):
    """이 요청의 '누구인가'. 포털은 자기 사본이 없어 공용 출입증이 곧 신분이다."""
    return _current_identity(secret, host)


def resolve_user(payload):
    """'무엇을 할 수 있는가'를 지금 표에서 읽어 덮어쓴다.

    출입증에 박힌 권한은 발급 시점(최대 30일 전)의 사실이라, 관리자에서 내린
    사람도 그동안 계속 통과한다. 갤러리·스튜디오는 이미 60초마다 포털에 묻는데
    포털만 묻지 않고 있었다(2026-08-19에 맞춤)."""
    if _permission_source is None:
        # 꽂아 주지 않았다 — '못 물었다'와 같게 다룬다(모르면 열지 않는다).
        return apply_permissions(payload, None)
    username = payload.get('username', '')
    if is_machine_identity(username):
        return apply_permissions(payload, None)
    return apply_permissions(payload, _permission_source(username))


def login_required(admin_only=False, allow_api_key=True):
    """allow_api_key=False면 X-API-Key 우회를 받지 않는다.
    계정 관리 통로에 쓴다 — 열쇠 하나로 계정 생성·권한 상승이 되면 안 되기 때문에
    그 통로만은 사람이 쿠키로 로그인한 경우만 통과시킨다."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            secret = current_app.config.get('SECRET_KEY') or 'change-me-in-production'

            payload, _refresh, _unknown = current_identity(secret)

            # API Key 우회 검증 추가 (배포 자동화 스크립트용, 따옴표/개행문자 유연화)
            api_key = request.headers.get('X-API-Key')
            api_key_clean = api_key.strip('"\'- \r\n') if api_key else None
            secret_clean = secret.strip('"\'- \r\n') if secret else None

            if allow_api_key and api_key_clean and api_key_clean == secret_clean:
                payload = {
                    "username": "system_deploy",
                    "is_admin": True,
                    "folders": ["public", "private", "family"]
                }

            if not payload:
                # 로그인 안 됨 -> 포털 로그인 페이지로 리다이렉트
                return _to_portal_login()

            # 지금 권한을 표에서 읽어 덮어쓴다. 계정이 없어졌거나 잠겼으면 여기서 끝난다.
            user, blocked = resolve_user(payload)
            if blocked:
                return _to_portal_login()

            if admin_only and not user.get('is_admin', False):
                return "⛔ Forbidden: 관리자 권한이 필요합니다.", 403

            # Flask의 글로벌 g 객체에 유저 페이로드 세팅
            g.user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator
