from flask import Flask, jsonify, render_template, request, redirect, url_for, make_response, Response
import psutil
import sqlite3
import os
import json
from auth_helper import generate_auth_token, login_required, verify_token

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get("SECRET_KEY", "change-me-in-production")
app.secret_key = app.config['SECRET_KEY']
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    # Cloudflare Edge 및 브라우저 캐싱을 완벽 차단하는 무효화 헤더 강제 주입
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, proxy-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Surrogate-Control"] = "no-store"
    return response

# --- 데이터베이스 경로 설정 (영구 저장을 위해 data 폴더 지정) ---
DB_PATH = 'data/news.db'
USERS_CONF_PATH = os.environ.get("USERS_CONF_PATH", "users.json")

def init_db():
    if not os.path.exists('data'):
        os.makedirs('data')
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # 작업 이력 테이블
    c.execute('''CREATE TABLE IF NOT EXISTS work_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  category TEXT, title TEXT, content TEXT, 
                  work_date TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    # 뉴스 아카이브 테이블 (기존 데이터 보존용)
    c.execute('''CREATE TABLE IF NOT EXISTS news_archive
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  category TEXT, title TEXT, content TEXT, 
                  published_date TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    
    # 기존에 누적된 무거운 디버그(배포 로그) 데이터 청소
    c.execute("DELETE FROM work_history WHERE category = '디버그'")
    # 인코딩이 깨져 물음표(??)로 들어갔거나 배포 로그 키워드가 포함된 지저분한 로그 청소
    c.execute("DELETE FROM work_history WHERE content LIKE '%--- Git Fetch & Reset ---%'")
    c.execute("DELETE FROM work_history WHERE title LIKE '%??%'")
    c.execute("DELETE FROM work_history WHERE category LIKE '%?%'")
    
    conn.commit()
    conn.close()

def load_users_from_file():
    if os.path.exists(USERS_CONF_PATH):
        try:
            with open(USERS_CONF_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ JSON 로드 에러: {e}")
    # 파일이 없는 경우를 위한 로컬 개발용 폴백 계정 제공
    return {
        "admin": {
            "password": "admin",
            "folders": ["public", "private", "family"],
            "is_admin": True
        },
        "family": {
            "password": "family",
            "folders": ["public", "family"],
            "is_admin": False
        }
    }

# --- 화면 템플릿은 templates/index.html · templates/login.html 에 있다 ---
# 색·모서리·너비는 static/tokens.css 한 장에 모여 있고 두 화면이 같이 읽는다.
@app.route('/')
def index():
    token = request.cookies.get('auth_token')
    payload = verify_token(token, app.secret_key)
    username = payload.get('username') if payload else None
    is_admin = payload.get('is_admin', False) if payload else False
    return render_template('index.html', username=username, is_admin=is_admin)

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    next_url = request.args.get('next', '')
    
    # 이미 유효한 토큰이 있다면 next로 리다이렉트
    token = request.cookies.get('auth_token')
    payload = verify_token(token, app.secret_key)
    if payload:
        if next_url:
            # next_url에 token 파라미터 추가하여 스킴 격리 시에도 쿠키 주입 가능하게 함
            sep = '&' if '?' in next_url else '?'
            return redirect(f"{next_url}{sep}token={token}")
        return redirect(url_for('index'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        users = load_users_from_file()
        user = users.get(username)
        
        if user and user.get('password') == password:
            is_admin = user.get('is_admin', False)
            folders = user.get('folders', [])
            
            # SSO 토큰 생성 (folders 정보 주입)
            auth_token = generate_auth_token(username, app.secret_key, is_admin=is_admin, folders=folders)
            
            # 리다이렉트 응답 생성 (SSO 토큰 파라미터 추가)
            target_url = next_url if next_url else url_for('index')
            if next_url:
                sep = '&' if '?' in target_url else '?'
                target_url = f"{target_url}{sep}token={auth_token}"
            resp = redirect(target_url)
            
            # 쿠키 설정
            cookie_domain = None
            host = request.headers.get('Host', '')
            if 'onnamu.kr' in host:
                cookie_domain = '.onnamu.kr'
                
            resp.set_cookie(
                'auth_token',
                auth_token,
                domain=cookie_domain,
                httponly=True,
                samesite='Lax',
                max_age=30 * 24 * 3600  # 30일
            )
            return resp
        else:
            error = "아이디 또는 비밀번호가 틀렸습니다."
            
    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    next_url = request.args.get('next', '')
    resp = redirect(next_url if next_url else url_for('login'))
    
    # 캐시 무효화 헤더 주입
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    
    # auth_token 쿠키 만료 처리
    cookie_domain = None
    host = request.headers.get('Host', '')
    if 'onnamu.kr' in host:
        cookie_domain = '.onnamu.kr'
        
    resp.delete_cookie('auth_token', domain=cookie_domain)
    return resp

@app.route('/v1')
def renewal_v1(): return render_template('renewal_v1.html')

@app.route('/v2')
def renewal_v2(): return render_template('renewal_v2.html')

@app.route('/stats')
@login_required(admin_only=True)
def stats():
    cpu = psutil.cpu_percent(interval=None); ram = psutil.virtual_memory().percent
    try:
        disk_path = '/host_c' if os.path.exists('/host_c') else '/'
        disk = psutil.disk_usage(disk_path); disk_percent = disk.percent
        disk_detail = f"{disk.used/(1024**3):.1f} GB / {disk.total/(1024**3):.1f} GB"
    except Exception: disk_percent = 0; disk_detail = "Error"
    return jsonify(cpu=cpu, ram=ram, disk_percent=disk_percent, disk_detail=disk_detail)

@app.route('/api/news/save', methods=['POST'])
@login_required(admin_only=True)
def save_news():
    data = request.json
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("INSERT INTO news_archive (category, title, content, published_date) VALUES (?, ?, ?, ?)",
              (data.get('category'), data.get('title'), data.get('content'), data.get('date')))
    conn.commit(); conn.close()
    return jsonify(status="success")

@app.route('/api/news/get')
def get_news():
    date = request.args.get('date')
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT category, title, content FROM news_archive WHERE published_date = ?", (date,))
    rows = c.fetchall(); conn.close()
    return jsonify([{"category": r[0], "title": r[1], "content": r[2]} for r in rows])

@app.route('/api/news/events')
def get_news_events():
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT DISTINCT published_date FROM news_archive")
    rows = c.fetchall(); conn.close()
    return jsonify([{"date": r[0]} for r in rows])

@app.route('/api/work/save', methods=['POST'])
@login_required(admin_only=True)
def save_work():
    data = request.json
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("INSERT INTO work_history (category, title, content, work_date) VALUES (?, ?, ?, ?)",
              (data.get('category'), data.get('title'), data.get('content'), data.get('date')))
    conn.commit(); conn.close()
    return jsonify(status="success")

@app.route('/api/work/get')
def get_work():
    date = request.args.get('date')
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT category, title, content FROM work_history WHERE work_date = ?", (date,))
    rows = c.fetchall(); conn.close()
    return jsonify([{"category": r[0], "title": r[1], "content": r[2]} for r in rows])

@app.route('/api/work/events')
def get_work_events():
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT DISTINCT work_date FROM work_history")
    rows = c.fetchall(); conn.close()
    return jsonify([{"date": r[0]} for r in rows])

@app.route('/api/debug/deploy-log')
@login_required(admin_only=True)
def get_deploy_log():
    import os
    log_path = "/host_c/Users/onmis/project/deploy.log"
    if not os.path.exists(log_path):
        return f"Deploy log not found at: {log_path}", 404
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        return f"<pre style='background:#1e1e1e; color:#d4d4d4; padding:20px; font-family:monospace; line-height:1.5;'>{content}</pre>"
    except Exception as e:
        return f"Error reading log: {str(e)}", 500

WHOIS_ENDPOINTS = ('domain_name', 'ip_address', 'as_number')

@app.route('/api/whois/domain')
def whois_domain():
    """WHOIS Open API 중계 — 공공데이터포털은 Origin 헤더가 붙은 브라우저 직접 호출을 403으로 거절하므로
    포털 서버가 대신 호출해서 응답을 그대로 돌려준다.
    type 으로 조회 갈래(도메인/IP/AS번호)를 고른다."""
    import urllib.parse, urllib.request, urllib.error
    endpoint = request.args.get('type', 'domain_name')
    if endpoint not in WHOIS_ENDPOINTS:
        endpoint = 'domain_name'
    params = urllib.parse.urlencode({
        'serviceKey': request.args.get('serviceKey', ''),
        'query': request.args.get('query', ''),
        'answer': request.args.get('answer', 'json'),
    })
    url = "https://apis.data.go.kr/B551505/whois/" + endpoint + "?" + params
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return Response(res.read(), status=res.status,
                            content_type=res.headers.get('Content-Type', 'application/json'))
    except urllib.error.HTTPError as e:
        return Response(e.read(), status=e.code,
                        content_type=e.headers.get('Content-Type', 'application/json'))
    except Exception as e:
        return Response(json.dumps({"error": str(e)}), status=502, content_type='application/json')

if __name__ == '__main__':
    init_db(); app.run(host='0.0.0.0', port=5001)