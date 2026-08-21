// 접속 기록 남기기 — 한 줄씩 덧붙이기만 한다.
//
// 포털·도메인 조회와 **같은 폴더에 같은 모양**으로 적는다. 칸 이름을 바꾸면
// 세 곳을 함께 바꾼다(portal/traffic_log.py · rdap/bootstrap_server/traffic_log.py
// · 이 파일). 모양이 어긋나면 관리자 화면이 그 줄을 못 읽는다.
//
//   한 줄  = {"t":시각, "svc":서비스, "ip":접속주소, "cc":나라,
//             "city":도시, "lat":위도, "lon":경도, "path":경로,
//             "via":"cf" 또는 "direct"}
//   한 파일 = <보관함>/<서비스>-YYYY-MM-DD.jsonl (하루 한 장)
//
// 기록은 곁다리다 — 못 적어도 화면은 그대로 나가야 한다. 그래서 모든 실패를
// 여기서 삼킨다.

const fs = require('fs');
const path = require('path');

const TRAFFIC_DIR = process.env.TRAFFIC_DIR || '/traffic';
const KEEP_DAYS = parseInt(process.env.TRAFFIC_KEEP_DAYS || '30', 10);

const FLUSH_LINES = 20;
const FLUSH_MS = 5000;

// 꾸밈 파일은 세지 않는다 — 화면 한 장에 수십 건이 딸려와 숫자가 부풀려진다.
const ASSET_SUFFIXES = [
    '.css', '.js', '.map', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.webp', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp4', '.webm', '.mp3', '.wav',
];

let buffer = [];
let lastFlush = Date.now();
let lastPurge = 0;

function firstValue(req, names) {
    for (const name of names) {
        const value = req.headers[name.toLowerCase()];
        if (value) return String(value).split(',')[0].trim();
    }
    return '';
}

function isAsset(p) {
    const lowered = (p || '').toLowerCase();
    if (lowered.startsWith('/static/') || lowered.startsWith('/data/uploads/')) return true;
    return ASSET_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

// 한국 시각으로 찍는다 — 세 서비스의 줄이 같은 시계를 써야 한 화면에서 섞인다.
function nowInKorea() {
    return new Date(Date.now() + 9 * 3600 * 1000);
}

function stampFor(d) {
    return d.toISOString().slice(0, 19) + '+09:00';
}

function dateFor(d) {
    return d.toISOString().slice(0, 10);
}

// directIp = 서버가 직접 본 주소. Cloudflare를 거쳐 오면 터널의 주소라 쓸모가
// 없지만, 공유기에 열린 포트로 곧장 들어온 접속에는 그것이 유일한 단서다.
function record(service, reqPath, req, directIp) {
    let fileName;
    let text;
    try {
        if (isAsset(reqPath)) return;
        let viaCf = true;
        let ip = firstValue(req, ['CF-Connecting-IP', 'X-Forwarded-For', 'X-Real-IP']);
        if (!ip) { viaCf = false; ip = String(directIp || '').trim(); }
        // 우리 서버가 스스로에게 보내는 생존 확인은 방문자가 아니다.
        if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return;
        const now = nowInKorea();
        // 도시·위도·경도는 Cloudflare에서 '방문자 위치 머리말'을 켜면 붙어 온다.
        // 안 켜져 있으면 빈 칸으로 쌓이고, 켜는 순간부터 저절로 채워진다.
        const line = {
            t: stampFor(now),
            svc: service,
            ip: ip,
            via: viaCf ? 'cf' : 'direct',
            cc: firstValue(req, ['CF-IPCountry']),
            city: firstValue(req, ['CF-IPCity']),
            lat: firstValue(req, ['CF-IPLatitude']),
            lon: firstValue(req, ['CF-IPLongitude']),
            path: (reqPath || '').slice(0, 200),
        };
        fileName = `${service}-${dateFor(now)}.jsonl`;
        text = JSON.stringify(line);
    } catch (e) {
        return;
    }

    buffer.push([fileName, text]);
    if (buffer.length >= FLUSH_LINES || (Date.now() - lastFlush) >= FLUSH_MS) flush();
}

function flush() {
    if (buffer.length === 0) {
        lastFlush = Date.now();
        return;
    }
    const pending = buffer;
    buffer = [];
    lastFlush = Date.now();

    const grouped = new Map();
    for (const [fileName, text] of pending) {
        if (!grouped.has(fileName)) grouped.set(fileName, []);
        grouped.get(fileName).push(text);
    }

    try {
        fs.mkdirSync(TRAFFIC_DIR, { recursive: true });
        for (const [fileName, texts] of grouped) {
            fs.appendFileSync(path.join(TRAFFIC_DIR, fileName), texts.join('\n') + '\n', 'utf8');
        }
    } catch (e) {
        // 못 적었으면 버린다. 다시 쓰려고 쌓아두면 메모리가 무한정 는다.
    }

    maybePurge();
}

// 보관 기간이 지난 파일을 지운다. 한 시간에 한 번만 살펴본다.
function maybePurge() {
    const now = Date.now();
    if (now - lastPurge < 3600 * 1000) return;
    lastPurge = now;
    const cutoffDate = new Date(nowInKorea().getTime() - KEEP_DAYS * 24 * 3600 * 1000);
    const cutoff = dateFor(cutoffDate);
    try {
        for (const name of fs.readdirSync(TRAFFIC_DIR)) {
            if (!name.endsWith('.jsonl')) continue;
            const stamp = name.slice(0, -'.jsonl'.length).slice(-10);
            if (stamp.length === 10 && stamp < cutoff) {
                fs.unlinkSync(path.join(TRAFFIC_DIR, name));
            }
        }
    } catch (e) {
        // 못 지웠으면 다음 시간에 다시 본다.
    }
}

// 모아둔 줄이 서버가 꺼질 때 사라지지 않도록 한다.
process.on('SIGTERM', flush);
process.on('SIGINT', flush);

module.exports = { record, flush };
