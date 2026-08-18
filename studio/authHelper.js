const crypto = require('crypto');
const path = require('path');

function verifyAuthToken(token, secretKey) {
    try {
        if (!token) return null;
        const parts = token.split('.');
        if (parts.length !== 2) return null;
        const [payloadB64, signature] = parts;
        
        const expectedSignature = crypto
            .createHmac('sha256', secretKey)
            .update(payloadB64)
            .digest('hex');
            
        const isSignatureValid = crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
        if (!isSignatureValid) return null;
        
        const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        
        if (Date.now() / 1000 > payload.exp) return null;
        return payload;
    } catch (err) {
        return null;
    }
}

// --- 지금 권한을 포털에 물어본다 ---
// 출입증에도 권한이 적혀 있지만 그것은 발급 시점(최대 30일 전)의 사실이다.
// 권한을 바꾸거나 계정을 잠근 것이 곧바로 듣게 하려면 그때그때 물어야 한다.
// 매 요청마다 묻지는 않는다 — 60초 동안은 마지막에 들은 답을 쓴다.
const PERM_TTL_MS = 60 * 1000;
const permCache = new Map();   // 아이디 -> { at, perms }

// 기계끼리 부르는 출입증의 아이디 앞머리. 계정표에 없는 것이 정상이라 권한을 묻지 않는다.
// (포털이 계정을 지우며 여기 자료 정리를 시킬 때 system_portal 이름으로 온다.
//  묻던 시절에는 '없는 계정'으로 401을 돌려줘 정리가 조용히 실패했다 — 2026-08-19 실측.)
// 이 규칙의 원본은 shared/auth_common.py 의 is_machine_identity 다.
const MACHINE_PREFIX = 'system_';
function isMachineIdentity(username) {
    return !!username && username.startsWith(MACHINE_PREFIX);
}

// 로그인 화면 주소 — 출입증이 없을 때와 계정이 없어졌을 때가 같은 곳으로 간다.
function portalLoginBase(req) {
    let portalUrl = process.env.PORTAL_URL || '';
    if (!portalUrl) {
        const reqHost = req.headers.host || '';
        if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
            portalUrl = `http://${reqHost.split(':')[0]}:5001`;
        } else {
            portalUrl = 'https://onnamu.kr';
        }
    }
    return portalUrl;
}

function portalInternalUrl() {
    // 서비스끼리는 바깥 주소를 돌지 않고 기계 안에서 바로 부른다.
    return process.env.PORTAL_INTERNAL_URL || 'http://host.docker.internal:5001';
}

async function fetchPermissions(username, secretKey) {
    const now = Date.now();
    const cached = permCache.get(username);
    if (cached && now - cached.at < PERM_TTL_MS) return cached.perms;

    try {
        const res = await fetch(
            `${portalInternalUrl()}/api/auth/permissions/${encodeURIComponent(username)}`,
            { headers: { 'X-API-Key': secretKey } }
        );
        if (!res.ok) throw new Error(`portal responded ${res.status}`);
        const perms = await res.json();
        permCache.set(username, { at: now, perms });
        return perms;
    } catch (err) {
        // 포털이 멈춰 있어도 스튜디오가 같이 멈추면 안 된다 — 옛 답으로 버틴다.
        return cached ? cached.perms : null;
    }
}

function authMiddleware(options = {}) {
    const { adminOnly = false } = options;
    return async (req, res, next) => {
        const ext = path.extname(req.path);
        
        // 정적 리소스(CSS, JS, 이미지 등)는 인증 우회 (단, HTML이나 API는 보호)
        const isHtmlPage = req.path === '/' || req.path === '/index.html' || ext === '.html' || ext === '';
        const isApi = req.path.startsWith('/api/');
        
        if (!isHtmlPage && !isApi) {
            return next();
        }

        // favicon & logout은 검증을 우회
        if (req.path === '/favicon.ico' || req.path === '/logout') {
            return next();
        }

        const cookies = {};
        if (req.headers.cookie) {
            req.headers.cookie.split(';').forEach(c => {
                const parts = c.split('=');
                if (parts.length >= 2) {
                    cookies[parts.shift().trim()] = decodeURI(parts.join('='));
                }
            });
        }
        
        const token = cookies['auth_token'];
        const secretKey = process.env.SECRET_KEY || 'change-me-in-production';
        const payload = verifyAuthToken(token, secretKey);
        
        if (!payload) {
            if (isApi) {
                return res.status(401).json({ error: '인증이 필요합니다. 로그인이 필요합니다.' });
            }
            
            // 로그인 리다이렉트
            let portalUrl = process.env.PORTAL_URL || '';
            const reqHost = req.headers.host || '';
            
            if (!portalUrl) {
                if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
                    const hostIp = reqHost.split(':')[0];
                    portalUrl = `http://${hostIp}:5001`;
                } else {
                    portalUrl = 'https://onnamu.kr';
                }
            }
            
            const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
            const nextUrl = `${proto}://${reqHost}${req.originalUrl}`;
            
            return res.redirect(`${portalUrl}/login?next=${encodeURIComponent(nextUrl)}`);
        }
        
        // 지금 권한을 포털에 물어 덮어쓴다. 계정이 없어졌거나 잠겼으면 여기서 끝난다.
        const user = { ...payload };
        const perms = isMachineIdentity(payload.username)
            ? null
            : await fetchPermissions(payload.username, secretKey);
        if (perms) {
            if (!perms.exists || perms.locked) {
                if (isApi) {
                    return res.status(401).json({ error: '계정을 쓸 수 없습니다. 다시 로그인해 주세요.' });
                }
                return res.redirect(`${portalLoginBase(req)}/login`);
            }
            user.is_admin = !!perms.is_admin;
            user.adult_ok = !!perms.adult_ok;
            user.folders = perms.folders || [];
            user.can_upload = !!perms.can_upload;
            user.perm_version = perms.perm_version;
        } else if (user.adult_ok === undefined) {
            // 포털에 못 물었고 기억해 둔 답도 없다 — 모르면 열지 않는다.
            user.adult_ok = false;
        }

        if (adminOnly && !user.is_admin) {
            if (isApi) {
                return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
            }
            return res.status(403).send('⛔ Forbidden: 관리자 권한이 필요합니다.');
        }

        req.user = user;
        next();
    };
}

module.exports = { authMiddleware, verifyAuthToken, isMachineIdentity };
