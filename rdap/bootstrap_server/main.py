import sys
import os
import time
import threading
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
import ipaddress
import asyncio
import httpx

# 현재 디렉토리를 경로에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from manager import bootstrap_manager
except ImportError as e:
    logging.error(f"Import Error: {e}")
    bootstrap_manager = None

try:
    import traffic_log
except ImportError as e:
    logging.error(f"Import Error: {e}")
    traffic_log = None

try:
    import traffic_stats
except ImportError as e:
    logging.error(f"Import Error: {e}")
    traffic_stats = None

try:
    import visit_log
except ImportError as e:
    logging.error(f"Import Error: {e}")
    visit_log = None

try:
    import visit_view
except ImportError as e:
    logging.error(f"Import Error: {e}")
    visit_view = None

try:
    import portal_auth
except ImportError as e:
    logging.error(f"Import Error: {e}")
    portal_auth = None

app = FastAPI(title="onnamu RDAP Bootstrap Server")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 국제기구 데이터 파일을 앞단(CDN)이 대신 내주도록 허용하는 시간(초).
# IANA 발행 주기는 길지만, 짧게 잡아 두어야 갱신이 늦게 반영되는 일이 없다.
BOOTSTRAP_CACHE_SECONDS = 3600

# 바깥 RDAP 서버를 동시에 몇 개까지 부를지. CPU가 1개뿐인 기계라
# 이 상한이 없으면 요청이 몰릴 때 전부 밀려서 서버가 응답을 멈춘다(2026-08-20 장애).
PROXY_MAX_CONCURRENCY = 8
proxy_semaphore = asyncio.Semaphore(PROXY_MAX_CONCURRENCY)

# 바깥 서버를 기다리는 최대 시간(초). 길면 한 요청이 자리를 오래 차지한다.
PROXY_UPSTREAM_TIMEOUT = 8.0
# 자리가 찼을 때 기다려 보는 시간(초). 이 시간을 넘기면 줄 세우지 않고 바로 거절한다 —
# 줄을 세우면 요청이 무한정 쌓여 서버 전체가 대답을 멈춘다.
PROXY_QUEUE_WAIT_SECONDS = 2.0

# ── 스스로 멈춤을 알아채는 감시 장치 ────────────────────────────────
# 서버가 '죽는' 것은 도커가 다시 띄워 주지만, '멈춘' 것은 아무도 살려주지 않는다.
# 2026-08-20 장애가 정확히 그 모양이었다(3시간 먹통).
# 그래서 본체는 규칙적으로 살아있다는 표시를 남기고, 별도의 실 하나가 그 표시가
# 멈췄는지 지켜본다. 별도의 실이라야 본체가 멈춰도 같이 멈추지 않는다.
WATCHDOG_HEARTBEAT_INTERVAL = 5      # 살아있다는 표시를 남기는 주기(초)
WATCHDOG_CHECK_INTERVAL = 15         # 감시하는 주기(초)
WATCHDOG_STALL_SECONDS = 90          # 이만큼 표시가 안 남으면 멈춘 것으로 본다

_last_heartbeat = time.monotonic()


async def _heartbeat_loop():
    """본체가 살아있다는 표시를 규칙적으로 남긴다."""
    global _last_heartbeat
    while True:
        _last_heartbeat = time.monotonic()
        await asyncio.sleep(WATCHDOG_HEARTBEAT_INTERVAL)


def _watchdog_loop():
    """표시가 멈추면 프로세스를 끝낸다. 그러면 도커가 다시 띄운다."""
    while True:
        time.sleep(WATCHDOG_CHECK_INTERVAL)
        stalled_for = time.monotonic() - _last_heartbeat
        if stalled_for > WATCHDOG_STALL_SECONDS:
            logger.critical(
                f"Event loop stalled for {stalled_for:.0f}s - exiting so Docker can restart this container"
            )
            # 멈춘 상태라 정상 종료 절차가 돌지 않는다. 즉시 끝낸다.
            os._exit(1)
# ────────────────────────────────────────────────────────────────

