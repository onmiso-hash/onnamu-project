from flask import Flask, jsonify, render_template, request, redirect, url_for, make_response, Response, flash, g
from functools import wraps
import psutil
import sqlite3
import os
import re
import json
from werkzeug.security import generate_password_hash, check_password_hash
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
    # 계정 테이블 (2026-08-18 신설) — 원래 users.json에 평문으로 있던 계정이 여기로 옮겨온다
    c.execute('''CREATE TABLE IF NOT EXISTS accounts
                 (username TEXT PRIMARY KEY,
                  password_hash TEXT NOT NULL,
                  is_admin INTEGER DEFAULT 0,
                  adult_ok INTEGER DEFAULT 0,
                  folders TEXT DEFAULT '["public"]',
                  can_upload INTEGER DEFAULT 0,
                  locked INTEGER DEFAULT 0,
                  perm_version INTEGER DEFAULT 1,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  last_login_at DATETIME)''')

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

# --- 계정 저장소 ---
# users.json은 컨테이너에 읽기 전용으로 붙어 있어 원본에 이관 표시를 쓸 수 없다.
# 그래서 "표가 비어 있는가"를 이관 여부의 판정으로 쓴다 — 두 번 돌아도 덮어쓰지 않는다.
def migrate_users_once():
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM accounts")
    if c.fetchone()[0] > 0:
        conn.close(); return
    users = load_users_from_file()
    for username, u in users.items():
        is_admin = 1 if u.get('is_admin') else 0
        folders = u.get('folders', [])
        c.execute("""INSERT INTO accounts
                     (username, password_hash, is_admin, adult_ok, folders, can_upload)
                     VALUES (?, ?, ?, ?, ?, ?)""",
                  (username,
                   generate_password_hash(u.get('password', '')),
                   is_admin,
                   # 19금 열람: 지금 스튜디오가 관리자에게만 열려 있으므로 관리자만 참으로 옮긴다
                   is_admin,
                   json.dumps(folders),
                   # 지금 올릴 수 있던 계정(public 아닌 폴더 보유)은 그대로 올릴 수 있게 옮긴다
                   1 if [f for f in folders if f != 'public'] else 0))
    conn.commit(); conn.close()
    print(f"✅ 계정 이관 완료: {len(users)}개 (원본 users.json은 그대로 둔다)")

def get_account(username):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("""SELECT username, password_hash, is_admin, adult_ok, folders,
                        can_upload, locked, perm_version
                 FROM accounts WHERE username = ?""", (username,))
    row = c.fetchone(); conn.close()
    if not row:
        return None
    return {
        "username": row[0], "password_hash": row[1],
        "is_admin": bool(row[2]), "adult_ok": bool(row[3]),
        "folders": json.loads(row[4] or '[]'),
        "can_upload": bool(row[5]), "locked": bool(row[6]), "perm_version": row[7],
    }

def touch_last_login(username):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("UPDATE accounts SET last_login_at = CURRENT_TIMESTAMP WHERE username = ?", (username,))
    conn.commit(); conn.close()

# --- 계정 관리 ---
# 아이디는 스튜디오가 폴더 이름으로 그대로 쓴다(studio/store.js의 users/<아이디>/).
# 그래서 거기서 허용하는 글자(A-Za-z0-9_.@-)보다 좁게 잡는다 — 점과 @를 빼면
# 경로가 위로 올라가거나 폴더 자신을 가리키는 경우를 생각할 필요가 아예 없어진다.
USERNAME_RE = re.compile(r'^[A-Za-z0-9_-]{2,32}$')
ALLOWED_FOLDERS = ("public", "private", "family")

def list_accounts():
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("""SELECT username, is_admin, adult_ok, folders, can_upload, locked,
                        perm_version, created_at, last_login_at
                 FROM accounts ORDER BY is_admin DESC, username""")
    rows = c.fetchall(); conn.close()
    return [{
        "username": r[0], "is_admin": bool(r[1]), "adult_ok": bool(r[2]),
        "folders": json.loads(r[3] or '[]'), "can_upload": bool(r[4]),
        "locked": bool(r[5]), "perm_version": r[6],
        "created_at": r[7], "last_login_at": r[8],
    } for r in rows]

def count_admins(exclude=None):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    if exclude:
        c.execute("SELECT COUNT(*) FROM accounts WHERE is_admin = 1 AND locked = 0 AND username != ?", (exclude,))
    else:
        c.execute("SELECT COUNT(*) FROM accounts WHERE is_admin = 1 AND locked = 0")
    n = c.fetchone()[0]; conn.close()
    return n

def clean_folders(raw):
    """화면에서 온 폴더 목록을 허용된 것만 남기고 정해진 차례로 돌려준다."""
    picked = set(raw or [])
    return [f for f in ALLOWED_FOLDERS if f in picked]

