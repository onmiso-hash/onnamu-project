FROM python:3.11-slim

WORKDIR /app

COPY bootstrap_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bootstrap_server/ .
COPY rdap-dashboard.html .

# 데이터 저장 디렉토리 생성
RUN mkdir -p data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