# 공용 AsyncClient 생성 (타임아웃 연장 및 SSL 검증 완화 옵션 검토)
async_client = httpx.AsyncClient(
    timeout=PROXY_UPSTREAM_TIMEOUT, 
    follow_redirects=True,
    verify=False  # 일부 RDAP 서버의 인증서 문제로 인한 502 방지
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # 공개 API이므로 credentials가 필요 없으며, 최신 FastAPI 크래시 방지를 위해 False로 명시
    allow_methods=["*"],
    allow_headers=["*"],
)


# 접속 한 건마다 나라·주소를 보관함에 한 줄 적는다(관리자 화면의 접속자 지도용).
# 여기서 세는 것은 이미 있던 stats.json과 별개다 — 그쪽은 무엇을 조회했는지를
# 세고, 이쪽은 누가 어디서 얼마나 두드리는지를 센다.
@app.middleware("http")
async def record_traffic(request: Request, call_next):
    response = await call_next(request)
    if traffic_log is not None:
        # 답을 받은 뒤에 적는다 — 응답 코드가 있어야 '유효한 요청'을 가릴 수 있다.
        traffic_log.record("rdap", request.url.path, request.headers.get,
                           request.client.host if request.client else None,
                           response.status_code)
    return response

async def proxy_rdap_request(target_url: str, accept_language: str = None):
    """동시 처리 상한을 지키며 프록시를 수행한다.

    자리가 없으면 줄을 세우지 않고 즉시 거절한다. 줄을 세우면 CPU가 1개뿐인
    이 기계에서는 요청이 무한정 쌓여 서버가 통째로 응답을 멈춘다(2026-08-20 장애).

    accept_language는 브라우저가 보낸 희망 언어를 그대로 상대 서버에 넘기기 위한 것이다.
    이것을 버리면 상대 서버가 늘 기본 언어로 답한다(KRNIC은 영문이 기본).
    """
    try:
        await asyncio.wait_for(proxy_semaphore.acquire(), timeout=PROXY_QUEUE_WAIT_SECONDS)
    except asyncio.TimeoutError:
        logger.warning(f"Proxy busy, rejecting request: {target_url}")
        return JSONResponse(
            status_code=503,
            content={
                "errorCode": 503,
                "title": "Service Busy",
                "description": ["The server is handling too many lookups right now. Please retry shortly."],
            },
            headers={"Retry-After": "5"},
        )

    try:
        return await _proxy_rdap_request(target_url, accept_language)
    finally:
        proxy_semaphore.release()


# 응답이 요청한 언어에 따라 달라지므로, 앞단이 응답을 보관하더라도 언어별로 따로
# 보관하도록 알린다. 이 표시가 없으면 한 사람이 받은 한글 응답이 다음 사람에게 그대로
# 나갈 수 있다.
PROXY_RESPONSE_HEADERS = {"Vary": "Accept-Language"}


async def _proxy_rdap_request(target_url: str, accept_language: str = None):
    """외부 RDAP 서버에 요청을 보내고 결과를 반환하는 프록시 함수"""
    headers = {"Accept-Language": accept_language} if accept_language else None
    try:
        logger.info(f"Proxying request to: {target_url}")
        response = await async_client.get(target_url, headers=headers)

        # 외부 서버의 응답 상태 코드를 그대로 유지하며 결과 반환
        try:
            content = response.json()
            return JSONResponse(status_code=response.status_code, content=content, headers=PROXY_RESPONSE_HEADERS)
        except Exception:
            # JSON이 아닌 경우 (에러 페이지 등)
            return JSONResponse(
                status_code=response.status_code,
                content={"errorCode": response.status_code, "title": "Remote Server Error", "description": [response.text[:200]]},
                headers=PROXY_RESPONSE_HEADERS
            )

    except httpx.TimeoutException:
        logger.error(f"Proxy timeout for: {target_url}")
        return JSONResponse(
            status_code=504,
            content={"errorCode": 504, "title": "Gateway Timeout", "description": ["The remote RDAP server took too long to respond."]}
        )
    except Exception as e:
        logger.error(f"Proxy request failed for {target_url}: {e}")
        return JSONResponse(
            status_code=502,
            content={"errorCode": 502, "title": "Bad Gateway", "description": [f"Failed to fetch data: {str(e)}"]}
        )

