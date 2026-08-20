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
# IANA 목록에 아직 없는 RDAP 서버를 직접 적어두는 파일 (IANA 동기화 대상이 아님)
LOCAL_SERVICES_FILE = DATA_DIR / "local_services.json"

# 통계를 디스크에 모아서 저장하는 주기(초).
# 예전에는 조회 한 건마다 통계 파일(약 19KB)을 통째로 다시 썼다. 이 폴더는 윈도우
# 폴더를 그대로 갖다 쓴 것이라 도커에서 가장 느린 경로이고, 쓰는 동안 서버 본체가
# 붙잡혀 첫 화면까지 같이 멈춘다. 실측 결과 조회 한 건에 24ms가 들었다(2026-08-20).
STATS_FLUSH_INTERVAL = 30

class BootstrapManager:
    def __init__(self):
        self.data = {}
        self.last_updated = {}
        # 직접 추가한 RDAP 서버 목록과, 파일이 바뀐 것을 알아채기 위한 수정 시각
        self.local_services = []
        self._local_services_mtime = None
        # 마지막 저장 이후 통계가 바뀌었는지. 바뀐 것이 없으면 저장하지 않는다.
        self._stats_dirty = False
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

        self._stats_dirty = True

    def record_miss(self):
        """조회 실패 시 통계를 기록합니다."""
        self.stats["total_misses"] += 1
        self._stats_dirty = True

    def save_stats(self):
        """통계를 로컬 파일에 저장합니다."""
        try:
            stats_path = DATA_DIR / "stats.json"
            with open(stats_path, "w", encoding="utf-8") as f:
                json.dump(self.stats, f, ensure_ascii=False, indent=2)
            self._stats_dirty = False
        except Exception as e:
            logger.error(f"Failed to save stats: {e}")

    def flush_stats(self):
        """바뀐 것이 있을 때만 저장한다."""
        if self._stats_dirty:
            self.save_stats()

    async def _stats_flush_loop(self):
        """통계를 주기적으로 모아서 저장한다.

        요청마다 저장하면 그 사이 모든 요청이 같이 멈춘다. 숫자는 메모리에 그대로
        쌓이고 디스크에 쓰는 횟수만 줄어든다. 대신 서버가 갑자기 죽으면 마지막
        주기만큼의 집계 숫자가 남지 않는다(조회 기능·데이터에는 영향 없음).
        """
        while True:
            await asyncio.sleep(STATS_FLUSH_INTERVAL)
            try:
                self.flush_stats()
            except Exception as e:
                logger.error(f"Periodic stats flush failed: {e}")

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

    def seed_local_services(self):
        """직접 추가 목록 파일이 없으면 설명이 담긴 빈 파일을 만들어 둡니다.

        이 파일이 놓이는 data 폴더는 git 추적 대상이 아니라 서버에 붙어 있는
        저장 공간입니다. 그래서 배포(git reset --hard)로 덮어써지지 않고,
        관리자가 적어넣은 내용이 재배포·재빌드 후에도 그대로 남습니다.
        """
        if LOCAL_SERVICES_FILE.exists():
            return
        template = {
            "_안내": "국제기구(IANA) 목록에 아직 없는 RDAP 서버를 직접 적어두는 곳입니다. IANA 동기화가 이 파일을 덮어쓰지 않으며, 저장하는 즉시 반영됩니다(서버 재시작 불필요).",
            "_조회순서": "국제기구 목록을 먼저 찾고, 없을 때만 이 파일을 봅니다. 따라서 나중에 IANA에 같은 최상위 도메인이 등장하면 IANA 쪽이 자동으로 우선하므로, 여기 적어둔 줄은 지우지 않아도 무방합니다.",
            "_적는법": "services 안에 [ [\"최상위도메인\"], [\"RDAP서버주소(끝에 / 필수)\"] ] 형태로 넣습니다.",
            "_예시": "\"services\": [ [ [\"kr\"], [\"https://rdap.kr-registry.example/\"] ] ]",
            "services": [],
        }
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(LOCAL_SERVICES_FILE, "w", encoding="utf-8") as f:
                json.dump(template, f, ensure_ascii=False, indent=2)
            logger.info(f"Created empty local_services.json at {LOCAL_SERVICES_FILE}")
        except Exception as e:
            logger.error(f"Failed to create local_services.json: {e}")

    def load_local_services(self):
        """직접 추가한 RDAP 서버 목록을 읽습니다.

        파일이 바뀌었을 때만 다시 읽으므로 조회할 때마다 불러도 부담이 없고,
        관리자가 파일을 저장하면 서버를 재시작하지 않아도 바로 반영됩니다.
        """
        try:
            if not LOCAL_SERVICES_FILE.exists():
                if self.local_services:
                    logger.info("local_services.json removed; cleared manual entries")
                self.local_services = []
                self._local_services_mtime = None
                return

            mtime = LOCAL_SERVICES_FILE.stat().st_mtime
            if mtime == self._local_services_mtime:
                return

            with open(LOCAL_SERVICES_FILE, "r", encoding="utf-8") as f:
                content = json.load(f)

            services = content.get("services", [])
            if not isinstance(services, list):
                raise ValueError("'services' must be a list")

            self.local_services = services
            self._local_services_mtime = mtime
            tlds = [t for entry in services for t in entry[0]]
            logger.info(f"Loaded local_services.json ({len(services)} entries, TLDs: {tlds})")
        except Exception as e:
            # 형식이 잘못돼도 서비스 전체가 멈추지 않도록 직전 목록을 유지합니다.
            logger.error(f"Failed to load local_services.json, keeping previous entries: {e}")
            self._local_services_mtime = None

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
        self.seed_local_services()
        self.load_local_services()
        self.load_stats()
        await self.fetch_all() # 시작 시 항상 최신 데이터 시도

        # 24시간마다 갱신하는 스케줄러 시작
        scheduler = AsyncIOScheduler()
        scheduler.add_job(self.fetch_all, 'interval', hours=24)
        scheduler.start()
        logger.info("Bootstrap Update Scheduler started (24h interval)")

        asyncio.create_task(self._stats_flush_loop())
        logger.info(f"Stats flush loop started ({STATS_FLUSH_INTERVAL}s interval)")

bootstrap_manager = BootstrapManager()
