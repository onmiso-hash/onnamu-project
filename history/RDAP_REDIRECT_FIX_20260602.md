# RDAP 부트스트랩 API 표준 리다이렉트(HTTP 307) 응답 복구 및 CORS 우회 적용 (2026-06-02)

지난 통합 과정에서 웹 클라이언트(rdap.kr)의 CORS(Cross-Origin Resource Sharing) 문제를 해결하기 위해 도입된 백엔드 Proxy 기능으로 인해, IANA 표준 부트스트랩 API 규격(RFC 7484)인 HTTP 307 Redirect 기능이 유실되는 부작용이 발생했습니다. 
이로 인해 사용자가 브라우저 주소창이나 curl 등으로 직접 `bootstrap.rdap.kr` 주소에 접근했을 때 원래 리소스 공급자 RDAP 주소로 이동(Redirection)하지 않고 데이터 문자열만 단순 출력되는 현상을 해결하였습니다.

---

## 1. 문제 분석 및 배경

### 🚨 현상 및 원인
1. **서버 측 프록시 강제 적용**: `domain`, `ip`, `nameserver`, `autnum`, `entity` 등의 모든 조회 API 내부에서 `proxy_rdap_request` 함수를 강제 호출하여, 외부 타겟 RDAP 서버의 JSON 응답을 백엔드가 직접 fetch한 뒤 데이터만 리턴하고 있었습니다.
2. **리다이렉트 유실**: 이 때문에 API 요청자는 리다이렉트를 전달받지 못해 브라우저 주소창의 주소가 `bootstrap.rdap.kr` 그대로 유지되는 문제를 초래했습니다.
3. **CORS 제한과 프록시의 양면성**: 
   * **Direct API 호출**: 브라우저 주소창 직접 입력 또는 curl 요청 시에는 브라우저가 직접 리다이렉트 최종 목적지로 주소를 바꾸는 것이 표준 규격에 맞습니다.
   * **Web Client 호출 (`rdap.kr`)**: 웹 화면 내의 JS XHR/fetch로 조회할 때는 타겟 RDAP 서버(예: `rdap.verisign.com`)가 CORS 헤더를 제공하지 않을 경우 브라우저에 의해 차단(CORS error)됩니다. 이를 해결하기 위해 백엔드 프록시가 필요했습니다.

---

## 2. 해결 방안 및 조치 내역

양쪽 요구사항을 완벽히 만족하기 위해 **기본 Redirect + 명시적 Proxy 선택 옵션** 구조를 채택하여 핫픽스를 적용했습니다.

### ① 백엔드 FastAPI 서버 개편 (`bootstrap_server/main.py`)
- 모든 핵심 조회 엔드포인트에 `proxy: bool = False` 쿼리 파라미터를 추가했습니다.
- `proxy=true` 매개변수가 들어오면 기존과 같이 외부 서버의 JSON 데이터를 백엔드가 대리 호출해서 반환(CORS 우회용 프록시 모드)합니다.
- 파라미터가 없거나 `proxy=false`인 경우, RFC 7484 규격에 맞춰 해당 외부 RDAP 서버로 **HTTP 307 Temporary Redirect** 응답(`RedirectResponse`)을 보냅니다.
- **예외 복원력 강화**: `get_client_ip` 함수 내 `request.client`가 존재하지 않는 특수한 로컬/테스트 클라이언트 호출 환경에서도 에러 없이 기본 IP(`127.0.0.1`)를 반환하도록 안전망을 구축했습니다.

### ② 프론트엔드 JavaScript 개편 (`client/js/rdap-client-view.js`)
- 웹 화면 내에서 조회 연동 시 사용하는 `getRDAPURL` 함수를 수정하여, 백엔드 요청 주소에 `?proxy=true` 쿼리 파라미터가 자동으로 붙도록 연동했습니다.
  ```javascript
  function getRDAPURL(typeval, object, lang) {
      return 'https://bootstrap.rdap.kr/' + typeval + '/' + object + '?proxy=true';
  }
  ```
- 이로써 웹 클라이언트 사용자는 브라우저의 CORS 에러 우려 없이 이전과 다름없이 고속 프록시 쿼리를 수행할 수 있습니다.

### ③ 단위 테스트 구축 및 검증 (`scratch/test_rdap_redirect.py`)
- `fastapi.testclient.TestClient`를 기반으로 모의(Mock) 데이터를 활용한 유닛 테스트 케이스를 생성하여 검증을 마쳤습니다.
  - `GET /domain/google.com` -> 307 Redirect (Verisign RDAP 주소 정상 유도 검증)
  - `GET /domain/google.com?proxy=true` -> 200 OK (Proxy 로직 호출 및 JSON 반환 검증)
  - `GET /ip/8.8.8.8` -> 307 Redirect (ARIN RDAP 주소 정상 유도 검증)
  - `GET /ip/8.8.8.8?proxy=true` -> 200 OK (Proxy 로직 호출 검증)

---

## 3. 마일스톤 및 포털 히트맵 기록 완료

* 본 프로젝트 규칙을 준수하여, 로컬 포털 서비스의 히트맵 데이터베이스 파일([portal/data/news.db](file:///home/onmiso/project/onnamu-project/portal/data/news.db)) 내 `work_history` 테이블에 오늘 날짜(`2026-06-02`) 및 작업 이력 데이터를 SQLite 쿼리로 안전하게 주입 완료하였습니다.
