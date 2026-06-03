# Windows SSH 배포 자동화 Docker 자격 증명 오류 우회 및 로그 유실 조치

본 문서는 2026년 6월 3일 발생한 `Chronicle AI Studio` 및 기타 마이크로서비스 자동 배포(GitHub Actions -> Windows SSH) 실패 장애의 원인 분석 및 해결 조치 사항을 기록합니다.

## 1. 개요 및 장애 내용
- **장애 현상**: `onnamu-project`의 main 브랜치에 코드를 푸시할 때, Windows 기반 Mini PC로 원격 자동 빌드 배포(SSH 배포)를 시도하는 도중 에러가 나거나 배포 로그가 중간에 끊겨서 완료되지 않는 문제 발생.
- **주요 로그 에러 내용**:
  ```
  #3 [internal] load metadata for docker.io/library/node:18-alpine
  #3 ERROR: error getting credentials - err: exit status 1, out: `A specified logon session does not exist. It may already have been terminated.`
  ------
  failed to solve: error getting credentials - err: exit status 1, out: `A specified logon session does not exist. It may already have been terminated.`
  ```

## 2. 원인 분석

### A. Docker Desktop Credential Helper 접근 장애
- Windows 환경에서 GitHub Actions와 같은 SSH 비대화형 세션(Non-interactive Session)을 통해 `docker build`나 `docker compose`를 구동할 때 발생합니다.
- `studio` 서비스 빌드 시 Docker는 베이스 이미지인 `node:18-alpine`을 가져와야 하지만, Windows의 자격 증명 관리 헬퍼(`docker-credential-desktop.exe`)가 백그라운드 세션에 잠겨 사용자 자격 증명(Credential Store)에 접근하지 못해 pull 단계에서 다운로드 실패 예외를 발생시켰습니다.

### B. PowerShell 상대 경로 `cd` 디렉토리 이동에 따른 로그 분산
- 기존 배포 스크립트(`deploy.yml`)는 각 서비스를 배포하기 위해 해당 디렉토리로 `cd` 이동을 한 후, `>> deploy.log`를 사용해 상대 경로 리다이렉션을 실행했습니다.
- PowerShell 내에서 `cd`에 의해 작업 경로가 변경되자 `deploy.log` 파일도 각 하위 폴더(`gallery/deploy.log`, `studio/deploy.log` 등)로 개별 분산 저장되어 생성되었습니다.
- 결과적으로 루트 경로의 `deploy.log`에는 극초반 단계(`--- Deploy Gallery ---`)까지만 로그가 남고 멈춘 것처럼 유실되는 현상이 동반되었습니다.

## 3. 해결 조치 사항

### A. Docker Config 파일 내 빈 자격 증명 구조 강제 설정 (`deploy.yml` 수정)
- 임시로 환경 변수를 적용하는 디렉토리(`C:\Users\onmis\project\temp_docker_config`) 아래에 빈 `config.json` 파일을 명시적으로 생성하도록 배포 스크립트를 변경했습니다.
  ```powershell
  Set-Content -Path C:\Users\onmis\project\temp_docker_config\config.json -Value '{}'
  ```
- 이 빈 설정 파일이 존재함에 따라 Docker CLI는 더 이상 시스템의 자격 증명 저장소(`credsStore`) 헬퍼를 경유하지 않고, 퍼블릭 레지스트리(Docker Hub)의 오픈 이미지를 인증 에러 없이 다운로드할 수 있게 되었습니다.

### B. 로그 저장 절대 경로 변수 적용
- PowerShell 스크립트 전반에 걸쳐 `$logPath = 'C:\Users\onmis\project\deploy.log'` 변수를 정의하여, 디렉토리 이동(`cd`)이 일어나더라도 항상 동일한 절대 경로 파일에 모든 로그가 누적 기록되도록 변경했습니다.
- 이를 통해 배포 과정 전체를 일관되게 단일 파일에 로깅하게 되었으며 로그 유실 현상이 해결되었습니다.

## 4. 결과 검증
- 수정된 `.github/workflows/deploy.yml` 파일을 `main` 브랜치에 커밋/푸시하여 GitHub Actions 배포 세션이 오류 없이 정상 통과되었고, `Chronicle AI Studio` 및 기타 모든 서비스가 정상적으로 재빌드되어 작동됨을 확인했습니다.
- 작업 완료 후, 포털 서비스의 로컬 DB(`portal/data/news.db`) 내 `work_history` 테이블에 금일 일일 작업 이력 데이터를 주입하였습니다.
