const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Cookie parsing helper
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list;
}

// Token verification helper
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
        
        if (Date.now() / 1000 > payload.exp) {
            return null;
        }
        
        return payload;
    } catch (err) {
        return null;
    }
}

// Authentication Middleware
app.use((req, res, next) => {
    const ext = path.extname(req.path);
    
    // Pass verification for favicon & logout
    if (req.path === '/favicon.ico' || req.path === '/logout') {
        return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['auth_token'];
    const secretKey = process.env.SECRET_KEY || 'change-me-in-production';
    const payload = verifyAuthToken(token, secretKey);

    // 1. API request protection
    if (req.path.startsWith('/api/')) {
        if (req.path === '/api/user-info' && !payload) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!payload) {
            return res.status(401).json({ error: '인증되지 않은 사용자입니다. 로그인이 필요합니다.' });
        }
        req.user = payload;
        return next();
    }

    // 2. HTML page request protection
    if (req.path === '/' || req.path === '/index.html' || ext === '.html' || ext === '') {
        if (!payload) {
            const reqHost = req.headers.host || '';
            let redirectBase = process.env.GALLERY_URL || '';
            
            if (!redirectBase) {
                if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
                    const hostIp = reqHost.split(':')[0];
                    redirectBase = `http://${hostIp}:5002`;
                } else {
                    redirectBase = 'https://gallery.onnamu.kr';
                }
            }
            
            const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
            const nextUrl = `${proto}://${reqHost}${req.originalUrl}`;
            return res.redirect(`${redirectBase}/login?next=${encodeURIComponent(nextUrl)}`);
        }
        req.user = payload;
    }

    next();
});

// Serve static frontend files from the current folder
app.use(express.static(path.join(__dirname)));

// Logout Route
app.get('/logout', (req, res) => {
    const reqHost = req.headers.host || '';
    let cookieDomain = undefined;
    if (reqHost.includes('onnamu.kr')) {
        cookieDomain = '.onnamu.kr';
    }
    
    res.clearCookie('auth_token', { domain: cookieDomain });
    
    let redirectBase = process.env.GALLERY_URL || '';
    if (!redirectBase) {
        if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
            const hostIp = reqHost.split(':')[0];
            redirectBase = `http://${hostIp}:5002`;
        } else {
            redirectBase = 'https://gallery.onnamu.kr';
        }
    }
    
    res.redirect(`${redirectBase}/logout`);
});

// User Info Route
app.get('/api/user-info', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ 
        username: req.user.username,
        isAdmin: !!req.user.is_admin
    });
});

// Proxy endpoint to bypass browser CORS limits when calling Gemini API
app.post('/api/generate', async (req, res) => {
    const { apiKey, prompt, systemInstruction, model } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API Key가 누락되었습니다.' });
    }

    try {
        const selectedModel = model || 'gemini-3.5-flash';
        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.85
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE"
                }
            ]
        };

        // Node.js native fetch (supported on Node 18+)
        const response = await fetch(apiURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`구글 API 오류 (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        
        // Strict verification of candidates and content parts (Resolves: Cannot read properties of undefined (reading '0'))
        if (!data.candidates || data.candidates.length === 0 || 
            !data.candidates[0].content || 
            !data.candidates[0].content.parts || 
            data.candidates[0].content.parts.length === 0) {
            
            let rejectReason = "API가 적절한 답변을 생성하지 못했습니다. API 키가 유효한지 확인해 주세요.";
            if (data.candidates && data.candidates[0]) {
                const finishReason = data.candidates[0].finishReason;
                if (finishReason === 'SAFETY') {
                    rejectReason = "구글 컨텐츠 정책(검열)에 의해 답변이 차단되었습니다. 지나치게 위험하거나 노골적인 성적 묘사 등은 제외하고 지시해 주세요.";
                } else if (finishReason === 'RECITATION') {
                    rejectReason = "텍스트 저작권 보호(RECITATION) 필터링에 의해 답변이 차단되었습니다.";
                } else if (finishReason) {
                    rejectReason = `API 전송 중단 (사유: ${finishReason})`;
                }
            }
            throw new Error(rejectReason);
        }

        let jsonText = data.candidates[0].content.parts[0].text.trim();
        
        // Strip markdown code block markers if present (```json ... ```)
        if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        }
        
        try {
            // Parse and return back the structured story JSON object to the client
            res.json(JSON.parse(jsonText));
        } catch (parseError) {
            console.error("[JSON Parse Error Output]:", jsonText);
            throw new Error("AI가 규격화된 JSON 양식을 출력하지 못했습니다. 다시 시도해 주세요.");
        }
    } catch (error) {
        console.error("[Proxy Server Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST Endpoint to generate text embeddings using text-embedding-004
app.post('/api/embed', async (req, res) => {
    const { apiKey, text, model } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API Key가 누락되었습니다.' });
    }
    if (!text) {
        return res.status(400).json({ error: '임베딩할 텍스트가 누락되었습니다.' });
    }

    try {
        const selectedModel = model || 'text-embedding-004';
        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:embedContent?key=${apiKey}`;

        const requestBody = {
            model: `models/${selectedModel}`,
            content: {
                parts: [{ text: text }]
            }
        };

        const response = await fetch(apiURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`구글 임베딩 API 오류 (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        
        if (!data.embedding || !data.embedding.values) {
            throw new Error("API가 적절한 임베딩 벡터를 반환하지 못했습니다.");
        }

        res.json({ embedding: data.embedding.values });
    } catch (error) {
        console.error("[Embedding API Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST Endpoint to generate images using Imagen 3 model via Google AI Studio API
app.post('/api/generate-image', async (req, res) => {
    const { apiKey, prompt, model } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API Key가 누락되었습니다.' });
    }
    if (!prompt) {
        return res.status(400).json({ error: '생성할 이미지 프롬프트가 누락되었습니다.' });
    }

    try {
        const selectedModel = model || 'imagen-3.0-generate-002';
        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateImages?key=${apiKey}`;

        const requestBody = {
            prompt: prompt,
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
            personGeneration: 'ALLOW_ADULT'
        };

        const response = await fetch(apiURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`구글 이미지 API 오류 (HTTP ${response.status}): ${errText}`);
        }

        const data = await response.json();
        
        if (!data.generatedImages || data.generatedImages.length === 0) {
            throw new Error("이미지가 정상적으로 생성되지 않았습니다.");
        }

        const base64Image = data.generatedImages[0].image.imageBytes;
        res.json({ imageBytes: base64Image });
    } catch (error) {
        console.error("[Proxy Image Server Error]:", error);
        res.status(500).json({ error: error.message });
    }
});

// Quick response to favicon requests to prevent browser infinite loading spinner
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Fallback to index.html (HTML 요청 또는 확장자가 없는 페이지 경로에만 매칭)
app.get('*', (req, res) => {
    if (req.accepts('html') && !path.extname(req.path)) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.status(404).end();
    }
});

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`[Chronicle AI Studio] 서버 작동 중!`);
    console.log(`접속 주소: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
