const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Increase request size limit for large base64 uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Serve uploaded images statically
app.use('/data/uploads', express.static(UPLOAD_DIR));

const { authMiddleware } = require('./authHelper');

// Authentication Middleware
app.use(authMiddleware({ adminOnly: true }));

// Disable caching for HTML and JS files to ensure immediate updates
app.use((req, res, next) => {
    const ext = path.extname(req.path);
    if (ext === '.html' || ext === '.js' || req.path === '/' || req.path === '') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
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
    
    let portalUrl = process.env.PORTAL_URL || '';
    if (!portalUrl) {
        if (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) {
            const hostIp = reqHost.split(':')[0];
            portalUrl = `http://${hostIp}:5001`;
        } else {
            portalUrl = 'https://onnamu.kr';
        }
    }
    
    res.redirect(`${portalUrl}/logout`);
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
    let { apiKey, prompt, systemInstruction, model, responseSchema } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API Key가 누락되었습니다.' });
    }

    // [백엔드 강제 오버라이드] 프론트엔드 캐시에 구애받지 않고 무조건 줄바꿈을 강제하기 위한 시스템 프롬프트 주입
    if (systemInstruction) {
        systemInstruction += "\n\n[System Override]: JSON 구조 내의 본문(dialogue 또는 story) 필드를 작성할 때, 가독성을 위해 문단을 나눌 지점에 실제 줄바꿈 문자 대신 특수 기호 [BR]을 반드시 2번 이상 적극적으로 삽입하여 문단을 확실히 나누어 주세요. (예: 안녕.[BR][BR]만나서 반가워.) 한 줄로만 뭉쳐서 대답하는 것을 엄격히 금지합니다. 표를 그릴 때도 각 행의 끝에 [BR]을 넣으세요.";
    }

    try {
        const selectedModel = model || 'gemini-3.5-flash';
        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        const generationConfig = {
            responseMimeType: "application/json",
            temperature: 0.85
        };
        if (responseSchema) {
            generationConfig.responseSchema = responseSchema;
        }

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
            generationConfig: generationConfig,
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
            let parsedJson = JSON.parse(jsonText);
            if (parsedJson.dialogue) {
                // 백엔드 단에서 [BR] 특수 기호를 완벽하게 파싱된 줄바꿈(\n\n)으로 변환
                parsedJson.dialogue = parsedJson.dialogue.replace(/\[BR\]/g, '\n\n');
            }
            if (parsedJson.story) {
                parsedJson.story = parsedJson.story.replace(/\[BR\]/g, '\n\n');
            }
            res.json(parsedJson);
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

    const modelsToTry = model ? [model] : ['imagen-3.0-generate-002', 'imagen-3.0-generate-001'];
    let lastError = null;

    for (const currentModel of modelsToTry) {
        try {
            const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:predict?key=${apiKey}`;

            const requestBody = {
                instances: [
                    {
                        prompt: prompt
                    }
                ],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: '1:1',
                    outputMimeType: 'image/jpeg',
                    personGeneration: 'ALLOW_ADULT'
                }
            };

            const response = await fetch(apiURL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`모델 ${currentModel} 실패 (HTTP ${response.status}): ${errText}`);
            }

            const data = await response.json();
            
            if (!data.predictions || data.predictions.length === 0) {
                throw new Error("이미지가 정상적으로 생성되지 않았습니다.");
            }

            const base64Image = data.predictions[0].bytesBase64Encoded;
            if (!base64Image) {
                throw new Error("이미지 데이터가 포함되어 있지 않습니다.");
            }
            
            // 성공 시 즉시 반환
            return res.json({ imageBytes: base64Image });
        } catch (error) {
            console.warn(`[Imagen API Try Failed for ${currentModel}]:`, error.message);
            lastError = error;
        }
    }

    // 모든 모델 시도 실패 시 최종 에러 반환
    console.error("[Proxy Image Server Error - All Models Failed]:", lastError);
    res.status(500).json({ error: lastError.message });
});

// POST API to upload image (converts Base64 data to physical file)
app.post('/api/upload-image', (req, res) => {
    const { emotion, imageBytes } = req.body;
    if (!imageBytes) {
        return res.status(400).json({ error: '이미지 데이터가 없습니다.' });
    }

    try {
        // Remove base64 data URL prefix
        const base64Data = imageBytes.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // Generate filename
        const filename = `uploaded_${Date.now()}_${emotion}.png`;
        const filePath = path.join(UPLOAD_DIR, filename);

        // Write file to disk
        fs.writeFileSync(filePath, buffer);

        // Return client relative URL path
        const fileUrl = `/data/uploads/${filename}`;
        res.json({ success: true, fileUrl });
    } catch (error) {
        console.error("[Upload Image Error]:", error);
        res.status(500).json({ error: '이미지 저장에 실패했습니다.' });
    }
});

// GET API to fetch user's personas from server
app.get('/api/personas', (req, res) => {
    if (!req.user || !req.user.username) {
        return res.status(401).json({ error: '인증되지 않은 사용자입니다.' });
    }
    const username = req.user.username;
    const userPersonaFile = path.join(__dirname, 'data', `personas_${username}.json`);
    
    try {
        if (fs.existsSync(userPersonaFile)) {
            let data = fs.readFileSync(userPersonaFile, 'utf8');
            // Remove UTF-8 BOM if present
            if (data.startsWith('\ufeff')) {
                data = data.slice(1);
            }
            let personas = JSON.parse(data);
            
            // 일반 계정(family 등)인 경우 19금 프리셋 및 19금 세션은 응답에서 제외
            if (!req.user.is_admin && personas && typeof personas === 'object') {
                Object.keys(personas).forEach(name => {
                    const preset = personas[name];
                    const isAdultPreset = preset && (preset.level === 'adult-19' || name.includes('19금'));
                    const isAdultSession = preset && preset.savedSession && preset.savedSession.chatLevel === 'adult-19';
                    if (isAdultPreset || isAdultSession) {
                        delete personas[name];
                    }
                });
            }
            
            return res.json(personas);
        }
        res.json({}); // 파일이 없으면 빈 프리셋 반환
    } catch (error) {
        console.error("[Get Personas Error]:", error);
        res.status(500).json({ error: '페르소나 데이터를 불러오는데 실패했습니다.' });
    }
});

// POST API to save user's personas to server
app.post('/api/personas', (req, res) => {
    if (!req.user || !req.user.username) {
        return res.status(401).json({ error: '인증되지 않은 사용자입니다.' });
    }
    const username = req.user.username;
    const userPersonaFile = path.join(__dirname, 'data', `personas_${username}.json`);
    
    try {
        let personasData = req.body;
        
        // 일반 계정(family 등)인 경우 19금 프리셋 및 19금 세션은 저장하기 전에 차단
        if (!req.user.is_admin && personasData && typeof personasData === 'object') {
            personasData = { ...personasData }; // 복사본 생성
            Object.keys(personasData).forEach(name => {
                const preset = personasData[name];
                const isAdultPreset = preset && (preset.level === 'adult-19' || name.includes('19금'));
                const isAdultSession = preset && preset.savedSession && preset.savedSession.chatLevel === 'adult-19';
                if (isAdultPreset || isAdultSession) {
                    delete personasData[name];
                }
            });
        }

        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // UTF-8 BOM 포함하여 파일 쓰기 (한글 깨짐 방지)
        const jsonString = JSON.stringify(personasData, null, 2);
        fs.writeFileSync(userPersonaFile, '\ufeff' + jsonString, 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error("[Save Personas Error]:", error);
        res.status(500).json({ error: '페르소나 데이터를 저장하는데 실패했습니다.' });
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