def create_account(username, password, is_admin, adult_ok, folders, can_upload):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("""INSERT INTO accounts (username, password_hash, is_admin, adult_ok, folders, can_upload)
                 VALUES (?, ?, ?, ?, ?, ?)""",
              (username, generate_password_hash(password),
               1 if is_admin else 0, 1 if adult_ok else 0,
               json.dumps(folders), 1 if can_upload else 0))
    conn.commit(); conn.close()

def update_account_perms(username, is_admin, adult_ok, folders, can_upload):
    # 권한을 바꿀 때마다 도장 번호를 올린다 — 3묶음에서 각 서비스가 이 번호로
    # "내가 든 출입증이 낡았는가"를 판정한다.
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("""UPDATE accounts
                 SET is_admin = ?, adult_ok = ?, folders = ?, can_upload = ?,
                     perm_version = perm_version + 1
                 WHERE username = ?""",
              (1 if is_admin else 0, 1 if adult_ok else 0,
               json.dumps(folders), 1 if can_upload else 0, username))
    conn.commit(); conn.close()

def set_locked(username, locked):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("UPDATE accounts SET locked = ?, perm_version = perm_version + 1 WHERE username = ?",
              (1 if locked else 0, username))
    conn.commit(); conn.close()

def set_password(username, password):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("UPDATE accounts SET password_hash = ? WHERE username = ?",
              (generate_password_hash(password), username))
    conn.commit(); conn.close()

def delete_account(username):
    conn = sqlite3.connect(DB_PATH); c = conn.cursor()
    c.execute("DELETE FROM accounts WHERE username = ?", (username,))
    conn.commit(); conn.close()

def delete_studio_data(username):
    """Chronicle AI에 있는 그 사람의 인물·대화 폴더를 지운다.
    스튜디오는 다른 컨테이너라 HTTP로 부른다 — 출입증은 포털이 직접 만들어 붙인다
    (두 서비스가 같은 SECRET_KEY를 쓰므로 스튜디오가 그대로 알아본다).
    돌려주는 값: (성공 여부, 사람이 읽을 설명)"""
    import urllib.request, urllib.error
    base = os.environ.get("STUDIO_URL", "http://host.docker.internal:8080")
    token = generate_auth_token("system_portal", app.secret_key, is_admin=True, folders=[])
    req = urllib.request.Request(
        f"{base}/api/admin/user-data/{username}",
        method="DELETE",
        headers={"Cookie": f"auth_token={token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            body = json.loads(res.read().decode('utf-8') or '{}')
            return True, body.get('message', '지웠습니다.')
    except urllib.error.HTTPError as e:
        return False, f"Chronicle AI가 거절했습니다 ({e.code})"
    except Exception as e:
        return False, f"Chronicle AI에 닿지 못했습니다 ({e})"

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
        
        account = get_account(username)

        if account and account['locked']:
            return render_template('login.html',
                                   error="잠긴 계정입니다. 관리자에게 문의하세요.")

        if account and check_password_hash(account['password_hash'], password):
            is_admin = account['is_admin']
            folders = account['folders']
            touch_last_login(username)

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

# =====================================================================
# 계정 관리 화면 (관리자 전용)
# =====================================================================

def account_admin_required(fn):
    """관리자 전용 + API 열쇠 우회 차단 + 표에 살아 있는 계정인지 확인.
    출입증에 박힌 is_admin만 믿으면 이미 지워졌거나 잠긴 관리자도 통과한다
    (출입증이 30일짜리라서). 계정 관리만은 표를 직접 본다."""
    @wraps(fn)
    @login_required(admin_only=True, allow_api_key=False)
    def wrapper(*args, **kwargs):
        me = get_account(g.user.get('username'))
        if not me or me['locked'] or not me['is_admin']:
            return "⛔ 이 계정은 더 이상 관리자가 아닙니다. 다시 로그인하세요.", 403
        g.me = me
        return fn(*args, **kwargs)
    return wrapper

@app.route('/admin/accounts')
@account_admin_required
def admin_accounts():
    return render_template('accounts.html',
                           accounts=list_accounts(),
                           me=g.me['username'],
                           all_folders=ALLOWED_FOLDERS)

@app.route('/admin/accounts/create', methods=['POST'])
@account_admin_required
def admin_accounts_create():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '')

    if not USERNAME_RE.match(username):
        flash("아이디는 영문·숫자·밑줄·붙임표만 쓸 수 있고 2~32글자여야 합니다.", "error")
    elif len(password) < 4:
        flash("비밀번호는 4글자 이상이어야 합니다.", "error")
    elif get_account(username):
        flash(f"'{username}'은 이미 있는 아이디입니다.", "error")
    else:
        # 새 계정 기본값 — 볼 폴더는 public만, 나머지는 전부 꺼짐 (설계 확정)
        create_account(username, password,
                       is_admin=False, adult_ok=False,
                       folders=["public"], can_upload=False)
        flash(f"'{username}' 계정을 만들었습니다. 볼 수 있는 폴더는 public 하나입니다.", "ok")
    return redirect(url_for('admin_accounts'))

@app.route('/admin/accounts/update', methods=['POST'])
@account_admin_required
def admin_accounts_update():
    username = request.form.get('username', '').strip()
    account = get_account(username)
    if not account:
        flash("그런 계정이 없습니다.", "error")
        return redirect(url_for('admin_accounts'))

    is_admin = bool(request.form.get('is_admin'))
    folders = clean_folders(request.form.getlist('folders'))

    # 자기 자신의 관리자 표시를 스스로 떼면 관리 화면에서 잠겨 나온다.
    if username == g.me['username'] and not is_admin:
        flash("자기 자신의 관리자 표시는 뗄 수 없습니다.", "error")
    elif account['is_admin'] and not is_admin and count_admins(exclude=username) == 0:
        flash("마지막 관리자입니다. 관리자 표시를 뗄 수 없습니다.", "error")
    else:
        update_account_perms(username, is_admin,
                             adult_ok=bool(request.form.get('adult_ok')),
                             folders=folders,
                             can_upload=bool(request.form.get('can_upload')))
        flash(f"'{username}'의 권한을 바꿨습니다. 갤러리·Chronicle AI에는 다시 로그인해야 반영됩니다.", "ok")
    return redirect(url_for('admin_accounts'))

@app.route('/admin/accounts/lock', methods=['POST'])
@account_admin_required
def admin_accounts_lock():
    username = request.form.get('username', '').strip()
    account = get_account(username)
    if not account:
        flash("그런 계정이 없습니다.", "error")
    elif username == g.me['username']:
        flash("자기 자신은 잠글 수 없습니다.", "error")
    elif not account['locked'] and account['is_admin'] and count_admins(exclude=username) == 0:
        flash("마지막 관리자입니다. 잠그면 아무도 관리 화면에 들어올 수 없습니다.", "error")
    else:
        set_locked(username, not account['locked'])
        flash(f"'{username}' 계정을 {'잠갔습니다' if not account['locked'] else '풀었습니다'}.", "ok")
    return redirect(url_for('admin_accounts'))

@app.route('/admin/accounts/reset', methods=['POST'])
@account_admin_required
def admin_accounts_reset():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '')
    if not get_account(username):
        flash("그런 계정이 없습니다.", "error")
    elif len(password) < 4:
        flash("비밀번호는 4글자 이상이어야 합니다.", "error")
    else:
        set_password(username, password)
        flash(f"'{username}'의 비밀번호를 바꿨습니다. 그 사람에게 직접 알려주세요.", "ok")
    return redirect(url_for('admin_accounts'))

