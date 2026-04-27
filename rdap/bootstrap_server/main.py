import sys
import os
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import ipaddress
import asyncio

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

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    if bootstrap_manager:
        try:
            asyncio.create_task(bootstrap_manager.initialize())
        except Exception as e:
            logger.error(f"Failed to start initialization: {e}")

@app.get("/")
async def root(request: Request = None):
    status = "ready" if (bootstrap_manager and bootstrap_manager.data) else "initializing or error"
    return {"message": "onnamu RDAP Bootstrap Server is running", "status": status}

# 1. 도메인 리다이렉트
@app.get("/domain/{name}")
async def redirect_domain(name: str, request: Request):
    client_ip = request.client.host
    if not bootstrap_manager or not bootstrap_manager.data:
        bootstrap_manager.record_miss()
        raise HTTPException(status_code=503, detail="Loading...")
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                bootstrap_manager.record_hit("domain", client_ip)
                return RedirectResponse(url=f"{service[1][0]}domain/{name}", status_code=307)
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 1-2. 네임서버 리다이렉트 추가
@app.get("/nameserver/{name}")
async def redirect_nameserver(name: str, request: Request):
    client_ip = request.client.host
    if not bootstrap_manager or not bootstrap_manager.data:
        bootstrap_manager.record_miss()
        raise HTTPException(status_code=503, detail="Loading...")
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                bootstrap_manager.record_hit("nameserver", client_ip)
                return RedirectResponse(url=f"{service[1][0]}nameserver/{name}", status_code=307)
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="RDAP server for this nameserver TLD not found")

# 2. IP 리다이렉트
@app.get("/ip/{address}")
async def redirect_ip(address: str, request: Request):
    client_ip = request.client.host
    if not bootstrap_manager or not bootstrap_manager.data:
        bootstrap_manager.record_miss()
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
                        return RedirectResponse(url=f"{service[1][0]}ip/{address}", status_code=307)
    except Exception as e:
        bootstrap_manager.record_miss()
        raise HTTPException(status_code=400, detail=str(e))
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 3. AS 번호 리다이렉트
@app.get("/autnum/{number_str}")
async def redirect_autnum(number_str: str, request: Request):
    client_ip = request.client.host
    if not bootstrap_manager or not bootstrap_manager.data:
        bootstrap_manager.record_miss()
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
                        return RedirectResponse(url=f"{service[1][0]}autnum/{number}", status_code=307)
                except: continue
    bootstrap_manager.record_miss()
    raise HTTPException(status_code=404, detail="Not found")

# 4. 엔티티 리다이렉트
@app.get("/entity/{handle}")
async def redirect_entity(handle: str, request: Request):
    client_ip = request.client.host
    if not bootstrap_manager or not bootstrap_manager.data:
        bootstrap_manager.record_miss()
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
                    return RedirectResponse(url=f"{target_urls[0]}entity/{handle}", status_code=307)
                    
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

@app.get("/dashboard")
async def get_dashboard():
    # rdap/bootstrap_server/main.py 위치에서 상위 폴더인 rdap/ 아래의 rdap-dashboard.html 찾기
    dashboard_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rdap-dashboard.html")
    if os.path.exists(dashboard_path):
        from fastapi.responses import HTMLResponse
        with open(dashboard_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    raise HTTPException(status_code=404, detail="Dashboard file not found")

@app.get("/{filename}")
async def get_bootstrap_file(filename: str):
    if not filename.endswith(".json"): filename += ".json"
    if bootstrap_manager and filename in bootstrap_manager.data:
        return bootstrap_manager.data[filename]
    raise HTTPException(status_code=404, detail="Not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
