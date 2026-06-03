const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Serve static frontend files from the current folder
app.use(express.static(path.join(__dirname)));

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

// Quick response to favicon requests to prevent browser infinite loading spinner
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`[Chronicle AI Studio] 서버 작동 중!`);
    console.log(`접속 주소: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