@app.on_event("startup")
async def startup_event():
    # 멈춤 감시 시작 — 본체의 표시와, 그것을 지켜보는 별도의 실.
    asyncio.create_task(_heartbeat_loop())
    threading.Thread(target=_watchdog_loop, daemon=True, name="stall-watchdog").start()
    logger.info(
        f"Stall watchdog started (restart if unresponsive for {WATCHDOG_STALL_SECONDS}s)"
    )

    if bootstrap_manager:
        try:
            asyncio.create_task(bootstrap_manager.initialize())
        except Exception as e:
            logger.error(f"Failed to start initialization: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    # 내려가기 전에 아직 저장 안 된 통계를 마저 남긴다.
    # (갑작스러운 정지나 감시 장치의 강제 종료 때는 이 절차가 돌지 않는다)
    if bootstrap_manager:
        try:
            bootstrap_manager.flush_stats()
        except Exception as e:
            logger.error(f"Failed to flush stats on shutdown: {e}")
    await async_client.aclose()

from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 캐시 제어용 커스텀 StaticFiles 클래스 정의
class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        # Cloudflare CDN 및 브라우저 캐싱을 완벽히 방지하는 강력한 캐시 무효화 헤더 주입
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, proxy-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["Surrogate-Control"] = "no-store"
        return response

# client 디렉토리를 NoCacheStaticFiles로 마운트
client_dir = os.path.join(BASE_DIR, "client")
app.mount("/client", NoCacheStaticFiles(directory=client_dir), name="client")

def get_nocache_html_response(file_name: str):
    """HTML 파일 서빙 시 캐시 차단 헤더를 내포하는 FileResponse를 반환합니다."""
    file_path = os.path.join(BASE_DIR, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"{file_name} not found")
    return FileResponse(
        file_path,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Surrogate-Control": "no-store"
        }
    )

@app.get("/")
async def root(request: Request = None):
    # JSON 요청인 경우(예: API 모니터링 툴 등) 이전 JSON 응답 하위 호환 유지
    accept = request.headers.get("accept", "") if request else ""
    if "application/json" in accept and "text/html" not in accept:
        status = "ready" if (bootstrap_manager and bootstrap_manager.data) else "initializing or error"
        return {"message": "onnamu RDAP Bootstrap Server is running", "status": status}
    
    # 일반 브라우저 요청인 경우 한국어 메인 페이지 렌더링
    return get_nocache_html_response("rdap-about-ko.html")

@app.get("/rdap-about-ko.html")
async def get_about_ko():
    return get_nocache_html_response("rdap-about-ko.html")

@app.get("/rdap-about-en.html")
async def get_about_en():
    return get_nocache_html_response("rdap-about-en.html")

@app.get("/rdap-javascript-ko.html")
async def get_javascript_ko():
    return get_nocache_html_response("rdap-javascript-ko.html")

@app.get("/rdap-javascript-en.html")
async def get_javascript_en():
    return get_nocache_html_response("rdap-javascript-en.html")


# ── 통계 화면과 로그인 ────────────────────────────────────────────
# 통계는 누구나 볼 수 있게 두되, 접속 주소만은 로그인한 사람에게만 보인다.
# 로그인 판정은 이 서버가 하지 않고 포털에 물어본다(portal_auth.py 참고).

def _dashboard_url(request: Request):
    host = request.headers.get("Host", "rdap.kr")
    scheme = request.headers.get("X-Forwarded-Proto") or ("http" if "localhost" in host or "127.0.0.1" in host else "https")
    return f"{scheme}://{host}/dashboard"


def _viewer(request: Request):
    """이 요청을 보낸 사람이 누구인지. 로그인 상태가 아니면 None."""
    if portal_auth is None:
        return None
    return portal_auth.identity(request.cookies.get(portal_auth.COOKIE_NAME))


