# RDAP 서비스 아키텍처 통합 및 캐시 문제 근본적 해결 (2026-05-31)

RDAP 관련 서비스를 수정하고 재배포할 때, Cloudflare Edge 및 브라우저단의 강력한 정적 리소스 캐싱으로 인해 업데이트 사항이 즉시 화면에 반영되지 않는 문제를 근본적으로 해결하고, 배포 아키텍처를 슬림화하기 위해 프론트엔드와 백엔드 서비스를 단일 FastAPI 서비스로 통합하는 개편 작업을 완료하였습니다.

---

## 1. 개요 및 배경

기존 RDAP 서비스는 다음 두 개의 독립적인 컨테이너가 서로 다른 포트에서 구동되고 있었습니다.
- **my-rdap (5003 포트)**: Python 내장 `http.server`를 사용한 프론트엔드(HTML, JS, CSS) 서빙
- **bootstrap-server (5004 포트)**: FastAPI 기반의 백엔드 RDAP 부트스트랩 API 서빙

### 🚨 기존 구조의 문제점
1. **캐시 제어의 부재**: Python 내장 `http.server`는 정적 리소스 응답 시 `Cache-Control` 헤더를 전혀 명시하지 않아, 브라우저와 전면의 Cloudflare CDN이 정적 파일(JS, CSS, HTML)을 극도로 강력하게 로컬 캐싱하는 고질적 문제를 유발함.
2. **수동 버전 관리의 한계**: HTML 소스코드에 하드코딩된 버전 파라미터(`?v=...`)는 누락 위험이 커 완벽한 캐시 무효화(Cache-Busting)를 보장하지 못함.
3. **아키텍처 복잡성**: 단순 1인용/통합 관리 서버 형태임에도 불필요하게 2개의 컨테이너와 포트를 사용하고 있었으며, 이로 인해 프론트-백엔드 간 CORS(크로스 오리진) 설정 및 멀티 포트 포워딩 관리 비용 발생.

---

## 2. 해결 방안 및 조치 내역

기존 2개의 컨테이너로 조각나 있던 서비스를 **단일 FastAPI 서버**로 완벽하게 통합하고, 강력한 HTTP 헤더 기반의 캐시 제어 메커니즘을 도입했습니다.

### ① Docker Compose 개편 (`docker-compose.yml`)
* 프론트엔드를 호스팅하던 `my-rdap` 서비스를 완전히 제거하여 아키텍처를 슬림화했습니다.
* **사용자 편의성 확보(Cloudflare 무설정)**: `bootstrap-server` 컨테이너에 **듀얼 포트 포워딩(`5003:8000`, `5004:8000`)**을 선언하였습니다.
  * 기존 `rdap.kr` (Cloudflare Tunnel 5003 포트 매핑) 및 `bootstrap.rdap.kr` (Cloudflare Tunnel 5004 포트 매핑)을 **서버 측 설정 수정 없이 100% 그대로 유지**할 수 있도록 완벽하게 연결 유연성을 보장했습니다.

### ② Docker 빌드 환경 통합 (`Dockerfile`)
* `bootstrap_server/Dockerfile`을 삭제하고, 루트의 `Dockerfile`을 개편하여 전체 빌드 컨텍스트(`rdap/` 내의 `client/` 폴더, HTML 파일들, API 서버 전체)를 단일 도커 컨테이너 내부로 올바르게 카피 및 빌드하도록 구조화했습니다.

### ③ FastAPI 커스텀 캐시 통제 도입 (`main.py`)
* **`NoCacheStaticFiles` 클래스 정의**: FastAPI의 `StaticFiles`를 상속받은 특화 클래스를 정의하여, `/client/*` 하위의 모든 정적 자산(CSS, JS, 폰트 등) 반환 시 브라우저 및 CDN 단에 **캐시 불가 및 강제 재검증 헤더**를 반드시 응답에 실어 보내도록 제어했습니다.
  ```http
  Cache-Control: no-cache, no-store, must-revalidate, proxy-revalidate
  Pragma: no-cache
  Expires: 0
  Surrogate-Control: no-store
  ```
* **HTML 개별 라우터 구현**: `/rdap-about-ko.html` 등 핵심 4개 HTML 및 루트 `/` 요청에 대해 동일한 캐시 제어 헤더를 주입해 리턴하는 API 라우팅 함수를 신설하여, 화면단 HTML 자체에 대한 캐싱도 완전히 소멸시켰습니다.
* **하위 호환성 유지**: 루트 경로(`/`)에 대해 백엔드 헬스체크 JSON 응답(Accept: `application/json` 타겟)과 일반 사용자 브라우저 요청(HTML 렌더링)을 스마트하게 인지하고 분기 서빙하도록 보정했습니다.

---

## 3. 포털 히트맵 연동 완료

* 본 규칙에 의거하여, 포털 히트맵 데이터베이스 파일([portal/data/news.db](file:///home/onmiso/project/onnamu-project/portal/data/news.db))의 `work_history` 테이블에 오늘 날짜(`2026-05-31`)로 상세 개발 내역을 직접 SQL 쿼리 주입하여 히트맵 마일스톤 연동을 완료하였습니다.
