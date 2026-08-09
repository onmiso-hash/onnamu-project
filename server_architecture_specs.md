# 🖥️ 미니 PC 서버 아키텍처 및 서비스 구성 사양서

본 문서는 미니 PC 서버의 기본적인 인프라 구성, 네트워크 토폴로지, 도커 컨테이너 포트 매핑 및 SSO 연동 규격을 영구적으로 기록하고 관리하는 문서입니다. 향후 추가 작업이나 수정으로 인해 인프라 구성이 변경될 경우 이 문서를 함께 갱신해야 합니다.

---

## 🌐 1. 네트워크 및 외부 도메인 사양

* **서버 공인 IP**: `121.148.79.170`
* **서버 사설 IP (미니 PC)**: `172.30.1.100`
* **기본 게이트웨이 (KT 공유기 사설 IP)**: `172.30.1.254`
* **연동 전면 프록시 (SSL/HTTPS 중계)**: Cloudflare Tunnel (도커 `cloudflared` 컨테이너)
  * `https://onnamu.kr` ──> 내부 `portal-portal` (포트 5001)
  * `https://gallery.onnamu.kr` ──> 내부 `gallery-my-gallery` (포트 5002)
  * `https://namu.onnamu.kr` ──> 내부 `namu-remote-mcp` (포트 8765)
  * `https://namu-cloud.onnamu.kr` ──> 내부 `namu-cloud-routing` (포트 8770)

---

## 🔌 2. 도커(Docker) 컨테이너 및 내부 포트 구성

현재 미니 PC의 Docker Engine 상에 가동 중인 컨테이너 서비스 및 바인딩 포트 매핑 현황입니다.

| 컨테이너 이름 (NAMES) | 이미지 (IMAGE) | 호스트 바인딩 포트 (PORTS) | 내부 구동 포트 | 용도 / 서비스 설명 |
| :--- | :--- | :--- | :---: | :--- |
| **`my-portal`** | `portal-portal` | `0.0.0.0:5001` | `5001` | 통합 로그인 포털 (SSO 인증 서버) |
| **`my-gallery`** | `gallery-my-gallery` | `0.0.0.0:5002` | `5002` | Media Home (미디어 갤러리 / 무비 스트리밍) |
| **`games-service`** | `games-games` | `0.0.0.0:5005` | `5000` | 로비 연동 가속도 웹 게임 허브 |
| **`chronicle-studio`** | `studio-studio` | `0.0.0.0:8080` | `8080` | Chronicle AI Studio (AI 소설/롤플레이 창작 스튜디오) |
| **`rdap-bootstrap`** | `rdap-bootstrap-server` | `0.0.0.0:5004` | `8000` | IANA 동기화 bootstrap RDAP 리다이렉터 |
| **`my-rdap`** | `rdap-my-rdap` | `0.0.0.0:5003` | `80` | RDAP 다국어 웹 클라이언트 및 대시보드 |
| **`namu-remote-mcp`** | `namu-namu` (GitHub 참조 빌드) | `0.0.0.0:8765` | `8765` | NAMU 원격 MCP 서버 (웹 Claude 커넥터용, `namu_data` 볼륨에 `~/.namu` 영속화) |
| **`namu-cloud-routing`** | `namu-cloud-routing:v0.1.45` (clone --recurse-submodules 로컬 빌드) | `0.0.0.0:8770` | `8770` | NAMU 공용 라우팅 MCP 서버 (v0.1.11부터 접속 주소가 `/mcp/<사용자별 열쇠>` — 열쇠 자체가 신원이고 `?user=`는 서버가 덮어쓴다. 전원 공용 `NAMU_HTTP_PATH_SECRET`은 폐기. `namu_cloud_store` 볼륨에 사용자별 저장소 사본 / `namu_cloud_identity` 볼륨에 가입자 장부 `identity.db` 영속화, `/auth/github/*` 웹 로그인 후 완료 화면이 접속 주소 발급. **v0.1.20부터 `/`가 404가 아니다** — 공개 페이지 5장(`/`·`/start`·`/memory`·`/safety`·`/faq`)을 웹 앱이 낸다. 디스패처는 이 다섯 경로만 **정확히 일치**할 때 웹으로 보내고 나머지는 종전대로 MCP+인증 쪽이다. **v0.1.39부터 모든 화면 오른쪽 아래에 AI 안내원 말풍선**이 붙는다(`/auth/ask` POST 전용, 로그인 불필요). 열쇠 `NAMU_ASK_API_KEY`가 없으면 단추 자체를 안 그리므로 화면은 종전과 같다) |
| **`n8n`** | `n8nio/n8n` | `0.0.0.0:5678` | `5678` | 워크플로우 및 텔레그램 모니터링 자동화 봇 |
| **`cloudflared`** | `cloudflare/cloudflared` | 없음 (아웃바운드 터널) | - | Cloudflare Zero Trust 보안 터널링 데몬 |

---

## 📡 3. 공유기 포트 포워딩 (KT GiGA WiFi home)

외부 대용량 전송 우회 및 개발 접근로 확보를 위해 공유기 단에 개방된 포트포워딩 매핑 정보입니다.

* **스트리밍/업로드 다이렉트 우회 채널**:
  * **외부 포트**: `50002` ──> **내부 매핑**: `172.30.1.100` (포트 `5002` / TCP)
  * **목적**: Cloudflare의 단일 파일 100MB 업로드 크기 제한을 우회하기 위한 다이렉트 통로.
  * **변경 사항 (2026-06-14)**: 분할 청크 업로드(10MB) 도입으로 50002 우회 채널뿐만 아니라 본래 포털 주소(https://gallery.onnamu.kr/upload)에서도 대용량 업로드가 성공하도록 개선되었습니다. 또한, 영화관 업로드 완료 시 최종 병합을 위해 docker-compose 상의 `/media/public/movies`, `/media/private/movies`, `/media/family/movies` 디렉토리 마운트 권한이 `:ro`에서 `:rw`로 업그레이드되었습니다.
* **SSH 원격 개발 채널**:
  * **외부 포트**: `50022` ──> **내부 매핑**: `172.30.1.100` (포트 `22` / TCP)
  * **목적**: 원격 터미널 접근용.

---

## 🔑 4. 크로스 스킴(HTTP/HTTPS) SSO 연동 규격 (동기화 프로토콜)

포털(`https://onnamu.kr` - Secure HTTPS)과 직접 우회 채널(`http://gallery.onnamu.kr:50002` - HTTP) 간의 프로토콜 불일치로 인해 브라우저 단에서 `.onnamu.kr` 쿠키가 차단되는 보안 정책을 극복하기 위해 아래의 SSO 연동 방식을 사용합니다.

```
[동작 프로토콜 명세]
1. 갤러리 HTTP 우회 포트(50002) 접근 시, 로그인 쿠키 누락으로 포털(HTTPS) 로그인 페이지로 리다이렉트 처리.
2. 포털 로그인 성공(또는 유지) 시, 복귀 목적지 URL 뒤에 서명된 토큰 파라미터를 추가하여 반환.
   - 포털 처리: redirect(f"{next_url}?token={auth_token}")
3. 갤러리 백엔드에서 URL에 실려 온 토큰을 우선 감지하고 검증.
4. 검증 성공 시, 갤러리 자체 도메인/포트의 오리진 쿠키(auth_token)로 즉시 셋팅 후, 파라미터가 소거된 깨끗한 주소로 최종 리다이렉트 탈출.
```
이를 통해 도메인 및 프로토콜 격리에 영향을 받지 않고 우회 포트 환경에서도 원활하게 세션 상태를 유지할 수 있습니다.
