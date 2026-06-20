# CLAUDE.md

> 전체 아키텍처·히스토리: **`GEMINI.md`** (최우선)
> 인프라 사양(IP·포트·볼륨): **`server_architecture_specs.md`**

---

## 필수 작업 규칙

- **사전 승인**: 코드 수정·파일 생성·명령 실행 전 계획 보고 후 착수.
- **커밋**: 메시지 반드시 **한글**. 커밋 후 `git push origin main` 자동 실행.
- **히트맵**: 작업 완료 후 포털 API로 `work_history` 기록. (포털은 Docker named volume 사용 — 로컬 sqlite3 직접 접근 불가)
- **완료 보고**: "완료되었습니다" 대신 "수정을 완료했으며 확인이 필요합니다".
- **영향도 분석**: 수정 전 연관 모듈 영향 먼저 분석·보고.

```bash
SECRET_KEY=$(grep SECRET_KEY gallery/.env | cut -d= -f2)
curl -s -X POST https://onnamu.kr/api/work/save \
  -H "X-API-Key: $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"AI작업\", \"title\":\"제목\", \"content\":\"내용\", \"date\":\"$(date +%Y-%m-%d)\"}"
```

---

## 서비스 구성

| 서비스 | 디렉터리 | 스택 | 포트 |
|---|---|---|---|
| Portal | `portal/` | Flask + SQLite | 5001 |
| Gallery | `gallery/` | Flask + Pillow | 5002 |
| Games | `games/` | Flask | 5005 |
| Chronicle AI | `studio/` | Node.js/Express | 8080 |
| RDAP | `rdap/` | FastAPI / Static | 5003–5004 |

외부: **Cloudflare Tunnel** (HTTPS). 환경변수: `gallery/.env` → 배포 시 각 서비스로 복사.
SSO: HMAC-SHA256 서명 토큰 30일. 상세 인증 플로우 → `gallery/CLAUDE.md`.

---

## 개발·배포 명령

```bash
python app.py                           # Flask (portal/gallery/games)
npm start                               # Studio (port 8080)
uvicorn main:app --reload --port 8000   # RDAP Bootstrap
docker compose up -d --build            # Docker 개별 서비스
docker logs <container> --tail 50       # 로그 확인
git push origin main                    # 전체 배포 트리거
```

---

## 코딩 원칙

- **먼저 질문**: 가정·해석이 여럿이면 제시. 불명확하면 착수 전 질문.
- **최소 구현**: 요청된 것만. 추측성 기능·불필요한 추상화 금지.
- **외과적 수정**: 요청된 라인만. 인접 코드 개선·스타일 변경 금지.
- **히스토리**: 중요 변경 시 `GEMINI.md` 추가 + `history/TASK_YYYYMMDD.md` 작성.

---

## 서브프로젝트 상세

각 디렉터리의 `CLAUDE.md` 참조:
- `studio/CLAUDE.md` — 페르소나, RAG, `[BR]` 처리, 어드민 전용 API
- `gallery/CLAUDE.md` — SSO 크로스스킴 플로우, `gallery_auth_token` 쿠키