@app.route('/admin/accounts/delete', methods=['POST'])
@account_admin_required
def admin_accounts_delete():
    username = request.form.get('username', '').strip()
    typed = request.form.get('confirm_username', '').strip()
    wipe_studio = bool(request.form.get('wipe_studio'))
    account = get_account(username)

    if not account:
        flash("그런 계정이 없습니다.", "error")
    elif typed != username:
        flash("확인란에 적은 아이디가 다릅니다. 지우지 않았습니다.", "error")
    elif username == g.me['username']:
        flash("자기 자신은 지울 수 없습니다.", "error")
    elif account['is_admin'] and count_admins(exclude=username) == 0:
        flash("마지막 관리자입니다. 지우면 아무도 관리 화면에 들어올 수 없습니다.", "error")
    else:
        note = ""
        if wipe_studio:
            ok, msg = delete_studio_data(username)
            note = (" Chronicle AI 자료도 지웠습니다." if ok
                    else f" 다만 Chronicle AI 자료는 지우지 못했습니다 — {msg}")
        delete_account(username)
        flash(f"'{username}' 계정을 지웠습니다.{note} 갤러리에 올린 파일은 남아 있습니다.", "ok")
    return redirect(url_for('admin_accounts'))

# =====================================================================
# 내 계정 — 비밀번호 바꾸기 (관리자가 아니어도 쓴다)
# =====================================================================

@app.route('/account', methods=['GET', 'POST'])
@login_required(allow_api_key=False)
def my_account():
    me = get_account(g.user.get('username'))
    if not me:
        return "⛔ 이 계정은 더 이상 없습니다. 다시 로그인하세요.", 403

    if request.method == 'POST':
        current = request.form.get('current_password', '')
        new = request.form.get('new_password', '')
        again = request.form.get('new_password_again', '')

        if not check_password_hash(me['password_hash'], current):
            flash("지금 비밀번호가 틀렸습니다.", "error")
        elif len(new) < 4:
            flash("새 비밀번호는 4글자 이상이어야 합니다.", "error")
        elif new != again:
            flash("새 비밀번호 두 칸이 서로 다릅니다.", "error")
        else:
            set_password(me['username'], new)
            flash("비밀번호를 바꿨습니다.", "ok")
        return redirect(url_for('my_account'))

    return render_template('account.html', account=me)

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
    init_db(); migrate_users_once(); app.run(host='0.0.0.0', port=5001)