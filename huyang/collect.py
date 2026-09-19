# -*- coding: utf-8 -*-
"""자연휴양림 빈자리 모으기.

숲나들e는 '지역 하나 + 날짜 하나'씩만 검색을 받는다. 그래서 권역 9개와
밤 하나하나를 돌며 목록을 받고, 빈자리가 있는 휴양림마다 상세 화면을 한 번
더 열어 **어떤 물건이 비었는지**(숲속의집·휴양관·야영데크 …)까지 받아 둔다.

브라우저를 그대로 띄워 쓰는 이유는 검색에 대기열 장치가 걸려 있어서다.
장치가 발급하는 표 없이 주소만 두드리면 '비정상적인 접근'으로 거절당한다.
표를 위조하지 않고 브라우저가 평소 받는 방식 그대로 받는다.

쓰지 않는 길이 하나 있다. '월별현황조회'는 한 곳의 한 달치를 한 번에 주지만
'자동예약 방지숫자'(CAPTCHA)가 화면을 막고 있어 손대지 않는다. 상세 화면에도
같은 것이 있으나 그쪽은 **결제 칸**에 붙어 있고 물건 목록은 그냥 보인다.
우리는 목록만 읽고 예약은 건드리지 않는다.
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
LOG_PATH = pathlib.Path(r"C:\Users\onmis\project\huyang_data\collect.log")
BASE = "https://www.foresttrip.go.kr"
MAIN = BASE + "/rep/or/fcfsRsrvtMain.do?hmpgId=FRIP&menuId=001001"

REGIONS = {
    "1": "서울/인천/경기", "2": "강원", "3": "충북", "4": "대전/충남",
    "5": "전북", "6": "전남/광주", "7": "대구/경북", "8": "부산/경남",
    "9": "제주",
}

# 화면을 옮길 때마다 쉬는 시간(초). 사람이 누르는 속도보다 느리게 잡았다.
PAUSE = 2.5
# 한 휴양림에서 넘겨 볼 쪽의 상한. 한 쪽에 10개가 들어온다.
MAX_PAGES = 5

# 물건 상세(숲속의집·휴양관·야영데크 …)까지 모을 권역.
# 휴양림 한 곳마다 화면을 한 번 더 열어야 해서 13.5초씩 든다(실측).
# 전국을 다 모으면 네 시간이 넘고 요청이 3,000번에 가까워, 관심 권역만 둔다.
# 나머지 권역은 휴양림 이름·남은 객실 수·숙박/야영 구분까지만 모은다.
DETAIL_REGIONS = ["5", "6"]  # 전북, 전남/광주


class Tee:
    """화면과 기록 파일에 같이 쓴다. 한 줄이 나올 때마다 바로 밀어 넣는다.

    파일로 흘려보내기만 하면 파이썬이 글을 모아 두었다가 끝날 때 한꺼번에
    쓴다. 그러면 한 시간 동안 기록이 비어 있어 살았는지 죽었는지 알 수 없다.
    시작·끝 표시까지 여기서 적는 이유는, 명령 파일이 적으면 한 파일에 글자
    방식이 섞여 한글이 깨지기 때문이다."""

    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.f = open(path, "a", encoding="utf-8")
        self.out = sys.__stdout__

    def write(self, text):
        try:
            self.out.write(text)
            self.out.flush()
        except Exception:
            pass
        self.f.write(text)
        self.f.flush()

    def flush(self):
        try:
            self.out.flush()
        except Exception:
            pass
        self.f.flush()

    def close(self):
        try:
            self.f.close()
        except Exception:
            pass


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
    year, nxt = today.year, today.month + 1
    if nxt > 12:
        year, nxt = year + 1, 1
    end = (dt.date(year + 1, 1, 1) if nxt == 12
           else dt.date(year, nxt + 1, 1)) - dt.timedelta(days=1)
    out = []
    d = today
    while d <= end:
        if (not weekend_only) or d.weekday() in (4, 5):  # 4=금, 5=토
            out.append(d)
        d += dt.timedelta(days=1)
    return out[:limit] if limit else out


# ---- 화면에서 꺼내는 부분 -------------------------------------------------

LIST_JS = """() => {
    const out = [];
    document.querySelectorAll('.rc_item').forEach(it => {
        const lab = it.querySelector('.rc_ti i');
        if (!lab || !lab.textContent.includes('가능')) return;
        const a = it.querySelector('.ut_button a');
        const m = a && a.getAttribute('onclick') &&
                  a.getAttribute('onclick').match(/'([^']+)'/);
        const cnt = it.querySelector('.ut_roomcount');
        const loc = it.querySelector('.lnk_locate');
        const site = it.querySelector('.lnk_site');
        const txt = e => e ? e.textContent.replace(/\\s+/g, ' ').trim() : '';
        out.push({
            instt_id: m ? m[1] : null,
            full: txt(it.querySelector('.rc_ti b')),
            rooms: (txt(cnt).match(/(\\d+)/) || [])[1] || null,
            address: txt(loc),
            homepage: site ? site.getAttribute('href') : null
        });
    });
    return out;
}"""

UNITS_JS = """() => {
    const txt = e => e ? e.textContent.replace(/\\s+/g, ' ').trim() : '';
    const rows = [];
    document.querySelectorAll('.goods_list_area .list_box').forEach(box => {
        const o1 = box.querySelector('.opt1');
        if (!o1) return;
        const hid = o1.querySelector('.hide');
        const state = txt(hid);
        const clone = o1.cloneNode(true);
        clone.querySelectorAll('.icon_group, .hide').forEach(n => n.remove());
        rows.push({
            state: state,
            label: txt(clone),
            spec: txt(box.querySelector('.opt2')),
            price: txt(box.querySelector('.opt3'))
        });
    });
    const pc = document.querySelector('.paging_count');
    const m = pc ? txt(pc).match(/\\((\\d+)\\s*\\/\\s*(\\d+)\\)/) : null;
    return { rows: rows, page: m ? +m[1] : 1, pages: m ? +m[2] : 1 };
}"""


def split_label(label):
    """'[한옥동]방우재' 를 종류와 이름으로 가른다."""
    m = re.match(r"\[([^\]]+)\]\s*(.*)$", label or "")
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return "", (label or "").strip()


def split_full(full):
    """'[사립](삼척시)삼척활기자연휴양림' 을 구분·시군·이름으로 가른다."""
    m = re.match(r"\[(국립|공립|사립)\]\s*(?:\(([^)]*)\))?\s*(.*)$", full or "")
    if m:
        return m.group(1), (m.group(2) or ""), m.group(3).strip()
    return "", "", (full or "").strip()


# ---- 움직이는 부분 --------------------------------------------------------

def run_list(pg, arcd, night, camp=False):
    """권역 하나, 밤 하나의 목록 화면으로 간다.

    camp=True면 화면 안의 '야영' 칸을 눌러 목록을 바꿔 읽는다. 이쪽은 화면
    안에서만 바뀌므로 대기열을 다시 거치지 않는다."""
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
    with pg.expect_navigation(timeout=90000):
        pg.evaluate("fn_top_goSearch()")
    time.sleep(1.5)
    if "alert.do" in pg.url:
        m = re.search(r'alertMsg\s*=\s*"([^"]*)"', pg.content())
        raise RuntimeError("거절됨: " + (m.group(1) if m else "사유 못 읽음"))
    if camp:
        pg.evaluate("fn_switchFilter('2')")
        time.sleep(2.5)
    return pg.evaluate(LIST_JS)


def run_units(pg, instt_id, sctin="01"):
    """휴양림 한 곳의 상세 화면으로 가서 물건 목록을 쪽까지 넘겨 가며 읽는다.

    sctin은 '01'이 숙박, '02'가 야영이다."""
    with pg.expect_navigation(timeout=90000):
        pg.evaluate("fn_fsfsRsrvtPssblGoodsList('%s', '', '%s')" % (instt_id, sctin))
    time.sleep(2.0)
    if "alert.do" in pg.url:
        m = re.search(r'alertMsg\s*=\s*"([^"]*)"', pg.content())
        raise RuntimeError("상세 거절됨: " + (m.group(1) if m else "사유 못 읽음"))

    got = pg.evaluate(UNITS_JS)
    rows, pages = list(got["rows"]), min(got["pages"], MAX_PAGES)
    for n in range(2, pages + 1):
        try:
            pg.evaluate("fn_goPage('%d')" % n)
        except Exception:
            break
        time.sleep(1.5)
        more = pg.evaluate(UNITS_JS)
        if not more["rows"]:
            break
        rows.extend(more["rows"])
    truncated = got["pages"] > MAX_PAGES

    units, seen = [], set()
    for r in rows:
        if r["state"] and "가능" not in r["state"]:
            continue
        cat, nm = split_label(r["label"])
        key = (cat, nm, r["spec"])
        if key in seen:
            continue
        seen.add(key)
        units.append({"category": cat, "name": nm,
                      "spec": r["spec"], "price": r["price"]})
    return units, truncated


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", default="", help="권역 번호를 쉼표로. 비우면 전부")
    ap.add_argument("--nights", type=int, default=0, help="밤을 몇 개만. 0이면 전부")
    ap.add_argument("--all-days", action="store_true", help="금·토만이 아니라 매일")
    ap.add_argument("--no-units", action="store_true", help="물건 목록은 어디서도 안 모은다")
    ap.add_argument("--detail-regions", default=",".join(DETAIL_REGIONS),
                    help="물건 상세까지 모을 권역 번호를 쉼표로. 'all'이면 전부")
    ap.add_argument("--only", default="", choices=["", "숙박", "야영"],
                    help="한 갈래만 모은다")
    ap.add_argument("--out", default=str(OUT_PATH))
    ap.add_argument("--log", default="", help="기록을 남길 파일. 비우면 화면에만")
    args = ap.parse_args()

    uid, pw = read_credentials()
    regions = [r for r in args.regions.split(",") if r] or list(REGIONS)
    if args.detail_regions.strip() == "all":
        detail_regions = set(REGIONS)
    else:
        detail_regions = {r for r in args.detail_regions.split(",") if r}
    nights = target_nights(weekend_only=not args.all_days, limit=args.nights or None)
    if not nights:
        raise SystemExit("모을 밤이 없다")
    print("모을 범위: 권역 %d개 × 밤 %d개 × 갈래 2 = 목록 조회 %d번"
          % (len(regions), len(nights), len(regions) * len(nights) * 2))
    print("물건 상세까지 모을 권역: %s"
          % (", ".join(REGIONS.get(r, r) for r in sorted(detail_regions))
             if detail_regions and not args.no_units else "없음"))

    from playwright.sync_api import sync_playwright

    started = dt.datetime.now()
    records, failures = [], []
    total_lists = len(regions) * len(nights)

    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        ctx = br.new_context(locale="ko-KR", viewport={"width": 1600, "height": 1200})
        pg = ctx.new_page()

        pg.goto(BASE + "/com/login.do", wait_until="domcontentloaded", timeout=60000)
        pg.fill("input[name='loginId']", uid)
        pg.fill("input[name='loginPwd']", pw)
        pg.click("input.loginBtn")
        pg.wait_for_load_state("domcontentloaded", timeout=60000)
        time.sleep(2)
        if pg.query_selector("input[name='loginPwd']") is not None:
            br.close()
            raise SystemExit("로그인 실패 — 5번 틀리면 계정이 잠긴다. 멈춘다.")
        print("로그인 성공")

        pg.goto(MAIN, wait_until="domcontentloaded", timeout=60000)
        time.sleep(2)

        done = 0
        total_steps = total_lists * 2  # 숙박 한 번, 야영 한 번
        for night in nights:
            for arcd in regions:
                for sctin, kind_nm in (("01", "숙박"), ("02", "야영")):
                    if args.only and kind_nm != args.only:
                        continue
                    done += 1
                    tag = "%s %s %s" % (night.isoformat(),
                                        REGIONS.get(arcd, arcd), kind_nm)
                    try:
                        found = run_list(pg, arcd, night, camp=(sctin == "02"))
                    except Exception as e:
                        failures.append({"date": night.isoformat(), "region": arcd,
                                         "kind": kind_nm, "step": "목록",
                                         "reason": str(e)[:120]})
                        print("  [%d/%d] %s -> %s" % (done, total_steps, tag, e))
                        pg.goto(MAIN, wait_until="domcontentloaded", timeout=60000)
                        time.sleep(5)
                        continue

                    made = units_n = 0
                    for f in found:
                        tier, city, name = split_full(f["full"])
                        rec = {
                            "date": night.isoformat(), "region": arcd,
                            "region_name": REGIONS.get(arcd, arcd),
                            "kind": kind_nm,
                            "tier": tier, "city": city, "name": name,
                            "full": f["full"], "instt_id": f["instt_id"],
                            "rooms": int(f["rooms"]) if f["rooms"] else None,
                            "address": f["address"], "homepage": f["homepage"],
                            "units": [], "units_truncated": False,
                        }
                        want_units = (not args.no_units
                                      and arcd in detail_regions
                                      and f["instt_id"])
                        if want_units:
                            try:
                                time.sleep(PAUSE)
                                rec["units"], rec["units_truncated"] = \
                                    run_units(pg, f["instt_id"], sctin)
                            except Exception as e:
                                failures.append({"date": night.isoformat(),
                                                 "region": arcd, "kind": kind_nm,
                                                 "step": "상세", "name": name,
                                                 "reason": str(e)[:120]})
                            # 상세를 보면 목록이 사라진다. 뒤로 돌아가면 대기열을
                            # 다시 거치지 않고 목록이 되살아난다(실측 확인).
                            try:
                                time.sleep(PAUSE)
                                pg.go_back(wait_until="domcontentloaded", timeout=60000)
                                time.sleep(1.5)
                            except Exception as e:
                                failures.append({"date": night.isoformat(),
                                                 "region": arcd, "kind": kind_nm,
                                                 "step": "목록복귀",
                                                 "reason": str(e)[:120]})
                                pg.goto(MAIN, wait_until="domcontentloaded", timeout=60000)
                                time.sleep(5)
                                records.append(rec)
                                made += 1
                                break
                        records.append(rec)
                        made += 1
                        units_n += len(rec["units"])
                    print("  [%d/%d] %s -> 휴양림 %d곳 / 물건 %d개"
                          % (done, total_steps, tag, made, units_n))
                    time.sleep(PAUSE)
        br.close()

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "collected_at": started.isoformat(timespec="seconds"),
        "finished_at": dt.datetime.now().isoformat(timespec="seconds"),
        "regions": REGIONS,
        "nights": [n.isoformat() for n in nights],
        "records": records,
        "failures": failures,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print("다 모았다: 휴양림 %d건 / 물건 %d개 / 실패 %d건 -> %s"
          % (len(records), sum(len(r["units"]) for r in records),
             len(failures), out))


def _run():
    """기록 파일을 열고 main()을 부른다. 시작·끝 표시와 걸린 시간을 남긴다."""
    log_arg = ""
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == "--log" and i + 1 < len(argv):
            log_arg = argv[i + 1]
        elif a.startswith("--log="):
            log_arg = a.split("=", 1)[1]
    tee = Tee(pathlib.Path(log_arg)) if log_arg else None
    if tee:
        sys.stdout = tee
    t0 = dt.datetime.now()
    print("\n===== %s 시작 =====" % t0.strftime("%Y-%m-%d %H:%M:%S"))
    code = 0
    try:
        main()
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 1
        if code:
            print("멈췄다: %s" % e)
    except Exception as e:
        code = 1
        import traceback
        print("터졌다: %s" % e)
        print(traceback.format_exc())
    t1 = dt.datetime.now()
    took = (t1 - t0).total_seconds()
    print("===== %s 끝 (걸린 시간 %d분 %d초 / 결과 %s) =====" % (
        t1.strftime("%Y-%m-%d %H:%M:%S"), int(took // 60), int(took % 60),
        "정상" if code == 0 else "실패"))
    if tee:
        sys.stdout = sys.__stdout__
        tee.close()
    sys.exit(code)


if __name__ == "__main__":
    _run()
