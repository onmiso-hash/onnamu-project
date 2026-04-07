FROM python:3.11-slim
WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir flask psutil
EXPOSE 5001
CMD ["python", "app.py"]