@app.get("/auth/login")
async def stats_login(request: Request):
    """포털 로그인 화면으로 보낸다. 로그인하면 출입증을 달고 통계 화면으로 돌아온다."""
    if portal_auth is None:
        raise HTTPException(status_code=503, detail="Login is not available")
    return RedirectResponse(url=portal_auth.login_url(_dashboard_url(request)), status_code=302)


@app.get("/auth/logout")
async def stats_logout(request: Request):
    """이 서비스가 들고 있던 사본만 버린다. 포털 로그인은 그대로 둔다."""
    response = RedirectResponse(url="/dashboard", status_code=302)
    if portal_auth is not None:
        response.delete_cookie(portal_auth.COOKIE_NAME, path="/")
    return response


@app.post("/api/page")
async def record_page_view(request: Request):
    """화면이 사람 앞에 그려졌을 때 브라우저가 보내오는 신호 한 건.

    위의 접속 기록(record_traffic)이 세는 것은 '서버가 받은 두드림'이라,
    자동 갱신과 훑기 도구가 함께 섞인다. 이 자리는 화면이 실제로 그려졌을 때만
    한 건 받으므로 사람 수를 셀 수 있다. 자세한 사정은 visit_log.py 머리말에 있다.

    누구나 보낼 수 있어야 한다 — 로그인하지 않은 방문자도 세야 하기 때문이다.
    받는 쪽에서 글자 수를 자르고 한 주소의 분당 건수를 막는다.
    """
    if visit_log is None:
        return JSONResponse(content=None, status_code=204)
    try:
        data = await request.json()
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    visit_log.record("rdap", data.get("vid"), data.get("p"),
                     request.headers.get,
                     request.client.host if request.client else None)
    return JSONResponse(content=None, status_code=204)


@app.get("/api/visits/summary")
async def visits_summary(days: int = 1):
    """사람이 실제로 연 화면의 수 — 위의 접속 기록과는 재료가 다르다.

    접속 기록(/api/stats/traffic)이 세는 '화면'은 서버가 받은 두드림이라,
    화면 한 장을 열 때 딸려 오는 부속 호출까지 함께 잡힌다. 통계 화면이 스스로
    부르는 /help 도 거기 섞여, 그 화면을 새로 고치면 제 숫자가 두 건씩 올랐다
    (2026-09-04 확인). 이 자리는 브라우저가 화면을 그린 뒤 보내온 신호만 세므로
    새로고침 한 번이 정확히 한 건이다.

    이 서비스의 숫자만 돌려준다 — 보관함은 포털과 함께 쓰지만 화면은 따로다.
    접속 주소를 담지 않는 집계라 통계 화면과 같이 누구나 볼 수 있게 둔다.
    """
    if visit_view is None:
        raise HTTPException(status_code=503, detail="Visit statistics are not available")
    days = max(1, min(days, 30))
    return JSONResponse(
        content=visit_view.summarize(days, only_service="rdap"),
        headers={"Cache-Control": "no-store", "Pragma": "no-cache", "Expires": "0"},
    )


@app.get("/api/stats/traffic")
async def stats_traffic(request: Request, days: int = 1):
    """기간별 접속·조회 통계.

    days: 1=오늘, 7=일주일, 30=한 달, 0=보관된 전부.
    접속 주소는 로그인한 사람에게만 원문 그대로 나가고, 그 밖에는 마지막 칸을 가린다.
    """
    if traffic_stats is None:
        raise HTTPException(status_code=503, detail="Traffic statistics are not available")

    if days not in (0, 1, 7, 30):
        days = 1

    who = _viewer(request)
    data = traffic_stats.summarize(days, show_ips=who is not None)
    data["보는사람"] = who["username"] if who else None
    return JSONResponse(
        content=data,
        headers={"Cache-Control": "no-store", "Pragma": "no-cache", "Expires": "0"},
    )


