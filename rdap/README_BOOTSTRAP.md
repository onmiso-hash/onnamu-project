# onnamu RDAP 서비스 구축 요약 (2026-04-25)

본 문서는 자체 RDAP 부트스트랩 서버 구축 및 관련 시스템 고도화 작업의 최종 결과물입니다.

## 1. 부트스트랩 서버 (`bootstrap_server`)
- **주소**: `https://bootstrap.rdap.kr` (내부 포트: 5004)
- **기능**: IANA 데이터를 실시간 동기화하여 전 세계 RDAP 서버로 리다이렉트 수행
- **특징**: 
  - 입력값의 원본 대소문자 유지 (Case-sensitive 지원)
  - ASN 단일 값 및 범위 파싱 로직 적용
  - Entity 태그 매칭 로직 보강
  - CORS 미들웨어 적용 (모든 Origin 허용)

## 2. RDAP 웹 클라이언트
- **파일명**: `rdap-javascript-ko.html`, `rdap-javascript-en.html`
- **주요 수정**:
  - 내비게이션 바 양 끝 정렬 (본문 container 폭 일치)
  - 입력창 소문자 강제 변환 스타일 제거
  - 캐시 버스팅 (`?v=20260425_v1`) 적용
  - 조회 예시(Entity 등) 추가 및 문구 전문화

## 3. 플랫폼 통합
- **onnamu.kr 연동**: 메인 허브의 `Operational Services` 섹션에 공식 등록
- **배포 자동화**: GitHub Actions를 통해 미니PC(C:\Users\onmis\project)에 자동 배포 설정 완료

## 4. 향후 유지보수 참고
- IANA 데이터는 서버 시작 시 및 24시간 주기로 자동 갱신됩니다.
- 신규 TLD나 IP 대역 추가 시 별도의 수정 없이 IANA 업데이트만으로 반영됩니다.
