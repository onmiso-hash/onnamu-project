from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from manager import bootstrap_manager
import ipaddress
import logging
import asyncio

app = FastAPI(title="onnamu RDAP Bootstrap Server")
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    # 서버 부팅을 방해하지 않도록 데이터 초기화 및 수집을 백그라운드에서 실행
    asyncio.create_task(bootstrap_manager.initialize())

@app.get("/")
async def root():
    return {
        "message": "onnamu RDAP Bootstrap Server is running", 
        "status": "ready" if bootstrap_manager.data else "initializing",
        "endpoints": [
            "/bootstrap/domain/{name}", 
            "/bootstrap/ip/{address}", 
            "/bootstrap/autnum/{number}", 
            "/bootstrap/entity/{handle}",
            "/bootstrap/{file}.json"
        ]
    }

# --- 리다이렉트 로직을 정적 파일보다 우선순위에 둠 ---

# 1. 도메인 리다이렉트
@app.get("/bootstrap/domain/{name}")
async def redirect_domain(name: str):
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                target_url = service[1][0]
                return RedirectResponse(url=f"{target_url}domain/{name}", status_code=307)
                
    raise HTTPException(status_code=404, detail="RDAP server for this TLD not found")

# 2. IP 리다이렉트 (v4/v6)
@app.get("/bootstrap/ip/{address}")
async def redirect_ip(address: str):
    try:
        ip_obj = ipaddress.ip_address(address)
        version = "ipv4.json" if ip_obj.version == 4 else "ipv6.json"
        ip_data = bootstrap_manager.data.get(version)
        
        if ip_data:
            for service in ip_data.get("services", []):
                for network_str in service[0]:
                    if ip_obj in ipaddress.ip_network(network_str):
                        target_url = service[1][0]
                        return RedirectResponse(url=f"{target_url}ip/{address}", status_code=307)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address format")
        
    raise HTTPException(status_code=404, detail="RDAP server for this IP range not found")

# 3. AS 번호 리다이렉트
@app.get("/bootstrap/autnum/{number}")
async def redirect_autnum(number: int):
    autnum_data = bootstrap_manager.data.get("autnum.json")
    
    if autnum_data:
        for service in autnum_data.get("services", []):
            for range_str in service[0]:
                try:
                    start, end = map(int, range_str.split("-"))
                    if start <= number <= end:
                        target_url = service[1][0]
                        return RedirectResponse(url=f"{target_url}autnum/{number}", status_code=307)
                except ValueError:
                    continue
                    
    raise HTTPException(status_code=404, detail="RDAP server for this AS number not found")

# 4. 엔티티 리다이렉트
@app.get("/bootstrap/entity/{handle}")
async def redirect_entity(handle: str):
    tag_data = bootstrap_manager.data.get("object-tags.json")
    
    if tag_data:
        parts = handle.split("-")
        if len(parts) > 1:
            tag = parts[-1].upper()
            for service in tag_data.get("services", []):
                if tag in service[0]:
                    target_url = service[1][0]
                    return RedirectResponse(url=f"{target_url}entity/{handle}", status_code=307)
                    
    raise HTTPException(status_code=404, detail="RDAP server for this entity tag not found")

# 5. 정적 파일 제공 (가장 마지막에 위치하여 상세 경로가 아닐 때만 작동)
@app.get("/bootstrap/{filename}")
async def get_bootstrap_file(filename: str):
    # .json 확장자가 빠졌을 경우 붙여줌
    if not filename.endswith(".json"):
        filename += ".json"
        
    if filename in bootstrap_manager.data:
        return bootstrap_manager.data[filename]
    raise HTTPException(status_code=404, detail=f"Bootstrap file '{filename}' not found or still loading")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
