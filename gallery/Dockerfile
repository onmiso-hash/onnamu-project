FROM python:3.11-slim

WORKDIR /app

# gunicorn 제거, Pillow(썸네일용)는 유지
RUN pip install --no-cache-dir \
    flask==3.0.0 \
    werkzeug==3.0.1 \
    Pillow==10.2.0

COPY . .
EXPOSE 5002

# 원래 쾌적하게 영상이 잘 나오던 방식으로 원복
CMD ["python", "app.py"]