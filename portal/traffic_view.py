"""접속 기록을 읽어 관리자 화면이 쓸 모양으로 모은다.

기록을 남기는 쪽은 traffic_log.py이고, 이 파일은 읽기만 한다.

읽는 방식에서 지키는 것 둘:

1. **한 줄씩 흘려 읽는다.** 파일을 통째로 메모리에 올리지 않는다 — 30일치를
   한 번에 올리면 CPU 1개짜리 기계에서 화면이 같이 멈춘다.
2. **시간대별 숫자를 함께 낸다.** 총량만 보면 "한 시간에 몰린 폭주"가 평균에
   묻혀 사라진다(2026-08-20 장애에서 실제로 겪은 일). 언제 몰렸는지를 보려고
   만드는 화면이므로 시간축이 없으면 목적을 못 이룬다.
"""

import json
import os
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
TRAFFIC_DIR = os.environ.get("TRAFFIC_DIR", "/traffic")

# 화면에 실어 보내는 접속 주소 줄 수 상한. 이보다 많으면 요청이 많은 순으로 자른다.
TOP_IPS = 300


def _dates_in_range(days):
    today = datetime.now(KST).date()
    return {(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)}


def _files_for(days):
    try:
        names = os.listdir(TRAFFIC_DIR)
    except Exception:
        return []
    wanted = _dates_in_range(days)
    found = []
    for name in names:
        if not name.endswith(".jsonl"):
            continue
        stem = name[: -len(".jsonl")]
        stamp, _, service = stem[-10:], stem[-11:-10], stem[:-11]
        if stamp in wanted and service:
            found.append((service, os.path.join(TRAFFIC_DIR, name)))
    return sorted(found)


def summarize(days=1):
    per_country = {}
    per_ip = {}
    per_service = {}
    per_bucket = {}
    total = 0
    # 하루·이틀은 시간 단위로, 그보다 길면 날짜 단위로 묶는다.
    by_hour = days <= 2

    for service, path in _files_for(days):
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
                    continue    # 쓰다 만 줄 하나 때문에 화면 전체가 비면 안 된다

                ip = row.get("ip") or "(주소 없음)"
                country = row.get("cc") or "??"
                stamp = row.get("t") or ""
                total += 1

                per_service[service] = per_service.get(service, 0) + 1

                bucket = stamp[:13].replace("T", " ") if by_hour else stamp[:10]
                if bucket:
                    per_bucket[bucket] = per_bucket.get(bucket, 0) + 1

                c = per_country.setdefault(country, {"요청": 0, "주소": set()})
                c["요청"] += 1
                c["주소"].add(ip)

                slot = per_ip.setdefault(ip, {
                    "주소": ip, "나라": country, "요청": 0, "서비스": {},
                    "도시": "", "위도": "", "경도": "", "처음": stamp, "마지막": stamp,
                    "직접": False,
                })
                # Cloudflare를 안 거치고 공유기 포트로 곧장 들어온 접속은 따로 표시한다.
                if row.get("via") == "direct":
                    slot["직접"] = True
                slot["요청"] += 1
                slot["서비스"][service] = slot["서비스"].get(service, 0) + 1
                if country != "??":
                    slot["나라"] = country
                for key, field in (("도시", "city"), ("위도", "lat"), ("경도", "lon")):
                    if not slot[key] and row.get(field):
                        slot[key] = row[field]
                if stamp:
                    if not slot["처음"] or stamp < slot["처음"]:
                        slot["처음"] = stamp
                    if stamp > slot["마지막"]:
                        slot["마지막"] = stamp

    나라별 = sorted(
        ({"나라": code, "요청": v["요청"], "주소수": len(v["주소"])} for code, v in per_country.items()),
        key=lambda d: -d["요청"],
    )
    주소별 = sorted(per_ip.values(), key=lambda d: -d["요청"])
    시간별 = [{"때": k, "요청": v} for k, v in sorted(per_bucket.items())]

    return {
        "기간일수": days,
        "묶음": "시간" if by_hour else "날짜",
        "합계": {
            "요청": total,
            "주소수": len(per_ip),
            "나라수": len([c for c in per_country if c != "??"]),
        },
        "서비스별": per_service,
        "직접접속": sum(1 for v in per_ip.values() if v["직접"]),
        "나라별": 나라별,
        "주소별": 주소별[:TOP_IPS],
        "주소별_잘림": max(0, len(주소별) - TOP_IPS),
        "시간별": 시간별,
        "보관함있음": os.path.isdir(TRAFFIC_DIR),
    }
