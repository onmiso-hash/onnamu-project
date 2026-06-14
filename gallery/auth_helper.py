import hmac
import hashlib
import base64
import json
import time
from functools import wraps
from flask import request, redirect, session, g, current_app, make_response

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
                    resp.set_cookie('auth_token', url_token, httponly=True, max_age=30 * 24 * 3600)
                    return resp
                    
            token = request.cookies.get('auth_token')
            payload = verify_token(token, secret)
            
            if not payload:
                # 로그인 안 됨 -> 포털 로그인 페이지로 리다이렉트
                portal_url = current_app.config.get('PORTAL_URL')
                if not portal_url:
                    # 포털 자체일 수도 있으므로, 상대경로 fallback 또는 호스트명 기반
                    host = request.headers.get('Host', '')
                    if 'localhost' in host or '127.0.0.1' in host:
                        portal_url = f"http://{host.split(':')[0]}:5001"
                    else:
                        portal_url = "https://onnamu.kr"
                
                next_url = request.url
                return redirect(f"{portal_url}/login?next={next_url}")
                
            if admin_only and not payload.get('is_admin', False):
                return "⛔ Forbidden: 관리자 권한이 필요합니다.", 403
                
            # Flask의 글로벌 g 객체에 유저 페이로드 세팅
            g.user = payload
            return fn(*args, **kwargs)
        return wrapper
    return decorator
