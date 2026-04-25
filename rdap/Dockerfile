FROM python:3.11-slim

WORKDIR /app

# 소스 파일 복사
COPY . .

# 메인 페이지를 index.html로 설정
RUN cp rdap-javascript-ko.html index.html

# Python 내장 HTTP 서버를 사용하여 80포트로 서빙
EXPOSE 80
CMD ["python", "-m", "http.server", "80"]
