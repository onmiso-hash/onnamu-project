# gallery/CLAUDE.md — Gallery 서비스

> 공통 규칙: 루트 `CLAUDE.md` 참조.

---

## SSO 크로스스킴 인증 플로우

직접 우회 포트(`50002`) 접근 시 HTTP/HTTPS 간 쿠키 공유가 안 되므로 URL 파라미터 토큰 방식 사용:

1. 갤러리: `gallery_auth_token` 쿠키 없음 → 포털 `/login?next=<url>` 리다이렉트
2. 포털: 로그인 성공 → `<next_url>?token=<signed_token>` 리다이렉트
3. 갤러리: URL 파라미터 토큰 감지 → 검증 후 `gallery_auth_token` 쿠키 세팅 → 파라미터 제거된 URL로 최종 리다이렉트

**주의**: 포털 쿠키(`auth_token`)와 갤러리 쿠키(`gallery_auth_token`)는 이름이 다름.

---

## 토큰 구조

```
base64url(payload_json) + "." + hmac_sha256_hex
payload: { username, exp, is_admin, folders }
만료: 30일
```

검증 로직: `auth_helper.py` (공유 `SECRET_KEY` 사용).
