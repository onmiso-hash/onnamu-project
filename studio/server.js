const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const store = require('./store.js');

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

// 대화를 숫자 다발(벡터)로 바꿔주는 통로 — 지난 대화 중 지금 주제와 닮은 것을 찾는 데 쓴다.
//
// 2026-01-14에 구글이 옛 모델(text-embedding-004)을 폐기했고, 그 뒤로 이 통로는 계속
// 실패만 했다. 실패가 로그 한 줄로 흘러가 **8개월 동안 아무도 몰랐다**(컨테이너 로그
// 실측: models/text-embedding-004 is not found ... 반복). 그래서 두 가지를 함께 고친다.
//   ① 후속 모델 gemini-embedding-001로 교체
//   ② 실패를 조용히 삼키지 않는다 — 화면에 "기억 검색 꺼짐"이 남도록 사유를 내려준다
const DEFAULT_EMBED_MODEL = 'gemini-embedding-001';
// 기본 차원은 3072이지만 768로 줄여 받는다. 저장량이 1/4이고, 이 서비스의 유사도 계산은
// 코사인 방식(app.js의 cosineSimilarity)이라 크기에 영향받지 않아 정규화가 따로 필요 없다.
const EMBED_DIMENSIONS = 768;

// 실제로 몇 차원이 오는지 눈으로 확인할 수 있게, 값이 바뀔 때만 한 줄 남긴다.
let lastEmbeddingSignature = '';

