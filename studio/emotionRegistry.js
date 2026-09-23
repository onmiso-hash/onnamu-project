/**
 * 감정 목록 — 스튜디오에서 감정을 아는 곳은 모두 이 표 하나만 읽는다.
 *
 * 화면(app.js)의 업로드 칸·AI 응답 규칙·스키마 enum·그림 고르기와
 * 서버(server.js)의 업로드 검사가 같은 표를 쓴다. 두 벌로 복사하지 말 것
 * (한쪽만 고쳐지는 것이 이 프로젝트의 반복 결함이다).
 *
 * - 기존 5개(normal·happy·sad·angry·blush)의 id는 저장된 인물 JSON의 키다. 이름을 바꾸지 말 것.
 * - fallback: 그 감정 그림이 없을 때 다음으로 찾아볼 감정. 끝은 항상 normal이다.
 * - adultOnly: canAdult이고 19금일 때만 목록에 나온다(isAdmin으로 가리지 말 것).
 *
 * 일반 스크립트로 싣는다(app.js가 모듈이 아니다). 브라우저에서는 window.EmotionRegistry,
 * 노드에서는 require('./emotionRegistry')로 같은 것을 받는다.
 */
(function (root) {
    const EMOTIONS = [
        // 기존 5 — id 절대 바꾸지 말 것
        { id: 'normal',    label: '평온',     prompt: '' },
        { id: 'happy',     label: '기쁨',     fallback: 'normal', prompt: 'happy smiling expression, laughing, cheerful, bright eyes' },
        { id: 'sad',       label: '슬픔',     fallback: 'normal', prompt: 'sad crying expression, tearful, looking down, melancholy' },
        { id: 'angry',     label: '화남',     fallback: 'normal', prompt: 'angry frowning expression, glaring eyes, annoyed, upset' },
        { id: 'blush',     label: '부끄러움', fallback: 'normal', prompt: 'blushing embarrassed expression, shy smile, looking away, cute' },

        // 신규 7
        { id: 'surprised', label: '놀람',   fallback: 'normal', prompt: 'surprised expression, widened eyes, slightly open mouth' },
        { id: 'love',      label: '설렘',   fallback: 'happy',  prompt: 'lovestruck soft gaze, warm smile, fond expression' },
        { id: 'teasing',   label: '장난',   fallback: 'happy',  prompt: 'playful teasing smirk, mischievous eyes' },
        { id: 'tired',     label: '지침',   fallback: 'normal', prompt: 'tired sleepy expression, half-lidded eyes, weary' },
        { id: 'thinking',  label: '생각',   fallback: 'normal', prompt: 'thoughtful expression, looking aside, slight frown of concentration' },
        { id: 'fear',      label: '두려움', fallback: 'sad',    prompt: 'fearful uneasy expression, tense eyes' },
        { id: 'crying',    label: '울음',   fallback: 'sad',    prompt: 'crying expression, tears on cheeks, trembling lips' },

        // 19금 전용
        { id: 'lust',      label: '욕정',   fallback: 'blush',  adultOnly: true,
          prompt: 'seductive flushed expression, half-lidded eyes, parted lips' }
    ];

    const byId = {};
    EMOTIONS.forEach(e => { byId[e.id] = e; });

    function isKnownEmotion(id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(byId, id);
    }

    // adult가 거짓이면 adultOnly 감정을 뺀다.
    function listEmotions(opts) {
        const adult = !!(opts && opts.adult);
        return EMOTIONS.filter(e => adult || !e.adultOnly);
    }

    function emotionLabel(id) {
        return isKnownEmotion(id) ? byId[id].label : id;
    }

    function emotionPromptSuffix(id) {
        return isKnownEmotion(id) ? byId[id].prompt : '';
    }

    // 감정 그림 주소를 고른다: 그 감정 → fallback 사슬 → normal. 하나도 없으면 ''.
    // 모르는 id는 normal로 본다.
    function resolveEmotionImage(images, id) {
        if (!images) return '';
        let cur = isKnownEmotion(id) ? id : 'normal';
        const seen = {};
        while (cur && !seen[cur]) {
            seen[cur] = true;
            if (images[cur]) return images[cur];
            cur = byId[cur].fallback;
        }
        return images.normal || '';
    }

    const api = { EMOTIONS, isKnownEmotion, listEmotions, emotionLabel, emotionPromptSuffix, resolveEmotionImage };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.EmotionRegistry = api;
    }
})(this);
