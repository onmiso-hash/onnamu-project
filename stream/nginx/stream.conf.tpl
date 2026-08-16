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
