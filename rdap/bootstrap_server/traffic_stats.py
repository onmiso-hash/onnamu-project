"""접속 기록을 읽어 '누가 무엇을 조회했나'로 모은다 — 이 서버의 통계 화면용.

기록을 남기는 쪽은 traffic_log.py이고, 이 파일은 읽기만 한다.

왜 따로 만들었나
----------------
원래 통계(manager.py의 stats.json)는 **시각이 없는 누적 합계** 한 벌이다.
서버가 켜진 뒤로 더하기만 하므로 기간을 나눌 수 없고, 사람이 왔는지 수집기가
훑고 갔는지도 담기지 않는다. 실제로 2026-08-27 하루를 세어 보니 요청 3,295건 중
3,134건이 실패였고, 도메인 조회 1,672건 가운데 1,669건이 그때는 지원하지 않던
.kr 주소였다 — 누적 합계로는 이 사실이 전혀 드러나지 않았다.

여기서 지키는 것 넷
-------------------
1. **한 줄씩 흘려 읽는다.** 파일을 통째로 메모리에 올리지 않는다. CPU가 1개뿐인
   기계라 30일치를 한 번에 올리면 조회 서비스가 같이 멈춘다.
2. **집계 결과를 잠시 보관한다.** 통계 화면이 주기적으로 새로 부르는데, 그때마다
   30일치를 다시 세면 그 자체가 부하가 된다.
3. **두 축으로 가른다.** '무엇을 하려 했나(조회·자료·화면·훑기)'와 '누가
   두드렸나(사람·프로그램·알 수 없음)'는 서로 다른 물음이라 한 갈래로 합치면
   "사람이 실제로 조회한 건수"를 뽑을 수 없다.
4. **모르는 것은 모른다고 둔다.** 접속 프로그램 이름표는 2026-08-28부터 기록하기
   시작했다. 그 이전 기록은 사람인지 기계인지 판단할 근거가 없으므로 '사람'도
   '프로그램'도 아닌 '알 수 없음'으로 따로 센다.
"""

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
TRAFFIC_DIR = os.environ.get("TRAFFIC_DIR", "/traffic")
SERVICE = "rdap"

# 집계 결과를 몇 초 동안 그대로 다시 내줄지. 통계 화면이 주기적으로 부르므로
# 이것이 없으면 화면을 열어 둔 사람 수만큼 30일치 훑기가 되풀이된다.
CACHE_SECONDS = 60

# 화면에 실어 보내는 목록의 줄 수 상한.
TOP_OBJECTS = 100
TOP_IPS = 200
TOP_AGENTS = 30
TOP_TLDS = 40

_cache = {}
_cache_lock = threading.Lock()


# ---------------------------------------------------------------------------
# 무엇을 하려 했나 — 경로로 가른다
# ---------------------------------------------------------------------------

# RDAP 표준이 정한 조회 종류. 경로의 첫 칸이 이것이면 조회 요청이다.
LOOKUP_KINDS = {
    "domain": "도메인",
    "nameserver": "네임서버",
    "ip": "IP주소",
    "autnum": "AS번호",
    "entity": "기관",
}

# 국제기구가 발행하는 목록 파일. 다른 RDAP 서버가 받아 가는 정상적인 이용이라
# 훑기로 세면 안 된다.
BOOTSTRAP_FILES = {"dns.json", "ipv4.json", "ipv6.json", "asn.json", "object-tags.json"}

# 사람이 브라우저로 여는 화면들.
PAGE_PATHS = {
    "/", "/dashboard", "/help", "/docs", "/redoc", "/openapi.json",
    "/rdap-about-ko.html", "/rdap-about-en.html",
    "/rdap-javascript-ko.html", "/rdap-javascript-en.html",
}

# 방문 신호(/api/page)는 우리 화면이 스스로 낸 요청이라 '훑기(우리에게 없는
# 자리를 찾아본 요청)'로 세면 안 된다 — 방문자 전원이 수집기로 보이던 것을
# 2026-09-04에 확인하고 갈라 두었다. 화면 목록과 달리 사람이 여는 자리가
# 아니라서, 사람 수를 세는 데 쓰지 않고 '화면'으로만 흘려보낸다.
# (통계 화면과 그 화면이 부르는 /api/stats/traffic·/api/visits/summary는
#  같은 날 main.py에서 아예 접속 기록에 안 남기게 바꿔, 여기 올 일이 없다.)
OWN_API_PATHS = {"/api/page"}