@app.get("/dashboard")
async def get_dashboard(request: Request):
    # 포털이 로그인 뒤 주소 끝에 출입증을 붙여 보낸다. 그것을 이 서비스의 쿠키로
    # 옮겨 담고, 주소창에 출입증이 남지 않도록 깨끗한 주소로 다시 보낸다.
    token = request.query_params.get("token")
    if token and portal_auth is not None:
        response = RedirectResponse(url="/dashboard", status_code=302)
        response.set_cookie(
            portal_auth.COOKIE_NAME, token,
            max_age=portal_auth.COOKIE_MAX_AGE,
            httponly=True, samesite="lax",
            secure="localhost" not in request.headers.get("Host", ""),
            path="/",
        )
        return response

    # 1. 현재 디렉토리 확인 (Docker 환경)
    # v2 대시보드로 변경하여 캐시 문제 해결 및 레이아웃 개선
    dashboard_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rdap-dashboard-v2.html")
    if os.path.exists(dashboard_path):
        return FileResponse(
            dashboard_path, 
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Surrogate-Control": "no-store"
            }
        )
    
    # 2. 부모 디렉토리 확인 (로컬 개발 환경)
    dashboard_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rdap-dashboard-v2.html")
    if os.path.exists(dashboard_path):
        return FileResponse(
            dashboard_path,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
        )
        
    raise HTTPException(status_code=404, detail="Dashboard file not found")

def get_client_ip(request: Request):
    """실제 클라이언트 IP를 가져옵니다. (프록시 헤더 고려)"""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # X-Forwarded-For는 'client, proxy1, proxy2' 형태일 수 있으므로 첫 번째 값을 선택
        return x_forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"

# 최상위 도메인(TLD)을 담당하는 RDAP 서버 주소를 찾습니다.
# 국제기구(IANA) 목록을 먼저 보고, 없을 때만 직접 추가한 목록을 봅니다.
# 이 순서 덕분에 나중에 IANA가 해당 TLD를 등재하면 별도 조치 없이 IANA 쪽으로 자동 전환됩니다.
def resolve_tld_service(tld: str):
    """(RDAP 서버 주소, 출처) 를 돌려주고, 못 찾으면 (None, None)."""
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                return service[1][0], "iana"

    bootstrap_manager.load_local_services()
    for service in bootstrap_manager.local_services:
        try:
            if tld in service[0]:
                return service[1][0], "local"
        except (IndexError, TypeError):
            continue

    return None, None


# 조회할 RDAP 서버가 없을 때, 왜 없는지를 화면이 알아볼 수 있게 담아 돌려줍니다.
# (도메인이 없는 것이 아니라 그 최상위 도메인이 RDAP를 제공하지 않는 것입니다.)
def tld_unsupported_response(tld: str, name: str):
    return JSONResponse(
        status_code=404,
        content={
            "errorCode": 404,
            "title": "TLD_NOT_IN_BOOTSTRAP",
            "tld": tld,
            "object": name,
            "description": [
                f"No RDAP server is registered for the .{tld} top-level domain.",
                "This does not mean the object does not exist - the registry for this TLD does not publish an RDAP service.",
            ],
        },
    )


# 1. 도메인 조회 (기본 Redirect, proxy=true인 경우 Proxy 방식 적용)
@app.get("/domain/{name}")
async def get_domain(name: str, request: Request, proxy: bool = False):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
    
    tld = name.split(".")[-1].lower()
    base_url, source = resolve_tld_service(tld)
    if base_url:
        bootstrap_manager.record_hit("domain", client_ip, object_key=name)
        target_url = f"{base_url}domain/{name}"
        if proxy:
            return await proxy_rdap_request(target_url, request.headers.get("accept-language"))
        return RedirectResponse(url=target_url, status_code=307)

    bootstrap_manager.record_miss()
    return tld_unsupported_response(tld, name)

