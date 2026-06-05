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

function authMiddleware(options = {}) {
    const { adminOnly = false } = options;
    return (req, res, next) => {
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
        
        if (adminOnly && !payload.is_admin) {
            if (isApi) {
                return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
            }
            return res.status(403).send('⛔ Forbidden: 관리자 권한이 필요합니다.');
        }
        
        req.user = payload;
        next();
    };
}

module.exports = { authMiddleware, verifyAuthToken };
