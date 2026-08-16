# stream/CLAUDE.md — 영상 직행 통로 (stream.onnamu.kr)

> 공통 규칙: 루트 `CLAUDE.md` 참조. 인프라 사양: `server_architecture_specs.md`

---

## 무엇인가

영화관의 **목록·재생 화면은 `gallery.onnamu.kr`**(Cloudflare 프록시 → 터널 → Flask)이 그대로 낸다.
**영상 알맹이(바이트)만** 이 통로로 직접 내려간다 — Cloudflare를 거치지 않는다.

```
브라우저 ─── https://gallery.onnamu.kr/player/...  (Cloudflare 경유, 화면만)
        └── https://stream.onnamu.kr:50443/v/...   (직행, 영상 바이트)
```

`stream.onnamu.kr`는 Cloudflare DNS에 **A 레코드 / DNS 전용(회색 구름)**으로 등록되어 있어
121.148.79.170(집 회선)으로 곧장 간다. 이 레코드는 2026-05-17 이전 영화관이 쓰던 것으로,
`46a8b0c` 커밋에서 화면이 통합되며 쓰이지 않게 된 것을 2026-08-16에 다시 살렸다.

---

## 구성

| 컨테이너 | 이미지 | 하는 일 |
|---|---|---|
| `stream-nginx` | `nginx:alpine` | 5443에서 TLS 종단, 서명 검사 후 영상 파일 직접 전송 |
| `stream-certbot` | `certbot/dns-cloudflare` | 인증서 발급·자동 갱신 (DNS-01, 12시간 주기) |

포트: 공유기 **외부 50443** → 미니PC `172.30.1.100:5443`.
80번은 KT 공유기 관리 화면(GoAhead-Webs)이 점유 중이라 **HTTP-01 방식은 쓸 수 없다** — DNS-01만 가능.

미디어 폴더 3종(`public`/`private`/`family`)을 갤러리와 동일 경로로 **읽기 전용** 마운트한다.

---

## 권한 확인 — 서명된 주소

주소가 다르면 `gallery_auth_token` 쿠키가 따라가지 않는다. 그래서 **로그인 검사를 이미 통과한
갤러리가** 기한이 붙은 서명을 만들어 주고, nginx는 그 서명만 검사한다.

```
https://stream.onnamu.kr:50443/v/<폴더>/movies/<파일>?md5=<서명>&expires=<기한>
```

- 규칙: nginx `secure_link_md5` — `"$secure_link_expires$uri <STREAM_SECRET>"`
  (열쇠가 **뒤에** 붙는다 — 앞에 붙이면 length-extension에 취약하다)
- 만드는 쪽: `gallery/app.py`의 `build_stream_url()`
- 검사하는 쪽: `nginx/stream.conf.tpl`의 `location /v/`
- 기한: 기본 12시간(`STREAM_TTL`). 재생 도중 만료되면 건너뛰기가 막히므로 넉넉히 준다.

서명은 **경로에 묶인다.** 다른 파일에 옮겨 붙이면 403이다.

| 상황 | 응답 |
|---|---|
| 정상 | 200 / 206 |
| 서명 없음·위조·다른 파일에 전용 | 403 |
| 기한 지남 | 410 |

---

## 환경변수 (`gallery/.env`에 넣으면 배포 시 `stream/.env`로 복사된다)

| 이름 | 용도 |
|---|---|
| `STREAM_SECRET` | 갤러리와 나눠 갖는 서명 열쇠. **영문자·숫자만** (`openssl rand -hex 32`) |
| `CERTBOT_EMAIL` | 인증서 만료 알림 주소 (Cloudflare 계정 메일과 무관) |
| `STREAM_BASE_URL` | 갤러리 쪽 설정. `https://stream.onnamu.kr:50443` |

Cloudflare 자격은 **둘 중 하나**만 있으면 된다. `stream-certbot`이 알아서 고른다(토큰 우선).

| 방식 | 넣을 이름 |
|---|---|
| ① API 토큰 (권장) | `CF_DNS_API_TOKEN` |
| ② 글로벌 API 키 | `CF_API_EMAIL` + `CF_API_KEY` |

**①이 막힐 수 있다.** Cloudflare는 계정 메일이 확인되지 않으면 **API 토큰 생성 자체를 거부**한다
(`Please verify your email. (Code: 1211)`). 공식 안내문의 제한 목록에는 토큰이 없지만 실제로는 막힌다 —
2026-08-16에 이 계정에서 그 상황을 겪었다. 그때는 ②를 쓴다. 글로벌 키는 **새로 만드는 게 아니라
계정에 이미 있는 값을 보는 것**이라 생성 제한에 걸리지 않는다.

`certbot_dns_cloudflare` 플러그인이 두 형식을 모두 받는 것은 이미지 안의 플러그인 소스와
`--dry-run` 실행으로 확인했다(가짜 키로 Cloudflare API 호출 단계까지 도달).

**`STREAM_SECRET`에 `\|`나 `&`를 넣지 말 것** — 설정 파일에 `sed`로 채워 넣으므로 깨진다.

---

## 켜고 끄기

`STREAM_BASE_URL` 또는 `STREAM_SECRET`이 비어 있으면 `build_stream_url()`이 `None`을 돌려주고,
재생 화면은 **종전처럼 `/media/...`(Cloudflare 경유)를 쓴다.** 통로가 죽어도 영화는 나온다.

`deploy.yml`도 두 값이 `gallery/.env`에 있을 때만 이 폴더를 배포한다.

---

## 주의

- **인증서 갱신 실패는 조용하다.** 90일마다 갱신되며, 실패하면 만료 시점에 영상만 끊긴다
  (화면은 멀쩡하다). `docker logs stream-certbot`을 가끔 볼 것.
- nginx는 인증서가 생길 때까지 기다렸다가 뜬다. 처음 발급은 1~2분 걸린다.
- 이 통로로 **업로드는 받지 않는다** (`client_max_body_size 1k`).
