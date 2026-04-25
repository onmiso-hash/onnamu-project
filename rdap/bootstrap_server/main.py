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

# 1. 도메인 리다이렉트 (원본 대소문자 유지)
@app.get("/domain/{name}")
async def redirect_domain(name: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading data...")
        
    # 판단을 위한 TLD 추출 (소문자로 변환하여 비교)
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                target_url = service[1][0]
                # 리다이렉트 시에는 사용자가 입력한 {name} 원본 그대로 전달
                return RedirectResponse(url=f"{target_url}domain/{name}", status_code=307)
                
    raise HTTPException(status_code=404, detail="RDAP server not found for this TLD")

# 2. IP 리다이렉트 (원본 주소 유지)
@app.get("/ip/{address}")
async def redirect_ip(address: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading data...")
        
    try:
        ip_obj = ipaddress.ip_address(address)
        version = "ipv4.json" if ip_obj.version == 4 else "ipv6.json"
        ip_data = bootstrap_manager.data.get(version)
        
        if ip_data:
            for service in ip_data.get("services", []):
                for network_str in service[0]:
                    if ip_obj in ipaddress.ip_network(network_str):
                        target_url = service[1][0]
                        # {address} 원본 그대로 전달
                        return RedirectResponse(url=f"{target_url}ip/{address}", status_code=307)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    raise HTTPException(status_code=404, detail="RDAP server not found for this IP range")

# 3. AS 번호 리다이렉트 (원본 입력 유지)
@app.get("/autnum/{number_str}")
async def redirect_autnum(number_str: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading data...")
    
    # 판단을 위해 숫자만 추출
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
                        start, end = map(int, range_str.split("-"))
                    else:
                        start = end = int(range_str)
                    
                    if start <= number <= end:
                        target_url = service[1][0]
                        # 리다이렉트 시에는 사용자가 입력한 값 또는 정제된 숫자(가장 안전) 사용
                        return RedirectResponse(url=f"{target_url}autnum/{number}", status_code=307)
                except: continue
    raise HTTPException(status_code=404, detail="AS server not found")

# 4. 엔티티 리다이렉트 (원본 대소문자 유지 - 가장 중요)
@app.get("/entity/{handle}")
async def redirect_entity(handle: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Loading data...")
        
    # 판단을 위해 태그만 대문자로 추출
    tag_data = bootstrap_manager.data.get("object-tags.json")
    if tag_data:
        parts = handle.split("-")
        if len(parts) > 1:
            tag = parts[-1].upper()
            for service in tag_data.get("services", []):
                if tag in service[0]:
                    target_url = service[1][0]
                    # 리다이렉트 시에는 사용자가 입력한 {handle} 원본 대소문자 그대로 전달!
                    return RedirectResponse(url=f"{target_url}entity/{handle}", status_code=307)
                    
    raise HTTPException(status_code=404, detail="Entity server not found")

@app.get("/{filename}")
async def get_bootstrap_file(filename: str):
    if not filename.endswith(".json"): filename += ".json"
    if bootstrap_manager and filename in bootstrap_manager.data:
        return bootstrap_manager.data[filename]
    raise HTTPException(status_code=404, detail="Not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
