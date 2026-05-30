FROM python:3.11-slim

WORKDIR /app

# requirements.txt 복사 및 의존성 설치
COPY bootstrap_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# rdap 내 전체 소스 파일(client 디렉토리, HTML 파일, 백엔드 등)을 복사
COPY . .

# 데이터 저장 디렉토리 생성
RUN mkdir -p bootstrap_server/data

EXPOSE 8000

# uvicorn을 사용하여 백엔드 서비스 실행
CMD ["uvicorn", "bootstrap_server.main:app", "--host", "0.0.0.0", "--port", "8000"]