# 1-2. 네임서버 조회
@app.get("/nameserver/{name}")
async def get_nameserver(name: str, request: Request, proxy: bool = False):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
        
    tld = name.split(".")[-1].lower()
    base_url, source = resolve_tld_service(tld)
    if base_url:
        bootstrap_manager.record_hit("nameserver", client_ip, object_key=name)
        target_url = f"{base_url}nameserver/{name}"
        if proxy:
            return await proxy_rdap_request(target_url, request.headers.get("accept-language"))
        return RedirectResponse(url=target_url, status_code=307)

    bootstrap_manager.record_miss()
    return tld_unsupported_response(tld, name)

# 2. IP 조회
@app.get("/ip/{address}")
async def get_ip(address: str, request: Request, proxy: bool = False):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
        
    try:
        ip_obj = ipaddress.ip_address(address)
        version = "ipv4.json" if ip_obj.version == 4 else "ipv6.json"
        sub_cat = "ipv4" if ip_obj.version == 4 else "ipv6"
        ip_data = bootstrap_manager.data.get(version)
        if ip_data:
            for service in ip_data.get("services", []):
                for network_str in service[0]:
                    if ip_obj in ipaddress.ip_network(network_str):
                        bootstrap_manager.record_hit("ip", client_ip, sub_cat, object_key=address)
                        target_url = f"{service[1][0]}ip/{address}"
                        if proxy:
                            return await proxy_rdap_request(target_url, request.headers.get("accept-language"))
                        return RedirectResponse(url=target_url, status_code=307)
    except Exception as e:
        bootstrap_manager.record_miss()
        raise HTTPException(status_code=400, detail=str(e))
        
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 3. AS 번호 조회
@app.get("/autnum/{number_str}")
async def get_autnum(number_str: str, request: Request, proxy: bool = False):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
        
    clean_number = number_str.upper().replace("AS", "")
    try:
        number = int(clean_number)
    except ValueError:
        bootstrap_manager.record_miss()
        raise HTTPException(status_code=400, detail="Invalid format")
        
    asn_data = bootstrap_manager.data.get("asn.json")
    if asn_data:
        for service in asn_data.get("services", []):
            for range_str in service[0]:
                try:
                    if "-" in range_str:
                        start_s, end_s = range_str.split("-")
                        start, end = int(start_s), int(end_s)
                    else:
                        start = end = int(range_str)
                    if start <= number <= end:
                        bootstrap_manager.record_hit("autnum", client_ip, object_key=f"AS{number}")
                        target_url = f"{service[1][0]}autnum/{number}"
                        if proxy:
                            return await proxy_rdap_request(target_url, request.headers.get("accept-language"))
                        return RedirectResponse(url=target_url, status_code=307)
                except: continue
                
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 4. 엔티티 조회
@app.get("/entity/{handle}")
async def get_entity(handle: str, request: Request, proxy: bool = False):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
        
    tag_data = bootstrap_manager.data.get("object-tags.json")
    if tag_data:
        upper_handle = handle.upper()
        for service in tag_data.get("services", []):
            tags = service[1]
            target_urls = service[2]
            for tag in tags:
                if upper_handle.endswith("-" + tag.upper()) or upper_handle == tag.upper():
                    bootstrap_manager.record_hit("entity", client_ip, object_key=handle)
                    target_url = f"{target_urls[0]}entity/{handle}"
                    if proxy:
                        return await proxy_rdap_request(target_url, request.headers.get("accept-language"))
                    return RedirectResponse(url=target_url, status_code=307)
                    
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="RDAP server for this entity tag not found")