app.post('/api/embed', async (req, res) => {
    const { apiKey, text, model } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'API Key가 누락되었습니다.' });
    }
    if (!text) {
        return res.status(400).json({ error: '임베딩할 텍스트가 누락되었습니다.' });
    }

    const selectedModel = model || DEFAULT_EMBED_MODEL;
    try {
        const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:embedContent?key=${apiKey}`;

        const requestBody = {
            model: `models/${selectedModel}`,
            content: {
                parts: [{ text: text }]
            }
        };
        // 차원 줄이기는 gemini-embedding 계열만 받는다. 옛 모델에 넣으면 요청 자체가 튕긴다.
        if (selectedModel.startsWith('gemini-embedding')) {
            requestBody.outputDimensionality = EMBED_DIMENSIONS;
        }

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

        if (!data.embedding || !Array.isArray(data.embedding.values) || data.embedding.values.length === 0) {
            throw new Error("API가 적절한 임베딩 벡터를 반환하지 못했습니다.");
        }

        const values = data.embedding.values;
        const signature = `${selectedModel}/${values.length}`;
        if (signature !== lastEmbeddingSignature) {
            lastEmbeddingSignature = signature;
            console.log(`[임베딩] 모델=${selectedModel} 차원=${values.length}`);
        }

        // 차원을 함께 내려준다 — 화면이 "지금 몇 차원으로 도는지"를 알 수 있어야
        // 모델이 또 바뀌었을 때 조용히 지나가지 않는다.
        res.json({ embedding: values, model: selectedModel, dimensions: values.length });
    } catch (error) {
        console.error("[임베딩 실패]:", error);
        res.status(500).json({ error: error.message, model: selectedModel });
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

// ==========================================================================
// 저장소 통로 — 인물 설정과 대화가 오가는 유일한 길
// ==========================================================================
//
// 대화는 오직 /api/conversations 계열로만 오간다. /api/personas는 **인물 설정만**
// 다룬다 — 옛 savedSession(대화 뭉치)은 여기서 완전히 빠졌다.
// 지금까지의 결함은 전부 "화면이 전체 스냅샷을 보내고 서버가 무엇이 새것인지 되짚는"
// 구간에서 나왔다. 그래서 주인을 하나로 만든다: 화면은 "몇 번 턴을 붙여라"라고 지목만
// 하고, 서버는 시키는 대로만 한다. 되짚기·보정 코드는 통째로 사라졌다.

// store.js가 오류에 붙여 보낸 종류를 그대로 상태 코드로 옮긴다. 오류 문구를 글자로
// 대조하지 않는다 — 문구를 다듬는 순간 조용히 500으로 바뀌기 때문이다.
const STORE_ERROR_STATUS = { INVALID: 400, NOT_FOUND: 404, CONFLICT: 409 };

function sendStoreError(res, err, logLabel) {
    console.error(`[${logLabel}]:`, err);
    const status = STORE_ERROR_STATUS[err && err.code] || 500;
    if (status === 500) {
        // 내부 사정은 감추고 로그에만 남긴다
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
    res.status(status).json({ error: err.message });
}

// 로그인 확인. 통과하면 {username, isAdmin}, 아니면 401을 보내고 null을 돌려준다.
function requireUser(req, res) {
    if (!req.user || !req.user.username) {
        res.status(401).json({ error: '인증되지 않은 사용자입니다.' });
        return null;
    }
    return { username: req.user.username, isAdmin: !!req.user.is_admin };
}

// 일반 계정에 감춰야 하는 대화인지 본다. 두 갈래다.
//  - 19금 인물의 대화: 인물 자체가 안 보이므로 그 대화도 안 보여야 한다
//  - 수위가 19금인 대화: 인물은 평범해도 그 대화만 19금일 수 있다(옛 chatLevel 신호)
function isConversationHidden(username, meta, isAdmin) {
    if (isAdmin || !meta) return false;
    if (meta.chatLevel === 'adult-19') return true;
    if (meta.charId && store.isAdult19Character(store.getCharacter(username, meta.charId))) return true;
    return false;
}

// 대화 하나를 꺼내되, 그 계정이 봐서는 안 되는 것이면 없는 것처럼 404를 낸다.
// 감춤과 없음의 답을 똑같이 맞춰야 "있긴 있구나"가 새어나가지 않는다.
function loadVisibleConversation(username, convId, isAdmin, res) {
    const meta = store.getConversation(username, convId);
    if (!meta || isConversationHidden(username, meta, isAdmin)) {
        res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
        return null;
    }
    return meta;
}

// 일반 계정이 대화 수위를 19금으로 올리는 것은 막는다(옛 저장 거부와 같은 취지).
function blocksAdultLevel(res, patch, isAdmin) {
    if (!isAdmin && patch && patch.chatLevel === 'adult-19') {
        res.status(403).json({ error: '이 계정은 19금 대화를 저장할 수 없습니다.' });
        return true;
    }
    return false;
}

// --------------------------------------------------------------------------
// 인물 설정
// --------------------------------------------------------------------------

// GET: 인물 목록. 옛 화면과 같은 { 프리셋이름: {...} } 모양은 그대로 두되 대화는 빠졌다.
app.get('/api/personas', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const personas = {};
        store.listCharacters(u.username, { isAdmin: u.isAdmin }).forEach(c => {
            personas[c.presetName] = {
                id: c.id,
                charName: c.charName,
                relation: c.relation,
                desc: c.desc,
                level: c.level,
                userName: c.userName,
                imagePrompt: c.imagePrompt,
                characterImages: c.characterImages
            };
        });
        res.json(personas);
    } catch (error) {
        sendStoreError(res, error, 'Get Personas Error');
    }
});

// POST: 인물 목록 전체 교체. 이번 요청에 없는 인물은 지워진다(옛 통째 덮어쓰기와 같은 결과).
app.post('/api/personas', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const personasData = (req.body && typeof req.body === 'object') ? req.body : {};

        // 옛 시스템에서 딕셔너리 키(프리셋 이름)가 그 인물의 정체성이었다 — charName과
        // 따로 입력받아 독립적으로 유지됐다. 같은 키로 다시 오면 같은 id를 이어받아 같은
        // 파일을 덮게 한다. charName으로 짝지으면 이름만 바꿔 저장했을 때 별개 인물로 갈라진다.
        const existingByPresetName = {};
        store.listCharacters(u.username, { isAdmin: u.isAdmin })
            .forEach(c => { existingByPresetName[c.presetName] = c; });

        const characterDocs = Object.keys(personasData).map(name => {
            const preset = personasData[name] || {};
            const existing = existingByPresetName[name];
            const doc = {
                charName: preset.charName || name,
                presetName: name,
                relation: preset.relation || '',
                desc: preset.desc || '',
                level: preset.level || 'normal',
                userName: preset.userName || '',
                imagePrompt: preset.imagePrompt || '',
                characterImages: preset.characterImages || {}
            };
            const id = preset.id || (existing && existing.id);
            if (id) doc.id = id;
            return doc;
        });

        const saved = store.saveCharacters(u.username, characterDocs, { isAdmin: u.isAdmin });
        res.json({ success: true, count: saved.length });
    } catch (error) {
        sendStoreError(res, error, 'Save Personas Error');
    }
});

// --------------------------------------------------------------------------
// 대화 — 로그인한 본인 것만 다룬다
// --------------------------------------------------------------------------

// GET: 대화 목록(요약)
app.get('/api/conversations', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        let list = store.listConversations(u.username);
        if (!u.isAdmin) {
            const visibleCharIds = new Set(store.listCharacters(u.username, { isAdmin: false }).map(c => c.id));
            list = list.filter(c => c.chatLevel !== 'adult-19' && (!c.charId || visibleCharIds.has(c.charId)));
        }
        res.json(list);
    } catch (error) {
        sendStoreError(res, error, 'List Conversations Error');
    }
});

// POST: 새 대화. body: {mode:'story'|'chat', charId?, title?, chatLevel?, userName?}
app.post('/api/conversations', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const body = req.body || {};
        if (blocksAdultLevel(res, body, u.isAdmin)) return;
        res.json(store.createConversation(u.username, {
            mode: body.mode,
            charId: body.charId,
            title: body.title,
            chatLevel: body.chatLevel,
            userName: body.userName
        }));
    } catch (error) {
        sendStoreError(res, error, 'Create Conversation Error');
    }
});

// POST: 옛 데이터 1회 이사 전용. body: {importKey, mode, charId?, title?, turns[], vectors?, ...}
// 같은 importKey가 이미 있으면 409로 거부한다 — **덮어쓰기라는 동작 자체가 없어서**
// "두 번 눌렀더니 대화가 사라졌다" 류의 사고가 원천 차단된다. 이어쓰기는 turns 통로로만.
// (:id 경로들보다 먼저 등록해 'import'가 대화 id로 읽히지 않게 한다)
app.post('/api/conversations/import', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const body = req.body || {};
        if (blocksAdultLevel(res, body, u.isAdmin)) return;
        res.json(store.importConversation(u.username, {
            importKey: body.importKey,
            mode: body.mode,
            charId: body.charId,
            title: body.title,
            turns: body.turns,
            vectors: body.vectors,
            affinityValue: body.affinityValue,
            memoryList: body.memoryList,
            chatLevel: body.chatLevel,
            userName: body.userName
        }));
    } catch (error) {
        sendStoreError(res, error, 'Import Conversation Error');
    }
});

// GET: 대화 한 건(턴 배열 포함). ?vectors=1이면 검색용 벡터도 함께.
app.get('/api/conversations/:id', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const meta = loadVisibleConversation(u.username, req.params.id, u.isAdmin, res);
        if (!meta) return;
        const payload = { ...meta, turns: store.readTurns(u.username, req.params.id) };
        if (req.query.vectors === '1') {
            payload.vectors = store.readVectors(u.username, req.params.id);
        }
        res.json(payload);
    } catch (error) {
        sendStoreError(res, error, 'Get Conversation Error');
    }
});

// POST: 턴 하나 덧붙이기. body: {n, turn, vector?, meta?}
// 같은 n이 다시 와도 두 번 쌓이지 않는다(applied:false로 돌려준다) — 재전송·중복 클릭
// 대비. n이 건너뛰면 400으로 거부한다.
app.post('/api/conversations/:id/turns', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const body = req.body || {};
        const meta = loadVisibleConversation(u.username, req.params.id, u.isAdmin, res);
        if (!meta) return;
        if (blocksAdultLevel(res, body.meta, u.isAdmin)) return;
        if (body.turn === undefined || body.turn === null) {
            return res.status(400).json({ error: 'turn 값이 필요합니다.' });
        }
        // 벡터는 턴을 붙이기 **전에** 검사한다. 턴만 들어가고 벡터가 400으로 튕기면,
        // 다시 보내도 그 턴은 이미 있는 번호라 무시돼 벡터를 영영 못 붙인다.
        const hasVector = body.vector !== undefined && body.vector !== null;
        if (hasVector && (!Array.isArray(body.vector) || body.vector.length === 0)) {
            return res.status(400).json({ error: 'vector는 비어 있지 않은 숫자 배열이어야 합니다.' });
        }

        const result = store.appendTurn(u.username, req.params.id, body.n, body.turn, body.meta);
        if (result.applied && hasVector) {
            store.appendVector(u.username, req.params.id, body.n, body.vector);
        }
        res.json(result);
    } catch (error) {
        sendStoreError(res, error, 'Append Turn Error');
    }
});

// POST: 검색용 벡터만 뒤늦게 붙이기. body: {n, vector}
// 벡터는 AI에게 글을 받아 만드는 것이라 말보다 늦게 도착한다. 말이 저장되기를 기다렸다
// 함께 보내면 그동안 말이 어디에도 안 남으므로, 말은 먼저 저장하고 벡터는 이 길로 뒤따른다.
app.post('/api/conversations/:id/vectors', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const body = req.body || {};
        const meta = loadVisibleConversation(u.username, req.params.id, u.isAdmin, res);
        if (!meta) return;
        store.appendVector(u.username, req.params.id, body.n, body.vector);
        res.json({ success: true });
    } catch (error) {
        sendStoreError(res, error, 'Append Vector Error');
    }
});

// PATCH: 제목·호감도 등 바꾸기, 그리고 되돌리기/되돌리기 취소(visibleTurns).
// body: {title?, visibleTurns?, affinityValue?, memoryList?, chatLevel?, userName?}
app.patch('/api/conversations/:id', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const body = req.body || {};
        const meta = loadVisibleConversation(u.username, req.params.id, u.isAdmin, res);
        if (!meta) return;
        if (blocksAdultLevel(res, body, u.isAdmin)) return;

        let updated = meta;
        if (body.visibleTurns !== undefined) {
            updated = store.setVisibleTurns(u.username, req.params.id, body.visibleTurns);
        }
        const fields = {};
        ['title', 'affinityValue', 'memoryList', 'chatLevel', 'userName'].forEach(key => {
            if (Object.prototype.hasOwnProperty.call(body, key)) fields[key] = body[key];
        });
        if (Object.keys(fields).length > 0) {
            updated = store.updateConversation(u.username, req.params.id, fields);
        }
        res.json(updated);
    } catch (error) {
        sendStoreError(res, error, 'Update Conversation Error');
    }
});

// DELETE: 대화 삭제(폴더째)
app.delete('/api/conversations/:id', (req, res) => {
    const u = requireUser(req, res);
    if (!u) return;
    try {
        const meta = loadVisibleConversation(u.username, req.params.id, u.isAdmin, res);
        if (!meta) return;
        store.deleteConversation(u.username, req.params.id);
        res.json({ success: true });
    } catch (error) {
        sendStoreError(res, error, 'Delete Conversation Error');
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
