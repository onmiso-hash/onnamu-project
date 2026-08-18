#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""갤러리 신분 검사 — "출입증에 적힌 사람"이 아니라 "지금 로그인한 사람"으로 들어가는가.

왜 있나 (2026-08-18 사고):
  갤러리만 자기 전용 출입증(gallery_auth_token)을 30일짜리로 따로 들고 있었다.
  admin으로 한 번 들어간 브라우저에서 guest1로 로그인해 갤러리를 열면, 갤러리는
  자기 주머니 속 admin 표를 그대로 읽어 private/family 433개를 전부 내줬다.
  그 전 검사들은 전부 "출입증이 올바를 때 권한이 맞는가"만 봤고,
  "출입증 자체가 다른 사람 것일 때"는 한 번도 재지 않았다. 그래서 이 검사를 만든다.

배포 전에 자동으로 돈다. 하나라도 깨지면 푸시가 막힌다.
"""
import io, os, re, sys, json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gallery'))

from flask import Flask, g
import auth_helper
from auth_helper import login_required, generate_auth_token

SECRET = "test-secret-for-identity-check"

# 포털에 묻는 부분을 흉내낸다 — 이 검사는 네트워크를 쓰지 않는다.
ACCOUNTS = {
    "admin":  {"exists": True, "is_admin": True,  "adult_ok": True,
               "folders": ["public", "private", "family"], "can_upload": True,
               "locked": False, "perm_version": 1},
    "guest1": {"exists": True, "is_admin": False, "adult_ok": False,
               "folders": ["public"], "can_upload": False,
               "locked": False, "perm_version": 1},
}
auth_helper.fetch_permissions = lambda username, secret: ACCOUNTS.get(username)

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET
app.config['PORTAL_URL'] = 'https://onnamu.kr'

@app.route("/")
@login_required()
def whoami():
    return json.dumps({"username": g.user.get("username"),
                       "folders": g.user.get("folders", []),
                       "is_admin": g.user.get("is_admin", False)})

def tok(user, admin, folders):
    return generate_auth_token(user, SECRET, is_admin=admin, folders=folders)

ADMIN_TOK  = tok("admin",  True,  ["public", "private", "family"])
GUEST1_TOK = tok("guest1", False, ["public"])

FAILED = []
TOTAL = [0]

def check(name, expect, got):
    TOTAL[0] += 1
    if expect == got:
        print(f"  통과 — {name}")
    else:
        print(f"  실패 — {name}\n      기대: {expect}\n      실제: {got}")
        FAILED.append(name)

def call(path, cookies, host="gallery.onnamu.kr"):
    with app.test_client() as c:
        for k, v in cookies.items():
            c.set_cookie(k, v, domain=host.split(':')[0])
        return c.get(path, headers={"Host": host})

print("갤러리 신분 검사")

# 1) 핵심 — 갤러리 표는 admin, 지금 로그인한 사람은 guest1.
r = call("/", {"gallery_auth_token": ADMIN_TOK, "auth_token": GUEST1_TOK})
body = json.loads(r.data) if r.status_code == 200 else {}
check("다른 사람 출입증이 남아 있어도 지금 로그인한 사람으로 들어간다",
      ("guest1", ["public"], False),
      (body.get("username"), body.get("folders"), body.get("is_admin")))

# 2) 갤러리 표가 아예 없어도 공용 출입증만으로 들어간다.
r = call("/", {"auth_token": GUEST1_TOK})
body = json.loads(r.data) if r.status_code == 200 else {}
check("갤러리 표가 없어도 공용 출입증으로 들어간다", "guest1", body.get("username"))

# 3) 정상 — 둘이 같은 사람.
r = call("/", {"gallery_auth_token": ADMIN_TOK, "auth_token": ADMIN_TOK})
body = json.loads(r.data) if r.status_code == 200 else {}
check("본인 출입증이면 그대로 들어간다",
      ("admin", ["public", "private", "family"]),
      (body.get("username"), body.get("folders")))

# 4) 로그아웃 상태 — 갤러리 표만 남았다. 절대로 들어가면 안 된다.
r = call("/", {"gallery_auth_token": ADMIN_TOK})
check("로그아웃했으면 남은 갤러리 표로 못 들어간다 (로그인으로 보냄)",
      True, r.status_code in (301, 302) and "/login" in r.headers.get("Location", ""))

# 5) 손잡기를 이미 한 번 했는데도 공용 출입증이 없다 — 무한 왕복 대신 멈춘다.
r = call("/?sso=1", {"gallery_auth_token": ADMIN_TOK})
check("손잡기 뒤에도 확인 못 하면 왕복하지 않고 막는다", 403, r.status_code)

# 6) 집 안에서 IP로 직접 들어오는 길은 종전대로 (공용 출입증이 오지 않는 구역).
r = call("/", {"gallery_auth_token": ADMIN_TOK}, host="172.30.1.100:5002")
body = json.loads(r.data) if r.status_code == 200 else {}
check("집 안 IP 접속은 종전대로 갤러리 표를 쓴다", "admin", body.get("username"))

# 7) 손잡기 되돌아올 때 sso 표시가 살아남는가 (살아남지 않으면 5번이 영영 안 걸린다).
r = call(f"/?sso=1&token={GUEST1_TOK}", {})
loc = r.headers.get("Location", "")
check("손잡기 뒤 되돌아가는 주소에 sso 표시가 남는다", True,
      r.status_code in (301, 302) and "sso=1" in loc and "token=" not in loc)

# 8) 신분 판정 규칙 자체 — 화면이 아닌 자리(청크 업로드)도 이 함수를 쓴다.
from auth_helper import current_identity
with app.test_request_context("/", headers={"Host": "gallery.onnamu.kr"},
                              environ_base={"HTTP_COOKIE": f"gallery_auth_token={ADMIN_TOK}; auth_token={GUEST1_TOK}"}):
    who, refresh, unknown = current_identity(SECRET)
    check("신분 판정 함수도 지금 로그인한 사람을 돌려준다",
          ("guest1", True, False),
          (who.get("username") if who else None, refresh is not None, unknown))

with app.test_request_context("/", headers={"Host": "gallery.onnamu.kr"},
                              environ_base={"HTTP_COOKIE": f"gallery_auth_token={ADMIN_TOK}"}):
    who, refresh, unknown = current_identity(SECRET)
    check("로그아웃 상태면 신분 판정 함수가 '확인불가'를 돌려준다", (None, True), (who, unknown))

# 9) 구조 검사 — 갤러리 표를 신분으로 직접 읽는 자리가 되살아나지 않는가.
#    이 사고는 '한 곳은 고쳤는데 다른 곳이 옛 방식으로 남아' 생겼다. 소스를 직접 훑는다.
src_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gallery', 'app.py')
offenders = []
for i, line in enumerate(io.open(src_path, encoding='utf-8').read().splitlines(), 1):
    if "cookies.get('gallery_auth_token')" in line or 'cookies.get("gallery_auth_token")' in line:
        offenders.append(f"app.py:{i}")
check("갤러리 표를 신분으로 직접 읽는 자리가 없다 (있으면 그 줄 번호)", [], offenders)

print()
if FAILED:
    print(f"❌ {len(FAILED)}건 실패 — 배포하면 안 됩니다.")
    for n in FAILED:
        print(f"   · {n}")
    sys.exit(1)
print(f"✅ {TOTAL[0]}개 항목 모두 통과")
