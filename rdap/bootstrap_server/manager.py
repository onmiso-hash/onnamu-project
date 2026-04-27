import httpx
import json
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pathlib import Path

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

IANA_BASE_URL = "https://data.iana.org/rdap/"
FILES = ["dns.json", "ipv4.json", "ipv6.json", "asn.json", "object-tags.json"]
DATA_DIR = Path("./data")

class BootstrapManager:
    def __init__(self):
        self.data = {}
        # 통계 데이터 초기화
        self.stats = {
            "total_hits": 0,
            "total_misses": 0,
            "categories": {
                "domain": 0,
                "ip": 0,
                "ipv4": 0,
                "ipv6": 0,
                "autnum": 0,
                "entity": 0,
                "nameserver": 0
            },
            "client_ips": {} # {ip: count}
        }
        DATA_DIR.mkdir(exist_ok=True)

    def record_hit(self, category: str, client_ip: str = None, sub_category: str = None):
        """조회 성공 시 통계를 기록합니다."""
        self.stats["total_hits"] += 1
        if category in self.stats["categories"]:
            self.stats["categories"][category] += 1
        if sub_category in self.stats["categories"]:
            self.stats["categories"][sub_category] += 1
            
        if client_ip:
            self.stats["client_ips"][client_ip] = self.stats["client_ips"].get(client_ip, 0) + 1

    def record_miss(self):
        """조회 실패 시 통계를 기록합니다."""
        self.stats["total_misses"] += 1

    async def fetch_all(self):
        """IANA에서 모든 부트스트랩 파일을 다운로드합니다."""
        async with httpx.AsyncClient() as client:
            for filename in FILES:
                try:
                    url = f"{IANA_BASE_URL}{filename}"
                    response = await client.get(url)
                    if response.status_code == 200:
                        content = response.json()
                        self.data[filename] = content
                        # 로컬 파일로 저장
                        with open(DATA_DIR / filename, "w", encoding="utf-8") as f:
                            json.dump(content, f, ensure_ascii=False, indent=2)
                        logger.info(f"Successfully updated {filename}")
                    else:
                        logger.error(f"Failed to fetch {filename}: {response.status_code}")
                except Exception as e:
                    logger.error(f"Error fetching {filename}: {str(e)}")

    def load_local(self):
        """로컬에 저장된 파일이 있으면 로드합니다."""
        for filename in FILES:
            file_path = DATA_DIR / filename
            if file_path.exists():
                with open(file_path, "r", encoding="utf-8") as f:
                    self.data[filename] = json.load(f)
                logger.info(f"Loaded {filename} from local storage")

    async def initialize(self):
        """초기 데이터 로드 및 스케줄러 설정을 수행합니다."""
        self.load_local()
        await self.fetch_all() # 시작 시 항상 최신 데이터 시도

        # 24시간마다 갱신하는 스케줄러 시작
        scheduler = AsyncIOScheduler()
        scheduler.add_job(self.fetch_all, 'interval', hours=24)
        scheduler.start()
        logger.info("Bootstrap Update Scheduler started (24h interval)")

bootstrap_manager = BootstrapManager()
