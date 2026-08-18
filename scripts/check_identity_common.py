# -*- coding: utf-8 -*-
"""신분·권한 공통 규칙 검사 — 어긋나면 push를 막는다.

2026-08-18 갤러리 사고의 반복 결함은 "같은 규칙이 두 벌로 복사돼 한쪽만 고쳐진다"였다.
그래서 규칙을 shared/auth_common.py 한 벌로 모으고, 여기서 세 가지를 잰다.

  1) 사본이 원본과 글자까지 같은가        (도커 때문에 사본이 필요하다)
  2) 서비스가 규칙을 몰래 다시 만들지 않는가
  3) 규칙이 실제로 그렇게 동작하는가      (코드를 읽는 게 아니라 돌려서 잰다)

돌리기: python scripts/check_identity_common.py
"""
import io
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET = "test-secret-key-for-identity-check"

TOTAL = [0]
FAILED = []


def check(name, expected, actual):
    TOTAL[0] += 1
    if expected == actual:
        print(f"  통과 — {name}")
    else:
        print(f"  실패 — {name}\n         바란 값: {expected}\n         나온 값: {actual}")
        FAILED.append(name)


print("신분·권한 공통 규칙 검사")

# ---------------------------------------------------------------------------
# 1) 사본이 원본과 같은가
# ---------------------------------------------------------------------------
origin = io.open(os.path.join(ROOT, 'shared', 'auth_common.py'), encoding='utf-8').read()
for svc in ('portal', 'gallery'):
    path = os.path.join(ROOT, svc, 'auth_common.py')
    copy = io.open(path, encoding='utf-8').read() if os.path.exists(path) else None
    check(f"{svc}의 사본이 원본과 글자까지 같다 (다르면 scripts/sync_auth_common.sh)",
          True, copy == origin)

# ---------------------------------------------------------------------------
# 2) 규칙을 몰래 다시 만든 자리가 없는가
# ---------------------------------------------------------------------------
# 출입증을 만들고 검사하는 규칙은 원본에만 있어야 한다.
# (신분·권한 판정은 얇게 감싸는 것이 정상이라 이름만으로는 막지 않는다.)
offenders = []
for svc in ('portal', 'gallery'):
    for fname in os.listdir(os.path.join(ROOT, svc)):
        if not fname.endswith('.py') or fname == 'auth_common.py':
            continue
        src = io.open(os.path.join(ROOT, svc, fname), encoding='utf-8').read()
        for banned in ('def verify_token', 'def generate_auth_token'):
            if banned in src:
                offenders.append(f"{svc}/{fname}: {banned}")
check("출입증 검사·발급을 서비스가 따로 만든 자리가 없다", [], offenders)

# 쿠키를 직접 읽는 자리 — 신분 판정을 우회하는 통로가 되살아나지 않는가.
raw_cookie = []
for svc in ('portal', 'gallery'):
    for fname in os.listdir(os.path.join(ROOT, svc)):
        if not fname.endswith('.py') or fname == 'auth_common.py':
            continue
        for i, line in enumerate(
                io.open(os.path.join(ROOT, svc, fname), encoding='utf-8').read().splitlines(), 1):
            if "cookies.get('auth_token')" in line or 'cookies.get("auth_token")' in line:
                raw_cookie.append(f"{svc}/{fname}:{i}")
check("공용 출입증을 신분 판정 밖에서 직접 읽는 자리가 없다", [], raw_cookie)

# ---------------------------------------------------------------------------
# 3) 포털이 '지금 권한 묻기'를 실제로 꽂아 두었는가
#    (아래 4)에서는 검사용 표를 우리가 직접 꽂는다. 그래서 app.py가 진짜로
#     꽂았는지는 여기서 따로 재야 한다 — 안 그러면 배선이 빠져도 검사가 통과한다.)
# ---------------------------------------------------------------------------
WIRING_PROBE = (
    "import sys, json; sys.path.insert(0, %r); "
    "import app, auth_helper; "
    "src = auth_helper._permission_source; "
    "print(json.dumps({'wired': src is not None, "
    "'name': getattr(src, '__name__', None)}))"
) % os.path.join(ROOT, 'portal')
try:
    out = subprocess.run([sys.executable, '-c', WIRING_PROBE],
                         cwd=os.path.join(ROOT, 'portal'),
                         capture_output=True, text=True, timeout=60)
    wiring = json.loads(out.stdout.strip().splitlines()[-1]) if out.stdout.strip() else {}
except Exception as e:
    wiring = {"error": str(e)}
check("포털이 지금 권한 묻기를 실제로 꽂아 두었다 (app.py의 set_permission_source)",
      (True, 'account_permissions'), (wiring.get('wired'), wiring.get('name')))

# ---------------------------------------------------------------------------
# 4) 실제로 그렇게 동작하는가 — 포털
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(ROOT, 'portal'))
from flask import Flask                      # noqa: E402
import auth_helper as portal_auth            # noqa: E402
from auth_common import generate_auth_token  # noqa: E402

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET
app.secret_key = SECRET


@app.route('/admin-only')
@portal_auth.login_required(admin_only=True)
def admin_only():
    from flask import g
    return f"ok:{g.user.get('username')}"


PERMS = {}
portal_auth.set_permission_source(lambda u: PERMS.get(u, {"exists": False}))


def tok(user, admin=True):
    return generate_auth_token(user, SECRET, is_admin=admin, folders=["public"])


