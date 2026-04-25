# RDAP 부트스트랩 서버 구축 실행 계획서

본 문서는 `https://rdap.kr/bootstrap/` 주소를 기반으로 IANA의 부트스트랩 데이터를 관리하고, 실시간 리다이렉트 기능을 제공하는 가벼운 API 서버 구축 계획을 담고 있습니다.

## 1. 프로젝트 개요
- **목표**: IANA 표준 데이터를 활용한 자체 RDAP 부트스트랩 서비스 운영
- **핵심 기능**:
    1. IANA 부트스트랩 JSON 파일 주기적 동기화 (Fetching & Caching)
    2. 부트스트랩 정적 파일 제공 (`/bootstrap/dns.json` 등)
    3. 실시간 쿼리 리다이렉트 (`/bootstrap/domain/{name}`, `/bootstrap/ip/{address}` 등)
- **기본 URL**: `https://rdap.kr/bootstrap/`

## 2. 기술 스택
- **Language**: Python 3.9+
- **Framework**: FastAPI (고성능, 비동기 처리에 최적화)
- **Scheduler**: APScheduler (IANA 데이터 주기적 자동 갱신)
- **Container**: Docker & Docker Compose (배포 최적화)

## 3. 상세 기능 설계

### 3.1. 데이터 매니저 (Bootstrap Manager)
- **동기화**: `https://data.iana.org/rdap/`에서 24시간마다 데이터를 갱신.
- **저장**: 메모리 내 데이터 구조(In-memory cache)와 로컬 파일 시스템에 동시 저장.
- **분석**: JSON 구조를 파싱하여 빠른 검색이 가능한 트리 또는 딕셔너리 구조로 변환.

### 3.2. API 엔드포인트 및 리다이렉트 로직
RFC 7484 표준에 따른 리다이렉트 구현:

1. **도메인 리다이렉트** (`/domain/{domain_name}`)
    - 입력받은 도메인의 TLD(예: `.kr`)를 추출.
    - `dns.json`에서 해당 TLD를 담당하는 RDAP 서버 주소를 찾아 **HTTP 307(Temporary Redirect)** 응답.

2. **IP 리다이렉트** (`/ip/{address}`)
    - IPv4/IPv6 주소를 CIDR 형식으로 변환.
    - `ipv4.json` 또는 `ipv6.json`의 네트워크 대역과 비교하여 일치하는 관리 기구 서버로 리다이렉트.

3. **AS 번호 리다이렉트** (`/autnum/{number}`)
    - AS 번호가 속한 범위를 `autnum.json`에서 찾아 리다이렉트.

4. **정적 파일 제공** (`/{filename}.json`)
    - IANA에서 가져온 원본 JSON 파일 그대로 제공.

## 4. 개발 로드맵
- **1단계: 환경 구성**: 프로젝트 폴더 구조 생성 및 Docker 환경 설정.
- **2단계: 데이터 동기화 구현**: IANA 소스를 가져와 메모리에 로드하는 로직 작성.
- **3단계: 리다이렉트 엔진 개발**: TLD 및 IP 대역 매칭 알고리즘 구현.
- **4단계: API 엔드포인트 구성**: FastAPI를 이용한 웹 서버 인터페이스 개발.
- **5단계: 테스트 및 검증**: 다양한 도메인과 IP로 리다이렉트 정상 작동 확인.

## 5. 최종 검토 및 수정
- 개발 완료 후 소스 코드 및 동작 상태 리뷰.
- 사용자 피드백 반영 및 최적화.
