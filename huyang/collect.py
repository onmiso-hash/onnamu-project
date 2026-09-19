# -*- coding: utf-8 -*-
"""자연휴양림 빈자리 모으기.

숲나들e는 '지역 하나 + 날짜 하나'씩만 검색을 받는다. 그래서 권역 9개와
밤 하나하나를 돌며 한 번씩 조회하고, 그 결과를 파일 한 장에 담는다.

브라우저를 그대로 띄워 쓰는 이유는 검색에 대기열 장치가 걸려 있어서다.
장치가 발급하는 표 없이 주소만 두드리면 '비정상적인 접근'으로 거절당한다.
표를 위조하지 않고 브라우저가 평소 받는 방식 그대로 받는다.

사이트에 부담을 주지 않도록 조회 사이를 쉬고, 한 번에 한 건씩만 보낸다.
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ENV_PATH = pathlib.Path(r"C:\Users\onmis\project\gallery\.env")
OUT_PATH = pathlib.Path(r"C:\Users\onmis\project\huyang_data\availability.json")
BASE = "https://www.foresttrip.go.kr"
MAIN = BASE + "/rep/or/fcfsRsrvtMain.do?hmpgId=FRIP&menuId=001001"

REGIONS = {
    "1": "서울/인천/경기", "2": "강원", "3": "충북", "4": "대전/충남",
    "5": "전북", "6": "전남/광주", "7": "대구/경북", "8": "부산/경남",
    "9": "제주",
}

# 조회 사이 쉬는 시간(초). 사람이 누르는 속도보다 느리게 잡았다.
PAUSE = 3.0


def read_credentials():
    raw = ENV_PATH.read_bytes().decode("utf-8", "replace")
    cfg = {}
    for line in raw.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip()
    uid, pw = cfg.get("HUYANG_ID"), cfg.get("HUYANG_PW")
    if not (uid and pw):
        raise SystemExit("HUYANG_ID / HUYANG_PW 가 .env 에 없다")
    return uid, pw


def target_nights(weekend_only=True, limit=None):
    """오늘부터 다음 달 말일까지. 숲나들e가 여는 범위가 딱 그만큼이다."""
    today = dt.date.today()
    if today.month == 12:
        end = dt.date(today.year + 1, 1, 31)
    else:
        nxt = today.month + 1
        year = today.year
        if nxt == 12:
            end = dt.date(year, 12, 31)
        else:
            end = dt.date(year, nxt + 1, 1) - dt.timedelta(days=1)
    out = []
    d = today
    while d <= end:
        # 4=금, 5=토
        if (not weekend_only) or d.weekday() in (4, 5):
            out.append(d)
        d += dt.timedelta(days=1)
    return out[:limit] if limit else out


def parse_available(html):
    """결과 화면에서 '[예약가능]'이 붙은 휴양림만 뽑는다.

    한 칸의 생김새는 이렇다:
        <div class="rc_ti"><i>[예약가능]</i><b>[국립](홍천군)삼봉자연휴양림</b></div>
    표시가 없는 칸은 그날 빈자리가 없는 곳이라 건너뛴다.
    """
    body = re.sub(r"(?is)<script.*?</script>", " ", html)
    rows = []
    for block in re.findall(r'(?is)<div class="rc_ti">(.*?)</div>', body):
        label = re.search(r"(?is)<i>\s*(.*?)\s*</i>", block)
        name = re.search(r"(?is)<b>\s*(.*?)\s*</b>", block)
        if not (label and name):
            continue
        if "가능" not in re.sub(r"<[^>]+>", "", label.group(1)):
            continue
        full = re.sub(r"<[^>]+>", "", name.group(1)).strip()
        m = re.match(r"\[(국립|공립|사립)\]\s*(?:\(([^)]*)\))?\s*(.*)$", full)
        rows.append({
            "tier": m.group(1) if m else "",
            "city": (m.group(2) or "") if m else "",
            "name": (m.group(3) or full).strip() if m else full,
            "full": full,
        })
    total = re.search(r"<span>(\d+)개의 휴양시설 검색</span>", body)
    return rows, int(total.group(1)) if total else len(rows)


def search_once(pg, arcd, night):
    """권역 하나, 밤 하나를 조회한다. 실패하면 빈 목록과 사유를 돌려준다."""
    bg = night.strftime("%Y%m%d")
    ed = (night + dt.timedelta(days=1)).strftime("%Y%m%d")
    pg.evaluate(
        """([bg, ed, arcd]) => {
            const fmt = d => d.slice(0,4) + '.' + d.slice(4,6) + '.' + d.slice(6,8);
            document.getElementById('rsrvtBgDt').value = bg;
            document.getElementById('rsrvtEdDt').value = ed;
            const cp = document.getElementById('calPicker');
            if (cp) cp.value = fmt(bg) + ' ~ ' + fmt(ed);
            const a = document.getElementById('srchInsttArcd');
            if (a) a.value = arcd;
            const i = document.getElementById('srchInsttId');
            if (i) i.value = '';
            const n = document.getElementById('stng_nofpr');
            if (n) n.innerHTML = '2';
        }""",
        [bg, ed, arcd],
    )
    try:
        with pg.expect_navigation(timeout=90000):
            pg.evaluate("fn_top_goSearch()")
    except Exception as e:
        return [], 0, "이동 실패(%s)" % type(e).__name__
    time.sleep(1.5)
    if "alert.do" in pg.url:
        m = re.search(r'alertMsg\s*=\s*"([^"]*)"', pg.content())
        return [], 0, "거절됨: " + (m.group(1) if m else "사유 못 읽음")
    rows, total = parse_available(pg.content())
    return rows, total, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", default="", help="권역 번호를 쉼표로. 비우면 전부")
    ap.add_argument("--nights", type=int, default=0, help="밤을 몇 개만. 0이면 전부")
    ap.add_argument("--all-days", action="store_true", help="금·토만이 아니라 매일")
    ap.add_argument("--out", default=str(OUT_PATH))
    args = ap.parse_args()

    uid, pw = read_credentials()
    regions = [r for r in args.regions.split(",") if r] or list(REGIONS)
    nights = target_nights(weekend_only=not args.all_days,
                           limit=args.nights or None)
    print("모을 범위: 권역 %d개 × 밤 %d개 = 조회 %d번"
          % (len(regions), len(nights), len(regions) * len(nights)))
    if not nights:
        raise SystemExit("모을 밤이 없다")

    from playwright.sync_api import sync_playwright

    started = dt.datetime.now()
    records, failures = [], []

    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        ctx = br.new_context(locale="ko-KR", viewport={"width": 1440, "height": 1000})
        pg = ctx.new_page()

        pg.goto(BASE + "/com/login.do", wait_until="domcontentloaded", timeout=60000)
        pg.fill("input[name='loginId']", uid)
        pg.fill("input[name='loginPwd']", pw)
        pg.click("input.loginBtn")
        pg.wait_for_load_state("domcontentloaded", timeout=60000)
        time.sleep(2)
        if pg.query_selector("input[name='loginPwd']") is not None:
            br.close()
            raise SystemExit("로그인 실패 — 비밀번호를 5번 틀리면 계정이 잠긴다. 멈춘다.")
        print("로그인 성공")

        pg.goto(MAIN, wait_until="domcontentloaded", timeout=60000)
        time.sleep(2)

        done = 0
        for night in nights:
            for arcd in regions:
                done += 1
                rows, total, err = search_once(pg, arcd, night)
                tag = "%s %s" % (night.isoformat(), REGIONS.get(arcd, arcd))
                if err:
                    failures.append({"date": night.isoformat(), "region": arcd,
                                     "reason": err})
                    print("  [%d/%d] %s -> %s" % (done, len(nights) * len(regions), tag, err))
                    # 거절당하면 처음 화면으로 돌아가 숨을 고른다.
                    pg.goto(MAIN, wait_until="domcontentloaded", timeout=60000)
                    time.sleep(5)
                    continue
                for r in rows:
                    r.update({"date": night.isoformat(), "region": arcd,
                              "region_name": REGIONS.get(arcd, arcd)})
                    records.append(r)
                print("  [%d/%d] %s -> 빈자리 %d곳 (검색 %d곳)"
                      % (done, len(nights) * len(regions), tag, len(rows), total))
                time.sleep(PAUSE)
        br.close()

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "collected_at": started.isoformat(timespec="seconds"),
        "finished_at": dt.datetime.now().isoformat(timespec="seconds"),
        "regions": REGIONS,
        "nights": [n.isoformat() for n in nights],
        "records": records,
        "failures": failures,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print("다 모았다: 빈자리 %d건 / 실패 %d건 -> %s"
          % (len(records), len(failures), out))


if __name__ == "__main__":
    main()
