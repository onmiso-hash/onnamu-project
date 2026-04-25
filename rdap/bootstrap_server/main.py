from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from manager import bootstrap_manager
import ipaddress
import logging

app = FastAPI(title="onnamu RDAP Bootstrap Server")
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    await bootstrap_manager.initialize()

@app.get("/")
async def root():
    return {"message": "onnamu RDAP Bootstrap Server is running", "endpoints": ["/bootstrap/{file}.json", "/bootstrap/domain/{name}", "/bootstrap/ip/{address}", "/bootstrap/autnum/{number}", "/bootstrap/entity/{handle}"]}

# 1. 정적 파일 제공
@app.get("/bootstrap/{filename}")
async def get_bootstrap_file(filename: str):
    if filename in bootstrap_manager.data:
        return bootstrap_manager.data[filename]
    raise HTTPException(status_code=404, detail="File not found")

# 2. 도메인 리다이렉트
@app.get("/bootstrap/domain/{name}")
async def redirect_domain(name: str):
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                target_url = service[1][0] # 첫 번째 서버 주소 선택
                return RedirectResponse(url=f"{target_url}domain/{name}", status_code=307)
                
    raise HTTPException(status_code=404, detail="RDAP server for this TLD not found")

# 3. IP 리다이렉트 (v4/v6 통합)
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

# 4. AS 번호 리다이렉트
@app.get("/bootstrap/autnum/{number}")
async def redirect_autnum(number: int):
    autnum_data = bootstrap_manager.data.get("autnum.json")
    
    if autnum_data:
        for service in autnum_data.get("services", []):
            for range_str in service[0]:
                start, end = map(int, range_str.split("-"))
                if start <= number <= end:
                    target_url = service[1][0]
                    return RedirectResponse(url=f"{target_url}autnum/{number}", status_code=307)
                    
    raise HTTPException(status_code=404, detail="RDAP server for this AS number not found")

# 5. 엔티티 리다이렉트 (object-tags.json 활용)
@app.get("/bootstrap/entity/{handle}")
async def redirect_entity(handle: str):
    tag_data = bootstrap_manager.data.get("object-tags.json")
    
    if tag_data:
        # 핸들에서 마지막 태그 추출 (보통 접미사로 구분)
        parts = handle.split("-")
        if len(parts) > 1:
            tag = parts[-1].upper()
            for service in tag_data.get("services", []):
                if tag in service[0]:
                    target_url = service[1][0]
                    return RedirectResponse(url=f"{target_url}entity/{handle}", status_code=307)
                    
    raise HTTPException(status_code=404, detail="RDAP server for this entity tag not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