def classify_path(path):
    """(갈래, 조회종류, 조회대상)을 돌려준다.

    갈래는 넷 중 하나다: 조회 · 자료 · 화면 · 훑기.
    조회가 아니면 종류와 대상은 None이다.
    """
    p = path or "/"
    if p in PAGE_PATHS or p.startswith("/client/") or p in OWN_API_PATHS:
        return "화면", None, None

    parts = p.strip("/").split("/", 1)
    head = parts[0].lower()

    if head in LOOKUP_KINDS and len(parts) == 2 and parts[1]:
        # 대상 이름에 슬래시가 더 붙어 오는 일은 없다. 앞뒤 공백만 털어낸다.
        return "조회", head, parts[1].strip().lower()

    if head in BOOTSTRAP_FILES or (head + ".json") in BOOTSTRAP_FILES:
        return "자료", None, None

    return "훑기", None, None


# ---------------------------------------------------------------------------
# 누가 두드렸나 — 접속 프로그램 이름표로 가른다
# ---------------------------------------------------------------------------

# 이름표에 이 낱말이 들어 있으면 사람이 아니다. 브라우저를 사칭하는 수집기가
# 많아서 '브라우저처럼 생겼는가'보다 이쪽을 먼저 본다.
_MACHINE_MARKS = (
    "bot", "crawl", "spider", "slurp", "scraper", "scrapy", "fetcher",
    "curl", "wget", "libwww", "httpclient", "http-client", "okhttp", "axios",
    "python", "java/", "jakarta", "go-http", "go-resty", "node-fetch", "undici",
    "ruby", "perl", "powershell", "dart", "rust", "reqwest", "guzzle",
    "postman", "insomnia", "httpie", "restsharp", "urllib", "requests",
    "headless", "phantom", "selenium", "puppeteer", "playwright",
    "scanner", "nmap", "masscan", "zgrab", "censys", "shodan", "nuclei",
    "monitor", "uptime", "pingdom", "check_http", "newrelic", "datadog",
    "facebookexternalhit", "whatsapp", "telegram", "discord", "slackbot",
    "preview", "validator", "feed", "rss", "archive", "wayback",
)

# 이름표가 브라우저 모양인지. 위의 낱말이 하나도 없을 때만 본다.
_BROWSER_MARKS = ("chrome", "safari", "firefox", "edg/", "edge", "opera", "opr/",
                  "gecko", "trident", "webkit", "samsungbrowser", "whale")


def classify_agent(row):
    """'사람' · '프로그램' · '알수없음' 중 하나.

    'ua' 칸이 아예 없으면 이름표를 기록하기 전의 옛 줄이다 — 판단할 근거가 없으니
    프로그램으로 몰지 않고 '알수없음'에 둔다. 모르는 것을 기계로 처리하면 실제
    방문자 수가 조용히 사라지고, 사람으로 처리하면 없는 방문자가 생긴다.
    """
    if "ua" not in row:
        return "알수없음"

    ua = (row.get("ua") or "").strip().lower()
    if not ua:
        # 이름표를 아예 안 붙이고 오는 요청. 브라우저는 언제나 붙이므로 기계다.
        return "프로그램"
    if any(mark in ua for mark in _MACHINE_MARKS):
        return "프로그램"
    if any(mark in ua for mark in _BROWSER_MARKS):
        return "사람"
    # 브라우저 모양이 아닌 낯선 이름표. 사람이 쓰는 프로그램은 아니다.
    return "프로그램"


# ---------------------------------------------------------------------------
# 최상위 도메인 — 사람이 읽을 수 있는 모양으로
# ---------------------------------------------------------------------------

def tld_of(target):
    """조회 대상에서 최상위 도메인을 뽑고, 한글 주소는 한글로 되돌린다.

    .한국 같은 주소는 요청이 올 때 'xn--3e0b707e' 꼴로 바뀌어 도착한다.
    그대로 두면 화면에서 무엇인지 알아볼 수 없다.
    """
    if not target or "." not in target:
        return ""
    tld = target.rsplit(".", 1)[-1].strip(".")
    if not tld:
        return ""
    if tld.startswith("xn--"):
        try:
            return tld.encode("ascii").decode("idna")
        except Exception:
            return tld
    return tld


# ---------------------------------------------------------------------------
# 파일 고르기
# ---------------------------------------------------------------------------

def _files_for(days):
    """볼 날짜의 기록 파일들. days가 0이면 보관된 전부."""
    try:
        names = os.listdir(TRAFFIC_DIR)
    except Exception:
        return []

    prefix = SERVICE + "-"
    found = []
    wanted = None
    if days:
        today = datetime.now(KST).date()
        wanted = {(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)}

    for name in names:
        if not name.startswith(prefix) or not name.endswith(".jsonl"):
            continue
        stamp = name[len(prefix):-len(".jsonl")]
        if len(stamp) != 10:
            continue
        if wanted is not None and stamp not in wanted:
            continue
        found.append((stamp, os.path.join(TRAFFIC_DIR, name)))
    return sorted(found)


