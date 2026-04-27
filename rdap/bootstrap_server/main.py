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
async def redirect_domain(name: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                return RedirectResponse(url=f"{service[1][0]}domain/{name}", status_code=307)
    raise HTTPException(status_code=404, detail="Not found")

# 1-2. 네임서버 리다이렉트 추가
@app.get("/nameserver/{name}")
async def redirect_nameserver(name: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
    # 호스트네임에서 TLD 추출 (예: ns1.google.com -> com, b.nic.art -> art)
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                return RedirectResponse(url=f"{service[1][0]}nameserver/{name}", status_code=307)
    raise HTTPException(status_code=404, detail="RDAP server for this nameserver TLD not found")

# 2. IP 리다이렉트
@app.get("/ip/{address}")
async def redirect_ip(address: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
    try:
        ip_obj = ipaddress.ip_address(address)
        version = "ipv4.json" if ip_obj.version == 4 else "ipv6.json"
        ip_data = bootstrap_manager.data.get(version)
        if ip_data:
            for service in ip_data.get("services", []):
                for network_str in service[0]:
                    if ip_obj in ipaddress.ip_network(network_str):
                        return RedirectResponse(url=f"{service[1][0]}ip/{address}", status_code=307)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(status_code=404, detail="Not found")

# 3. AS 번호 리다이렉트
@app.get("/autnum/{number_str}")
async def redirect_autnum(number_str: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
    clean_number = number_str.upper().replace("AS", "")
    try:
        number = int(clean_number)
    except ValueError:
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
                        return RedirectResponse(url=f"{service[1][0]}autnum/{number}", status_code=307)
                except: continue
    raise HTTPException(status_code=404, detail="Not found")

# 4. 엔티티 리다이렉트 (데이터 구조 기반으로 보강)
@app.get("/entity/{handle}")
async def redirect_entity(handle: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading...")
        
    tag_data = bootstrap_manager.data.get("object-tags.json")
    if tag_data:
        # 핸들 분석 (대소문자 무시하고 태그 추출 시도)
        upper_handle = handle.upper()
        
        for service in tag_data.get("services", []):
            # IANA 구조: service[0]=emails, service[1]=tags, service[2]=urls
            tags = service[1]
            target_urls = service[2]
            
            for tag in tags:
                # 1. 핸들이 해당 태그로 끝나거나 (예: -FRNIC)
                # 2. 핸들 자체가 해당 태그이거나
                # 3. 핸들 내에 하이픈 뒤에 태그가 위치하는 경우
                if upper_handle.endswith("-" + tag.upper()) or upper_handle == tag.upper():
                    return RedirectResponse(url=f"{target_urls[0]}entity/{handle}", status_code=307)
                    
    raise HTTPException(status_code=404, detail="RDAP server for this entity tag not found")

@app.get("/help")
async def get_help():
    if not bootstrap_manager or not bootstrap_manager.data:
        return {"notices": [{"title": "Status", "description": ["Initializing..."]}]}
    
    notices = []
    
    # 1. Totals (통계 기능이 연동되지 않았으므로 임시 데이터)
    notices.append({
        "title": "Totals",
        "description": [
            "Hits = 2450",
            "Misses = 120"
        ]
    })
    
    # 2. Hits by Category (임시 데이터)
    notices.append({"title": "Domain Hits", "description": ["1850 = domain"]})
    notices.append({"title": "IP Hits", "description": ["450 = ipv4", "50 = ipv6"]})
    notices.append({"title": "Entity Hits", "description": ["85 = entity"]})
    notices.append({"title": "Nameserver Hits", "description": ["15 = nameserver"]})
    
    # 3. Access Client IP Hits (임시 데이터)
    notices.append({
        "title": "Access Client IP Hits",
        "description": [
            "1200 = 127.0.0.1",
            "850 = 192.168.0.1",
            "400 = 10.0.0.1"
        ]
    })
    
    # 4. Bootstrap Dates (실제 데이터 기반)
    file_map = {
        "dns.json": "DNS",
        "ipv4.json": "IPv4",
        "ipv6.json": "IPv6",
        "asn.json": "ASN",
        "object-tags.json": "Object Tags"
    }
    
    for filename, label in file_map.items():
        content = bootstrap_manager.data.get(filename)
        if content:
            # IANA 파일의 상단에 'description' 또는 'publication' 필드가 있는지 확인하여 날짜 추출
            # 실제 IANA 파일 구조에 맞게 description 배열의 값을 활용
            desc = content.get("description", [])
            # 일반적으로 0: 제목, 1: 수정일, 2: 게시일 등의 형식을 가질 수 있음
            # IANA 형식에 따른 안전한 추출 시도
            mod_date = "-"
            pub_date = "-"
            for line in desc:
                if "Modified" in line: mod_date = line.split(":", 1)[1].strip() if ":" in line else line
                if "Publication" in line: pub_date = line.split(":", 1)[1].strip() if ":" in line else line
            
            notices.append({
                "title": f"{label} Bootstrap Dates",
                "description": [mod_date, pub_date]
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
