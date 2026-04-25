import sys
import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
import ipaddress
import asyncio

# 현재 디렉토리를 경로에 추가하여 모듈 인식을 확실하게 함
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from manager import bootstrap_manager
except ImportError as e:
    logging.error(f"Import Error: {e}")
    bootstrap_manager = None

app = FastAPI(title="onnamu RDAP Bootstrap Server")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    if bootstrap_manager:
        # 데이터 수집 중 에러가 나도 서버가 죽지 않도록 예외 처리
        try:
            asyncio.create_task(bootstrap_manager.initialize())
            logger.info("Bootstrap Manager initialization started in background.")
        except Exception as e:
            logger.error(f"Failed to start initialization: {e}")
    else:
        logger.error("Bootstrap Manager is not available.")

@app.get("/")
async def root():
    status = "ready" if (bootstrap_manager and bootstrap_manager.data) else "initializing or error"
    return {
        "message": "onnamu RDAP Bootstrap Server is running", 
        "status": status,
        "endpoints": [
            "/bootstrap/domain/{name}", 
            "/bootstrap/ip/{address}", 
            "/bootstrap/autnum/{number}", 
            "/bootstrap/entity/{handle}",
            "/bootstrap/{file}.json"
        ]
    }

@app.get("/bootstrap/domain/{name}")
async def redirect_domain(name: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Data is still loading, please try again later")
        
    tld = name.split(".")[-1].lower()
    dns_data = bootstrap_manager.data.get("dns.json")
    
    if dns_data:
        for service in dns_data.get("services", []):
            if tld in service[0]:
                target_url = service[1][0]
                return RedirectResponse(url=f"{target_url}domain/{name}", status_code=307)
                
    raise HTTPException(status_code=404, detail="RDAP server for this TLD not found")

@app.get("/bootstrap/ip/{address}")
async def redirect_ip(address: str):
    if not bootstrap_manager or not bootstrap_manager.data:
        raise HTTPException(status_code=503, detail="Data is still loading")
        
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    raise HTTPException(status_code=404, detail="RDAP server for this IP range not found")

@app.get("/bootstrap/{filename}")
async def get_bootstrap_file(filename: str):
    if not filename.endswith(".json"):
        filename += ".json"
        
    if bootstrap_manager and filename in bootstrap_manager.data:
        return bootstrap_manager.data[filename]
    raise HTTPException(status_code=404, detail="File not found or still loading")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
