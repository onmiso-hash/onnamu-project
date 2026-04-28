import sys
import os
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
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

app = FastAPI(title="onnamu RDAP Bootstrap Server")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 공용 AsyncClient 생성 (타임아웃 연장 및 SSL 검증 완화 옵션 검토)
async_client = httpx.AsyncClient(
    timeout=20.0, 
    follow_redirects=True,
    verify=False  # 일부 RDAP 서버의 인증서 문제로 인한 502 방지
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def proxy_rdap_request(target_url: str):
    """외부 RDAP 서버에 요청을 보내고 결과를 반환하는 프록시 함수"""
    try:
        logger.info(f"Proxying request to: {target_url}")
        response = await async_client.get(target_url)
        
        # 외부 서버의 응답 상태 코드를 그대로 유지하며 결과 반환
        try:
            content = response.json()
            return JSONResponse(status_code=response.status_code, content=content)
        except Exception:
            # JSON이 아닌 경우 (에러 페이지 등)
            return JSONResponse(
                status_code=response.status_code, 
                content={"errorCode": response.status_code, "title": "Remote Server Error", "description": [response.text[:200]]}
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
    if bootstrap_manager:
        try:
            asyncio.create_task(bootstrap_manager.initialize())
        except Exception as e:
            logger.error(f"Failed to start initialization: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    await async_client.aclose()

@app.get("/")
async def root(request: Request = None):
    status = "ready" if (bootstrap_manager and bootstrap_manager.data) else "initializing or error"
    return {"message": "onnamu RDAP Bootstrap Server is running", "status": status}

def get_client_ip(request: Request):
    """실제 클라이언트 IP를 가져옵니다. (프록시 헤더 고려)"""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # X-Forwarded-For는 'client, proxy1, proxy2' 형태일 수 있으므로 첫 번째 값을 선택
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host

# 1. 도메인 조회 (Proxy 방식 우선 적용)
@app.get("/domain/{name}")
async def get_domain(name: str, request: Request):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
    
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                bootstrap_manager.record_hit("domain", client_ip)
                target_url = f"{service[1][0]}domain/{name}"
                return await proxy_rdap_request(target_url)
                
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 1-2. 네임서버 조회
@app.get("/nameserver/{name}")
async def get_nameserver(name: str, request: Request):
    client_ip = get_client_ip(request)
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
        
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                bootstrap_manager.record_hit("nameserver", client_ip)
                target_url = f"{service[1][0]}nameserver/{name}"
                return await proxy_rdap_request(target_url)
                
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="RDAP server for this nameserver TLD not found")

# 2. IP 조회
@app.get("/ip/{address}")
async def get_ip(address: str, request: Request):
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
                        bootstrap_manager.record_hit("ip", client_ip, sub_cat)
                        target_url = f"{service[1][0]}ip/{address}"
                        return await proxy_rdap_request(target_url)
    except Exception as e:
        bootstrap_manager.record_miss()
        raise HTTPException(status_code=400, detail=str(e))
        
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 3. AS 번호 조회
@app.get("/autnum/{number_str}")
async def get_autnum(number_str: str, request: Request):
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
                        bootstrap_manager.record_hit("autnum", client_ip)
                        target_url = f"{service[1][0]}autnum/{number}"
                        return await proxy_rdap_request(target_url)
                except: continue
                
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 4. 엔티티 조회
@app.get("/entity/{handle}")
async def get_entity(handle: str, request: Request):
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
                    bootstrap_manager.record_hit("entity", client_ip)
                    target_url = f"{target_urls[0]}entity/{handle}"
                    return await proxy_rdap_request(target_url)
                    
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
    
    # 4. Bootstrap Dates (KISA 형식 적용)
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

    return {
        "rdapConformance": ["rdap_level_0"],
        "notices": notices
    }

@app.get("/{filename}")
async def get_bootstrap_file(filename: str):
    if not filename.endswith(".json"): filename += ".json"
    if bootstrap_manager and filename in bootstrap_manager.data:
        return bootstrap_manager.data[filename]
    raise HTTPException(status_code=404, detail="Not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