@app.get("/help")
async def get_help():
    if not bootstrap_manager or not bootstrap_manager.data:
        return {"notices": [{"title": "Status", "description": ["Initializing..."]}]}
    
    notices = []
    stats = bootstrap_manager.stats
    
    # 1. Totals (실제 데이터)
    notices.append({
        "title": "Totals",
        "description": [
            f"Hits = {stats['total_hits']}",
            f"Misses = {stats['total_misses']}"
        ]
    })
    
    # 2. Hits by Category (실제 데이터)
    notices.append({"title": "Domain Hits", "description": [f"{stats['categories']['domain']} = domain"]})
    notices.append({"title": "IP Hits", "description": [f"{stats['categories']['ipv4']} = ipv4", f"{stats['categories']['ipv6']} = ipv6"]})
    notices.append({"title": "Entity Hits", "description": [f"{stats['categories']['entity']} = entity"]})
    notices.append({"title": "Nameserver Hits", "description": [f"{stats['categories']['nameserver']} = nameserver"]})
    
    # 3. Access Client IP Hits (실제 데이터 - 상위 5개)
    sorted_ips = sorted(stats["client_ips"].items(), key=lambda x: x[1], reverse=True)[:5]
    ip_desc = [f"{count} = {ip}" for ip, count in sorted_ips] if sorted_ips else ["Zero queries."]
    notices.append({
        "title": "Access Client IP Hits",
        "description": ip_desc
    })

    # 4. Top 100 Rankings
    top_map = [
        ("all", "Overall Top 100"),
        ("domain", "Domain Top 100"),
        ("nameserver", "Nameserver Top 100"),
        ("ip", "IP Address Top 100"),
        ("autnum", "AS Number Top 100"),
        ("entity", "Entity Top 100")
    ]
    
    for key, title in top_map:
        sorted_objs = sorted(stats["top_objects"].get(key, {}).items(), key=lambda x: x[1], reverse=True)[:100]
        obj_desc = [f"{count} = {obj}" for obj, count in sorted_objs] if sorted_objs else ["No data."]
        notices.append({
            "title": title,
            "description": obj_desc
        })
    
    # 5. Bootstrap Dates (KISA 형식 적용)
    file_map = {
        "dns.json": "Domain",
        "ipv4.json": "IPv4",
        "ipv6.json": "IPv6",
        "asn.json": "AS",
        "object-tags.json": "Entity"
    }
    
    for filename, label in file_map.items():
        content = bootstrap_manager.data.get(filename)
        # 우리 서버가 업데이트한 시간을 Modified Date로 사용
        mod_date = bootstrap_manager.last_updated.get(filename, "-")
        pub_date = "-"
        
        if content:
            # 1. 'publication' 필드가 있는 경우 (IANA 표준)
            if "publication" in content:
                pub_date = content["publication"]
            else:
                # 2. 없는 경우 description 내에서 검색
                import re
                date_pattern = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?)")
                desc = content.get("description", [])
                
                for line in desc:
                    line_str = str(line)
                    if "Publication" in line_str or "publication" in line_str:
                        found_dates = date_pattern.findall(line_str)
                        if found_dates: pub_date = found_dates[0]
                        elif ":" in line_str: pub_date = line_str.split(":", 1)[1].strip()
                        break
            
            notices.append({
                "title": f"{label} Bootstrap File Modified and Published Dates",
                "description": [mod_date, pub_date]
            })
        else:
            # 데이터가 아직 로드되지 않은 경우
            notices.append({
                "title": f"{label} Bootstrap File Modified and Published Dates",
                "description": ["Pending...", "Pending..."]
            })

    return JSONResponse(
        content={
            "rdapConformance": ["rdap_level_0"],
            "notices": notices
        },
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
    )

@app.get("/{filename}")
async def get_bootstrap_file(filename: str):
    if not filename.endswith(".json"): filename += ".json"
    if bootstrap_manager and filename in bootstrap_manager.data:
        # 이 파일들은 국제기구(IANA)가 발행할 때만 바뀌고, 우리 소스를 고쳐도 바뀌지 않는다.
        # 따라서 앞단(CDN)이 대신 내주게 해도 '고쳤는데 반영이 안 되는' 문제가 생기지 않는다.
        # 화면 파일(HTML/CSS/JS)은 여기에 해당하지 않으며 캐시 금지를 그대로 유지한다.
        return JSONResponse(
            content=bootstrap_manager.data[filename],
            headers={
                "Cache-Control": f"public, max-age={BOOTSTRAP_CACHE_SECONDS}",
                "Content-Type": "application/json",
            },
        )
    raise HTTPException(status_code=404, detail="Not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
