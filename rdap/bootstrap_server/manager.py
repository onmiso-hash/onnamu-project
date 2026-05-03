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
# manager.py 파일 위치 기준으로 data 폴더 경로 설정
DATA_DIR = Path(__file__).parent / "data"

class BootstrapManager:
    def __init__(self):
        self.data = {}
        self.last_updated = {}
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
            "client_ips": {}, # {ip: count}
            "top_objects": {
                "domain": {},
                "nameserver": {},
                "ip": {},
                "autnum": {},
                "entity": {},
                "all": {}
            }
        }
        DATA_DIR.mkdir(exist_ok=True)

    def record_hit(self, category: str, client_ip: str = None, sub_category: str = None, object_key: str = None):
        """조회 성공 시 통계를 기록합니다."""
        self.stats["total_hits"] += 1
        if category in self.stats["categories"]:
            self.stats["categories"][category] += 1
        if sub_category in self.stats["categories"]:
            self.stats["categories"][sub_category] += 1
            
        if client_ip:
            self.stats["client_ips"][client_ip] = self.stats["client_ips"].get(client_ip, 0) + 1

        if object_key:
            # 카테고리별 Top 100
            if category in self.stats["top_objects"]:
                self.stats["top_objects"][category][object_key] = self.stats["top_objects"][category].get(object_key, 0) + 1
            # 전체 Top 100
            self.stats["top_objects"]["all"][object_key] = self.stats["top_objects"]["all"].get(object_key, 0) + 1
            
        self.save_stats()

    def record_miss(self):
        """조회 실패 시 통계를 기록합니다."""
        self.stats["total_misses"] += 1
        self.save_stats()

    def save_stats(self):
        """통계를 로컬 파일에 저장합니다."""
        try:
            stats_path = DATA_DIR / "stats.json"
            with open(stats_path, "w", encoding="utf-8") as f:
                json.dump(self.stats, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save stats: {e}")

    def load_stats(self):
        """로컬 파일에서 통계를 로드합니다."""
        stats_path = DATA_DIR / "stats.json"
        if stats_path.exists():
            try:
                with open(stats_path, "r", encoding="utf-8") as f:
                    loaded_stats = json.load(f)
                    # 기존 stats 구조에 덮어쓰기 (새로운 필드가 추가되었을 수 있으므로 업데이트 방식 사용)
                    for key, value in loaded_stats.items():
                        if key in self.stats:
                            if isinstance(value, dict) and isinstance(self.stats[key], dict):
                                self.stats[key].update(value)
                            else:
                                self.stats[key] = value
                logger.info("Loaded statistics from local storage")
            except Exception as e:
                logger.error(f"Failed to load stats: {e}")

    async def fetch_all(self):
        """IANA에서 모든 부트스트랩 파일을 다운로드합니다."""
        # SSL 인증서 검증 비활성화 (네트워크 환경에 따른 에러 방지)
        async with httpx.AsyncClient(verify=False) as client:
            for filename in FILES:
                try:
                    url = f"{IANA_BASE_URL}{filename}"
                    logger.info(f"Attempting to fetch {filename} from {url}")
                    response = await client.get(url, timeout=30.0)
                    if response.status_code == 200:
                        content = response.json()
                        self.data[filename] = content
                        # 로컬 파일로 저장
                        file_path = DATA_DIR / filename
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(content, f, ensure_ascii=False, indent=2)
                        
                        from datetime import datetime, timezone
                        self.last_updated[filename] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                        
                        logger.info(f"Successfully updated {filename} (Size: {len(str(content))} chars)")
                    else:
                        logger.error(f"Failed to fetch {filename}: HTTP {response.status_code}")
                except Exception as e:
                    logger.error(f"Error fetching {filename}: {str(e)}")

    def load_local(self):
        """로컬에 저장된 파일이 있으면 로드합니다."""
        for filename in FILES:
            file_path = DATA_DIR / filename
            if file_path.exists():
                import os
                from datetime import datetime, timezone
                with open(file_path, "r", encoding="utf-8") as f:
                    self.data[filename] = json.load(f)
                
                mtime = os.path.getmtime(file_path)
                self.last_updated[filename] = datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                logger.info(f"Loaded {filename} from local storage")

    async def initialize(self):
        """초기 데이터 로드 및 스케줄러 설정을 수행합니다."""
        self.load_local()
        self.load_stats()
        await self.fetch_all() # 시작 시 항상 최신 데이터 시도

        # 24시간마다 갱신하는 스케줄러 시작
        scheduler = AsyncIOScheduler()
        scheduler.add_job(self.fetch_all, 'interval', hours=24)
        scheduler.start()
        logger.info("Bootstrap Update Scheduler started (24h interval)")

bootstrap_manager = BootstrapManager()
