FROM nginx:alpine

# 소스 파일 복사 (HTML 및 client 폴더)
COPY . /usr/share/nginx/html/

# 메인 페이지를 index.html로 설정
RUN cp /usr/share/nginx/html/rdap-javascript_modify.html /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
