# gallery/CLAUDE.md — Gallery 서비스

> 공통 규칙: 루트 `CLAUDE.md` 참조.

---

## SSO 크로스스킴 인증 플로우

직접 우회 포트(`50002`) 접근 시 HTTP/HTTPS 간 쿠키 공유가 안 되므로 URL 파라미터 토큰 방식 사용:

1. 갤러리: `gallery_auth_token` 쿠키 없음 → 포털 `/login?next=<url>` 리다이렉트
2. 포털: 로그인 성공 → `<next_url>?token=<signed_token>` 리다이렉트
3. 갤러리: URL 파라미터 토큰 감지 → 검증 후 `gallery_auth_token` 쿠키 세팅 → 파라미터 제거된 URL로 최종 리다이렉트

**주의**: 포털 쿠키(`auth_token`)와 갤러리 쿠키(`gallery_auth_token`)는 이름이 다름.

### ⚠ 신분은 포털 쿠키가 정한다 (2026-08-18 사고 이후)

`gallery_auth_token`은 **신분이 아니라 베껴 둔 사본**이다. 30일을 살기 때문에,
그 사이 브라우저에서 다른 사람이 포털에 로그인해도 옛 사람 이름이 그대로 남는다.

> 실제 사고: admin으로 한 번 본 브라우저에서 guest1로 로그인해 갤러리를 열자
> 갤러리가 자기 사본의 `admin`을 읽어 private/family 433개를 전부 내줬다.

그래서 `onnamu.kr` 밑에서는 **매 요청마다 포털 쿠키(`auth_token`)를 신분으로 삼고**,
사본의 이름이 다르면 갈아 끼운다. 포털 쿠키가 없으면(=로그아웃) 사본이 남아 있어도 쓰지 않는다.

- 판정 규칙의 **원본은 `shared/auth_common.py`** 한 벌이다(2026-08-19). `gallery/auth_common.py`는
  도커 빌드 때문에 둔 사본이라 직접 고치면 push가 막힌다 — 원본을 고치고 `scripts/sync_auth_common.sh`.
- 판정 함수: `auth_helper.py`의 `current_identity()` — **화면이든 API든 이것만 쓸 것.**
  쿠키를 직접 읽으면 규칙이 두 벌이 되어 한쪽만 고쳐진다(사고의 원인이 정확히 이것).
- 막는 검사: `scripts/check_gallery_identity.py` + `scripts/check_identity_common.py`
  (둘 다 push 전 자동 실행, 실패 시 push 중단)

---

## ⚠ 캐시 — 화면은 얼리지 않는다 (2026-08-20 사고 이후)

캐시 규칙이 **"주소가 `.mp4`로 끝나는가"**였다. 재생 화면 주소가
`/player/영화이름.mp4`라서 **화면(HTML)까지 30일 얼어붙었다.**

> 실제 사고: 폰이 옛 재생 화면을 물고 서버에 다시 묻지 않았다. 그 화면 안에는
> 직행 통로가 아직 없던 시절의 느린 주소(`/media/…`)가 박혀 있어서, 영상이
> 계속 파이썬 서버를 통해 나갔다. 미니PC CPU가 100%를 쳤다.
> **서버에 재생 화면 요청이 27시간 동안 0건**이라 로그만 봐서는 알 수 없었다.
> 클라우드플레어도 같은 이유로 이 화면을 캐시 대상(`MISS`)으로 잡고 있었다.

- 판정 규칙의 **원본은 `gallery/cache_policy.py`** 한 벌이다. 확장자가 아니라
  **경로 앞부분**(`/media/`·`/thumbnail/`·`/subtitle/`)으로 가른다. 화면은 어떤
  이름으로 끝나든 들어올 수 없다. 응답 후처리에 규칙을 다시 적지 말 것.
- 로그인 안내(302)·오류(404)는 얼리지 않는다 — 얼면 로그인한 뒤에도 계속 튕긴다.
- **재생 주소는 `/watch/…`** 다. `/player/…`는 옛 주소이며 새 주소로 보내기만 한다.
  (얼어붙은 옛 화면을 즉시 버리려고 주소를 바꾼 것이다)
- **썸네일 만드는 방식을 고치면 `app.py`의 `THUMB_VERSION`을 1 올릴 것.**
  썸네일 주소는 30일 캐시라, 안 올리면 폰이 옛 썸네일을 30일 더 보여준다.
  화면·코드 수정은 번호와 무관하게 바로 반영된다(화면은 캐시하지 않으므로).
- **직행 통로 값(`STREAM_BASE_URL`·`STREAM_SECRET`)이 비면 배포가 막힌다.**
  예전에는 비어도 조용히 느린 길로 내려앉았고, 그때 열린 화면이 얼어붙었다.
- 막는 검사: `scripts/check_gallery_cache.py` (push 전 자동 실행, 실패 시 push 중단)

---

## 토큰 구조

```
base64url(payload_json) + "." + hmac_sha256_hex
payload: { username, exp, is_admin, folders }
만료: 30일
```

검증 로직: `auth_helper.py` (공유 `SECRET_KEY` 사용).
