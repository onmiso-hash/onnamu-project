# 영상 직행 통로 — stream.onnamu.kr
#
# 목록·재생 화면은 https://gallery.onnamu.kr(클라우드플레어 경유)이 그대로 낸다.
# 무거운 영상 알맹이만 이 통로로 직접 내려간다.
#
# 권한 확인은 서명으로 한다. 갤러리가 로그인한 사람에게만 서명된 주소를 만들어 주고,
# 여기서는 그 서명이 맞는지만 본다(쿠키가 오지 않는 다른 주소이므로).
#
# ⚠ __STREAM_SECRET__ 은 컨테이너가 뜰 때 sed로 치환된다(docker-compose.yml 참고).
#    갤러리의 STREAM_SECRET 과 같은 값이어야 한다.

server {
    listen              5443 ssl;
    http2               on;
    server_name         stream.onnamu.kr;

    ssl_certificate     /etc/letsencrypt/live/stream.onnamu.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stream.onnamu.kr/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1h;

    # 영상은 크다. 업로드는 이 통로로 받지 않으므로 본문 크기는 최소로 막는다.
    client_max_body_size 1k;

    server_tokens off;
    add_header X-Content-Type-Options nosniff always;

    # ── 영상 알맹이 ──────────────────────────────────────────────
    # /v/<폴더>/movies/<파일이름>?md5=<서명>&expires=<기한>
    location /v/ {
        secure_link     $arg_md5,$arg_expires;
        secure_link_md5 "$secure_link_expires$uri __STREAM_SECRET__";

        # 서명이 없거나 틀림 (다른 파일에 붙은 서명을 옮겨 붙인 경우도 여기)
        if ($secure_link = "")  { return 403; }
        # 서명은 맞지만 기한이 지남
        if ($secure_link = "0") { return 410; }

        alias /media/;

        # 건너뛰기·이어보기가 되려면 구간 요청을 받아야 한다.
        add_header Accept-Ranges bytes always;
        # 서명에 기한이 들어 있으므로 중간 캐시에 남기지 않는다.
        add_header Cache-Control "private, max-age=0, no-store" always;

        sendfile           on;
        sendfile_max_chunk 1m;
        tcp_nopush         on;
        aio                threads;
        directio           16m;
        output_buffers     4 512k;
    }

    # 그 밖의 모든 요청은 아무것도 알려주지 않는다.
    location / { return 404; }
}

# ══════════════════════════════════════════════════════════════════
# 대용량 올리기 통로 — 바깥 50002번이 이 자리로 들어온다.
#
# 예전에는 갤러리 앱(파이썬 개발용 서버)이 이 자리에 그대로 노출돼 있었고
# 암호화도 없었다. 이제 nginx가 앞에 서서 암호화를 맡고, 갤러리는 집 안에만 있는다.
# 포트 번호를 높은 것으로 유지하는 것은 훑고 다니는 기계에 덜 걸리게 하기 위해서다
# (2026-08-23 사용자 결정 — 표준 포트로 옮기는 안은 보류했다).
# ══════════════════════════════════════════════════════════════════
server {
    listen              5444 ssl;
    http2               on;
    server_name         stream.onnamu.kr;

    ssl_certificate     /etc/letsencrypt/live/stream.onnamu.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stream.onnamu.kr/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1h;

    server_tokens off;
    add_header X-Content-Type-Options nosniff always;

    # 이 통로가 있는 이유가 대용량 올리기다. 크기를 막지 않는다.
    client_max_body_size 0;

    location / {
        proxy_pass         http://host.docker.internal:5002;
        proxy_http_version 1.1;

        # 받은 이름을 그대로 넘긴다 — 갤러리가 돌아올 주소를 만들 때 :50002가 붙어야 한다.
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        # 갤러리가 '암호화로 들어왔다'를 알아야 로그인 왕복이 끊기지 않는다.
        proxy_set_header X-Forwarded-Proto https;

        # 큰 파일을 통째로 모았다가 보내지 않는다.
        proxy_request_buffering off;
        proxy_buffering         off;

        # 큰 파일은 오래 걸린다.
        proxy_connect_timeout 60s;
        proxy_send_timeout    1h;
        proxy_read_timeout    1h;
    }
}