def call(path, cookies=None, headers=None):
    """출입증은 쿠키 통에 넣는다 — 헤더로 직접 붙이면 시험용 손님이 덮어쓴다."""
    with app.test_client() as c:
        for k, v in (cookies or {}).items():
            c.set_cookie(k, v, domain="localhost")
        return c.get(path, headers=headers or {})


# (가) 출입증에는 관리자라고 적혀 있지만 표에서는 내려간 사람
PERMS['demoted'] = {"exists": True, "username": "demoted", "is_admin": False,
                    "adult_ok": False, "folders": ["public"], "can_upload": False,
                    "locked": False, "perm_version": 2}
r = call('/admin-only', {"auth_token": tok('demoted')})
check("관리자에서 내린 사람은 옛 출입증으로도 막힌다 (포털)", 403, r.status_code)

# (나) 표에 살아 있는 관리자는 그대로 통과
PERMS['boss'] = {"exists": True, "username": "boss", "is_admin": True,
                 "adult_ok": True, "folders": ["public", "private"], "can_upload": True,
                 "locked": False, "perm_version": 1}
r = call('/admin-only', {"auth_token": tok('boss')})
check("표에 살아 있는 관리자는 통과한다 (포털)", (200, b"ok:boss"), (r.status_code, r.data))

# (다) 잠긴 계정은 로그인으로 돌려보낸다
PERMS['jailed'] = dict(PERMS['boss'], username="jailed", locked=True)
r = call('/admin-only', {"auth_token": tok('jailed')})
check("잠근 계정은 옛 출입증으로 못 들어온다 (포털)", True, r.status_code in (301, 302))

# (라) 지워진 계정도 마찬가지
r = call('/admin-only', {"auth_token": tok('ghost')})
check("지운 계정은 옛 출입증으로 못 들어온다 (포털)", True, r.status_code in (301, 302))

# (마) 신분은 공용 출입증만이 답한다 — 갤러리 사본을 들이밀어도 안 본다
r = call('/admin-only', {"gallery_auth_token": tok('boss')})
check("갤러리 사본만으로는 포털에 들어가지 못한다", True, r.status_code in (301, 302))

# (바) 기계 출입증은 계정표에 없어도 통과한다 (배포 자동화가 이것으로 기록을 남긴다)
r = call('/admin-only', {"auth_token": tok('system_portal')})
check("기계 출입증(system_)은 계정표에 없어도 통과한다 (포털)",
      (200, b"ok:system_portal"), (r.status_code, r.data))

# (사) 열쇠 우회도 그대로 산다
r = call('/admin-only', {}, {"X-API-Key": SECRET})
check("배포 열쇠 우회가 그대로 산다 (포털)", 200, r.status_code)

# ---------------------------------------------------------------------------
# 5) 실제로 그렇게 동작하는가 — 스튜디오(다른 언어라 사본 대조가 안 된다)
# ---------------------------------------------------------------------------
NODE_PROBE = r'''
const path = require('path');
const { authMiddleware, isMachineIdentity } = require(process.argv[2]);
const crypto = require('crypto');
const SECRET = process.argv[3];
function mint(username) {
  const p = Buffer.from(JSON.stringify({ username, exp: Math.floor(Date.now()/1000)+3600,
    is_admin: true, folders: [] })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(p).digest('hex');
  return p + '.' + sig;
}
process.env.SECRET_KEY = SECRET;
// 포털에 닿을 수 없는 자리로 돌려 '못 물었다'를 만든다.
process.env.PORTAL_INTERNAL_URL = 'http://127.0.0.1:1';
const mw = authMiddleware({ adminOnly: true });
function run(username) {
  return new Promise(resolve => {
    const req = { path: '/api/user-info', originalUrl: '/api/user-info',
                  headers: { cookie: 'auth_token=' + mint(username), host: 'x' } };
    const res = { status(c) { this._c = c; return this; },
                  json() { resolve(this._c); }, send() { resolve(this._c); },
                  redirect() { resolve(302); } };
    mw(req, res, () => resolve(200));
  });
}
(async () => {
  const machine = await run('system_portal');
  const human = await run('nobody');
  console.log(JSON.stringify({ machine, human, hasRule: isMachineIdentity('system_x') === true
                               && isMachineIdentity('bob') === false }));
})();
'''
probe_path = os.path.join(ROOT, 'temp', '_identity_probe.js')
os.makedirs(os.path.dirname(probe_path), exist_ok=True)
io.open(probe_path, 'w', encoding='utf-8').write(NODE_PROBE)
try:
    out = subprocess.run(
        ['node', probe_path, os.path.join(ROOT, 'studio', 'authHelper.js'), SECRET],
        capture_output=True, text=True, timeout=30)
    result = json.loads(out.stdout.strip().splitlines()[-1]) if out.stdout.strip() else {}
except Exception as e:
    result = {"error": str(e)}
finally:
    try:
        os.remove(probe_path)
    except OSError:
        pass

check("스튜디오도 기계 신분 규칙을 같이 쓴다", True, result.get('hasRule'))
check("스튜디오가 기계 출입증을 받아들인다 (계정 지우기가 여기로 온다)",
      200, result.get('machine'))
check("스튜디오는 사람 출입증은 포털에 못 물으면 옛 값으로 버틴다",
      200, result.get('human'))

print()
if FAILED:
    print(f"❌ {len(FAILED)}건 실패 — 배포하면 안 됩니다.")
    for n in FAILED:
        print(f"   · {n}")
    sys.exit(1)
print(f"✅ {TOTAL[0]}개 항목 모두 통과")
