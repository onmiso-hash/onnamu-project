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

- 판정 함수: `auth_helper.py`의 `current_identity()` — **화면이든 API든 이것만 쓸 것.**
  쿠키를 직접 읽으면 규칙이 두 벌이 되어 한쪽만 고쳐진다(사고의 원인이 정확히 이것).
- 막는 검사: `scripts/check_gallery_identity.py` (push 전 자동 실행, 실패 시 push 중단)

---

## 토큰 구조

```
base64url(payload_json) + "." + hmac_sha256_hex
payload: { username, exp, is_admin, folders }
만료: 30일
```

검증 로직: `auth_helper.py` (공유 `SECRET_KEY` 사용).
