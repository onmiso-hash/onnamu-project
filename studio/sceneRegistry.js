/**
 * 장면(배경) 목록 — 대화 무대의 배경은 이 표 하나만 읽는다.
 *
 * 화면(app.js)의 장면 고르기·무대 배경과 저장(store.js)의 sceneId 검사가 같은 표를 쓴다.
 * 두 벌로 복사하지 말 것.
 *
 * - 장면은 인물 그림이 아니라 배경판이다. 감정 초상과 따로 두고 화면에서 겹친다
 *   (감정 × 장면 전조합 그림을 만들지 않는다).
 * - image가 비어 있으면 gradient로 그린다. 그림을 붙이려면 파일을 공개 목록에 올리고 주소를 적는다.
 * - 'studio'는 은은한 단색 배경이다. 초상은 모든 장면에서 같은 3:4 세운 그림이라
 *   장면을 바꿔도 초상 모양·크기가 흔들리지 않는다(2026-09-23 사용자 결정).
 *
 * - adult: true 장면은 19금 전용이다. canAdult이고 **그 대화가 19금**일 때만 고를 수 있다
 *   (화면 목록·서버 저장 검사가 모두 sceneAllowed 하나로 판정한다).
 * - 대화에 올린 배경 사진(meta.scenes[sceneId].url)이 있으면 그것이 이긴다
 *   → 없으면 image → 없으면 gradient. 사진 주소 모양 검사도 여기 한 곳(isSceneUploadUrl).
 *
 * 일반 스크립트로 싣는다. 브라우저 window.SceneRegistry, 노드 require('./sceneRegistry').
 */
(function (root) {
    const DEFAULT_SCENE = 'studio';

    const SCENES = [
        { id: 'studio',       label: '스튜디오',     icon: '🎙️', image: '',
          gradient: 'linear-gradient(160deg, #1e293b 0%, #334155 55%, #475569 100%)' },
        { id: 'cafe',         label: '카페',         icon: '☕', image: '',
          gradient: 'linear-gradient(160deg, #6b4423 0%, #a47148 45%, #e0b98a 100%)' },
        { id: 'office',       label: '사무실',       icon: '💼', image: '',
          gradient: 'linear-gradient(160deg, #1f2d3d 0%, #3d5a73 50%, #9fb3c8 100%)' },
        { id: 'classroom',    label: '교실',         icon: '🏫', image: '',
          gradient: 'linear-gradient(160deg, #2f4f3a 0%, #5b8a63 50%, #d8c99b 100%)' },
        { id: 'bedroom',      label: '침실',         icon: '🛏️', image: '',
          gradient: 'linear-gradient(160deg, #2a1f3d 0%, #5c3b6e 50%, #c98fa6 100%)' },
        { id: 'night-street', label: '밤거리',       icon: '🌃', image: '',
          gradient: 'linear-gradient(160deg, #0b1026 0%, #26215c 50%, #d9467a 100%)' },
        { id: 'park-sunset',  label: '공원 석양',    icon: '🌇', image: '',
          gradient: 'linear-gradient(170deg, #3b2a5c 0%, #c2566b 45%, #f4a259 80%, #f7d488 100%)' },
        { id: 'rainy-window', label: '빗소리 창가',  icon: '🌧️', image: '',
          gradient: 'linear-gradient(160deg, #1c2733 0%, #3e5566 50%, #8aa1b1 100%)' },
        // ── 19금 전용(adult) ──
        { id: 'bedroom-dim',  label: '조명 낮춘 침실', icon: '🕯️', image: '', adult: true,
          gradient: 'linear-gradient(160deg, #120a14 0%, #3a1c2e 55%, #8a4b3c 100%)' },
        { id: 'bath-mirror',  label: '욕실·거울',     icon: '🪞', image: '', adult: true,
          gradient: 'linear-gradient(160deg, #1b2a30 0%, #4d6b73 50%, #c9d8d6 100%)' },
        { id: 'hotel-window', label: '호텔 창가',     icon: '🏙️', image: '', adult: true,
          gradient: 'linear-gradient(170deg, #0a0f24 0%, #2b2d5a 50%, #c77d4f 100%)' },
        { id: 'hotel-bed',    label: '호텔 침실',     icon: '🏨', image: '', adult: true,
          gradient: 'linear-gradient(160deg, #1a1016 0%, #4e2a36 50%, #b9897a 100%)' },
        { id: 'car-night',    label: '자동차 안',     icon: '🚗', image: '', adult: true,
          gradient: 'linear-gradient(160deg, #05070d 0%, #1c2438 55%, #b0474f 100%)' },
        { id: 'pantry',       label: '탕비실',        icon: '☕', image: '', adult: true,
          gradient: 'linear-gradient(160deg, #22262b 0%, #4f5761 50%, #b8b2a3 100%)' }
    ];

    const byId = {};
    SCENES.forEach(s => { byId[s.id] = s; });

    function isKnownScene(id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(byId, id);
    }

    // 모르는 값·빈 값은 기본 장면으로 본다(옛 대화에는 sceneId가 없다).
    function resolveScene(id) {
        return byId[isKnownScene(id) ? id : DEFAULT_SCENE];
    }

    function isAdultScene(id) {
        return isKnownScene(id) && !!byId[id].adult;
    }

    // 이 장면을 고를 수 있는가. 19금 전용은 canAdult이고 그 대화가 19금일 때만.
    function sceneAllowed(id, opts) {
        if (!isKnownScene(id)) return false;
        if (!byId[id].adult) return true;
        return !!(opts && opts.canAdult && opts.chatLevel === 'adult-19');
    }

    // 고를 수 있는 장면 목록(사이드바 🎬). 순서는 표 순서 그대로.
    function listScenes(opts) {
        return SCENES.filter(s => sceneAllowed(s.id, opts));
    }

    // 대화에 올린 배경 사진 주소는 이 모양만 받는다: 서버가 지은 이름 + 그 장면 id + 실제 형식 확장자.
    // 원본 파일 이름·다른 폴더·다른 장면 이름의 파일은 들어오지 않는다.
    function isSceneUploadUrl(sceneId, url) {
        if (!isKnownScene(sceneId) || typeof url !== 'string') return false;
        const m = /^\/data\/uploads\/uploaded_\d+_([a-z0-9-]+)\.(png|jpg|webp)$/.exec(url);
        return !!m && m[1] === sceneId;
    }

    // 올린 파일 이름(uploaded_<시각>_<id>.<확장자>)에서 19금 장면 사진인지 가린다(파일 내주기 검사용).
    function isAdultSceneFileName(name) {
        const m = /^uploaded_\d+_([a-z0-9-]+)\.(png|jpg|webp)$/.exec(String(name || ''));
        return !!m && isAdultScene(m[1]);
    }

    // 무대 배경으로 칠할 CSS background 값. 대화에 올린 사진(uploadUrl) → 표의 그림 → 그라데이션.
    function sceneBackground(id, uploadUrl) {
        const s = resolveScene(id);
        const img = uploadUrl || s.image;
        if (img) return `url("${img}") center / cover no-repeat`;
        return s.gradient || '';
    }

    const api = {
        DEFAULT_SCENE, SCENES, isKnownScene, isAdultScene, sceneAllowed, listScenes,
        isSceneUploadUrl, isAdultSceneFileName, resolveScene, sceneBackground
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.SceneRegistry = api;
    }
})(this);