def _mask_ip(ip):
    """접속 주소의 마지막 칸을 가린다 — 로그인하지 않은 화면에 나갈 때 쓴다."""
    if ":" in ip:                       # IPv6
        head = ip.split(":")[:3]
        return ":".join(head) + ":…"
    parts = ip.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3]) + ".*"
    return ip


# ---------------------------------------------------------------------------
# 집계
# ---------------------------------------------------------------------------

def _blank_counts():
    return {"사람": 0, "프로그램": 0, "알수없음": 0}


def _summarize(days):
    """실제로 세는 부분. 접속 주소는 원문 그대로 담아 두고, 내보낼 때 가린다."""
    갈래 = {"조회": 0, "자료": 0, "화면": 0, "훑기": 0}
    조회_누가 = _blank_counts()
    화면_누가 = _blank_counts()
    조회_성패 = {"성공": 0, "실패": 0}
    조회_종류 = {}
    tld_표 = {}
    대상_사람 = {}
    대상_전체 = {}
    시간표 = {}
    나라별 = {}
    이름표별 = {}
    주소별 = {}
    처음, 마지막 = "", ""
    전체 = 0

    파일들 = _files_for(days)
    시간묶음 = len(파일들) <= 1

    for stamp, path in 파일들:
        try:
            fp = open(path, encoding="utf-8")
        except Exception:
            continue
        with fp:
            for raw in fp:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    row = json.loads(raw)
                except Exception:
                    continue   # 쓰다 만 줄 하나 때문에 화면 전체가 비면 안 된다

                전체 += 1
                t = row.get("t") or ""
                if t:
                    if not 처음 or t < 처음:
                        처음 = t
                    if t > 마지막:
                        마지막 = t

                갈래이름, 종류, 대상 = classify_path(row.get("path"))
                누가 = classify_agent(row)
                st = row.get("st") or 0
                성공 = bool(st) and st < 400
                ip = row.get("ip") or "(주소 없음)"

                갈래[갈래이름] = 갈래.get(갈래이름, 0) + 1

                묶음키 = (t[:13].replace("T", " ") if 시간묶음 else t[:10])
                if 묶음키:
                    칸 = 시간표.setdefault(묶음키, {"때": 묶음키, "조회": 0, "훑기": 0, "그밖": 0})
                    if 갈래이름 == "조회":
                        칸["조회"] += 1
                    elif 갈래이름 == "훑기":
                        칸["훑기"] += 1
                    else:
                        칸["그밖"] += 1

                # 접속 주소·나라·이름표는 훑기까지 포함해 전부 센다 —
                # "누가 얼마나 두드리나"를 보려면 훑기야말로 봐야 할 대상이다.
                자리 = 주소별.setdefault(ip, {
                    "주소": ip, "나라": row.get("cc") or "??", "도시": row.get("city") or "",
                    "요청": 0, "조회": 0, "훑기": 0, "누가": 누가,
                    "이름표": row.get("ua") or "", "처음": t, "마지막": t,
                })
                자리["요청"] += 1
                if 갈래이름 == "조회":
                    자리["조회"] += 1
                elif 갈래이름 == "훑기":
                    자리["훑기"] += 1
                if 자리["누가"] == "알수없음" and 누가 != "알수없음":
                    자리["누가"] = 누가
                if not 자리["이름표"] and row.get("ua"):
                    자리["이름표"] = row["ua"]
                if 자리["나라"] == "??" and row.get("cc"):
                    자리["나라"] = row["cc"]
                if not 자리["도시"] and row.get("city"):
                    자리["도시"] = row["city"]
                if t:
                    if not 자리["처음"] or t < 자리["처음"]:
                        자리["처음"] = t
                    if t > 자리["마지막"]:
                        자리["마지막"] = t

                나라 = row.get("cc") or "??"
                나라칸 = 나라별.setdefault(나라, {"나라": 나라, "요청": 0, "조회": 0, "주소": set()})
                나라칸["요청"] += 1
                나라칸["주소"].add(ip)

                # 이름표 칸이 없는 옛 줄은 이 표에 넣지 않는다 — 넣으면 이름표를
                # 기록하기 전의 요청이 전부 '(이름표 없음)' 한 줄로 뭉쳐, 실제로
                # 이름표를 안 붙이고 오는 기계와 구분되지 않는다.
                이름칸 = None
                if "ua" in row:
                    이름 = (row.get("ua") or "").strip() or "(이름표 없음)"
                    이름칸 = 이름표별.setdefault(
                        이름, {"이름표": 이름, "요청": 0, "조회": 0, "누가": 누가})
                    이름칸["요청"] += 1

                if 갈래이름 != "조회":
                    if 갈래이름 == "화면":
                        화면_누가[누가] = 화면_누가.get(누가, 0) + 1
                    continue

                # ── 여기서부터는 조회 요청만 ──
                조회_누가[누가] = 조회_누가.get(누가, 0) + 1
                나라칸["조회"] += 1
                if 이름칸 is not None:
                    이름칸["조회"] += 1

                조회_성패["성공" if 성공 else "실패"] += 1

                종류이름 = LOOKUP_KINDS.get(종류, 종류 or "기타")
                칸종류 = 조회_종류.setdefault(종류이름, {"종류": 종류이름, "성공": 0, "실패": 0})
                칸종류["성공" if 성공 else "실패"] += 1

                if 종류 in ("domain", "nameserver"):
                    tld = tld_of(대상)
                    if tld:
                        칸tld = tld_표.setdefault(tld, {"최상위": tld, "성공": 0, "실패": 0})
                        칸tld["성공" if 성공 else "실패"] += 1

                보이는대상 = 대상
                if 종류 in ("domain", "nameserver") and 대상 and "xn--" in 대상:
                    try:
                        보이는대상 = 대상.encode("ascii").decode("idna")
                    except Exception:
                        보이는대상 = 대상

                열쇠 = (종류이름, 보이는대상)
                칸대상 = 대상_전체.setdefault(열쇠, {
                    "종류": 종류이름, "대상": 보이는대상, "요청": 0, "성공": 0, "실패": 0,
                })
                칸대상["요청"] += 1
                칸대상["성공" if 성공 else "실패"] += 1
                if 누가 == "사람":
                    칸사람 = 대상_사람.setdefault(열쇠, {
                        "종류": 종류이름, "대상": 보이는대상, "요청": 0, "성공": 0, "실패": 0,
                    })
                    칸사람["요청"] += 1
                    칸사람["성공" if 성공 else "실패"] += 1

    나라목록 = sorted(
        ({"나라": v["나라"], "요청": v["요청"], "조회": v["조회"], "주소수": len(v["주소"])}
         for v in 나라별.values()),
        key=lambda d: -d["요청"],
    )

    return {
        "기간일수": days,
        "묶음": "시간" if 시간묶음 else "날짜",
        "보관일수": len(파일들),
        "처음기록": 처음,
        "마지막기록": 마지막,
        "전체요청": 전체,
        "갈래": 갈래,
        "조회": {
            "합계": 갈래.get("조회", 0),
            "성패": 조회_성패,
            "누가": 조회_누가,
            "종류별": sorted(조회_종류.values(), key=lambda d: -(d["성공"] + d["실패"])),
        },
        "화면누가": 화면_누가,
        "최상위도메인": sorted(tld_표.values(), key=lambda d: -(d["성공"] + d["실패"]))[:TOP_TLDS],
        "대상_사람": sorted(대상_사람.values(), key=lambda d: -d["요청"])[:TOP_OBJECTS],
        "대상_전체": sorted(대상_전체.values(), key=lambda d: -d["요청"])[:TOP_OBJECTS],
        "시간별": [시간표[k] for k in sorted(시간표)],
        "나라별": 나라목록,
        "이름표별": sorted(이름표별.values(), key=lambda d: -d["요청"])[:TOP_AGENTS],
        "_주소별": sorted(주소별.values(), key=lambda d: -d["요청"]),
        "보관함있음": os.path.isdir(TRAFFIC_DIR),
    }


def summarize(days=1, show_ips=False):
    """기간별 집계. show_ips가 거짓이면 접속 주소의 마지막 칸을 가려서 내보낸다."""
    now = time.time()
    with _cache_lock:
        cached = _cache.get(days)
        if cached and now - cached[0] < CACHE_SECONDS:
            데이터 = cached[1]
        else:
            데이터 = _summarize(days)
            _cache[days] = (now, 데이터)

    주소별 = 데이터["_주소별"]
    결과 = {k: v for k, v in 데이터.items() if k != "_주소별"}
    결과["주소공개"] = bool(show_ips)
    결과["주소수"] = len(주소별)
    결과["주소별"] = [
        dict(자리, 주소=(자리["주소"] if show_ips else _mask_ip(자리["주소"])))
        for 자리 in 주소별[:TOP_IPS]
    ]
    결과["주소별_잘림"] = max(0, len(주소별) - TOP_IPS)
    return 결과
