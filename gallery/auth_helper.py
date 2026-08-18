import hmac
import hashlib
import base64
import json
import os
import time
import urllib.parse
import urllib.request
from functools import wraps
from flask import request, redirect, session, g, current_app, make_response

# --- 지금 권한을 포털에 물어본다 ---
# 출입증에도 권한이 적혀 있지만 그것은 발급 시점(최대 30일 전)의 사실이다.
# 권한을 바꾸거나 계정을 잠근 것이 곧바로 듣게 하려면 그때그때 물어야 한다.
# 매 요청마다 묻지는 않는다 — 60초 동안은 마지막에 들은 답을 쓴다.
PERM_TTL_SECONDS = 60
_perm_cache = {}   # 아이디 -> (물어본 시각, 답)

def _portal_internal_url():
    # 서비스끼리는 바깥 주소(https://onnamu.kr)를 돌지 않고 기계 안에서 바로 부른다.
    return os.environ.get("PORTAL_INTERNAL_URL", "http://host.docker.internal:5001")

def fetch_permissions(username, secret):
    """포털에 지금 권한을 묻는다. 못 물으면 마지막에 들은 답, 그것도 없으면 None."""
    now = time.time()
    cached = _perm_cache.get(username)
    if cached and now - cached[0] < PERM_TTL_SECONDS:
        return cached[1]

    url = f"{_portal_internal_url()}/api/auth/permissions/{urllib.parse.quote(username)}"
    try:
        req = urllib.request.Request(url, headers={"X-API-Key": secret})
        with urllib.request.urlopen(req, timeout=3) as res:
            perms = json.loads(res.read().decode('utf-8'))
    except Exception:
        # 포털이 멈춰 있어도 갤러리가 같이 멈추면 안 된다 — 옛 답으로 버틴다.
        return cached[1] if cached else None

    _perm_cache[username] = (now, perms)
    return perms

def resolve_user(payload, secret):
    """출입증에서 '누구인가'를 얻고, '무엇을 할 수 있는가'는 포털에 물어 덮어쓴다.
    돌려주는 값: (사용자 정보, 막아야 하는 이유 or None)"""
    user = dict(payload)
    perms = fetch_permissions(payload.get("username", ""), secret)

    if perms is None:
        # 포털에 못 물었고 기억해 둔 답도 없다 — 출입증에 적힌 값으로 버틴다.
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

def upload_allowed(user):
    """갤러리에 올릴 수 있는가.
    허락이 켜져 있고, public이 아닌 폴더가 하나라도 있어야 한다.
    뒤쪽 조건이 없으면 올린 것이 결국 public으로 떨어진다(옛 결함)."""
    if not user.get("can_upload", False):
        return False
    return any(f != "public" for f in user.get("folders", []))

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

def _to_portal_login():
    """로그인 화면으로 보낸다 — 출입증이 없을 때도, 계정이 없어지거나 잠겼을 때도 같은 길이다."""
    portal_url = current_app.config.get('PORTAL_URL')
    if not portal_url:
        # 포털 자체일 수도 있으므로, 상대경로 fallback 또는 호스트명 기반
        host = request.headers.get('Host', '')
        if 'localhost' in host or '127.0.0.1' in host:
            portal_url = f"http://{host.split(':')[0]}:5001"
        else:
            portal_url = "https://onnamu.kr"
    return redirect(f"{portal_url}/login?next={request.url}")

def login_required(admin_only=False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            secret = current_app.config.get('SECRET_KEY') or 'change-me-in-production'
            
            # (1) URL 파라미터로 넘어온 토큰 우선 검증 및 로컬 쿠키 저장 처리 (SSO 프로토콜)
            url_token = request.args.get('token')
            if url_token:
                payload = verify_token(url_token, secret)
                if payload:
                    g.user = payload
                    # 파라미터가 빠진 깨끗한 원래의 주소로 리다이렉트하여 로그인 루프 파괴
                    clean_url = request.base_url
                    resp = make_response(redirect(clean_url))
                    # HTTP/HTTPS 비보안 환경 간 완벽 동기화를 위해 쿠키 도메인을 지정하지 않고 갤러리 자체 로컬 오리진에 직접 세팅
                    resp.set_cookie('gallery_auth_token', url_token, httponly=True, max_age=30 * 24 * 3600)
                    return resp
                    
            token = request.cookies.get('gallery_auth_token')
            payload = verify_token(token, secret)

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
            return fn(*args, **kwargs)
        return wrapper
    return decorator
